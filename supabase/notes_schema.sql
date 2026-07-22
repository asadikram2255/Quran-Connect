-- Quran Connect — notes storage.
--
-- Run this once, whole, in your Supabase project's SQL Editor. It creates the
-- table the app writes to and the policies that keep every note private to the
-- account that wrote it.
--
-- The client generates each note's id, so a note written offline keeps the same
-- identity when it is later uploaded, and syncing twice cannot duplicate it.

create table if not exists public.notes (
  id      uuid        primary key,
  user_id uuid        not null default auth.uid()
                      references auth.users (id) on delete cascade,
  sn      smallint    not null check (sn between 1 and 114),
  an      smallint    not null check (an between 1 and 286),
  body    text        not null default '',
  created timestamptz not null default now(),
  updated timestamptz not null default now(),
  -- Deletes are kept as tombstones so that deleting on the phone also removes
  -- the note from the laptop, instead of the laptop uploading it again.
  deleted boolean     not null default false
);

create index if not exists notes_user_ref_idx
  on public.notes (user_id, sn, an, created);

alter table public.notes enable row level security;

-- Four policies, one per verb: you only ever see and touch your own rows.
drop policy if exists notes_select on public.notes;
create policy notes_select on public.notes
  for select using (auth.uid() = user_id);

drop policy if exists notes_insert on public.notes;
create policy notes_insert on public.notes
  for insert with check (auth.uid() = user_id);

drop policy if exists notes_update on public.notes;
create policy notes_update on public.notes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists notes_delete on public.notes;
create policy notes_delete on public.notes
  for delete using (auth.uid() = user_id);
