# Vitola — prompt de reprise

> À copier tel quel au démarrage de la prochaine session. Il contient l'état complet de la base :
> **aucune requête n'est nécessaire pour la découvrir**. Réécrit le 22 août 2026, après la livraison
> du signalement DSA, des commentaires et de la roue des arômes.

---

Reprise du projet Vitola. Le contexte est dans le dépôt : lis `CLAUDE.md`, `BRIEF.md`, puis
`docs/decisions-log.md` (les sept sections — les deux premières sont de la session précédente),
`docs/adr/` (0004 et 0005 sont **Acceptées**), `supabase/seed/PROVENANCE.md` et
`docs/phase-0/05-questions-ouvertes.md`.

## LA PREMIÈRE CHOSE À VÉRIFIER, AVANT DE CRÉER TA BRANCHE

**Le travail de la session précédente vit sur `claude/vitola-phase-2-kickoff-kjgfcc` et n'est pas
fusionné dans `master`.** Trois commits : `05b1c24`, `ccab66b`, `c071c14`. CI verte sur les deux
workflows.

Regarde d'abord si `master` les contient (`git log --oneline origin/master -5`) :

- **Si oui** — une PR a été fusionnée entre-temps : branche depuis `master`, normalement.
- **Si non** — branche depuis `claude/vitola-phase-2-kickoff-kjgfcc`, **pas depuis `master`**.
  Repartir de `master` te ferait réécrire les commentaires, le signalement et la roue des arômes,
  et tu ne t'en apercevrais qu'en trouvant les migrations déjà appliquées en base.

**Un écart connu, et il est sans danger : les migrations `0006` et `0007` sont déjà appliquées sur
la base de production, alors que `master` ne contient pas encore leurs fichiers.** Elles n'ajoutent
que des fonctions, des droits et le contenu de `aroma_taxonomy` — rien que le code de `master` ne
lise. La production tourne normalement. C'est le sens de l'ordre « base d'abord, écran ensuite » :
une migration additive peut précéder son écran, l'inverse est un 500.

**Branche de travail** : `claude/vitola-pXX-<nom>`, créée selon la règle ci-dessus.

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
- **Un droit ou une obligation légale se parcourt une fois avec un vrai compte avant d'être
  déclaré livré.** Compiler ne prouve rien : `/api/gdpr/export` a répondu 500 à tout membre connecté
  pendant toute sa durée de vie, et c'est en l'ouvrant qu'on l'a vu, pas en le relisant.

## ÉTAT AU 22 AOÛT 2026, FIN DE SESSION

`master` est la branche de production et **Vercel déploie bien depuis `master`**. `/api/health` sert
le commit déployé (`{"status":"ok","phase":"P1","commit":"…"}`) : c'est le moyen le plus rapide de
savoir ce qui tourne. Chaque branche poussée reçoit une préversion Vercel, protégée par
l'authentification Vercel.

PR #1 à #5 fusionnées ; `master` était à `e032021` en début de session.

### Ce qui marche, vérifié en HTTP réel ou en navigateur

- **940 fiches en base, toutes publiées**, visibles d'un visiteur anonyme derrière l'age gate.
- `/cigares` recherche facettée (force, cape, origine, plein texte, pagination 24/page),
  `/cigares/[slug]`, `/marques` + `[slug]`, `/vitoles` + `[slug]`.
- Page d'accueil publique, age gate, `/connexion` par lien magique **et** mot de passe, session
  rafraîchie dans le middleware.
- **Commentaires de fiche** (ADR 0005) : liste, formulaire, édition et suppression par l'auteur,
  état vide en invitation, pseudo de l'auteur, mention « modifié ». **Parcouru en navigateur contre
  la vraie base, 22 assertions vertes**, avec deux comptes distincts.
- **Signalement DSA** : `POST /api/signalements` (Zod, session obligatoire, visibilité vérifiée sous
  RLS), bouton « Signaler » sur chaque fiche et chaque commentaire — jamais sur le sien —,
  déduplication d'un dossier ouvert, frein à 20/heure, délai de 72 h publié dans les mentions
  légales et **lu depuis `feature_flags` à chaque rendu**.
- **`/aromes`** : la roue des arômes, 11 familles et 76 descripteurs, en page de référence.
- `/api/gdpr/export` et `/api/gdpr/delete`. **L'export a été exercé avec `test_un` contre le projet
  réel** : `200`, `Cache-Control: no-store, private`, 22 sources rendues dont les trois liens vers
  `mod`. Il répondait `500` avant la migration 0007.
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

