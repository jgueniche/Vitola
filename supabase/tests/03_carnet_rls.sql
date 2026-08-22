-- =============================================================================
-- Assertions de comportement sur le carnet (migration 0003, ADR 0004).
--
-- Exécuté en CI sur une base où 0001, 0002 et 0003 sont appliquées.
--
-- Deux pièges que ce dépôt a payés, et que ce fichier évite explicitement :
--
--   1. `SET LOCAL ROLE` hors transaction est ignoré avec un WARNING, pas une
--      erreur. L'assertion tourne alors en superutilisateur, contourne la RLS et
--      passe pour la mauvaise raison. Chaque assertion vit donc dans un bloc
--      `do $$ … $$`, qui est une transaction implicite.
--
--   2. Une assertion dont la donnée de test n'existe pas réussit sans rien
--      tester. « Zéro ligne visible » est indiscernable de « la ligne n'a jamais
--      été insérée ». Chaque assertion de non-visibilité prouve donc d'abord,
--      en contexte privilégié, que la ligne existe.
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

-- ---------- Fixtures, créées comme postgres (contexte privilégié) ------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('a1000000-0000-4000-8000-000000000001','carnet-auteur@x.test'   ,'{"birth_date":"1985-04-02"}'),
  ('b2000000-0000-4000-8000-000000000002','carnet-marc@x.test'     ,'{"birth_date":"1979-11-20"}'),
  ('c3000000-0000-4000-8000-000000000003','carnet-inconnu@x.test'  ,'{"birth_date":"1990-01-01"}')
on conflict (id) do nothing;

update public.profiles set handle='auteur_carnet' where id='a1000000-0000-4000-8000-000000000001';
update public.profiles set handle='marc_carnet'   where id='b2000000-0000-4000-8000-000000000002';
update public.profiles set handle='inconnu'       where id='c3000000-0000-4000-8000-000000000003';

insert into ref.manufacturers (id,name,slug,country) values
  ('ca000000-0000-4000-8000-000000000001','Manufacture Carnet','manufacture-carnet','CU')
on conflict (id) do nothing;
insert into ref.brands (id,manufacturer_id,name,slug,country,is_cuban) values
  ('cb000000-0000-4000-8000-000000000001','ca000000-0000-4000-8000-000000000001','Marque Carnet','marque-carnet','CU',true)
on conflict (id) do nothing;

-- Une fiche publiée : on peut la noter. Une en brouillon : on ne doit pas.
insert into ref.cigars (id,brand_id,commercial_name,slug,origin_country,status) values
  ('cc000000-0000-4000-8000-000000000001','cb000000-0000-4000-8000-000000000001','Fiche Publiee','fiche-publiee-carnet','CU','published'),
  ('cc000000-0000-4000-8000-000000000002','cb000000-0000-4000-8000-000000000001','Fiche Brouillon','fiche-brouillon-carnet','CU','draft')
on conflict (id) do nothing;

-- Les quatre portées, une entrée chacune, toutes du même auteur sur la même
-- fiche : ce qui varie d'une assertion à l'autre est la portée et rien d'autre.
insert into public.reviews (id,user_id,cigar_id,kind,visibility,score_total,body) values
  ('11110000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','cc000000-0000-4000-8000-000000000001','log','private'  ,91.0,'Entree privee'),
  ('11110000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001','cc000000-0000-4000-8000-000000000001','log','shared'   ,50.0,'Entree partagee a Marc'),
  ('11110000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000001','cc000000-0000-4000-8000-000000000001','log','followers',60.0,'Entree abonnes'),
  ('11110000-0000-4000-8000-000000000004','a1000000-0000-4000-8000-000000000001','cc000000-0000-4000-8000-000000000001','log','public'   ,70.0,'Entree publique')
on conflict (id) do nothing;

