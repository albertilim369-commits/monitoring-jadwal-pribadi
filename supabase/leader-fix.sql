-- Leader Account Manager Fix
-- Jalankan file ini di Supabase SQL Editor kalau panel Leader menampilkan:
-- "Fitur leader belum aktif di database."

alter table public.profiles
  add column if not exists role text not null default 'member';

do $$
begin
  alter table public.profiles
    add constraint profiles_role_check check (role in ('leader', 'member'));
exception
  when duplicate_object then null;
end $$;

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

drop function if exists public.leader_accounts();
drop function if exists public.leader_delete_account(uuid);

create function public.leader_accounts()
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

create function public.leader_delete_account(target_user_id uuid)
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

drop policy if exists "Users can read their profile" on public.profiles;
create policy "Users can read their profile"
  on public.profiles for select
  using (auth.uid() = user_id or public.is_leader());

notify pgrst, 'reload schema';

select
  to_regprocedure('public.leader_accounts()') is not null as leader_accounts_ready,
  to_regprocedure('public.leader_delete_account(uuid)') is not null as leader_delete_ready,
  exists (
    select 1
    from public.profiles
    where username = 'arnold'
      and role = 'leader'
  ) as arnold_is_leader;
