begin;

-- I ricalcoli locali sono avviati dal processo operatore, non da un utente auth.
alter table public.calculation_runs alter column requested_by drop not null;

-- La data vendita autorevole e la prima sales Invoice positiva, non la data Ready.
update public.orders o
set sold_at = sales.first_sale::timestamptz
from (
  select order_id, min(value_date) as first_sale
  from public.invoice_movements
  where movement_type = 'sales' and amount > 0 and order_id is not null
  group by order_id
) sales
where sales.order_id = o.id;

create or replace view public.report_daily with (security_invoker = true) as
select
  run_id,
  result_date,
  sum(amount_eur) filter (where component = 'revenue' and status <> 'suspended') as revenue_eur,
  sum(amount_eur) filter (where component = 'margin' and status <> 'suspended') as margin_eur,
  count(distinct order_id) filter (where order_id is not null and status <> 'suspended') as order_count,
  count(distinct order_id) filter (where status = 'suspended') as suspended_count
from public.margin_results
where result_type = 'sales'
group by run_id, result_date;

create or replace view public.report_monthly with (security_invoker = true) as
select
  run_id,
  date_trunc('month', result_date)::date as month,
  sum(amount_eur) filter (where component = 'revenue' and status <> 'suspended') as revenue_eur,
  sum(amount_eur) filter (where component = 'margin' and status <> 'suspended') as margin_eur,
  count(distinct order_id) filter (where order_id is not null and status <> 'suspended') as order_count,
  count(distinct order_id) filter (where status = 'suspended') as suspended_count
from public.margin_results
where result_type = 'sales'
group by run_id, date_trunc('month', result_date)::date;

create or replace function public.save_calculation_run(
  p_engine_version text,
  p_rules_hash text,
  p_period_start date,
  p_period_end date,
  p_input_batch_ids jsonb,
  p_parameter_values jsonb,
  p_coverage jsonb,
  p_results jsonb,
  p_anomalies jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_id uuid;
begin
  if p_rules_hash !~ '^[0-9a-f]{64}$' then raise exception 'INVALID_RULES_HASH'; end if;
  if jsonb_typeof(p_results) <> 'array' then raise exception 'INVALID_RESULTS'; end if;
  if jsonb_typeof(p_anomalies) <> 'array' then raise exception 'INVALID_ANOMALIES'; end if;

  update public.orders o
  set sold_at = sales.first_sale::timestamptz
  from (
    select order_id, min(value_date) as first_sale
    from public.invoice_movements
    where movement_type = 'sales' and amount > 0 and order_id is not null
    group by order_id
  ) sales
  where sales.order_id = o.id;

  insert into public.calculation_runs (
    engine_version, rules_hash, period_start, period_end, status,
    input_batch_ids, parameter_values, coverage, requested_by, completed_at
  ) values (
    p_engine_version, p_rules_hash, p_period_start, p_period_end, 'complete',
    coalesce((select array_agg(value::uuid) from jsonb_array_elements_text(p_input_batch_ids)), '{}'::uuid[]),
    p_parameter_values, p_coverage, auth.uid(), now()
  ) returning id into v_run_id;

  insert into public.margin_results (
    run_id, result_type, result_date, order_id, component,
    economic_category, amount_eur, status, source_refs, details
  )
  select
    v_run_id,
    item->>'resultType',
    (item->>'resultDate')::date,
    nullif(item->>'orderId', '')::uuid,
    item->>'component',
    nullif(item->>'economicCategory', ''),
    nullif(item->>'amountEur', '')::numeric,
    item->>'status',
    coalesce(item->'sourceRefs', '[]'::jsonb),
    coalesce(item->'details', '{}'::jsonb)
  from jsonb_array_elements(p_results) item;

  update public.anomalies
  set resolved_at = now(), resolution_note = 'Non presente nell ultimo ricalcolo'
  where code in ('MISSING_COST', 'MISSING_CARRIER', 'AMBIGUOUS_CARRIER')
    and resolved_at is null;

  insert into public.anomalies (
    anomaly_key, severity, entity_type, entity_id, code, message, details
  )
  select
    item->>'anomalyKey', item->>'severity', item->>'entityType',
    item->>'entityId', item->>'code', item->>'message',
    coalesce(item->'details', '{}'::jsonb)
  from jsonb_array_elements(p_anomalies) item
  on conflict (anomaly_key) do update set
    severity = excluded.severity,
    code = excluded.code,
    message = excluded.message,
    details = excluded.details,
    resolved_at = null,
    resolution_note = null;

  return v_run_id;
end;
$$;

revoke all on function public.save_calculation_run(text, text, date, date, jsonb, jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_calculation_run(text, text, date, date, jsonb, jsonb, jsonb, jsonb, jsonb)
  to service_role;

comment on function public.save_calculation_run(text, text, date, date, jsonb, jsonb, jsonb, jsonb, jsonb)
  is 'Salva atomicamente un ricalcolo locale completo, risultati e anomalie economiche.';

commit;
