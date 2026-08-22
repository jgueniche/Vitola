# Vitola — prompt de reprise

> À copier tel quel au démarrage de la prochaine session. Il contient l'état complet de la base :
> **aucune requête n'est nécessaire pour la découvrir**. Écrit le 22 août 2026, après la PR #4.

---

Reprise du projet Vitola. Le contexte est dans le dépôt : lis `CLAUDE.md`, `BRIEF.md`, puis
`docs/decisions-log.md` (les quatre sections), `docs/adr/` (0004 et 0005 sont **Acceptées**),
`supabase/seed/PROVENANCE.md` et `docs/phase-0/05-questions-ouvertes.md`.

**Branche de travail** : `claude/vitola-pXX-<nom>` — à créer depuis `master`.

## OBJECTIF DE CETTE SESSION ET DES SUIVANTES

**Amener le site à sa version définitive** — la v1 du brief, phases P2 à P8 comprises. C'est
plusieurs sessions ; l'ordre est donné plus bas et il n'est pas négociable, chaque phase ouvrant la
suivante.

**La QA est humaine, directement sur le front.** Conséquence sur ta façon de travailler :

- Une phase n'est livrée que si elle est **parcourable dans un navigateur** par une personne
  connectée. Un schéma sans écran ne compte pas. Un endpoint sans bouton non plus.
- Chaque livraison se termine par **la liste des URL à ouvrir et ce qu'on doit y voir**, comptes de
  QA à l'appui. C'est le livrable qui remplace la relecture de base.
- Un état vide est un écran, pas une erreur : le §4.6 en fait une invitation.
- Ne me demande pas de vérifier la base. Je vérifie par le site.

## ÉTAT AU 22 AOÛT 2026

`master` est la branche de production et **Vercel déploie bien depuis `master`** : la dette de
configuration de la session précédente est soldée, la branche par défaut `claude/vitola-phase-0-plan-y3y5mk`
n'existe plus. Il n'y a plus d'écart silencieux à surveiller. `/api/health` sert le commit déployé
(`{"status":"ok","phase":"P1","commit":"…"}`) : c'est le moyen le plus rapide de savoir ce qui tourne.

PR #1, #2, #3 et #4 fusionnées. Dernier commit de `master` : `1382ef2`.

### Ce qui marche, vérifié en HTTP réel

- **940 fiches en base, toutes publiées**, visibles d'un visiteur anonyme derrière l'age gate.
- `/cigares` recherche facettée (force, cape, origine, plein texte, pagination 24/page),
  `/cigares/[slug]`, `/marques` + `[slug]`, `/vitoles` + `[slug]`.
- Page d'accueil publique construite (PR #3), age gate, `/connexion` par lien magique **et** mot de
  passe, session rafraîchie dans le middleware.
- `/api/gdpr/export` et `/api/gdpr/delete` (§2, art. 15/17/20 RGPD). Testés en HTTP : 403 sans age
  gate, 401 sans session, `Cache-Control: no-store`. **Le chemin authentifié complet n'a jamais été
  exercé contre le vrai projet** — à faire une fois avec un compte de QA.
- Critère de sortie P1 mesuré : 0,14 à 0,97 ms sur données réelles, 27,5 ms sur 50 000 lignes
  synthétiques. Le §9 demandait « < 300 ms sur 5 000 cigares » : tenu.

### Comptes de QA — mot de passe `cigardeur` pour les trois

| pseudo | courriel | rôle | réputation |
|---|---|---|---|
| `jeremy` | jgueniche06@gmail.com | `admin` | 0 |
| `test_un` | test1@cigardeur.com | `member` | 0 |
| `test_deux` | test2@cigardeur.com | `member` | 0 |

---

## LA BASE, EN ENTIER — NE LA REQUÊTE PAS, ELLE EST ICI

Projet `vitola`, ref `upbewqsmgcrogoapubyz`, région `eu-west-3` (Paris). Cinq migrations appliquées
et enregistrées dans `supabase_migrations.schema_migrations` :

