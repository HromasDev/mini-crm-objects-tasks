create or replace function public.enforce_task_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor    uuid := auth.uid();
  v_role     public.app_role;
  v_assignee boolean;
  v_comment  text;
  v_in_rpc   boolean;
  v_allowed  boolean;
begin
  if v_actor is null then
    raise exception 'Требуется авторизация';
  end if;

  select p.role into v_role from public.profiles p where p.id = v_actor;
  if v_role is null then
    raise exception 'Профиль пользователя не найден';
  end if;

  v_assignee := new.assignee_id is not null and new.assignee_id = v_actor;
  v_in_rpc := coalesce(current_setting('app.in_transition', true) = 'on', false);
  v_comment := nullif(btrim(coalesce(current_setting('app.transition_comment', true), '')), '');

  new.updated_at := now();

  if new.status = old.status then
    if v_role <> 'manager' then
      raise exception 'Редактировать задачу может только постановщик';
    end if;
    return new;
  end if;

  if not v_in_rpc then
    raise exception 'Смену статуса выполняйте действием над задачей (RPC transition_task): прямое изменение поля status запрещено';
  end if;

  v_allowed :=
       old.status = 'Новая'        and new.status = 'В работе'      and v_assignee
    or old.status = 'В работе'     and new.status = 'На проверке'   and v_assignee
    or old.status = 'На проверке'  and new.status = 'Принята'       and v_role = 'manager'
    or old.status = 'На проверке'  and new.status = 'На доработке'  and v_role = 'manager' and v_comment is not null
    or old.status = 'На доработке' and new.status = 'В работе'      and v_assignee;

  if not v_allowed then
    if old.status = 'На проверке' and new.status = 'На доработке' and v_role = 'manager' then
      raise exception 'При возврате на доработку комментарий обязателен';
    end if;
    raise exception 'Переход «%» → «%» запрещён', old.status, new.status;
  end if;

  insert into public.task_status_history (task_id, changed_by, from_status, to_status, comment)
  values (new.id, v_actor, old.status, new.status, v_comment);

  return new;
end;
$$;

create or replace function public.enforce_task_assignee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.assignee_id is not null and not exists (
    select 1 from public.profiles p
    where p.id = new.assignee_id and p.role = 'worker'
  ) then
    raise exception 'Исполнителем задачи может быть только пользователь с ролью worker';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tasks_enforce_assignee on public.tasks;
create trigger trg_tasks_enforce_assignee
  before insert or update of assignee_id on public.tasks
  for each row execute function public.enforce_task_assignee();
