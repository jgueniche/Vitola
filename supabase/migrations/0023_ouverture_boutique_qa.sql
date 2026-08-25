-- =============================================================================
-- 0023 · L'ouverture de la boutique — le drapeau passe à VRAI, tracé
-- -----------------------------------------------------------------------------
-- Décision du porteur, 25 août 2026 : la boutique est publique de bout en
-- bout pour la QA — catalogue, fiches, vitrines, panier et paiement de
-- démonstration. Le drapeau `shop_enabled` né fermé dans la 0022 s'ouvre ici.
--
-- Pourquoi une migration et pas `admin_set_flag()` : la porte de la 0020
-- exige une session admin (`auth.uid()`), qu'une migration n'a pas — et cette
-- ouverture-ci n'est pas un geste d'exploitation mais un déploiement : elle
-- arrive AVEC le code qui la promet (l'entrée « Boutique » de l'en-tête, le
-- tunnel d'achat, l'accueil). Un drapeau naît dans une migration avec le code
-- qui le lit (ADR 0014, D2) ; il s'ouvre ici avec le code qui le montre.
-- La propriété que la porte protège — jamais de changement sans trace dans la
-- même transaction — est conservée : l'UPDATE et la ligne d'audit_log sont
-- dans le même COMMIT, l'acteur est NULL parce que l'acte est un déploiement
-- et non une session (le même NULL que les actes à clé de service).
--
-- `admin_set_flag()` reste LE chemin d'exploitation : couper la boutique en
-- urgence, ou la rouvrir, se fait depuis /admin/drapeaux, tracé et signé.
-- =============================================================================

begin;

do $$
declare
  v_before jsonb;
  v_after  jsonb;
begin
  select to_jsonb(f) into v_before from public.feature_flags f where f.key = 'shop_enabled';
  if v_before is null then
    raise exception 'VITOLA_FLAG_UNKNOWN: shop_enabled — la 0022 doit passer avant la 0023';
  end if;

  update public.feature_flags f
     set enabled = true,
         description = 'La boutique publique (ADR 0016) : /boutique, fiches produit, vitrines '
                       'de vendeurs et tunnel d''achat de démonstration. Ouverte le 25 août '
                       '2026 (QA, décision du porteur) ; la couper depuis /admin/drapeaux est '
                       'le coupe-circuit — l''entrée de navigation, elle, reste affichée.'
   where f.key = 'shop_enabled';

  select to_jsonb(f) into v_after from public.feature_flags f where f.key = 'shop_enabled';

  insert into public.audit_log
    (actor_id, action, entity_schema, entity_table, entity_id, before_state, after_state)
  values
    (null, 'flag_set', 'public', 'feature_flags', 'shop_enabled', v_before, v_after);
end $$;

-- =============================================================================
-- AUTO-CONTRÔLE
-- =============================================================================

do $$
begin
  -- 1. Le drapeau est ouvert.
  if not exists (select 1 from public.feature_flags where key = 'shop_enabled' and enabled) then
    raise exception 'VITOLA_SHAPE_GAP: shop_enabled devrait etre ouvert apres la 0023';
  end if;

  -- 2. L'ouverture a sa trace, dans la même transaction que l'UPDATE.
  if not exists (
    select 1 from public.audit_log
     where action = 'flag_set' and entity_id = 'shop_enabled'
       and (after_state ->> 'enabled')::boolean
  ) then
    raise exception 'VITOLA_TRACE_GAP: l ouverture de shop_enabled n a pas laisse de trace';
  end if;
end $$;

commit;
