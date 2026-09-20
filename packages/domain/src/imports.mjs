import { createHash } from 'node:crypto';
import { convertToEur } from './economics.mjs';

export const REQUIRED_SOURCE_HEADERS = Object.freeze({
  invoice: ['invoice_key', 'value_date', 'amount', 'currency'],
  orders: ['order_id', 'orderline_id', 'date_creation'],
  ready_sales: ['N.ord.web', 'P.Acq.'],
  purchases: ['Intestatario', 'Prezzo', 'Quant.'],
  ready_returns: ['Doc. origine', 'Pagamento']
});

const EXPORT_SAFE_FIELDS = Object.freeze([
  'order_id', 'orderline_id', 'date_creation', 'date_modification', 'country',
  'order_state', 'orderline_state', 'canceled_by', 'sku', 'quantity',
  'orderline_title', 'orderline_price', 'orderline_shipper', 'shipper',
  'return_reason', 'currency', 'product_id', 'model', 'brand', 'backbox_grade'
]);

const SOURCE_SAFE_FIELDS = Object.freeze({
  invoice: ['invoice_key', 'value_date', 'sku', 'order_id', 'designation', 'amount', 'currency'],
  orders: EXPORT_SAFE_FIELDS,
  ready_sales: ['Data', 'N.ord.web', 'Cod.', 'Quant.', 'Pr.sc.', 'P.Acq.', 'Vettore', 'FIFO 2026/07', 'Tipo', 'N.Doc.', 'Causale', 'Descrizione'],
  purchases: ['Data', 'Intestatario', 'Cod.', 'Descrizione', 'Quant.', 'Prezzo'],
  ready_returns: ['N.Doc.', 'Data', 'Cod.', 'Descrizione', 'Quant.', 'Prezzo', 'S1', 'Causale', 'Agente', 'Doc. origine', 'Pagamento']
});

const INITIAL_FEES = new Set([
  'sales_fees', 'dp_adjustment_fee', 'ccbm_fees', 'payment_fees',
  'paypal_fees', 'klarna_fees', 'oney_fees', 'scalapay_fees'
]);

const RECOVERIES = new Set([
  'avoir_sales_fees', 'dp_adjustment_fee_refund', 'deals_commission_discount',
  'credit_requests', 'regularization_chargeback'
]);

const OTHER_CLASSIFIED = new Set(['bonus_marketing', 'allowance', 'general_cost', 'adjustment']);
const FINANCIAL_EXACT = new Set(['payment', 'payments', 'payout']);

export function parseCsv(text, delimiter = detectDelimiter(text)) {
  const input = text.startsWith('\uFEFF') ? text.slice(1) : text;
  const records = [];
  let fields = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;

  const finishRecord = () => {
    fields.push(field);
    if (fields.some((value) => value !== '')) records.push({ rowNumber: recordLine, fields });
    fields = [];
    field = '';
    recordLine = line + 1;
  };

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === '"') {
      if (inQuotes && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes && character === delimiter) {
      fields.push(field);
      field = '';
    } else if (!inQuotes && (character === '\n' || character === '\r')) {
      if (character === '\r' && input[index + 1] === '\n') index += 1;
      finishRecord();
      line += 1;
    } else {
      field += character;
      if (character === '\n') line += 1;
    }
  }
  if (field !== '' || fields.length) finishRecord();
  if (!records.length) return { headers: [], rows: [], delimiter };

  const headers = records[0].fields.map((value) => value.trim());
  const rows = records.slice(1).map((record) => {
    const values = [...record.fields, ...Array(Math.max(0, headers.length - record.fields.length)).fill('')];
    return {
      rowNumber: record.rowNumber,
      values: Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']))
    };
  });
  return { headers, rows, delimiter };
}

export function detectDelimiter(text) {
  const input = text.startsWith('\uFEFF') ? text.slice(1) : text;
  let inQuotes = false;
  const counts = { ',': 0, ';': 0, '\t': 0, '|': 0 };
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === '"') {
      if (inQuotes && input[index + 1] === '"') index += 1;
      else inQuotes = !inQuotes;
    } else if (!inQuotes && character in counts) counts[character] += 1;
    else if (!inQuotes && (character === '\n' || character === '\r')) break;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

export function detectSource(headers) {
  const present = new Set(headers);
  const order = ['invoice', 'orders', 'ready_returns', 'ready_sales', 'purchases'];
  return order.find((source) => REQUIRED_SOURCE_HEADERS[source].every((header) => present.has(header))) ?? null;
}