Projet `vitola`, ref `upbewqsmgcrogoapubyz`, région `eu-west-3` (Paris). **Sept migrations**
appliquées et enregistrées dans `supabase_migrations.schema_migrations` :

| Version | Nom | Fichier |
|---|---|---|
| `0001` | `p1_referential` | `docs/phase-0/03-schema-p1.sql` |
| `0002` | `function_grants` | `supabase/migrations/0002_function_grants.sql` |
| `0003` | `carnet` | `supabase/migrations/0003_carnet.sql` |
| `0004` | `commentaires_moderation` | `supabase/migrations/0004_commentaires_moderation.sql` |
| `0005` | `ref_function_grants` | `supabase/migrations/0005_ref_function_grants.sql` |
| `0006` | `signalement_et_statistiques` | `supabase/migrations/0006_signalement_et_statistiques.sql` |
| `0007` | `ref_service_role_grants` | `supabase/migrations/0007_ref_service_role_grants.sql` |

Schémas exposés à PostgREST : `db_schema = public,graphql_public,ref`.
`mod` en est délibérément **absent**.

Extension ajoutée : **`pg_cron`**, pour une seule tâche — `vitola-refresh-cigar-stats`, toutes les
cinq minutes, `select public.refresh_cigar_stats()`.

### Volumes réels

```
ref.manufacturers          30      public.profiles             3
ref.brands                114      public.reviews              0  ←
ref.lines                   0  ←   public.review_shares        0
ref.vitolas                51      public.review_thirds        0
ref.cigars                940      public.comments             0
  dont published          940      public.aroma_taxonomy      87
  avec vitole              78        dont familles            11
  avec prix               900      public.consents             0
  avec force / cape       123      public.audit_log            4
  verified_by non nul       0  ←   public.feature_flags        5
ref.box_codes              18      mod.reports                 0
ref.cigar_images            0      mod.moderation_actions      0
ref.cigar_revisions         0      public.cigar_stats     0 ligne (vue matérialisée)
```

`reviews` à zéro est le manque de la prochaine session, pas un état normal. `ref.lines` à zéro est
une **décision de v1**, écrite dans `CLAUDE.md` avec son déclencheur — ne la rouvre pas sans la
lire. `verified_by` à zéro est une dette de relecture, voir « À me signaler ».

`audit_log` contient quatre lignes, dont trois écrites en vérifiant les endpoints (`dsa.report`
×2, `gdpr.export`). Le journal est en ajout seul, personne n'a de `DELETE` dessus : c'est voulu.

### Colonnes, table par table

**`public.profiles`** — annuaire public. `id! (→auth.users)`, `handle!`, `display_name`,
`avatar_path`, `bio`, `country(2)`, `city`, `reputation!`, `role!(app_role)`, `is_discoverable!`,
`created_at!`, `updated_at!`.
`handle` : `^[a-z0-9][a-z0-9_]{1,28}[a-z0-9]$` — underscore oui, tiret non.
`is_discoverable` vaut `true` par défaut ; un profil qui le passe à `false` **disparaît des
lectures de tiers**, y compris de la signature d'un commentaire. C'est un choix qu'on honore, pas un
trou à combler avec l'identifiant.

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
`id!`, `user_id!(→auth.users, cascade)`, `cigar_id!(→ref.cigars, cascade)`, `kind!(review_kind)`,
`visibility!(review_visibility, défaut private)`, `score_total numeric(4,1)`, `scores!` jsonb,
`aroma_tags!` int[], `strength_perceived(ref.strength)`, `smoke_duration_min`, `pairing_text`,
`pairing_tags!` text[], `box_code`, `production_year`, `purchase_year`, `humidity_pct`, `is_blind!`,
`body`, `smoked_on!` date (défaut `current_date`), `created_at!`, `updated_at!`.

**Contraintes qui refuseront tes insertions si tu les ignores :**

