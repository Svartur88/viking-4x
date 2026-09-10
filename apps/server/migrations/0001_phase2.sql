-- Migration 0001 — Phase 2 tables (schema-v0.md)
create extension if not exists pgcrypto;

create table accounts (
  id uuid primary key,
  provider text not null,
  provider_sub text,
  email text,
  device_id_hash text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (provider, provider_sub)
);

create table kingdoms (
  id uuid primary key,
  seed bigint not null,
  size int not null,
  tz_offset_minutes int not null default 0,
  opened_at timestamptz not null default now(),
  state text not null default 'open',
  config jsonb not null default '{}',
  terrain bytea,
  age_days int not null default 0
);

create table players (
  id uuid primary key,
  kingdom_id uuid not null references kingdoms(id),
  account_id uuid not null references accounts(id),
  name text not null,
  tribe_id uuid,
  rank smallint not null default 1,
  power bigint not null default 0,
  power_at timestamptz,
  rank_vip smallint not null default 0,
  amber int not null default 0,
  silver bigint not null default 0,
  stamina int not null default 100,
  stamina_at timestamptz not null default now(),
  shield_until timestamptz,
  starter_shield_until timestamptz,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (kingdom_id, account_id),
  unique (kingdom_id, name)
);
create index players_kingdom_tribe on players (kingdom_id, tribe_id);
create index players_kingdom_power on players (kingdom_id, power desc);

create table halls (
  id uuid primary key,
  kingdom_id uuid not null references kingdoms(id),
  player_id uuid not null unique references players(id),
  x int not null, y int not null,
  wall_durability int not null default 100,
  burning boolean not null default false,
  grain bigint not null default 0, timber bigint not null default 0,
  stone bigint not null default 0, iron bigint not null default 0,
  resources_at timestamptz not null default now(),
  unique (kingdom_id, x, y)
);

create table buildings (
  id uuid primary key,
  kingdom_id uuid not null references kingdoms(id),
  hall_id uuid not null references halls(id),
  kind text not null,
  slot smallint not null default 0,
  level smallint not null default 0,
  unique (hall_id, kind, slot)
);

create table occupants (
  kingdom_id uuid not null references kingdoms(id),
  x int not null, y int not null,
  type text not null,
  ref_id uuid not null,
  updated_at timestamptz not null default now(),
  primary key (kingdom_id, x, y)
);
create index occupants_kingdom_type on occupants (kingdom_id, type);

create table timers (
  id uuid primary key,
  kingdom_id uuid not null references kingdoms(id),
  hall_id uuid,
  kind text not null,
  ref_type text, ref_id uuid,
  payload jsonb not null default '{}',
  started_at timestamptz not null default now(),
  base_seconds int not null,
  due_at timestamptz not null,
  job_id text,
  state text not null default 'pending',
  completed_at timestamptz,
  version int not null default 0
);
create index timers_state_due on timers (state, due_at);
create index timers_hall_state on timers (hall_id, state);
create unique index timers_one_pending_per_ref on timers (ref_type, ref_id) where state = 'pending';
