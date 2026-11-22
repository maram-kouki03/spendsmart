-- SpendSmart — email confirmation with a 6-digit code.
-- Apply with `npm run db:migrate -w server` (runs in a single transaction).

-- When the user proved they own their email address (null = not confirmed yet).
alter table public.users add column if not exists email_verified_at timestamptz;

-- Accounts that existed before this feature (and Google accounts, whose email Google verified)
-- keep working without a code.
update public.users set email_verified_at = now() where email_verified_at is null;

-- Confirmation codes. Only a SHA-256 hash of the code is stored.
create table if not exists public.email_verification_codes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  code_hash  text not null,
  expires_at timestamptz not null,
  attempts   int not null default 0,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists email_verification_codes_user_idx on public.email_verification_codes (user_id);

-- Same rule as every other table: RLS on with no policies, so Supabase's Data API can't read it
-- (the server connects as the table owner and is not affected).
alter table public.email_verification_codes enable row level security;