| Version | Nom | Fichier |
|---|---|---|
| `0001` | `p1_referential` | `docs/phase-0/03-schema-p1.sql` |
| `0002` | `function_grants` | `supabase/migrations/0002_function_grants.sql` |
| `0003` | `carnet` | `supabase/migrations/0003_carnet.sql` |
| `0004` | `commentaires_moderation` | `supabase/migrations/0004_commentaires_moderation.sql` |
| `0005` | `ref_function_grants` | `supabase/migrations/0005_ref_function_grants.sql` |

Schémas exposés à PostgREST : `db_schema = public,graphql_public,ref`.
`mod` en est délibérément **absent**.

### Volumes réels

```
ref.manufacturers          30      public.profiles             3
ref.brands                114      public.reviews              0
ref.lines                   0  ←   public.review_shares        0
ref.vitolas                51      public.review_thirds        0
ref.cigars                940      public.comments             0
  dont published          940      public.aroma_taxonomy       0  ←
  avec vitole              78      public.consents             0
  avec prix               900      public.audit_log            1
  avec force / cape       123      public.feature_flags        5
  verified_by non nul       0  ←   mod.reports                 0
ref.box_codes              18      mod.moderation_actions      0
ref.cigar_images            0      public.cigar_stats     0 ligne (vue matérialisée)
ref.cigar_revisions         0
```

Les trois `←` sont des manques à combler, pas des états normaux : voir « Ce qu'il faut construire ».

### Colonnes, table par table

**`public.profiles`** — annuaire public. `id! (→auth.users)`, `handle!`, `display_name`,
`avatar_path`, `bio`, `country(2)`, `city`, `reputation!`, `role!(app_role)`, `is_discoverable!`,
`created_at!`, `updated_at!`.
`handle` : `^[a-z0-9][a-z0-9_]{1,28}[a-z0-9]$` — underscore oui, tiret non.

**`public.profile_settings`** — propriétaire seul. `id!(→profiles)`, `birth_date`,
`adult_confirmed_at`, `locale!`, `preferences!` jsonb, `privacy!` jsonb, `created_at!`, `updated_at!`.
Défauts : `preferences = {"score_scale":100,"length_unit":"mm","email_digest":false}`,
`privacy = {"show_humidor":false,"show_reviews":true,"show_country":true}`.

**`public.consents`** — registre en ajout seul. `id!`, `user_id!`, `kind!(consent_kind)`, `granted!`,
`version!`, `granted_at!`, `ip_hash`, `user_agent`. Un retrait est une **nouvelle ligne**, jamais un
UPDATE : aucun grant UPDATE/DELETE n'existe.

**`public.audit_log`** — ajout seul, écrit uniquement par la clé de service via
`lib/compliance/audit.ts`. `id!`, `actor_id`, `action!`, `entity_schema`, `entity_table`,
`entity_id`, `before_state`, `after_state`, `ip_hash`, `created_at!`.

**`public.feature_flags`** — `key!`, `enabled!`, `description!`, `payload!` jsonb, `updated_at!`.

**`public.reviews`** — le carnet ET la dégustation, une seule table (ADR 0004).
`id!`, `user_id!(→auth.users, cascade)`, `cigar_id!(→ref.cigars, cascade)`,
`kind!(review_kind)`, `visibility!(review_visibility, défaut private)`,
`score_total numeric(4,1)`, `scores! jsonb`, `aroma_tags! int[]`,
`strength_perceived(ref.strength)`, `smoke_duration_min`, `pairing_text`, `pairing_tags! text[]`,
`box_code`, `production_year`, `purchase_year`, `humidity_pct`, `is_blind!`, `body`,
`smoked_on! date` (défaut `current_date`), `created_at!`, `updated_at!`.

