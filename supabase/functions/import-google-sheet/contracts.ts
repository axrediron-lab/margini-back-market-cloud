export type Source = 'invoice' | 'orders' | 'ready_sales' | 'purchases' | 'ready_returns';
export type Action = 'preview' | 'confirm';

export interface ImportRequest {
  action: Action;
  source: Source;
  spreadsheetId: string;
  range: string;
  batchId?: string;
  previewHash?: string;
}

export const REQUIRED_HEADERS: Record<Source, string[]> = {
  invoice: ['value_date', 'movement_type', 'amount', 'currency'],
  orders: ['order_id', 'sold_at', 'sku', 'quantity'],
  ready_sales: ['order_id', 'sku', 'quantity'],
  purchases: ['sku', 'available_on', 'quantity', 'unit_cost_eur'],
  ready_returns: ['document_type', 'document_number', 'document_date', 'sku', 'quantity', 'unit_price']
};
