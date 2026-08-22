-- =============================================================================
-- Assertions de comportement sur le dépôt d'un signalement (migration 0006).
--
-- Mêmes précautions que 03_carnet_rls.sql et 04_comments_moderation.sql :
--   1. chaque assertion vit dans un bloc `do $$ … $$`, qui est une transaction
--      implicite — `SET LOCAL ROLE` hors transaction est ignoré en silence et
--      l'assertion s'exécute alors en superutilisateur, verte pour rien ;
--   2. une assertion « rien ne s'est passé » prouve d'abord que la chose
--      existe, en contexte privilégié.
--
-- Ce que ce fichier vérifie et que rien d'autre ne peut vérifier : la porte de
-- service ouverte par 0006 a exactement la taille du geste. `file_report()`
-- traverse `mod`, et personne d'autre qu'elle ne le traverse. Une régression de
-- grant sur ces deux fonctions ne se voit nulle part ailleurs — ni à la
-- compilation, ni dans un parcours de navigateur : elle se voit ici ou pas.
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

-- ---------- Fixtures, créées comme postgres (contexte privilégié) ------------
-- Préfixes d'UUID distincts sur les douze premiers caractères hexadécimaux :
-- `tg_handle_new_user()` en dérive le pseudo, et deux comptes qui les partagent
-- se heurtent sur `profiles_handle_key`.

insert into auth.users (id, email, raw_user_meta_data) values
  ('a7000000-0000-4000-8000-000000000001','sig-signalant@x.test','{"birth_date":"1984-06-15"}'),
  ('b8000000-0000-4000-8000-000000000002','sig-tiers@x.test'    ,'{"birth_date":"1976-02-08"}')
on conflict (id) do nothing;

update public.profiles set handle='sig_signalant' where id='a7000000-0000-4000-8000-000000000001';
update public.profiles set handle='sig_tiers'     where id='b8000000-0000-4000-8000-000000000002';

insert into ref.manufacturers (id,name,slug,country) values
  ('ea000000-0000-4000-8000-000000000001','Manufacture Signalement','manufacture-signalement','NI')
on conflict (id) do nothing;
insert into ref.brands (id,manufacturer_id,name,slug,country,is_cuban) values
  ('eb000000-0000-4000-8000-000000000001','ea000000-0000-4000-8000-000000000001','Marque Signalement','marque-signalement','NI',false)
on conflict (id) do nothing;
insert into ref.cigars (id,brand_id,commercial_name,slug,origin_country,status) values
  ('ec000000-0000-4000-8000-000000000001','eb000000-0000-4000-8000-000000000001','Fiche Signalee','fiche-signalee','NI','published')
on conflict (id) do nothing;

insert into public.comments (id,cigar_id,author_id,body) values
  ('55550000-0000-4000-8000-000000000001','ec000000-0000-4000-8000-000000000001',
   'b8000000-0000-4000-8000-000000000002','Commentaire a signaler')
on conflict (id) do nothing;

\echo '=== S1  authenticated ne peut pas appeler file_report'
do $$
declare denied boolean := false;
begin
  set local role authenticated;
  begin
    perform public.file_report(
      'a7000000-0000-4000-8000-000000000001', 'public', 'comments',
      '55550000-0000-4000-8000-000000000001', 'spam', null);
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then
    raise exception 'FAIL: un client authentifie a pu ecrire directement dans la file DSA';
  end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== S2  anon non plus'
do $$
declare denied boolean := false;
begin
  set local role anon;
  begin
    perform public.file_report(
      null, 'public', 'comments', '55550000-0000-4000-8000-000000000001', 'spam', null);
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'FAIL: un visiteur anonyme a pu ecrire dans la file DSA'; end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo '=== S3  la cle de service depose un signalement, et il atterrit dans la file'
do $$
declare
  result jsonb;
  stored record;
begin
  set local role service_role;
  result := public.file_report(
    'a7000000-0000-4000-8000-000000000001', 'public', 'comments',
    '55550000-0000-4000-8000-000000000001', 'tobacco_promotion', '  Fait l eloge du produit  ');
  reset role;

  if result ->> 'status' <> 'created' then
    raise exception 'FAIL: statut % au lieu de created', result ->> 'status';
  end if;

  select * into stored from mod.reports where id = (result ->> 'id')::uuid;
  if stored.reason::text <> 'tobacco_promotion' then
    raise exception 'FAIL: motif enregistre = %', stored.reason;
  end if;
  if stored.status::text <> 'open' then
    raise exception 'FAIL: un signalement neuf devrait etre open, il est %', stored.status;
  end if;
  -- Le detail est rogne a l'insertion : un espace de part et d'autre n'est pas
  -- du contenu, et un detail vide doit valoir NULL et non chaine vide.
  if stored.detail <> 'Fait l eloge du produit' then
    raise exception 'FAIL: detail non rogne : [%]', stored.detail;
  end if;
  raise notice 'PASS';
end $$;

\echo '=== S4  le meme signalant, la meme cible, un dossier ouvert : un doublon, pas une ligne'
do $$
declare
  before_count integer;
  after_count  integer;
  result       jsonb;
begin
  select count(*) into before_count from mod.reports
   where entity_id = '55550000-0000-4000-8000-000000000001';

  set local role service_role;
  result := public.file_report(
    'a7000000-0000-4000-8000-000000000001', 'public', 'comments',
    '55550000-0000-4000-8000-000000000001', 'spam', 'Une seconde fois');
  reset role;

  select count(*) into after_count from mod.reports
   where entity_id = '55550000-0000-4000-8000-000000000001';

  if result ->> 'status' <> 'duplicate' then
    raise exception 'FAIL: statut % au lieu de duplicate', result ->> 'status';
  end if;
  if after_count <> before_count then
    raise exception 'FAIL: la file a grossi de % ligne(s) sur un doublon', after_count - before_count;
  end if;
  raise notice 'PASS';