export function parseDecimal(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  let input = String(value ?? '').trim().replace(/\u00a0|\s/g, '');
  if (!input) return null;
  let negative = false;
  if (input.startsWith('(') && input.endsWith(')')) {
    negative = true;
    input = input.slice(1, -1);
  }
  input = input.replace(/[^0-9,.'+-]/g, '').replace(/'/g, '');
  const comma = input.lastIndexOf(',');
  const dot = input.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? ',' : '.';
    const thousands = decimal === ',' ? /\./g : /,/g;
    input = input.replace(thousands, '').replace(decimal, '.');
  } else if (comma >= 0) {
    input = input.replace(/\./g, '').replace(',', '.');
  }
  const number = Number(input);
  if (!Number.isFinite(number)) return null;
  return negative ? -number : number;
}

export function parseDate(value) {
  const input = String(value ?? '').trim();
  if (!input) return null;
  const italian = input.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (italian) return `${italian[3]}-${italian[2].padStart(2, '0')}-${italian[1].padStart(2, '0')}`;
  const iso = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

export function normalizeOrderId(value) {
  const original = String(value ?? '').trim();
  if (!original) return null;
  const normalized = original.replace(/^BM/i, '').replace(/\.0$/, '');
  return /^\d+$/.test(normalized) ? normalized : null;
}

export function normalizeCarrier(value) {
  const input = String(value ?? '').trim().toUpperCase();
  if (input.includes('DHL')) return 'DHL';
  if (input.includes('GLS')) return 'GLS';
  return null;
}

export function classifyInvoiceKey(value) {
  const key = String(value ?? '').trim().toLowerCase();
  if (key === 'sales' || key === 'sales_dp_adjustment') {
    return { key, economicCategory: 'revenue', financialFlow: false, salesMargin: true, companyMargin: true };
  }
  if (INITIAL_FEES.has(key)) {
    return { key, economicCategory: 'marketplace_fee', financialFlow: false, salesMargin: true, companyMargin: true };
  }
  if (key === 'refunds' || key.startsWith('refund_')) {
    return { key, economicCategory: 'refund', financialFlow: false, salesMargin: false, companyMargin: true };
  }
  if (RECOVERIES.has(key)) {
    return { key, economicCategory: 'recovery', financialFlow: false, salesMargin: false, companyMargin: true };
  }
  if (key.includes('backship')) return { key, economicCategory: 'backship', financialFlow: false, salesMargin: false, companyMargin: true };
  if (key.includes('epr') || key.includes('eco_participation')) return { key, economicCategory: 'epr', financialFlow: false, salesMargin: false, companyMargin: true };
  if (key.includes('monthly_fee')) return { key, economicCategory: 'subscription', financialFlow: false, salesMargin: false, companyMargin: true };
  if (OTHER_CLASSIFIED.has(key)) return { key, economicCategory: 'other', financialFlow: false, salesMargin: false, companyMargin: true };
  if (key.startsWith('deferred_payout_') || key.startsWith('transfer_') || FINANCIAL_EXACT.has(key)) {
    return { key, economicCategory: null, financialFlow: true, salesMargin: false, companyMargin: false };
  }
  return { key, economicCategory: null, financialFlow: false, salesMargin: false, companyMargin: false, anomaly: 'UNCLASSIFIED_MOVEMENT' };
}

export function extractOrderId(invoiceKey, orderId, designation) {
  const direct = normalizeOrderId(orderId);
  if (direct) return direct;
  const key = String(invoiceKey ?? '').trim().toLowerCase();
  const text = String(designation ?? '').trim();
  if (key === 'avoir_sales_fees') return text.match(/^avoir_commission_order_id_?(\d+)(?:[A-Z]{2})?$/i)?.[1] ?? null;
  if (key === 'deals_commission_discount') return text.match(/^accelerator_offer_order_id_?(\d+)(?:[A-Z]{2})?$/i)?.[1] ?? null;
  return null;
}

export function sanitizeRawRow(source, row) {
  const sanitized = Object.fromEntries(SOURCE_SAFE_FIELDS[source].map((field) => [field, row[field] ?? '']));
  if (source === 'ready_returns' && /^(imei|numero di serie)\s*:/i.test(String(sanitized.Descrizione ?? '').trim())) {
    sanitized.Descrizione = '[identificativo dispositivo escluso]';
  }
  return sanitized;
}

function normalizeInvoice(row) {
  const errors = [];
  const warnings = [];
  const movementType = String(row.invoice_key ?? '').trim().toLowerCase();
  const valueDate = parseDate(row.value_date);
  const amount = parseDecimal(row.amount);
  const currency = String(row.currency ?? '').trim().toUpperCase();
  const classification = classifyInvoiceKey(movementType);
  const fx = convertToEur(amount, currency);
  const orderId = extractOrderId(movementType, row.order_id, row.designation);
  if (!movementType) errors.push('MISSING_INVOICE_KEY');
  if (!valueDate) errors.push('INVALID_VALUE_DATE');
  if (amount === null) errors.push('INVALID_AMOUNT');
  if (!currency) errors.push('MISSING_CURRENCY');
  if (fx.status === 'suspended' && amount !== null && currency) errors.push(fx.code);
  if (classification.anomaly) warnings.push(classification.anomaly);
  return {
    normalized: {
      movementType, valueDate, orderId, sku: row.sku || null,
      designation: row.designation || null, amount, currency,
      amountEur: fx.status === 'final' ? fx.amountEur : null,
      economicCategory: classification.economicCategory,
      financialFlow: classification.financialFlow,
      includeInSalesMargin: classification.salesMargin,
      includeInCompanyMargin: classification.companyMargin
    }, errors, warnings, date: valueDate, currency
  };
}

function normalizeOrder(row) {
  const errors = [];
  const orderId = normalizeOrderId(row.order_id);
  const orderlineId = String(row.orderline_id ?? '').trim();
  const createdOn = parseDate(row.date_creation);
  const quantity = parseDecimal(row.quantity);
  if (!orderId) errors.push('INVALID_ORDER_ID');
  if (!orderlineId) errors.push('MISSING_ORDERLINE_ID');
  if (!createdOn) errors.push('INVALID_DATE_CREATION');
  if (!(quantity > 0)) errors.push('INVALID_QUANTITY');
  return {
    normalized: {
      orderId, orderlineId, createdOn, modifiedOn: parseDate(row.date_modification),
      country: row.country || null, orderState: row.order_state || null,
      orderlineState: row.orderline_state || null, canceledBy: row.canceled_by || null,
      sku: row.sku || null, quantity, description: row.orderline_title || null,
      matchingPrice: parseDecimal(row.orderline_price),
      carrier: normalizeCarrier(row.orderline_shipper || row.shipper),
      returnReason: row.return_reason || null, currency: String(row.currency ?? '').trim().toUpperCase() || null,
      productId: row.product_id || null, model: row.model || null,
      brand: row.brand || null, grade: row.backbox_grade || null
    }, errors, warnings: [], date: createdOn, currency: String(row.currency ?? '').trim().toUpperCase()
  };
}

function normalizeReadySale(row) {
  const errors = [];
  const warnings = [];
  const soldOn = parseDate(row.Data);
  const orderId = normalizeOrderId(row['N.ord.web']);
  const productCode = String(row['Cod.'] ?? '').trim();
  const quantity = parseDecimal(row['Quant.']);
  const carrier = normalizeCarrier(row.Vettore);
  if (!soldOn) errors.push('INVALID_SALE_DATE');
  if (!orderId) errors.push('INVALID_ORDER_ID');
  if (!productCode) errors.push('MISSING_PRODUCT_CODE');
  if (!(quantity > 0)) errors.push('INVALID_QUANTITY');
  if (!carrier) warnings.push('MISSING_OR_UNKNOWN_CARRIER');
  if (!String(row['N.ord.web'] ?? '').trim().toUpperCase().startsWith('BM')) warnings.push('NUMERIC_ORDER_REQUIRES_CROSS_SOURCE_VALIDATION');
  return {
    normalized: {
      soldOn, orderId, productCode, quantity,
      matchingPrice: parseDecimal(row['Pr.sc.']),
      readyPurchasePrice: parseDecimal(row['P.Acq.']),
      readyFifoCost: parseDecimal(row['FIFO 2026/07']),
      carrier, documentType: row.Tipo || null,
      documentNumber: String(row['N.Doc.'] ?? '').trim() || null,
      cause: row.Causale || null, description: row.Descrizione || null
    }, errors, warnings, date: soldOn
  };
}

function normalizePurchase(row) {
  const availableOn = parseDate(row.Data);
  const productCode = String(row['Cod.'] ?? '').trim();
  const quantity = parseDecimal(row['Quant.']);
  const unitCostEur = parseDecimal(row.Prezzo);
  const description = String(row.Descrizione ?? '').trim();
  const ignored = description.startsWith('Rif. Ord.f.') || (!availableOn && !productCode && !description);
  const errors = [];
  if (!ignored) {
    if (!availableOn) errors.push('INVALID_PURCHASE_DATE');
    if (!productCode) errors.push('MISSING_PRODUCT_CODE');
    if (!(quantity > 0)) errors.push('INVALID_QUANTITY');
    if (!(unitCostEur > 0)) errors.push('INVALID_UNIT_COST');
  }
  return {
    normalized: {
      availableOn, productCode, quantity, unitCostEur,
      supplier: row.Intestatario || null, description: row.Descrizione || null
    }, errors, warnings: [], ignored, date: availableOn
  };
}

function normalizeReturnGroups(parsedRows) {
  const groups = new Map();
  for (const record of parsedRows) {
    const date = parseDate(record.values.Data);
    const key = `${record.values['N.Doc.'] ?? ''}|${date ?? ''}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  const output = [];
  for (const records of groups.values()) {
    const context = records.filter(({ values }) => !(Math.abs(parseDecimal(values['Quant.']) ?? 0) > 0));
    const contextText = records.map(({ values }) => `${values.Descrizione ?? ''} ${values['Doc. origine'] ?? ''}`).join(' ');
    const blockOrderId = contextText.match(/\bOrdine\s+(?:BM\s*)?([0-9]+)\b/i)?.[1]
      ?? contextText.match(/\bBM\s*([0-9]+)\b/i)?.[1]
      ?? null;
    const contextRows = context
      .filter(({ values }) => /^(Rif\. Ric\.|Ordine\s+)/i.test(String(values.Descrizione ?? '').trim()) || values['Doc. origine'])
      .map(({ rowNumber, values }) => ({
        rowNumber, description: values.Descrizione || null, originDocument: values['Doc. origine'] || null
      }));
    for (const record of records) {
      const row = record.values;
      const quantity = parseDecimal(row['Quant.']);
      const isProduct = Math.abs(quantity ?? 0) > 0 && String(row.Descrizione ?? '').trim() && String(row.Causale ?? '').trim();
      if (!isProduct) {
        output.push({ rowNumber: record.rowNumber, row, ignored: true, errors: [], warnings: [], normalized: null, date: parseDate(row.Data) });
        continue;
      }
      const errors = [];
      const returnDate = parseDate(row.Data);
      if (!returnDate) errors.push('INVALID_RETURN_DATE');
      if (!String(row.Pagamento ?? '').toLowerCase().includes('backmarket')) errors.push('NOT_BACK_MARKET_RETURN');
      output.push({
        rowNumber: record.rowNumber,
        row,
        ignored: false,
        errors,
        warnings: blockOrderId ? [] : ['RETURN_ORDER_NOT_FOUND_IN_BLOCK'],
        date: returnDate,
        normalized: {
          returnDocumentNumber: String(row['N.Doc.'] ?? '').trim(), returnDate,
          productCode: String(row['Cod.'] ?? '').trim() || null,
          description: row.Descrizione || null, quantity: Math.abs(quantity),
          unitPrice: parseDecimal(row.Prezzo), reason: row.Causale || null,
          agent: row.Agente || null, originDocument: row['Doc. origine'] || null,
          payment: row.Pagamento || null, orderId: blockOrderId, contextRows
        }
      });
    }
  }
  return output;
}

export function previewCsv({ content, sourceName = 'source.csv' }) {
  const parsed = parseCsv(content);
  const source = detectSource(parsed.headers);
  if (!source) throw new Error('UNKNOWN_SOURCE_HEADERS');
  const missingHeaders = REQUIRED_SOURCE_HEADERS[source].filter((header) => !parsed.headers.includes(header));
  if (missingHeaders.length) throw new Error(`MISSING_HEADERS:${missingHeaders.join(',')}`);

  const normalizedRows = source === 'ready_returns'
    ? normalizeReturnGroups(parsed.rows)
    : parsed.rows.map((record) => {
      const result = source === 'invoice' ? normalizeInvoice(record.values)
        : source === 'orders' ? normalizeOrder(record.values)
          : source === 'ready_sales' ? normalizeReadySale(record.values)
            : normalizePurchase(record.values);
      return { rowNumber: record.rowNumber, row: record.values, ...result };
    });

  const rows = normalizedRows.map((item) => ({
    rowNumber: item.rowNumber,
    rawData: sanitizeRawRow(source, item.row),
    normalized: item.normalized,
    errors: item.errors,
    warnings: item.warnings,
    ignored: Boolean(item.ignored)
  }));
  const activeRows = normalizedRows.filter((row) => !row.ignored);
  const dates = activeRows.map((row) => row.date).filter(Boolean).sort();
  const currencies = [...new Set(activeRows.map((row) => row.currency).filter(Boolean))].sort();
  const classifications = source === 'invoice'
    ? Object.fromEntries(activeRows.reduce((counts, row) => {
      const key = row.normalized.economicCategory ?? (row.normalized.financialFlow ? 'financial' : 'unclassified');
      counts.set(key, (counts.get(key) ?? 0) + 1);
      return counts;
    }, new Map()))
    : undefined;
  return {
    sourceName,
    source,
    delimiter: parsed.delimiter,
    contentSha256: createHash('sha256').update(content).digest('hex'),
    headers: parsed.headers,
    rowCount: parsed.rows.length,
    validCount: activeRows.filter((row) => row.errors.length === 0).length,
    errorCount: activeRows.filter((row) => row.errors.length > 0).length,
    warningCount: activeRows.filter((row) => row.warnings.length > 0).length,
    ignoredCount: normalizedRows.filter((row) => row.ignored).length,
    coverage: { from: dates[0] ?? null, to: dates.at(-1) ?? null },
    currencies,
    classifications,
    rows
  };
}
