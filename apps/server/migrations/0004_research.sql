-- Research (research.md, the Rune Hall's three branches).
--
-- One row per node a hall has actually taken. A node nobody has started has no row; the client
-- reads "level 0" from its absence rather than from a table of forty-four zeroes per hall.
--
-- node_id is the ascii slug from src/research/catalogue.ts, never the Icelandic display name.
-- The names are still being judged and will change; the ids must not, or every row here orphans.

create table research (
  hall_id uuid not null references halls(id),
  kingdom_id uuid not null references kingdoms(id),
  node_id text not null,
  level int not null default 0,
  primary key (hall_id, node_id)
);
create index research_kingdom on research (kingdom_id);

alter table research add constraint research_level_never_negative check (level >= 0);

-- One research at a time per hall (research.md rule 2). The second queue at Longhouse 16 comes from
-- tribe tech and will raise this to two; it is a partial index rather than a column so that raising
-- it is a migration and not a rewrite.
--
-- Note this is deliberately NOT the same shape as timers_one_pending_per_ref: that one is per REF,
-- which would allow two different nodes at once. The constraint here is per HALL.
create unique index research_one_pending_per_hall
  on timers (hall_id)
  where kind = 'research' and state = 'pending';
