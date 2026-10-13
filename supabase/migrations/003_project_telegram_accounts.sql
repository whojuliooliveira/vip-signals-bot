alter table public.projects
  add column if not exists telegram_account jsonb;
