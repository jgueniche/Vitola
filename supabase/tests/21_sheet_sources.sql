-- =============================================================================
-- Assertions de comportement sur la porte des sources (migration 0027).
--
-- Exécuté en CI sur une base où 0001 à 0027 sont appliquées.
--
-- Ce fichier **n'accorde rien** et ne corrige rien : l'auto-contrôle d'une
-- migration ne peut pas attraper ce qu'elle vient d'établir, la régression
-- future ne se voit que d'ici.
--
-- Trois règles : un anonyme lit la source de la dernière proposition acceptée
-- par colonne (et null quand elle n'en citait pas) ; il ne lit toujours RIEN
-- dans ref.cigar_revisions directement ; une proposition en attente ou refusée
-- ne compte pas. Chaque assertion ouvre un `begin` explicite.
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

-- ---------- Fixtures, créées comme postgres (contexte privilégié) ------------
delete from ref.cigar_revisions where cigar_id = 'cc270000-0000-4000-8000-000000000003';
delete from ref.cigars  where slug = 'cigare-provenance-test';
delete from ref.brands  where slug = 'marque-provenance-test';

insert into auth.users (id, email, raw_user_meta_data) values
  ('aa270000-0000-4000-8000-000000000001','provenance-lea@x.test','{"birth_date":"1981-01-01"}'),
  ('bb270000-0000-4000-8000-000000000002','provenance-noe@x.test','{"birth_date":"1986-06-06"}')
on conflict (id) do nothing;
update public.profiles set handle='provenance_lea', role='editor'
 where id='aa270000-0000-4000-8000-000000000001';
update public.profiles set handle='provenance_noe'
 where id='bb270000-0000-4000-8000-000000000002';

insert into ref.brands (id, name, slug)
values ('cc270000-0000-4000-8000-000000000002', 'Marque de la provenance', 'marque-provenance-test')
on conflict (id) do nothing;
insert into ref.cigars (id, brand_id, commercial_name, slug, status)
values ('cc270000-0000-4000-8000-000000000003', 'cc270000-0000-4000-8000-000000000002',
        'Cigare de la provenance', 'cigare-provenance-test', 'published');

-- Trois décisions et une attente, posées en contexte privilégié : ce que le
-- test mesure est ce qu'un lecteur en VOIT, pas qui les a écrites.
insert into ref.cigar_revisions (id, cigar_id, author_id, diff, comment, source, status, reviewed_by, reviewed_at) values
  -- strength : acceptée AVEC source, la plus récente sur cette colonne
  ('dd270000-0000-4000-8000-000000000011', 'cc270000-0000-4000-8000-000000000003', 'bb270000-0000-4000-8000-000000000002',
   '{"strength": {"from": null, "to": "moyen"}}', 'Test : force du fabricant.',
   'https://www.example.test/fabricant/force', 'approved', 'aa270000-0000-4000-8000-000000000001', now() - interval '2 days'),
  -- aroma_tags : acceptée avec source, puis une SECONDE acceptée sans source — la dernière gagne
  ('dd270000-0000-4000-8000-000000000012', 'cc270000-0000-4000-8000-000000000003', 'bb270000-0000-4000-8000-000000000002',
   '{"aroma_tags": {"from": null, "to": ["1"]}}', 'Test : arômes du fabricant.',
   'https://www.example.test/fabricant/aromes', 'approved', 'aa270000-0000-4000-8000-000000000001', now() - interval '3 days'),
  ('dd270000-0000-4000-8000-000000000013', 'cc270000-0000-4000-8000-000000000003', 'bb270000-0000-4000-8000-000000000002',
   '{"aroma_tags": {"from": ["1"], "to": ["2"]}}', 'Test : corrigé de mémoire.',
   null, 'approved', 'aa270000-0000-4000-8000-000000000001', now() - interval '1 day'),
  -- release_year : sourcée mais EN ATTENTE — ne compte pas
  ('dd270000-0000-4000-8000-000000000014', 'cc270000-0000-4000-8000-000000000003', 'bb270000-0000-4000-8000-000000000002',
   '{"release_year": {"from": null, "to": 1999}}', 'Test : en attente.',
   'https://www.example.test/fabricant/annee', 'pending', null, null),
  -- wrapper_shade : sourcée mais REFUSÉE — ne compte pas
  ('dd270000-0000-4000-8000-000000000015', 'cc270000-0000-4000-8000-000000000003', 'bb270000-0000-4000-8000-000000000002',
   '{"wrapper_shade": {"from": null, "to": "maduro"}}', 'Test : refusée.',
   'https://www.example.test/fabricant/cape', 'rejected', 'aa270000-0000-4000-8000-000000000001', now() - interval '1 day');

\echo '=== P1  les fixtures existent (sans quoi rien ne se teste)'
do $$
declare n integer;
begin
  select count(*) into n from ref.cigar_revisions where cigar_id = 'cc270000-0000-4000-8000-000000000003';
  if n <> 5 then raise exception 'FAIL: % proposition(s) fixture au lieu de 5', n; end if;
  raise notice 'PASS';
end $$;

\echo '=== P2  un anonyme lit la source de la force, et une source nulle pour les aromes (derniere acceptee)'
begin;
do $$
declare v_strength text; v_aromas text; n_aromas integer;
begin
  set local role anon;
  select source into v_strength from public.sheet_sources('cc270000-0000-4000-8000-000000000003') where column_name = 'strength';
  if v_strength <> 'https://www.example.test/fabricant/force' then
    raise exception 'FAIL: source de la force lue = %', v_strength;
  end if;
  select count(*), max(source) into n_aromas, v_aromas
    from public.sheet_sources('cc270000-0000-4000-8000-000000000003') where column_name = 'aroma_tags';
  if n_aromas <> 1 then raise exception 'FAIL: % ligne(s) pour aroma_tags au lieu d une', n_aromas; end if;
  if v_aromas is not null then
    raise exception 'FAIL: la source des aromes devrait etre nulle (la derniere acceptee n en citait pas), lu %', v_aromas;
  end if;
  raise notice 'PASS';
  reset role;
end $$;
commit;

\echo '=== P3  une proposition en attente ou refusee ne fait pas provenance'
begin;
do $$
declare n integer;
begin
  set local role anon;
  select count(*) into n from public.sheet_sources('cc270000-0000-4000-8000-000000000003')
   where column_name in ('release_year', 'wrapper_shade');
  if n <> 0 then raise exception 'FAIL: % colonne(s) non decidee(s) rendue(s) comme provenance', n; end if;
  raise notice 'PASS';
  reset role;
end $$;
commit;

\echo '=== P4  la porte ne rend ni auteur ni diff : trois colonnes, pas une de plus'
do $$
declare cols text;
begin
  select string_agg(o.attname, ',' order by o.attnum) into cols
    from pg_proc p
    cross join lateral unnest(p.proargnames, p.proargmodes) with ordinality as o(attname, mode, attnum)
   where p.oid = 'public.sheet_sources(uuid)'::regprocedure and o.mode = 't';
  if cols <> 'column_name,source,decided_at' then
    raise exception 'FAIL: la porte rend « % »', cols;
  end if;
  raise notice 'PASS';
end $$;

\echo '=== P5  la table derriere la porte reste fermee a l anonyme (zero ligne, la fixture existe)'
begin;
do $$
declare n integer;
begin
  set local role anon;
  begin
    select count(*) into n from ref.cigar_revisions where cigar_id = 'cc270000-0000-4000-8000-000000000003';
    if n <> 0 then raise exception 'FAIL: un anonyme lit % proposition(s) directement', n; end if;
  exception when insufficient_privilege then
    n := 0; -- pas de grant du tout pour anon : plus fermé encore, et c'est bien
  end;
  raise notice 'PASS';
  reset role;
end $$;
commit;

\echo '=== P6  un membre connecte lit la meme provenance que l anonyme'
begin;
do $$
declare v_strength text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','bb270000-0000-4000-8000-000000000002',true);
  select source into v_strength from public.sheet_sources('cc270000-0000-4000-8000-000000000003') where column_name = 'strength';
  if v_strength <> 'https://www.example.test/fabricant/force' then
    raise exception 'FAIL: source de la force lue par un membre = %', v_strength;
  end if;
  raise notice 'PASS';
  reset role;
end $$;
commit;

-- ---------- Nettoyage, en contexte privilégié --------------------------------
delete from ref.cigar_revisions where cigar_id = 'cc270000-0000-4000-8000-000000000003';
delete from ref.cigars  where slug = 'cigare-provenance-test';
delete from ref.brands  where slug = 'marque-provenance-test';

\echo 'Provenance : 6 assertions, base laissee comme trouvee (les fixtures d auth restent).'
