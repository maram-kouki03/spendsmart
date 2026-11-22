-- SpendSmart — own authentication. From here on Supabase is used only as a PostgreSQL database:
-- no Supabase Auth, Storage or Data API. The Express server connects directly (as the table owner)
-- and does its own auth with the public.users table below.
--
-- Apply with `npm run db:migrate -w server` (runs in a single transaction).
-- Safe on both an existing database where 20261111000000_init.sql ran with Supabase Auth,
-- and on a fresh database.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Wipe the old test data. Profiles were keyed by auth.users ids, which no longer mean anything;
--    this cascades to every table that references profiles. Guarded so it only ever happens on
--    the first conversion (before public.users exists), never on an accidental re-run.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.users') is null then
    truncate public.profiles cascade;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Stop reacting to Supabase Auth sign-ups.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('auth.users') is not null then
    begin
      execute 'drop trigger if exists on_auth_user_created on auth.users';
    exception when insufficient_privilege then
      -- Dropping the function with CASCADE below removes the trigger too.
      raise notice 'Could not drop on_auth_user_created directly; it is removed with handle_new_user() instead.';
    end;
  end if;
end $$;

drop function if exists public.handle_new_user() cascade;

-- ---------------------------------------------------------------------------
-- 3. Accounts
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique check (email = lower(email)),
  password_hash text,                 -- null for Google-only accounts
  full_name     text not null default '',
  google_id     text unique,
  created_at    timestamptz not null default now()
);

-- profiles.id now points at our own users table instead of auth.users.
alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.profiles
  add constraint profiles_id_fkey foreign key (id) references public.users (id) on delete cascade;

-- Contacts and groups look people up by email.
create index if not exists profiles_email_lower_idx on public.profiles (lower(email));

-- ---------------------------------------------------------------------------
-- 4. Password reset tokens (only a SHA-256 hash of the token is stored)
-- ---------------------------------------------------------------------------
create table if not exists public.password_reset_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists password_reset_tokens_user_idx on public.password_reset_tokens (user_id);

-- ---------------------------------------------------------------------------
-- 5. Row level security: drop every policy that relied on Supabase Auth (auth.uid()),
--    but keep RLS ENABLED with no policies on every table. Supabase's public Data API
--    (anon / authenticated roles) can then read nothing; the server connects as the table
--    owner and is not affected.
-- ---------------------------------------------------------------------------
do $$
declare p record;
begin
  for p in
    select schemaname, tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and (coalesce(qual, '') ilike '%auth.uid()%' or coalesce(with_check, '') ilike '%auth.uid()%')
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- Belt and braces on Supabase: also take away the Data API roles' table privileges.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema public from anon';
    execute 'revoke all on all sequences in schema public from anon';
    execute 'alter default privileges in schema public revoke all on tables from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on all tables in schema public from authenticated';
    execute 'revoke all on all sequences in schema public from authenticated';
    execute 'alter default privileges in schema public revoke all on tables from authenticated';
  end if;
end $$;

-- Note: the old private "receipts" Storage bucket is no longer used (receipts are saved by the
-- server on disk). Supabase doesn't allow deleting buckets from SQL; remove it from the
-- dashboard (Storage) if you like.
