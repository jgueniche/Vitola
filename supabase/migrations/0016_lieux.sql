-- =============================================================================
-- VITOLA — 0016 : les lieux (§5.7, F8)
-- -----------------------------------------------------------------------------
-- Applique l'ADR 0011, acceptée le 23 août 2026 :
--   docs/adr/0011-les-lieux.md
--
-- Les six décisions qu'elle a prises, et où elles vivent dans ce fichier :
--   D1  Seed depuis le registre officiel DGDDI, jamais OSM      → §2 (source),
--       le CSV et sa provenance vivent dans supabase/seed/
--   D2  Tout membre propose (`pending`), un editor publie       → §6, §7
--   D3  `claimed_by` est une identité, posée en privilégié      → §6 (aucun grant)
--   D4  Trois critères structurels, la note en moyenne calculée → §2 (generated)
--   D5  `public`, pas `ref`                                     → tout ce fichier
--   D6  La recherche sans la carte                              → §5
--
-- Et la conséquence de Q6, appliquée d'office : le drapeau `venues_enabled`
-- porte la liste des types offerts (§8). Restreindre l'annuaire après avis
-- juridique est un UPDATE d'une ligne, pas une réécriture.
--
-- Ordre de lecture :
--   §1  Extension postgis
--   §2  Enums et tables
--   §3  Index
--   §4  Triggers
--   §5  venues_nearby() — la recherche du critère de sortie
--   §6  Grants
--   §7  Row Level Security
--   §8  Drapeau, cibles de signalement, colonnes venue_id
--   §9  Auto-contrôle
-- =============================================================================

begin;

-- =============================================================================
-- §1 · POSTGIS
-- -----------------------------------------------------------------------------
-- Dans `extensions`, comme pg_trgm, unaccent et pgcrypto depuis 0001. Les
-- fonctions du dépôt tournent en `search_path = ''`, donc tout ce qui vient de
-- l'extension se qualifie : `extensions.st_dwithin(...)`, et l'opérateur KNN
-- s'écrit `operator(extensions.<->)`.
-- =============================================================================

create extension if not exists postgis with schema extensions;

-- =============================================================================
-- §2 · ENUMS ET TABLES
-- =============================================================================

-- Le vocabulaire du §5.7, tel quel.
create type public.venue_type as enum (
  'civette',     -- un débit de tabac, le seul type que le registre DGDDI connaît
  'cave',        -- une cave à cigares
  'lounge',
  'hotel',
  'restaurant',
  'club',
  'evenement'    -- un salon, un festival — un lieu qui n'existe qu'un moment
);

-- Contrairement à `ref.lines` (ADR 0009), le statut existe AVANT la première
-- ligne : un lieu proposé n'est pas public à l'insertion. C'est l'asymétrie qui
-- permet d'ouvrir la contribution dès le premier jour.
create type public.venue_status as enum ('pending', 'published', 'closed');

