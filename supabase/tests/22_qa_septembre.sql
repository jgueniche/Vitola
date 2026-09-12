-- =============================================================================
-- Assertions de comportement sur les sept migrations de la QA du 12 septembre
-- 2026 (0028 à 0034).
--
-- Exécuté en CI sur une base où 0001 à 0034 sont appliquées.
--
-- Ce fichier **n'accorde rien** et ne corrige rien. Il existe parce que
-- l'auto-contrôle d'une migration ne peut pas attraper ce qu'elle vient
-- d'établir : il relit sa propre transaction. Ce qui se voit d'ici est la
-- régression que la migration SUIVANTE introduira — et le fait, découvert en
-- ouvrant cette PR, qu'une migration absente du workflow n'est pas appliquée
-- du tout. Sept migrations ont vécu ainsi une demi-journée, et c'est le
-- contrôle de dérive des types qui a fini par le dire.
--
-- Chaque assertion qui change de rôle ouvre un `begin` explicite : hors
-- transaction, `set local role` est ignoré en silence et le test s'exécute en
-- superutilisateur, où tout passe.
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

-- ---------- Fixtures, créées comme postgres (contexte privilégié) ------------
delete from public.admin_invitations where email like '%@qa-septembre.test';

insert into auth.users (id, email, raw_user_meta_data) values
  ('aa280000-0000-4000-8000-000000000001','qa-sept-admin@x.test','{"birth_date":"1979-03-03"}'),
  ('bb280000-0000-4000-8000-000000000002','qa-sept-membre@x.test','{"birth_date":"1988-08-08"}')
on conflict (id) do nothing;
update public.profiles set handle='qa_sept_admin', role='admin'
 where id='aa280000-0000-4000-8000-000000000001';
update public.profiles set handle='qa_sept_membre', role='member'
 where id='bb280000-0000-4000-8000-000000000002';

insert into public.admin_invitations (email, role, note) values
  ('invitee@qa-septembre.test', 'admin', 'Fixture de la QA du 12 septembre.');

\echo '=== Q1  les fixtures existent (sans quoi rien ne se teste)'
do $$
declare n integer;
begin
  select count(*) into n from public.admin_invitations where email like '%@qa-septembre.test';
  if n <> 1 then raise exception 'FAIL: % invitation(s) fixture au lieu de 1', n; end if;
  raise notice 'PASS';
end $$;

-- 0028 — la note se lit en bagues, et le seau est en SQL ----------------------
--
-- `lib/reviews/rings.ts` recopie `greatest(1, ceil(score / 20))` pour que la
-- carte compte comme la vue, et `tests/unit/reviews-rings.test.ts` compare les
-- deux au texte de la migration. Ce qu'il ne peut pas faire, c'est vérifier la
-- FORME de ce que la vue rend : cinq clés, nommées r1 à r5. L'auto-contrôle de
-- 0028 l'a d'ailleurs affirmé à tort une fois — `jsonb_object_keys` est
-- set-returning et multipliait les lignes avant le `string_agg`, si bien qu'il
-- lisait « r1,r1,r1,r1,r2,… » et s'en croyait satisfait.
\echo '=== Q2  la distribution rend exactement cinq bagues, nommees r1 a r5'
do $$
declare keys text;
begin
  select string_agg(k, ',' order by k) into keys
    from (select distinct jsonb_object_keys(distribution) as k
            from public.cigar_stats limit 100) s;
  if keys is not null and keys <> 'r1,r2,r3,r4,r5' then
    raise exception 'FAIL: distribution rend « % » au lieu de r1..r5', keys;
  end if;
  raise notice 'PASS';
end $$;

-- 0029 — l'échelle /100 ↔ /20 est retirée, contrainte comprise ---------------
--
-- La contrainte EXIGEAIT la clé. La laisser en place pendant que le défaut ne
-- l'écrit plus poserait un piège sur le seul écran où l'on répare ses réglages.
\echo '=== Q3  ni la contrainte ni le defaut ne nomment plus score_scale'
do $$
declare has_check boolean; def text;
begin
  select exists (
    select 1 from pg_constraint
     where conrelid = 'public.profile_settings'::regclass
       and conname = 'profile_settings_score_scale'
  ) into has_check;
  if has_check then raise exception 'FAIL: la contrainte score_scale existe encore'; end if;

  select pg_get_expr(d.adbin, d.adrelid) into def
    from pg_attrdef d
    join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
   where d.adrelid = 'public.profile_settings'::regclass and a.attname = 'preferences';
  if def is null or def like '%score_scale%' then
    raise exception 'FAIL: le defaut de preferences dit encore « % »', def;
  end if;
  raise notice 'PASS';