- `score_total` entre 0 et 100 ; `scores` doit être un objet
- `scores` n'accepte que les clés `construction`, `draw`, `burn`, `aroma`, `evolution`, `finish`
- `kind='tasting'` ⇒ `scores <> '{}'`
- `kind='log'` ⇒ au moins un `score_total` **ou** un `body` non vide
- `body` ≤ 4000, `pairing_text` ≤ 500, `smoke_duration_min` 1–600, `humidity_pct` 0–100
- `aroma_tags` ≤ 30 éléments, `pairing_tags` ≤ 12
- `user_id` et `cigar_id` ne sont dans **aucun grant d'UPDATE** : une entrée ne change ni d'auteur
  ni de cigare. Se tromper de fiche, c'est supprimer et ressaisir.

**`public.review_shares`** — qui a accès à une entrée `shared`. `review_id!`, `grantee_id!`,
`granted_by!`, `granted_at!`. Clé primaire `(review_id, grantee_id)`. `grantee_id <> granted_by`.
Aucun UPDATE : on accorde ou on retire. **Un destinataire ne peut pas repartager** — seule la policy
INSERT de l'auteur passe.

**`public.review_thirds`** — `review_id!`, `third!` (1..3), `notes` (≤2000). PK `(review_id, third)`.

**`public.cigar_stats`** — vue matérialisée, donc **sans RLS**. Colonnes : `cigar_id`,
`review_count`, `mean_score`, `bayesian_score`, `review_count_90d`, `mean_score_90d`,
`distribution` jsonb (`lt60`, `b60_69`, `b70_79`, `b80_89`, `b90_100`), `last_review_at`.
Elle ne lit que `visibility='public'` : **ce prédicat est la frontière de sécurité entière**, et
l'auto-contrôle de 0003 relit `pg_get_viewdef()` pour vérifier qu'il y est. A priori bayésien :
10 avis, moyenne globale, 80 par défaut.
**Rafraîchie toutes les cinq minutes par `pg_cron`** depuis la 0006 — c'est le filet. Le
rafraîchissement à l'écriture, lui, reste à écrire : c'est le chemin qui sert la personne qui vient
de publier, et il appartient au carnet.

**`public.comments`** — commentaires de fiche (ADR 0005). `id!`, `cigar_id!(→ref.cigars, cascade)`,
`author_id!(→auth.users, cascade)`, `body!` (1–2000), `hidden_at`, `hidden_by`, `hidden_reason`,
`created_at!`, `updated_at!`. Pas de `visibility` : un commentaire de fiche est public par
construction. Pas de note non plus. `hidden_*` : les trois ensemble ou aucun, et **hors de tout
grant** — masquer passe par la clé de service, y compris pour un modérateur connecté.

**`public.aroma_taxonomy`** — roue des arômes, **87 lignes**. `id!` (integer identity), `parent_id`,
`family!(aroma_family)`, `slug!`, `label_fr!` (1–60), `label_en`, `created_at!`.
**L'arbre est plat par construction** : une famille, ses descripteurs, rien en dessous.
`supabase/tests/01_seed_integrity.sql` échoue si un troisième niveau apparaît, si une famille est
vide, ou si le nombre de familles cesse d'égaler le nombre de valeurs de l'enum.

**`mod.reports`** — file DSA. `id!`, `reporter_id`, `entity_schema!`, `entity_table!`, `entity_id!`,
`reason!(report_reason)`, `detail` (≤2000), `status!(report_status)`, `created_at!`,
`acknowledged_at`, `decided_at`, `decided_by`, `decision_note`.
`entity_schema.entity_table` ∈ `{public.comments, public.reviews, ref.cigars, public.profiles}`.
Une décision (`upheld`/`dismissed`) exige `decided_at` **et** `decided_by`.

**`mod.moderation_actions`** — `id!`, `report_id`, `moderator_id`, `verb!(moderation_verb)`,
`entity_schema!`, `entity_table!`, `entity_id!`, `reason!`, `created_at!`. Aucune policy d'écriture,
aucun grant : ajout seul par la clé de service.

**Schéma `ref`** — inchangé depuis 0001 : `manufacturers`, `brands`, `lines`, `vitolas`, `cigars`,
`cigar_revisions`, `cigar_images`, `box_codes`. Voir `docs/phase-0/03-schema-p1.sql`.

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

