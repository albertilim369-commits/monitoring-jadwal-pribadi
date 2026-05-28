create extension if not exists "pgcrypto";

do $$
begin
  create type public.task_priority as enum ('high', 'medium', 'low');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.task_status as enum ('todo', 'in_progress', 'done');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  date date not null,
  time time,
  note text,
  color_label text default 'neutral' check (color_label in ('red', 'blue', 'green', 'yellow', 'neutral')),
  status text not null default 'scheduled' check (status in ('scheduled', 'done')),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.events
  add column if not exists status text not null default 'scheduled';

alter table public.events
  add column if not exists completed_at timestamptz;

do $$
begin
  alter table public.events
    add constraint events_status_check check (status in ('scheduled', 'done'));
exception
  when duplicate_object then null;
end $$;

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  deadline date not null,
  priority public.task_priority not null default 'medium',
  status public.task_status not null default 'todo',
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9._]{3,32}$'),
  email text not null,
  role text not null default 'member' check (role in ('leader', 'member')),
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists role text not null default 'member';

do $$
begin
  alter table public.profiles
    add constraint profiles_role_check check (role in ('leader', 'member'));
exception
  when duplicate_object then null;
end $$;

create table if not exists public.subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  is_done boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.task_updates (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  note text not null check (char_length(trim(note)) > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.schedule_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('task', 'event')),
  name text not null check (char_length(trim(name)) > 0),
  title text not null check (char_length(trim(title)) > 0),
  note text,
  priority public.task_priority,
  color_label text check (color_label in ('red', 'blue', 'green', 'yellow', 'neutral')),
  checklist_items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists events_user_date_idx on public.events (user_id, date);
create index if not exists tasks_user_deadline_idx on public.tasks (user_id, deadline);
create index if not exists tasks_user_priority_deadline_idx on public.tasks (user_id, priority, deadline);
create index if not exists profiles_username_idx on public.profiles (username);
create index if not exists subtasks_task_created_idx on public.subtasks (task_id, created_at);
create index if not exists task_updates_task_created_idx on public.task_updates (task_id, created_at desc);
create index if not exists schedule_templates_user_type_idx on public.schedule_templates (user_id, type, created_at);

alter table public.events enable row level security;
alter table public.tasks enable row level security;
alter table public.profiles enable row level security;
alter table public.subtasks enable row level security;
alter table public.task_updates enable row level security;
alter table public.schedule_templates enable row level security;

create or replace function public.normalize_username(input_username text)
returns text
language sql
immutable
as $$
  select lower(trim(input_username));
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_username text;
begin
  clean_username := public.normalize_username(new.raw_user_meta_data ->> 'username');

  if clean_username is null or clean_username !~ '^[a-z0-9._]{3,32}$' then
    raise exception 'Username wajib 3-32 karakter dan hanya boleh huruf, angka, titik, atau underscore.';
  end if;

  insert into public.profiles (user_id, username, email, role)
  values (
    new.id,
    clean_username,
    new.email,
    case when clean_username = 'arnold' then 'leader' else 'member' end
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.get_email_by_username(login_username text)
returns table (email text)
language sql
security definer
set search_path = public
as $$
  select profiles.email
  from public.profiles
  where profiles.username = public.normalize_username(login_username)
  limit 1;
$$;

revoke all on function public.get_email_by_username(text) from public;
grant execute on function public.get_email_by_username(text) to anon, authenticated;

create or replace function public.is_leader()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where profiles.user_id = auth.uid()
      and profiles.role = 'leader'
  );
$$;

revoke all on function public.is_leader() from public;
grant execute on function public.is_leader() to authenticated;

create or replace function public.prevent_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() = old.user_id and old.role is distinct from new.role then
    raise exception 'Role hanya bisa diubah oleh sistem.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_profile_role_change on public.profiles;
create trigger prevent_profile_role_change
  before update on public.profiles
  for each row execute function public.prevent_profile_role_change();

update public.profiles
set role = 'leader'
where username = 'arnold';

create or replace function public.leader_accounts()
returns table (
  user_id uuid,
  username text,
  email text,
  role text,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language sql
security definer
set search_path = public, auth
as $$
  select
    profiles.user_id,
    profiles.username,
    profiles.email,
    profiles.role,
    profiles.created_at,
    users.last_sign_in_at
  from public.profiles
  left join auth.users
    on users.id = profiles.user_id
  where public.is_leader()
  order by
    case when profiles.username = 'arnold' then 0 else 1 end,
    profiles.created_at desc;
$$;

revoke all on function public.leader_accounts() from public;
grant execute on function public.leader_accounts() to authenticated;

create or replace function public.leader_delete_account(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_username text;
begin
  if not public.is_leader() then
    raise exception 'Fitur ini hanya untuk akun leader.';
  end if;

  if target_user_id is null then
    raise exception 'Pilih akun yang ingin dihapus.';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'Akun yang sedang dipakai tidak bisa menghapus dirinya sendiri.';
  end if;

  select profiles.username
    into target_username
  from public.profiles
  where profiles.user_id = target_user_id;

  if target_username is null then
    raise exception 'Akun tidak ditemukan.';
  end if;

  if target_username = 'arnold' then
    raise exception 'Akun leader utama arnold tidak boleh dihapus.';
  end if;

  delete from auth.users as auth_users
  where auth_users.id = target_user_id;
end;
$$;

revoke all on function public.leader_delete_account(uuid) from public;
grant execute on function public.leader_delete_account(uuid) to authenticated;

drop policy if exists "Users can read their events" on public.events;
create policy "Users can read their events"
  on public.events for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their events" on public.events;
create policy "Users can create their events"
  on public.events for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their events" on public.events;
create policy "Users can update their events"
  on public.events for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their events" on public.events;
create policy "Users can delete their events"
  on public.events for delete
  using (auth.uid() = user_id);

drop policy if exists "Users can read their tasks" on public.tasks;
create policy "Users can read their tasks"
  on public.tasks for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their tasks" on public.tasks;
create policy "Users can create their tasks"
  on public.tasks for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their tasks" on public.tasks;
create policy "Users can update their tasks"
  on public.tasks for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their tasks" on public.tasks;
create policy "Users can delete their tasks"
  on public.tasks for delete
  using (auth.uid() = user_id);

drop policy if exists "Users can read their profile" on public.profiles;
create policy "Users can read their profile"
  on public.profiles for select
  using (auth.uid() = user_id or public.is_leader());

drop policy if exists "Users can update their profile" on public.profiles;
create policy "Users can update their profile"
  on public.profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can read their subtasks" on public.subtasks;
create policy "Users can read their subtasks"
  on public.subtasks for select
  using (
    exists (
      select 1 from public.tasks
      where tasks.id = subtasks.task_id
        and tasks.user_id = auth.uid()
    )
  );

drop policy if exists "Users can create their subtasks" on public.subtasks;
create policy "Users can create their subtasks"
  on public.subtasks for insert
  with check (
    exists (
      select 1 from public.tasks
      where tasks.id = subtasks.task_id
        and tasks.user_id = auth.uid()
    )
  );

drop policy if exists "Users can update their subtasks" on public.subtasks;
create policy "Users can update their subtasks"
  on public.subtasks for update
  using (
    exists (
      select 1 from public.tasks
      where tasks.id = subtasks.task_id
        and tasks.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.tasks
      where tasks.id = subtasks.task_id
        and tasks.user_id = auth.uid()
    )
  );

drop policy if exists "Users can delete their subtasks" on public.subtasks;
create policy "Users can delete their subtasks"
  on public.subtasks for delete
  using (
    exists (
      select 1 from public.tasks
      where tasks.id = subtasks.task_id
        and tasks.user_id = auth.uid()
    )
  );

drop policy if exists "Users can read their task updates" on public.task_updates;
create policy "Users can read their task updates"
  on public.task_updates for select
  using (
    exists (
      select 1 from public.tasks
      where tasks.id = task_updates.task_id
        and tasks.user_id = auth.uid()
    )
  );

drop policy if exists "Users can create their task updates" on public.task_updates;
create policy "Users can create their task updates"
  on public.task_updates for insert
  with check (
    exists (
      select 1 from public.tasks
      where tasks.id = task_updates.task_id
        and tasks.user_id = auth.uid()
    )
  );

drop policy if exists "Users can delete their task updates" on public.task_updates;
create policy "Users can delete their task updates"
  on public.task_updates for delete
  using (
    exists (
      select 1 from public.tasks
      where tasks.id = task_updates.task_id
        and tasks.user_id = auth.uid()
    )
  );

drop policy if exists "Users can read their templates" on public.schedule_templates;
create policy "Users can read their templates"
  on public.schedule_templates for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their templates" on public.schedule_templates;
create policy "Users can create their templates"
  on public.schedule_templates for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their templates" on public.schedule_templates;
create policy "Users can update their templates"
  on public.schedule_templates for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their templates" on public.schedule_templates;
create policy "Users can delete their templates"
  on public.schedule_templates for delete
  using (auth.uid() = user_id);
