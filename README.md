# Мини-CRM «Объекты и задачи»

CRM для строительной компании: руководитель (постановщик) заводит объекты — стройки,
создаёт внутри них задачи и назначает исполнителей. Исполнители видят свои задачи,
берут их в работу и отправляют на проверку. Каждая смена статуса пишется в журнал,
который нельзя изменить через API.

**Стек:** React 18 + TypeScript + Vite, Ant Design 5, Supabase (Postgres + Auth).
Вся логика доступа и правила смены статусов живут на стороне базы: RLS-политики,
триггеры и одна RPC-функция. Приложение — тонкий клиент над безопасной схемой.

## Возможности

- вход по email и паролю (Supabase Auth, открытая регистрация отключена);
- две роли: постановщик и исполнитель (может быть несколько каждого);
- объекты, задачи, цикл статусов по ТЗ, история переходов с комментариями;
- интерфейс показывает только действия, доступные текущему пользователю в текущем статусе;
- «Мои задачи» для исполнителя;
- права доступа и переходы проверяются базой — в обход интерфейса не обходятся.

## Демо-доступы (впишите после настройки Supabase)

| Роль | Email | Пароль |
|---|---|---|
| Постановщик | `manager@crm.test` | ⋯ |
| Исполнитель | `worker1@crm.test` | ⋯ |
| Исполнитель | `worker2@crm.test` | ⋯ |

## Локальный запуск

```bash
npm install
cp .env.example .env   # подставить URL и anon-ключ из Supabase (шаг 6 ниже)
npm run dev
```

## Настройка Supabase с нуля (~10 минут)