| Fonction | DEFINER | anon | authenticated | service_role |
|---|---|---|---|---|
| `public.has_min_role(app_role)` | non | ✓ | ✓ | ✓ |
| `public.current_app_role()` | **oui** | ✓ | ✓ | ✓ |
| `public.owns_review(uuid)` | **oui** | ✗ | ✓ | ✓ |
| `public.comment_min_role()` | non | ✓ | ✓ | ✓ |
| `public.immutable_unaccent(text)`, `public.slugify(text)` | non | ✓ | ✓ | ✓ |
| `public.refresh_cigar_stats()` | **oui** | ✗ | ✗ | ✓ |
| `public.file_report(uuid,text,text,text,text,text)` | **oui** | ✗ | ✗ | **✓** |
| `public.moderation_records_for_subject(uuid)` | **oui** | ✗ | ✗ | **✓** |
| `public.is_privileged_context()` | non | ✗ | ✗ | ✗ |

`owns_review()` existe pour **casser une récursion** : `reviews` et `review_shares` se lisent
mutuellement dans leurs policies, et PostgreSQL détecte le cycle sur le graphe des policies, pas sur
le chemin d'exécution. Ne la remplace pas par un `EXISTS`.

**`file_report()` et `moderation_records_for_subject()` sont les deux seules portes sur `mod`.**
Elles existent parce que la clé de service **ne peut pas** écrire dans ce schéma : `mod` n'est pas
exposé à PostgREST, et `service_role` n'y a aucun droit de table — seul `postgres` en a. Elles sont
accordées à `service_role` et à personne d'autre, et `supabase/tests/05_signalement.sql` le vérifie
en 11 assertions. `file_report()` prend son motif en `text` et le cast en `mod.report_reason` à
l'intérieur : un type d'un schéma non exposé dans la signature d'une fonction exposée est
irrésoluble pour PostgREST.

### Droits de table de la clé de service

| Schéma | `service_role` |
|---|---|
| `public` | tout (amorçage Supabase) + `SELECT` explicite depuis la 0007 |
| `ref` | **`SELECT` seulement**, depuis la 0007. Aucune écriture, et c'est asserté |
| `mod` | **rien.** Les deux fonctions ci-dessus sont l'unique passage |

`supabase/tests/06_service_role_reads.sql` garde les trois invariants et **n'accorde rien** : c'est
le seul endroit d'où une régression se voit, l'auto-contrôle d'une migration ne pouvant jamais
échouer sur ce qu'elle vient d'accorder.

### Drapeaux de fonctionnalité

| clé | activé | charge utile | à savoir |
|---|---|---|---|
| `public_signup_open` | **non** | | Ouvre l'inscription. Fermé jusqu'à l'avis juridique (Q1). |
| `show_indicative_prices` | **non** | | Affiche `msrp_eur`. Voir Q19. |
| `wiki_contributions_open` | oui | | Ouvre la file de révisions. |
| `comments_min_role` | oui | `{"min_role":"member"}` | **À resserrer en `contributor` le jour où l'inscription s'ouvre.** |
| `dsa_report_sla_hours` | oui | `{"hours":72}` | Publié dans les mentions légales, **lu à chaque rendu**. Le changer change ce qu'on promet, sans déploiement. Épinglé par `tests/compliance/dsa.test.ts`, qui relit la migration 0004. |

### Buckets de stockage

`avatars` (privé, 0 objet), `cigar-images` (privé, 0 objet). **`deleteUser` ne supprime pas les
objets** : le jour où un téléversement existe, il ship avec son `storage.remove()` dans
`app/api/gdpr/delete/route.ts`, même commit. C'est écrit dans le fichier.

### Avertissements de sécurité Supabase — 5, tous connus, inchangés

1. `materialized_view_in_api` — `cigar_stats`. Assumé : son contenu est public par construction.
2. + 3. `current_app_role()` appelable par anon et authenticated. **Pré-existant.** La retirer casse
   la lecture publique (vérifié, pas supposé) : les policies SELECT anonymes l'appellent via
   `has_min_role()`. La sortir du schéma exposé est une ADR.
4. `owns_review()` appelable par authenticated. Même famille, même ADR à écrire. Elle ne répond que
   sur son appelant, donc ne divulgue rien.
5. `auth_leaked_password_protection` désactivé — **un interrupteur dans la console Supabase**, et il
   compte maintenant que les mots de passe existent.

**Les deux fonctions de la 0006 ne figurent pas dans cette liste**, alors qu'elles sont
`SECURITY DEFINER` dans un schéma exposé : les advisors ne relèvent que celles qu'un rôle client
peut appeler. C'est la confirmation que le grant est correct — et le contrôle à refaire si tu en
ajoutes une.

---

