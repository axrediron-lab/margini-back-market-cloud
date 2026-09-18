begin;

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

-- Ruoli minimi: consultazione, importazione, configurazione.
create table public.app_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('viewer', 'operator', 'admin')),
  enabled boolean not null default true
);

create or replace function public.app_role()
returns text language sql stable security definer set search_path = public
as $$ select role from public.app_users where user_id = auth.uid() and enabled $$;

-- Contiene anche file/hash e l'audit leggero dell'importazione.
create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('invoice', 'orders', 'ready_sales', 'purchases', 'ready_returns')),
  status text not null default 'preview' check (status in ('preview', 'valid', 'imported', 'failed')),
  source_name text not null,
  source_locator text,
  source_range text,
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  mapping_version text not null default 'v1',
  row_count integer not null default 0 check (row_count >= 0),
  valid_count integer not null default 0 check (valid_count >= 0),
  error_count integer not null default 0 check (error_count >= 0),
  summary jsonb not null default '{}'::jsonb,
  error_message text,
  supersedes_batch_id uuid references public.import_batches(id),
  is_active boolean not null default false,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unique (source, content_sha256),
  check (valid_count + error_count <= row_count),
  check (status <> 'imported' or confirmed_at is not null)
);

create table public.import_rows (
  id bigint generated always as identity primary key,
  batch_id uuid not null references public.import_batches(id) on delete restrict,
  row_number integer not null check (row_number > 0),
  raw_data jsonb not null,
  row_hash text not null check (row_hash ~ '^[0-9a-f]{64}$'),
  errors jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  unique (batch_id, row_number)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  marketplace_order_id text not null unique,
  sold_at timestamptz,
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  source_row_id bigint references public.import_rows(id),
  provisional boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  source_row_id bigint references public.import_rows(id),
  line_key text,
  sku text not null,
  description text,
  quantity numeric(14,4) not null check (quantity > 0),
  unit_price numeric(16,4),
  ready_purchase_price numeric(16,4),
  ready_fifo_cost numeric(16,4),
  unique nulls not distinct (order_id, line_key, sku)
);

-- Solo questa tabella contiene movimenti economici sorgente e deriva dalle Invoice.
create table public.invoice_movements (
  id uuid primary key default gen_random_uuid(),
  source_row_id bigint not null unique references public.import_rows(id),
  movement_key text,
  order_id uuid references public.orders(id),
  movement_type text not null,
  value_date date not null,
  amount numeric(16,4) not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  amount_eur numeric(16,4),
  economic_category text check (economic_category is null or economic_category in (
    'revenue', 'product_cost', 'shipping', 'marketplace_fee', 'investor_fee',
    'storfund_fee', 'refund', 'recovery', 'backship', 'epr', 'subscription',
    'returned_product_value', 'other'
  )),
  financial_flow boolean not null default false,
  provisional boolean not null default true,
  unique nulls not distinct (movement_key)
);

create table public.cost_entries (
  id uuid primary key default gen_random_uuid(),
  source_row_id bigint not null references public.import_rows(id),
  sku text not null,
  cost_type text not null check (cost_type in ('purchase', 'ready_purchase_price', 'ready_fifo')),
  available_on date not null,
  quantity numeric(14,4) not null check (quantity > 0),
  unit_cost_eur numeric(16,4) not null check (unit_cost_eur > 0),
  unique (source_row_id, cost_type)
);

create table public.returns (
  id uuid primary key default gen_random_uuid(),
  source_row_id bigint not null unique references public.import_rows(id),
  document_type text not null,
  document_number text not null,
  document_date date not null,
  sku text not null,
  quantity numeric(14,4) not null check (quantity > 0),
  unit_price numeric(16,4) not null check (unit_price >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  verified_historical_value_eur numeric(16,4)
);

create table public.return_links (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.returns(id) on delete restrict,
  order_line_id uuid references public.order_lines(id) on delete restrict,
  status text not null check (status in ('candidate', 'linked', 'ambiguous', 'unmatched', 'rejected', 'manual')),
  checks jsonb not null default '{}'::jsonb,
  reason text,
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  unique nulls not distinct (return_id, order_line_id),
  check (status <> 'manual' or (decided_by is not null and length(trim(reason)) > 0))
);

-- Parametri economici e cambi nello stesso modello effective-dated.
create table public.parameters (
  id uuid primary key default gen_random_uuid(),
  key text not null check (key in ('shipping_dhl', 'shipping_gls', 'investor_fee', 'storfund_fee', 'fx_sek', 'fx_other')),
  scope text not null default 'global',
  valid_from date not null,
  valid_to date,
  value numeric(18,8) not null check (value >= 0),
  unit text not null check (unit in ('EUR_PER_ORDER', 'PERCENT_OF_SALES', 'EUR_PER_CURRENCY_UNIT')),
  note text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (valid_to is null or valid_to > valid_from),
  exclude using gist (key with =, scope with =, daterange(valid_from, valid_to, '[)') with &&)
);

create table public.anomalies (
  id uuid primary key default gen_random_uuid(),
  anomaly_key text not null unique,
  severity text not null check (severity in ('warning', 'blocking')),
  entity_type text not null,
  entity_id text not null,
  code text not null check (code in (
    'PROVENANCE_MISSING', 'DUPLICATE', 'MISSING_COST',
    'UNLINKED_ORDER', 'UNCLASSIFIED_MOVEMENT'
  )),
  message text not null,
  details jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now()
);

-- Versione motore, parametri usati e copertura restano leggibili in un solo run.
create table public.calculation_runs (
  id uuid primary key default gen_random_uuid(),
  engine_version text not null,
  rules_hash text not null check (rules_hash ~ '^[0-9a-f]{64}$'),
  period_start date not null,
  period_end date not null,
  status text not null check (status in ('running', 'complete', 'failed', 'published')),
  input_batch_ids uuid[] not null,
  parameter_values jsonb not null,
  coverage jsonb not null default '{}'::jsonb,
  requested_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  check (period_end >= period_start)
);

-- Una tabella per entrambe le viste: coorte vendita o data contabile.
create table public.margin_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.calculation_runs(id) on delete restrict,
  result_type text not null check (result_type in ('sales', 'company')),
  result_date date not null,
  order_id uuid references public.orders(id),
  component text not null,
  economic_category text check (economic_category is null or economic_category in (
    'revenue', 'product_cost', 'shipping', 'marketplace_fee', 'investor_fee',
    'storfund_fee', 'refund', 'recovery', 'backship', 'epr', 'subscription',
    'returned_product_value', 'other'
  )),
  amount_eur numeric(16,4),
  status text not null check (status in ('final', 'provisional', 'suspended')),
  source_refs jsonb not null default '[]'::jsonb,
  details jsonb not null default '{}'::jsonb,
  unique nulls not distinct (run_id, result_type, result_date, order_id, component)
);

