-- ============================================================================
-- NEON PONG: CYBER CLASH — SUPABASE DATABASE SCHEMA
-- Jalankan query ini di Supabase Dashboard -> SQL Editor
-- ============================================================================

-- 1. Table Match History
create table if not exists match_history (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  winner text not null,
  host_name text not null,
  guest_name text not null,
  host_score int not null default 0,
  guest_score int not null default 0,
  max_rally int not null default 0,
  total_smashes int not null default 0,
  total_parries int not null default 0,
  room_code text
);

-- 2. Enable Row Level Security (RLS) & Public Policies
alter table match_history enable row level security;

-- Izinkan publik membaca match history untuk Leaderboard
drop policy if exists "Public can view match history" on match_history;
create policy "Public can view match history"
  on match_history for select
  using (true);

-- Izinkan publik menyimpan hasil pertandingan
drop policy if exists "Public can insert match history" on match_history;
create policy "Public can insert match history"
  on match_history for insert
  with check (true);
