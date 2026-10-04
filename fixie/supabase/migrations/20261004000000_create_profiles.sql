-- Profiles hold only the three answers from "Tell the fairies about you".
-- No name, email or photo from Google is stored here.

create schema if not exists private;

-- Check constraints can't use subqueries, so "no duplicates" lives in an
-- immutable helper, in a schema the API doesn't expose.
create function private.is_distinct_array(items text[])
returns boolean
language sql
immutable
as $$
  select count(*) = count(distinct item) from unnest(items) as item
$$;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  space text check (space in ('indoors', 'balcony', 'yard')),
  interests text[] not null default '{}' check (
    interests <@ array['plants', 'organizing', 'decor', 'gifts', 'kids']
    and array_position(interests, null) is null
    and private.is_distinct_array(interests)
  ),
  tools text[] not null default '{}' check (
    tools <@ array['scissors_tape', 'basic_tools', 'glue_paint', 'sewing']
    and array_position(tools, null) is null
    and private.is_distinct_array(tools)
  ),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Upcycling preferences per account. Values must match the Zod enums in lib/scan/schema.ts.';

create function private.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function private.touch_updated_at();

-- The checks and the trigger run as the signed-in user, so they need to
-- reach these helpers. The API only exposes the public schema, so this
-- doesn't make them callable from outside.
grant usage on schema private to authenticated;

-- Row-level security: each person can see and change only their own row.
alter table public.profiles enable row level security;

create policy "Users can read their own profile"
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

create policy "Users can create their own profile"
on public.profiles for insert
to authenticated
with check ((select auth.uid()) = id);

create policy "Users can update their own profile"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

-- No delete policy and no list-all policy. A row goes away only when its
-- auth user is deleted (on delete cascade above).

-- Signed-out visitors never touch this table, even through a policy mistake.
revoke all on public.profiles from anon;