-- --- public.venues -----------------------------------------------------------
create table public.venues (
  id     uuid primary key default gen_random_uuid(),
  type   public.venue_type not null,
  name   text not null,
  slug   text not null,

  address     text,
  city        text not null,
  postal_code text,
  country     char(2) not null default 'FR',

  -- Le point, en géographie sphérique : ST_DWithin y compte des mètres.
  -- Nullable : un lieu proposé sans coordonnées existe, il n'apparaît simplement
  -- pas dans une recherche par distance — et la fiche le dit.
  geo extensions.geography(Point, 4326),

  phone   text,
  website text,

  -- Un objet dont les clés sont mon..sun, chaque valeur une phrase libre
  -- (« 09:00–19:00 », « fermé »). La forme vit dans lib/venues/model.ts.
  hours jsonb not null default '{}'::jsonb,

  -- Trois états, pas deux : NULL veut dire « on ne sait pas », et la fiche
  -- l'affiche comme tel plutôt que de l'arrondir à « non ».
  has_smoking_room boolean,
  is_ventilated    boolean,

  -- ADR 0011, D3 : le compte du professionnel qui exploite l'établissement.
  -- Une identité vérifiée hors ligne, jamais un drapeau auto-servi — la colonne
  -- n'est dans aucun grant client, et le parcours de revendication attend un
  -- point de contact (Q7).
  claimed_by uuid references auth.users(id) on delete set null,

  created_by uuid references auth.users(id) on delete set null,
  status     public.venue_status not null default 'pending',

  -- La provenance, par ligne — la règle de `msrp_source` : une donnée
  -- officielle sans date devient une désinformation en silence. NULL pour une
  -- contribution (created_by dit alors d'où elle vient).
  source      text,
  source_date date,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint venues_name_len     check (length(btrim(name)) between 2 and 120),
  constraint venues_city_len     check (length(btrim(city)) between 1 and 80),
  constraint venues_address_len  check (address is null or length(address) <= 200),
  constraint venues_postal_len   check (postal_code is null or postal_code ~ '^[0-9A-Za-z][0-9A-Za-z -]{1,9}$'),
  constraint venues_country_format check (country ~ '^[A-Z]{2}$'),
  constraint venues_phone_len    check (phone is null or length(phone) <= 30),
  constraint venues_website_format check (website is null or website ~ '^https?://.{1,190}$'),
  constraint venues_slug_format  check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint venues_hours_object check (jsonb_typeof(hours) = 'object'),
  constraint venues_hours_known_days check (
    hours - array['mon','tue','wed','thu','fri','sat','sun'] = '{}'::jsonb
  ),
  -- Les deux ensemble ou aucune, comme msrp_eur/msrp_source dans ref.cigars.
  constraint venues_source_dated check ((source is null) = (source_date is null))
);

comment on table public.venues is
  'The venue directory (ADR 0011). Seeded rows come from the official DGDDI '
  'registry (Licence Ouverte) and carry source + source_date; everything else '
  'is member contribution, born pending, published by an editor. claimed_by is '
  'verified identity, never a self-served flag. No price column anywhere: this '
  'is an informative directory, §2 forbids anything promotional.';

-- --- public.venue_reviews ----------------------------------------------------
-- ADR 0011, D4 : le garde-fou §2 est la forme de la donnée. Il n'existe pas de
-- colonne où noter autre chose que ce que le §5.7 autorise — l'accueil, le
-- confort, le conseil — et la note globale est une moyenne engendrée, jamais
-- saisie : le geste exact de la dégustation (0003).
create table public.venue_reviews (
  id       uuid not null primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  user_id  uuid not null references auth.users(id) on delete cascade,

  welcome smallint not null,   -- accueil
  comfort smallint not null,   -- confort
  advice  smallint not null,   -- conseil

  rating numeric(2,1) generated always as (
    round((welcome + comfort + advice)::numeric / 3, 1)
  ) stored,

  body text,

  -- Le régime des commentaires de fiche : masquer est un acte de modération,
  -- écrit par du code à clé de service, jamais par un client.
  hidden_at     timestamptz,
  hidden_by     uuid references auth.users(id) on delete set null,
  hidden_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint venue_reviews_welcome_range check (welcome between 1 and 5),
  constraint venue_reviews_comfort_range check (comfort between 1 and 5),
  constraint venue_reviews_advice_range  check (advice between 1 and 5),
  constraint venue_reviews_body_len check (body is null or length(body) <= 2000),
  constraint venue_reviews_hidden_consistent check (
    (hidden_at is null and hidden_by is null and hidden_reason is null)
    or (hidden_at is not null and hidden_by is not null and hidden_reason is not null)
  )
);

comment on table public.venue_reviews is
  'Three structural criteria — welcome, comfort, advice — each 1..5, the mean '
  'generated and never written (ADR 0011, D4). One review per member and per '
  'venue: a venue review is a revisable judgement, not a diary. The free text '
  'is bounded, reportable, and judged on incitement — never on vocabulary.';

-- =============================================================================
-- §3 · INDEX
-- =============================================================================

create unique index venues_slug_key on public.venues (slug);

-- Le critère de sortie du §9 tient dans celui-ci : GiST sur la géographie,
-- exigé par le §8 du brief.
create index venues_geo_gist on public.venues using gist (geo);

create index venues_status_type_idx on public.venues (status, type);
create index venues_created_by_idx on public.venues (created_by) where created_by is not null;

-- Un avis par membre et par lieu — l'unicité EST la décision « jugement
-- révisable, pas journal ».
create unique index venue_reviews_one_per_member on public.venue_reviews (venue_id, user_id);
create index venue_reviews_recent_idx on public.venue_reviews (venue_id, created_at desc);
create index venue_reviews_user_idx on public.venue_reviews (user_id, created_at desc);

-- =============================================================================
-- §4 · TRIGGERS
-- =============================================================================

create trigger venues_set_updated_at
  before update on public.venues
  for each row execute function public.tg_set_updated_at();

create trigger venue_reviews_set_updated_at
  before update on public.venue_reviews
  for each row execute function public.tg_set_updated_at();

-- =============================================================================
-- §5 · venues_nearby() — LA RECHERCHE DU CRITÈRE DE SORTIE
-- -----------------------------------------------------------------------------
-- « Recherche 25 km < 200 ms » (§9). ST_DWithin sur geography compte des
-- mètres et s'appuie sur le GiST ; l'ordre est le KNN `<->`, qui rend la
-- distance sphérique et se sert du même index.
--
-- **SECURITY INVOKER**, comme feed_page() et pour la même raison : un appel
-- PostgREST est une transaction, pas un privilège. Le filtre
-- `status = 'published'` dans le corps est un filtre d'ONGLET — il dit de quoi
-- la liste parle, jamais qui a le droit de lire (la leçon de feed_page /
-- post_card) : lire UN lieu passe par son slug, sous RLS, jamais par ici.
-- =============================================================================

create or replace function public.venues_nearby(
  lat double precision,
  lng double precision,
  radius_km integer default 25,
  venue_types public.venue_type[] default null,
  max_rows integer default 100
)
returns table (
  id uuid,
  slug text,
  name text,
  type public.venue_type,
  address text,
  city text,
  postal_code text,
  has_smoking_room boolean,
  is_ventilated boolean,
  distance_m double precision
)
language plpgsql
stable
set search_path = ''
as $$
declare
  origin extensions.geography;
begin
  if lat is null or lng is null
     or lat < -90 or lat > 90 or lng < -180 or lng > 180 then
    raise exception 'VITOLA_BAD_POINT: latitude ou longitude hors bornes'
      using errcode = '22023';
  end if;
  if radius_km is null or radius_km < 1 or radius_km > 100 then
    raise exception 'VITOLA_BAD_RADIUS: le rayon va de 1 a 100 km'
      using errcode = '22023';
  end if;

  origin := extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography;

  return query
  select v.id, v.slug, v.name, v.type, v.address, v.city, v.postal_code,
         v.has_smoking_room, v.is_ventilated,
         extensions.st_distance(v.geo, origin)::double precision
    from public.venues v
   where v.status = 'published'
     and v.geo is not null
     and (venue_types is null or v.type = any (venue_types))
     and extensions.st_dwithin(v.geo, origin, (radius_km * 1000)::double precision)
   order by v.geo operator(extensions.<->) origin
   limit least(greatest(coalesce(max_rows, 100), 1), 100);
end;
$$;

comment on function public.venues_nearby(double precision, double precision, integer, public.venue_type[], integer) is
  'Published venues within radius_km of a point, nearest first. SECURITY '
  'INVOKER; the status filter is a tab filter, not an audience one — reading a '
  'single venue goes through its slug, under RLS.';

revoke execute on function public.venues_nearby(double precision, double precision, integer, public.venue_type[], integer)
  from public;
grant execute on function public.venues_nearby(double precision, double precision, integer, public.venue_type[], integer)
  to anon, authenticated;

-- =============================================================================
-- §6 · GRANTS
-- =============================================================================

revoke all on public.venues from anon, authenticated;
grant select on public.venues to anon, authenticated;

-- Pas de `status` : un lieu naît `pending`, et c'est le défaut qui l'écrit.
-- Pas de `claimed_by`, pas de `source`/`source_date` : la revendication est un
-- acte privilégié (D3), la provenance officielle est un acte de seed.
grant insert (type, name, slug, address, city, postal_code, country, geo,
              phone, website, hours, has_smoking_room, is_ventilated, created_by)
  on public.venues to authenticated;

-- `status` est ici — publier est un UPDATE d'editor, fermer un geste de
-- revendicateur — et les policies bornent qui peut l'amener où (§7).
grant update (type, name, address, city, postal_code, country, geo,
              phone, website, hours, has_smoking_room, is_ventilated, status)
  on public.venues to authenticated;
-- `slug` non plus en UPDATE : une adresse qui change casse les liens partagés.

grant delete on public.venues to authenticated;

revoke all on public.venue_reviews from anon, authenticated;
grant select on public.venue_reviews to anon, authenticated;
grant insert (venue_id, user_id, welcome, comfort, advice, body)
  on public.venue_reviews to authenticated;
grant update (welcome, comfort, advice, body)
  on public.venue_reviews to authenticated;
grant delete on public.venue_reviews to authenticated;
-- `rating` n'est dans aucun grant et ne pourrait pas y être : engendrée.
-- `hidden_*` non plus : le régime des commentaires, clé de service seule.

-- =============================================================================
-- §7 · ROW LEVEL SECURITY
-- =============================================================================

-- --- public.venues -----------------------------------------------------------
alter table public.venues enable row level security;
alter table public.venues force row level security;

-- Découpées par rôle (leçon de 0003) : la branche anonyme ne contient que ce
-- qu'un anonyme peut évaluer. `closed` reste lisible — un annuaire qui dit
-- « fermé » évite qu'on re-propose le même lieu, et ne promeut rien.
create policy venues_select_public on public.venues
  for select to anon, authenticated
  using (status in ('published', 'closed'));

create policy venues_select_own on public.venues
  for select to authenticated
  using (created_by = (select auth.uid()));

create policy venues_select_editor on public.venues
  for select to authenticated
  using ((select public.has_min_role('editor')));

-- ADR 0011, D2 : tout membre propose, et une proposition naît `pending`. Le
-- WITH CHECK le redit même si le grant s'élargit un jour.
create policy venues_insert_own on public.venues
  for insert to authenticated
  with check (created_by = (select auth.uid()) and status = 'pending');

-- L'auteur corrige sa proposition tant qu'elle attend — et ne peut pas la
-- publier lui-même : le WITH CHECK exige que la ligne reste `pending`.
create policy venues_update_author on public.venues
  for update to authenticated
  using (created_by = (select auth.uid()) and status = 'pending')
  with check (created_by = (select auth.uid()) and status = 'pending');

-- Le revendicateur tient sa fiche. Il peut la fermer (il sait que son
-- établissement ferme), jamais la remettre en attente.
create policy venues_update_claimant on public.venues
  for update to authenticated
  using (claimed_by = (select auth.uid()))
  with check (claimed_by = (select auth.uid()) and status in ('published', 'closed'));

-- L'editor publie, corrige, ferme — le seuil de la file wiki (D2).
create policy venues_update_editor on public.venues
  for update to authenticated
  using ((select public.has_min_role('editor')))
  with check ((select public.has_min_role('editor')));

-- Retirer sa proposition en attente, comme retirer une proposition wiki.
create policy venues_delete_author on public.venues
  for delete to authenticated
  using (created_by = (select auth.uid()) and status = 'pending');

create policy venues_delete_moderator on public.venues
  for delete to authenticated
  using ((select public.has_min_role('moderator')));

-- --- public.venue_reviews ----------------------------------------------------
alter table public.venue_reviews enable row level security;
alter table public.venue_reviews force row level security;

create policy venue_reviews_select_visible on public.venue_reviews
  for select to anon, authenticated
  using (hidden_at is null);

create policy venue_reviews_select_own on public.venue_reviews
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy venue_reviews_select_moderator on public.venue_reviews
  for select to authenticated
  using ((select public.has_min_role('moderator')));

-- On note un lieu publié — pas une proposition, pas un lieu fermé depuis
-- toujours qu'on n'a pas connu. L'EXISTS porte la RLS de `venues`.
create policy venue_reviews_insert_own on public.venue_reviews
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.venues v
                 where v.id = venue_id and v.status = 'published')
  );

