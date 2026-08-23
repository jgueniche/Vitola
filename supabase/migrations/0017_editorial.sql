-- =============================================================================
-- VITOLA — 0017 : le journal (§5.8, F9)
-- -----------------------------------------------------------------------------
-- Applique l'ADR 0012, acceptée le 23 août 2026 :
--   docs/adr/0012-le-journal.md
--
-- Les décisions qu'elle a prises, et où elles vivent dans ce fichier :
--   D1  Un article vit dans la table du §5.8, draft par défaut       → §2
--   D2  Le corps est du Markdown borné, JAMAIS du MDX — `body_md`    → §2 (nom
--       de colonne) ; le rendu vit dans lib/journal/markdown.ts
--   D3  Deux audiences, une adresse — `audience enum(public|gated)`  → §2 ;
--       la garde du portail vit dans la page, le sitemap et le flux
--       ne lisent que le public
--   D4  Pas d'article_links sur un article public                    → §4, les
--       deux triggers (le lien ET le changement d'audience)
--   D5  Pas de newsletter en v1                                      → rien ici,
--       et c'est le point : aucune table d'adresses ne naît sans envoyeur
--
-- Qui écrit : un editor, et il publie lui-même (pas de file proposeur/relecteur
-- comme au wiki — écrire dans le journal EST le privilège, gagné par le rôle).
--
-- Ordre de lecture :
--   §1  Enums
--   §2  Tables
--   §3  Index
--   §4  Triggers
--   §5  Grants
--   §6  Row Level Security
--   §7  Auto-contrôle
-- =============================================================================

begin;

-- =============================================================================
-- §1 · ENUMS
-- =============================================================================

-- Les six catégories du §5.8, telles quelles.
create type public.article_category as enum (
  'guide', 'interview', 'reportage', 'lexique', 'actualite', 'accord'
);

-- D3 : la frontière de Q13, par ligne. `gated` est le défaut — un article
-- nouveau est derrière le portail tant qu'un editor ne décide pas le contraire,
-- la même direction de sûreté que `reviews.visibility = private`.
create type public.article_audience as enum ('public', 'gated');

create type public.article_status as enum ('draft', 'published');

-- =============================================================================
-- §2 · TABLES
-- =============================================================================

create table public.articles (
  id    uuid primary key default gen_random_uuid(),
  slug  text not null,
  title text not null,

  -- Le chapô : ce que la liste, le flux RSS et la carte OG montrent. Jamais le
  -- corps tronqué — un extrait se rédige.
  excerpt text,

  -- Markdown borné (ADR 0012, D2). Le nom de colonne porte la décision : pas
  -- de MDX, un article est du contenu et jamais du code.
  body_md text not null,

  category public.article_category not null,
  tags     text[] not null default '{}',

  audience public.article_audience not null default 'gated',
  status   public.article_status not null default 'draft',

  author_id uuid references auth.users(id) on delete set null,

  -- Calculé à l'écriture depuis le corps (lib/journal/model.ts), jamais saisi.
  reading_time_min smallint,

  seo jsonb not null default '{}'::jsonb,

  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint articles_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint articles_title_len   check (length(btrim(title)) between 2 and 160),
  constraint articles_excerpt_len check (excerpt is null or length(excerpt) <= 300),
  constraint articles_body_len    check (length(body_md) between 1 and 40000),
  constraint articles_tags_count  check (array_length(tags, 1) is null or array_length(tags, 1) <= 8),
  constraint articles_reading_time check (reading_time_min is null or reading_time_min between 1 and 120),
  constraint articles_seo_object  check (jsonb_typeof(seo) = 'object'),
  -- Publié sans date de publication, c'est un flux RSS qui ne sait pas trier.
  constraint articles_published_dated check (status <> 'published' or published_at is not null)
);

comment on table public.articles is
  'The journal (ADR 0012). body_md is a bounded Markdown subset rendered to '
  'React elements — never MDX, never HTML: an article is content, not code. '
  'audience draws the Q13 frontier per row; a gated article defends itself at '
  'the page and never reaches the sitemap or the RSS feed.';

-- --- public.article_links ----------------------------------------------------
-- §5.8 : un article pointe des fiches ou des lieux. INTERDIT sur un article
-- public (D4) — le lien vers une fiche est précisément la « mention de
-- produit » que Q13 exclut du côté indexable.
create table public.article_links (
  id         uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  cigar_id   uuid references ref.cigars(id) on delete cascade,
  venue_id   uuid references public.venues(id) on delete cascade,

  created_at timestamptz not null default now(),

  -- Exactement une cible. Un lien qui pointe deux choses n'en pointe aucune.
  constraint article_links_one_target check ((cigar_id is null) <> (venue_id is null))
);

comment on table public.article_links is
  'What an article points at (§5.8). Forbidden on a public article — the two '
  'triggers of migration 0017 hold both directions of that rule.';

-- =============================================================================
-- §3 · INDEX
-- =============================================================================

create unique index articles_slug_key on public.articles (slug);

-- La liste du journal et le flux : le publié, du plus récent au plus ancien.
create index articles_published_idx on public.articles (published_at desc)
  where status = 'published';

create index articles_author_idx on public.articles (author_id) where author_id is not null;

create unique index article_links_cigar_key on public.article_links (article_id, cigar_id)
  where cigar_id is not null;
create unique index article_links_venue_key on public.article_links (article_id, venue_id)
  where venue_id is not null;
create index article_links_article_idx on public.article_links (article_id);

-- =============================================================================
-- §4 · TRIGGERS
-- =============================================================================

create trigger articles_set_updated_at
  before update on public.articles
  for each row execute function public.tg_set_updated_at();

-- D4, tenu dans les deux sens — la leçon du trigger de portée de l'ADR 0007 :
-- une règle entre deux tables se contourne par celle qu'on a oublié de garder.
--
-- SECURITY INVOKER : l'appelant lit `articles` (sa policy le lui permet — il
-- est editor, sinon il n'écrirait pas de lien), et le garde-fou n'a besoin
-- d'aucun privilège pour refuser.
create or replace function public.tg_article_link_stays_gated()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.articles a
              where a.id = new.article_id and a.audience = 'public') then
    raise exception
      'VITOLA_AUDIENCE_GAP: un article public ne pointe pas de fiche (ADR 0012, D4)'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.tg_article_link_stays_gated() from public, anon, authenticated;

