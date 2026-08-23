-- =============================================================================
-- VITOLA — 0008 : la cave, et le geste qui la relie au carnet
-- -----------------------------------------------------------------------------
-- Le §5.5 du brief donne quatre tables. Le §9 donne à P2 un critère de sortie
-- qui n'en nomme aucune : « créer une dégustation et décrémenter la cave de bout
-- en bout ». Tout ce fichier tient dans l'écart entre les deux — c'est-à-dire
-- dans `humidor_events.review_id`, et dans ce qui garantit que les deux lignes
-- s'écrivent ensemble.
--
-- L'ADR 0006 tranche les quatre points, et trois d'entre eux se lisent
-- directement dans le SQL ci-dessous :
--
--   D1  `public.smoke_from_humidor()` est en **droits d'appelant**. Un appel
--       PostgREST est une transaction, donc l'entrée de carnet et l'événement
--       `smoke` s'écrivent ensemble ou pas du tout ; et comme la fonction n'a
--       aucun privilège, ses deux `insert` restent soumis aux mêmes policies
--       qu'une écriture ordinaire. On achète l'atomicité sans acheter une
--       frontière de sécurité — la différence avec `file_report()`, qui a dû
--       payer les deux parce que `mod` est injoignable autrement.
--
--   D3  `humidor_items.qty` est **dans le grant d'INSERT et hors du grant
--       d'UPDATE**, exactement comme `reviews.user_id`. Déclarer ce qu'on vient
--       d'acheter est un inventaire d'ouverture ; changer un stock est un
--       événement. Après la naissance du lot, le seul écrivain de `qty` est le
--       trigger de §4, et aucun code applicatif ne peut s'en mêler : le grant
--       refuse, il n'y a pas à s'en souvenir.
--
--   D5  Âge de vieillissement et valorisation ne sont pas des colonnes. Une
--       valeur qui dépend de `current_date` est fausse le lendemain de son
--       écriture. Elles vivent dans une vue `security_invoker`, qui hérite de la
--       RLS des tables qu'elle lit.
--
-- Ordre de lecture :
--   §1  Enums
--   §2  Tables
--   §3  Index
--   §4  Le grand livre et le stock qu'il tient  (triggers)
--   §5  Le geste : smoke_from_humidor()
--   §6  Les lectures dérivées                   (vue)
--   §7  Grants
--   §8  Row Level Security
--   §9  Auto-contrôle
-- =============================================================================

begin;

-- =============================================================================
-- §1 · ENUMS
-- -----------------------------------------------------------------------------
-- Les deux du §5.5, repris mot pour mot. `move` et `device` sont livrés dans
-- l'enum sans être offerts par l'interface : un enum se migre, et migrer deux
-- fois une valeur qu'on savait venir est du travail qu'on s'inflige. L'ADR 0006
-- dit pourquoi `device` attend — un capteur n'a pas de session, donc pas de
-- porte, et cette porte est une autre ADR.
-- =============================================================================

create type public.humidor_event_type as enum
  ('add', 'smoke', 'gift', 'loss', 'move', 'adjust');

create type public.humidor_reading_source as enum ('manual', 'device');

-- =============================================================================
-- §2 · TABLES
-- =============================================================================

-- --- public.humidors ---------------------------------------------------------
create table public.humidors (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,

  name         text not null,
  -- Capacité indicative en v1 : elle remplit une jauge, elle ne refuse rien.
  -- L'ADR 0006 dit où la contrainte s'écrirait si elle devait mordre — sur le
  -- trigger de §4, qui voit déjà la somme — et pourquoi ce n'est pas encore le
  -- cas : refuser un ajout à quelqu'un qui a bel et bien acheté les cigares,
  -- c'est lui demander de mentir à son inventaire.
  capacity     integer,
  target_rh    numeric(4,1),
  target_temp  numeric(4,1),
  is_default   boolean not null default false,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint humidors_name_len  check (length(btrim(name)) between 1 and 80),
  constraint humidors_capacity  check (capacity is null or capacity between 1 and 100000),
  constraint humidors_target_rh check (target_rh is null or target_rh between 0 and 100),
  constraint humidors_target_t  check (target_temp is null or target_temp between -20 and 60)
);

comment on table public.humidors is
  'A member''s humidor. Owner-only in v1: privacy.show_humidor defaults to '
  'false, and P3 will add third-party reads as a SEPARATE policy (ADR 0006 D4).';

create trigger humidors_set_updated_at
  before update on public.humidors
  for each row execute function public.tg_set_updated_at();

