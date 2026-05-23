-- =============================================================================
--  Fix: History-Trigger müssen SECURITY DEFINER sein, damit sie RLS umgehen.
--
--  Sonst scheitert jeder INSERT/UPDATE auf damages/orders an der fehlenden
--  INSERT-Policy für damage_history / order_history — der Trigger versucht
--  ein Event einzufügen, hat aber nur die User-Rechte.
--
--  History-Inserts sind System-Logik (kein User darf sie direkt schreiben),
--  deshalb ist DEFINER die richtige Lösung statt einer offenen INSERT-Policy.
-- =============================================================================

-- damage_history-Logger
create or replace function public.tg_damage_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.damage_history(damage_id, event_type, payload, created_by)
      values (new.id, 'created', jsonb_build_object('status', new.status, 'priority', new.priority), new.created_by);
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      insert into public.damage_history(damage_id, event_type, payload, created_by)
        values (new.id, 'status_changed',
                jsonb_build_object('from', old.status, 'to', new.status), auth.uid());
    end if;
    if new.priority is distinct from old.priority then
      insert into public.damage_history(damage_id, event_type, payload, created_by)
        values (new.id, 'priority_changed',
                jsonb_build_object('from', old.priority, 'to', new.priority), auth.uid());
    end if;
    if new.category_id is distinct from old.category_id then
      insert into public.damage_history(damage_id, event_type, payload, created_by)
        values (new.id, 'category_changed',
                jsonb_build_object('from', old.category_id, 'to', new.category_id), auth.uid());
    end if;
    if new.address_resolved_at is distinct from old.address_resolved_at and new.address_resolved_at is not null then
      insert into public.damage_history(damage_id, event_type, payload, created_by)
        values (new.id, 'address_resolved',
                jsonb_build_object('street', new.address_street, 'city', new.address_city), auth.uid());
    end if;
  end if;
  return new;
end $$;

-- order_history-Logger
create or replace function public.tg_order_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_history(order_id, event_type, payload, created_by)
      values (new.id, 'created', jsonb_build_object('status', new.status), new.created_by);
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.order_history(order_id, event_type, payload, created_by)
      values (new.id, 'status_changed',
              jsonb_build_object('from', old.status, 'to', new.status), auth.uid());
  end if;
  return new;
end $$;