end $$;

-- 0030 — deux types de lieu offerts, cinq gardés dans l'enum -----------------
--
-- PostgreSQL ne retire pas une valeur d'enum, et rien n'en a besoin : ce que le
-- drapeau n'offre pas, aucun écran ne propose (ADR 0011, D5). Retirer les cinq
-- autres casserait les lieux déjà publiés qui les portent.
\echo '=== Q4  fumoir est dans l enum, et venues_enabled offre exactement deux types'
do $$
declare offered jsonb; n integer;
begin
  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = 'venue_type' and e.enumlabel = 'fumoir'
  ) then raise exception 'FAIL: fumoir absent de venue_type'; end if;

  select count(*) into n from pg_enum e join pg_type t on t.oid = e.enumtypid
   where t.typname = 'venue_type';
  if n < 7 then
    raise exception 'FAIL: venue_type ne porte que % valeurs — une a ete retiree', n;
  end if;

  select payload -> 'types' into offered
    from public.feature_flags where key = 'venues_enabled';
  if offered is null or jsonb_array_length(offered) <> 2
     or not (offered ? 'civette') or not (offered ? 'fumoir') then
    raise exception 'FAIL: venues_enabled offre « % » au lieu de civette + fumoir', offered;
  end if;
  raise notice 'PASS';
end $$;

-- 0031 — la recherche de lieu tient sur deux index trigrammes ----------------
--
-- `%x%` ne peut pas utiliser un B-tree : sans ces deux index, la recherche
-- était un balayage séquentiel à 45,8 ms par frappe sur 13 482 lignes. Ils sont
-- assertés par leur MÉTHODE : un index GIN recréé en B-tree par mégarde serait
-- présent, nommé pareil, et inutile.
\echo '=== Q5  les deux index de recherche existent et sont des GIN'
do $$
declare wrong text;
begin
  select string_agg(c.relname || ' (' || am.amname || ')', ', ') into wrong
    from pg_class c
    join pg_index i on i.indexrelid = c.oid
    join pg_am am on am.oid = c.relam
   where c.relname in ('venues_name_trgm', 'venues_city_trgm')
     and am.amname <> 'gin';
  if wrong is not null then raise exception 'FAIL: % n est pas un GIN', wrong; end if;

  if (select count(*) from pg_class where relname in ('venues_name_trgm', 'venues_city_trgm')) <> 2 then
    raise exception 'FAIL: les deux index de recherche ne sont pas tous les deux la';
  end if;
  raise notice 'PASS';
end $$;

-- 0032 — la suggestion reste en droits d'appelant ----------------------------
--
-- C'est TOUT le raisonnement de sécurité de la fonction : le profil est
-- construit depuis le carnet, que quatre policies SELECT protègent (ADR 0004).
-- En DEFINER elle classerait contre le carnet de TOUT LE MONDE, ce qui est
-- exactement le canal d'inférence que la D3 existe pour fermer.
\echo '=== Q6  suggest_cigars est SECURITY INVOKER, et anon ne l appelle pas'
do $$
declare definer boolean;
begin
  select p.prosecdef into definer
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'suggest_cigars';
  if definer is null then raise exception 'FAIL: suggest_cigars est absente'; end if;
  if definer then raise exception 'FAIL: suggest_cigars est passee en SECURITY DEFINER'; end if;

  if has_function_privilege('anon', 'public.suggest_cigars(integer)', 'EXECUTE') then
    raise exception 'FAIL: anon peut appeler suggest_cigars';
  end if;
  if not has_function_privilege('authenticated', 'public.suggest_cigars(integer)', 'EXECUTE') then
    raise exception 'FAIL: authenticated ne peut pas appeler suggest_cigars';
  end if;
  raise notice 'PASS';
end $$;