-- --- public.humidor_items ----------------------------------------------------
-- Un lot, pas un cigare. Ajouter cinq Robusto à une cave qui en contient déjà
-- trois crée une **seconde** ligne, et c'est voulu : les deux achats n'ont ni la
-- même date de mise en cave ni le même prix, et le §5.5 demande l'âge de
-- vieillissement. Fusionner les lots ferait une moyenne d'âge que personne n'a
-- vieillie.
create table public.humidor_items (
  id                 uuid primary key default gen_random_uuid(),
  humidor_id         uuid not null references public.humidors(id)  on delete cascade,
  cigar_id           uuid not null references ref.cigars(id)       on delete restrict,

  -- Tenue par le trigger de §4 et par lui seul, sauf à la naissance du lot.
  -- Voir ADR 0006, D3 : dans le grant d'INSERT, hors du grant d'UPDATE.
  qty                integer not null default 0,

  purchase_date      date,
  purchase_price_eur numeric(10,2),
  currency           text not null default 'EUR',
  vendor_name        text,
  box_code           text,
  position           text,
  aging_start_date   date,
  notes              text,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint humidor_items_qty        check (qty >= 0),
  constraint humidor_items_price      check (purchase_price_eur is null
                                             or purchase_price_eur between 0 and 1000000),
  constraint humidor_items_currency   check (currency ~ '^[A-Z]{3}$'),
  constraint humidor_items_vendor_len check (vendor_name is null or length(vendor_name) <= 120),
  constraint humidor_items_box_len    check (box_code    is null or length(box_code)    between 1 and 40),
  constraint humidor_items_pos_len    check (position    is null or length(position)    <= 60),
  constraint humidor_items_notes_len  check (notes       is null or length(notes)       <= 2000)

  -- Aucune contrainte ne lie `aging_start_date` à `purchase_date`, et
  -- l'absence est délibérée : elle a été écrite, puis retirée le jour même,
  -- parce qu'un parcours en navigateur a montré ce qu'elle interdisait.
  --
  -- Un module acheté vieilli **a commencé à se reposer avant qu'on l'achète**.
  -- Exiger `aging_start_date >= purchase_date` obligeait alors à saisir la date
  -- d'achat comme date de vieillissement, c'est-à-dire à rajeunir une boîte de
  -- 2019 de six ans — précisément le chiffre que le §5.5 demande d'afficher.
  --
  -- Ce qui reste refusé, c'est une date future, et cela ne peut pas être un
  -- CHECK : `current_date` n'y est pas admis, comme la règle des 18 ans l'a
  -- appris à la 0001. La borne vit donc dans le schéma Zod de la Server Action.
);

comment on table public.humidor_items is
  'One acquisition lot, not one cigar: two purchases of the same reference stay '
  'two rows because they have different ages and prices (BRIEF §5.5 asks for the '
  'ageing time). `qty` is maintained by tg_humidor_events_apply() alone.';
comment on column public.humidor_items.qty is
  'Denormalised sum of the lot''s events (ADR 0006 D3). Writable on INSERT — an '
  'opening balance — and by no client statement afterwards: absent from every '
  'GRANT UPDATE, asserted by this migration''s self-check and by 07_cave_rls.sql.';

create trigger humidor_items_set_updated_at
  before update on public.humidor_items
  for each row execute function public.tg_set_updated_at();

-- --- public.humidor_events ---------------------------------------------------
-- Le grand livre. En ajout seul : aucun grant d'UPDATE, aucun grant de DELETE.
-- Corriger un compte est un événement `adjust`, pas une rature — c'est ce que
-- `public.consents` et `public.audit_log` font déjà dans ce dépôt, et pour la
-- même raison : un registre qu'on peut réécrire ne prouve plus rien.
create table public.humidor_events (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references public.humidor_items(id) on delete cascade,

  type        public.humidor_event_type not null,
  qty         integer not null,

  -- Le jour, pas l'instant — même distinction que `reviews.smoked_on` et pour la
  -- même raison : on enregistre souvent le lendemain, et P11 compte par date de
  -- consommation. L'instant d'écriture, lui, est `created_at`.
  occurred_at date not null default current_date,

  -- Le lien du §5.5, et le critère de sortie de P2. `set null` et non `cascade` :
  -- effacer une entrée de carnet ne défait pas le fait qu'on a fumé le cigare.
  review_id   uuid references public.reviews(id) on delete set null,

  created_at  timestamptz not null default now(),

  -- `qty` est un compte de cigares, et c'est le type qui porte le signe (ADR
  -- 0006 D3). `adjust` est le seul signé : il existe pour dire « il en manque
  -- deux au comptage », ce qu'aucun autre type ne sait exprimer.
  constraint humidor_events_qty_nonzero check (qty <> 0),
  constraint humidor_events_qty_sign check (type = 'adjust' or qty > 0),
  constraint humidor_events_qty_bounds check (qty between -100000 and 100000),

  -- Seul un événement qui retire du stock peut raconter une dégustation.
  constraint humidor_events_review_is_smoke check (review_id is null or type = 'smoke')
);

