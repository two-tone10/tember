create extension if not exists pgcrypto;

create table if not exists tember_subscribers (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text unique,
  phone text unique,
  pace text not null default 'daily' check (pace in ('hourly', '3x', 'daily')),
  channel text not null default 'email' check (channel in ('email', 'phone')),
  status text not null default 'active' check (status in ('active', 'paused', 'canceled')),
  unsubscribe_token uuid not null default gen_random_uuid(),
  confirmed_at timestamptz,
  last_sent_at timestamptz,
  last_error text,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email is not null or phone is not null)
);

create table if not exists tember_sparks (
  id uuid primary key default gen_random_uuid(),
  hour_key text not null,
  thought_index integer not null default 0,
  thought text,
  prompt_category text,
  prompt_label text,
  prompt_bridge text,
  prompt_text text,
  quote text,
  author text,
  name text not null default 'Anonymous',
  tag text check (tag in ('resonated', 'with-it', 'missed')),
  text text not null,
  resonance_count integer not null default 0,
  status text not null default 'approved' check (status in ('pending', 'approved', 'rejected', 'archived')),
  created_at timestamptz not null default now()
);

create table if not exists tember_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function tember_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tember_subscribers_touch_updated_at on tember_subscribers;
create trigger tember_subscribers_touch_updated_at
before update on tember_subscribers
for each row execute function tember_touch_updated_at();

create index if not exists tember_subscribers_status_idx on tember_subscribers(status);
create index if not exists tember_subscribers_pace_channel_idx on tember_subscribers(pace, channel);
create index if not exists tember_sparks_hour_created_idx on tember_sparks(hour_key, created_at desc);
create index if not exists tember_sparks_prompt_category_idx on tember_sparks(prompt_category);
create index if not exists tember_sparks_status_idx on tember_sparks(status);
create index if not exists tember_events_type_created_idx on tember_events(event_type, created_at desc);

alter table tember_subscribers enable row level security;
alter table tember_sparks enable row level security;
alter table tember_events enable row level security;
