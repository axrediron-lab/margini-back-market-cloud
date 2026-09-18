import { REQUIRED_HEADERS, type ImportRequest } from './contracts.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' }
});

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  let body: ImportRequest;
  try { body = await request.json(); } catch { return json({ error: 'INVALID_JSON' }, 400); }

  if (!body.source || !REQUIRED_HEADERS[body.source]) return json({ error: 'INVALID_SOURCE' }, 400);
  if (!body.spreadsheetId || !body.range) return json({ error: 'MISSING_SHEET_REFERENCE' }, 400);

  if (body.action === 'preview') {
    // Fase 1: contratto pronto, lettore Google non attivato senza credenziali/allowlist autorizzate.
    return json({
      status: 'configuration_required',
      message: 'Configurare lato server credenziali Google read-only e allowlist del foglio.',
      requiredHeaders: REQUIRED_HEADERS[body.source],
      nextAction: 'Ripetere anteprima; la conferma sarà disponibile solo dopo una validazione senza errori.'
    }, 501);
  }

  if (body.action === 'confirm') {
    if (!body.batchId || !body.previewHash) return json({ error: 'MISSING_CONFIRMATION_TOKEN' }, 400);
    return json({
      status: 'not_enabled',
      message: 'Conferma non attiva nella fase di scaffolding: nessun dato è stato scritto.'
    }, 501);
  }

  return json({ error: 'INVALID_ACTION' }, 400);
});
