import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregatePerformance,
  canCreateEconomicMovement,
  companyMargin,
  convertToEur,
  coverage,
  salesMargin,
  selectProductCost
} from '../src/economics.mjs';

test('solo Invoice crea movimenti economici', () => {
  assert.equal(canCreateEconomicMovement('invoice'), true);
  for (const source of ['orders', 'ready_sales', 'purchases', 'ready_returns']) {
    assert.equal(canCreateEconomicMovement(source), false);
  }
});

test('gennaio-giugno usa solo P.Acq. Ready', () => {
  const result = selectProductCost({
    soldOn: '2026-06-30',
    purchases: [{ id: 'p1', type: 'purchase', availableOn: '2026-06-01', quantity: 2, unitCostEur: 100 }],
    readyPurchasePrice: 120,
    readyFifoCost: 110
  });
  assert.deepEqual(result, { status: 'final', unitCostEur: 120, source: 'READY_PURCHASE_PRICE' });
});

test('gennaio-giugno sospende senza P.Acq. anche se FIFO esiste', () => {
  const result = selectProductCost({ soldOn: '2026-02-10', readyPurchasePrice: 0, readyFifoCost: 80 });
  assert.equal(result.status, 'suspended');
  assert.equal(result.code, 'MISSING_READY_PURCHASE_PRICE');
});

test('dal primo luglio usa media ponderata solo fino alla vendita', () => {
  const result = selectProductCost({
    soldOn: '2026-07-10',
    purchases: [
      { id: 'a', type: 'purchase', availableOn: '2026-07-01', quantity: 2, unitCostEur: 100 },
      { id: 'b', type: 'purchase', availableOn: '2026-07-09', quantity: 1, unitCostEur: 130 },
      { id: 'future', type: 'purchase', availableOn: '2026-07-11', quantity: 99, unitCostEur: 1 }
    ],
    readyPurchasePrice: 140,
    readyFifoCost: 150
  });
  assert.equal(result.source, 'DATED_WEIGHTED_AVERAGE');
  assert.equal(result.unitCostEur, 110);
  assert.deepEqual(result.sourceIds, ['a', 'b']);
});

test('dal primo luglio applica P.Acq. poi FIFO e infine sospende', () => {
  assert.equal(selectProductCost({ soldOn: '2026-07-01', readyPurchasePrice: 90, readyFifoCost: 80 }).source, 'READY_PURCHASE_PRICE');
  assert.equal(selectProductCost({ soldOn: '2026-08-01', readyPurchasePrice: 0, readyFifoCost: 80 }).source, 'READY_FIFO');
  assert.equal(selectProductCost({ soldOn: '2026-08-01', readyPurchasePrice: 0, readyFifoCost: 0 }).status, 'suspended');
});

test('SEK usa sempre il forfait 0,09 e altre valute richiedono una regola', () => {
  assert.deepEqual(convertToEur(100, 'SEK'), { status: 'final', amountEur: 9, rate: 0.09, source: 'SEK_FORFAIT' });
  assert.equal(convertToEur(100, 'USD').status, 'suspended');
  assert.equal(convertToEur(100, 'USD', { id: 'fx1', eurPerUnit: 0.85 }).amountEur, 85);
});

test('un componente mancante sospende il singolo margine senza usare zero', () => {
  const result = salesMargin({ revenueEur: 200, initialInvoiceFeesEur: -20, productCostEur: 100, shippingEur: undefined, investorFeeEur: 2, storfundFeeEur: 2.4 });
  assert.equal(result.status, 'suspended');
  assert.deepEqual(result.missing, ['shippingEur']);
});

test('margine aziendale esclude flussi finanziari e segnala componenti non classificati', () => {
  const result = companyMargin([
    { id: 'sale', classification: 'sales_margin', amountEur: 50 },
    { id: 'refund', classification: 'refund', amountEur: -10 },
    { id: 'payout', classification: 'payout', amountEur: 500, financialFlow: true },
    { id: 'unknown', classification: null, amountEur: 3 }
  ]);
  assert.equal(result.amountEur, 40);
  assert.equal(result.status, 'provisional');
  assert.deepEqual(result.includedIds, ['sale', 'refund']);
  assert.deepEqual(result.suspendedIds, ['unknown']);
});

test('copertura separa coperti e sospesi', () => {
  const result = coverage([{ status: 'final' }, { status: 'provisional' }, { status: 'suspended' }]);
  assert.deepEqual({ total: result.total, covered: result.covered, suspended: result.suspended }, { total: 3, covered: 2, suspended: 1 });
  assert.ok(Math.abs(result.percent - (200 / 3)) < 1e-10);
});

test('andamento giornaliero e mensile aggregano gli stessi ordini coperti', () => {
  const rows = [
    { orderId: 'A', date: '2026-09-01', revenueEur: 100, marginEur: 20, status: 'final' },
    { orderId: 'B', date: '2026-09-02', revenueEur: 200, marginEur: 30, status: 'provisional' },
    { orderId: 'C', date: '2026-09-02', revenueEur: 500, marginEur: null, status: 'suspended' }
  ];
  assert.deepEqual(aggregatePerformance(rows, 'day'), [
    { period: '2026-09-01', revenueEur: 100, marginEur: 20, orderCount: 1 },
    { period: '2026-09-02', revenueEur: 200, marginEur: 30, orderCount: 1 }
  ]);
  assert.deepEqual(aggregatePerformance(rows, 'month'), [
    { period: '2026-09', revenueEur: 300, marginEur: 50, orderCount: 2 }
  ]);
});
