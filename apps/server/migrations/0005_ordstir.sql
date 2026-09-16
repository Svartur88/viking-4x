-- Orðstír (DEC-029): renown, earned only by going a-viking.
--
-- It is NOT a resource and deliberately does not live with grain/timber/stone/iron: it has no
-- production rate, no storage cap, and no settle step. Two research trees — Víking and Hirð — are
-- bought with it and with nothing else, so that farm output cannot buy war research. Rise of
-- Empires: Ice and Fire does the same thing with Courage Medals, and the separation is the point.
--
-- A column on halls rather than a ledger table: there is exactly one balance per hall and nothing
-- yet needs the history. When the raid resolver starts awarding it, a ledger may be worth adding —
-- that would be a migration, not a rewrite.
alter table halls add column ordstir bigint not null default 0;

alter table halls add constraint halls_ordstir_never_negative check (ordstir >= 0);
