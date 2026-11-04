-- ============================================================================
-- Демо-данные: роли, 3 объекта, 7 задач во всех статусах, реальная история.
-- ЗАПУСКАТЬ ПОСЛЕ: 0001_init.sql, 0002_rls.sql и создания пользователей
-- в Authentication (README, шаг 3).
--
-- Если ваши email отличаются — замените их в разделе 1 ниже.
-- Повторный запуск создаст дубликаты объектов/задач: перед повтором удалите
-- демо-объекты.
--
-- Скрипт эмулирует вход пользователей (request.jwt.claims) и переводит статусы
-- тем же RPC transition_task, что и интерфейс, — поэтому история в демо-базе
-- создана настоящими проверенными переходами, а не «нарисована» вручную.
-- ============================================================================

-- -----------------------------------------------------------------------------
-- 1. Имена и роли пользователей
-- -----------------------------------------------------------------------------
update public.profiles set full_name = 'Анна Руководитель', role = 'manager'
where email = 'manager@crm.test';

update public.profiles set full_name = 'Иван Петров'
where email = 'worker1@crm.test';

update public.profiles set full_name = 'Мария Сидорова'
where email = 'worker2@crm.test';

-- -----------------------------------------------------------------------------
-- 2. Проверка готовности
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from public.profiles where email = 'manager@crm.test')
     or not exists (select 1 from public.profiles where email = 'worker1@crm.test')
     or not exists (select 1 from public.profiles where email = 'worker2@crm.test') then
    raise exception
      'Пользователи не найдены. Сначала создайте manager@crm.test, worker1@crm.test, worker2@crm.test в Authentication (README, шаг 3) — или замените email в начале этого скрипта.';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Объекты
-- -----------------------------------------------------------------------------
insert into public.objects (name, address, created_by, created_at)
values
  ('ЖК «Северный», корпус 2', 'г. Москва, ул. Полярная, 12',
     (select id from public.profiles where email = 'manager@crm.test'),
     now() - interval '14 days'),
  ('Бизнес-центр «Меридиан»', 'г. Москва, Дмитровское шоссе, 89',
     (select id from public.profiles where email = 'manager@crm.test'),
     now() - interval '9 days'),
  ('Склад «Логистик-Парк»', 'г. Химки, ул. Заводская, 3',
     (select id from public.profiles where email = 'manager@crm.test'),
     now() - interval '4 days');

-- -----------------------------------------------------------------------------
-- 4. Задачи и история (переводы — через тот же RPC, что и интерфейс)
-- -----------------------------------------------------------------------------
do $$
declare
  m  uuid;
  w1 uuid;
  w2 uuid;
  o1 uuid;
  o2 uuid;
  o3 uuid;
  t  uuid;
begin
  select id into m  from public.profiles where email = 'manager@crm.test';
  select id into w1 from public.profiles where email = 'worker1@crm.test';
  select id into w2 from public.profiles where email = 'worker2@crm.test';

  select id into o1 from public.objects where name = 'ЖК «Северный», корпус 2';
  select id into o2 from public.objects where name = 'Бизнес-центр «Меридиан»';
  select id into o3 from public.objects where name = 'Склад «Логистик-Парк»';

  -- ======================= Объект 1: ЖК «Северный», корпус 2 ================

  -- Задача 1: «Новая», исполнитель — Иван.
  insert into public.tasks
    (object_id, title, description, assignee_id, status, author_id, created_at, updated_at)
  values
    (o1, 'Монтаж электрощитовой на 3 этаже',
     'Собрать и подключить щитовую по проекту ЭС-12. По готовности приложить фото в задачу.',
     w1, 'Новая', m, now() - interval '2 days', now() - interval '2 days');

  -- Задача 2: «В работе», исполнитель — Иван.
  -- История: Новая → В работе.
  insert into public.tasks
    (object_id, title, description, assignee_id, status, author_id, created_at, updated_at)
  values
    (o1, 'Заливка фундамента, секция А4',
     'Армирование и заливка по графику работ. Температуру бетона фиксировать в журнале.',
     w1, 'Новая', m, now() - interval '3 days', now() - interval '3 days')
  returning id into t;

  perform set_config('request.jwt.claims', json_build_object('sub', w1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', w1::text, true);
  perform public.transition_task(t, 'В работе');

  -- Задача 3: «На доработке», исполнитель — Мария.
  -- История: Новая → В работе → На проверке → На доработке (с комментарием).
  insert into public.tasks
    (object_id, title, description, assignee_id, status, author_id, created_at, updated_at)
  values
    (o1, 'Установка оконных блоков, секция Б',
     'Монтаж по осям 4–9, проверка уровней по проекту АР-7.',
     w2, 'Новая', m, now() - interval '5 days', now() - interval '1 day')
  returning id into t;

  perform set_config('request.jwt.claims', json_build_object('sub', w2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', w2::text, true);
  perform public.transition_task(t, 'В работе');
  perform public.transition_task(t, 'На проверке');

  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', m::text, true);
  perform public.transition_task(t, 'На доработке',
    'Окна по осям 4–6 установлены не по уровню. Переделать и приложить фото.');

  -- Задача 4: «Принята», исполнитель — Мария.
  -- История: Новая → В работе → На проверке → Принята.
  insert into public.tasks
    (object_id, title, description, assignee_id, status, author_id, created_at, updated_at)
  values
    (o1, 'Демонтаж временного ограждения',
     'Выполняется после приёмки работ смежной бригады.',
     w2, 'Новая', m, now() - interval '6 days', now() - interval '1 day')
  returning id into t;

  perform set_config('request.jwt.claims', json_build_object('sub', w2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', w2::text, true);
  perform public.transition_task(t, 'В работе');
  perform public.transition_task(t, 'На проверке');

  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', m::text, true);
  perform public.transition_task(t, 'Принята');

  -- ======================= Объект 2: Бизнес-центр «Меридиан» ================

  -- Задача 5: «На проверке», исполнитель — Иван.
  -- История: Новая → В работе → На проверке.
  insert into public.tasks
    (object_id, title, description, assignee_id, status, author_id, created_at, updated_at)
  values
    (o2, 'Монтаж кровельной мембраны',
     'Участок Б, уклонообразующий слой готов. Швы проклеить по инструкции производителя.',
     w1, 'Новая', m, now() - interval '4 days', now() - interval '2 days')
  returning id into t;

  perform set_config('request.jwt.claims', json_build_object('sub', w1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', w1::text, true);
  perform public.transition_task(t, 'В работе');
  perform public.transition_task(t, 'На проверке');

  -- Задача 6: «Новая», исполнитель — Мария.
  insert into public.tasks
    (object_id, title, description, assignee_id, status, author_id, created_at, updated_at)
  values
    (o2, 'Монтаж внутренних перегородок, 2 этаж',
     'По разметке из проекта ПР-2. Материалы на площадке.',
     w2, 'Новая', m, now() - interval '1 day', now() - interval '1 day');

  -- ======================= Объект 3: Склад «Логистик-Парк» ==================

  -- Задача 7: «Новая», исполнитель — Иван.
  insert into public.tasks
    (object_id, title, description, assignee_id, status, author_id, created_at, updated_at)
  values
    (o3, 'Разметка складских зон',
     'По схеме зонирования от логистики. Краска в зоне Т-2.',
     w1, 'Новая', m, now() - interval '1 day', now() - interval '1 day');
end;
$$;
