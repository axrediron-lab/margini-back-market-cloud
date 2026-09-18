const JULY_START = '2026-07-01';

export const ECONOMIC_CATEGORIES = Object.freeze([
  'revenue', 'product_cost', 'shipping', 'marketplace_fee', 'investor_fee',
  'storfund_fee', 'refund', 'recovery', 'backship', 'epr', 'subscription',
  'returned_product_value', 'other'
]);

function positive(value) {
  return Number.isFinite(value) && value > 0;
}

export function canCreateEconomicMovement(source) {
  return source === 'invoice';
}

export function convertToEur(amount, currency, rule) {
  if (!Number.isFinite(amount)) return { status: 'suspended', code: 'INVALID_AMOUNT' };
  if (currency === 'EUR') return { status: 'final', amountEur: amount, rate: 1, source: 'EUR' };
  if (currency === 'SEK') return { status: 'final', amountEur: amount * 0.09, rate: 0.09, source: 'SEK_FORFAIT' };
  if (!rule || !positive(rule.eurPerUnit)) return { status: 'suspended', code: 'MISSING_FX_RULE' };
  return { status: 'final', amountEur: amount * rule.eurPerUnit, rate: rule.eurPerUnit, source: rule.id };
}

export function weightedAverageAt(entries, soldOn) {
  const eligible = entries.filter((entry) =>
    entry.type === 'purchase' &&
    entry.availableOn <= soldOn &&
    positive(entry.quantity) &&
    positive(entry.unitCostEur)
  );
  if (!eligible.length) return null;
  const quantity = eligible.reduce((sum, entry) => sum + entry.quantity, 0);
  const value = eligible.reduce((sum, entry) => sum + entry.quantity * entry.unitCostEur, 0);
  return { unitCostEur: value / quantity, sourceIds: eligible.map((entry) => entry.id) };
}

export function selectProductCost({ soldOn, purchases = [], readyPurchasePrice, readyFifoCost }) {
  if (!soldOn) return { status: 'suspended', code: 'MISSING_SALE_DATE' };

  if (soldOn < JULY_START) {
    return positive(readyPurchasePrice)
      ? { status: 'final', unitCostEur: readyPurchasePrice, source: 'READY_PURCHASE_PRICE' }
      : { status: 'suspended', code: 'MISSING_READY_PURCHASE_PRICE' };
  }

  const average = weightedAverageAt(purchases, soldOn);
  if (average) return { status: 'final', unitCostEur: average.unitCostEur, source: 'DATED_WEIGHTED_AVERAGE', sourceIds: average.sourceIds };
  if (positive(readyPurchasePrice)) return { status: 'final', unitCostEur: readyPurchasePrice, source: 'READY_PURCHASE_PRICE' };
  if (positive(readyFifoCost)) return { status: 'final', unitCostEur: readyFifoCost, source: 'READY_FIFO' };
  return { status: 'suspended', code: 'MISSING_PRODUCT_COST' };
}

export function salesMargin(input) {
  const required = ['revenueEur', 'initialInvoiceFeesEur', 'productCostEur', 'shippingEur', 'investorFeeEur', 'storfundFeeEur'];
  const missing = required.filter((key) => !Number.isFinite(input[key]));
  if (missing.length) return { status: 'suspended', missing, marginEur: null };
  const marginEur = input.revenueEur + input.initialInvoiceFeesEur
    - input.productCostEur - input.shippingEur - input.investorFeeEur - input.storfundFeeEur;
  return { status: input.provisional ? 'provisional' : 'final', marginEur };
}

export function companyMargin(components) {
  const included = [];
  const suspended = [];
  for (const component of components) {
    if (component.financialFlow || ['payout', 'transfer', 'deferred'].includes(component.classification)) continue;
    if (!component.classification || !Number.isFinite(component.amountEur)) {
      suspended.push(component.id);
      continue;
    }
    included.push(component);
  }
  return {
    status: suspended.length ? 'provisional' : 'final',
    amountEur: included.reduce((sum, component) => sum + component.amountEur, 0),
    includedIds: included.map((component) => component.id),
    suspendedIds: suspended
  };
}

export function coverage(items) {
  const total = items.length;
  const covered = items.filter((item) => item.status === 'final' || item.status === 'provisional').length;
  const suspended = items.filter((item) => item.status === 'suspended').length;
  return { total, covered, suspended, percent: total ? (covered / total) * 100 : 0 };
}

export function aggregatePerformance(rows, granularity = 'day') {
  const buckets = new Map();
  for (const row of rows) {
    if (!row.date || !['final', 'provisional'].includes(row.status)) continue;
    const key = granularity === 'month' ? row.date.slice(0, 7) : row.date.slice(0, 10);
    const current = buckets.get(key) ?? { period: key, revenueEur: 0, marginEur: 0, orders: new Set() };
    if (Number.isFinite(row.revenueEur)) current.revenueEur += row.revenueEur;
    if (Number.isFinite(row.marginEur)) current.marginEur += row.marginEur;
    if (row.orderId) current.orders.add(row.orderId);
    buckets.set(key, current);
  }
  return [...buckets.values()].sort((a, b) => a.period.localeCompare(b.period)).map((bucket) => ({
    period: bucket.period,
    revenueEur: bucket.revenueEur,
    marginEur: bucket.marginEur,
    orderCount: bucket.orders.size
  }));
}