## TROIS RÉGLAGES SUPABASE QUI NE VIVENT DANS AUCUN FICHIER

Documentés dans `docs/setup/supabase.md`, non exécutables. Si le projet est recréé, rien ne les
reconstruit.

1. **`db_schema` doit valoir `public,graphql_public,ref`** — et surtout **jamais `mod`**. Par défaut
   un projet n'expose que `public, graphql_public` : sans ce réglage aucune requête client ne
   résout, quel que soit le code. C'est le blocage qui a fait perdre le plus de temps.
2. **`site_url` + `uri_allow_list`** doivent couvrir localhost, la production et les préversions
   Vercel, sinon un lien magique est rejeté.
3. **Le SMTP intégré plafonne à ~2 envois/heure.** C'est pour ça que le mot de passe existe.

Un quatrième réglage a cessé d'en être un : les droits de la clé de service sur `ref` étaient hérités
de rien du tout, et la 0007 les écrit. Voir « Droits de table de la clé de service ».

---

## CE QU'IL FAUT CONSTRUIRE, PAR ORDRE

Les items 0, 1 et 2 de la liste précédente sont livrés. La numérotation reprend là où elle s'est
arrêtée.

### 3. Le carnet à l'écran — P2. **C'est cette session.**

Le cœur du produit, entièrement débloqué côté base : la table, ses policies, la roue des arômes et
`cigar_stats` existent et sont peuplées ou prêtes. Rien de tout cela ne se voit encore.

À livrer :

- **Créer une entrée depuis une fiche** : quoi, quand (`smoked_on`), la note, un commentaire libre.
  C'est `kind='log'` — le geste quotidien, qui exige seulement une note **ou** un texte.
- **Le sélecteur de portée** : privée / à des personnes nommées / à mes abonnés / publique. Défaut
  **privée**. L'ADR 0004 en fait une **obligation d'interface** : quand on choisit `followers`, il
  faut écrire que l'audience est vivante — douze abonnés aujourd'hui, trois cents dans six mois.
  Attention : `public.follows` n'existe qu'en P3, donc la branche `followers` de la policy SELECT
  n'existe pas encore. Une entrée `followers` est donc aujourd'hui visible de son seul auteur.
  **Dis-le dans l'interface plutôt que de laisser croire à une audience qui ne lit rien.**
- **Le partage nommé** : chercher un membre, l'ajouter, le retirer. Rappel des policies —
  seul l'auteur accorde, un destinataire ne repartage pas, et retirer ne défait pas ce qui a été lu.
- **La dégustation structurée** (`kind='tasting'`) : trois tiers, roue des arômes, `is_blind`,
  minuteur, brouillon auto. `/aromes` et `lib/aromas/queries.ts` donnent déjà l'arbre ; la **forme
  circulaire** du §5.4 appartient à ce contrôle de saisie, pas à la page de référence.
- **Mon carnet** : liste, filtres, l'affichage /100 ou /20 selon `preferences.score_scale`.
  `formatScore()` existe déjà dans `lib/format/`.
- **La fiche cigare affiche `cigar_stats`** — et **seulement** ce que la vue contient. Aucune
  moyenne recalculée en TypeScript : ce serait dupliquer la frontière de sécurité de la vue.
- **Le rafraîchissement à l'écriture** : appeler `public.refresh_cigar_stats()` avec la clé de
  service après toute écriture qui touche une entrée **publique**, pour que l'auteur voie sa note
  compter tout de suite. La tâche `pg_cron` reste le filet ; elle ne la remplace pas.

Deux règles héritées de l'ADR 0004, à ne pas contourner : **aucun filtre `visibility` en
TypeScript** — la RLS l'applique et rien d'autre — et la portée est **par entrée**, jamais globale.

### 4. Le reste de P1

Contribution wiki (proposer, historique, nouveau, file de validation — `cigar_revisions` est prête
et vide), comparateur 2–4 cigares, décodeur de codes de boîte, images OG, `sitemap.ts`,
`types-drift.yml`. **La file wiki est aussi ce qui rouvre `ref.lines`** — voir `CLAUDE.md`.

### 5. Puis les phases, dans l'ordre du §9

P2 cave (`humidors`) → P3 social → P4 scan → P5 lieux → P6 éditorial/SEO → P7 boutique →
P8 modération, i18n, PWA, perf, accessibilité. Chaque phase a son critère de sortie au §9, **mesuré
et non supposé**.

