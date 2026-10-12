create table if not exists public.projects (
  id text primary key,
  name text not null,
  language text not null check (language in ('en', 'es')),
  bot_token text,
  chat_id text,
  link text not null default '',
  broker_label text not null default '',
  signal_templates jsonb,
  message_templates jsonb,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.auto_messages (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.signals (
  id text primary key,
  date_key date not null,
  project_id text not null references public.projects(id) on delete cascade,
  pair text not null,
  market text not null default 'OTC',
  direction text not null check (direction in ('UP', 'DOWN')),
  signal_time text not null,
  expiry_minutes integer not null default 5,
  reentries integer not null default 2,
  source_text text not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  message_id bigint,
  error text,
  sending_at timestamptz,
  unique (date_key, project_id, pair, market, direction, signal_time)
);

create table if not exists public.send_logs (
  id text primary key,
  at timestamptz not null default now(),
  project_id text references public.projects(id) on delete set null,
  status text not null check (status in ('sent', 'failed')),
  payload jsonb not null
);

create table if not exists public.schedule_keys (
  id text primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.capture_sessions (
  id text primary key,
  project_id text not null references public.projects(id) on delete cascade,
  status text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists signals_due_idx on public.signals (date_key, signal_time, sent_at);
create index if not exists signals_project_date_idx on public.signals (project_id, date_key);
create index if not exists send_logs_at_idx on public.send_logs (at desc);

alter table public.projects enable row level security;
alter table public.auto_messages enable row level security;
alter table public.signals enable row level security;
alter table public.send_logs enable row level security;
alter table public.schedule_keys enable row level security;
alter table public.capture_sessions enable row level security;