create policy venue_reviews_update_own on public.venue_reviews
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy venue_reviews_delete_own on public.venue_reviews
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy venue_reviews_delete_moderator on public.venue_reviews
  for delete to authenticated
  using ((select public.has_min_role('moderator')));

-- Le blocage, en restrictif — la huitième, sur la même règle que les sept
-- autres : du texte écrit par une personne se retire, un nom de lieu non.
create policy venue_reviews_block_restrictive on public.venue_reviews
  as restrictive for select to authenticated
  using (
    user_id = (select auth.uid())
    or not (user_id = any ((select public.blocked_user_ids())::uuid[]))
  );

-- =============================================================================
-- §8 · DRAPEAU, CIBLES DE SIGNALEMENT, COLONNES venue_id
-- =============================================================================

-- Q6, appliquée d'office : restreindre l'annuaire après avis juridique est un
-- UPDATE de cette ligne — retirer un type de la charge utile le retire des
-- écrans, sans déploiement.
insert into public.feature_flags (key, enabled, description, payload) values
  ('venues_enabled', true,
   'L''annuaire des lieux (ADR 0011, Q6). La charge utile liste les types '
   'offerts : restreindre l''annuaire après avis juridique — retirer les '
   'civettes, ne garder que les lounges — est un UPDATE de cette ligne.',
   '{"types": ["civette", "cave", "lounge", "hotel", "restaurant", "club", "evenement"]}'::jsonb)