-- Une seconde fiche, notee bas et souvent. Sans elle l a priori global vaut
-- exactement la note du seul avis existant, et le tassement bayesien est
-- inobservable : C11 mesurerait 70 contre 70 et passerait pour rien.
insert into ref.cigars (id,brand_id,commercial_name,slug,origin_country,status) values
  ('cc000000-0000-4000-8000-000000000003','cb000000-0000-4000-8000-000000000001','Fiche Modeste','fiche-modeste-carnet','CU','published')
on conflict (id) do nothing;

insert into public.reviews (id,user_id,cigar_id,kind,visibility,score_total,body)
select ('22220000-0000-4000-8000-00000000000' || i)::uuid,
       'a1000000-0000-4000-8000-000000000001',
       'cc000000-0000-4000-8000-000000000003',
       'log','public',50.0,'Avis modeste ' || i
  from generate_series(1,5) i
on conflict (id) do nothing;

insert into public.review_shares (review_id, grantee_id, granted_by) values
  ('11110000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001')
on conflict do nothing;

insert into public.review_thirds (review_id, third, notes) values
  ('11110000-0000-4000-8000-000000000001', 1, 'Premier tiers, entree privee')
on conflict do nothing;

\echo '=== C1  l auteur voit ses quatre entrees, quelle que soit la portee'
do $$
declare n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
  select count(*) into n from public.reviews
   where cigar_id = 'cc000000-0000-4000-8000-000000000001';
  if n <> 4 then raise exception 'FAIL: l auteur voit % entrees sur 4', n; end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== C2  un membre non concerne ne voit que l entree publique'
do $$
declare n integer; visible text;
begin
  -- Prouver d abord que les quatre existent : sinon « je n en vois qu une » est
  -- indiscernable de « il n y en a qu une ».
  if (select count(*) from public.reviews
       where cigar_id='cc000000-0000-4000-8000-000000000001') <> 4 then
    raise exception 'FAIL: fixtures manquantes — l assertion serait vide de sens';
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','c3000000-0000-4000-8000-000000000003',true);
  select count(*), string_agg(body, ', ' order by body) into n, visible
    from public.reviews where cigar_id='cc000000-0000-4000-8000-000000000001';
  if n <> 1 or visible <> 'Entree publique' then
    raise exception 'FAIL: un tiers voit % entree(s) : %', n, visible;
  end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== C3  la personne nommee voit l entree partagee, et elle seule en plus'
do $$
declare n integer;
begin
  if not exists (select 1 from public.review_shares
                  where review_id='11110000-0000-4000-8000-000000000002') then
    raise exception 'FAIL: le partage n existe pas — l assertion serait vide de sens';
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000002',true);
  select count(*) into n from public.reviews
   where cigar_id='cc000000-0000-4000-8000-000000000001';
  -- La publique + la partagee. Ni la privee, ni celle destinee aux abonnes.
  if n <> 2 then raise exception 'FAIL: Marc voit % entrees au lieu de 2', n; end if;
  if exists (select 1 from public.reviews where visibility='private'
              and cigar_id='cc000000-0000-4000-8000-000000000001') then
    raise exception 'FAIL: Marc voit une entree privee';
  end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== C4  un visiteur anonyme ne voit que le public'
do $$
declare n integer;
begin
  set local role anon;
  select count(*) into n from public.reviews
   where cigar_id='cc000000-0000-4000-8000-000000000001';
  if n <> 1 then raise exception 'FAIL: anon voit % entrees au lieu de 1', n; end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== C5  followers reste ferme tant que P3 n a pas livre public.follows'
do $$
declare n integer;
begin
  if not exists (select 1 from public.reviews
                  where id='11110000-0000-4000-8000-000000000003' and visibility='followers') then
    raise exception 'FAIL: l entree followers n existe pas — assertion vide de sens';
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000002',true);
  select count(*) into n from public.reviews where visibility='followers';
  -- Fermee, pas ouverte : sans la table follows, personne d autre que l auteur.
  if n <> 0 then raise exception 'FAIL: une entree followers est visible (%)', n; end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== C6  un destinataire ne peut pas repartager'
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000002',true);
  begin
    insert into public.review_shares (review_id, grantee_id, granted_by)
    values ('11110000-0000-4000-8000-000000000002',
            'c3000000-0000-4000-8000-000000000003',
            'b2000000-0000-4000-8000-000000000002');
    raise exception 'FAIL: un destinataire a repartage';
  exception
    when insufficient_privilege then raise notice 'PASS (refuse)';
    when others then
      if sqlstate = '42501' then raise notice 'PASS (refuse)';
      else raise; end if;
  end;
  reset role;
