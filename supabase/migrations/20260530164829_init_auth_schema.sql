create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table workplaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table workplace_members (
  workplace_id uuid not null references workplaces(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null check (
    role in (
      'owner',
      'editor',
      'viewer'
    )
  ),
  created_at timestamptz not null default now(),

  primary key (
    workplace_id,
    user_id
  )
);
