-- training_progress.sql
-- Phase T-5: training_progress table
--
-- IMPORTANT: This file is created for local reference only.
-- Do NOT apply via supabase db push or SQL Editor until explicitly approved.
--
-- Stores per-user, per-task training completion state.
-- One row per (user_id, task_id) — upsert on repeat completions.

create table if not exists training_progress (
  user_id             uuid         not null references auth.users(id) on delete cascade,
  task_id             text         not null,
  completed_at        timestamptz  not null default now(),
  attempt_count       int          not null,
  best_attempt_count  int          not null,
  last_completed_step int          not null,
  created_at          timestamptz  not null default now(),
  updated_at          timestamptz  not null default now(),
  primary key (user_id, task_id)
);

-- ── RLS ────────────────────────────────────────────────────────────────────────

alter table training_progress enable row level security;

-- authenticated users can only read their own rows
create policy "training_progress_select_own"
  on training_progress
  for select
  to authenticated
  using (auth.uid() = user_id);

-- authenticated users can only insert their own rows
create policy "training_progress_insert_own"
  on training_progress
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- authenticated users can only update their own rows
create policy "training_progress_update_own"
  on training_progress
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No DELETE policy. anon role has no access. service_role not required.
