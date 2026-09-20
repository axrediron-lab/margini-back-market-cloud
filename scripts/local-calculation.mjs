import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  calculateOrderCharges,
  firstPositiveSaleDate,
  roundMoney,
  salesMargin,
  selectProductCost
} from '../packages/domain/src/economics.mjs';
import { getLocalCredentials } from './local-import-api.mjs';

const PAGE_SIZE = 1000;

async function request(path, options = {}) {
  const { url, key } = getLocalCredentials();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      ...(options.headers ?? {})
    }
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LOCAL_DATABASE_ERROR:${response.status}:${body.slice(0, 300)}`);
  }
  return response.status === 204 ? null : response.json();
}

async function fetchAll(table, select, query = '') {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await request(`${table}?select=${encodeURIComponent(select)}${query ? `&${query}` : ''}`, {
      headers: { range: `${offset}-${offset + PAGE_SIZE - 1}` }
    });
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

export async function loadLocalDashboard() {
  const runs = await request('calculation_runs?select=id,created_at,period_start,period_end,coverage,engine_version&status=eq.complete&order=created_at.desc&limit=1');
  if (!runs.length) return null;
  const run = runs[0];
  const [rows, orders, lines, returns, links, anomalies, parameters] = await Promise.all([
    fetchAll('margin_results', 'order_id,result_date,component,economic_category,amount_eur,status', `run_id=eq.${run.id}&result_type=eq.sales`),
    fetchAll('orders', 'id,marketplace_order_id'),
    fetchAll('order_lines', 'order_id,carrier,line_origin'),
    fetchAll('returns', 'id'),
    fetchAll('return_links', 'return_id,status'),
    fetchAll('anomalies', 'code,severity,resolved_at'),
    fetchAll('parameters', 'key,valid_from,valid_to,value,unit,note')
  ]);
  const marketplaceIds = new Map(orders.map((order) => [order.id, order.marketplace_order_id]));
  const carriersByOrder = new Map();
  for (const line of lines) {
    if (line.line_origin !== 'READY' || !line.carrier) continue;
    const carriers = carriersByOrder.get(line.order_id) ?? new Set();
    carriers.add(line.carrier.trim().toUpperCase());
    carriersByOrder.set(line.order_id, carriers);
  }
  const orderMap = new Map();
  for (const row of rows) {
    if (!row.order_id) continue;
    const item = orderMap.get(row.order_id) ?? {
      id: row.order_id, marketplaceOrderId: marketplaceIds.get(row.order_id), date: row.result_date,
      carrier: [...(carriersByOrder.get(row.order_id) ?? [])].join(' + ') || null, status: row.status
    };
    item[row.component] = number(row.amount_eur);
    if (row.status === 'suspended') item.status = 'suspended';
    orderMap.set(row.order_id, item);
  }
  const orderResults = [...orderMap.values()].filter((order) => Object.hasOwn(order, 'margin'));
  const covered = orderResults.filter((order) => order.status !== 'suspended');
  const buckets = new Map();
  for (const order of covered) {
    const day = buckets.get(order.date) ?? { date: order.date, revenueEur: 0, marginEur: 0, orders: 0 };
    day.revenueEur += order.revenue ?? 0;
    day.marginEur += order.margin ?? 0;
    day.orders += 1;
    buckets.set(order.date, day);
  }
  const daily = [...buckets.values()].sort((a, b) => a.date.localeCompare(b.date)).map((day) => ({
    ...day, revenueEur: roundMoney(day.revenueEur), marginEur: roundMoney(day.marginEur)
  }));
  const monthMap = new Map();
  for (const day of daily) {
    const month = day.date.slice(0, 7);
    const item = monthMap.get(month) ?? { month, revenueEur: 0, marginEur: 0, orders: 0 };
    item.revenueEur += day.revenueEur;
    item.marginEur += day.marginEur;
    item.orders += day.orders;
    monthMap.set(month, item);
  }
  const monthly = [...monthMap.values()].map((item) => ({
    ...item, revenueEur: roundMoney(item.revenueEur), marginEur: roundMoney(item.marginEur)
  }));
  const sumComponent = (component) => roundMoney(covered.reduce((sum, order) => sum + (order[component] ?? 0), 0));
  const openAnomalies = anomalies.filter((anomaly) => !anomaly.resolved_at);
  return {
    run: { id: run.id, createdAt: run.created_at, periodStart: run.period_start, periodEnd: run.period_end, engineVersion: run.engine_version },
    summary: {
      ...run.coverage,
      productCostEur: -sumComponent('product_cost'),
      shippingEur: -sumComponent('shipping'),
      marketplaceFeesEur: -sumComponent('marketplace_fee'),
      investorFeesEur: -sumComponent('investor_fee'),
      storfundFeesEur: -sumComponent('storfund_fee'),
      returns: returns.length,
      linkedReturns: links.filter((link) => link.status === 'linked').length,
      openAnomalies: openAnomalies.length
    },
    daily,
    monthly,
    latestOrders: orderResults.sort((a, b) => b.date.localeCompare(a.date) || String(b.marketplaceOrderId).localeCompare(String(a.marketplaceOrderId))),
    anomalyCounts: Object.fromEntries(openAnomalies.reduce((map, anomaly) => map.set(anomaly.code, (map.get(anomaly.code) ?? 0) + 1), new Map())),
    parameters
  };
}

const costSourceLabels = {
  DATED_WEIGHTED_AVERAGE: 'Acquisti',
  READY_PURCHASE_PRICE: 'P.Acq.',
  READY_FIFO: 'FIFO'
};

async function provenanceFor(sourceRowIds) {
  const ids = [...new Set(sourceRowIds.filter((id) => id !== null && id !== undefined))];
  if (!ids.length) return new Map();
  const wanted = new Set(ids.map(String));
  const rows = ids.length > 500
    ? (await fetchAll('import_rows', 'id,batch_id,row_number')).filter((row) => wanted.has(String(row.id)))
    : await fetchAll('import_rows', 'id,batch_id,row_number', `id=in.(${ids.join(',')})`);
  const batchIds = [...new Set(rows.map((row) => row.batch_id))];
  const batches = batchIds.length
    ? await fetchAll('import_batches', 'id,source,source_name', `id=in.(${batchIds.join(',')})`)
    : [];
  const batchById = new Map(batches.map((batch) => [batch.id, batch]));
  return new Map(rows.map((row) => {
    const batch = batchById.get(row.batch_id);
    return [String(row.id), {
      source: batch?.source ?? null,
      sourceName: batch?.source_name ?? null,
      rowNumber: row.row_number
    }];
  }));
}

export async function loadOrderDetail(marketplaceOrderId) {
  const orderId = String(marketplaceOrderId ?? '').trim();
  if (!/^\d+$/.test(orderId)) throw new Error('INVALID_ORDER_ID');
  const [order] = await request(`orders?select=id,marketplace_order_id,sold_at,currency,provisional&marketplace_order_id=eq.${orderId}&limit=1`);
  if (!order) return null;
  const [run] = await request('calculation_runs?select=id,created_at,engine_version&status=eq.complete&order=created_at.desc&limit=1');
  if (!run) return null;
  const [results, lines, movements] = await Promise.all([
    fetchAll('margin_results', 'component,economic_category,amount_eur,status,source_refs,details', `run_id=eq.${run.id}&result_type=eq.sales&order_id=eq.${order.id}`),
    fetchAll('order_lines', 'id,source_row_id,product_code,sku,description,quantity,unit_price,ready_purchase_price,ready_fifo_cost,carrier,line_origin,document_type,document_number,document_date', `order_id=eq.${order.id}&order=line_origin.asc`),
    fetchAll('invoice_movements', 'id,source_row_id,movement_type,value_date,amount,currency,amount_eur,economic_category,financial_flow,designation,sku', `order_id=eq.${order.id}&order=value_date.asc`)
  ]);
  const marginResult = results.find((row) => row.component === 'margin');
  const costSelections = marginResult?.details?.costSources ?? [];
  const selectedCostIds = [...new Set(costSelections.flatMap((selection) => selection.sourceIds ?? []))];
  const selectedCosts = selectedCostIds.length
    ? await fetchAll('cost_entries', 'id,source_row_id,product_code,available_on,quantity,unit_cost_eur', `id=in.(${selectedCostIds.join(',')})`)
    : [];
  const sourceRowIds = [
    ...lines.map((line) => line.source_row_id),
    ...movements.map((movement) => movement.source_row_id),
    ...selectedCosts.map((cost) => cost.source_row_id)
  ];
  const provenance = await provenanceFor(sourceRowIds);
  const selectedCostsById = new Map(selectedCosts.map((cost) => [cost.id, cost]));
  const selectionByLine = new Map(costSelections.map((selection) => [selection.orderLineId, selection]));
  const withProvenance = (row) => ({ ...row, provenance: provenance.get(String(row.source_row_id)) ?? null });
  return {
    run: { id: run.id, createdAt: run.created_at, engineVersion: run.engine_version },
    order: {
      marketplaceOrderId: order.marketplace_order_id,
      soldAt: order.sold_at,
      currency: order.currency,
      provisional: order.provisional,
      status: marginResult?.status ?? null,
      carrier: [...new Set(lines.filter((line) => line.line_origin === 'READY' && line.carrier).map((line) => line.carrier.trim().toUpperCase()))].join(' + ') || null
    },
    components: results.map(({ component, economic_category: economicCategory, amount_eur: amountEur, status }) => ({ component, economicCategory, amountEur, status })),
    lines: lines.map((line) => {
      const selection = selectionByLine.get(line.id);
      const sources = (selection?.sourceIds ?? []).map((id) => selectedCostsById.get(id)).filter(Boolean).map(withProvenance);
      const weightedQuantity = sources.reduce((sum, source) => sum + number(source.quantity), 0);
      const weightedValue = sources.reduce((sum, source) => sum + number(source.quantity) * number(source.unit_cost_eur), 0);
      const unitCostEur = selection?.source === 'READY_PURCHASE_PRICE' ? number(line.ready_purchase_price)
        : selection?.source === 'READY_FIFO' ? number(line.ready_fifo_cost)
          : weightedQuantity ? roundMoney(weightedValue / weightedQuantity) : null;
      return {
        ...withProvenance(line),
        costSelection: selection ? {
          source: selection.source,
          sourceLabel: costSourceLabels[selection.source] ?? selection.source ?? 'Non disponibile',
          code: selection.code ?? null,
          unitCostEur,
          sources
        } : null
      };
    }),
    movements: movements.map(withProvenance)
  };
}

export async function loadLocalOperations() {
  const [costs, returns, links, anomalies, orders] = await Promise.all([
    fetchAll('cost_entries', 'id,source_row_id,product_code,sku,cost_type,available_on,quantity,unit_cost_eur'),
    fetchAll('returns', 'id,source_row_id,document_number,document_date,product_code,sku,quantity,unit_price,currency,marketplace_order_id,reason,context_source_row_ids'),
    fetchAll('return_links', 'return_id,status,checks,reason'),
    fetchAll('anomalies', 'id,severity,entity_type,entity_id,code,message,details,resolved_at,created_at'),
    fetchAll('orders', 'id,marketplace_order_id')
  ]);
  const provenance = await provenanceFor([
    ...costs.map((row) => row.source_row_id),
    ...returns.map((row) => row.source_row_id)
  ]);
  const linkByReturn = new Map(links.map((link) => [link.return_id, link]));
  const returnById = new Map(returns.map((row) => [row.id, row]));
  const marketplaceByOrder = new Map(orders.map((order) => [order.id, order.marketplace_order_id]));
  const source = (row) => provenance.get(String(row.source_row_id)) ?? null;
  return {
    costs: costs.map((row) => ({
      id: row.id,
      productCode: row.product_code || row.sku,
      costType: row.cost_type,
      availableOn: row.available_on,
      quantity: number(row.quantity),
      unitCostEur: number(row.unit_cost_eur),
      provenance: source(row)
    })).sort((a, b) => b.availableOn.localeCompare(a.availableOn) || String(a.productCode).localeCompare(String(b.productCode))),
    returns: returns.map((row) => {
      const link = linkByReturn.get(row.id);
      return {
        id: row.id,
        documentNumber: row.document_number,
        documentDate: row.document_date,
        productCode: row.product_code || row.sku,
        quantity: number(row.quantity),
        unitPrice: number(row.unit_price),
        currency: row.currency,
        marketplaceOrderId: row.marketplace_order_id,
        reason: row.reason,
        contextRows: row.context_source_row_ids?.length ?? 0,
        linkStatus: link?.status ?? 'unmatched',
        linkReason: link?.reason ?? null,
        provenance: source(row)
      };
    }).sort((a, b) => b.documentDate.localeCompare(a.documentDate) || String(b.documentNumber).localeCompare(String(a.documentNumber))),
    anomalies: anomalies.filter((row) => !row.resolved_at).map((row) => {
      const returnRow = row.entity_type === 'return' ? returnById.get(row.entity_id) : null;
      return {
        id: row.id,
        severity: row.severity,
        entityType: row.entity_type,
        reference: returnRow?.marketplace_order_id || marketplaceByOrder.get(row.entity_id) || returnRow?.document_number || row.entity_id,
        productCode: returnRow?.product_code || returnRow?.sku || null,
        code: row.code,
        message: row.message,
        createdAt: row.created_at,
        provenance: returnRow ? source(returnRow) : null
      };
    }).sort((a, b) => a.severity.localeCompare(b.severity) || a.code.localeCompare(b.code))
  };
}

async function rpc(name, payload = {}) {
  return request(`rpc/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