end $$;

\echo '=== C7  on ne note pas une fiche en brouillon'
do $$
begin
  if not exists (select 1 from ref.cigars
                  where id='cc000000-0000-4000-8000-000000000002' and status='draft') then
    raise exception 'FAIL: la fiche brouillon n existe pas — assertion vide de sens';
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
  begin
    insert into public.reviews (user_id, cigar_id, kind, visibility, score_total)
    values ('a1000000-0000-4000-8000-000000000001','cc000000-0000-4000-8000-000000000002','log','private',80);
    raise exception 'FAIL: une note sur un brouillon a ete acceptee';
  exception
    when insufficient_privilege then raise notice 'PASS (refuse)';
    when others then
      if sqlstate = '42501' then raise notice 'PASS (refuse)';
      else raise; end if;
  end;
  reset role;
end $$;

\echo '=== C8  on ne note pas au nom d un autre'
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','c3000000-0000-4000-8000-000000000003',true);
  begin
    insert into public.reviews (user_id, cigar_id, kind, visibility, score_total)
    values ('a1000000-0000-4000-8000-000000000001','cc000000-0000-4000-8000-000000000001','log','public',99);
    raise exception 'FAIL: une note a ete ecrite au nom d un autre';
  exception
    when insufficient_privilege then raise notice 'PASS (refuse)';
    when others then
      if sqlstate = '42501' then raise notice 'PASS (refuse)';
      else raise; end if;
  end;
  reset role;
end $$;

\echo '=== C9  un tiers de degustation suit la portee de son entree'
do $$
declare n integer;
begin
  if not exists (select 1 from public.review_thirds
                  where review_id='11110000-0000-4000-8000-000000000001') then
    raise exception 'FAIL: le tiers n existe pas — assertion vide de sens';
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','c3000000-0000-4000-8000-000000000003',true);
  select count(*) into n from public.review_thirds;
  if n <> 0 then
    raise exception 'FAIL: le tiers d une entree privee est visible d un tiers (%)', n;
  end if;
  reset role;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
  select count(*) into n from public.review_thirds;
  if n <> 1 then raise exception 'FAIL: l auteur ne voit pas son propre tiers'; end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== C10 cigar_stats ne compte que le public — ADR 0004, D3'
do $$
declare compte integer; moyenne numeric;
begin
  -- Les quatre entrees portent 91, 50, 60 et 70. Si la portee etait ignoree,
  -- la moyenne serait 67,75 sur quatre avis. Seule la publique compte : 70 sur un.
  -- Les chiffres sont choisis pour que les deux cas soient impossibles a
  -- confondre, y compris par arrondi.
  perform public.refresh_cigar_stats();

  select review_count, mean_score into compte, moyenne
    from public.cigar_stats where cigar_id='cc000000-0000-4000-8000-000000000001';

  if compte is null then
    raise exception 'FAIL: aucune ligne de statistiques — l assertion serait vide de sens';
  end if;
  if compte <> 1 then
    raise exception 'FAIL: cigar_stats compte % avis au lieu du seul public', compte;
  end if;
  if moyenne <> 70.0 then
    raise exception 'FAIL: moyenne % — une entree non publique a ete comptee', moyenne;
  end if;
  raise notice 'PASS (1 avis public, moyenne 70,0)';
end $$;

\echo '=== C11 la moyenne bayesienne tasse les deux cotes vers l a priori'
do $$
declare
  haut_brut numeric; haut_bayes numeric;
  bas_brut  numeric; bas_bayes  numeric;
  bas_n     integer;
