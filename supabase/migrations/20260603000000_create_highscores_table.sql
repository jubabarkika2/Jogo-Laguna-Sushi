-- Create table for high scores
create table if not exists public.highscores (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  score integer not null,
  date text not null,
  is_order_courier boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security (RLS)
alter table public.highscores enable row level security;

-- Policy to allow anonymous read access to leaderboard
create policy "Allow public read access to leaderboard"
on public.highscores
for select
using (true);

-- Policy to allow anonymous insert access to save scores
create policy "Allow public insert access to save scores"
on public.highscores
for insert
with check (true);
