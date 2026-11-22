-- SpendSmart — sign-ups wait in pending_signups until the email is confirmed, so public.users only
-- ever holds confirmed accounts. Apply with `npm run db:migrate -w server` (single transaction).

-- ---------------------------------------------------------------------------
-- 1. Sign-ups waiting for their 6-digit code (only hashes are stored)
-- ---------------------------------------------------------------------------
create table if not exists public.pending_signups (
  id              uuid primary key default gen_random_uuid(),
  email           text not null unique check (email = lower(email)),
  full_name       text not null,
  password_hash   text not null,
  code_hash       text not null,
  code_expires_at timestamptz not null,
  attempts        int not null default 0,
  last_sent_at    timestamptz not null default now(),
  created_at      timestamptz not null default now()
);
-- The hourly cleanup deletes rows by age.
create index if not exists pending_signups_last_sent_idx on public.pending_signups (last_sent_at);

-- Same rule as every other table: RLS on with no policies, so Supabase's Data API can't read it.
alter table public.pending_signups enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Only confirmed accounts in users
-- ---------------------------------------------------------------------------
-- Unconfirmed accounts from the previous flow (cascades to their profiles and data).
delete from public.users where email_verified_at is null;

-- Every account is confirmed when it's created (sign-up code, or Google's verified email),
-- and the database now refuses anything else.
alter table public.users alter column email_verified_at set default now();
alter table public.users alter column email_verified_at set not null;

-- ---------------------------------------------------------------------------
-- 3. Per-user codes are replaced by pending_signups
-- ---------------------------------------------------------------------------
drop table if exists public.email_verification_codes;