1. **Проект.** [supabase.com](https://supabase.com) → New project (бесплатный тариф).
2. **Схема.** SQL Editor → New query → вставить содержимое
   `supabase/migrations/0001_init.sql` → Run. Затем так же `supabase/migrations/0002_rls.sql`.
3. **Пользователи.** Authentication → Users → Add user: создать три записи
   с галочкой **Auto Confirm User** — `manager@crm.test`, `worker1@crm.test`,
   `worker2@crm.test` и паролями. Профиль каждому создаст триггер автоматически.
4. **Роли и демо-данные.** SQL Editor → `supabase/seed.sql` → Run
   (если email отличаются — замените их в начале скрипта). Результат:
   менеджеру назначена роль постановщика, 3 объекта, 7 задач во всех статусах
   с настоящей историей переходов.
5. **Закрыть регистрацию.** Authentication → Providers → Email → выключить
   переключатель «Allow new users to sign up».
6. **Ключи.** Project Settings → **Data API** → скопировать **Project URL**;
   Project Settings → **API Keys** → скопировать **Publishable key** → оба значения в `.env`.
   (В новых проектах ключи называются publishable/secret — publishable и есть
   публичный ключ, аналог старого anon. В старых проектах это anon public.)

> **Secret keys / service_role не используются нигде**: они не нужны фронтенду и
> не должны попадать в код или репозиторий. Publishable-ключ безопасен по дизайну —
> без JWT пользователя база через RLS не отдаст ни одной строки.

## Деплой (Vercel, ~5 минут)

1. Запушить репозиторий на GitHub.
2. Vercel → Add New Project → импортировать репозиторий (Vite определится сам).
3. Environment Variables: `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY`.
4. Deploy. SPA-роуты настроены: `vercel.json` (для Netlify — `public/_redirects`).

## Как устроена безопасность

| Требование | Реализация |
|---|---|
| Права закрыты на уровне базы | RLS включён на всех 4 таблицах; политики в `supabase/migrations/0002_rls.sql` |
| Исполнитель видит только своё | SELECT-политики: задачи — `assignee_id = auth.uid()`, объекты — только где у него есть задачи; постановщик видит всё |
| Исполнитель не меняет чужое и не меняет ничего напрямую | У исполнителя нет INSERT/UPDATE/DELETE-политик на `tasks` и `objects`: любая попытка отклоняется базой |
| Переходы статусов проверяет база | Триггер `enforce_task_rules` (`0001_init.sql`) содержит матрицу переходов и проверяет роль/исполнителя; прямая смена поля `status` через API запрещена, смена — только через RPC `transition_task` |
| Комментарий обязателен на «На доработке» | Триггер отклоняет переход без комментария (комментарий передаётся внутри RPC, транзакционно) |
| Историю нельзя подделать | У `task_status_history` только SELECT-политики; INSERT/UPDATE/DELETE отозваны (`REVOKE`) и запрещены RLS; записи создаёт SECURITY DEFINER-триггер |
| Регистрация отключена | Провайдер Email без самостоятельной регистрации; профили и роли — только через панель Supabase |
| Секреты не утекают | Во фронтенде только URL + anon-ключ; `.env` в `.gitignore`, `service_role` отсутствует в коде |

## Как убедиться, что защита работает (2 минуты, без интерфейса)

```bash
# 1. Токен исполнителя
curl -s "https://ВАШ-ПРОЕКТ.supabase.co/auth/v1/token?grant_type=password" \
  -H "apikey: ПУБЛИЧНЫЙ_КЛЮЧ_publishable_или_anon" -H "Content-Type: application/json" \
  -d '{"email":"worker1@crm.test","password":"ПАРОЛЬ"}'
# → скопировать access_token из ответа

# 2. Исполнитель запрашивает ВСЕ задачи — RLS вернёт только назначенные ему
curl -s "https://ВАШ-ПРОЕКТ.supabase.co/rest/v1/tasks?select=id,title,status,assignee_id" \
  -H "apikey: ПУБЛИЧНЫЙ_КЛЮЧ_publishable_или_anon" -H "Authorization: Bearer ТОКЕН_ИСПОЛНИТЕЛЯ"

# 3. Исполнитель пытается «принять» свою задачу — запрещённый переход
curl -s -X POST "https://ВАШ-ПРОЕКТ.supabase.co/rest/v1/rpc/transition_task" \
  -H "apikey: ПУБЛИЧНЫЙ_КЛЮЧ_publishable_или_anon" -H "Authorization: Bearer ТОКЕН_ИСПОЛНИТЕЛЯ" \
  -H "Content-Type: application/json" \
  -d '{"p_task_id":"ID_ЗАДАЧИ_НА_ПРОВЕРКЕ","p_to_status":"Принята"}'
# → {"code":"P0001","message":"Переход «На проверке» → «Принята» запрещён", ...}

# 4. Прямая смена статуса через API — запрещена даже постановщику
curl -s -X PATCH "https://ВАШ-ПРОЕКТ.supabase.co/rest/v1/tasks?id=eq.ID_ЗАДАЧИ" \
  -H "apikey: ПУБЛИЧНЫЙ_КЛЮЧ_publishable_или_anon" -H "Authorization: Bearer ТОКЕН_ПОСТАНОВЩИКА" \
  -H "Content-Type: application/json" \
  -d '{"status":"Принята"}'
# → "Смену статуса выполняйте действием над задачей (RPC transition_task)..."

# 5. Попытка дописать историю — RLS + отсутствие прав
curl -s -X POST "https://ВАШ-ПРОЕКТ.supabase.co/rest/v1/task_status_history" \
  -H "apikey: ПУБЛИЧНЫЙ_КЛЮЧ_publishable_или_anon" -H "Authorization: Bearer ЛЮБОЙ_ТОКЕН" \
  -H "Content-Type: application/json" \
  -d '{"task_id":"ID","to_status":"Принята"}'
# → 403: new row violates row-level security policy / permission denied
```

## Структура репозитория

```
supabase/migrations/0001_init.sql  — таблицы, функции, триггеры (матрица переходов)
supabase/migrations/0002_rls.sql   — RLS-политики, REVOKE на журнал
supabase/seed.sql                  — роли, объекты, задачи, история (демо)
src/
  lib/        — клиент Supabase, типы, матрица действий (зеркало правил для UI)
  context/    — сессия и профиль пользователя
  components/ — layout, guard, статус-теги
  pages/      — вход, объекты, карточка объекта, карточка задачи, мои задачи
docs/          — объяснение для руководителя, решения и допущения, черновик сообщения
```

## FAQ

- **Ошибка «Invalid path specified in request URL» (PGRST125) при входе.**
  В `VITE_SUPABASE_URL` попал адрес REST-эндпоинта с `/rest/v1/` на конце.
  Нужен только корень проекта: `https://xxxxx.supabase.co` — все пути
  (`/rest/v1`, `/auth/v1`) библиотека добавляет сама. После правки `.env`
  обязательно перезапустите `npm run dev`: Vite читает env только при старте.
- **Supabase-проект «уснул».** Бесплатный тариф ставит проекты на паузу после недели
  неактивности — кнопка Restore в панели.
- **Не входит.** Проверьте Auto Confirm у пользователя и что `seed.sql` выполнен
  (без него у менеджера не назначена роль).
- **Удалить пользователя, у которого есть задачи, нельзя** (FK restrict) — так
  сохраняется автор в истории. Сначала переназначьте или удалите его задачи.
