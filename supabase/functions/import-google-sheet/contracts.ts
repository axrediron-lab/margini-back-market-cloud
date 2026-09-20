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
  invoice: ['invoice_key', 'value_date', 'amount', 'currency'],
  orders: ['order_id', 'orderline_id', 'date_creation'],
  ready_sales: ['N.ord.web', 'P.Acq.'],
  purchases: ['Intestatario', 'Prezzo', 'Quant.'],
  ready_returns: ['Doc. origine', 'Pagamento']
};