create trigger article_links_stay_gated
  before insert or update on public.article_links
  for each row execute function public.tg_article_link_stays_gated();

create or replace function public.tg_article_audience_keeps_links()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.audience = 'public' and old.audience = 'gated'
     and exists (select 1 from public.article_links l where l.article_id = new.id) then
    raise exception
      'VITOLA_AUDIENCE_GAP: retirer les liens avant de rendre un article public (ADR 0012, D4)'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.tg_article_audience_keeps_links() from public, anon, authenticated;

create trigger articles_audience_keeps_links
  before update of audience on public.articles
  for each row execute function public.tg_article_audience_keeps_links();

-- =============================================================================
-- §5 · GRANTS
-- =============================================================================

revoke all on public.articles from anon, authenticated;
grant select on public.articles to anon, authenticated;

-- `status` et `published_at` SONT dans les grants : publier est le geste de
-- l'editor lui-même (ADR 0012) — la policy borne qui, pas la colonne.
-- `updated_at` reste au trigger.
grant insert (slug, title, excerpt, body_md, category, tags, audience, status,
              author_id, reading_time_min, seo, published_at)
  on public.articles to authenticated;
grant update (title, excerpt, body_md, category, tags, audience, status,
              reading_time_min, seo, published_at)
  on public.articles to authenticated;
-- `slug` non plus en UPDATE : une adresse qui change casse les liens partagés.
grant delete on public.articles to authenticated;

revoke all on public.article_links from anon, authenticated;
grant select on public.article_links to anon, authenticated;
grant insert (article_id, cigar_id, venue_id) on public.article_links to authenticated;
grant delete on public.article_links to authenticated;
-- Aucun UPDATE : un lien se pose ou se retire.

-- =============================================================================
-- §6 · ROW LEVEL SECURITY
-- =============================================================================

