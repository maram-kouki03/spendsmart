-- SpendSmart — shared savings plans ("we save 900 DT for an oven in 3 months, 50/50").
-- Apply with `npm run db:migrate -w server` (runs in a single transaction).
--
--   * user_categories          custom categories per user (used by shared plans; transactions keep
--                              their built-in categories)
--   * shared_plans             what we save for, the target, how many months, with whom
--                              (exactly one of partner_id / group_id, like shared_budgets)
--   * shared_plan_members      each member's share of the target (share_pct, adds up to 100)
--   * transactions             new kind 'shared_saving' + shared_plan_id: a contribution lowers the
--                              contributor's own card, so balances stay right
--   * refund trigger           whenever a plan is deleted (by the API, a group being deleted, a
--                              contact being removed, …) every contribution still linked to it goes
--                              back to the card it came from, as an income "Returned from <item>"
--   * notifications 'plan'
--
-- Existing monthly-limit shared budgets become plans: item_name = name, target = sum of the limits,
-- months = 1, equal shares between the people who can see it. The old shared_budgets tables are
-- left in place (no longer used by the app) so nothing is lost; they can be dropped later.

-- ---------------------------------------------------------------------------
-- 1. Custom categories
-- ---------------------------------------------------------------------------
create table if not exists public.user_categories (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  name       text not null check (name = btrim(name) and length(name) between 1 and 30),
  created_at timestamptz not null default now()
);
create unique index if not exists user_categories_owner_name_uniq on public.user_categories (owner_id, lower(name));
alter table public.user_categories enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Plans and members
-- ---------------------------------------------------------------------------
create table if not exists public.shared_plans (
  id            uuid primary key default gen_random_uuid(),
  created_by    uuid not null references public.profiles (id) on delete cascade,
  partner_id    uuid references public.profiles (id) on delete cascade,
  group_id      uuid references public.groups (id) on delete cascade,
  item_name     text not null check (length(btrim(item_name)) between 1 and 60),
  category      text not null check (length(btrim(category)) between 1 and 30),
  target_amount numeric(12, 2) not null check (target_amount > 0),
  months        int not null check (months between 1 and 60),
  start_date    date not null default current_date,
  split_mode    text not null default 'equal' check (split_mode in ('equal', 'ratio')),
  created_at    timestamptz not null default now(),
  check ((partner_id is not null) <> (group_id is not null)),
  check (partner_id is null or partner_id <> created_by)
);
create index if not exists shared_plans_created_by_idx on public.shared_plans (created_by);
create index if not exists shared_plans_partner_idx    on public.shared_plans (partner_id);
create index if not exists shared_plans_group_idx      on public.shared_plans (group_id);
alter table public.shared_plans enable row level security;

