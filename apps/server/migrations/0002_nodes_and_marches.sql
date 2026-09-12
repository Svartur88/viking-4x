-- Resource nodes and marches (P3.M01).
--
-- Shape follows 04-Team/02-Systems-Designer/notes/march-tick.md exactly: no world tick, a march is a
-- row plus two or three timers, and the client interpolates its position between them. This
-- migration ships the gather branch; attack, scout, rally and garrison reuse the same table and the
-- same timer kinds, so raiding is a new arrival handler rather than a new engine.

create table nodes (
  id uuid primary key,
  kingdom_id uuid not null references kingdoms(id),
  x int not null, y int not null,
  -- grain | timber | stone | iron
  resource text not null,
  level int not null,
  -- What is left in the ground. A node depletes and is removed; map.md rule 6 respawns it
  -- elsewhere in the same zone four hours later (respawn is Later, not in this migration).
  remaining bigint not null,
  -- The march currently working it. One march per node (economy.md rule 5), enforced here rather
  -- than in application code so two simultaneous arrivals cannot both claim it.
  held_by uuid,
  created_at timestamptz not null default now(),
  unique (kingdom_id, x, y)
);
create index nodes_kingdom_resource on nodes (kingdom_id, resource, level);
create index nodes_kingdom_free on nodes (kingdom_id) where held_by is null;

create table marches (
  id uuid primary key,
  kingdom_id uuid not null references kingdoms(id),
  player_id uuid not null references players(id),
  hall_id uuid not null references halls(id),
  -- gather now; scout | attack | rally_join | garrison | voyage later (combat.md part 1 rule 2)
  kind text not null,
  -- travelling | gathering | returning | done | cancelled (march-tick.md)
  state text not null default 'travelling',
  origin_x int not null, origin_y int not null,
  target_x int not null, target_y int not null,
  target_id uuid,
  -- Who is marching. Troops do not exist yet, so this holds a placeholder crew; when the Barracks
  -- lands it becomes stacks by type and tier and nothing else here changes.
  composition jsonb not null default '{}',
  carry_capacity bigint not null,
  -- What is being carried home: {"grain": 1200} and so on.
  cargo jsonb not null default '{}',
  departed_at timestamptz not null default now(),
  arrives_at timestamptz,
  returns_at timestamptz,
  completed_at timestamptz,
  version int not null default 0
);
create index marches_player_state on marches (player_id, state);
create index marches_kingdom_state on marches (kingdom_id, state);

-- A node can only be held by a march that exists.
alter table nodes add constraint nodes_held_by_march foreign key (held_by) references marches(id) on delete set null;
