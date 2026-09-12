-- Troops (P3.T01, units.md).
--
-- A stack is a count of one type at one tier standing in one hall. Troops that are away are NOT in
-- this table: they live in the march's composition until it comes home. That way "how many do I
-- have here" is one row rather than a sum over marches, and a march cannot spend troops twice.

create table troops (
  hall_id uuid not null references halls(id),
  kingdom_id uuid not null references kingdoms(id),
  -- shieldwall | berserker | archer | longship (units.md rule 1 and 2)
  type text not null,
  tier int not null default 1,
  count bigint not null default 0,
  primary key (hall_id, type, tier)
);
create index troops_kingdom on troops (kingdom_id);

alter table troops add constraint troops_count_never_negative check (count >= 0);