---

## À ME SIGNALER, PAS À TRANCHER SEUL

- **Qui modère ?** La Q12 posait deux questions ; le délai est répondu (72 h, publié), celle-là non.
  Pas de back-office avant P8, aucun destinataire nommé, personne pour relever `mod.reports`.
  Tenable tant que rien n'est ouvert au public. **À trancher avant l'ouverture.**
- **Le point de contact DSA des art. 11 et 12 n'est pas publié.** `DSA_CONTACT_EMAIL` est
  délibérément à `null` dans `lib/compliance/dsa.ts` : publier une adresse à un domaine que personne
  ne possède, c'est s'engager à relever une boîte qui n'existe pas. La page l'annonce en toutes
  lettres. **Une ligne à écrire dès que la Q7 aura tranché un domaine.**
- **862 fiches sur 940 n'ont jamais été relues et sont publiques.** Dérogation assumée à
  `PROVENANCE.md` §2, pour la QA. Tenable parce que tout est en `noindex` derrière l'age gate et que
  `supabase/scripts/unpublish.sql` remet tout en brouillon en une commande. **Elles sont désormais
  commentables et signalables** : à rouvrir avant toute mise en ligne réelle.
- **`verified_by` est NULL sur les 940 fiches** : elles ont été publiées avant que les comptes
  n'existent. La traçabilité est dans `public.audit_log`.
- **La page confidentialité n'a pas été relue depuis que les comptes existent**, et elle doit
  maintenant décrire les droits d'export et d'effacement, comment les exercer, **et ce que le carnet
  enregistre** — le §2 range possiblement ces données à l'art. 9. Voir `docs/legal/`.
- **Les prix** : arrêté du 5 août 2026, applicable au 1er septembre, 900 fiches de 4,00 € à
  750,00 €. Ils périment au prochain arrêté, à peu près mensuel.
- **14 vitoles portent « Dimensions à vérifier »** — 4 fiches en dépendent, 10 de ces vitoles ne
  servent aucune fiche.
- **`comments_min_role` est à `member`** parce que `contributor` vaut 50 points et que la réputation
  démarre à zéro. À resserrer quand l'inscription s'ouvre.

## NE DEVINE PAS

Les 23 questions de `docs/phase-0/05-questions-ouvertes.md` ont chacune une réponse par défaut.
**Applique le défaut et signale-le**, ou pose la question si le défaut ne tient plus — c'est arrivé
pour la Q12, qui est annotée deux fois. Les quatre règles non négociables sont en tête de
`CLAUDE.md`. Une ambiguïté d'architecture → une ADR + une question. Les ADR 0001 à 0003 attendent
toujours validation ; 0004 et 0005 sont acceptées.

## PIÈGES DE CET ENVIRONNEMENT, APPRIS À NOS DÉPENS

- **La CI n'a pas de base de données.** Elle construit avec une URL Supabase de remplacement, donc
  `/cigares`, `/marques` et `/vitoles` y lèvent une exception. Conséquence non évidente : quand une
  Server Action redirige vers une page dont le fetch RSC échoue, la navigation côté client avorte et
  l'URL ne bouge pas — l'échec ressemble exactement à « le portail ne m'a pas laissé passer ». Tout
  test e2e doit atterrir sur `/primitives` ou sur une page publique sans base. **Rejoue toujours les
  e2e avec identifiants bidon et `CI=1` avant de pousser** : le vert local ne prouve rien ici.
- **Chromium ne joint aucun hôte externe depuis ce conteneur.** Toute tentative finit en
  `ERR_CONNECTION_RESET`, y compris en lui passant le proxy — vérifié sur trois configurations de
  drapeaux. Pour parcourir le site en navigateur, il faut donc **le lancer en local** :
  écrire un `.env.local` avec les vraies clés du projet, `pnpm build`, `pnpm start --port 3100`,
  puis pointer Playwright sur `127.0.0.1`. `curl` sort normalement, lui, via le proxy.
- **Les formulaires sont câblés par l'hydratation.** Cliquer « Confirmer » ou « Publier » avant que
  React n'ait attaché l'action ne soumet **rien**, en silence : la page reste là et l'assertion
  suivante échoue ailleurs. Attends `networkidle`, jamais `load`.
- **Playwright** : le `@playwright/test` épinglé veut `chromium_headless_shell-1234`, l'image
  fournit `1194`. Lance avec `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`.
