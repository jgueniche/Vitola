# Vitola — prompt de reprise

> À copier tel quel au démarrage de la prochaine session. Il contient l'état complet de la base :
> **aucune requête n'est nécessaire pour la découvrir**. Réécrit le 22 août 2026, après la mise à
> l'écran du carnet (PR #7).

---

Reprise du projet Vitola. Le contexte est dans le dépôt : lis `CLAUDE.md`, `BRIEF.md`, puis
`docs/decisions-log.md` (les huit sections — la première est de la session précédente),
`docs/adr/` (0004 et 0005 sont **Acceptées**), `supabase/seed/PROVENANCE.md` et
`docs/phase-0/05-questions-ouvertes.md`. Un `CLAUDE.md` par domaine complète le racine :
`app/`, `lib/`, `supabase/` — les trois ont été enrichis par la dernière session et leurs nouveaux
paragraphes sont exactement ceux qu'on regrette de ne pas avoir lus.

**Branche de travail** : celle qui t'est assignée, à créer depuis `master`, qui contient tout le
travail décrit ici (PR #7 fusionnée le 22 août 2026). Vérifie d'un coup d'œil plutôt que de
supposer : `git log --oneline origin/master -3` doit montrer la fusion de #7, et `/api/health` sert
le commit réellement déployé.

Le code du dépôt et l'état de la base concordent : **sept migrations**, toutes dans
`supabase/migrations/` **et** appliquées sur le projet. Le carnet n'en a demandé aucune — la 0003
avait tout prévu, ce qui est la meilleure chose qu'on puisse dire d'une ADR écrite avant le SQL.

Une chose à savoir sur l'ordre des choses : **une migration additive peut précéder son écran,
l'inverse est un 500.** Les 0006 et 0007 ont vécu quelques heures appliquées en base pendant que
`master` n'avait pas encore leurs fichiers, sans conséquence — elles n'ajoutaient que des fonctions,
des droits et du contenu que le code d'alors ne lisait pas. Livrer l'écran d'abord n'aurait pas
pardonné.

## OBJECTIF : AMENER LE SITE À SA VERSION DÉFINITIVE

**La v1 du brief, phases P2 à P8 comprises.** C'est plusieurs sessions ; l'ordre est donné plus bas.
Il n'est pas négociable sans me le dire, parce que chaque phase ouvre la suivante et qu'une phase
qu'on quitte avant son critère de sortie est une dette qu'on ne retrouve qu'en production.

**La QA est humaine, directement sur le front.** Conséquence sur ta façon de travailler :

- Une phase n'est livrée que si elle est **parcourable dans un navigateur** par une personne
  connectée. Un schéma sans écran ne compte pas. Un endpoint sans bouton non plus.
- Chaque livraison se termine par **la liste des URL à ouvrir et ce qu'on doit y voir**, comptes de
  QA à l'appui. C'est le livrable qui remplace la relecture de base.
- Un état vide est un écran, pas une erreur : le §4.6 en fait une invitation.
- Ne me demande pas de vérifier la base. Je vérifie par le site.
- **Un droit, une obligation légale ou un écran qui écrit se parcourt une fois avec un vrai compte
  avant d'être déclaré livré.** Compiler ne prouve rien, et la dernière session l'a payé trois fois
  en une soirée : trois bugs sont passés à travers `pnpm check` vert, 165 tests unitaires et 56 e2e.
  Aucun n'était visible d'un compilateur. Deux ne se voient même pas en relisant le code.

---

## ÉTAT AU 22 AOÛT 2026, FIN DE SESSION

`master` est la branche de production et **Vercel déploie bien depuis `master`**. `/api/health` sert
le commit déployé (`{"status":"ok","phase":"P1","commit":"…"}`) : c'est le moyen le plus rapide de
savoir ce qui tourne. Chaque branche poussée reçoit une préversion Vercel, protégée par
l'authentification Vercel.

PR #1 à #7 fusionnées. La #7 a porté le carnet du fumeur en entier (P2, première moitié).

### Ce qui marche, vérifié en HTTP réel ou en navigateur

- **940 fiches en base, toutes publiées**, visibles d'un visiteur anonyme derrière l'age gate.
- `/cigares` recherche facettée (force, cape, origine, plein texte, pagination 24/page),
  `/cigares/[slug]`, `/marques` + `[slug]`, `/vitoles` + `[slug]`.
- Page d'accueil publique, age gate, `/connexion` par lien magique **et** mot de passe, session
  rafraîchie dans le middleware.
- **Commentaires de fiche** (ADR 0005) : liste, formulaire, édition et suppression par l'auteur,
  état vide en invitation, pseudo de l'auteur, mention « modifié ».
- **Signalement DSA** : `POST /api/signalements` (Zod, session obligatoire, visibilité vérifiée sous
  RLS), bouton « Signaler » sur chaque fiche, chaque commentaire **et désormais chaque entrée de
  carnet** — jamais sur le sien —, déduplication, frein à 20/heure, délai de 72 h publié dans les
  mentions légales et lu depuis `feature_flags` à chaque rendu.
- **`/aromes`** : la roue des arômes, 11 familles et 76 descripteurs, en page de référence.
- **Le carnet du fumeur (P2, première moitié)** — **112 assertions de parcours, deux comptes, contre
  la vraie base, 0 échec** :
  - note de carnet depuis la fiche cigare (`kind='log'` : une note **ou** un mot) ;
  - dégustation structurée à `/cigares/[slug]/degustation` (`kind='tasting'`) — six critères sur 10
    dont la moyenne fait la note globale **calculée et non saisissable**, trois tiers, roue des
    arômes **circulaire et cliquable**, `is_blind`, minuteur, brouillon auto dans `localStorage` ;
  - `/carnet` — liste, filtres par nature et par portée (des liens, donc rechargeables et
    partageables), bascule /100 ↔ /20, section « Partagé avec moi » ;
  - `/carnet/[id]` — relecture, modification, changement de portée, destinataires nommés,
    suppression ;
  - `cigar_stats` sur la fiche cigare : note pondérée, moyenne simple, fenêtre 90 jours,
    répartition. Rien n'est recalculé en TypeScript.
- `/api/gdpr/export` et `/api/gdpr/delete`. L'export a été exercé avec `test_un` contre le projet
  réel : `200`, `Cache-Control: no-store, private`, 22 sources rendues.
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
ref.brands                114      public.reviews              0
ref.lines                   0  ←   public.review_shares        0
ref.vitolas                51      public.review_thirds        0
ref.cigars                940      public.comments             1
  dont published          940      public.aroma_taxonomy      87
  avec vitole              78        dont familles            11
  avec prix               900      public.consents             0
  avec force / cape       123      public.audit_log            4
  verified_by non nul       0  ←   public.feature_flags        5
ref.box_codes              18      mod.reports                 0
ref.cigar_images            0      mod.moderation_actions      0
ref.cigar_revisions         0      public.cigar_stats     0 ligne (vue matérialisée)
```

`reviews` est à zéro et c'est **normal cette fois** : les entrées écrites en parcourant le carnet ont
été effacées derrière la vérification, comme le demande « Nettoie derrière une vérification » plus
bas. La table a ses écrans, elle attend des membres. `ref.lines` à zéro est une **décision de v1**,
écrite dans `CLAUDE.md` avec son déclencheur — ne la rouvre pas sans la lire. `verified_by` à zéro
est une dette de relecture, voir « À me signaler ».

`public.comments` contient **une ligne** qui n'a pas été écrite par une session Claude : elle est
antérieure et a été laissée en place. Ne l'efface pas sans demander.

`audit_log` contient quatre lignes, écrites en vérifiant les endpoints. Le journal est en ajout
seul, personne n'a de `DELETE` dessus : c'est voulu.

### Colonnes, table par table

**`public.profiles`** — annuaire public. `id! (→auth.users)`, `handle!`, `display_name`,
`avatar_path`, `bio`, `country(2)`, `city`, `reputation!`, `role!(app_role)`, `is_discoverable!`,
`created_at!`, `updated_at!`.
`handle` : `^[a-z0-9][a-z0-9_]{1,28}[a-z0-9]$` — underscore oui, tiret non.
`is_discoverable` vaut `true` par défaut ; un profil qui le passe à `false` **disparaît des
lectures de tiers**, y compris de la signature d'un commentaire et de la recherche de destinataires
du carnet. C'est un choix qu'on honore, pas un trou à combler avec l'identifiant.

**`public.profile_settings`** — propriétaire seul. `id!(→profiles)`, `birth_date`,
`adult_confirmed_at`, `locale!`, `preferences!` jsonb, `privacy!` jsonb, `created_at!`, `updated_at!`.
Défauts : `preferences = {"score_scale":100,"length_unit":"mm","email_digest":false}`,
`privacy = {"show_humidor":false,"show_reviews":true,"show_country":true}`.
**`GRANT UPDATE` porte `(birth_date, locale, preferences, privacy)` et rien d'autre** — un trigger
horodate `updated_at`, et l'écrire à la main lève `42501`. Ça a déjà coûté une journée.

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
- Un trigger `reviews_set_updated_at` horodate. Ne l'écris pas à la main.

**Convention d'écriture, décidée en construisant** (`docs/decisions-log.md`) : les six sous-notes
sont **sur 10**, et `score_total` en est la moyenne ramenée sur 100, **calculée et jamais saisie**
pour une dégustation. Une note globale surchargeable ferait des six critères une décoration.
`lib/reviews/model.ts` porte la règle et `tests/unit/reviews-model.test.ts` la garde.

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
10 avis, moyenne globale, 80 par défaut — donc avec une seule note, pondérée et moyenne simple sont
égales, ce qui est correct et déroute au premier coup d'œil.
**Rafraîchie toutes les cinq minutes par `pg_cron`** (le filet) **et à l'écriture** par
`app/api/_stats/refresh.ts`, appelé depuis les Server Actions du carnet après toute écriture qui
touche une entrée publique — publication, dépublication, suppression comprises.

**`public.comments`** — commentaires de fiche (ADR 0005). `id!`, `cigar_id!(→ref.cigars, cascade)`,
`author_id!(→auth.users, cascade)`, `body!` (1–2000), `hidden_at`, `hidden_by`, `hidden_reason`,
`created_at!`, `updated_at!`. Pas de `visibility` : un commentaire de fiche est public par
construction. `hidden_*` : les trois ensemble ou aucun, et **hors de tout grant** — masquer passe par
la clé de service, y compris pour un modérateur connecté.

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

**La branche `followers` de la policy SELECT n'existe pas encore** — `public.follows` arrive en P3.
Une entrée `followers` est donc aujourd'hui lisible de son seul auteur, et l'interface le **dit**.
`tests/unit/reviews-model.test.ts` échoue le jour où cette branche apparaît : l'avertissement devra
être retiré en même temps. C'est voulu.

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
exposé à PostgREST, et `service_role` n'y a aucun droit de table — seul `postgres` en a.

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
| `dsa_report_sla_hours` | oui | `{"hours":72}` | Publié dans les mentions légales, **lu à chaque rendu**. Le changer change ce qu'on promet, sans déploiement. Épinglé par `tests/compliance/dsa.test.ts`. |

### Buckets de stockage

`avatars` (privé, 0 objet), `cigar-images` (privé, 0 objet). **`deleteUser` ne supprime pas les
objets** : le jour où un téléversement existe, il ship avec son `storage.remove()` dans
`app/api/gdpr/delete/route.ts`, même commit. C'est écrit dans le fichier.

### Avertissements de sécurité Supabase — 5, tous connus, inchangés

1. `materialized_view_in_api` — `cigar_stats`. Assumé : son contenu est public par construction.
2. + 3. `current_app_role()` appelable par anon et authenticated. **Pré-existant.** La retirer casse
   la lecture publique (vérifié, pas supposé). La sortir du schéma exposé est une ADR.
4. `owns_review()` appelable par authenticated. Même famille, même ADR à écrire. Elle ne répond que
   sur son appelant, donc ne divulgue rien.
5. `auth_leaked_password_protection` désactivé — **un interrupteur dans la console Supabase**, et il
   compte maintenant que les mots de passe existent.

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

---

## CE QU'IL FAUT CONSTRUIRE, PAR ORDRE

Les items 0 à 3 sont livrés. La numérotation reprend là où elle s'est arrêtée.

### 4. La cave, et ce qu'elle referme — **fin de P2. C'est cette session.**

**Pourquoi la cave avant le reste de P1** : le §9 donne à P2 un critère de sortie mesurable —
« **créer une dégustation et décrémenter la cave de bout en bout** ». La dégustation existe depuis la
PR #7 ; la cave n'existe pas, donc le critère n'est pas tenu et la phase n'est pas finie. Une phase
qu'on quitte avant son critère est une dette qu'on retrouve en production. Si tu préfères l'ordre
inverse, dis-le-moi — les deux chantiers sont indépendants — mais ne le décide pas seul.

**Le schéma du §5.5, à écrire en migration `0008`** :

```
humidors         id, user_id, name, capacity, target_rh, target_temp, is_default
humidor_items    id, humidor_id, cigar_id, qty, purchase_date, purchase_price_eur,
                 currency, vendor_name, box_code, position, aging_start_date, notes
humidor_events   id, item_id, type enum(add|smoke|gift|loss|move|adjust),
                 qty, occurred_at, review_id
humidor_readings id, humidor_id, rh, temp_c, recorded_at, source enum(manual|device)
```

**Quatre points qui méritent d'être tranchés avant la première ligne de SQL, et peut-être une ADR** :

1. **`humidor_events.review_id` est le lien avec le carnet, et c'est lui le critère de sortie.**
   Fumer un cigare depuis la cave doit créer l'entrée de carnet *et* l'événement `smoke`, en une
   seule intention de l'utilisateur. Décide où vit l'atomicité : PostgREST n'offre pas de
   transaction sur deux tables, donc c'est une fonction SQL ou un demi-résultat assumé et lisible.
   L'ADR 0004 a écarté la référence polymorphe ; cette colonne en est la contrepartie, ne la
   transforme pas en `entity_type`.
2. **La portée de l'entrée créée par la cave.** Le défaut du carnet est `private` au titre de
   l'art. 25. Fumer depuis la cave ne doit pas ouvrir une porte que le carnet ferme.
3. **`privacy.show_humidor` vaut `false` par défaut** dans `profile_settings`. La cave est donc
   privée par défaut, et P3 lira ce drapeau. Les policies doivent l'anticiper sans le dupliquer.
4. **`qty` ne se met pas à jour à la main.** Un stock est la somme de ses événements, ou une colonne
   dénormalisée qu'un trigger tient — pas les deux au choix du code appelant. Le §5.5 demande aussi
   l'âge de vieillissement, la valorisation et les alertes de rotation : ce sont des lectures
   dérivées, pas des colonnes.

**À livrer à l'écran** : `/cave` (multi-caves, inventaire, ajout, relevés d'hygrométrie),
décrémentation depuis la fiche cigare et depuis la cave, import/export CSV, et
**`/statistiques`** (F11, que le §9 place en fin de P2) : ce que j'ai fumé, quand, à quel rythme,
mes moyennes — en ne comptant que ce que la RLS me laisse voir, sans filtre TypeScript.

**Rappel qui vaut pour tout ce qui suit** : `pnpm check` doit être dans la **même commande** que le
commit, et la migration doit se terminer par son auto-contrôle RLS.

### 5. Le reste de P1

Contribution wiki (proposer, historique, nouveau, file de validation — `cigar_revisions` est prête
et vide), comparateur 2–4 cigares, décodeur de codes de boîte, `/parametres` (profil, préférences,
confidentialité, consentements, RGPD — la bascule /100 ↔ /20 y déménagera depuis `/carnet`), images
OG, `sitemap.ts`, `types-drift.yml`. **La file wiki est aussi ce qui rouvre `ref.lines`** — voir
`CLAUDE.md`.

### 6. Puis les phases, dans l'ordre du §9

P3 social (`follows`, feed keyset, braises, clubs, événements, messagerie, profils publics — et
c'est là que la branche `followers` du carnet devient vraie) → P4 scan → P5 lieux → P6 éditorial/SEO
→ P7 boutique → P8 modération, i18n, PWA, perf, accessibilité.

Chaque phase a son critère de sortie au §9, **mesuré et non supposé** :

| Phase | Critère |
|---|---|
| P2 | Créer une dégustation et décrémenter la cave de bout en bout |
| P3 | Feed paginé keyset, 0 requête N+1 |
| P4 | Benchmark top-3 ≥ 85 % publié |
| P5 | 200 lieux seedés, recherche 25 km < 200 ms |
| P6 | Lighthouse SEO ≥ 95 |
| P7 | Commande test bout en bout + webhook idempotent |
| P8 | Audit axe-core 0 violation critique |

---

## À ME SIGNALER, PAS À TRANCHER SEUL

- **Le rafraîchissement de `cigar_stats` à l'écriture n'a jamais tourné pour de vrai.** Il est écrit
  et correctement gaté — mesuré : une tentative d'appel par écriture susceptible de bouger une
  moyenne publique, aucune pour les autres, dépublication et suppression comprises — mais la clé de
  service est inaccessible depuis une session distante (voir les pièges). Il échoue proprement :
  l'entrée est enregistrée, seule la fraîcheur est perdue, et `pg_cron` rattrape en cinq minutes.
  **À vérifier au premier déploiement** : publier une entrée et regarder si la moyenne bouge tout de
  suite.
- **Qui modère ?** La Q12 posait deux questions ; le délai est répondu (72 h, publié), celle-là non.
  Pas de back-office avant P8, aucun destinataire nommé, personne pour relever `mod.reports`.
  Tenable tant que rien n'est ouvert au public. **À trancher avant l'ouverture.**
- **Le point de contact DSA des art. 11 et 12 n'est pas publié.** `DSA_CONTACT_EMAIL` est
  délibérément à `null` dans `lib/compliance/dsa.ts` : publier une adresse à un domaine que personne
  ne possède, c'est s'engager à relever une boîte qui n'existe pas. **Une ligne à écrire dès que la
  Q7 aura tranché un domaine.**
- **862 fiches sur 940 n'ont jamais été relues et sont publiques.** Dérogation assumée à
  `PROVENANCE.md` §2, pour la QA. Tenable parce que tout est en `noindex` derrière l'age gate et que
  `supabase/scripts/unpublish.sql` remet tout en brouillon en une commande. **Elles sont désormais
  commentables, notables et signalables** : à rouvrir avant toute mise en ligne réelle.
- **`verified_by` est NULL sur les 940 fiches** : elles ont été publiées avant que les comptes
  n'existent. La traçabilité est dans `public.audit_log`.
- **La page confidentialité n'a pas été relue depuis que le carnet existe**, et elle doit maintenant
  décrire les droits d'export et d'effacement, comment les exercer, **et ce que le carnet
  enregistre** — le §2 range possiblement ces données à l'art. 9. Elle doit aussi dire, comme l'ADR
  0004 l'exige, que **retirer un destinataire ferme l'accès à venir sans défaire une lecture
  passée**. Voir `docs/legal/`.
- **Les sous-notes d'une dégustation sont sur 10, la note globale en est la moyenne**, non
  saisissable. Le §5.4 ne le disait pas : c'est une décision, argumentée dans
  `docs/decisions-log.md`, et elle se défait tant que `reviews` est vide.
- **Les prix** : arrêté du 5 août 2026, applicable au 1er septembre, 900 fiches de 4,00 € à
  750,00 €. Ils périment au prochain arrêté, à peu près mensuel.
- **14 vitoles portent « Dimensions à vérifier »** — 4 fiches en dépendent.
- **`comments_min_role` est à `member`** parce que `contributor` vaut 50 points et que la réputation
  démarre à zéro. À resserrer quand l'inscription s'ouvre.

## NE DEVINE PAS

Les 23 questions de `docs/phase-0/05-questions-ouvertes.md` ont chacune une réponse par défaut.
**Applique le défaut et signale-le**, ou pose la question si le défaut ne tient plus — c'est arrivé
pour la Q12, qui est annotée deux fois. Les quatre règles non négociables sont en tête de
`CLAUDE.md`. Une ambiguïté d'architecture → une ADR + une question. Les ADR 0001 à 0003 attendent
toujours validation ; 0004 et 0005 sont acceptées.

## PIÈGES DE CET ENVIRONNEMENT, APPRIS À NOS DÉPENS

- **`api.supabase.com` est refusé par la politique de sortie** de cette session : impossible de
  récupérer une clé de service (`SUPABASE_SECRET_KEY`). Conséquence pratique : en local, tout ce qui
  passe par la clé de service échoue — rafraîchissement de `cigar_stats`, écriture d'un signalement,
  export RGPD. Le MCP Supabase, lui, fonctionne : il sert à vérifier l'état de la base et à jouer une
  fonction privilégiée à la main. `/api/signalements` répond alors **500 là où la production répond
  201** ; un **404** au même endroit veut dire tout autre chose — que la RLS a refusé de montrer la
  cible — et les deux ne doivent jamais être confondus.
- **La CI n'a pas de base de données.** Elle construit avec une URL Supabase de remplacement, donc
  `/cigares`, `/marques` et `/vitoles` y lèvent une exception. Conséquence non évidente : quand une
  Server Action redirige vers une page dont le fetch RSC échoue, la navigation côté client avorte et
  l'URL ne bouge pas — l'échec ressemble exactement à « le portail ne m'a pas laissé passer ». Tout
  test e2e doit atterrir sur `/primitives` ou sur une page publique sans base. **Rejoue toujours les
  e2e avec identifiants bidon et `CI=1` avant de pousser** : le vert local ne prouve rien ici.
- **Chromium ne joint aucun hôte externe depuis ce conteneur.** Pour parcourir le site en navigateur,
  il faut **le lancer en local** : écrire un `.env.local` avec les vraies clés (URL du projet +
  clé publiable, récupérables par le MCP ; la clé secrète, non), `pnpm build`,
  `pnpm start --port 3100`, puis pointer Playwright sur `127.0.0.1`. `curl` sort normalement.
- **Playwright** : lance avec `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`. Les scripts de
  parcours doivent vivre **dans le dépôt** (`test-results/` est gitignoré) pour que Node résolve
  `@playwright/test`.
- **Les formulaires sont câblés par l'hydratation.** Cliquer « Publier » avant que React n'ait
  attaché l'action ne soumet **rien**, en silence. `networkidle` **ne suffit pas** : il a fallu y
  ajouter ~800 ms d'attente avant chaque interaction pour que les parcours du carnet soient stables.
- **`.eyebrow` met le texte en capitales par CSS.** Un `innerText` renvoie donc « AUCUNE NOTE
  PUBLIQUE » pour un message écrit en prose : compare sans tenir compte de la casse, sinon tu
  passeras une heure à chercher un bug qui n'existe pas.
- **React 19 réinitialise un formulaire après le retour de sa Server Action**, et rend à chaque champ
  le `defaultChecked` qu'il avait **au montage**. Un groupe de radios contrôlé revient donc à sa
  valeur de départ pendant que l'état React reste juste : le DOM ment, et c'est le DOM que le submit
  suivant poste. C'est ce qui republiait une entrée qu'on venait de rendre privée. Voir
  `app/CLAUDE.md` — un groupe de radios dont la valeur vient du serveur doit être **keyé** dessus.
- **Un état dérivé d'une prop se réconcilie pendant le rendu**, jamais dans un effet
  (`set-state-in-effect` interdit le second). Et lire `localStorage` demande `useSyncExternalStore`.
- **Vérifie qu'une modification de fichier a bien été appliquée.** Un remplacement de texte dont le
  motif ne correspond pas ne dit rien et ne change rien : la branche `review` de `isVisibleToCaller`
  a été « écrite » deux fois avant de l'être vraiment, et entre les deux tout signalement d'une
  entrée répondait 404. Relis le fichier, ou `grep` ce que tu viens d'y mettre.
- **Nettoie derrière une vérification.** Les entrées, partages et signalements écrits en parcourant
  le site vivent dans la vraie base. Efface-les avant de rendre la main, sinon la QA humaine commence
  sur un carnet qui n'est pas le sien. `audit_log`, lui, ne s'efface pas : c'est un journal.
- **Un garde-fou qui ne se déclenche qu'à l'exécution se déclenche chez l'utilisateur.**
  `AGE_GATE_SECRET` manquait chez Vercel : le build passait au vert et le site renvoyait une 500 sur
  `/majorite`. La vérification est remontée dans `next.config.ts` et casse désormais le build.
- **Pour les gros payloads SQL**, passe par l'API de gestion en `curl` plutôt que par le MCP.
  Attention : **un appel = une transaction**, donc retire le `begin;`/`commit;` du fichier.
- **`pnpm check` et le commit doivent être dans la MÊME commande** (`&&`).
- **Prettier n'est pas dans la CI** et des dizaines de fichiers ne passent pas `pnpm format:check`.
  Ne lance pas `pnpm format` : tu enterrerais ton diff sous un reformatage.
- **Le classificateur bloque parfois les heredocs `cat >`** ; utilise l'outil Write, ou un script
  Python qui écrit le fichier.
- **`tg_handle_new_user()` dérive le pseudo des 12 premiers caractères hexadécimaux de l'UUID.**
  Deux comptes de test dont les UUID partagent ce préfixe se heurtent sur `profiles_handle_key`.
- **`pkill -f "next"` tue le shell.** Ferme le serveur par son port : `ss -lptn 'sport = :3100'`,
  ou par `ps aux | grep next-server`.

### Pièges SQL propres à ce dépôt — lis `supabase/CLAUDE.md` en entier

- `SET LOCAL ROLE` hors transaction est ignoré en silence : l'assertion tourne en superutilisateur
  et passe pour rien. Chaque assertion vit dans un bloc `do $$ … $$`.
- Une assertion dont la donnée de test n'existe pas réussit sans rien tester. Prouve d'abord que la
  ligne existe, en contexte privilégié.
- **Un UPDATE qu'une policy refuse n'échoue pas** : il ne trouve aucune ligne et rapporte zéro.
  Traiter zéro comme un succès affiche une confirmation sur un enregistrement qui n'a pas eu lieu.
- **Un `GRANT` de colonne refuse aussi les colonnes qu'on ne voulait pas changer.** La bascule
  /100 ↔ /20 n'a rien fait pendant toute sa première journée parce que l'action écrivait
  `updated_at`, hors du grant. **Lis le résultat d'une écriture, toujours.**
- Une policy qui interroge une table interroge aussi **ses droits** : découpe par rôle.
- Deux policies qui se lisent l'une l'autre, c'est une récursion — **même sans boucle de données**.
- `alter default privileges` est **par schéma**, et **l'amorçage de Supabase aussi**.
  **`BYPASSRLS` ne dit rien des droits de table.**
- **L'auto-contrôle d'une migration ne peut pas attraper ce qu'elle vient de corriger.** La garde qui
  mord vit dans `supabase/tests/`, et n'accorde rien.
- **PostgreSQL analyse une condition d'un seul tenant**, court-circuit compris. Un `if` imbriqué, ou
  un `execute`, diffère l'analyse.
- Une vue matérialisée n'accepte pas de RLS.

---

## LES URL À OUVRIR POUR RECETTER LE CARNET (déjà livré)

Connecté avec `test_un` (`test1@cigardeur.com` / `cigardeur`), un second onglet avec `test_deux`.

| URL | Ce qu'on doit y voir |
|---|---|
| `/cigares/undercrown-10-robusto` | « Notes des membres » en état vide (invitation, pas un tiret), « Entrées de carnet », puis « Noter ce cigare » avec les quatre portées et **« Moi seul » présélectionné**. |
| ⟶ choisir « Mes abonnés » | Deux phrases : l'audience est vivante, et l'abonnement n'existe pas encore — donc personne ne lit. |
| ⟶ choisir « Tout le monde » | « Seules les entrées publiques entrent dans la moyenne d'un cigare. » |
| ⟶ enregistrer une note privée | « Entrée enregistrée », l'entrée apparaît marquée « Votre entrée », et la moyenne **reste vide**. |
| ⟶ enregistrer sans note ni texte | « Une entrée de carnet demande au moins une note ou un commentaire. » |
| `/carnet` | L'entrée, sa fiche, son badge « MOI SEUL ». Filtres par nature et par portée. |
| ⟶ « Sur 20 » | 88/100 devient **17,6/20** partout. « Sur 100 » revient. |
| `/cigares/undercrown-10-toro/degustation` | Six critères, et « Notez les six critères pour obtenir la note globale » tant qu'il en manque un. Les six à 8 → **80/100**, calculé, non saisissable. |
| ⟶ la roue | Onze familles autour, les descripteurs de la famille choisie à l'intérieur. Changer de famille **garde** les choix précédents. |
| ⟶ le minuteur | Démarrer, puis « Durée » : le champ se remplit (jamais 0, que la base refuserait). |
| ⟶ recharger à mi-saisie | « Un brouillon a été retrouvé sur cet appareil et rechargé. » Tout revient, arômes compris. |
| ⟶ enregistrer en « Tout le monde » | On arrive **sur l'entrée**, avec ses six critères sur 10, ses trois tiers, ses arômes, son contexte. |
| `/cigares/undercrown-10-toro` | Note pondérée en tête, moyenne simple à côté, répartition, « Ne comptent ici que les entrées publiques ». |
| `/carnet/<id>` d'une entrée à soi | Éditeur, « Personnes nommées », Supprimer. Portée → « Des personnes que je nomme », chercher `test_deux`, « Nommer ». |
| **En `test_deux`** : le même `/carnet/<id>` | L'entrée s'ouvre, **sans** éditeur, **sans** panneau de partage, **avec** « Signaler cette entrée ». |
| **En `test_deux`** : `/carnet` | L'entrée sous « Partagé avec moi ». |
| ⟶ `test_un` retire le partage | En `test_deux`, l'entrée disparaît et son URL redevient une 404. |
| Une entrée privée d'autrui, par son URL | 404 — jamais « accès refusé », qui confirmerait qu'elle existe. |
| `/carnet` en navigation privée | Renvoie vers `/connexion`. |

---

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

Le seed écrit aussi dans `public` (la roue des arômes, section 6) : sur une base nue, appliquer
**0003 avant `seed.sql`**, faute de quoi la table est absente.

Commandes du projet : `pnpm dev`, `pnpm check` (le portail avant commit), `pnpm test:e2e`
(exige un `pnpm build` préalable), `pnpm storybook`.
