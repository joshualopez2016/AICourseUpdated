-- =====================================================================
-- notes_crud.sql — "Unit Notes" feature (full CRUD, per-user)
-- =====================================================================
-- A note is a free-text annotation a logged-in user attaches to a unit
-- (identified by product line + serial). Demonstrates Create / Read /
-- Update / Delete with Row Level Security so each user only ever sees and
-- edits their OWN notes.
--
-- Run in: Supabase -> SQL Editor -> New query -> paste -> Run.
-- =====================================================================

create table if not exists public.notes (
    id         bigint generated always as identity primary key,
    user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
    source     text not null,          -- product line (Boat / FLY / Hand_Held)
    serial     text not null,          -- unit serial, e.g. 270-10741
    body       text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists notes_unit_idx on public.notes (source, serial);
create index if not exists notes_user_idx on public.notes (user_id);

alter table public.notes enable row level security;

-- Each user can only see / create / edit / delete their OWN notes.
drop policy if exists notes_select on public.notes;
create policy notes_select on public.notes for select to authenticated
    using (user_id = auth.uid());

drop policy if exists notes_insert on public.notes;
create policy notes_insert on public.notes for insert to authenticated
    with check (user_id = auth.uid());

drop policy if exists notes_update on public.notes;
create policy notes_update on public.notes for update to authenticated
    using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists notes_delete on public.notes;
create policy notes_delete on public.notes for delete to authenticated
    using (user_id = auth.uid());

grant select, insert, update, delete on public.notes to authenticated;

-- Verify:
select 'notes table ready' as status;
