import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyInvoiceKey,
  detectSource,
  normalizeCarrier,
  normalizeOrderId,
  parseCsv,
  previewCsv
} from '../src/imports.mjs';

test('parser CSV gestisce BOM, delimitatore e campi tra virgolette', () => {
  const parsed = parseCsv('\uFEFFData;Descrizione;Prezzo\r\n01/09/2026;"Telefono; nero";123,45\r\n');
  assert.deepEqual(parsed.headers, ['Data', 'Descrizione', 'Prezzo']);
  assert.equal(parsed.rows[0].values.Descrizione, 'Telefono; nero');
  assert.equal(parsed.rows[0].rowNumber, 2);
});

test('riconoscimento fonte usa le intestazioni reali, non il nome file', () => {
  assert.equal(detectSource(['invoice_key', 'value_date', 'amount', 'currency']), 'invoice');
  assert.equal(detectSource(['order_id', 'orderline_id', 'date_creation']), 'orders');
  assert.equal(detectSource(['N.ord.web', 'P.Acq.']), 'ready_sales');
  assert.equal(detectSource(['Intestatario', 'Prezzo', 'Quant.']), 'purchases');
  assert.equal(detectSource(['Doc. origine', 'Pagamento', 'Prezzo', 'Quant.']), 'ready_returns');
});

test('normalizza soltanto identificativi ordine completi e corrieri noti', () => {
  assert.equal(normalizeOrderId('BM85574523'), '85574523');
  assert.equal(normalizeOrderId('85574523.0'), '85574523');
  assert.equal(normalizeOrderId('ordine 85574523'), null);
  assert.equal(normalizeCarrier('DHL-RFB'), 'DHL');
  assert.equal(normalizeCarrier('GLS - IT'), 'GLS');
});

test('classifica causali Invoice e sospende quelle sconosciute', () => {
  assert.deepEqual(classifyInvoiceKey('sales').economicCategory, 'revenue');
  assert.equal(classifyInvoiceKey('payment_fees').salesMargin, true);
  assert.equal(classifyInvoiceKey('refunds').companyMargin, true);
  assert.equal(classifyInvoiceKey('deferred_payout_retained').financialFlow, true);
  assert.equal(classifyInvoiceKey('nuova_causale').anomaly, 'UNCLASSIFIED_MOVEMENT');
});

test('anteprima Invoice converte SEK e arrotonda ogni movimento', () => {
  const content = [
    'invoice_key,value_date,sku,order_id,designation,amount,currency',
    'sales,2026-09-02,SKU1,BM123,Prodotto,10.055,SEK',
    'nuova_causale,2026-09-03,,,Test,-1.00,SEK'
  ].join('\n');
  const preview = previewCsv({ content, sourceName: 'nome-irrilevante.csv' });
  assert.equal(preview.source, 'invoice');
  assert.equal(preview.rows[0].normalized.amountEur, 0.9);
  assert.equal(preview.rows[0].normalized.orderId, '123');
  assert.equal(preview.warningCount, 1);
  assert.equal(preview.classifications.unclassified, 1);
});

test('Costi ignora righe descrittive e mantiene solo acquisti validi', () => {
  const content = [
    'Data;Intestatario;Cod.;Descrizione;Quant.;Prezzo',
    '03/08/2026;Fornitore;100;Prodotto;2;120,50',
    '03/08/2026;Fornitore;;Rif. Ord.f.;;',
    ';;;;6572;280,3'
  ].join('\n');
  const preview = previewCsv({ content });
  assert.equal(preview.validCount, 1);
  assert.equal(preview.ignoredCount, 2);
  assert.equal(preview.rows[0].normalized.unitCostEur, 120.5);
});

test('export ordini elimina dati personali dal payload raw', () => {
  const content = [
    'order_id;orderline_id;date_creation;quantity;customer_email;shipping_first_name;shipping_phone;sku;currency',
    '123;456;2026-08-20;1;cliente@example.com;Mario;123456789;SKU1;EUR'
  ].join('\n');
  const preview = previewCsv({ content });
  assert.equal(preview.validCount, 1);
  assert.equal('customer_email' in preview.rows[0].rawData, false);
  assert.equal('shipping_first_name' in preview.rows[0].rawData, false);
  assert.equal('shipping_phone' in preview.rows[0].rawData, false);
});

test('Ready Resi conserva il contesto del blocco senza importarlo come prodotto', () => {
  const content = [
    'N.Doc.;Data;Cod.;Descrizione;Quant.;Prezzo;S1;Causale;Agente;Doc. origine;Pagamento',
    '900;24/08/2026;;Ordine BM123;;;;Articoli guasti;;;BackMarket',
    '900;24/08/2026;77;Telefono;1;100;0;Articoli guasti;Tecnico;Ric. 10;BackMarket'
  ].join('\n');
  const preview = previewCsv({ content });
  assert.equal(preview.validCount, 1);
  assert.equal(preview.ignoredCount, 1);
  assert.equal(preview.rows[1].normalized.orderId, '123');
  assert.equal(preview.rows[1].normalized.contextRows.length, 1);
});