create table if not exists public.shared_plan_members (
  plan_id   uuid not null references public.shared_plans (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  share_pct numeric(5, 2) not null check (share_pct > 0 and share_pct <= 100),
  joined_at timestamptz not null default now(),
  primary key (plan_id, user_id)
);
create index if not exists shared_plan_members_user_idx on public.shared_plan_members (user_id);
alter table public.shared_plan_members enable row level security;

-- ---------------------------------------------------------------------------
-- 3. Contributions are transactions
-- ---------------------------------------------------------------------------
alter table public.transactions add column if not exists shared_plan_id uuid references public.shared_plans (id) on delete set null;
create index if not exists tx_shared_plan_idx on public.transactions (shared_plan_id) where shared_plan_id is not null;

alter table public.transactions drop constraint if exists transactions_kind_check;
alter table public.transactions add constraint transactions_kind_check
  check (kind in ('expense', 'income', 'goal', 'shared_saving'));

-- ---------------------------------------------------------------------------
-- 4. Deleting a plan gives every remaining contribution back to the card it came from
-- ---------------------------------------------------------------------------
-- (The API first refunds the person deleting to the card they picked and unlinks those rows, so
-- only the other members' money is handled here.) People or cards that are being deleted in the
-- same statement (account deletion) are skipped: their rows are going away anyway.
create or replace function public.shared_plan_refund() returns trigger
language plpgsql as $$
begin
  insert into public.transactions (user_id, source_id, kind, name, category, amount, note)
  select t.user_id, t.source_id, 'income', left('Returned from ' || old.item_name, 80), 'Savings', sum(t.amount), 'Shared plan deleted'
    from public.transactions t
   where t.shared_plan_id = old.id and t.kind = 'shared_saving'
     and exists (select 1 from public.profiles p where p.id = t.user_id)
     and exists (select 1 from public.sources s where s.id = t.source_id and s.user_id = t.user_id)
   group by t.user_id, t.source_id
  having sum(t.amount) > 0;
  return old;
end $$;

drop trigger if exists shared_plans_refund on public.shared_plans;
create trigger shared_plans_refund before delete on public.shared_plans
  for each row execute function public.shared_plan_refund();

-- ---------------------------------------------------------------------------
-- 5. Notifications about plans
-- ---------------------------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('budget', 'over', 'split', 'subscription', 'info', 'invite', 'plan'));

-- ---------------------------------------------------------------------------
-- 6. Old shared budgets → plans (once; a re-run finds them already migrated)
-- ---------------------------------------------------------------------------
alter table public.shared_budgets add column if not exists migrated_plan_id uuid references public.shared_plans (id) on delete set null;

do $$
declare
  b record;
  pid uuid;
  members uuid[];
  total numeric;
  n int;
  i int;
  migrated int := 0;
  skipped int := 0;
begin
  for b in select * from public.shared_budgets where migrated_plan_id is null order by created_at loop
    -- Duplicates (same name + category for the same pair / group) become one plan.
    select d.migrated_plan_id into pid
      from public.shared_budgets d
     where d.migrated_plan_id is not null and d.id <> b.id
       and lower(btrim(d.name)) = lower(btrim(b.name)) and d.category = b.category
       and (d.group_id = b.group_id
            or (b.group_id is null and d.group_id is null
                and least(d.created_by, d.partner_id) = least(b.created_by, b.partner_id)
                and greatest(d.created_by, d.partner_id) = greatest(b.created_by, b.partner_id)))
     limit 1;
    if pid is not null then
      update public.shared_budgets set migrated_plan_id = pid where id = b.id;
      skipped := skipped + 1;
      continue;
    end if;

    if b.group_id is not null then
      select array_agg(user_id order by joined_at nulls last, user_id) into members
        from public.group_members where group_id = b.group_id and status = 'active';
    else
      members := array[b.created_by, b.partner_id];
    end if;
    select coalesce(sum(monthly_limit), 0) into total from public.shared_budget_limits where shared_budget_id = b.id;
    n := coalesce(array_length(members, 1), 0);
    if total <= 0 or n = 0 then skipped := skipped + 1; continue; end if;

    insert into public.shared_plans (created_by, partner_id, group_id, item_name, category, target_amount, months, start_date, split_mode, created_at)
    values (b.created_by, b.partner_id, b.group_id, left(btrim(b.name), 60), b.category, round(total, 2), 1, b.created_at::date, 'equal', b.created_at)
    returning id into pid;

    -- Equal shares to the cent; the last member gets the rounding remainder.
    for i in 1..n loop
      insert into public.shared_plan_members (plan_id, user_id, share_pct)
      values (pid, members[i], case when i < n then round(100.0 / n, 2) else 100 - round(100.0 / n, 2) * (n - 1) end)
      on conflict do nothing;
    end loop;

    update public.shared_budgets set migrated_plan_id = pid where id = b.id;
    migrated := migrated + 1;
  end loop;
  if migrated > 0 then raise notice 'shared_budgets: % migrated to shared savings plans', migrated; end if;
  if skipped > 0 then raise notice 'shared_budgets: % skipped (duplicates, or no limits / members left)', skipped; end if;
end $$;
