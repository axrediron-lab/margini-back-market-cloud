begin;

alter table public.orders
  add column if not exists source_refs jsonb not null default '[]'::jsonb;

alter table public.invoice_movements
  add column if not exists sku text,
  add column if not exists designation text,
  add column if not exists include_in_sales_margin boolean not null default false,
  add column if not exists include_in_company_margin boolean not null default false;

create or replace function public.materialize_imports()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  -- Ready e la prima sales positiva Invoice definiscono l'anagrafica minima ordine.
  insert into public.orders (
    marketplace_order_id, sold_at, source_row_id, provisional
  )
  select
    r.normalized_data->>'orderId',
    min((r.normalized_data->>'soldOn')::date)::timestamptz,
    min(r.id),
    true
  from public.import_rows r
  join public.import_batches b on b.id = r.batch_id
  where b.source = 'ready_sales'
    and b.status = 'imported' and b.is_active
    and jsonb_array_length(r.errors) = 0
    and nullif(r.normalized_data->>'orderId', '') is not null
  group by r.normalized_data->>'orderId'
  on conflict (marketplace_order_id) do update set
    sold_at = coalesce(public.orders.sold_at, excluded.sold_at),
    source_row_id = coalesce(public.orders.source_row_id, excluded.source_row_id);

  insert into public.orders (
    marketplace_order_id, sold_at, currency, source_row_id, provisional
  )
  select
    r.normalized_data->>'orderId',
    min((r.normalized_data->>'valueDate')::date)::timestamptz,
    min(r.normalized_data->>'currency'),
    min(r.id),
    true
  from public.import_rows r
  join public.import_batches b on b.id = r.batch_id
  where b.source = 'invoice'
    and b.status = 'imported' and b.is_active
    and jsonb_array_length(r.errors) = 0
    and r.normalized_data->>'movementType' = 'sales'
    and (r.normalized_data->>'amount')::numeric > 0
    and nullif(r.normalized_data->>'orderId', '') is not null
  group by r.normalized_data->>'orderId'
  on conflict (marketplace_order_id) do update set
    sold_at = excluded.sold_at,
    currency = coalesce(public.orders.currency, excluded.currency);

  insert into public.orders (
    marketplace_order_id, sold_at, currency, source_row_id, provisional,
    operational_created_at, operational_modified_at, country, order_state
  )
  select
    r.normalized_data->>'orderId',
    min((r.normalized_data->>'createdOn')::date)::timestamptz,
    min(nullif(r.normalized_data->>'currency', '')),
    min(r.id),
    true,
    min((r.normalized_data->>'createdOn')::date)::timestamptz,
    max((r.normalized_data->>'modifiedOn')::date)::timestamptz,
    min(nullif(r.normalized_data->>'country', '')),
    min(nullif(r.normalized_data->>'orderState', ''))
  from public.import_rows r
  join public.import_batches b on b.id = r.batch_id
  where b.source = 'orders'
    and b.status = 'imported' and b.is_active
    and jsonb_array_length(r.errors) = 0
    and nullif(r.normalized_data->>'orderId', '') is not null
  group by r.normalized_data->>'orderId'
  on conflict (marketplace_order_id) do update set
    operational_created_at = excluded.operational_created_at,
    operational_modified_at = excluded.operational_modified_at,
    country = excluded.country,
    order_state = excluded.order_state,
    currency = coalesce(public.orders.currency, excluded.currency);

  with refs as (
    select
      r.normalized_data->>'orderId' as marketplace_order_id,
      jsonb_agg(jsonb_build_object(
        'source', b.source, 'batchId', b.id, 'rowId', r.id, 'rowNumber', r.row_number
      ) order by r.id) as source_refs
    from public.import_rows r
    join public.import_batches b on b.id = r.batch_id
    where b.status = 'imported' and b.is_active
      and b.source in ('invoice', 'orders', 'ready_sales')
      and jsonb_array_length(r.errors) = 0
      and nullif(r.normalized_data->>'orderId', '') is not null
    group by r.normalized_data->>'orderId'
  )
  update public.orders o
  set source_refs = refs.source_refs
  from refs
  where refs.marketplace_order_id = o.marketplace_order_id;

  update public.orders o set provisional = not (
    exists (
      select 1 from public.import_rows r join public.import_batches b on b.id = r.batch_id
      where b.source = 'invoice' and b.status = 'imported' and b.is_active
        and r.normalized_data->>'orderId' = o.marketplace_order_id
        and r.normalized_data->>'movementType' = 'sales'
        and (r.normalized_data->>'amount')::numeric > 0
    ) and exists (
      select 1 from public.import_rows r join public.import_batches b on b.id = r.batch_id
      where b.source = 'ready_sales' and b.status = 'imported' and b.is_active
        and r.normalized_data->>'orderId' = o.marketplace_order_id
    )
  ) where true;

  -- Una riga Ready resta una riga vendita fisica, anche in ordini multi-riga.
  insert into public.order_lines (
    order_id, source_row_id, line_key, product_code, description, quantity,
    unit_price, ready_purchase_price, ready_fifo_cost, document_type,
    document_number, document_date, carrier, line_origin
  )
  select
    o.id,
    r.id,
    concat_ws(':', coalesce(r.normalized_data->>'documentType', 'READY'),
      coalesce(r.normalized_data->>'documentNumber', ''), r.row_number::text),
    r.normalized_data->>'productCode',
    nullif(r.normalized_data->>'description', ''),
    (r.normalized_data->>'quantity')::numeric,
    (r.normalized_data->>'matchingPrice')::numeric,
    (r.normalized_data->>'readyPurchasePrice')::numeric,
    (r.normalized_data->>'readyFifoCost')::numeric,
    nullif(r.normalized_data->>'documentType', ''),
    nullif(r.normalized_data->>'documentNumber', ''),
    (r.normalized_data->>'soldOn')::date,
    nullif(r.normalized_data->>'carrier', ''),
    'READY'
  from public.import_rows r
  join public.import_batches b on b.id = r.batch_id
  join public.orders o on o.marketplace_order_id = r.normalized_data->>'orderId'
  where b.source = 'ready_sales'
    and b.status = 'imported' and b.is_active
    and jsonb_array_length(r.errors) = 0
  on conflict (source_row_id) where source_row_id is not null do update set
    order_id = excluded.order_id,
    product_code = excluded.product_code,
    description = excluded.description,
    quantity = excluded.quantity,
    unit_price = excluded.unit_price,
    ready_purchase_price = excluded.ready_purchase_price,
    ready_fifo_cost = excluded.ready_fifo_cost,
    carrier = excluded.carrier;

  insert into public.order_lines (
    order_id, source_row_id, line_key, sku, description, quantity,
    unit_price, marketplace_orderline_id, carrier, line_origin, operational_state
  )
  select
    o.id,
    r.id,
    r.normalized_data->>'orderlineId',
    coalesce(nullif(r.normalized_data->>'sku', ''), r.normalized_data->>'productId'),
    nullif(r.normalized_data->>'description', ''),
    (r.normalized_data->>'quantity')::numeric,
    (r.normalized_data->>'matchingPrice')::numeric,
    r.normalized_data->>'orderlineId',
    nullif(r.normalized_data->>'carrier', ''),
    'BACK_MARKET_RECONSTRUCTED',
    nullif(r.normalized_data->>'orderlineState', '')
  from public.import_rows r
  join public.import_batches b on b.id = r.batch_id
  join public.orders o on o.marketplace_order_id = r.normalized_data->>'orderId'
  where b.source = 'orders'
    and b.status = 'imported' and b.is_active
    and jsonb_array_length(r.errors) = 0
  on conflict (source_row_id) where source_row_id is not null do update set
    order_id = excluded.order_id,
    sku = excluded.sku,
    description = excluded.description,
    quantity = excluded.quantity,
    unit_price = excluded.unit_price,
    carrier = excluded.carrier,
    operational_state = excluded.operational_state;

  insert into public.invoice_movements (
    source_row_id, movement_key, order_id, movement_type, value_date,
    amount, currency, amount_eur, economic_category, financial_flow,
    provisional, sku, designation, include_in_sales_margin,
    include_in_company_margin
  )
  select
    r.id,
    b.content_sha256 || ':' || r.row_number::text,
    o.id,
    r.normalized_data->>'movementType',
    (r.normalized_data->>'valueDate')::date,
    (r.normalized_data->>'amount')::numeric,
    r.normalized_data->>'currency',
    (r.normalized_data->>'amountEur')::numeric,
    nullif(r.normalized_data->>'economicCategory', ''),
    coalesce((r.normalized_data->>'financialFlow')::boolean, false),
    not ((r.normalized_data->>'amountEur') is not null and
      (nullif(r.normalized_data->>'economicCategory', '') is not null or
       coalesce((r.normalized_data->>'financialFlow')::boolean, false))),
    nullif(r.normalized_data->>'sku', ''),
    nullif(r.normalized_data->>'designation', ''),
    coalesce((r.normalized_data->>'includeInSalesMargin')::boolean, false),
    coalesce((r.normalized_data->>'includeInCompanyMargin')::boolean, false)
  from public.import_rows r
  join public.import_batches b on b.id = r.batch_id
  left join public.orders o on o.marketplace_order_id = r.normalized_data->>'orderId'
  where b.source = 'invoice'
    and b.status = 'imported' and b.is_active
    and jsonb_array_length(r.errors) = 0
  on conflict (source_row_id) do update set
    order_id = excluded.order_id,
    amount_eur = excluded.amount_eur,
    economic_category = excluded.economic_category,
    financial_flow = excluded.financial_flow,
    provisional = excluded.provisional,
    include_in_sales_margin = excluded.include_in_sales_margin,
    include_in_company_margin = excluded.include_in_company_margin;

  insert into public.cost_entries (
    source_row_id, product_code, cost_type, available_on, quantity, unit_cost_eur
  )
  select r.id, r.normalized_data->>'productCode', 'purchase',
    (r.normalized_data->>'availableOn')::date,
    (r.normalized_data->>'quantity')::numeric,
    (r.normalized_data->>'unitCostEur')::numeric
  from public.import_rows r
  join public.import_batches b on b.id = r.batch_id
  where b.source = 'purchases'
    and b.status = 'imported' and b.is_active
    and jsonb_array_length(r.errors) = 0
    and nullif(r.normalized_data->>'availableOn', '') is not null
    and nullif(r.normalized_data->>'productCode', '') is not null
    and (r.normalized_data->>'quantity')::numeric > 0
    and (r.normalized_data->>'unitCostEur')::numeric > 0
  on conflict (source_row_id, cost_type) do update set
    available_on = excluded.available_on,
    quantity = excluded.quantity,
    unit_cost_eur = excluded.unit_cost_eur;

  insert into public.cost_entries (
    source_row_id, product_code, cost_type, available_on, quantity, unit_cost_eur
  )
  select r.id, r.normalized_data->>'productCode', 'ready_purchase_price',
    (r.normalized_data->>'soldOn')::date,
    (r.normalized_data->>'quantity')::numeric,
    (r.normalized_data->>'readyPurchasePrice')::numeric
  from public.import_rows r
  join public.import_batches b on b.id = r.batch_id
  where b.source = 'ready_sales'
    and b.status = 'imported' and b.is_active
    and jsonb_array_length(r.errors) = 0
    and (r.normalized_data->>'readyPurchasePrice')::numeric > 0
  on conflict (source_row_id, cost_type) do update set unit_cost_eur = excluded.unit_cost_eur;

  insert into public.cost_entries (
    source_row_id, product_code, cost_type, available_on, quantity, unit_cost_eur
  )
  select r.id, r.normalized_data->>'productCode', 'ready_fifo',
    (r.normalized_data->>'soldOn')::date,
    (r.normalized_data->>'quantity')::numeric,
    (r.normalized_data->>'readyFifoCost')::numeric
  from public.import_rows r
  join public.import_batches b on b.id = r.batch_id
  where b.source = 'ready_sales'
    and b.status = 'imported' and b.is_active
    and jsonb_array_length(r.errors) = 0
    and (r.normalized_data->>'readyFifoCost')::numeric > 0
  on conflict (source_row_id, cost_type) do update set unit_cost_eur = excluded.unit_cost_eur;

  insert into public.returns (
    source_row_id, document_type, document_number, document_date,
    product_code, quantity, unit_price, currency, origin_document_number,
    marketplace_order_id, reason, agent, payment, context_source_row_ids
  )
  select
    r.id, 'RESO_READY', r.normalized_data->>'returnDocumentNumber',
    (r.normalized_data->>'returnDate')::date,
    r.normalized_data->>'productCode',
    (r.normalized_data->>'quantity')::numeric,
    (r.normalized_data->>'unitPrice')::numeric,
    'EUR',
    nullif(r.normalized_data->>'originDocument', ''),
    nullif(r.normalized_data->>'orderId', ''),
    nullif(r.normalized_data->>'reason', ''),
    nullif(r.normalized_data->>'agent', ''),
    nullif(r.normalized_data->>'payment', ''),
    coalesce((
      select array_agg(context_row.id order by context_row.id)
      from jsonb_array_elements(coalesce(r.normalized_data->'contextRows', '[]'::jsonb)) item
      join public.import_rows context_row
        on context_row.batch_id = r.batch_id
       and context_row.row_number = (item->>'rowNumber')::integer
    ), '{}'::bigint[])
  from public.import_rows r
  join public.import_batches b on b.id = r.batch_id
  where b.source = 'ready_returns'
    and b.status = 'imported' and b.is_active
    and jsonb_array_length(r.errors) = 0
    and r.normalized_data <> '{}'::jsonb
  on conflict (source_row_id) do update set
    marketplace_order_id = excluded.marketplace_order_id,
    context_source_row_ids = excluded.context_source_row_ids;

  insert into public.return_links (return_id, order_line_id, status, checks, reason)
  select
    ret.id,
    null,
    'unmatched',
    jsonb_build_object(
      'orderReferencePresent', ret.marketplace_order_id is not null,
      'exactLineMatch', false,
      'automaticLinkBlocked', true
    ),
    case when ret.marketplace_order_id is null
      then 'Ordine non presente nel blocco Ready Resi'
      else 'Nessuna riga vendita completa nel periodo fornito'
    end
  from public.returns ret
  on conflict (return_id, order_line_id) do update set
    status = excluded.status,
    checks = excluded.checks,
    reason = excluded.reason;

  insert into public.anomalies (
    anomaly_key, severity, entity_type, entity_id, code, message, details
  )
  select
    'return:' || ret.id::text,
    'warning',
    'return',
    ret.id::text,
    'UNLINKED_RETURN',
    'Reso non collegato automaticamente a una riga vendita completa',
    jsonb_build_object('marketplaceOrderIdPresent', ret.marketplace_order_id is not null)
  from public.returns ret
  on conflict (anomaly_key) do update set
    severity = excluded.severity,
    message = excluded.message,
    details = excluded.details,
    resolved_at = null,
    resolution_note = null;

  select jsonb_build_object(
    'orders', (select count(*) from public.orders),
    'verifiedOrders', (select count(*) from public.orders where not provisional),
    'orderLines', (select count(*) from public.order_lines),
    'invoiceMovements', (select count(*) from public.invoice_movements),
    'costEntries', (select count(*) from public.cost_entries),
    'returns', (select count(*) from public.returns),
    'unlinkedReturns', (select count(*) from public.return_links where status = 'unmatched'),
    'openAnomalies', (select count(*) from public.anomalies where resolved_at is null)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.materialize_imports() from public, anon, authenticated;
grant execute on function public.materialize_imports() to service_role;

comment on function public.materialize_imports()
  is 'Normalizza in modo idempotente i batch importati nelle tabelle operative, senza creare risultati economici.';

commit;