begin
  -- Six avis publics en tout : un a 70 sur la premiere fiche, cinq a 50 sur la
  -- seconde. L a priori global vaut donc (70 + 5*50) / 6 = 53,33, entre les deux.
  -- Un cigare au-dessus doit descendre, un cigare en dessous doit monter : c est
  -- ce que « bayesienne, pas arithmetique » veut dire au §5.4, et un seul cigare
  -- ne permet pas de le voir.
  select mean_score, bayesian_score into haut_brut, haut_bayes
    from public.cigar_stats where cigar_id='cc000000-0000-4000-8000-000000000001';
  select mean_score, bayesian_score, review_count into bas_brut, bas_bayes, bas_n
    from public.cigar_stats where cigar_id='cc000000-0000-4000-8000-000000000003';

  if haut_bayes is null or bas_bayes is null then
    raise exception 'FAIL: statistiques absentes — l assertion serait vide de sens';
  end if;
  if bas_n <> 5 then
    raise exception 'FAIL: la fiche modeste compte % avis au lieu de 5', bas_n;
  end if;

  if haut_bayes >= haut_brut then
    raise exception 'FAIL: un avis isole a 70 n est pas tasse (brut %, bayesien %)',
      haut_brut, haut_bayes;
  end if;
  if bas_bayes <= bas_brut then
    raise exception 'FAIL: cinq avis a 50 ne sont pas remontes (brut %, bayesien %)',
      bas_brut, bas_bayes;
  end if;

  -- Et le sens du produit : un seul avis enthousiaste ne doit pas dominer un
  -- cigare cinq fois note plus bas.
  if haut_bayes <= bas_bayes then
    raise exception 'FAIL: le classement s inverse (% vs %)', haut_bayes, bas_bayes;
  end if;

  raise notice 'PASS (1 avis: % -> %, 5 avis: % -> %)',
    haut_brut, haut_bayes, bas_brut, bas_bayes;
end $$;

\echo '=== C12 un client ne peut pas deplacer une entree vers un autre auteur'
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
  begin
    update public.reviews set user_id='c3000000-0000-4000-8000-000000000003'
     where id='11110000-0000-4000-8000-000000000001';
    raise exception 'FAIL: user_id modifiable par un client';
  exception
    when insufficient_privilege then raise notice 'PASS (colonne hors grant)';
    when others then
      if sqlstate = '42501' then raise notice 'PASS (colonne hors grant)';
      else raise; end if;
  end;
  reset role;
end $$;

\echo '=== C13 une entree de carnet vide est refusee'
do $$
begin
  begin
    insert into public.reviews (user_id, cigar_id, kind, visibility)
    values ('a1000000-0000-4000-8000-000000000001','cc000000-0000-4000-8000-000000000001','log','private');
    raise exception 'FAIL: une entree sans note ni texte a ete acceptee';
  exception when check_violation then raise notice 'PASS';
  end;
end $$;

\echo '=== C14 une degustation sans structure est refusee'
do $$
begin
  begin
    insert into public.reviews (user_id, cigar_id, kind, visibility, score_total, scores)
    values ('a1000000-0000-4000-8000-000000000001','cc000000-0000-4000-8000-000000000001',
            'tasting','private',88,'{}'::jsonb);
    raise exception 'FAIL: une degustation sans scores a ete acceptee';
  exception when check_violation then raise notice 'PASS';
  end;
end $$;

\echo '=== C15 une sous-note inconnue est refusee'
do $$
begin
  begin
    insert into public.reviews (user_id, cigar_id, kind, visibility, score_total, scores)
    values ('a1000000-0000-4000-8000-000000000001','cc000000-0000-4000-8000-000000000001',
            'tasting','private',88,'{"construction":18,"prix":5}'::jsonb);
    raise exception 'FAIL: une cle de score inconnue a ete acceptee';
  exception when check_violation then raise notice 'PASS';
  end;
end $$;

\echo '=== Carnet : 15 assertions passees'
