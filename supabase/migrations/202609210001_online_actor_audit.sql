begin;

-- Le RPC legacy usano service_role e quindi auth.uid() nullo. Questa coppia
-- registra l'operatore verificato dalla Edge Function senza cambiare il flusso locale.
create function public.confirm_import_batch_online(
  p_source text, p_source_name text, p_content_sha256 text,
  p_summary jsonb, p_rows jsonb, p_actor uuid
)
returns table (batch_id uuid, inserted boolean)
language plpgsql security definer set search_path = public
as $$
declare v_result record;
begin
  if not exists (select 1 from public.app_users where user_id = p_actor and enabled and role in ('operator', 'admin')) then
    raise exception 'OPERATOR_REQUIRED';
  end if;
  select * into v_result from public.confirm_import_batch(p_source, p_source_name, p_content_sha256, p_summary, p_rows);
  if v_result.inserted then update public.import_batches set created_by = p_actor where id = v_result.batch_id; end if;
  return query select v_result.batch_id, v_result.inserted;
end;
$$;

create function public.save_calculation_run_online(
  p_engine_version text, p_rules_hash text, p_period_start date, p_period_end date,
  p_input_batch_ids jsonb, p_parameter_values jsonb, p_coverage jsonb,
  p_results jsonb, p_anomalies jsonb, p_actor uuid
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_run_id uuid;
begin
  if not exists (select 1 from public.app_users where user_id = p_actor and enabled and role in ('operator', 'admin')) then
    raise exception 'OPERATOR_REQUIRED';
  end if;
  v_run_id := public.save_calculation_run(p_engine_version, p_rules_hash, p_period_start, p_period_end,
    p_input_batch_ids, p_parameter_values, p_coverage, p_results, p_anomalies);
  update public.calculation_runs set requested_by = p_actor where id = v_run_id;
  return v_run_id;
end;
$$;

revoke all on function public.confirm_import_batch_online(text,text,text,jsonb,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.confirm_import_batch_online(text,text,text,jsonb,jsonb,uuid) to service_role;
revoke all on function public.save_calculation_run_online(text,text,date,date,jsonb,jsonb,jsonb,jsonb,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.save_calculation_run_online(text,text,date,date,jsonb,jsonb,jsonb,jsonb,jsonb,uuid) to service_role;

commit;