Contraintes qui refuseront tes insertions si tu les ignores :
- `score_total` entre 0 et 100 ; `scores` doit être un objet
- `scores` n'accepte **que** les clés `construction, draw, burn, aroma, evolution, finish`
- `kind='tasting'` ⇒ `scores <> '{}'`
- `kind='log'` ⇒ au moins un `score_total` **ou** un `body` non vide
- `body` ≤ 4000, `pairing_text` ≤ 500, `smoke_duration_min` 1–600, `humidity_pct` 0–100
- `aroma_tags` ≤ 30 éléments, `pairing_tags` ≤ 12
- **`user_id` et `cigar_id` ne sont dans aucun grant d'UPDATE** : une entrée ne change ni d'auteur ni
  de cigare. Se tromper de fiche, c'est supprimer et ressaisir.

**`public.review_shares`** — qui a accès à une entrée `shared`. `review_id!`, `grantee_id!`,
`granted_by!`, `granted_at!`. Clé primaire `(review_id, grantee_id)`. `grantee_id <> granted_by`.
Aucun UPDATE : on accorde ou on retire. **Un destinataire ne peut pas repartager** — seule la policy
INSERT de l'auteur passe.

**`public.review_thirds`** — `review_id!`, `third! (1..3)`, `notes` (≤2000). PK `(review_id, third)`.

**`public.cigar_stats`** — **vue matérialisée**, donc **sans RLS**. Colonnes : `cigar_id`,
`review_count`, `mean_score`, `bayesian_score`, `review_count_90d`, `mean_score_90d`,
`distribution` jsonb (`lt60`, `b60_69`, `b70_79`, `b80_89`, `b90_100`), `last_review_at`.
Elle ne lit **que** `visibility='public'` : ce prédicat est la frontière de sécurité entière, et
l'auto-contrôle de 0003 relit `pg_get_viewdef()` pour vérifier qu'il y est. A priori bayésien : 10
avis, moyenne globale, 80 par défaut. Rafraîchir par `select public.refresh_cigar_stats()` —
clé de service uniquement. **Rien ne la rafraîchit automatiquement : c'est à faire.**

**`public.comments`** — commentaires de fiche (ADR 0005). `id!`, `cigar_id!(→ref.cigars, cascade)`,
`author_id!(→auth.users, cascade)`, `body!` (1–2000), `hidden_at`, `hidden_by`, `hidden_reason`,
`created_at!`, `updated_at!`.
Pas de `visibility` : un commentaire de fiche est public par construction. Pas de note non plus.
`hidden_*` : les trois ensemble ou aucun, et **hors de tout grant** — masquer passe par la clé de
service, y compris pour un modérateur connecté.

**`public.aroma_taxonomy`** — roue des arômes, **vide**. `id!` (integer identity), `parent_id`,
`family!(aroma_family)`, `slug!`, `label_fr!` (1–60), `label_en`, `created_at!`.

**`mod.reports`** — file DSA. `id!`, `reporter_id`, `entity_schema!`, `entity_table!`, `entity_id!`,
`reason!(report_reason)`, `detail` (≤2000), `status!(report_status)`, `created_at!`,
`acknowledged_at`, `decided_at`, `decided_by`, `decision_note`.
`entity_schema.entity_table` ∈ `{public.comments, public.reviews, ref.cigars, public.profiles}`.
Une décision (`upheld`/`dismissed`) exige `decided_at` **et** `decided_by`.

**`mod.moderation_actions`** — `id!`, `report_id`, `moderator_id`, `verb!(moderation_verb)`,
`entity_schema!`, `entity_table!`, `entity_id!`, `reason!`, `created_at!`.
Aucune policy d'écriture, aucun grant : ajout seul par la clé de service.

**Schéma `ref`** — inchangé depuis 0001 : `manufacturers`, `brands`, `lines`, `vitolas`, `cigars`,
`cigar_revisions`, `cigar_images`, `box_codes`. Voir `docs/phase-0/03-schema-p1.sql`, qui reste la
migration 0001.