comment on table public.humidor_events is
  'Append-only ledger of a lot. No UPDATE and no DELETE grant: a miscount is '
  'corrected by an `adjust` event, never by rewriting history.';
comment on column public.humidor_events.review_id is
  'The link to the notebook (BRIEF §5.5) and P2''s exit criterion. Written in the '
  'same transaction as the entry by public.smoke_from_humidor().';

-- --- public.humidor_readings -------------------------------------------------
create table public.humidor_readings (
  id          uuid primary key default gen_random_uuid(),
  humidor_id  uuid not null references public.humidors(id) on delete cascade,

  rh          numeric(4,1),
  temp_c      numeric(4,1),
  recorded_at timestamptz not null default now(),
  source      public.humidor_reading_source not null default 'manual',

  created_at  timestamptz not null default now(),

  constraint humidor_readings_rh   check (rh     is null or rh     between 0 and 100),
  constraint humidor_readings_temp check (temp_c is null or temp_c between -20 and 60),
  -- Un relevé qui ne relève rien est une ligne avec une heure.
  constraint humidor_readings_says_something check (rh is not null or temp_c is not null)
);

comment on table public.humidor_readings is
  'Hygrometry log. v1 writes `manual` only — a device has no Supabase session, '
  'so it has no door, and that door is its own ADR (0006, question ouverte).';

-- =============================================================================
-- §3 · INDEX
-- =============================================================================

create index humidors_user_idx on public.humidors (user_id, created_at);

-- Une seule cave par défaut et par personne. Un index unique partiel plutôt
-- qu'un trigger : la contrainte est déclarative, donc elle ne s'oublie pas.
create unique index humidors_one_default_idx
  on public.humidors (user_id) where is_default;

create index humidor_items_humidor_idx on public.humidor_items (humidor_id, created_at desc);
-- La fiche cigare demande « en ai-je ? » à chaque affichage : c'est cette lecture
-- qui doit être servie par un index, pas un parcours de l'inventaire.
create index humidor_items_cigar_idx on public.humidor_items (cigar_id, humidor_id);

create index humidor_events_item_idx   on public.humidor_events (item_id, occurred_at desc, created_at desc);
-- « Cette dégustation a-t-elle été décomptée ? » — la question que l'entrée de
-- carnet pose quand le second appel de l'ADR 0006 D1 a échoué.
create index humidor_events_review_idx on public.humidor_events (review_id)
  where review_id is not null;

create index humidor_readings_humidor_idx on public.humidor_readings (humidor_id, recorded_at desc);

-- =============================================================================
-- §4 · LE GRAND LIVRE ET LE STOCK QU'IL TIENT
-- -----------------------------------------------------------------------------
-- Trois triggers, dont deux tiennent une promesse de l'ADR 0006 :
--
--   a. `humidor_event_delta()` — le signe, écrit une fois. Toute autre lecture
--      du stock (la vue de §6, les statistiques de P11) passe par elle, si bien
--      qu'un type ajouté demain n'a qu'un endroit à corriger.
--   b. `tg_humidor_events_apply()` — recalcule `qty` par la **somme** de ses
--      événements plutôt que par un delta. Un incrément se trompe à la première
--      correction et ne se rattrape jamais ; une somme se répare toute seule.
--   c. `tg_humidor_items_opening()` — l'inventaire d'ouverture. C'est lui qui
--      rend l'ajout atomique **sans fonction** : une seule requête du client, un
--      événement `add` écrit dans la même transaction, et le grand livre est
--      complet dès la première ligne.
--
-- Les trois sont SECURITY DEFINER, et il le faut : `qty` n'est dans aucun grant
-- d'UPDATE, donc un trigger en droits d'appelant serait refusé sur la colonne
-- même qu'il a pour rôle d'écrire. Ils ne sont appelables par personne — le
-- défaut PUBLIC est révoqué plus bas, et un trigger n'a pas besoin d'EXECUTE
-- pour se déclencher.
-- =============================================================================

