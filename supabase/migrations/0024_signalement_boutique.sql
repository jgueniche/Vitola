-- =============================================================================
-- VITOLA — 0024 : la boutique devient signalable — deux surfaces de plus dans
--                 la file DSA
-- -----------------------------------------------------------------------------
-- La boutique est publique depuis le 25 août 2026 (0023) et liste du contenu
-- de vendeurs tiers DEVANT le portail : une fiche produit et une vitrine sont,
-- avec le journal, ce que le site publie de plus exposé — et `mod.reports` ne
-- savait pas les recevoir. Son CHECK `reports_entity_known` borne les cibles à
-- neuf surfaces ; ce fichier en ajoute deux, et rien d'autre.
--
-- Ce qui ne change PAS, et pourquoi :
--   - `file_report()` : sa cible est générique (schéma, table, identifiant en
--     texte) et c'est le CHECK qui borne — élargir le CHECK suffit, la porte
--     reste de la taille du geste (0006).
--   - `mod_decide()` : `hide` et `restore` restent refusés sur ces deux
--     surfaces (VITOLA_TARGET_NOT_HIDEABLE). Ni `products` ni `vendors` ne
--     portent de colonnes `hidden_*`, et l'acte sur un produit signalé existe
--     déjà sous sa propre forme : dépublier (`/admin/boutique`, policy
--     `products_update_admin`) ou suspendre le vendeur (`vendors_update_admin`,
--     qui coupe vitrine et produits en un UPDATE — ADR 0016, D4). La décision
--     s'enregistre dans la file ; l'acte passe par le chemin qui existe
--     (ADR 0013, D4 : pas de verbe sans bras).
--   - `shop.product_reviews` reste HORS du CHECK : aucune porte d'écriture
--     n'existe (ADR 0015, D3), donc aucune ligne à signaler. La surface entrera
--     avec la caisse, comme l'ADR 0016 l'annonce.
--   - Le mécanisme reste derrière une session, et la route derrière le portail :
--     voir docs/decisions-log.md, « La boutique se signale, et la route ne
--     bouge pas ».
-- =============================================================================

begin;

-- =============================================================================
-- §1 · LE CHECK
-- -----------------------------------------------------------------------------
-- Réécrit en entier, comme 0010, 0014 et 0016 avant lui : un CHECK ne s'étend
-- pas, il se remplace, et la dernière définition est celle que
-- `tests/compliance/dsa.test.ts` relit (`lastCheck`) pour l'épingler à
-- `REPORTABLE` dans les deux sens — une surface ici sans bouton « Signaler »
-- est une promesse que personne ne tient, et l'inverse une porte sans file.
-- =============================================================================

alter table mod.reports drop constraint reports_entity_known;
alter table mod.reports add constraint reports_entity_known check (
  entity_schema || '.' || entity_table in
    ('public.comments', 'public.reviews', 'ref.cigars', 'public.profiles',
     'public.posts', 'public.post_comments', 'public.messages',
     'public.venues', 'public.venue_reviews',
     'shop.products', 'shop.vendors')
);

comment on constraint reports_entity_known on mod.reports is
  'The closed list of reportable surfaces. Mirrored by REPORTABLE in '
  'lib/compliance/dsa.ts, pinned both ways by tests/compliance/dsa.test.ts. '
  'shop.products and shop.vendors joined with 0024: the shop is public and '
  'lists third-party content in front of the age gate.';

-- =============================================================================
-- §2 · AUTO-CONTRÔLE
-- =============================================================================

do $$
declare
  v_check  text;
  n        integer;
  offender text;
begin
  -- 1. Le CHECK connaît les deux surfaces, et ne connaît pas les avis produits.
  select pg_get_constraintdef(c.oid) into v_check
    from pg_constraint c
   where c.conrelid = 'mod.reports'::regclass and c.conname = 'reports_entity_known';
  if v_check is null then
    raise exception 'VITOLA_SCOPE_GAP: reports_entity_known a disparu';
  end if;
  if v_check !~ 'shop\.products' or v_check !~ 'shop\.vendors' then
    raise exception 'VITOLA_SCOPE_GAP: mod.reports ne connait pas la boutique';
  end if;
  if v_check ~ 'product_reviews' then
    raise exception
      'VITOLA_SCOPE_GAP: les avis produits entrent dans la file avant d avoir une porte d ecriture (ADR 0015, D3)';
  end if;

  -- 2. Les deux tables restent lisibles du public. Une surface que personne ne
  --    peut lire est une surface que personne ne peut signaler : la route
  --    vérifie la visibilité de la cible sous les droits de l'appelant.
  if not has_table_privilege('anon', 'shop.products', 'SELECT')
     or not has_table_privilege('anon', 'shop.vendors', 'SELECT') then
    raise exception
      'VITOLA_GRANT_GAP: la boutique n est plus lisible du public — le signalement en devient inatteignable';
  end if;

  -- 3. Le masquage ne s'est pas étendu en passant : mod_decide() ne nomme
  --    aucune table de shop. Un `hide` sur un produit sans colonnes hidden_*
  --    serait un verbe sans bras (ADR 0013, D4).
  if pg_get_functiondef('public.mod_decide(uuid, text, text, text, text)'::regprocedure)
       ~ 'shop\.(products|vendors)' then
    raise exception 'VITOLA_VERB_DRIFT: mod_decide() nomme une table de shop — relire l ADR 0013, D4';
  end if;

  -- 4. La porte d'écriture n'a pas bougé : file_report() reste à la clé de
  --    service seule (0006).
  if has_function_privilege('anon', 'public.file_report(uuid, text, text, text, text, text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.file_report(uuid, text, text, text, text, text)', 'EXECUTE') then
    raise exception 'VITOLA_GRANT_GAP: file_report() est devenue appelable par un client';
  end if;
  if not has_function_privilege('service_role', 'public.file_report(uuid, text, text, text, text, text)', 'EXECUTE') then
    raise exception 'VITOLA_GRANT_GAP: service_role ne peut plus appeler file_report()';
  end if;

  -- 5. Toujours aucun droit de table dans mod pour les rôles clients (0018) :
  --    les portes sont tout le chemin.
  select count(*) into n
    from information_schema.role_table_grants
   where table_schema = 'mod' and grantee in ('anon', 'authenticated');
  if n <> 0 then
    raise exception 'VITOLA_MOD_REOPENED: % grants de table dans mod pour un role client', n;
  end if;

  -- 6. §0.5 du brief, sur les quatre schémas. Rien n'est créé ici, mais un
  --    fichier qui ne vérifie pas est un fichier dont on ne sait rien.
  select string_agg(format('%I.%I', ns.nspname, c.relname), ', ' order by 1)
    into offender
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
   where c.relkind = 'r'
     and ns.nspname in ('public', 'ref', 'mod', 'shop')
     and (c.relrowsecurity = false
          or not exists (select 1 from pg_policy p where p.polrelid = c.oid));
  if offender is not null then
    raise exception 'VITOLA_RLS_GAP: table(s) sans RLS ou sans policy : %', offender;
  end if;

  raise notice
    '0024 : la boutique est signalable — deux surfaces de plus, meme porte, meme file, aucun verbe nouveau.';
end $$;

commit;
