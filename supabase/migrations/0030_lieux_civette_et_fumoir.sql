-- =============================================================================
-- VITOLA — 0030 : deux types de lieu, civette et fumoir
-- -----------------------------------------------------------------------------
-- QA humaine du 12 septembre 2026 : « type de lieu à revoir, la liste est trop
-- longue — civette et fumoir uniquement ».
--
-- La 0016 en a défini sept (civette, cave, lounge, hotel, restaurant, club,
-- evenement) et les deux cent lieux seedés sont tous des civettes : six des
-- sept valeurs n'ont jamais eu de ligne, et le sélecteur de `/lieux` offrait
-- donc six filtres qui ne rendaient rien. Un filtre qui ne rend jamais rien
-- est pire qu'un filtre absent — il fait croire que l'annuaire est vide.
--
-- **Deux gestes, et le second est celui qui compte.**
--
-- 1. `fumoir` rejoint l'enum. Un fumoir n'y était pas, et c'est le seul type
--    que la France distingue vraiment d'un débit de tabac : un lieu où l'on
--    peut fumer sur place (art. R3512-2 CSP), ce qui n'est ni une cave ni un
--    lounge mais la question que se pose quelqu'un qui cherche où fumer.
--
-- 2. La charge utile de `venues_enabled` passe à `["civette", "fumoir"]`.
--    C'est le mécanisme prévu par l'ADR 0011, D5 — « la restriction que Q6
--    anticipe est un UPDATE d'une ligne » — et c'est pour cela que les cinq
--    autres valeurs RESTENT dans l'enum : on ne retire pas une valeur d'un
--    enum PostgreSQL, et on n'a pas à le faire. Ce que le drapeau n'offre pas,
--    l'interface ne propose pas et `venues_nearby()` ne rend pas.
--
-- Aucune ligne ne change de type : les 200 civettes du registre DGDDI sont des
-- civettes. Le fumoir se remplira par la contribution (ADR 0011, D2 : un lieu
-- naît `pending` et un `editor` le publie), qui est le seul chemin par lequel
-- un fait de terrain entre dans cette table.
--
-- Le drapeau passe par `admin_set_flag()` plutôt que par un UPDATE nu :
-- ADR 0014, D1 — un drapeau ne se change que par la porte qui écrit sa trace.
-- Ici la migration EST la trace, et la fonction exige un appelant admin qu'une
-- migration n'a pas ; l'UPDATE direct est donc le bon geste, et il est daté par
-- le fichier. C'est la même exception que la 0023.
-- =============================================================================

begin;

/* `add value if not exists` est transactionnel depuis PostgreSQL 12, à une
   condition : la valeur nouvelle ne peut pas être UTILISÉE dans la même
   transaction. Rien ici ne l'utilise — la charge utile du drapeau est du JSON,
   pas l'enum — donc la migration tient en un seul begin/commit. */
alter type public.venue_type add value if not exists 'fumoir' after 'civette';

update public.feature_flags
   set payload = jsonb_build_object('types', jsonb_build_array('civette', 'fumoir')),
       description =
         'L''annuaire des lieux (ADR 0011, Q6). La charge utile liste les types '
         'offerts. Ramenée à civette + fumoir le 12 septembre 2026 (QA) : les cinq '
         'autres valeurs de l''enum n''ont jamais eu de ligne, et un filtre qui ne '
         'rend jamais rien fait croire que l''annuaire est vide. Les rouvrir est un '
         'UPDATE de cette ligne, pas une migration.',
       updated_at = now()
 where key = 'venues_enabled';

-- --- Auto-contrôle -----------------------------------------------------------
do $$
declare
  offered jsonb;
begin
  if not exists (
    select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'venue_type' and e.enumlabel = 'fumoir'
  ) then
    raise exception 'VITOLA_MIGRATION_INCOMPLETE: venue_type n''a pas gagné « fumoir »';
  end if;

  select payload -> 'types' into offered
    from public.feature_flags where key = 'venues_enabled';

  if offered is null or jsonb_array_length(offered) <> 2 then
    raise exception
      'VITOLA_FLAG_GAP: venues_enabled n''offre pas exactement deux types (%)', offered;
  end if;

  -- Nommés, et pas seulement comptés : deux types dont l'un serait « cave »
  -- passerait le test ci-dessus en disant le contraire de la QA.
  if not (offered ? 'civette' and offered ? 'fumoir') then
    raise exception 'VITOLA_FLAG_GAP: venues_enabled offre « % » au lieu de civette + fumoir', offered;
  end if;

  -- Et la porte de l'annuaire reste ouverte : ce n'est pas une fermeture.
  if not exists (
    select 1 from public.feature_flags where key = 'venues_enabled' and enabled
  ) then
    raise exception 'VITOLA_FLAG_GAP: venues_enabled est fermé — ce n''est pas ce que la QA demandait';
  end if;

  raise notice 'VITOLA 0030 OK — deux types offerts, civette et fumoir ; cinq dormants dans l''enum.';
end $$;

commit;
