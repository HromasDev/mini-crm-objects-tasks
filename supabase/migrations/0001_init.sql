-- ============================================================================
-- Мини-CRM «Объекты и задачи» — миграция 1/2: схема, функции, триггеры.
-- Запускается в Supabase SQL Editor ДО 0002_rls.sql (на пустой проект).
--
-- Здесь же — единая точка проверки правил задач (триггер enforce_task_rules):
-- он срабатывает при ЛЮБОМ обновлении таблицы tasks, в том числе при прямых
-- запросах к Supabase в обход интерфейса.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Справочники
-- ---------------------------------------------------------------------------
-- Роль пользователя: постановщик (manager) или исполнитель (worker).
create type public.app_role as enum ('manager', 'worker');

-- Статусы задач — значения совпадают с формулировками ТЗ.
create type public.task_status as enum (
  'Новая', 'В работе', 'На проверке', 'Принята', 'На доработке'
);

-- ---------------------------------------------------------------------------
-- 2. Таблицы
-- ---------------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  full_name  text not null,
  role       public.app_role not null default 'worker',
  created_at timestamptz not null default now()
);

create table public.objects (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  address    text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint objects_created_by_fk
    foreign key (created_by) references public.profiles (id) on delete set null
);

create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  object_id   uuid not null,
  title       text not null,
  description text,
  assignee_id uuid,
  status      public.task_status not null default 'Новая',
  author_id   uuid not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint tasks_object_fk
    foreign key (object_id) references public.objects (id) on delete cascade,
  constraint tasks_assignee_fk
    foreign key (assignee_id) references public.profiles (id) on delete set null,
  constraint tasks_author_fk
    foreign key (author_id) references public.profiles (id) on delete restrict
);

-- Журнал смены статусов. Записи создают ТОЛЬКО триггеры базы;
-- права на запись у клиентов отозваны (см. 0002_rls.sql).
create table public.task_status_history (
  id          bigint generated always as identity primary key,
  task_id     uuid not null,
  changed_by  uuid,
  from_status public.task_status,
  to_status   public.task_status not null,
  comment     text,
  changed_at  timestamptz not null default now(),
  constraint task_status_history_task_fk
    foreign key (task_id) references public.tasks (id) on delete cascade,
  constraint task_status_history_changed_by_fk
    foreign key (changed_by) references public.profiles (id) on delete set null
);

create index tasks_object_idx   on public.tasks (object_id);
create index tasks_assignee_idx on public.tasks (assignee_id);
create index history_task_idx   on public.task_status_history (task_id);

-- ---------------------------------------------------------------------------
-- 3. Роль текущего пользователя
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER, чтобы политики RLS читали роль независимо от прав на
-- profiles и не зацикливались. Для неавторизованных возвращает NULL.
create or replace function public.my_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select p.role from public.profiles p where p.id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- 4. Автосоздание профиля при создании пользователя в Supabase Auth
--    (пользователей создаём вручную в панели: открытая регистрация выключена).
--    Роль по умолчанию — исполнитель; руководителю роль назначает seed.sql.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    'worker'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 5. Правила задач — ЕДИНАЯ точка проверки.
-- ---------------------------------------------------------------------------
-- Правила:
--   * редактировать поля задачи (название/описание/исполнитель) может только
--     постановщик;
--   * статус меняется ТОЛЬКО через RPC public.transition_task — прямое
--     изменение поля status через API запрещено даже постановщику;
--   * допустимые переходы и права (всё остальное запрещено):
--       Новая        → В работе      назначенный исполнитель
--       В работе     → На проверке   назначенный исполнитель
--       На проверке  → Принята       постановщик
--       На проверке  → На доработке  постановщик, комментарий обязателен
--       На доработке → В работе      назначенный исполнитель
--   * каждая смена статуса пишется в историю: кто/когда/откуда/куда/комментарий.
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

  -- RPC transition_task помечает транзакцию флагом и передаёт комментарий.
  v_in_rpc  := current_setting('app.in_transition', true) = 'on';
  v_comment := nullif(btrim(coalesce(current_setting('app.transition_comment', true), '')), '');

  new.updated_at := now();

  if new.status = old.status then
    -- Обычное редактирование полей, без смены статуса.
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

  -- Историю пишет только база; клиентские INSERT/UPDATE/DELETE закрыты.
  insert into public.task_status_history (task_id, changed_by, from_status, to_status, comment)
  values (new.id, v_actor, old.status, new.status, v_comment);

  return new;
end;
$$;

drop trigger if exists trg_tasks_enforce_rules on public.tasks;
create trigger trg_tasks_enforce_rules
  before update on public.tasks
  for each row execute function public.enforce_task_rules();

-- Создание задачи: первая строка истории «— → Новая».
create or replace function public.log_task_creation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.task_status_history (task_id, changed_by, from_status, to_status, changed_at)
  values (new.id, new.author_id, null, new.status, new.created_at);
  return new;
end;
$$;

drop trigger if exists trg_tasks_log_creation on public.tasks;
create trigger trg_tasks_log_creation
  after insert on public.tasks
  for each row execute function public.log_task_creation();

-- ---------------------------------------------------------------------------
-- 6. RPC — единственная точка смены статуса задачи.
--    Все проверки выполняет триггер enforce_task_rules; функция лишь помечает
--    транзакцию флагом и передаёт комментарий. SECURITY DEFINER нужен, чтобы
--    исполнитель (у которого нет прямого UPDATE на tasks по RLS) мог выполнять
--    разрешённые переходы над собственными задачами под контролем правил.
-- ---------------------------------------------------------------------------
create or replace function public.transition_task(
  p_task_id   uuid,
  p_to_status public.task_status,
  p_comment   text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Требуется авторизация';
  end if;

  perform set_config('app.in_transition', 'on', true);
  perform set_config('app.transition_comment', coalesce(p_comment, ''), true);

  update public.tasks set status = p_to_status where id = p_task_id;

  if not found then
    raise exception 'Задача не найдена';
  end if;
end;
$$;

revoke all on function public.transition_task(uuid, public.task_status, text) from PUBLIC;
revoke all on function public.transition_task(uuid, public.task_status, text) from anon;
grant execute on function public.transition_task(uuid, public.task_status, text) to authenticated;

comment on table public.task_status_history is
  'Журнал смены статусов задач. Только чтение через API; записи создают триггеры.';
comment on function public.transition_task is
  'Единственная точка смены статуса задачи. Правила проверяет триггер enforce_task_rules.';