alter table public.articles enable row level security;
alter table public.articles force row level security;

-- Découpées par rôle (leçon de 0003) : la branche anonyme n'évalue rien
-- qu'un anonyme ne puisse évaluer.
create policy articles_select_published on public.articles
  for select to anon, authenticated
  using (status = 'published');

create policy articles_select_editor on public.articles
  for select to authenticated
  using ((select public.has_min_role('editor')));

create policy articles_insert_editor on public.articles
  for insert to authenticated
  with check ((select public.has_min_role('editor')) and author_id = (select auth.uid()));

create policy articles_update_editor on public.articles
  for update to authenticated
  using ((select public.has_min_role('editor')))
  with check ((select public.has_min_role('editor')));

create policy articles_delete_editor on public.articles
  for delete to authenticated
  using ((select public.has_min_role('editor')));

alter table public.article_links enable row level security;
alter table public.article_links force row level security;

-- L'audience d'un lien se déduit de son article par un EXISTS sous la RLS de
-- `articles` — le mécanisme de `review_thirds` et des tables filles de la cave.
create policy article_links_select_visible on public.article_links
  for select to anon, authenticated
  using (exists (select 1 from public.articles a where a.id = article_id));

create policy article_links_insert_editor on public.article_links
  for insert to authenticated
  with check ((select public.has_min_role('editor')));

create policy article_links_delete_editor on public.article_links
  for delete to authenticated
  using ((select public.has_min_role('editor')));

-- =============================================================================
-- §7 · AUTO-CONTRÔLE
-- =============================================================================

do $$
declare
  offender text;
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

  -- 2. ADR 0012, D2 : la colonne s'appelle body_md, et aucune colonne *_mdx
  --    n'existe. Le nom porte la décision — un renommage vers mdx est un
  --    changement d'ADR, pas un détail.
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and column_name like '%mdx%') then
    raise exception 'VITOLA_SHAPE_GAP: une colonne MDX est apparue — l ADR 0012 dit contenu, jamais code';
  end if;

  -- 3. ADR 0012, D4 : les deux triggers de la frontière existent.
  if (select count(*) from pg_trigger
       where tgname in ('article_links_stay_gated', 'articles_audience_keeps_links')) <> 2 then
    raise exception 'VITOLA_SCOPE_GAP: la frontiere public/gated a perdu un de ses deux triggers';
  end if;

  -- 4. Un article nouveau est gated et draft — les defauts sont la direction
  --    de surete.
  if (select column_default from information_schema.columns
       where table_schema='public' and table_name='articles' and column_name='audience')
     !~ 'gated' then
    raise exception 'VITOLA_SHAPE_GAP: le defaut d audience n est plus gated';
  end if;
  if (select column_default from information_schema.columns
       where table_schema='public' and table_name='articles' and column_name='status')
     !~ 'draft' then
    raise exception 'VITOLA_SHAPE_GAP: le defaut de statut n est plus draft';
  end if;

  -- 5. updated_at reste au trigger, slug ne se réécrit pas.
  select string_agg(column_name || ' (' || privilege_type || ')', ', ')
    into offender
    from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'articles'
     and grantee in ('anon', 'authenticated')
     and privilege_type in ('INSERT', 'UPDATE')
     and (column_name = 'updated_at'
          or (column_name = 'slug' and privilege_type = 'UPDATE'));
  if offender is not null then
    raise exception 'VITOLA_GRANT_GAP: colonne(s) fermee(s) devenue(s) ecrivable(s) : %', offender;
  end if;

  -- 6. Aucune fonction appelable au titre de PUBLIC.
  select string_agg(proname, ', ' order by proname) into offender
    from pg_proc
   where pronamespace = 'public'::regnamespace
     and array_to_string(coalesce(proacl, '{}')::text[], ' ') ~ '(^| )=X/';
  if offender is not null then
    raise exception 'VITOLA_GRANT_GAP: EXECUTE accordé à PUBLIC sur : %', offender;
  end if;

  raise notice
    '0017 : un article est du contenu, il naît gated et draft, et un article public ne pointe aucune fiche.';
end;
$$;

commit;
