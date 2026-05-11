create table if not exists tember_evening_embers (
  id uuid primary key default gen_random_uuid(),
  date_key text not null,
  prompt_index integer not null default 0,
  prompt text not null,
  name text not null default 'Anonymous',
  text text not null,
  status text not null default 'approved' check (status in ('pending', 'approved', 'rejected', 'archived')),
  created_at timestamptz not null default now()
);

create index if not exists tember_evening_embers_date_created_idx on tember_evening_embers(date_key, created_at asc);
create index if not exists tember_evening_embers_status_idx on tember_evening_embers(status);

alter table tember_evening_embers enable row level security;

notify pgrst, 'reload schema';
