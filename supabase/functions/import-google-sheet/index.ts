import { createHash } from 'node:crypto';
import { previewCsv } from '../../../packages/domain/src/imports.mjs';

const MAX_BYTES = 15 * 1024 * 1024;
const MAX_ROWS = 20000;
const baseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const appOrigin = Deno.env.get('APP_ORIGIN') ?? '';

function reply(body: unknown, status = 200, origin = '') {
  return new Response(JSON.stringify(body), { status, headers: {
    'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
    'x-content-type-options': 'nosniff', ...(origin ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {})
  } });
}

function b64url(value: string | Uint8Array) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let base64 = '';
  for (const byte of bytes) base64 += String.fromCharCode(byte);
  return btoa(base64).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function googleToken() {
  const secret = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
  if (!secret) throw new Error('GOOGLE_NOT_CONFIGURED');
  const { client_email, private_key } = JSON.parse(secret);
  if (!client_email || !private_key) throw new Error('GOOGLE_NOT_CONFIGURED');
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: client_email, scope: 'https://www.googleapis.com/auth/spreadsheets.readonly', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const bytes = Uint8Array.from(atob(private_key.replace(/-----[^-]+-----|\s/g, '')), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', bytes, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`)));
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claims}.${b64url(signature)}` }) });
  if (!response.ok) throw new Error('GOOGLE_AUTH_FAILED');
  return String((await response.json()).access_token);
}

function csvCell(value: unknown) {
  const cell = String(value ?? '');
  return /[;"\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

async function readSheet(id: string, range: string) {
  const allowed = JSON.parse(Deno.env.get('GOOGLE_SHEET_ALLOWLIST') ?? '[]');
  if (!Array.isArray(allowed) || !allowed.includes(id)) throw new Error('SHEET_NOT_ALLOWED');
  if (!/^[A-Za-z0-9_\- ]{1,100}!?[A-Z]{1,3}[1-9]?:[A-Z]{1,3}[1-9]?$/.test(range)) throw new Error('INVALID_SHEET_RANGE');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`;
  const response = await fetch(url, { headers: { authorization: `Bearer ${await googleToken()}` } });
  if (!response.ok) throw new Error(`GOOGLE_SHEET_READ_FAILED_${response.status}`);
  const values = (await response.json()).values;
  if (!Array.isArray(values) || values.length < 2) throw new Error('EMPTY_SHEET');
  if (values.length > MAX_ROWS + 1) throw new Error('TOO_MANY_ROWS');
  return values.map((row: unknown[]) => row.map(csvCell).join(';')).join('\r\n');
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable((value as Record<string, unknown>)[key])]));
  return value;
}

function rowsForDatabase(preview: ReturnType<typeof previewCsv>) {
  return preview.rows.map((row) => {
    const data = { rowNumber: row.rowNumber, rawData: row.rawData, normalizedData: row.normalized, errors: row.errors, warnings: row.warnings };
    return { ...data, rowHash: createHash('sha256').update(JSON.stringify(stable(data))).digest('hex') };
  });
}

async function authorizedOperator(token: string) {
  const headers = { apikey: anonKey, authorization: `Bearer ${token}` };
  const userResponse = await fetch(`${baseUrl}/auth/v1/user`, { headers });
  if (!userResponse.ok) return false;
  const user = await userResponse.json();
  const roleResponse = await fetch(`${baseUrl}/rest/v1/app_users?select=role,enabled&user_id=eq.${encodeURIComponent(user.id)}`, { headers });
  if (!roleResponse.ok) return false;
  const [record] = await roleResponse.json();
  return record?.enabled && ['operator', 'admin'].includes(record.role) ? user.id : null;
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin') ?? '';
  const cors = appOrigin && origin === appOrigin ? origin : '';
  if (origin && !cors) return reply({ error: 'ORIGIN_NOT_ALLOWED' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': cors, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'authorization, apikey, content-type', vary: 'Origin' } });
  if (request.method !== 'POST') return reply({ error: 'METHOD_NOT_ALLOWED' }, 405, cors);
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return reply({ error: 'AUTH_REQUIRED' }, 401, cors);
  const actorId = await authorizedOperator(token);
  if (!actorId) return reply({ error: 'OPERATOR_REQUIRED' }, 403, cors);
  try {
    if (Number(request.headers.get('content-length') || 0) > MAX_BYTES) throw new Error('FILE_TOO_LARGE');
    const body = await request.json();
    const sourceName = String(body.sourceName ?? '').trim().slice(0, 255);
    const content = body.kind === 'sheet' ? await readSheet(String(body.spreadsheetId ?? ''), String(body.range ?? '')) : String(body.content ?? '');
    if (!sourceName || !content) throw new Error('EMPTY_FILE');
    if (new TextEncoder().encode(content).length > MAX_BYTES) throw new Error('FILE_TOO_LARGE');
    const preview = previewCsv({ content, sourceName });
    if (body.source && body.source !== preview.source) throw new Error('SOURCE_MISMATCH');
    if (preview.rowCount > MAX_ROWS) throw new Error('TOO_MANY_ROWS');
    if (body.action === 'preview') return reply({
      previewId: preview.contentSha256, sourceName, source: preview.source, contentSha256: preview.contentSha256,
      rowCount: preview.rowCount, validCount: preview.validCount, errorCount: preview.errorCount,
      warningCount: preview.warningCount, ignoredCount: preview.ignoredCount, coverage: preview.coverage,
      currencies: preview.currencies, classifications: preview.classifications,
      issues: preview.rows.filter((row) => row.errors.length || row.warnings.length).slice(0, 20).map(({ rowNumber, errors, warnings }) => ({ rowNumber, errors, warnings })),
      canConfirm: preview.errorCount === 0
    }, 200, cors);
    if (body.action !== 'confirm') throw new Error('INVALID_ACTION');
    if (preview.errorCount) throw new Error('PREVIEW_HAS_ERRORS');
    if (body.previewId !== preview.contentSha256 || body.previewHash !== preview.contentSha256) throw new Error('PREVIEW_HASH_MISMATCH');
    const summary = { rowCount: preview.rowCount, validCount: preview.validCount, errorCount: preview.errorCount, warningCount: preview.warningCount, ignoredCount: preview.ignoredCount, coverage: preview.coverage, currencies: preview.currencies, classifications: preview.classifications };
    const result = await fetch(`${baseUrl}/rest/v1/rpc/confirm_import_batch_online`, { method: 'POST', headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' }, body: JSON.stringify({ p_source: preview.source, p_source_name: sourceName, p_content_sha256: preview.contentSha256, p_summary: summary, p_rows: rowsForDatabase(preview), p_actor: actorId }) });
    if (!result.ok) throw new Error(`DATABASE_CONFIRM_FAILED_${result.status}`);
    const [saved] = await result.json();
    return reply({ batchId: saved.batch_id, inserted: saved.inserted }, 200, cors);
  } catch (error) {
    const code = String(error instanceof Error ? error.message : 'REQUEST_FAILED').split(':')[0];
    return reply({ error: code }, /^(EMPTY_|INVALID_|UNKNOWN_|MISSING_|SOURCE_|SHEET_NOT_ALLOWED|PREVIEW_|TOO_MANY_ROWS|FILE_TOO_LARGE)/.test(code) ? 400 : 503, cors);
  }
});
