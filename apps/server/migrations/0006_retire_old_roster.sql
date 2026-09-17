-- Retire the pre-DEC-030 roster from live data.
--
-- DEC-030 cut the land types down to a ring of three (Reiðmaður, Berserkur, Bogamaður) and deleted
-- the Shieldwall; DEC-031 replaced the single Longship with six kinds. The catalogue changed, the
-- rows in this database did not, and on 17 Sep that combination took the game down: GET /v1/hall
-- calls stacksAt(), stacksAt() asks the catalogue what each stack carries, the catalogue had never
-- heard of 'shieldwall', and the 404 that came back made the client believe the player had no hall
-- at all and offer them a new character.
--
-- This migration moves the data onto the new names. The code was hardened in the same commit so a
-- retired type can never again take the hall down — but the code fix only stops the crash. Without
-- this file the player silently loses whatever is standing under an old name, which is worse.

-- 1. The Shieldwall is gone and has no successor. Hawk's call: delete rather than fold into
--    Berserkur, so that nothing ends up standing in a hall that never trained it.
delete from troops where type = 'shieldwall';

-- 2. The rest keep their count and their tier; only the name changes. Done as insert-then-delete
--    rather than a plain UPDATE because (hall_id, type, tier) is the primary key: if a hall somehow
--    holds both 'berserker' and 'berserkur' at the same tier, an UPDATE would hit a unique
--    violation and take the whole deploy down. This merges them instead.
do $$
declare m record;
begin
  for m in
    select * from (values
      ('berserker', 'berserkur'),
      ('archer',    'bogamadur'),
      ('rider',     'reidmadur'),
      ('longship',  'snekkja')
    ) as t(old_name, new_name)
  loop
    insert into troops (hall_id, kingdom_id, type, tier, count)
      select hall_id, kingdom_id, m.new_name, tier, count from troops where type = m.old_name
      on conflict (hall_id, type, tier) do update set count = troops.count + excluded.count;
    delete from troops where type = m.old_name;
  end loop;
end $$;

-- 3. Troops away on a march are not in the troops table — they live in marches.composition, keyed
--    "type:tier" (marches/service.ts). Same remap, same deletion, or they throw the identical error
--    the moment the march comes home and tries to put them back.
update marches m
set composition = coalesce((
  select jsonb_object_agg(new_key, total)
  from (
    select
      case split_part(e.k, ':', 1)
        when 'berserker' then 'berserkur'
        when 'archer'    then 'bogamadur'
        when 'rider'     then 'reidmadur'
        when 'longship'  then 'snekkja'
        else split_part(e.k, ':', 1)
      end || ':' || split_part(e.k, ':', 2) as new_key,
      sum(e.v::bigint) as total
    from jsonb_each_text(m.composition) as e(k, v)
    where split_part(e.k, ':', 1) <> 'shieldwall'
    group by 1
  ) s
), '{}'::jsonb)
where m.composition is not null
  and m.composition <> '{}'::jsonb;

-- 4. A march that was carrying nothing but Shieldwall now has an empty crew. It cannot arrive with
--    no men in it, so it is cancelled rather than left to land as a ghost.
update marches set state = 'cancelled'
where composition = '{}'::jsonb
  and state in ('travelling', 'gathering', 'returning');