end $$;

\echo '=== S5  un signalant different sur la meme cible n''est pas un doublon'
do $$
declare result jsonb;
begin
  set local role service_role;
  result := public.file_report(
    'b8000000-0000-4000-8000-000000000002', 'public', 'comments',
    '55550000-0000-4000-8000-000000000001', 'harassment', null);
  reset role;

  if result ->> 'status' <> 'created' then
    raise exception 'FAIL: deux personnes distinctes comptent pour un doublon (statut %)',
      result ->> 'status';
  end if;
  raise notice 'PASS';
end $$;

\echo '=== S6  un motif inconnu est refuse par l''enum, pas accepte en texte libre'
do $$
declare refused boolean := false;
begin
  set local role service_role;
  begin
    perform public.file_report(
      'a7000000-0000-4000-8000-000000000001', 'public', 'comments',
      '55550000-0000-4000-8000-000000000002', 'je-n-aime-pas', null);
  exception when invalid_text_representation then refused := true;
  end;
  reset role;
  if not refused then raise exception 'FAIL: un motif hors enum a ete accepte'; end if;
  raise notice 'PASS';
end $$;

\echo '=== S7  une cible hors des quatre surfaces connues est refusee'
do $$
declare refused boolean := false;
begin
  set local role service_role;
  begin
    perform public.file_report(
      'a7000000-0000-4000-8000-000000000001', 'public', 'feature_flags',
      'comments_min_role', 'other', null);
  exception when check_violation then refused := true;
  end;
  reset role;
  if not refused then raise exception 'FAIL: une entite hors perimetre a ete acceptee'; end if;
  raise notice 'PASS';
end $$;

\echo '=== S8  une decision rouvre le droit de signaler la meme cible'
do $$
declare result jsonb;
begin
  update mod.reports
     set status = 'dismissed', decided_at = now(),
         decided_by = 'b8000000-0000-4000-8000-000000000002',
         decision_note = 'Rien a reprocher'
   where reporter_id = 'a7000000-0000-4000-8000-000000000001'
     and entity_id = '55550000-0000-4000-8000-000000000001';

  set local role service_role;
  result := public.file_report(
    'a7000000-0000-4000-8000-000000000001', 'public', 'comments',
    '55550000-0000-4000-8000-000000000001', 'inaccurate', 'Le commentaire a change depuis');
  reset role;

  -- La deduplication porte sur un dossier OUVERT. Une fois tranche, le meme
  -- signalant doit pouvoir revenir : sinon une decision fermerait la porte pour
  -- toujours, y compris quand le contenu change apres coup.
  if result ->> 'status' <> 'created' then
    raise exception 'FAIL: apres decision, un nouveau signalement est refuse (statut %)',
      result ->> 'status';
  end if;
  raise notice 'PASS';
end $$;

\echo '=== S9  vingt signalements dans l''heure, et le vingt-et-unieme est freine'
do $$
declare result jsonb;
begin
  -- Inseres en contexte privilegie, avec des cibles distinctes pour qu'aucun ne
  -- soit un doublon : c'est bien le compteur horaire qu'on exerce, pas la
  -- deduplication du S4.
  insert into mod.reports (reporter_id, entity_schema, entity_table, entity_id, reason)
  select 'b8000000-0000-4000-8000-000000000002', 'public', 'comments',
         '55550000-0000-4000-8000-9' || lpad(i::text, 11, '0'), 'spam'
    from generate_series(1, 20) as i;

  set local role service_role;
  result := public.file_report(
    'b8000000-0000-4000-8000-000000000002', 'public', 'comments',
    '55550000-0000-4000-8000-000000000099', 'spam', null);
  reset role;

  if result ->> 'status' <> 'throttled' then
    raise exception 'FAIL: le frein horaire ne se declenche pas (statut %)', result ->> 'status';
  end if;
  raise notice 'PASS';
end $$;

\echo '=== S10 le signalant recupere ses signalements, et rien de ceux des autres'
do $$
declare
  mine   jsonb;
  theirs jsonb;
begin
  set local role service_role;
  mine   := public.moderation_records_for_subject('a7000000-0000-4000-8000-000000000001');
  theirs := public.moderation_records_for_subject('b8000000-0000-4000-8000-000000000002');
  reset role;

  if jsonb_array_length(mine -> 'reportsFiled') = 0 then
    raise exception 'FAIL: l''export ne rend aucun signalement a son auteur';
  end if;

  -- Le point qui compte : ce que l'un recupere ne contient pas ce que l'autre a
  -- ecrit. Le filtre par sujet est la frontiere entiere, comme pour l'export.
  if exists (
    select 1 from jsonb_array_elements(mine -> 'reportsFiled') e
     where e ->> 'detail' = 'Rien a reprocher') then
    raise exception 'FAIL: une note de decision d''un tiers fuit dans l''export';
  end if;

  -- Le tiers a tranche un dossier : c'est son acte, il doit le retrouver.
  if jsonb_array_length(theirs -> 'reportsDecided') = 0 then
    raise exception 'FAIL: un moderateur ne retrouve pas les decisions qu''il a prises';
  end if;
  raise notice 'PASS';
end $$;

\echo '=== S11 moderation_records_for_subject n''est pas appelable par un client'
do $$
declare denied boolean := false;
begin
  set local role authenticated;
  begin
    perform public.moderation_records_for_subject('a7000000-0000-4000-8000-000000000001');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then
    raise exception 'FAIL: un client peut lire la file DSA par la porte de l''export';
  end if;
  raise notice 'PASS';
  reset role;
end $$;

\echo ''
\echo 'Signalement : 11 assertions passees.'
