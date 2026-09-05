-- =============================================================================
-- Assertions de comportement sur le profil aromatique (migration 0025).
--
-- Exécuté en CI sur une base où 0001 à 0025 sont appliquées.
--
-- Ce fichier **n'accorde rien** et ne corrige rien : l'auto-contrôle d'une
-- migration ne peut pas attraper ce qu'elle vient d'établir, la régression
-- future ne se voit que d'ici.
--
-- Deux personnes : `iris` est promue editor, `omar` est membre. Trois règles :
-- un descripteur seulement (jamais une famille, jamais un inconnu, jamais deux
-- fois, jamais treize) ; le relecteur écrit, le membre non ; et la vue ne cite
-- que les entrées publiques.
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

-- ---------- Fixtures, créées comme postgres (contexte privilégié) ------------
delete from public.reviews where cigar_id = 'cc250000-0000-4000-8000-000000000003';
delete from ref.cigars  where slug = 'cigare-aromes-test';
delete from ref.brands  where slug = 'marque-aromes-test';
delete from public.aroma_taxonomy where id between 9250 and 9299;

insert into auth.users (id, email, raw_user_meta_data) values
  ('aa250000-0000-4000-8000-000000000001','aromes-iris@x.test','{"birth_date":"1983-03-03"}'),
  ('bb250000-0000-4000-8000-000000000002','aromes-omar@x.test','{"birth_date":"1988-08-08"}')
on conflict (id) do nothing;

update public.profiles set handle='aromes_iris', role='editor'
 where id='aa250000-0000-4000-8000-000000000001';
update public.profiles set handle='aromes_omar'
 where id='bb250000-0000-4000-8000-000000000002';

-- Une famille de test et quatorze descripteurs, hors des identifiants du seed :
-- le test ne dépend pas de la roue chargée, et il la laisse intacte.
insert into public.aroma_taxonomy (id, parent_id, family, slug, label_fr, label_en) values
  (9250, null, 'boise', 'famille-test-aromes', 'Famille de test', 'Test family');
insert into public.aroma_taxonomy (id, parent_id, family, slug, label_fr, label_en)
select 9250 + g, 9250, 'boise', 'descripteur-test-' || g, 'Descripteur ' || g, 'Descriptor ' || g
  from generate_series(1, 14) as g;

insert into ref.brands (id, name, slug)
values ('cc250000-0000-4000-8000-000000000002', 'Marque des arômes', 'marque-aromes-test')
on conflict (id) do nothing;

insert into ref.cigars (id, brand_id, commercial_name, slug, status)
values ('cc250000-0000-4000-8000-000000000003', 'cc250000-0000-4000-8000-000000000002',
        'Cigare des arômes', 'cigare-aromes-test', 'published');

\echo '=== A1  les fixtures existent (sans quoi rien ne se teste)'
do $$
declare n integer;
begin
  select count(*) into n from public.aroma_taxonomy where parent_id = 9250;
  if n <> 14 then raise exception 'FAIL: % descripteur(s) de test au lieu de 14', n; end if;
  if not exists (select 1 from ref.cigars where slug = 'cigare-aromes-test') then
    raise exception 'FAIL: la fiche de test manque';
  end if;
  raise notice 'PASS';
end $$;

\echo '=== A2  un relecteur ecrit un profil de descripteurs'
do $$
declare n integer; tags integer[];
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','aa250000-0000-4000-8000-000000000001',true);
  update ref.cigars set aroma_tags = array[9251, 9252, 9253] where slug = 'cigare-aromes-test';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: le relecteur n a modifie % ligne(s)', n; end if;
  select aroma_tags into tags from ref.cigars where slug = 'cigare-aromes-test';
  if tags <> array[9251, 9252, 9253] then raise exception 'FAIL: profil relu = %', tags; end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== A3  une famille n est pas un descripteur : refuse'
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','aa250000-0000-4000-8000-000000000001',true);
  begin
    update ref.cigars set aroma_tags = array[9250] where slug = 'cigare-aromes-test';
    raise exception 'FAIL: une famille a ete acceptee comme arome';
  exception when foreign_key_violation then
    raise notice 'PASS';
  end;
  reset role;
end $$;

\echo '=== A4  un identifiant inconnu : refuse'
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','aa250000-0000-4000-8000-000000000001',true);
  begin
    update ref.cigars set aroma_tags = array[9251, 424242] where slug = 'cigare-aromes-test';
    raise exception 'FAIL: un identifiant inconnu a ete accepte';
  exception when foreign_key_violation then
    raise notice 'PASS';
  end;
  reset role;
