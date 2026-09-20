begin;

-- I movimenti ripetibili come sales e sales_fees sono identificati dalla riga fisica.
alter table public.invoice_movements
  drop constraint if exists invoice_movements_movement_key_key;
create index if not exists invoice_movements_movement_key_idx
  on public.invoice_movements(movement_key);

-- Più file storici della stessa fonte devono poter restare attivi insieme.
drop index if exists public.one_active_import_per_source;

alter table public.orders
  add column if not exists operational_created_at timestamptz,
  add column if not exists operational_modified_at timestamptz,
  add column if not exists country text,
  add column if not exists order_state text;

alter table public.order_lines
  drop constraint if exists order_lines_order_id_line_key_sku_key,
  alter column sku drop not null,
  add column if not exists marketplace_orderline_id text,
  add column if not exists product_code text,
  add column if not exists document_type text,
  add column if not exists document_number text,
  add column if not exists document_date date,
  add column if not exists carrier text,
  add column if not exists line_origin text not null default 'READY'
    check (line_origin in ('READY', 'BACK_MARKET_RECONSTRUCTED', 'UNRESOLVED')),
  add column if not exists operational_state text,
  add constraint order_lines_product_identity_check
    check (nullif(trim(sku), '') is not null or nullif(trim(product_code), '') is not null);

create unique index if not exists order_lines_source_identity_idx
  on public.order_lines(order_id, line_origin, line_key, sku, product_code) nulls not distinct;
create unique index if not exists order_lines_source_row_idx
  on public.order_lines(source_row_id)
  where source_row_id is not null;
create unique index if not exists order_lines_marketplace_line_idx
  on public.order_lines(marketplace_orderline_id)
  where marketplace_orderline_id is not null;
create index if not exists order_lines_product_code_idx
  on public.order_lines(product_code, document_date);

alter table public.cost_entries
  alter column sku drop not null,
  add column if not exists product_code text,
  add constraint cost_entries_product_identity_check
    check (nullif(trim(sku), '') is not null or nullif(trim(product_code), '') is not null);

drop index if exists public.cost_lookup_idx;
create index cost_lookup_idx
  on public.cost_entries(product_code, available_on, cost_type);

alter table public.returns
  alter column sku drop not null,
  add column if not exists product_code text,
  add column if not exists origin_document_type text,
  add column if not exists origin_document_number text,
  add column if not exists origin_document_date date,
  add column if not exists marketplace_order_id text,
  add column if not exists reason text,
  add column if not exists agent text,
  add column if not exists payment text,
  add column if not exists context_source_row_ids bigint[] not null default '{}',
  add constraint returns_product_identity_check
    check (nullif(trim(sku), '') is not null or nullif(trim(product_code), '') is not null);

drop index if exists public.returns_lookup_idx;
create index returns_lookup_idx
  on public.returns(document_type, document_number, document_date, product_code);

alter table public.anomalies drop constraint if exists anomalies_code_check;
alter table public.anomalies add constraint anomalies_code_check check (code in (
  'PROVENANCE_MISSING', 'DUPLICATE', 'MISSING_COST',
  'UNLINKED_ORDER', 'UNCLASSIFIED_MOVEMENT',
  'MISSING_CARRIER', 'AMBIGUOUS_CARRIER', 'UNLINKED_RETURN',
  'INVALID_SOURCE_ROW'
));

-- I valori iniziali di sistema non appartengono a un utente applicativo.
alter table public.parameters alter column created_by drop not null;

insert into public.parameters (key, scope, valid_from, valid_to, value, unit, note, created_by) values
  ('shipping_dhl', 'global', '2026-01-01', '2026-07-01', 15.50, 'EUR_PER_ORDER', 'DHL fino al 30 giugno 2026', null),
  ('shipping_dhl', 'global', '2026-07-01', null, 15.00, 'EUR_PER_ORDER', 'DHL dal 1 luglio 2026', null),
  ('shipping_gls', 'global', '2026-01-01', null, 7.50, 'EUR_PER_ORDER', 'GLS', null),
  ('investor_fee', 'global', '2026-01-01', '2026-02-01', 0, 'PERCENT_OF_SALES', 'Investor Fee 0 percento a gennaio 2026', null),
  ('investor_fee', 'global', '2026-02-01', null, 0.01, 'PERCENT_OF_SALES', 'Investor Fee 1 percento dal 1 febbraio 2026', null),
  ('storfund_fee', 'global', '2026-01-01', '2026-08-01', 0.012, 'PERCENT_OF_SALES', 'Storfund Fee 1,2 percento fino al 31 luglio 2026', null),
  ('storfund_fee', 'global', '2026-08-01', null, 0, 'PERCENT_OF_SALES', 'Storfund Fee inattiva dal 1 agosto 2026', null),
  ('fx_sek', 'global', '2026-01-01', null, 0.09, 'EUR_PER_CURRENCY_UNIT', 'Forfait fisso SEK', null);

comment on column public.cost_entries.product_code is 'Codice prodotto interno Ready, distinto dallo SKU Back Market.';
comment on column public.import_rows.raw_data is 'Payload sorgente consentito: per export ordini esclude dati personali.';

commit;
