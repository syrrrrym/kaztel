-- Applied to the site database on 2026-10-30.
begin;
alter table public.items
  add column if not exists actual_date_from date,
  add column if not exists actual_deadline date;
comment on column public.items.date_from is 'Плановая дата начала пункта поручения';
comment on column public.items.deadline is 'Плановая дата окончания пункта поручения';
comment on column public.items.actual_date_from is 'Фактическая дата начала пункта поручения';
comment on column public.items.actual_deadline is 'Фактическая дата окончания пункта поручения';
notify pgrst, 'reload schema';
commit;

begin;
-- Authenticated employees can edit execution details, not item identity or ownership.
create or replace function public.guard_item_execution_update()
returns trigger language plpgsql set search_path = public
as $$
declare editable text[] := array['date_from','deadline','actual_date_from','actual_deadline','execution_notes','progress','last_by','last_at'];
begin
  if auth.uid() is not null then
    if not coalesce(public.is_admin(),false) and (to_jsonb(new) - editable) is distinct from (to_jsonb(old) - editable) then
      raise exception 'Только администратор может менять текст, номер и ответственного пункта.' using errcode = '42501';
    end if;
    new.last_by := auth.uid();
    new.last_at := now();
  end if;
  return new;
end;
$$;
create trigger guard_item_execution_update
before update on public.items for each row
execute function public.guard_item_execution_update();
alter policy update_items on public.items
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');
commit;