### Enums

```
public.app_role            member | contributor | editor | moderator | admin
public.consent_kind        terms | privacy | age_verification | analytics |
                           marketing_email | health_related_processing
public.review_kind         log | tasting
public.review_visibility   private | shared | followers | public
public.aroma_family        boise | torrefie | epice | terreux | animal | fruite |
                           floral | sucre | vegetal | mineral | defaut
ref.strength               leger | leger_moyen | moyen | moyen_corse | corse
ref.wrapper_shade          claro | colorado_claro | colorado | colorado_maduro | maduro | oscuro
ref.cigar_shape            parejo | torpedo | piramide | perfecto | belicoso | culebra |
                           diadema | petit_corona | figurado_autre
ref.release_type           regular | edicion_limitada | regional | reserva |
                           gran_reserva | aniversario | custom_roll
ref.entry_status           draft | published | merged | rejected
ref.revision_status        pending | approved | rejected
ref.image_kind             band | full | box | foot | ash
ref.box_code_kind          factory | month | year
mod.report_reason          illegal_content | tobacco_promotion | inaccurate |
                           spam | harassment | other
mod.report_status          open | reviewing | upheld | dismissed
mod.moderation_verb        hide | restore | warn | suspend | delete
```

### Policies RLS — 75 au total, toutes les tables couvertes

```
public.reviews           8  select_public, select_own, select_shared, select_moderator,
                            insert_own, update_own, delete_own, delete_moderator
public.comments          7  select_visible, select_own, select_moderator, insert_own,
                            update_own, delete_own, delete_moderator
public.review_shares     3  select_involved, insert_author, delete_author
public.review_thirds     4  select_visible, write_own, update_own, delete_own
public.aroma_taxonomy    3  select_all, insert_editor, update_editor
public.profiles          5  · public.profile_settings 4 · public.consents 3
public.audit_log         1  (admin) · public.feature_flags 1 (lecture pour tous)
mod.reports              3  select_own, select_moderator, update_moderator
mod.moderation_actions   1  select_moderator
ref.cigars               5  · ref.cigar_revisions 7 · ref.cigar_images 5
ref.brands / lines / vitolas / manufacturers / box_codes  3 chacune
```

**Les policies SELECT de `reviews` sont découpées par rôle, et ce n'est pas du style.** Une seule
policy `to anon, authenticated` faisait évaluer la sous-requête sur `review_shares` par un visiteur
anonyme, qui n'a aucun grant dessus : `permission denied for table review_shares` sur un simple
`select from reviews`. Ne les recolle pas.

### Fonctions appelables

| Fonction | DEFINER | anon | authenticated |
|---|---|---|---|
| `public.has_min_role(app_role)` | non | ✓ | ✓ |
| `public.current_app_role()` | **oui** | ✓ | ✓ |
| `public.owns_review(uuid)` | **oui** | ✗ | ✓ |
| `public.comment_min_role()` | non | ✓ | ✓ |
| `public.immutable_unaccent(text)`, `public.slugify(text)` | non | ✓ | ✓ |
| `public.refresh_cigar_stats()` | **oui** | ✗ | ✗ |
| `public.is_privileged_context()` | non | ✗ | ✗ |

`owns_review()` existe pour **casser une récursion** : `reviews` et `review_shares` se lisent
mutuellement dans leurs policies, et PostgreSQL détecte le cycle sur le graphe des policies, pas sur
le chemin d'exécution. Ne la remplace pas par un `EXISTS`.

### Drapeaux de fonctionnalité

| clé | activé | charge utile | à savoir |
|---|---|---|---|
| `public_signup_open` | **non** | | Ouvre l'inscription. Fermé jusqu'à l'avis juridique (Q1). |
| `show_indicative_prices` | **non** | | Affiche `msrp_eur`. Voir Q19. |
| `wiki_contributions_open` | oui | | Ouvre la file de révisions. |
| `comments_min_role` | oui | `{"min_role":"member"}` | **À resserrer en `contributor` le jour où l'inscription s'ouvre.** |
| `dsa_report_sla_hours` | oui | `{"hours":72}` | Délai annoncé. **À publier dans les mentions légales.** |