on conflict (key) do nothing;

-- Une fiche lieu et un avis de lieu sont du contenu que le DSA oblige à rendre
-- signalable — la fiche pour l'inexactitude (un lieu fermé, le motif
-- `inaccurate`), l'avis pour le reste. Même geste que 0010 et 0014.
alter table mod.reports drop constraint reports_entity_known;
alter table mod.reports add constraint reports_entity_known check (
  entity_schema || '.' || entity_table in
    ('public.comments', 'public.reviews', 'ref.cigars', 'public.profiles',
     'public.posts', 'public.post_comments', 'public.messages',
     'public.venues', 'public.venue_reviews')
);

-- Les deux colonnes que 0010 et 0014 avaient délibérément laissées de côté
-- « jusqu'à P5 » : P5 est là, et les écrans qui les remplissent arrivent dans
-- la même livraison.
alter table public.events add column venue_id uuid references public.venues(id) on delete set null;
alter table public.posts  add column venue_id uuid references public.venues(id) on delete set null;

grant insert (venue_id), update (venue_id) on public.events to authenticated;
grant insert (venue_id) on public.posts to authenticated;
-- Pas d'UPDATE de posts.venue_id : le grant UPDATE de posts porte
-- (body, visibility) et le lieu d'une session ne se réécrit pas après coup.