-- 0033 — la liste d'invitations ne se lit que d'un admin ---------------------
--
-- La clé de claim est `request.jwt.claim.sub`, au singulier : c'est ce que lit
-- le stub d'`auth.uid()` de la CI (supabase/tests/00_supabase_stubs.sql). Écrire
-- `request.jwt.claims` en JSON laisse `auth.uid()` à NULL, donc
-- `has_min_role('admin')` à faux, et la moitié ADMIN de l'assertion échoue pour
-- une raison qui n'a rien à voir avec la policy.
\echo '=== Q7  un membre ne lit aucune invitation (la fixture existe), un admin la lit'
begin;
do $$
declare n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','bb280000-0000-4000-8000-000000000002',true);
  select count(*) into n from public.admin_invitations;
  if n <> 0 then raise exception 'FAIL: un membre lit % invitation(s)', n; end if;
  reset role;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','aa280000-0000-4000-8000-000000000001',true);
  select count(*) into n from public.admin_invitations where email like '%@qa-septembre.test';
  if n <> 1 then raise exception 'FAIL: un admin lit % invitation(s) au lieu de 1', n; end if;
  reset role;
  raise notice 'PASS';
end $$;
commit;

\echo '=== Q8  anon n a aucun droit de table sur la liste (les lignes nomment des gens)'
do $$
begin
  if has_table_privilege('anon', 'public.admin_invitations', 'SELECT') then
    raise exception 'FAIL: anon a un droit de lecture sur admin_invitations';
  end if;
  if not (select relforcerowsecurity from pg_class where oid = 'public.admin_invitations'::regclass) then
    raise exception 'FAIL: la RLS n est pas forcee sur admin_invitations';
  end if;
  raise notice 'PASS';
end $$;

-- 0034 — la boutique revend : le rayon ne dépend plus de personne ------------
--
-- La D4 de l'ADR 0016 (« suspendre coupe tout en un UPDATE ») est fausse en
-- revente, et pas approximativement : le stock est à nous, donc une policy qui
-- retirerait de la vente des articles payés le jour où un fournisseur ferme le
-- ferait en silence. Le prédicat est donc asserté par son TEXTE : il ne doit
-- plus nommer vendors.
\echo '=== Q9  products_select_published ne teste plus que le statut'
do $$
declare qual text;
begin
  select pg_get_expr(pol.polqual, pol.polrelid) into qual
    from pg_policy pol
   where pol.polrelid = 'shop.products'::regclass and pol.polname = 'products_select_published';
  if qual is null then raise exception 'FAIL: products_select_published est absente'; end if;
  if qual like '%vendor%' then
    raise exception 'FAIL: la lecture publique depend encore du vendeur : %', qual;
  end if;

  if exists (
    select 1 from pg_policy pol
     where pol.polrelid = 'shop.products'::regclass
       and pol.polname in ('products_insert_vendor','products_update_vendor',
                           'products_delete_vendor','products_select_vendor')
  ) then raise exception 'FAIL: une policy vendeur survit sur shop.products'; end if;
  raise notice 'PASS';
end $$;

\echo '=== Q10 owner_id a disparu, avec son trigger et les deux policies de storage'
do $$
begin
  if exists (
    select 1 from pg_attribute
     where attrelid = 'shop.vendors'::regclass and attname = 'owner_id' and not attisdropped
  ) then raise exception 'FAIL: shop.vendors.owner_id existe encore'; end if;

  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'shop' and p.proname = 'tg_protect_vendor_privileges')
  then raise exception 'FAIL: le trigger de garde de owner_id survit'; end if;

  if exists (
    select 1 from pg_policy
     where polname in ('storage_shop_images_vendor_insert', 'storage_shop_images_vendor_delete')
  ) then raise exception 'FAIL: une policy de storage lit encore owner_id'; end if;

  if (select attnotnull from pg_attribute
       where attrelid = 'shop.products'::regclass and attname = 'vendor_id') then
    raise exception 'FAIL: products.vendor_id est encore NOT NULL — un produit doit pouvoir changer de partenaire';
  end if;
  raise notice 'PASS';
end $$;

-- ---------- Nettoyage : la fixture d'invitation part, les comptes restent ----
-- Les fixtures d'auth restent, comme dans les vingt et un fichiers précédents :
-- `auth.users` est partagé par tous les tests et les retirer casserait les
-- suivants. L'invitation, elle, est à nous et ne doit pas survivre.
delete from public.admin_invitations where email like '%@qa-septembre.test';

\echo ''
\echo 'QA du 12 septembre : 10 assertions, base laissee comme trouvee (les fixtures d auth restent).'
