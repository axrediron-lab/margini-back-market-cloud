import assert from 'node:assert/strict';

const baseUrl = process.env.MARGINI_TEST_URL ?? 'http://127.0.0.1:4173';
const content = [
  'invoice_key,value_date,sku,order_id,designation,amount,currency',
  'sales,2026-09-20,TEST-SKU,BM99900001,Test sintetico,100.00,EUR',
  'sales_fees,2026-09-20,,BM99900001,Commissione test,-10.00,EUR'
].join('\n');

async function post(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  assert.equal(response.ok, true, `${path}: ${payload.error ?? response.status}`);
  return payload;
}

async function preview() {
  const result = await post('/api/imports/preview', { sourceName: 'synthetic-invoice.csv', content });
  assert.equal(result.source, 'invoice');
  assert.equal(result.rowCount, 2);
  assert.equal(result.validCount, 2);
  assert.equal(result.errorCount, 0);
  assert.equal(result.canConfirm, true);
  return result;
}

const firstPreview = await preview();
const firstConfirm = await post('/api/imports/confirm', {
  previewId: firstPreview.previewId,
  contentSha256: firstPreview.contentSha256
});
assert.equal(firstConfirm.inserted, true);
assert.match(firstConfirm.batchId, /^[0-9a-f-]{36}$/);

const duplicatePreview = await preview();
const duplicateConfirm = await post('/api/imports/confirm', {
  previewId: duplicatePreview.previewId,
  contentSha256: duplicatePreview.contentSha256
});
assert.equal(duplicateConfirm.inserted, false);
assert.equal(duplicateConfirm.batchId, firstConfirm.batchId);

console.log('Import locale verificato: 2 righe sintetiche, conferma atomica e duplicato idempotente.');