### Buckets de stockage

`avatars` (privé, 0 objet), `cigar-images` (privé, 0 objet). **`deleteUser` ne supprime pas les
objets** : le jour où un téléversement existe, il ship avec son `storage.remove()` dans
`app/api/gdpr/delete/route.ts`, même commit. C'est écrit dans le fichier.

### Avertissements de sécurité Supabase — 5 restants, tous connus

1. `materialized_view_in_api` — `cigar_stats`. Assumé : son contenu est public par construction.
2. + 3. `current_app_role()` appelable par anon et authenticated. **Pré-existant.** La retirer casse
   la lecture publique (vérifié, pas supposé) : les policies SELECT anonymes l'appellent via
   `has_min_role()`. La sortir du schéma exposé est une ADR.
4. `owns_review()` appelable par authenticated. Même famille, même ADR à écrire. Elle ne répond que
   sur son appelant, donc ne divulgue rien.
5. `auth_leaked_password_protection` désactivé — **un interrupteur dans la console Supabase**, et il
   compte maintenant que les mots de passe existent.

---

## TROIS RÉGLAGES SUPABASE QUI NE VIVENT DANS AUCUN FICHIER

Documentés dans `docs/setup/supabase.md`, non exécutables. Si le projet est recréé, rien ne les
reconstruit.

1. **`db_schema` doit valoir `public,graphql_public,ref`** — et surtout **jamais `mod`**. Par défaut un projet
   n'expose que `public, graphql_public` : sans ce réglage aucune requête client ne résout, quel que
   soit le code. C'est le blocage qui a fait perdre le plus de temps.
2. **`site_url` + `uri_allow_list`** doivent couvrir localhost, la production et les préversions
   Vercel, sinon un lien magique est rejeté.
3. **Le SMTP intégré plafonne à ~2 envois/heure.** C'est pour ça que le mot de passe existe.

---

## CE QU'IL FAUT CONSTRUIRE, PAR ORDRE

### 0. Les trois manques de la base, avant tout écran qui les suppose

- **`aroma_taxonomy` est vide.** La roue des arômes du §5.4 n'a aucun contenu. C'est une nomenclature
  éditoriale, arborescente, onze familles. Sans elle, le formulaire de dégustation n'a rien à
  afficher. À écrire en seed versionné, avec sa provenance dans `PROVENANCE.md` — mêmes règles :
  aucune extraction de base tierce.
- **`ref.lines` est vide.** Les gammes (Cohíba > Línea 1492) existent au schéma et nulle part
  ailleurs. La fiche cigare et les pages marque s'en passent aujourd'hui ; décide si v1 les veut.
- **Rien ne rafraîchit `cigar_stats`.** Un `refresh_cigar_stats()` après écriture d'une entrée
  publique, ou une tâche planifiée. Sans cela la moyenne d'une fiche restera vide pour toujours.

### 1. Le signalement DSA — bloquant pour ouvrir les commentaires

