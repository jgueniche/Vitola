-- =============================================================================
-- VITOLA — 0029 : la note n'a plus d'échelle à choisir
-- -----------------------------------------------------------------------------
-- Suite de la 0028. La note se lit en bagues, sur cinq, pour tout le monde ;
-- il n'y a donc plus de préférence à exprimer, et `profile_settings.preferences
-- ->> 'score_scale'` n'a plus ni lecteur ni écrivain.
--
-- Le CHECK, lui, EXIGE la clé : `(preferences ->> 'score_scale') in ('100',
-- '20')` est faux quand la clé est absente, donc un formulaire qui cesse de
-- l'écrire ne casse pas silencieusement — il casse en 23514, à l'enregistrement
-- du profil. C'est pour cela que le retirer est une migration et non un
-- nettoyage : une contrainte qui exige une donnée que plus rien ne produit est
-- une bombe à retardement posée sur le seul écran où l'on répare ses réglages.
--
-- Et on retire la clé des lignes existantes, plutôt que de la laisser vieillir
-- dans le blob. `readPreferences()` jette ce qu'il ne reconnaît pas — la
-- préférence disparue serait donc invisible et persistante, ce qui est
-- exactement la « junk qui s'accumule » que `lib/settings/model.ts` dit
-- vouloir éviter.
--
-- Ce qui NE bouge pas : `reviews.score_total`, toujours sur cent (0028), et
-- `preferences.length_unit`, qui reste une vraie préférence — le pouce est une
-- unité que le métier emploie, la note sur vingt était un goût d'affichage.
-- =============================================================================

begin;

alter table public.profile_settings
  drop constraint if exists profile_settings_score_scale;

-- Le DÉFAUT de la colonne aussi, et c'est lui qui compte le plus : tant qu'il
-- écrit `score_scale`, chaque compte nouveau naît avec une préférence morte,
-- et le formulaire des réglages part d'un objet différent de celui de la
-- colonne — donc le premier enregistrement « corrige » une clé que personne
-- n'a touchée. C'est exactement ce que pinne `tests/unit/settings-model.test.ts`.
alter table public.profile_settings
  alter column preferences
  set default '{"length_unit": "mm", "email_digest": false}'::jsonb;

update public.profile_settings
   set preferences = preferences - 'score_scale'
 where preferences ? 'score_scale';

-- --- Auto-contrôle -----------------------------------------------------------
do $$
declare n integer;
begin
  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.profile_settings'::regclass
       and conname = 'profile_settings_score_scale'
  ) then
    raise exception
      'VITOLA_MIGRATION_INCOMPLETE: profile_settings_score_scale est encore là';
  end if;

  select count(*) into n
    from public.profile_settings
   where preferences ? 'score_scale';
  if n <> 0 then
    raise exception 'VITOLA_SHAPE_GAP: % lignes portent encore score_scale', n;
  end if;

  if (select column_default from information_schema.columns
       where table_schema = 'public' and table_name = 'profile_settings'
         and column_name = 'preferences') like '%score_scale%' then
    raise exception
      'VITOLA_SHAPE_GAP: le défaut de preferences écrit encore score_scale';
  end if;

  -- Les deux CHECK qui restent sur la colonne sont ceux qui disent ce qu'elle
  -- EST, et non ce qu'elle contient. Les perdre serait ouvrir le blob.
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.profile_settings'::regclass
       and conname = 'profile_settings_preferences_object'
  ) then
    raise exception
      'VITOLA_MIGRATION_INCOMPLETE: preferences a perdu sa contrainte de type objet';
  end if;

  raise notice 'VITOLA 0029 OK — plus d''échelle à choisir, la bague est l''échelle.';
end $$;

commit;
