-- SpendSmart — money safety + schema hardening (backend audit, part A).
-- Apply with `npm run db:migrate -w server` (runs in a single transaction).
--
--   * sources.archived_at            cards with history are archived instead of deleted
--   * profiles.timezone              "this month", "today" and renewals use the user's time zone
--   * transactions.subscription_id   + subscription_period, unique per period → a renewal can't be charged twice
--   * CHECK constraints              allowed categories / icons / colours
--   * same-user foreign keys         a transaction can only use the same user's source / goal / subscription
--   * missing indexes
--
-- Existing rows that would break a new constraint are fixed where that is safe (reported with
-- RAISE NOTICE, printed by the migration runner) and reported as an error where it is not.

do $$
begin
  -- `on delete set null (column)` on a composite foreign key needs PostgreSQL 15+.
  if current_setting('server_version_num')::int < 150000 then
    raise exception 'This migration needs PostgreSQL 15 or newer (found %).', current_setting('server_version');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. New columns
-- ---------------------------------------------------------------------------
alter table public.sources  add column if not exists archived_at timestamptz;
alter table public.profiles add column if not exists timezone text not null default 'Africa/Tunis';

alter table public.transactions add column if not exists subscription_id uuid;
-- The renewal date (in the user's time zone) a subscription charge pays for.
alter table public.transactions add column if not exists subscription_period date;

-- ---------------------------------------------------------------------------
-- 2. Check existing rows, fix what is safe to fix
-- ---------------------------------------------------------------------------
do $$
declare n int;
begin
  -- Unknown time zones would make every date query fail for that user.
  update public.profiles set timezone = 'Africa/Tunis'
   where timezone not in (select name from pg_timezone_names);
  get diagnostics n = row_count;
  if n > 0 then raise notice 'profiles: % unknown time zone(s) reset to Africa/Tunis', n; end if;

  update public.transactions set category = 'More'
   where category not in ('Food', 'Coffee', 'Groceries', 'Makeup', 'Transport', 'Bills', 'Shopping', 'More', 'Income', 'Savings');
  get diagnostics n = row_count;
  if n > 0 then raise notice 'transactions: % row(s) with an unknown category set to More', n; end if;

  update public.budgets set category = 'More'
   where category not in ('Food', 'Coffee', 'Groceries', 'Makeup', 'Transport', 'Bills', 'Shopping', 'More');
  get diagnostics n = row_count;
  if n > 0 then raise notice 'budgets: % row(s) with an unknown category set to More', n; end if;

  update public.shared_budgets set category = 'More'
   where category not in ('Food', 'Coffee', 'Groceries', 'Makeup', 'Transport', 'Bills', 'Shopping', 'More');
  get diagnostics n = row_count;
  if n > 0 then raise notice 'shared_budgets: % row(s) with an unknown category set to More', n; end if;

  update public.split_requests set category = 'More'
   where category not in ('Food', 'Coffee', 'Groceries', 'Makeup', 'Transport', 'Bills', 'Shopping', 'More');
  get diagnostics n = row_count;
  if n > 0 then raise notice 'split_requests: % row(s) with an unknown category set to More', n; end if;

  update public.goals set icon = 'star'
   where icon not in ('laptop', 'plane', 'shield', 'phone', 'home', 'gift', 'star');
  get diagnostics n = row_count;
  if n > 0 then raise notice 'goals: % row(s) with an unknown icon set to star', n; end if;

  update public.subscriptions set icon = 'play'
   where icon not in ('play', 'music', 'cloud', 'gym', 'news', 'game', 'star');
  get diagnostics n = row_count;
  if n > 0 then raise notice 'subscriptions: % row(s) with an unknown icon set to play', n; end if;

  update public.subscriptions set color = 'cocoa'
   where color not in ('cocoa', 'green', 'blue', 'butter', 'violet', 'pink');
  get diagnostics n = row_count;
  if n > 0 then raise notice 'subscriptions: % row(s) with an unknown colour set to cocoa', n; end if;

  -- Cross-user links. A goal or subscription link pointing at someone else's row is unlinked
  -- (no money moves); a transaction on someone else's card has no safe fix, so stop and report.
  update public.transactions t set goal_id = null
    from public.goals g
   where g.id = t.goal_id and g.user_id <> t.user_id;
  get diagnostics n = row_count;
  if n > 0 then raise notice 'transactions: % row(s) linked to another user''s goal were unlinked', n; end if;

  update public.subscriptions sub set source_id = null
    from public.sources s
   where s.id = sub.source_id and s.user_id <> sub.user_id;
  get diagnostics n = row_count;
  if n > 0 then raise notice 'subscriptions: % row(s) charging another user''s card were unlinked', n; end if;

  select count(*) into n
    from public.transactions t join public.sources s on s.id = t.source_id
   where s.user_id <> t.user_id;
  if n > 0 then
    raise exception '% transaction(s) use a card that belongs to another user. Inspect them with: select t.id, t.user_id, s.user_id as source_owner from public.transactions t join public.sources s on s.id = t.source_id where s.user_id <> t.user_id;', n;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. CHECK constraints (transactions.kind, split_requests.status, sources.kind/style and
--    profiles.currency already have theirs from the initial schema)
-- ---------------------------------------------------------------------------
alter table public.transactions drop constraint if exists transactions_category_check;
alter table public.transactions add constraint transactions_category_check
  check (category in ('Food', 'Coffee', 'Groceries', 'Makeup', 'Transport', 'Bills', 'Shopping', 'More', 'Income', 'Savings'));

alter table public.budgets drop constraint if exists budgets_category_check;
alter table public.budgets add constraint budgets_category_check
  check (category in ('Food', 'Coffee', 'Groceries', 'Makeup', 'Transport', 'Bills', 'Shopping', 'More'));

alter table public.shared_budgets drop constraint if exists shared_budgets_category_check;
alter table public.shared_budgets add constraint shared_budgets_category_check
  check (category in ('Food', 'Coffee', 'Groceries', 'Makeup', 'Transport', 'Bills', 'Shopping', 'More'));

alter table public.split_requests drop constraint if exists split_requests_category_check;
alter table public.split_requests add constraint split_requests_category_check
  check (category in ('Food', 'Coffee', 'Groceries', 'Makeup', 'Transport', 'Bills', 'Shopping', 'More'));

alter table public.goals drop constraint if exists goals_icon_check;
alter table public.goals add constraint goals_icon_check
  check (icon in ('laptop', 'plane', 'shield', 'phone', 'home', 'gift', 'star'));

alter table public.subscriptions drop constraint if exists subscriptions_icon_check;
alter table public.subscriptions add constraint subscriptions_icon_check
  check (icon in ('play', 'music', 'cloud', 'gym', 'news', 'game', 'star'));

alter table public.subscriptions drop constraint if exists subscriptions_color_check;
alter table public.subscriptions add constraint subscriptions_color_check
  check (color in ('cocoa', 'green', 'blue', 'butter', 'violet', 'pink'));

-- A subscription charge always says which period it pays for.
alter table public.transactions drop constraint if exists transactions_subscription_period_check;
alter table public.transactions add constraint transactions_subscription_period_check
  check (subscription_id is null or subscription_period is not null);

-- ---------------------------------------------------------------------------
-- 4. Same-user integrity: (id, user_id) keys + composite foreign keys
-- ---------------------------------------------------------------------------
alter table public.sources       drop constraint if exists sources_id_user_key;
alter table public.sources       add constraint sources_id_user_key unique (id, user_id);
alter table public.goals         drop constraint if exists goals_id_user_key;
alter table public.goals         add constraint goals_id_user_key unique (id, user_id);
alter table public.subscriptions drop constraint if exists subscriptions_id_user_key;
alter table public.subscriptions add constraint subscriptions_id_user_key unique (id, user_id);

-- A card can only be hard-deleted when it has no transactions (the API archives the others),
-- so the old ON DELETE CASCADE becomes NO ACTION. Deleting a whole account still works: the
-- profile cascade removes transactions and sources in the same statement.
alter table public.transactions drop constraint if exists transactions_source_id_fkey;
alter table public.transactions drop constraint if exists transactions_source_user_fkey;
alter table public.transactions add constraint transactions_source_user_fkey
  foreign key (source_id, user_id) references public.sources (id, user_id);

alter table public.transactions drop constraint if exists transactions_goal_id_fkey;
alter table public.transactions drop constraint if exists transactions_goal_user_fkey;
alter table public.transactions add constraint transactions_goal_user_fkey
  foreign key (goal_id, user_id) references public.goals (id, user_id) on delete set null (goal_id);

alter table public.transactions drop constraint if exists transactions_subscription_user_fkey;
alter table public.transactions add constraint transactions_subscription_user_fkey
  foreign key (subscription_id, user_id) references public.subscriptions (id, user_id) on delete set null (subscription_id);

alter table public.subscriptions drop constraint if exists subscriptions_source_id_fkey;
alter table public.subscriptions drop constraint if exists subscriptions_source_user_fkey;
alter table public.subscriptions add constraint subscriptions_source_user_fkey
  foreign key (source_id, user_id) references public.sources (id, user_id) on delete set null (source_id);

-- ---------------------------------------------------------------------------
-- 5. One charge per subscription per period (the job inserts with ON CONFLICT DO NOTHING)
-- ---------------------------------------------------------------------------
create unique index if not exists tx_subscription_period_uidx
  on public.transactions (subscription_id, subscription_period)
  where subscription_id is not null;

-- ---------------------------------------------------------------------------
-- 6. Indexes
-- ---------------------------------------------------------------------------
create index if not exists group_members_user_idx        on public.group_members (user_id);
create index if not exists shared_budgets_partner_idx    on public.shared_budgets (partner_id);
create index if not exists shared_budgets_group_idx      on public.shared_budgets (group_id);
create index if not exists shared_budgets_created_by_idx on public.shared_budgets (created_by);
create index if not exists shared_budget_limits_user_idx on public.shared_budget_limits (user_id);
create index if not exists tx_user_kind_time_idx         on public.transactions (user_id, kind, occurred_at);
create index if not exists tx_goal_idx                   on public.transactions (goal_id);
create index if not exists notif_user_read_idx           on public.notifications (user_id, read);
create index if not exists subs_source_idx               on public.subscriptions (source_id);
create index if not exists subs_due_idx                  on public.subscriptions (next_renewal) where active;

-- ---------------------------------------------------------------------------
-- 7. The balance view keeps its column list in sync with sources (archived_at is new)
-- ---------------------------------------------------------------------------
drop view if exists public.source_balances;
create view public.source_balances with (security_invoker = true) as
select
  s.*,
  s.starting_balance + coalesce(sum(case when t.kind = 'income' then t.amount else -t.amount end), 0) as balance
from public.sources s
left join public.transactions t on t.source_id = s.id
group by s.id;