- **Nettoie derrière une vérification.** Les commentaires et signalements écrits en parcourant le
  site vivent dans la vraie base. Efface-les avant de rendre la main, sinon la QA humaine commence
  sur un fil qui n'est pas le sien. `audit_log`, lui, ne s'efface pas : c'est un journal.
- **Pour les gros payloads SQL**, passe par l'API de gestion en `curl` plutôt que par le MCP :
  `POST /v1/projects/$SUPABASE_PROJECT_REF/database/query`. Cela évite de faire transiter 380 Ko par
  le contexte. Attention : **un appel = une transaction**, donc retire le `begin;`/`commit;` du
  fichier, et `set_config(..., true)` fuit d'une assertion à la suivante.
- **`pnpm check` et le commit doivent être dans la MÊME commande** (`&&`). Sur deux lignes, un check
  rouge n'empêche pas le commit.
- **Prettier n'est pas dans la CI** et 52 fichiers ne passent pas `pnpm format:check`, dont beaucoup
  d'avant cette session. Ne lance pas `pnpm format` : tu enterrerais ton diff sous un reformatage.
- **Le classificateur bloque parfois les heredocs `cat >`** ; utilise l'outil Write, ou un script
  Python qui écrit le fichier.
- **`tg_handle_new_user()` dérive le pseudo des 12 premiers caractères hexadécimaux de l'UUID.**
  Deux comptes de test dont les UUID partagent ce préfixe se heurtent sur `profiles_handle_key`.
- **`pkill -f "next"` tue le shell.** Le motif attrape le processus englobant. Ferme le serveur par
  son port : `ss -lptn 'sport = :3100'`.

### Pièges SQL propres à ce dépôt — lis `supabase/CLAUDE.md` en entier

- `SET LOCAL ROLE` hors transaction est ignoré en silence : l'assertion tourne en superutilisateur
  et passe pour rien. Chaque assertion vit dans un bloc `do $$ … $$`.
- Une assertion dont la donnée de test n'existe pas réussit sans rien tester. Prouve d'abord que la
  ligne existe, en contexte privilégié.
- **Un UPDATE qu'une policy refuse n'échoue pas** : il ne trouve aucune ligne et rapporte zéro.
  Traiter zéro comme un succès affiche une confirmation sur un enregistrement qui n'a pas eu lieu.
- Une policy qui interroge une table interroge aussi **ses droits** : découpe par rôle.
- Deux policies qui se lisent l'une l'autre, c'est une récursion — **même sans boucle de données**.
- `alter default privileges` est **par schéma**, et **l'amorçage de Supabase aussi**. Il accorde tout
  sur `public` et ignore les schémas qu'on crée : `ref` n'a jamais rien accordé à `service_role`, et
  l'export RGPD répondait 500. **`BYPASSRLS` ne dit rien des droits de table.**
- **L'auto-contrôle d'une migration ne peut pas attraper ce qu'elle vient de corriger.** Elle accorde
  puis vérifie. La garde qui mord vit dans `supabase/tests/`, et n'accorde rien.
- **PostgreSQL analyse une condition d'un seul tenant**, court-circuit compris. `if pg_cron existe
  and cron.job est vide` échoue sur « relation cron.job does not exist » là où la garde devait
  l'éviter. Un `if` imbriqué, ou un `execute`, diffère l'analyse.
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
psql -f supabase/migrations/0006_signalement_et_statistiques.sql
psql -f supabase/tests/05_signalement.sql          # 11 assertions
psql -f supabase/migrations/0007_ref_service_role_grants.sql
psql -f supabase/tests/06_service_role_reads.sql   # 3 assertions
psql -f supabase/tests/02_function_grants.sql
psql -f supabase/tests/00_rls_coverage.sql
```

Le §3 de la 0006 se déclare absent par un `NOTICE` sur une base nue : `pg_cron` n'existe ni en local
ni sur l'image de la CI. C'est attendu, ce n'est pas un échec.

Le seed écrit maintenant aussi dans `public` (la roue des arômes, section 6) : sur une base nue,
appliquer **0003 avant `seed.sql`**, faute de quoi la table est absente.

Commandes du projet : `pnpm dev`, `pnpm check` (le portail avant commit), `pnpm test:e2e`
(exige un `pnpm build` préalable), `pnpm storybook`.