create index events_venue_idx on public.events (venue_id) where venue_id is not null;
create index posts_venue_idx on public.posts (venue_id) where venue_id is not null;

-- =============================================================================
-- §9 · AUTO-CONTRÔLE
-- =============================================================================

do $$
declare
  offender text;
  n        integer;
  cols     text;
begin
  -- 1. §0.5 du brief.
  select string_agg(format('%I.%I', ns.nspname, c.relname), ', ' order by 1)
    into offender
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
   where c.relkind = 'r'
     and ns.nspname in ('public', 'ref', 'mod')
     and (c.relrowsecurity = false
          or not exists (select 1 from pg_policy p where p.polrelid = c.oid));
  if offender is not null then
    raise exception 'VITOLA_RLS_GAP: table(s) sans RLS ou sans policy : %', offender;
  end if;

  -- 2. postgis vit dans `extensions`, comme les autres. Ailleurs, les types et
  --    fonctions qualifiés de ce fichier ne résolvent pas.
  if not exists (select 1 from pg_extension e
                  join pg_namespace ns on ns.oid = e.extnamespace
                 where e.extname = 'postgis' and ns.nspname = 'extensions')
  then
    raise exception 'VITOLA_SHAPE_GAP: postgis absent ou hors du schema extensions';
  end if;

  -- 3. Le critère de sortie tient dans le GiST : sans lui, ST_DWithin
  --    fonctionne et rampe — un oubli que rien d'autre ne signale.
  if not exists (select 1
                   from pg_index i
                   join pg_class idx on idx.oid = i.indexrelid
                   join pg_am am on am.oid = idx.relam
                  where i.indrelid = 'public.venues'::regclass
                    and am.amname = 'gist')
  then
    raise exception 'VITOLA_SHAPE_GAP: venues.geo a perdu son index GiST';
  end if;

  -- 4. ADR 0011, D3 et D1 : la revendication et la provenance ne s'écrivent
  --    pas depuis un client, et un lieu naît pending (status hors INSERT).
  select string_agg(column_name || ' (' || privilege_type || ')', ', ' order by 1)
    into offender
    from information_schema.column_privileges
   where table_schema = 'public'
     and grantee in ('anon', 'authenticated')
     and privilege_type in ('INSERT', 'UPDATE')
     and ((table_name = 'venues'
           and (column_name in ('claimed_by', 'source', 'source_date', 'updated_at')
                or (column_name = 'status' and privilege_type = 'INSERT')
                or (column_name = 'slug' and privilege_type = 'UPDATE')))
       or (table_name = 'venue_reviews'
           and column_name in ('rating', 'hidden_at', 'hidden_by', 'hidden_reason', 'updated_at')));
  if offender is not null then
    raise exception 'VITOLA_GRANT_GAP: colonne(s) fermee(s) devenue(s) ecrivable(s) : %', offender;
  end if;

  -- 5. ADR 0011, D4 : le garde-fou §2 est la forme de la donnee. Ce qu'un
  --    client peut ecrire dans un avis est EXACTEMENT les trois criteres du
  --    §5.7, la cible et le texte — rien d'autre, jamais.
  select string_agg(column_name, ', ' order by column_name) into cols
    from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'venue_reviews'
     and privilege_type = 'INSERT' and grantee = 'authenticated';
  if cols is distinct from 'advice, body, comfort, user_id, venue_id, welcome' then
    raise exception 'VITOLA_SCOPE_GAP: l''INSERT de venue_reviews porte [%], pas les trois criteres du §5.7', cols;
  end if;

  -- 6. La note est engendrée — la moyenne ne se saisit pas, comme celle d'une
  --    dégustation ne se saisit pas.
  if (select attgenerated from pg_attribute
       where attrelid = 'public.venue_reviews'::regclass and attname = 'rating') <> 's'
  then
    raise exception 'VITOLA_SHAPE_GAP: venue_reviews.rating n est plus une colonne engendree';
  end if;

  -- 7. L'auteur d'une proposition ne peut pas la publier lui-même : le
  --    WITH CHECK de sa policy doit exiger que la ligne reste pending.
  if pg_get_expr(
       (select polwithcheck from pg_policy where polname = 'venues_update_author'),
       'public.venues'::regclass) !~ 'pending'
  then
    raise exception 'VITOLA_SCOPE_GAP: venues_update_author laisse l auteur publier (D2)';
  end if;

  -- 8. venues_nearby() reste en droits d'appelant.
  if exists (select 1 from pg_proc
              where oid = 'public.venues_nearby(double precision, double precision, integer, public.venue_type[], integer)'::regprocedure
                and prosecdef)
  then
    raise exception 'VITOLA_SCOPE_GAP: venues_nearby() est passée en SECURITY DEFINER';
  end if;

  -- 9. Les deux nouvelles cibles de signalement sont dans le CHECK.
  if pg_get_constraintdef(
       (select oid from pg_constraint
         where conrelid = 'mod.reports'::regclass and conname = 'reports_entity_known'))
     !~ 'public.venues' then
    raise exception 'VITOLA_SCOPE_GAP: mod.reports ne connait pas public.venues';
  end if;

  -- 10. Le blocage reste restrictif, et il y en a une de plus.
  select count(*) into n
    from pg_policy where polname like '%\_block\_restrictive' and polpermissive = false;
  if n <> 8 then
    raise exception 'VITOLA_SCOPE_GAP: % policies de blocage restrictives, 8 attendues', n;
  end if;

  -- 11. Aucune fonction appelable au titre de PUBLIC.
  select string_agg(proname, ', ' order by proname) into offender
    from pg_proc
   where pronamespace = 'public'::regnamespace
     and array_to_string(coalesce(proacl, '{}')::text[], ' ') ~ '(^| )=X/';
  if offender is not null then
    raise exception 'VITOLA_GRANT_GAP: EXECUTE accordé à PUBLIC sur : %', offender;
  end if;

  raise notice
    '0016 : un lieu naît pending, une revendication se vérifie, un avis n''a que trois colonnes où exister.';
end;
$$;

commit;
