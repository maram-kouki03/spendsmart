-- SpendSmart — initial schema
-- Run with `supabase db push`, or paste into the Supabase SQL editor.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  full_name     text not null default '',
  email         text,
  currency      text not null default 'TND' check (currency in ('TND', 'EUR', 'USD')),
  notify_budget boolean not null default true,
  notify_split  boolean not null default true,
  notify_subs   boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Money sources: cards and wallets
-- ---------------------------------------------------------------------------
create table if not exists public.sources (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  name             text not null,
  kind             text not null default 'debit' check (kind in ('debit', 'credit', 'cash', 'other')),
  last4            text check (last4 is null or last4 ~ '^[0-9]{4}$'),
  starting_balance numeric(12, 2) not null default 0,
  style            text not null default 'g1' check (style in ('g1', 'g2', 'g3', 'g4')),
  position         int not null default 0,
  created_at       timestamptz not null default now()
);
create index if not exists sources_user_idx on public.sources (user_id);

-- ---------------------------------------------------------------------------
-- Savings goals
-- ---------------------------------------------------------------------------
create table if not exists public.goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  name          text not null,
  target        numeric(12, 2) not null check (target > 0),
  initial_saved numeric(12, 2) not null default 0,
  target_date   date,
  icon          text not null default 'star',
  created_at    timestamptz not null default now()
);
create index if not exists goals_user_idx on public.goals (user_id);

-- ---------------------------------------------------------------------------
-- Sharing: contacts, groups, split requests, shared budgets
-- ---------------------------------------------------------------------------
create table if not exists public.contacts (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  contact_id uuid not null references public.profiles (id) on delete cascade,
  relation   text not null default 'Friend',
  created_at timestamptz not null default now(),
  unique (owner_id, contact_id),
  check (owner_id <> contact_id)
);

create table if not exists public.groups (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id  uuid not null references public.profiles (id) on delete cascade,
  primary key (group_id, user_id)
);

create table if not exists public.split_requests (
  id             uuid primary key default gen_random_uuid(),
  from_user      uuid not null references public.profiles (id) on delete cascade,
  to_user        uuid not null references public.profiles (id) on delete cascade,
  group_id       uuid references public.groups (id) on delete set null,
  title          text not null,
  category       text not null default 'More',
  total_amount   numeric(12, 2) not null check (total_amount > 0),
  share_amount   numeric(12, 2) not null check (share_amount > 0),
  status         text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  from_source_id uuid references public.sources (id) on delete set null,
  to_source_id   uuid references public.sources (id) on delete set null,
  created_at     timestamptz not null default now(),
  responded_at   timestamptz
);
create index if not exists split_to_idx on public.split_requests (to_user, status);
create index if not exists split_from_idx on public.split_requests (from_user, status);

create table if not exists public.shared_budgets (
  id         uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles (id) on delete cascade,
  name       text not null,
  category   text not null,
  partner_id uuid references public.profiles (id) on delete cascade,
  group_id   uuid references public.groups (id) on delete cascade,
  created_at timestamptz not null default now(),
  check ((partner_id is not null) <> (group_id is not null))
);

create table if not exists public.shared_budget_limits (
  shared_budget_id uuid not null references public.shared_budgets (id) on delete cascade,
  user_id          uuid not null references public.profiles (id) on delete cascade,
  monthly_limit    numeric(12, 2) not null check (monthly_limit > 0),
  primary key (shared_budget_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Transactions: expenses, income and money moved into goals
-- ---------------------------------------------------------------------------
create table if not exists public.transactions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  source_id        uuid not null references public.sources (id) on delete cascade,
  kind             text not null check (kind in ('expense', 'income', 'goal')),
  name             text not null,
  category         text not null,
  amount           numeric(12, 2) not null check (amount > 0),
  occurred_at      timestamptz not null default now(),
  note             text,
  receipt_path     text,
  goal_id          uuid references public.goals (id) on delete set null,
  split_request_id uuid references public.split_requests (id) on delete set null,
  created_at       timestamptz not null default now()
);
create index if not exists tx_user_time_idx on public.transactions (user_id, occurred_at desc);
create index if not exists tx_source_idx on public.transactions (source_id);
create index if not exists tx_goal_idx on public.transactions (goal_id);

-- ---------------------------------------------------------------------------
-- Budgets
-- ---------------------------------------------------------------------------
create table if not exists public.budgets (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  category        text not null,
  name            text not null,
  monthly_limit   numeric(12, 2) not null check (monthly_limit > 0),
  alert_threshold int not null default 80 check (alert_threshold between 50 and 100),
  created_at      timestamptz not null default now()
);
create index if not exists budgets_user_idx on public.budgets (user_id);

-- ---------------------------------------------------------------------------
-- Subscriptions
-- ---------------------------------------------------------------------------
create table if not exists public.subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  name         text not null,
  price        numeric(12, 2) not null check (price > 0),
  next_renewal date not null,
  source_id    uuid references public.sources (id) on delete set null,
  active       boolean not null default true,
  icon         text not null default 'play',
  color        text not null default 'cocoa',
  created_at   timestamptz not null default now()
);
create index if not exists subs_user_idx on public.subscriptions (user_id);

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  type       text not null check (type in ('budget', 'over', 'split', 'subscription', 'info')),
  title      text not null,
  body       text,
  data       jsonb not null default '{}'::jsonb,
  dedupe_key text,
  read       boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
create index if not exists notif_user_idx on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Live balance per source
-- ---------------------------------------------------------------------------
create or replace view public.source_balances with (security_invoker = true) as
select
  s.*,
  s.starting_balance + coalesce(sum(case when t.kind = 'income' then t.amount else -t.amount end), 0) as balance
from public.sources s
left join public.transactions t on t.source_id = s.id
group by s.id;

-- ---------------------------------------------------------------------------
-- New user → profile + three starter sources
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), new.email)
  on conflict (id) do nothing;

  insert into public.sources (user_id, name, kind, style, position) values
    (new.id, 'Card 1', 'debit', 'g1', 0),
    (new.id, 'Card 2', 'credit', 'g2', 1),
    (new.id, 'Cash Wallet', 'cash', 'g3', 2);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row level security
-- The Node API uses the service-role key and scopes every query to the
-- signed-in user; these policies protect the tables from direct client access.
-- ---------------------------------------------------------------------------
alter table public.profiles             enable row level security;
alter table public.sources              enable row level security;
alter table public.goals                enable row level security;
alter table public.contacts             enable row level security;
alter table public.groups               enable row level security;
alter table public.group_members        enable row level security;
alter table public.split_requests       enable row level security;
alter table public.shared_budgets       enable row level security;
alter table public.shared_budget_limits enable row level security;
alter table public.transactions         enable row level security;
alter table public.budgets              enable row level security;
alter table public.subscriptions        enable row level security;
alter table public.notifications        enable row level security;

create policy "own profile" on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy "own sources" on public.sources for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own goals" on public.goals for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own contacts" on public.contacts for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own groups" on public.groups for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "member groups" on public.group_members for select using (user_id = auth.uid());
create policy "my splits" on public.split_requests for select using (from_user = auth.uid() or to_user = auth.uid());
create policy "own shared budgets" on public.shared_budgets for select using (created_by = auth.uid() or partner_id = auth.uid());
create policy "own shared limits" on public.shared_budget_limits for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own transactions" on public.transactions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own budgets" on public.budgets for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own subscriptions" on public.subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own notifications" on public.notifications for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Receipt photos (private bucket; the API uploads and signs URLs)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;
