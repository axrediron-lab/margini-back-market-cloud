import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { previewCsv } from '../packages/domain/src/imports.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const MAX_BODY_BYTES = 15 * 1024 * 1024;
const PREVIEW_TTL_MS = 30 * 60 * 1000;
const previews = new Map();
let localCredentials;

function ensureLocalUrl(value) {
  const url = new URL(value);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('REMOTE_SUPABASE_BLOCKED');
  return url.origin;
}

function json(response, status, payload) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('FILE_TOO_LARGE');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('INVALID_JSON');
  }
}

function publicPreview(preview, previewId) {
  const issues = preview.rows
    .filter((row) => row.errors.length || row.warnings.length)
    .slice(0, 20)
    .map(({ rowNumber, errors, warnings }) => ({ rowNumber, errors, warnings }));
  return {
    previewId,
    sourceName: preview.sourceName,
    source: preview.source,
    contentSha256: preview.contentSha256,
    rowCount: preview.rowCount,
    validCount: preview.validCount,
    errorCount: preview.errorCount,
    warningCount: preview.warningCount,
    ignoredCount: preview.ignoredCount,
    coverage: preview.coverage,
    currencies: preview.currencies,
    classifications: preview.classifications,
    issues,
    canConfirm: preview.errorCount === 0
  };
}

function prunePreviews() {
  const threshold = Date.now() - PREVIEW_TTL_MS;
  for (const [id, entry] of previews) if (entry.createdAt < threshold) previews.delete(id);
}

function parseEnvOutput(output) {
  return Object.fromEntries(String(output).split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([A-Z0-9_]+)=(?:"([\s\S]*)"|(.*))$/);
    return match ? [[match[1], match[2] ?? match[3] ?? '']] : [];
  }));
}

export function getLocalCredentials() {
  if (localCredentials) return localCredentials;
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    localCredentials = { url: ensureLocalUrl(process.env.SUPABASE_URL), key: process.env.SUPABASE_SERVICE_ROLE_KEY };
    return localCredentials;
  }
  const cli = join(projectRoot, 'node_modules', 'supabase', 'dist', 'supabase.js');
  const result = spawnSync(process.execPath, [cli, 'status', '-o', 'env'], {
    cwd: projectRoot, encoding: 'utf8', windowsHide: true
  });
  if (result.status !== 0) throw new Error('LOCAL_SUPABASE_UNAVAILABLE');
  const values = parseEnvOutput(result.stdout);
  const url = values.API_URL ?? values.SUPABASE_URL;
  const key = values.SERVICE_ROLE_KEY ?? values.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('LOCAL_SUPABASE_CREDENTIALS_UNAVAILABLE');
  localCredentials = { url: ensureLocalUrl(url), key };
  return localCredentials;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

export function preparePersistentRows(preview) {
  return preview.rows.map((row) => {
    const rowPayload = {
      rowNumber: row.rowNumber,
      rawData: row.rawData,
      normalizedData: row.normalized,
      errors: row.errors,
      warnings: row.warnings
    };
    return {
      ...rowPayload,
      rowHash: createHash('sha256').update(JSON.stringify(stableValue(rowPayload))).digest('hex')
    };
  });
}

async function persistPreview(preview) {
  const { url, key } = getLocalCredentials();
  const summary = {
    rowCount: preview.rowCount,
    validCount: preview.validCount,
    errorCount: preview.errorCount,
    warningCount: preview.warningCount,
    ignoredCount: preview.ignoredCount,
    coverage: preview.coverage,
    currencies: preview.currencies,
    classifications: preview.classifications
  };
  const result = await fetch(`${url}/rest/v1/rpc/confirm_import_batch`, {
    method: 'POST',
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      p_source: preview.source,
      p_source_name: preview.sourceName,
      p_content_sha256: preview.contentSha256,
      p_summary: summary,
      p_rows: preparePersistentRows(preview)
    })
  });
  if (!result.ok) throw new Error(`LOCAL_DATABASE_ERROR:${result.status}`);
  const [saved] = await result.json();
  return { batchId: saved.batch_id, inserted: saved.inserted };
}

export async function handleImportApi(request, response, pathname) {
  if (request.method === 'GET' && pathname === '/api/dashboard') {
    try {
      const { loadLocalDashboard } = await import('./local-calculation.mjs');
      json(response, 200, { dashboard: await loadLocalDashboard() });
    } catch (error) {
      json(response, 503, { error: String(error.message || 'DASHBOARD_FAILED').split(':')[0] });
    }
    return true;
  }

  if (request.method === 'GET' && pathname === '/api/operations') {
    try {
      const { loadLocalOperations } = await import('./local-calculation.mjs');
      json(response, 200, { operations: await loadLocalOperations() });
    } catch (error) {
      json(response, 503, { error: String(error.message || 'OPERATIONS_FAILED').split(':')[0] });
    }
    return true;
  }

  const orderMatch = pathname.match(/^\/api\/orders\/(\d+)$/);
  if (request.method === 'GET' && orderMatch) {
    try {
      const { loadOrderDetail } = await import('./local-calculation.mjs');
      const detail = await loadOrderDetail(orderMatch[1]);
      json(response, detail ? 200 : 404, detail ? { detail } : { error: 'ORDER_NOT_FOUND' });
    } catch (error) {
      const code = String(error.message || 'ORDER_DETAIL_FAILED').split(':')[0];
      json(response, code === 'INVALID_ORDER_ID' ? 400 : 503, { error: code });
    }
    return true;
  }

  if (request.method === 'POST' && pathname === '/api/recalculate') {
    try {
      const { calculateLocalSnapshot } = await import('./local-calculation.mjs');
      json(response, 200, await calculateLocalSnapshot({ persist: true }));
    } catch (error) {
      json(response, 503, { error: String(error.message || 'RECALCULATION_FAILED').split(':')[0] });
    }
    return true;
  }

  if (request.method === 'POST' && pathname === '/api/imports/preview') {
    try {
      prunePreviews();
      const body = await readJson(request);
      const sourceName = String(body.sourceName ?? '').trim().slice(0, 255);
      const content = typeof body.content === 'string' ? body.content : '';
      if (!sourceName || !content) throw new Error('EMPTY_FILE');
      const preview = previewCsv({ sourceName, content });
      const previewId = randomUUID();
      previews.set(previewId, { preview, createdAt: Date.now() });
      json(response, 200, publicPreview(preview, previewId));
    } catch (error) {
      json(response, 400, { error: String(error.message || 'PREVIEW_FAILED').split(':')[0] });
    }
    return true;
  }

  if (request.method === 'POST' && pathname === '/api/imports/confirm') {
    try {
      prunePreviews();
      const body = await readJson(request);
      const entry = previews.get(String(body.previewId ?? ''));
      if (!entry) throw new Error('PREVIEW_EXPIRED');
      if (body.contentSha256 !== entry.preview.contentSha256) throw new Error('PREVIEW_HASH_MISMATCH');
      if (entry.preview.errorCount) throw new Error('PREVIEW_HAS_ERRORS');
      const saved = await persistPreview(entry.preview);
      previews.delete(String(body.previewId));
      json(response, 200, saved);
    } catch (error) {
      const code = String(error.message || 'CONFIRM_FAILED').split(':')[0];
      json(response, code.startsWith('LOCAL_') ? 503 : 400, { error: code });
    }
    return true;
  }
  return false;
}
