
create table if not exists public.installations (
  instanceld text primary key,
  instance_name text,
  instance_id text,
  phone_number text,
  company_id text,
  access_token text,
  refresh_token text,
  updated_at timestamptz default now()
);