const number = (value) => value === null || value === undefined ? null : Number(value);
const pushToMap = (map, key, value) => map.set(key, [...(map.get(key) ?? []), value]);

function resultRow({ resultType, resultDate, orderId = null, component, economicCategory = null, amountEur = null, status, sourceRefs = [], details = {} }) {
  return { resultType, resultDate, orderId, component, economicCategory, amountEur, status, sourceRefs, details };
}

export async function calculateLocalSnapshot({ persist = true } = {}) {
  await rpc('materialize_imports');
  const [orders, lines, movements, costs, parameters, batches] = await Promise.all([
    fetchAll('orders', 'id,marketplace_order_id,sold_at,provisional'),
    fetchAll('order_lines', 'id,order_id,source_row_id,product_code,quantity,ready_purchase_price,ready_fifo_cost,carrier,line_origin'),
    fetchAll('invoice_movements', 'id,source_row_id,order_id,movement_type,value_date,amount,amount_eur,economic_category,financial_flow,provisional,include_in_sales_margin,include_in_company_margin'),
    fetchAll('cost_entries', 'id,source_row_id,product_code,cost_type,available_on,quantity,unit_cost_eur'),
    fetchAll('parameters', 'key,scope,valid_from,valid_to,value,unit,note'),
    fetchAll('import_batches', 'id,is_active,status')
  ]);

  const orderById = new Map(orders.map((order) => [order.id, order]));
  const linesByOrder = new Map();
  const movementsByOrder = new Map();
  const purchasesByProduct = new Map();
  for (const line of lines) if (line.line_origin === 'READY') pushToMap(linesByOrder, line.order_id, line);
  for (const movement of movements) if (movement.order_id) pushToMap(movementsByOrder, movement.order_id, movement);
  for (const cost of costs) if (cost.cost_type === 'purchase') pushToMap(purchasesByProduct, cost.product_code, {
    id: cost.id, type: 'purchase', availableOn: cost.available_on,
    quantity: number(cost.quantity), unitCostEur: number(cost.unit_cost_eur)
  });

  const economicParameters = parameters.map((parameter) => ({
    key: parameter.key, validFrom: parameter.valid_from, validTo: parameter.valid_to,
    value: number(parameter.value), unit: parameter.unit, note: parameter.note
  }));
  const results = [];
  const anomalies = [];
  const orderSummaries = [];

  for (const [orderId, orderMovements] of movementsByOrder) {
    const positiveSales = orderMovements.filter((movement) =>
      movement.movement_type === 'sales' && number(movement.amount) > 0
    );
    if (!positiveSales.length) continue;
    const order = orderById.get(orderId);
    const soldOn = firstPositiveSaleDate(orderMovements.map((movement) => ({
      movementType: movement.movement_type,
      amount: number(movement.amount),
      valueDate: movement.value_date
    })));
    const orderLines = linesByOrder.get(orderId) ?? [];
    const revenueEur = roundMoney(orderMovements
      .filter((movement) => movement.include_in_sales_margin && movement.economic_category === 'revenue')
      .reduce((sum, movement) => sum + (number(movement.amount_eur) ?? 0), 0));
    const initialInvoiceFeesEur = roundMoney(orderMovements
      .filter((movement) => movement.include_in_sales_margin && movement.economic_category === 'marketplace_fee')
      .reduce((sum, movement) => sum + (number(movement.amount_eur) ?? 0), 0));
    const positiveSalesEur = roundMoney(positiveSales.reduce((sum, movement) => sum + (number(movement.amount_eur) ?? 0), 0));

    const costSelections = orderLines.map((line) => ({
      line,
      selection: selectProductCost({
        soldOn,
        purchases: purchasesByProduct.get(line.product_code) ?? [],
        readyPurchasePrice: number(line.ready_purchase_price),
        readyFifoCost: number(line.ready_fifo_cost)
      })
    }));
    const missingCosts = costSelections.filter(({ selection }) => selection.status === 'suspended');
    const productCostEur = missingCosts.length || !orderLines.length ? null : roundMoney(costSelections.reduce(
      (sum, { line, selection }) => sum + roundMoney(number(line.quantity) * selection.unitCostEur), 0
    ));
    const charges = calculateOrderCharges({
      soldOn,
      positiveSalesEur,
      carriers: orderLines.map((line) => line.carrier),
      parameters: economicParameters
    });
    const blocking = [];
    if (!orderLines.length) blocking.push('MISSING_ORDER_LINE');
    if (missingCosts.length) blocking.push('MISSING_PRODUCT_COST');
    if (charges.status === 'suspended') blocking.push(charges.code);
    const margin = blocking.length ? { status: 'suspended', marginEur: null } : salesMargin({
      revenueEur,
      initialInvoiceFeesEur,
      productCostEur,
      shippingEur: charges.shippingEur,
      investorFeeEur: charges.investorFeeEur,
      storfundFeeEur: charges.storfundFeeEur,
      provisional: Boolean(order?.provisional)
    });
    const status = margin.status;
    const sourceRefs = [
      ...orderMovements.map((movement) => ({ type: 'invoice_movement', id: movement.id, sourceRowId: movement.source_row_id })),
      ...orderLines.map((line) => ({ type: 'order_line', id: line.id, sourceRowId: line.source_row_id }))
    ];
    const costSources = costSelections.map(({ line, selection }) => ({
      orderLineId: line.id,
      productCode: line.product_code,
      source: selection.source ?? null,
      sourceIds: selection.sourceIds ?? [],
      code: selection.code ?? null
    }));
    const details = { blocking, positiveSalesEur, costSources };
    const values = [
      ['revenue', 'revenue', revenueEur],
      ['marketplace_fee', 'marketplace_fee', initialInvoiceFeesEur],
      ['product_cost', 'product_cost', productCostEur === null ? null : -productCostEur],
      ['shipping', 'shipping', charges.shippingEur === undefined ? null : -charges.shippingEur],
      ['investor_fee', 'investor_fee', charges.investorFeeEur === undefined ? null : -charges.investorFeeEur],
      ['storfund_fee', 'storfund_fee', charges.storfundFeeEur === undefined ? null : -charges.storfundFeeEur],
      ['margin', null, margin.marginEur === null ? null : roundMoney(margin.marginEur)]
    ];
    for (const [component, economicCategory, amountEur] of values) results.push(resultRow({
      resultType: 'sales', resultDate: soldOn, orderId, component,
      economicCategory, amountEur, status, sourceRefs, details
    }));
    results.push(resultRow({
      resultType: 'company', resultDate: soldOn, orderId,
      component: 'sales_margin', amountEur: margin.marginEur === null ? null : roundMoney(margin.marginEur),
      status, sourceRefs, details
    }));
    orderSummaries.push({ orderId, soldOn, revenueEur, marginEur: margin.marginEur, status });

    if (!orderLines.length) anomalies.push({
      anomalyKey: `order:${orderId}:line`, severity: 'blocking', entityType: 'order', entityId: orderId,
      code: 'UNLINKED_ORDER', message: 'Ordine Invoice senza riga Ready collegata', details: {}
    });
    if (missingCosts.length) anomalies.push({
      anomalyKey: `order:${orderId}:cost`, severity: 'blocking', entityType: 'order', entityId: orderId,
      code: 'MISSING_COST', message: 'Costo prodotto non disponibile secondo la gerarchia temporale',
      details: { orderLineIds: missingCosts.map(({ line }) => line.id) }
    });
    if (['MISSING_CARRIER', 'AMBIGUOUS_CARRIER'].includes(charges.code)) anomalies.push({
      anomalyKey: `order:${orderId}:carrier`, severity: 'blocking', entityType: 'order', entityId: orderId,
      code: charges.code, message: charges.code === 'MISSING_CARRIER' ? 'Vettore mancante' : 'Più vettori incompatibili sullo stesso ordine', details: {}
    });
  }

  for (const movement of movements) {
    if (!movement.include_in_company_margin || movement.include_in_sales_margin || movement.financial_flow) continue;
    results.push(resultRow({
      resultType: 'company', resultDate: movement.value_date, orderId: movement.order_id,
      component: `invoice_${movement.id}`, economicCategory: movement.economic_category,
      amountEur: number(movement.amount_eur), status: movement.provisional ? 'provisional' : 'final',
      sourceRefs: [{ type: 'invoice_movement', id: movement.id, sourceRowId: movement.source_row_id }]
    }));
  }

  const covered = orderSummaries.filter((order) => order.status !== 'suspended');
  const suspended = orderSummaries.filter((order) => order.status === 'suspended');
  const dates = movements.map((movement) => movement.value_date).filter(Boolean).sort();
  const coverage = {
    totalOrders: orderSummaries.length,
    coveredOrders: covered.length,
    suspendedOrders: suspended.length,
    percent: orderSummaries.length ? roundMoney(covered.length / orderSummaries.length * 100) : 0,
    revenueEur: roundMoney(covered.reduce((sum, order) => sum + order.revenueEur, 0)),
    salesMarginEur: roundMoney(covered.reduce((sum, order) => sum + order.marginEur, 0))
  };
  const companyComponents = results.filter((row) => row.resultType === 'company' && row.status !== 'suspended' && Number.isFinite(row.amountEur));
  coverage.companyMarginEur = roundMoney(companyComponents.reduce((sum, row) => sum + row.amountEur, 0));

  let runId = null;
  if (persist && dates.length) {
    const rules = await readFile(new URL('../packages/domain/src/economics.mjs', import.meta.url));
    runId = await rpc('save_calculation_run', {
      p_engine_version: 'v1.0.0-local',
      p_rules_hash: createHash('sha256').update(rules).digest('hex'),
      p_period_start: dates[0],
      p_period_end: dates.at(-1),
      p_input_batch_ids: batches.filter((batch) => batch.is_active && batch.status === 'imported').map((batch) => batch.id),
      p_parameter_values: economicParameters,
      p_coverage: coverage,
      p_results: results,
      p_anomalies: anomalies
    });
  }
  return { runId, coverage, resultRows: results.length, anomalies: anomalies.length };
}
