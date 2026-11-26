-- SpendSmart — budgets for any period, not only monthly.
-- Apply with `npm run db:migrate -w server` (runs in a single transaction, safe to re-run).
--
--   * budgets.period      'week' | 'month' | 'quarter' | 'year' | 'custom' (default 'month';
--                         every existing budget becomes a monthly one)
--   * budgets.start_date  'quarter': the first day of the first 3-month block
--                         'custom' : the first day of the budget (inclusive)
--   * budgets.end_date    'custom' : the last day of the budget (inclusive, after start_date)
--   * monthly_limit is renamed limit_amount (it is the limit for whatever the period is)
--
-- Nothing is dropped. transactions.receipt_path stays (unused since receipt uploads were removed).

alter table public.budgets add column if not exists period     text not null default 'month';
alter table public.budgets add column if not exists start_date date;
alter table public.budgets add column if not exists end_date   date;

do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'budgets' and column_name = 'monthly_limit') then
    alter table public.budgets rename column monthly_limit to limit_amount;
  end if;
end $$;

alter table public.budgets drop constraint if exists budgets_period_check;
alter table public.budgets add constraint budgets_period_check
  check (period in ('week', 'month', 'quarter', 'year', 'custom'));

-- custom needs both dates with end > start; a quarter needs its anchor date; the others use none.
alter table public.budgets drop constraint if exists budgets_period_dates_check;
alter table public.budgets add constraint budgets_period_dates_check check (
  case period
    when 'custom'  then start_date is not null and end_date is not null and end_date > start_date
    when 'quarter' then start_date is not null and end_date is null
    else start_date is null and end_date is null
  end
);