La file existe (`mod.reports`), le délai est déclaré, **le mécanisme d'écriture n'existe pas**.
L'ADR 0005 exige les trois. À livrer : un endpoint sous `app/api/` avec Zod et la clé de service
(le schéma `mod` n'est pas joignable autrement), un bouton « Signaler » sur la fiche et sur chaque
commentaire, le point de contact DSA dans les mentions légales, et le délai de 72 h publié.
Sans cela, publier les commentaires crée le trou de conformité que l'ADR décrit.

### 2. Les commentaires à l'écran

Table, RLS et garde-fous sont faits. Manquent : la liste sous la fiche, le formulaire, l'édition et
la suppression par l'auteur, l'état vide. **Le garde-fou tabac de la boutique ne se réutilise pas
ici** — mesuré : sur six commentaires ordinaires, `isShopTextAllowed()` en refuse quatre (`cigare`,
`havane`, `boite de 25`, `vitole`). Le critère d'un commentaire est **l'incitation, pas le
vocabulaire** : c'est le test en une question de `docs/editorial-guidelines.md`, qui doit gagner une
section sur le contenu versé par des tiers.

### 3. Le carnet à l'écran — P2

Le cœur du produit, entièrement débloqué côté base. À livrer :
- Créer une entrée depuis une fiche : quoi, quand (`smoked_on`), la note, un commentaire libre.
- **Le sélecteur de portée** : privée / à des personnes nommées / à mes abonnés / publique. Défaut
  **privée**. L'ADR 0004 en fait une obligation d'interface : quand on choisit `followers`, il faut
  écrire que l'audience est vivante — douze abonnés aujourd'hui, trois cents dans six mois.
- Le partage nommé : chercher un membre, l'ajouter, le retirer.
- La dégustation structurée : trois tiers, roue des arômes, `is_blind`, minuteur, brouillon auto.
- Mon carnet : liste, filtres, l'affichage /100 ou /20 selon `preferences.score_scale`.
- La fiche cigare affiche `cigar_stats` — et **seulement** ce que la vue contient.

### 4. Le reste de P1

Contribution wiki (proposer, historique, nouveau, file de validation — `cigar_revisions` est prête
et vide), comparateur 2–4 cigares, décodeur de codes de boîte, images OG, `sitemap.ts`,
`types-drift.yml`.

### 5. Puis les phases, dans l'ordre du §9

P2 cave (`humidors`) → P3 social → P4 scan → P5 lieux → P6 éditorial/SEO → P7 boutique →
P8 modération, i18n, PWA, perf, accessibilité. Chaque phase a son critère de sortie au §9, **mesuré
et non supposé**.

---

## À ME SIGNALER, PAS À TRANCHER SEUL

- **862 fiches sur 940 n'ont jamais été relues et sont publiques.** Dérogation assumée à
  `PROVENANCE.md` §2, sur ma demande, pour la QA. Tenable parce que tout est en `noindex` derrière
  l'age gate et que `supabase/scripts/unpublish.sql` remet tout en brouillon en une commande.
  **Les commentaires les rendent commentables** : à rouvrir avant toute mise en ligne réelle.
- **`verified_by` est NULL sur les 940 fiches** : elles ont été publiées avant que les comptes
  n'existent. La traçabilité est dans `public.audit_log`.
- **La page confidentialité n'a pas été relue depuis que les comptes existent**, et elle doit
  maintenant décrire aussi les droits d'export et d'effacement, et comment les exercer. Voir
  `docs/legal/`.
- **Les prix** : arrêté du 5 août 2026, applicable au 1er septembre, 900 fiches de 4,00 € à
  750,00 €. Ils périment au prochain arrêté, à peu près mensuel.
- **14 vitoles portent « Dimensions à vérifier »** — 4 fiches en dépendent, 10 de ces vitoles ne
  servent aucune fiche.
- **`comments_min_role` est à `member`** parce que `contributor` vaut 50 points et que la réputation
  démarre à zéro. À resserrer quand l'inscription s'ouvre.

## NE DEVINE PAS

Les 23 questions de `docs/phase-0/05-questions-ouvertes.md` ont chacune une réponse par défaut.
**Applique le défaut et signale-le**, ou pose la question si le défaut ne tient plus — c'est arrivé
pour la Q12, qui est annotée. Les quatre règles non négociables sont en tête de `CLAUDE.md`.
Une ambiguïté d'architecture → une ADR + une question. Les ADR 0001 à 0003 attendent toujours
validation ; 0004 et 0005 sont acceptées.

## PIÈGES DE CET ENVIRONNEMENT, APPRIS À NOS DÉPENS

- **La CI n'a pas de base de données.** Elle construit avec une URL Supabase de remplacement, donc
  `/cigares`, `/marques` et `/vitoles` y lèvent une exception. Conséquence non évidente : quand une
  Server Action redirige vers une page dont le fetch RSC échoue, la navigation côté client avorte et
  l'URL ne bouge pas — l'échec ressemble exactement à « le portail ne m'a pas laissé passer ». Tout
  test e2e doit atterrir sur `/primitives`, protégé, statique et sans base. **Rejoue toujours les
  e2e avec identifiants bidon et `CI=1` avant de pousser** : le vert local ne prouve rien ici.
- **Playwright** : le `@playwright/test` épinglé veut `chromium_headless_shell-1234`, l'image
  fournit `1194`. Lance avec `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`.
- **Pour les gros payloads SQL**, passe par l'API de gestion en `curl` plutôt que par le MCP :
  `POST /v1/projects/$SUPABASE_PROJECT_REF/database/query`. Cela évite de faire transiter 380 Ko par
  le contexte. Attention : **un appel = une transaction**, donc retire le `begin;`/`commit;` du
  fichier, et `set_config(..., true)` fuit d'une assertion à la suivante.
- **`pnpm check` et le commit doivent être dans la MÊME commande** (`&&`). Sur deux lignes, un check
  rouge n'empêche pas le commit.
- **Le classificateur bloque parfois les heredocs `cat >`** ; utilise l'outil Write, ou un script
  Python qui écrit le fichier.
- **`tg_handle_new_user()` dérive le pseudo des 12 premiers caractères hexadécimaux de l'UUID.**
  Deux comptes de test dont les UUID partagent ce préfixe se heurtent sur `profiles_handle_key`.

### Pièges SQL propres à ce dépôt — lis `supabase/CLAUDE.md` en entier

- `SET LOCAL ROLE` hors transaction est ignoré en silence : l'assertion tourne en superutilisateur
  et passe pour rien. Chaque assertion vit dans un bloc `do $$ … $$`.
- Une assertion dont la donnée de test n'existe pas réussit sans rien tester. Prouve d'abord que la
  ligne existe, en contexte privilégié.
- Une policy qui interroge une table interroge aussi **ses droits** : découpe par rôle.
- Deux policies qui se lisent l'une l'autre, c'est une récursion — **même sans boucle de données**.
- `alter default privileges` est **par schéma**. Un contrôle qui ne regarde qu'un schéma ne protège
  qu'un schéma : c'est ce qui a laissé deux fonctions de `ref` ouvertes depuis le premier jour.
- Une vue matérialisée n'accepte pas de RLS.

## UTILE

Une base PostgreSQL 16 locale est disponible : `pg_ctlcluster 16 main start`, puis travailler sous
l'utilisateur `postgres` — `is_privileged_context()` teste `current_user`. Rejouer tout le job
`db.yml` en local prend deux minutes et évite un aller-retour de CI. La chaîne complète :

```bash
psql -f supabase/tests/00_supabase_stubs.sql       # hors Supabase uniquement
psql -f docs/phase-0/03-schema-p1.sql              # 0001
psql -f supabase/migrations/0002_function_grants.sql
psql -f supabase/migrations/0003_carnet.sql
psql -f supabase/migrations/0004_commentaires_moderation.sql
psql -f supabase/tests/03_carnet_rls.sql           # 15 assertions
psql -f supabase/tests/04_comments_moderation.sql  # 14 assertions
psql -f supabase/migrations/0005_ref_function_grants.sql
psql -f supabase/tests/02_function_grants.sql
psql -f supabase/tests/00_rls_coverage.sql
```

Commandes du projet : `pnpm dev`, `pnpm check` (le portail avant commit), `pnpm test:e2e`
(exige un `pnpm build` préalable), `pnpm storybook`.