create index invoice_order_date_idx on public.invoice_movements(order_id, value_date);
create index cost_lookup_idx on public.cost_entries(sku, available_on, cost_type);
create index returns_lookup_idx on public.returns(document_type, document_number, document_date, sku);
create index anomalies_open_idx on public.anomalies(severity, code) where resolved_at is null;
create index results_lookup_idx on public.margin_results(run_id, result_type, result_date, status);
create unique index one_active_import_per_source on public.import_batches(source) where is_active;

create view public.report_daily with (security_invoker = true) as
select
  run_id,
  result_date,
  sum(amount_eur) filter (where component = 'revenue') as revenue_eur,
  sum(amount_eur) filter (where component = 'margin') as margin_eur,
  count(distinct order_id) filter (where order_id is not null) as order_count,
  count(*) filter (where status = 'suspended') as suspended_count
from public.margin_results
where result_type = 'sales'
group by run_id, result_date;

create view public.report_monthly with (security_invoker = true) as
select
  run_id,
  date_trunc('month', result_date)::date as month,
  sum(amount_eur) filter (where component = 'revenue') as revenue_eur,
  sum(amount_eur) filter (where component = 'margin') as margin_eur,
  count(distinct order_id) filter (where order_id is not null) as order_count,
  count(*) filter (where status = 'suspended') as suspended_count
from public.margin_results
where result_type = 'sales'
group by run_id, date_trunc('month', result_date)::date;

alter table public.app_users enable row level security;
alter table public.import_batches enable row level security;
alter table public.import_rows enable row level security;
alter table public.orders enable row level security;
alter table public.order_lines enable row level security;
alter table public.invoice_movements enable row level security;
alter table public.cost_entries enable row level security;
alter table public.returns enable row level security;
alter table public.return_links enable row level security;
alter table public.parameters enable row level security;
alter table public.anomalies enable row level security;
alter table public.calculation_runs enable row level security;
alter table public.margin_results enable row level security;

-- Lettura per ogni utente abilitato. Nessun accesso anonimo.
do $$
declare t text;
begin
  foreach t in array array['app_users','import_batches','import_rows','orders','order_lines','invoice_movements','cost_entries','returns','return_links','parameters','anomalies','calculation_runs','margin_results'] loop
    execute format('create policy %I on public.%I for select using (public.app_role() in (''viewer'',''operator'',''admin''))', t || '_read', t);
  end loop;
end $$;

create policy batches_write on public.import_batches for all
  using (public.app_role() in ('operator','admin'))
  with check (public.app_role() in ('operator','admin') and created_by = auth.uid());
create policy rows_insert on public.import_rows for insert
  with check (public.app_role() in ('operator','admin'));
create policy links_write on public.return_links for all
  using (public.app_role() in ('operator','admin'))
  with check (public.app_role() in ('operator','admin'));
create policy parameters_admin on public.parameters for all
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');
create policy users_admin on public.app_users for all
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');

revoke all on all tables in schema public from anon;
grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;
grant select on public.report_daily, public.report_monthly to authenticated;
grant insert, update on public.import_batches to authenticated;
grant insert on public.import_rows to authenticated;
grant insert, update on public.return_links to authenticated;
grant insert, update, delete on public.parameters, public.app_users to authenticated;
grant execute on function public.app_role() to authenticated;

comment on table public.invoice_movements is 'Fonte economica: esclusivamente Invoice Back Market.';
comment on table public.cost_entries is 'Fonte operativa per il costo; non genera movimenti economici.';
comment on table public.import_rows is 'Raw con provenienza; i file operativi restano fuori dal repository.';

commit;