create or replace function public.humidor_event_delta(
  p_type public.humidor_event_type,
  p_qty  integer
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_type
           when 'add'    then  p_qty
           when 'smoke'  then -p_qty
           when 'gift'   then -p_qty
           when 'loss'   then -p_qty
           when 'adjust' then  p_qty   -- déjà signé
           when 'move'   then  0       -- le lot change de cave, pas de compte
         end
$$;

comment on function public.humidor_event_delta(public.humidor_event_type, integer) is
  'The sign of an event, written once. `move` is deliberately 0: moving a lot '
  'changes its humidor, not its count.';

create or replace function public.tg_humidor_events_apply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  touched uuid[];
begin
  -- UPDATE n'est accordé à personne sur cette table, mais le trigger couvre les
  -- trois verbes : le jour où une migration privilégiée corrige une ligne, le
  -- stock doit suivre sans qu'on y repense.
  touched := array_remove(array[
    case when tg_op in ('INSERT', 'UPDATE') then new.item_id end,
    case when tg_op in ('UPDATE', 'DELETE') then old.item_id end
  ], null);

  update public.humidor_items i
     set qty = coalesce((
           select sum(public.humidor_event_delta(e.type, e.qty))
             from public.humidor_events e
            where e.item_id = i.id
         ), 0)
   where i.id = any(touched);

  return null;
end;
$$;

create trigger humidor_events_apply
  after insert or update or delete on public.humidor_events
  for each row execute function public.tg_humidor_events_apply();

create or replace function public.tg_humidor_items_opening()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Un lot créé vide n'a rien à raconter. Le cas existe : on prépare un
  -- emplacement avant d'y poser la boîte.
  if new.qty > 0 then
    insert into public.humidor_events (item_id, type, qty, occurred_at)
    values (new.id, 'add', new.qty, coalesce(new.purchase_date, current_date));
  end if;
  return null;
end;
$$;

create trigger humidor_items_opening
  after insert on public.humidor_items
  for each row execute function public.tg_humidor_items_opening();

-- Déplacer un lot est un `update` de `humidor_id` — plus simple qu'un couple
-- d'événements, et sans perte : le lot garde son âge et son prix. Le grand livre
-- en garde trace, à compte constant.
-- La clause WHEN est ce qui empêche la récursion : le trigger de (b) écrit
-- `qty` sur cette table, et sans elle chaque recalcul de stock inscrirait un
-- déménagement.
create or replace function public.tg_humidor_items_moved()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.qty > 0 then
    insert into public.humidor_events (item_id, type, qty, occurred_at)
    values (new.id, 'move', new.qty, current_date);
  end if;
  return null;
end;
$$;

create trigger humidor_items_moved
  after update on public.humidor_items
  for each row
  when (old.humidor_id is distinct from new.humidor_id)
  execute function public.tg_humidor_items_moved();

-- =============================================================================
-- §5 · LE GESTE — smoke_from_humidor()
-- -----------------------------------------------------------------------------
-- ADR 0006, D1. Le seul endroit de tout le dépôt où deux tables s'écrivent dans
-- la même transaction, et il n'y a **rien de privilégié** dedans.
--
-- `security invoker` est le défaut de PostgreSQL ; il est écrit en toutes
-- lettres parce que c'est ici la décision, pas le défaut. Les conséquences
-- valent d'être dites une fois :
--
--   · l'`insert` dans `reviews` passe par `reviews_insert_own`, qui exige
--     `user_id = auth.uid()` **et** une fiche publiée. Cette fonction ne sait
--     donc pas ce qu'est un brouillon, et n'a pas à le savoir ;
--   · l'`insert` dans `humidor_events` passe par `humidor_events_insert_own` ;
--   · le `select` sur `humidor_items` passe par sa RLS, si bien qu'un article
--     qui ne vous appartient pas est **introuvable** plutôt qu'interdit. La
--     différence n'est pas cosmétique : « interdit » confirmerait qu'il existe.
--
-- Six paramètres, tous du geste quotidien. La dégustation n'entre pas ici : une
-- fonction qui recopierait les vingt-quatre colonnes de `reviews` serait un
-- second schéma, qui dérive au premier `alter table` (ADR 0006, fait 4).
-- =============================================================================

create or replace function public.smoke_from_humidor(
  p_item_id    uuid,
  p_qty        integer                  default 1,
  p_smoked_on  date                     default current_date,
  p_visibility public.review_visibility default 'private',
  p_score      numeric                  default null,
  p_body       text                     default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_cigar_id  uuid;
  v_stock     integer;
  v_review_id uuid;
begin
  if p_qty is null or p_qty < 1 then
    raise exception 'VITOLA_HUMIDOR_QTY: a smoke event moves at least one cigar'
      using errcode = '22023';
  end if;

  select i.cigar_id, i.qty
    into v_cigar_id, v_stock
    from public.humidor_items i
   where i.id = p_item_id;

  if not found then
    raise exception 'VITOLA_HUMIDOR_ITEM: no such lot'
      using errcode = 'P0002';
  end if;

  -- Le grand livre accepterait un stock négatif ; la cave, non. Refuser ici
  -- plutôt que par un CHECK sur `qty` : le CHECK dirait 23514 à quelqu'un qui a
  -- simplement fumé le dernier cigare deux fois.
  if v_stock < p_qty then
    raise exception 'VITOLA_HUMIDOR_STOCK: only % left in this lot', v_stock
      using errcode = '23514';
  end if;

  -- L'entrée de carnet n'est écrite que si elle dit quelque chose.
  --
  -- `reviews_log_says_something` (0003) exige une note ou un mot, et son
  -- commentaire disait déjà pourquoi : « sans cela, "j'ai fumé ce cigare" est
  -- une ligne vide avec une date ». La cave est précisément ce qui rend cette
  -- ligne inutile — l'événement `smoke` porte déjà le cigare, le jour et le lot.
  --
  -- Exiger une note pour décompter son stock ferait l'un des deux : des notes
  -- inventées, ou des cigares fumés que la cave ignore. Aucun des deux n'est un
  -- inventaire. Le carnet reste donc un geste qu'on fait, jamais un péage.
  if p_score is not null or (p_body is not null and length(btrim(p_body)) > 0) then
    insert into public.reviews (user_id, cigar_id, kind, visibility, score_total, body, smoked_on)
    values ((select auth.uid()), v_cigar_id, 'log', p_visibility, p_score, p_body, p_smoked_on)
    returning id into v_review_id;
  end if;

  insert into public.humidor_events (item_id, type, qty, occurred_at, review_id)
  values (p_item_id, 'smoke', p_qty, p_smoked_on, v_review_id);

  -- Null quand on n'a rien noté : l'appelant y lit « il n'y a pas d'entrée à
  -- ouvrir », et non « ça a échoué ». Les deux lignes sont écrites ou aucune.
  return v_review_id;
end;
$$;

comment on function public.smoke_from_humidor(uuid, integer, date, public.review_visibility, numeric, text) is
  'Smoking from the humidor, as one transaction (ADR 0006 D1). SECURITY INVOKER '
  'on purpose: both inserts stay under the caller''s RLS, so this function can '
  'write nothing a member could not write by hand. The scope defaults to '
  'private, like the notebook''s own default (art. 25) — the humidor never opens '
  'a door the notebook closes. Returns the entry id, or NULL when nothing was '
  'noted: the ledger event is the record then, and an empty entry would be a '
  'date with no sentence.';

-- =============================================================================
-- §6 · LES LECTURES DÉRIVÉES
-- -----------------------------------------------------------------------------
-- ADR 0006, D5. Quatre des cinq fonctions dérivées du §5.5 sont ici ; la
-- cinquième — l'import/export CSV — est un écran, pas une lecture.
--
-- `security_invoker = true` : la vue s'exécute avec les droits et la RLS de
-- l'appelant, donc elle ne peut rien montrer que ses tables ne montreraient. Une
-- vue ordinaire aurait les droits de son propriétaire, c'est-à-dire ceux de
-- `postgres`, c'est-à-dire toutes les caves de tout le monde.
-- =============================================================================

create view public.humidor_inventory
with (security_invoker = true) as
select
  i.id,
  i.humidor_id,
  i.cigar_id,
  i.qty,
  i.purchase_date,
  i.purchase_price_eur,
  i.currency,
  i.vendor_name,
  i.box_code,
  i.position,
  i.aging_start_date,
  i.notes,
  i.created_at,
  i.updated_at,

  -- Âge de vieillissement : le §5.5 le demande, et il se recalcule à chaque
  -- lecture parce qu'il change tous les jours sans que personne n'écrive.
  case
    when coalesce(i.aging_start_date, i.purchase_date) is null then null
    else (current_date - coalesce(i.aging_start_date, i.purchase_date))
  end as aging_days,

  -- Valorisation du stock : prix du lot × ce qu'il en reste.
  case
    when i.purchase_price_eur is null then null
    else round(i.purchase_price_eur * i.qty, 2)
  end as stock_value_eur,

  (select max(e.occurred_at)
     from public.humidor_events e
    where e.item_id = i.id and e.type = 'smoke') as last_smoked_on

from public.humidor_items i;

comment on view public.humidor_inventory is
  'Reading side of a lot: the row plus what can only be derived at read time '
  '(ADR 0006 D5). security_invoker, so RLS is the underlying tables''.';

-- =============================================================================
-- §7 · GRANTS
-- -----------------------------------------------------------------------------
-- Supabase accorde ALL sur toute nouvelle table de `public`. Chaque grant est
-- donc précédé d'un REVOKE, et `anon` n'apparaît nulle part : une cave n'a
-- aucune lecture publique, pas même derrière le portail.
-- =============================================================================

revoke all on public.humidors from anon, authenticated;
grant select, insert, delete on public.humidors to authenticated;
grant update (name, capacity, target_rh, target_temp, is_default, updated_at)
  on public.humidors to authenticated;
-- `user_id` hors du grant d'UPDATE : une cave ne change pas de propriétaire.

revoke all on public.humidor_items from anon, authenticated;
grant select, delete on public.humidor_items to authenticated;
-- `qty` est dans l'INSERT — l'inventaire d'ouverture de l'ADR 0006 D3 — et dans
-- aucun UPDATE. C'est toute la décision, et elle tient dans ces deux lignes.
grant insert (humidor_id, cigar_id, qty, purchase_date, purchase_price_eur,
              currency, vendor_name, box_code, position, aging_start_date, notes)
  on public.humidor_items to authenticated;
grant update (humidor_id, purchase_date, purchase_price_eur, currency,
              vendor_name, box_code, position, aging_start_date, notes, updated_at)
  on public.humidor_items to authenticated;
-- `cigar_id` hors du grant d'UPDATE, pour la raison qui vaut déjà pour
-- `reviews.cigar_id` : se tromper de fiche se répare en supprimant, ce qui se
-- voit, et non par un glissement que le grand livre raconterait de travers.

revoke all on public.humidor_events from anon, authenticated;
grant select, insert on public.humidor_events to authenticated;
-- Ni UPDATE ni DELETE : registre en ajout seul, comme `consents` et `audit_log`.

revoke all on public.humidor_readings from anon, authenticated;
grant select, insert, delete on public.humidor_readings to authenticated;
-- DELETE oui, UPDATE non : un relevé est une mesure. On retire celui qu'on a
-- mal tapé, on ne le corrige pas en place — sinon la courbe ment sans le dire.

revoke all on public.humidor_inventory from anon, authenticated;
grant select on public.humidor_inventory to authenticated;

-- La clé de service lit `public` pour l'export RGPD (0007). Les quatre tables
-- entrent dans l'inventaire du §5 de `lib/compliance/gdpr.ts`.
grant select on public.humidors, public.humidor_items,
                public.humidor_events, public.humidor_readings,
                public.humidor_inventory
  to service_role;

-- PostgreSQL réaccorde EXECUTE à PUBLIC sur chaque nouvelle fonction. La 0003 a
-- posé le `alter default privileges` qui l'en empêche ; les révocations
-- explicites sont la ceinture, et l'auto-contrôle de §9 les bretelles.
revoke execute on function public.humidor_event_delta(public.humidor_event_type, integer) from public;
revoke execute on function public.tg_humidor_events_apply() from public;
revoke execute on function public.tg_humidor_items_opening() from public;
revoke execute on function public.tg_humidor_items_moved() from public;
revoke execute on function public.smoke_from_humidor(uuid, integer, date, public.review_visibility, numeric, text) from public;

-- Une seule fonction est appelable, et par le seul rôle qui en a l'usage.
grant execute on function public.humidor_event_delta(public.humidor_event_type, integer)
  to authenticated;
grant execute on function public.smoke_from_humidor(uuid, integer, date, public.review_visibility, numeric, text)
  to authenticated;

-- =============================================================================
-- §8 · ROW LEVEL SECURITY
-- -----------------------------------------------------------------------------
-- ADR 0006, D4 : strictement propriétaire en v1. Une policy `select` par table,
-- et P3 en **ajoutera** une autre plutôt que de modifier celle-ci — la leçon des
-- quatre policies de `reviews`, que `supabase/CLAUDE.md` demande de ne pas
-- recoller.
--
-- Aucune policy ne cite `anon` : les grants ne lui donnent rien, et une policy
-- pour un rôle sans droit est une promesse qu'on ne tient pas.
--
-- La chaîne `events → items → humidors` n'a pas de cycle : `humidors` ne lit
-- aucune des deux autres. C'est vérifié plutôt que supposé, parce que
-- `reviews ↔ review_shares` a coûté une correction d'ADR.
-- =============================================================================

alter table public.humidors        enable row level security;
alter table public.humidors        force  row level security;
alter table public.humidor_items   enable row level security;
alter table public.humidor_items   force  row level security;
alter table public.humidor_events  enable row level security;
alter table public.humidor_events  force  row level security;
alter table public.humidor_readings enable row level security;
alter table public.humidor_readings force  row level security;

-- --- public.humidors ---------------------------------------------------------
create policy humidors_select_own on public.humidors
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy humidors_insert_own on public.humidors
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy humidors_update_own on public.humidors
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy humidors_delete_own on public.humidors
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- --- public.humidor_items ----------------------------------------------------
-- L'EXISTS est soumis à la RLS de `humidors`, donc « ma cave » ne se redit pas
-- ici. Même mécanisme que `review_thirds` sur `reviews`.
create policy humidor_items_select_own on public.humidor_items
  for select to authenticated
  using (exists (select 1 from public.humidors h where h.id = humidor_id));

create policy humidor_items_insert_own on public.humidor_items
  for insert to authenticated
  with check (
    exists (select 1 from public.humidors h where h.id = humidor_id)
    -- On ne met pas un brouillon en cave. L'EXISTS porte la RLS de ref.cigars,
    -- donc « publiée » se déduit au lieu d'être recopiée.
    and exists (select 1 from ref.cigars c where c.id = cigar_id and c.status = 'published')
  );

create policy humidor_items_update_own on public.humidor_items
  for update to authenticated
  using (exists (select 1 from public.humidors h where h.id = humidor_id))
  with check (exists (select 1 from public.humidors h where h.id = humidor_id));

create policy humidor_items_delete_own on public.humidor_items
  for delete to authenticated
  using (exists (select 1 from public.humidors h where h.id = humidor_id));

-- --- public.humidor_events ---------------------------------------------------
create policy humidor_events_select_own on public.humidor_events
  for select to authenticated
  using (exists (select 1 from public.humidor_items i where i.id = item_id));

create policy humidor_events_insert_own on public.humidor_events
  for insert to authenticated
  with check (exists (select 1 from public.humidor_items i where i.id = item_id));

-- Pas de policy UPDATE ni DELETE : le registre est en ajout seul, et l'absence
-- de policy est ce qui le dit — un grant retiré se remet, une policy manquante
-- se remarque.

-- --- public.humidor_readings -------------------------------------------------
create policy humidor_readings_select_own on public.humidor_readings
  for select to authenticated
  using (exists (select 1 from public.humidors h where h.id = humidor_id));

create policy humidor_readings_insert_own on public.humidor_readings
  for insert to authenticated
  with check (exists (select 1 from public.humidors h where h.id = humidor_id));

create policy humidor_readings_delete_own on public.humidor_readings
  for delete to authenticated
  using (exists (select 1 from public.humidors h where h.id = humidor_id));

-- =============================================================================
-- §9 · AUTO-CONTRÔLE
-- -----------------------------------------------------------------------------
-- Il ne peut pas attraper ce que cette migration vient d'établir — c'est le rôle
-- de `supabase/tests/07_cave_rls.sql`, qui n'accorde rien. Ce qu'il attrape,
-- c'est une migration future qui défait l'une des décisions de l'ADR 0006 sans
-- le remarquer.
-- =============================================================================

do $$
declare
  offender text;
  ok       boolean;
begin
  -- 1. §0.5 du brief : aucune table sans RLS et sans policy, dans aucun schéma.
  select string_agg(format('%I.%I', n.nspname, c.relname), ', ' order by 1)
    into offender
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where c.relkind = 'r'
     and n.nspname in ('public', 'ref')
     and (c.relrowsecurity = false
          or not exists (select 1 from pg_policy p where p.polrelid = c.oid));
  if offender is not null then
    raise exception 'VITOLA_RLS_GAP: table(s) sans RLS ou sans policy : %', offender;
  end if;

  -- 2. ADR 0006, D1. La seule chose qui rende `smoke_from_humidor()` sûre est
  --    qu'elle n'ait aucun privilège. La passer en SECURITY DEFINER serait une
  --    ligne de diff anodine et une sortie de la RLS.
  select not p.prosecdef into ok
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname = 'smoke_from_humidor';
  if ok is not true then
    raise exception
      'VITOLA_SCOPE_GAP: smoke_from_humidor() doit rester SECURITY INVOKER (ADR 0006, D1)';
  end if;

  -- 3. ADR 0006, D5. Une vue sans security_invoker s'exécute avec les droits de
  --    son propriétaire : toutes les caves de tout le monde, sans un mot.
  select coalesce((
           select option_value::boolean
             from pg_options_to_table((select reloptions from pg_class
                                        where oid = 'public.humidor_inventory'::regclass))
            where option_name = 'security_invoker'
         ), false)
    into ok;
  if ok is not true then
    raise exception
      'VITOLA_SCOPE_GAP: humidor_inventory doit être security_invoker (ADR 0006, D5)';
  end if;

  -- 4. ADR 0006, D3, dans les deux sens. `qty` hors de tout UPDATE…
  select string_agg(grantee, ', ' order by grantee) into offender
    from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'humidor_items'
     and privilege_type = 'UPDATE'
     and grantee in ('anon', 'authenticated')
     and column_name = 'qty';
  if offender is not null then
    raise exception 'VITOLA_GRANT_GAP: humidor_items.qty modifiable par : %', offender;
  end if;

  --    … et bien dans l'INSERT, sans quoi aucun lot ne peut naître avec son
  --    contenu et l'ajout redevient deux requêtes.
  if not exists (
    select 1 from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'humidor_items'
       and privilege_type = 'INSERT' and grantee = 'authenticated' and column_name = 'qty'
  ) then
    raise exception 'VITOLA_GRANT_GAP: humidor_items.qty doit rester insérable (ADR 0006, D3)';
  end if;

  -- 5. `cigar_id` ne change pas, comme `reviews.cigar_id`.
  select string_agg(grantee, ', ' order by grantee) into offender
    from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'humidor_items'
     and privilege_type = 'UPDATE'
     and grantee in ('anon', 'authenticated')
     and column_name = 'cigar_id';
  if offender is not null then
    raise exception 'VITOLA_GRANT_GAP: humidor_items.cigar_id modifiable par : %', offender;
  end if;

  -- 6. Le grand livre reste en ajout seul.
  select string_agg(distinct privilege_type, ', ' order by privilege_type) into offender
    from information_schema.table_privileges
   where table_schema = 'public' and table_name = 'humidor_events'
     and grantee in ('anon', 'authenticated')
     and privilege_type in ('UPDATE', 'DELETE');
  if offender is not null then
    raise exception 'VITOLA_GRANT_GAP: humidor_events accepte % (registre en ajout seul)', offender;
  end if;

  -- 7. Le trigger qui tient `qty` existe et n'est pas désactivé. C'est la seule
  --    faiblesse admise par l'ADR 0006 : une colonne dénormalisée ment en
  --    silence si son trigger dort.
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.humidor_events'::regclass
       and tgname = 'humidor_events_apply'
       and tgenabled <> 'D'
  ) then
    raise exception 'VITOLA_STOCK_GAP: le trigger humidor_events_apply manque ou est désactivé';
  end if;

  -- 8. Aucune fonction nouvelle appelable au titre de PUBLIC.
  select string_agg(proname, ', ' order by proname) into offender
    from pg_proc
   where pronamespace = 'public'::regnamespace
     and array_to_string(coalesce(proacl, '{}')::text[], ' ') ~ '(^| )=X/';
  if offender is not null then
    raise exception 'VITOLA_GRANT_GAP: EXECUTE accordé à PUBLIC sur : %', offender;
  end if;

  -- 9. Une cave n'a aucune lecture anonyme. Pas même derrière le portail.
  select string_agg(table_name, ', ' order by table_name) into offender
    from information_schema.table_privileges
   where table_schema = 'public'
     and table_name in ('humidors', 'humidor_items', 'humidor_events',
                        'humidor_readings', 'humidor_inventory')
     and grantee = 'anon';
  if offender is not null then
    raise exception 'VITOLA_GRANT_GAP: anon a des droits sur : %', offender;
  end if;

  raise notice '0008 cave : RLS complète, stock tenu par trigger, geste atomique sans privilège.';
end;
$$;

commit;
