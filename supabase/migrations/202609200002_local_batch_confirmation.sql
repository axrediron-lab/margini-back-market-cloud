begin;

-- L'operatore locale usa la service role soltanto lato server. In questo caso
-- created_by resta nullo: nessuna identita applicativa viene inventata.
alter table public.import_batches alter column created_by drop not null;
alter table public.import_rows
  add column if not exists normalized_data jsonb not null default '{}'::jsonb;

create or replace function public.confirm_import_batch(
  p_source text,
  p_source_name text,
  p_content_sha256 text,
  p_summary jsonb,
  p_rows jsonb
)
returns table (batch_id uuid, inserted boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_id uuid;
begin
  if p_source not in ('invoice', 'orders', 'ready_sales', 'purchases', 'ready_returns') then
    raise exception 'INVALID_SOURCE';
  end if;
  if p_content_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_CONTENT_HASH';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'INVALID_ROWS';
  end if;

  select id into v_batch_id
  from public.import_batches
  where source = p_source and content_sha256 = p_content_sha256;

  if v_batch_id is not null then
    return query select v_batch_id, false;
    return;
  end if;

  insert into public.import_batches (
    source, status, source_name, content_sha256, mapping_version,
    row_count, valid_count, error_count, summary, is_active,
    created_by, confirmed_at
  ) values (
    p_source, 'imported', p_source_name, p_content_sha256, 'v1',
    coalesce((p_summary->>'rowCount')::integer, 0),
    coalesce((p_summary->>'validCount')::integer, 0),
    coalesce((p_summary->>'errorCount')::integer, 0),
    p_summary, true, auth.uid(), now()
  ) returning id into v_batch_id;

  insert into public.import_rows (
    batch_id, row_number, raw_data, normalized_data,
    row_hash, errors, warnings
  )
  select
    v_batch_id,
    (item->>'rowNumber')::integer,
    coalesce(item->'rawData', '{}'::jsonb),
    case when jsonb_typeof(item->'normalizedData') = 'object'
      then item->'normalizedData' else '{}'::jsonb end,
    item->>'rowHash',
    coalesce(item->'errors', '[]'::jsonb),
    coalesce(item->'warnings', '[]'::jsonb)
  from jsonb_array_elements(p_rows) as item;

  return query select v_batch_id, true;
end;
$$;

revoke all on function public.confirm_import_batch(text, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.confirm_import_batch(text, text, text, jsonb, jsonb) to service_role;

comment on function public.confirm_import_batch(text, text, text, jsonb, jsonb)
  is 'Conferma atomica e idempotente di un batch gia validato dall operatore locale.';
comment on column public.import_rows.normalized_data
  is 'Riga normalizzata in staging; non equivale ancora a un risultato economico calcolato.';

commit;