end $$;

\echo '=== A5  un doublon : refuse'
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','aa250000-0000-4000-8000-000000000001',true);
  begin
    update ref.cigars set aroma_tags = array[9251, 9251] where slug = 'cigare-aromes-test';
    raise exception 'FAIL: un doublon a ete accepte';
  exception when check_violation then
    raise notice 'PASS';
  end;
  reset role;
end $$;

\echo '=== A6  treize descripteurs : refuse (douze au plus)'
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','aa250000-0000-4000-8000-000000000001',true);
  begin
    update ref.cigars
       set aroma_tags = (select array_agg(9250 + g) from generate_series(1, 13) as g)
     where slug = 'cigare-aromes-test';
    raise exception 'FAIL: treize descripteurs ont ete acceptes';
  exception when check_violation then
    raise notice 'PASS';
  end;
  reset role;
end $$;

\echo '=== A7  un membre n ecrit pas le profil (zero ligne, valeur intacte)'
do $$
declare n integer; tags integer[];
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','bb250000-0000-4000-8000-000000000002',true);
  update ref.cigars set aroma_tags = array[9254] where slug = 'cigare-aromes-test';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: un membre a modifie % ligne(s)', n; end if;
  reset role;
  select aroma_tags into tags from ref.cigars where slug = 'cigare-aromes-test';
  if tags <> array[9251, 9252, 9253] then raise exception 'FAIL: le profil a bouge : %', tags; end if;
  raise notice 'PASS';
end $$;

-- ---------- La vue : seules les entrées publiques sont citées -----------------
insert into public.reviews (user_id, cigar_id, kind, visibility, score_total, body, aroma_tags) values
  ('aa250000-0000-4000-8000-000000000001', 'cc250000-0000-4000-8000-000000000003',
   'log', 'public',  88, 'Cèdre net.', array[9251, 9252]),
  ('bb250000-0000-4000-8000-000000000002', 'cc250000-0000-4000-8000-000000000003',
   'log', 'public',  null, 'Un mot sans note.', array[9251, 9255]),
  ('bb250000-0000-4000-8000-000000000002', 'cc250000-0000-4000-8000-000000000003',
   'log', 'private', 95, 'Pour moi seul.', array[9256]);

select public.refresh_cigar_stats();

\echo '=== A8  la vue cite les aromes publics, compte les notes, et ignore le prive'
do $$
declare
  row_count_ integer; entries integer; top jsonb;
begin
  select review_count, entry_count, top_aromas into row_count_, entries, top
    from public.cigar_stats where cigar_id = 'cc250000-0000-4000-8000-000000000003';
  if row_count_ is null then raise exception 'FAIL: la fiche n a pas de ligne dans cigar_stats'; end if;
  if row_count_ <> 1 then raise exception 'FAIL: review_count = % au lieu de 1 (une seule note publique)', row_count_; end if;
  if entries <> 2 then raise exception 'FAIL: entry_count = % au lieu de 2 (deux entrees publiques)', entries; end if;
  if (top -> 0 ->> 'id')::integer <> 9251 or (top -> 0 ->> 'n')::integer <> 2 then
    raise exception 'FAIL: l arome le plus cite devrait etre 9251 x2, lu %', top;
  end if;
  if jsonb_path_exists(top, '$[*] ? (@.id == 9256)') then
    raise exception 'FAIL: un arome d une entree privee est cite : %', top;
  end if;
  if not jsonb_path_exists(top, '$[*] ? (@.id == 9255)') then
    raise exception 'FAIL: l arome d une entree publique sans note manque : %', top;
  end if;
  raise notice 'PASS';
end $$;

\echo '=== A9  un anonyme lit la vue, arômes compris'
do $$
declare top jsonb;
begin
  set local role anon;
  select top_aromas into top from public.cigar_stats
   where cigar_id = 'cc250000-0000-4000-8000-000000000003';
  if top is null then raise exception 'FAIL: un anonyme ne lit pas top_aromas'; end if;
  raise notice 'PASS';
  reset role;
end $$;

-- ---------- Nettoyage --------------------------------------------------------
delete from public.reviews where cigar_id = 'cc250000-0000-4000-8000-000000000003';
delete from ref.cigars  where slug = 'cigare-aromes-test';
delete from ref.brands  where slug = 'marque-aromes-test';
delete from public.aroma_taxonomy where id between 9250 and 9299;
select public.refresh_cigar_stats();

\echo 'Profil aromatique : descripteurs seuls, relecteur seul, vue publique seule.'
