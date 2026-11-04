-- ============================================================================
-- Мини-CRM «Объекты и задачи» — миграция 2/2: RLS-политики.
-- Права доступа закрыты на уровне базы: они работают даже при прямых
-- запросах к Supabase в обход интерфейса.
--
-- Принцип: у каждой таблицы перечислено, КТО и ЧТО видит/меняет. Всё, что не
-- разрешено политикой явно, запрещено по умолчанию (RLS включён везде).
-- ============================================================================

alter table public.profiles            enable row level security;
alter table public.objects             enable row level security;
alter table public.tasks               enable row level security;
alter table public.task_status_history enable row level security;

-- -----------------------------------------------------------------------------
-- profiles: состав команды виден всем вошедшим (имена и email нужны в карточках
-- задач и при выборе исполнителя). Менять профили и роли через API нельзя —
-- политик insert/update/delete нет; управление ролями только в панели Supabase.
-- -----------------------------------------------------------------------------
create policy profiles_select_authenticated
  on public.profiles for select to authenticated
  using (true);

-- -----------------------------------------------------------------------------
-- objects:
--   * постановщик видит всё и управляет всеми объектами;
--   * исполнитель видит только объекты, где у него есть хотя бы одна задача.
-- -----------------------------------------------------------------------------
create policy objects_select_manager
  on public.objects for select to authenticated
  using ((select public.my_role()) = 'manager');

create policy objects_select_worker
  on public.objects for select to authenticated
  using (
    exists (
      select 1 from public.tasks t
      where t.object_id = objects.id
        and t.assignee_id = auth.uid()
    )
  );

create policy objects_insert_manager
  on public.objects for insert to authenticated
  with check ((select public.my_role()) = 'manager');

create policy objects_update_manager
  on public.objects for update to authenticated
  using ((select public.my_role()) = 'manager')
  with check ((select public.my_role()) = 'manager');

create policy objects_delete_manager
  on public.objects for delete to authenticated
  using ((select public.my_role()) = 'manager');

-- -----------------------------------------------------------------------------
-- tasks:
--   * чтение: постановщик — все; исполнитель — только назначенные ему;
--   * создание: только постановщик, автор = сам пользователь, статус «Новая»;
--   * прямое обновление: только постановщик (смену статуса дополнительно
--     запрещает триггер — статус меняется только через RPC transition_task);
--   * у исполнителя НЕТ политики update: любое его прямое обновление задачи
--     отклоняется базой, даже по своим задачам;
--   * удаление: только постановщик.
-- -----------------------------------------------------------------------------
create policy tasks_select_manager
  on public.tasks for select to authenticated
  using ((select public.my_role()) = 'manager');

create policy tasks_select_worker
  on public.tasks for select to authenticated
  using (assignee_id = auth.uid());

create policy tasks_insert_manager
  on public.tasks for insert to authenticated
  with check (
    (select public.my_role()) = 'manager'
    and author_id = auth.uid()
    and status = 'Новая'
  );

create policy tasks_update_manager
  on public.tasks for update to authenticated
  using ((select public.my_role()) = 'manager')
  with check ((select public.my_role()) = 'manager');

create policy tasks_delete_manager
  on public.tasks for delete to authenticated
  using ((select public.my_role()) = 'manager');

-- -----------------------------------------------------------------------------
-- task_status_history: читать можно только записи по задачам, которые вам
-- видны. Запись (insert/update/delete) запрещена всем клиентам: политик нет
-- и права отозваны ниже. Журнал наполняют только триггеры базы — подделать
-- историю, дописать или удалить её через API невозможно.
-- -----------------------------------------------------------------------------
create policy history_select_manager
  on public.task_status_history for select to authenticated
  using ((select public.my_role()) = 'manager');

create policy history_select_worker
  on public.task_status_history for select to authenticated
  using (
    exists (
      select 1 from public.tasks t
      where t.id = task_status_history.task_id
        and t.assignee_id = auth.uid()
    )
  );

-- Дублирующая защита журнала: даже при ошибке в политиках у клиентов нет
-- прав записи на таблицу.
revoke insert, update, delete on table public.task_status_history from anon, authenticated;
