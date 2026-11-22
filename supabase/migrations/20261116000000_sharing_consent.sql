-- SpendSmart — consent for shared expenses (backend audit, "Shared expenses" privacy issues).
-- Apply with `npm run db:migrate -w server` (runs in a single transaction).
--
-- Nobody is linked to someone else, or has their spending shown to them, without accepting:
--
--   * contact_invites            POST /contacts creates an invite; the contact (both directions) is
--                                only created when the other person accepts
--   * group_members.status       'invited' | 'active'; only active members are part of the group
--   * group_email_invites        group invites to addresses without an account (claimed at sign-up),
--                                so a group's member list never reveals which emails have accounts
--   * split_requests 'cancelled' pending splits are cancelled when the people stop being connected
--   * notifications 'invite'     invitation notifications (Accept / Decline in the bell)
--
-- Existing data (test data): existing contacts stay connected and existing group members become
-- 'active'. One-sided contacts (left behind by the old "remove = my side only") are removed, since
-- the other person had already removed them. Both are reported with RAISE NOTICE.

-- ---------------------------------------------------------------------------
-- 1. Contact invitations
-- ---------------------------------------------------------------------------
create table if not exists public.contact_invites (
  id           uuid primary key default gen_random_uuid(),
  from_user    uuid not null references public.profiles (id) on delete cascade,
  to_email     text not null check (to_email = lower(to_email) and length(to_email) between 3 and 320),
  to_user      uuid references public.profiles (id) on delete cascade, -- null until that address has an account
  relation     text not null default 'Friend' check (length(relation) between 1 and 40),
  status       text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  check (to_user is null or to_user <> from_user)
);
-- One open invite per sender and address.
create unique index if not exists contact_invites_pending_uniq on public.contact_invites (from_user, to_email) where status = 'pending';
create index if not exists contact_invites_to_user_idx on public.contact_invites (to_user, status);
create index if not exists contact_invites_to_email_idx on public.contact_invites (to_email) where to_user is null;
create index if not exists contact_invites_from_time_idx on public.contact_invites (from_user, created_at);
alter table public.contact_invites enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Group membership needs acceptance
-- ---------------------------------------------------------------------------
-- Added with default 'active' so every existing member is active, then the default becomes 'invited'.
alter table public.group_members add column if not exists status text not null default 'active';
alter table public.group_members alter column status set default 'invited';
alter table public.group_members drop constraint if exists group_members_status_check;
alter table public.group_members add constraint group_members_status_check check (status in ('invited', 'active'));
alter table public.group_members add column if not exists invited_by uuid references public.profiles (id) on delete set null;
alter table public.group_members add column if not exists invited_at timestamptz not null default now();
alter table public.group_members add column if not exists joined_at timestamptz;
update public.group_members set joined_at = invited_at where status = 'active' and joined_at is null;
create index if not exists group_members_invited_by_idx on public.group_members (invited_by, invited_at);

-- Group invitations to addresses that have no account yet. Turned into an 'invited' group_members
-- row when someone signs up with that address.
create table if not exists public.group_email_invites (
  group_id   uuid not null references public.groups (id) on delete cascade,
  email      text not null check (email = lower(email) and length(email) between 3 and 320),
  invited_by uuid references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, email)
);
create index if not exists group_email_invites_email_idx on public.group_email_invites (email);
create index if not exists group_email_invites_by_idx on public.group_email_invites (invited_by, created_at);
alter table public.group_email_invites enable row level security;

-- Every invitation sent (contact or group, to an account or not). The daily cap (20 per user) and
-- the "email an address at most once a week" rule count from here, so cancelling or removing an
-- invite doesn't give the quota back. Rows older than 8 days are pruned when new ones are added.
create table if not exists public.invite_sends (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  to_email   text not null,
  emailed    boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists invite_sends_user_idx on public.invite_sends (user_id, created_at);
create index if not exists invite_sends_email_idx on public.invite_sends (to_email, created_at) where emailed;
alter table public.invite_sends enable row level security;

-- ---------------------------------------------------------------------------
-- 3. Split requests can be cancelled; notifications can be invitations
-- ---------------------------------------------------------------------------
alter table public.split_requests drop constraint if exists split_requests_status_check;
alter table public.split_requests add constraint split_requests_status_check
  check (status in ('pending', 'accepted', 'declined', 'cancelled'));
create index if not exists split_group_idx on public.split_requests (group_id, status);

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('budget', 'over', 'split', 'subscription', 'info', 'invite'));

create index if not exists contacts_contact_idx on public.contacts (contact_id);

-- ---------------------------------------------------------------------------
-- 4. Existing data
-- ---------------------------------------------------------------------------
do $$
declare n int;
begin
  -- Contacts are now always two-way. A row whose reverse is missing means the other person
  -- removed it under the old behaviour: drop it rather than keep a one-sided link.
  delete from public.contacts c
   where not exists (select 1 from public.contacts r where r.owner_id = c.contact_id and r.contact_id = c.owner_id);
  get diagnostics n = row_count;
  if n > 0 then raise notice 'contacts: removed % one-sided contact row(s)', n; end if;

  select count(*) into n from public.contacts;
  if n > 0 then raise notice 'contacts: % existing row(s) kept as accepted', n; end if;
  select count(*) into n from public.group_members;
  if n > 0 then raise notice 'group_members: % existing row(s) marked active', n; end if;
end $$;
