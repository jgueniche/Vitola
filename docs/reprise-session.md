# Vitola — prompt de reprise

> À copier tel quel au démarrage de la prochaine session. Il contient l'état complet de la base :
> **aucune requête n'est nécessaire pour la découvrir**. Réécrit dans la nuit du 22 au 23 août 2026,
> après la cave et le reste de P1. **P2 est fermée, P1 aussi ; la prochaine est P3.**

---

Reprise du projet Vitola. Le contexte est dans le dépôt : lis `CLAUDE.md`, `BRIEF.md`, puis
`docs/decisions-log.md` (les dix sections — la première est de la session précédente),
`docs/adr/` (0004, 0005 et 0006 sont **Acceptées**), `supabase/seed/PROVENANCE.md` et
`docs/phase-0/05-questions-ouvertes.md`. Un `CLAUDE.md` par domaine complète le racine :
`app/`, `lib/`, `supabase/` — les trois ont été enrichis par la dernière session et leurs nouveaux
paragraphes sont exactement ceux qu'on regrette de ne pas avoir lus.

**Branche de travail** : celle qui t'est assignée, à créer depuis `master`, **qui contient tout le
travail décrit ici** (PR #9 fusionnée le 23 août 2026). Vérifie d'un coup d'œil plutôt que de
supposer : `git log --oneline origin/master -3` doit montrer la fusion de #9, et `/api/health` sert
le commit réellement déployé.

Le code du dépôt et l'état de la base concordent : **neuf migrations**, toutes dans
`supabase/migrations/` **et** appliquées sur le projet. Le carnet n'en a demandé aucune — la 0003
avait tout prévu, ce qui est la meilleure chose qu'on puisse dire d'une ADR écrite avant le SQL. La
cave en a demandé une, la 0008, et ses six empreintes de schéma ont été comparées entre le fichier
et le projet plutôt que supposées égales. La 0009 n'était prévue nulle part : elle répare un
garde-fou qui, depuis la 0002, interdisait à **tout** membre de modifier son propre profil.

Et cette concordance n'est plus une promesse : `tooling/scripts/check-types-drift.ts` compare, à
chaque CI, l'inventaire des objets exposés à `lib/supabase/database.types.ts`, **dans les deux
sens** — une table absente des types échoue, un type décrivant une table disparue aussi. La dérive
s'est produite deux fois en une soirée avant d'être outillée.

**Vérifie la branche plutôt que de la supposer.** La branche assignée à la session précédente
pointait sur un commit vieux de deux PR : `git log --oneline -3` affichait la fusion de #2 là où
`origin/master` en était à #8. Recréer la branche depuis `master` a pris trente secondes ; bâtir
dessus sans regarder aurait coûté la session.

Une chose à savoir sur l'ordre des choses : **une migration additive peut précéder son écran,
l'inverse est un 500.** Les 0006 et 0007 ont vécu quelques heures appliquées en base pendant que
`master` n'avait pas encore leurs fichiers, sans conséquence — elles n'ajoutaient que des fonctions,
des droits et du contenu que le code d'alors ne lisait pas. Livrer l'écran d'abord n'aurait pas
pardonné.

## OBJECTIF : AMENER LE SITE À SA VERSION DÉFINITIVE

**La v1 du brief, phases P2 à P8 comprises.** C'est plusieurs sessions ; l'ordre est donné plus bas.
Il n'est pas négociable sans me le dire, parce que chaque phase ouvre la suivante et qu'une phase
qu'on quitte avant son critère de sortie est une dette qu'on ne retrouve qu'en production.

**Le rythme attendu : enchaîne.** Ne t'arrête pas au premier item livré pour me demander la suite.
Prends l'item 4, livre-le en entier — écrans compris, parcourus, nettoyés derrière —, puis passe au
5, puis au 6, jusqu'à ce que la session soit pleine. Un item est fini quand il est **parcourable et
parcouru**, pas quand il compile. Commite par item, avec `pnpm check` dans la même commande, pour
que ce qui est fait reste acquis même si la session s'arrête au milieu du suivant.

Deux choses seulement doivent m'être posées avant d'être décidées : ce qui est listé sous
« À me signaler », et toute ambiguïté d'architecture — laquelle vaut une ADR, pas un choix rapide.
Tout le reste : applique le défaut documenté et signale-le dans ton compte rendu.

**La QA est humaine, directement sur le front.** Conséquence sur ta façon de travailler :

- Une phase n'est livrée que si elle est **parcourable dans un navigateur** par une personne
  connectée. Un schéma sans écran ne compte pas. Un endpoint sans bouton non plus.
- Chaque livraison se termine par **la liste des URL à ouvrir et ce qu'on doit y voir**, comptes de
  QA à l'appui. C'est le livrable qui remplace la relecture de base.
- Un état vide est un écran, pas une erreur : le §4.6 en fait une invitation.
- Ne me demande pas de vérifier la base. Je vérifie par le site.
- **Un droit, une obligation légale ou un écran qui écrit se parcourt une fois avec un vrai compte
  avant d'être déclaré livré.** Compiler ne prouve rien, et deux sessions de suite l'ont payé : sept
  bugs sont passés à travers un `pnpm check` vert, 247 tests unitaires, 56 e2e et toutes les
  assertions SQL du dépôt.
  Aucun n'était visible d'un compilateur ; la plupart ne se voient pas non plus en relisant le code.
  Le pire des sept — **aucun membre ne pouvait modifier son profil** — dormait depuis la migration
  0002, et il a suffi d'ouvrir `/parametres` avec un vrai compte pour le voir en dix secondes.

---

## ÉTAT AU 23 AOÛT 2026, FIN DE SESSION

`master` est la branche de production et **Vercel déploie bien depuis `master`**. `/api/health` sert
le commit déployé (`{"status":"ok","phase":"P1","commit":"…"}`) : c'est le moyen le plus rapide de
savoir ce qui tourne. Chaque branche poussée reçoit une préversion Vercel, protégée par
l'authentification Vercel.

PR #1 à #9 fusionnées. La #7 a porté le carnet du fumeur (P2, première moitié) ; la #9 a porté la
cave, les statistiques et tout le reste de P1 — la cave **ferme le critère de sortie de P2**, le
reste **ferme P1**.

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
- **La cave (P2, seconde moitié)** — **42 assertions de parcours, deux comptes, deux onglets,
  contre la vraie base, 0 échec** :
  - `/cave` — plusieurs caves, ce qu'elles tiennent, leur valorisation, ce qui est à faire tourner ;
  - `/cave/[id]` — inventaire par lot (âge, maturité, valeur, emplacement), grand livre en ajout
    seul, hygrométrie, import **et** export CSV, réglages et suppression ;
  - « j'en fume un » depuis la fiche cigare **et** depuis la cave : une seule transaction écrit
    l'entrée de carnet et l'événement `smoke` (`public.smoke_from_humidor()`, ADR 0006) ;
  - un lot facultatif à décompter depuis le formulaire de dégustation, et sur l'entrée la mention
    « pas encore décomptée de votre cave » avec le bouton qui ferme l'écart ;
  - **`/statistiques` (F11)** : entrées, cigares fumés, note moyenne, rythme sur douze mois, les
    cigares qui reviennent, ce qui reste en cave.
- **Le reste de P1** — **75 assertions de parcours sur trois fichiers, deux comptes, 0 échec** :
  - **`/parametres`** — profil (pseudo, nom affiché, pays, ville, bio, découvrabilité), préférences
    (échelle /100 ↔ /20 **déménagée depuis `/carnet`**, unité de longueur, résumé courriel),
    confidentialité (cave, entrées, pays), consentements datés, export et effacement RGPD derrière
    une confirmation écrite. C'est aussi cet écran qui a révélé la 0009 : **personne ne pouvait
    enregistrer son profil**, et rien dans le dépôt ne le disait.
  - **La contribution wiki** — `/cigares/[slug]/proposer` part des valeurs de la fiche et n'envoie
    que le **diff** ; `/contributions` est la file, ouverte aux `editor` et au-dessus, avec le
    garde-fou qu'un wiki demande vraiment : une proposition dont la fiche a bougé depuis est
    signalée **champ par champ** plutôt qu'appliquée par-dessus ; `/cigares/[slug]/historique`
    montre les propositions et leur sort.
  - **`/cigares/comparer`** — 2 à 4 cigares côte à côte, la sélection dans l'URL donc partageable.
  - **`/codes-de-boite`** — le décodeur, qui **refuse de deviner** : deux chiffres d'année sont
    rendus ambigus (1998 ou 2018 ?) et le disent, une lettre d'usine inconnue est dite inconnue.
  - **`sitemap.ts` et une carte OG unique**, à la racine, **toutes deux devant le portail et sans un
    seul nom de marque** — `tests/compliance/seo.test.ts` échoue si l'une d'elles en nomme un.
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

Projet `vitola`, ref `upbewqsmgcrogoapubyz`, région `eu-west-3` (Paris). **Neuf migrations**
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
| `0008` | `cave` | `supabase/migrations/0008_cave.sql` |
| `0009` | `profile_guard` | `supabase/migrations/0009_profile_guard.sql` |

**Les deux dernières sont enregistrées sous un horodatage**, pas sous `0008` / `0009` :
`20260822222420` et `20260822232400`. C'est l'outil d'application qui numérote, pas le fichier.
`list_migrations` affiche donc des versions qui ne ressemblent pas au dépôt, et c'est normal —
l'ordre et le contenu sont les bons.

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
                                   public.humidors             0
                                   public.humidor_items        0
                                   public.humidor_events       0
                                   public.humidor_readings     0
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

### Policies RLS — 88 au total, toutes les tables couvertes

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
public.humidors          4  select_own, insert_own, update_own, delete_own
public.humidor_items     4  · public.humidor_events 2 (ajout seul) · public.humidor_readings 3
```

**La cave est strictement propriétaire en v1.** Les trois tables filles rejoignent `humidors` par
un `EXISTS`, et P3 **ajoutera** une policy pour `privacy.show_humidor` plutôt que d'en modifier une
— comme pour `reviews`. Piège consigné d'avance dans l'ADR 0006 : `profile_settings` n'est lisible
que de son propriétaire, donc lire `privacy->>'show_humidor'` chez quelqu'un d'autre ne renverra
jamais rien. Ce sera un troisième accesseur `SECURITY DEFINER`, après `current_app_role()` et
`owns_review()`.

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
| `public.humidor_event_delta(type,int)` | non | ✗ | ✓ | ✓ |
| `public.smoke_from_humidor(uuid,int,date,visibility,numeric,text)` | **non — INVOKER** | ✗ | ✓ | ✓ |

**`public.is_privileged_context()` a été supprimée par la 0009, et c'est le bug le plus cher de la
session.** Elle était `SECURITY INVOKER` et n'était accordée à personne — la 0002 le voulait ainsi,
puisqu'elle sert à savoir si l'on tourne en `postgres`. Mais un trigger `INVOKER` sur `profiles`
l'appelait, donc **tout `update` sur son propre profil rendait `permission denied for function
is_privileged_context`**. Aucun test ne le voyait : les tests SQL tournent en `postgres`, qui a le
droit. Il a fallu ouvrir `/parametres` dans un navigateur avec un vrai compte. La 0009 inline le
prédicat dans le trigger et supprime la fonction ; les deux réparations plus faciles ont été
refusées et l'auto-contrôle de la migration interdit qu'elles reviennent — lui accorder `EXECUTE`
défaisait la décision de la 0002, la passer en `DEFINER` mettait `current_user` à `postgres` et
**désarmait le garde-fou entièrement**. `supabase/tests/08_profile_guard.sql` (6 assertions) échoue
sur le schéma non réparé, avec l'erreur exacte de la production.

`smoke_from_humidor()` est la seule fonction du dépôt qui écrive deux tables, et **elle n'a aucun
privilège**. C'est la décision D1 de l'ADR 0006 : un appel PostgREST est une transaction, donc les
droits d'appelant suffisent et la RLS reste seule juge. L'auto-contrôle de 0008 échoue si elle
repasse un jour en `SECURITY DEFINER`. Ne la « durcis » pas : ce serait l'affaiblir.

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

**Les items 0 à 5 sont livrés.** Ils restent ci-dessous, barrés, parce que ce qu'ils ont tranché en
chemin ne se retrouve nulle part ailleurs. La suite commence à l'item 6.

### ~~4. La cave, et ce qu'elle referme~~ — **livrée le 22 août 2026 au soir**

Migration `0008`, ADR 0006, `supabase/tests/07_cave_rls.sql` (17 assertions), écrans parcourus
(42 assertions, deux comptes, deux onglets). **Le critère de sortie de P2 est tenu** : on crée une
dégustation et on décrémente la cave de bout en bout, dans un navigateur, avec un vrai compte.

Les quatre points que le prompt demandait de trancher le sont, dans l'ADR 0006 — atomicité par
fonction `SECURITY INVOKER`, portée `private` par défaut, policies propriétaires qui anticipent
`show_humidor` sans le mentionner, `qty` tenue par un trigger et hors de tout `GRANT UPDATE`. Deux
choix ont été ajoutés en construisant et sont argumentés au même endroit : **fumer sans rien noter
n'écrit pas d'entrée** (l'événement est le registre ; exiger une note pour décompter un stock
produirait des notes inventées), et **un lot par achat** plutôt qu'un lot par cigare (deux boîtes
n'ont ni le même âge ni le même prix).

Reste en dette, petit et nommé : `move` et `device` existent dans leurs enums sans être offerts —
déplacer un lot est un `update` de `humidor_id` que le trigger consigne, et un capteur n'a pas de
session, donc pas de porte (c'est l'ADR de l'authentification d'un appareil, pas celle de la cave).

### ~~5. Le reste de P1~~ — **livré dans la nuit du 22 au 23 août 2026**

`/parametres`, la contribution wiki (proposer, historique, file de validation), le comparateur, le
décodeur de codes de boîte, la carte OG, `sitemap.ts` et le contrôle de dérive des types — les
détails sont plus haut, les URL à ouvrir plus bas. Migration `0009` en prime, non prévue.

**Trois choses ont été délibérément laissées de côté, et il faut les savoir avant de les croire
faites** :

- **Proposer une fiche entièrement nouvelle** n'existe pas. `cigar_revisions` porte un `cigar_id`
  non nul : une proposition est un diff **sur une fiche**, jamais une fiche. Créer une fiche
  ex nihilo demande soit une colonne nullable et une policy qui distingue les deux cas, soit une
  table à part. C'est un choix de schéma, donc une ADR — pas une décision à prendre en passant un
  vendredi soir.
- **Proposer une ligne (`ref.lines`)** non plus, pour la même raison en pire : la table est vide par
  **décision de v1**, avec son déclencheur écrit dans `CLAUDE.md`. La file wiki est bien ce qui la
  rouvrira, mais la rouvrir est le geste qui annule une décision documentée. Elle se relit d'abord.
- **`show_indicative_prices` reste à `false` et rien ne le lit.** `lib/flags.ts` sait l'interroger,
  `msrp_eur` est en base sur 900 fiches, et aucun écran ne l'affiche. C'est la Q19, et c'est un
  drapeau qui attend une réponse, pas un branchement oublié.

### 6. Les phases, dans l'ordre du §9 — **commence par là, à P3**

P3 social (`follows`, feed keyset, braises, clubs, événements, messagerie, profils publics) → P4
scan → P5 lieux → P6 éditorial/SEO → P7 boutique → P8 modération, i18n, PWA, perf, accessibilité.

**P3 a trois dettes qui l'attendent, toutes nommées et toutes prêtes**, et c'est la raison pour
laquelle elle vient maintenant plutôt que plus tard :

1. **La branche `followers` de la policy SELECT de `reviews` n'existe pas** — elle attend
   `public.follows`. Une entrée « Mes abonnés » n'est donc lisible aujourd'hui que de son auteur, et
   l'interface le **dit** en toutes lettres. `tests/unit/reviews-model.test.ts` échoue le jour où la
   branche apparaît : l'avertissement doit partir dans le même commit. C'est voulu.
2. **`privacy.show_humidor` est écrit, réglable dans `/parametres`, et rien ne le lit.** La cave est
   strictement propriétaire ; le drapeau attend sa policy. Le piège est consigné d'avance dans
   l'ADR 0006 : `profile_settings` n'est lisible que de son propriétaire, donc lire
   `privacy->>'show_humidor'` chez autrui ne renverra **jamais** rien. Il faudra un troisième
   accesseur `SECURITY DEFINER`, après `current_app_role()` et `owns_review()`. On **ajoute** une
   policy, on n'en modifie aucune.
3. **`privacy.show_reviews` et `show_country` ont le même statut** : réglables, honorés nulle part,
   parce que rien ne lit encore le profil d'autrui. Le jour où un profil public existe, ce sont ces
   trois clés qui décident de ce qu'il montre — et `is_discoverable`, lui, est déjà honoré.

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

- **Un membre ne pouvait pas modifier son profil, et personne ne l'avait vu.** Réparé par la 0009 ;
  le détail est dans « Fonctions appelables ». Ce qu'il faut en retenir n'est pas le correctif, c'est
  la façon dont il a été trouvé : en ouvrant un écran. Le dépôt avait `pnpm check` vert, 247 tests
  unitaires, 56 e2e et toutes ses assertions SQL, et **aucun ne pouvait le voir** : les tests SQL
  tournent en `postgres`, qui a le droit que personne d'autre n'a. **Il n'existe pas d'autre méthode
  que d'ouvrir la page avec un vrai compte.**
- **Qui peut valider une contribution wiki ?** J'ai appliqué le §6 du brief — `editor` et au-dessus —
  et il n'existe aujourd'hui **aucun compte `editor`** : `jeremy` est `admin` (donc il passe),
  `test_un` et `test_deux` sont `member`. La file est donc réservée à un seul compte. C'est le bon
  défaut pour un dépôt fermé et une impasse le jour où quelqu'un contribue. **À trancher avant
  l'ouverture** : qui promeut, sur quel critère, et par quel écran — parce qu'il n'y en a aucun,
  passer quelqu'un `editor` est aujourd'hui un `update` à la main.
- **Proposer une fiche entièrement nouvelle n'existe pas**, et rouvrir `ref.lines` non plus. Les
  deux raisons sont sous l'item 5 : ce sont des décisions de schéma, pas des écrans manquants.
  **À me dire si l'une des deux est attendue en v1**, parce que chacune vaut une ADR.
- **`show_indicative_prices` est réglable et rien ne le lit** (Q19). Les 900 prix sont en base,
  `lib/flags.ts` sait interroger le drapeau, aucun écran n'affiche `msrp_eur`. Afficher un prix de
  tabac est exactement le genre de geste que le §2 regarde de près : je ne l'ai pas branché seul.
- **Trois clés de confidentialité sont réglables et honorées nulle part** — `show_humidor`,
  `show_reviews`, `show_country`. Ce n'est pas un oubli, c'est P3 : rien ne lit encore le profil de
  quelqu'un d'autre. Mais **l'écran promet aujourd'hui quelque chose que le code ne tient pas
  encore**, et si cela devait déranger, la réponse est de retirer les interrupteurs, pas d'attendre.
  `is_discoverable`, lui, est bien honoré depuis P1.
- **La cave est livrée mais n'a jamais servi d'un déploiement.** Tout ce qui est décrit plus haut a
  été parcouru **en local**, contre la vraie base : c'est le seul moyen dont dispose une session
  distante, Chromium ne joignant aucun hôte externe depuis ce conteneur. Ce qui reste à vérifier
  une fois déployé tient en deux gestes — ranger un lot, en fumer un — et en une observation : la
  moyenne publique doit bouger tout de suite si l'entrée est publique (voir le point suivant).
- **La granularité de « fumer » depuis la fiche cigare est un choix, pas une limite.** Quand on
  possède plusieurs lots du même cigare, la fiche tire du **plus ancien** sans demander lequel.
  C'est le bon défaut — c'est ce que veut dire FIFO dans une cave — mais quelqu'un qui garde deux
  boîtes d'âges très différents voudra peut-être choisir. La cave, elle, le permet déjà. **À me
  dire si le défaut ne convient pas.**
- **Le mot de passe des comptes de QA est dans le dépôt**, dans ce fichier et comme valeur par
  défaut des quatre fichiers de `tooling/parcours/` (surchargeable par `PARCOURS_PASSWORD`). Tenable
  tant que rien n'est ouvert et que le projet n'est pas en production réelle. **À changer avant
  l'ouverture**, en même temps que les 862 fiches non relues.
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
- **La page confidentialité n'a pas été relue depuis que le carnet existe**, et **la cave puis les
  paramètres n'ont fait qu'allonger la liste** : la cave enregistre ce qu'on possède, ce qu'on a payé
  et quand on l'a fumé. `/parametres` affiche en outre le **registre des consentements** et la base
  légale de chacun des six `consent_kind` — et il est vide, délibérément : trois d'entre eux ne
  relèvent pas du consentement (art. 6.1.b et 6.1.c), les trois autres sont facultatifs et **n'ont
  pas lieu**. La page l'écrit. Mais elle **renvoie** à une politique de confidentialité qui, elle,
  ne décrit toujours ni le carnet, ni la cave, ni ces bases légales.
  Les quatre tables sont bien dans l'export RGPD — vérifié par le test d'inventaire, qui a d'ailleurs
  cassé le build jusqu'à ce qu'elles y soient — mais la page ne les décrit pas. Elle doit décrire
  les droits d'export et d'effacement, comment les exercer, **et ce que le carnet
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
- **`page.request` de Playwright ne porte pas les cookies du contexte.** Mesuré : il prend un 307
  vers le portail même sur `/cave`, alors que la page rend parfaitement. Une route qui répond un
  fichier se teste donc **en cliquant** — `page.waitForEvent('download')` — et pas en la requêtant.
- **Une assertion qui lit la page une fois court après le serveur.** Une Server Action renvoie
  *avant* que le rendu de `revalidatePath` n'arrive : `networkidle` plus une attente fixe ne suffit
  pas. `tooling/parcours/cave.ts` a un helper `seen()` qui **attend** le texte ; deux assertions ont
  échoué sur un produit qui marchait, et une troisième a réussi pour rien (`contains(texte, '5')`
  trouvait « 0 / 50 »).
- **Une assertion qui cherche un mot dans la page trouve la prose de la page.** `contains(texte,
  'Enregistré')` réussissait sur la phrase « ne change ce qui est enregistré », donc **trois
  écritures refusées ont été lues comme des succès**. La réparation n'est pas une expression
  régulière plus fine : c'est `FieldStatus`, un `role="status"` que les confirmations portent
  désormais toutes. Un parcours attend un **rôle**, jamais un mot. Effet de bord, et il est la vraie
  raison de le faire : un lecteur d'écran annonce enfin « Enregistré ».
- **Une action qui fait disparaître son propre formulaire ne peut rendre aucune confirmation.**
  Accepter une proposition la retire de la file, donc le composant qui tenait l'état de retour est
  démonté dans le même rendu : le relecteur ne voyait **rien**. Mesuré, pas supposé. La décision
  navigue maintenant (`redirect('?decidee=…')`) et la confirmation est sur la page d'arrivée.
- **Sans `metadataBase`, Next résout `og:image` contre `localhost:3000`** — y compris dans un build
  de production. Toute carte partagée pointait donc vers une machine qui n'existe pas. L'origine se
  décide dans `lib/site.ts`, qui **refuse délibérément `VERCEL_URL`** (l'URL unique d'un
  déploiement, qui change à chaque poussée) et n'écoute jamais un en-tête de requête.
- **Le `matcher` du middleware gate aussi ce qu'aucun humain ne demande.** `/opengraph-image`
  répondait 307 vers le portail : un aperçu de lien ne franchit pas un age gate, donc chaque
  partage ne montrait rien. Trois fichiers doivent en sortir — `robots.txt`, `sitemap.xml`,
  `opengraph-image` — et **seulement** parce qu'aucun ne nomme de marque.
- **`page.once('dialog')` rate le dialogue qui suit.** Une suppression confirmée par `window.confirm`
  laissait une cave derrière elle une fois sur trois, donc le nettoyage n'était pas fiable — et un
  nettoyage qui échoue en silence est pire que pas de nettoyage. `page.on('dialog')`, persistant,
  plus un `waitForURL` sur la page d'arrivée.
- **Un `<input type="number" max=…>` empêche le submit**, donc le message d'erreur du serveur
  n'apparaît jamais par le chemin normal. Pour tester un refus serveur, il faut le rendre **périmé**
  — ouvrir un panneau, changer l'état ailleurs, puis valider — et c'est le seul chemin qu'aucun test
  unitaire n'atteint.

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

## LES URL À OUVRIR POUR RECETTER LA CAVE (livré le 22 août au soir)

Connecté avec `test_un` (`test1@cigardeur.com` / `cigardeur`). **La base est vide de caves** : le
parcours a nettoyé derrière lui, donc tout commence par un état vide, qui est un écran.

| URL | Ce qu'on doit y voir |
|---|---|
| `/cave` | « Votre cave est vide », en invitation, et le formulaire « Nouvelle cave » en dessous. |
| ⟶ créer « Cave du salon », capacité 50, hygrométrie 69 | La cave apparaît, marquée **Par défaut** — la première l'est toujours, quoi qu'on coche. |
| `/cave/<id>` | « Cette cave est vide », la jauge à `0 / 50`, la recherche de cigare. |
| ⟶ chercher « undercrown », puis « Mettre en cave » | Le formulaire de lot : seule la quantité est requise. Mettre 5, prix 12,50 €, **vieillit depuis le 2024-01-15** (antérieur à l'achat : c'est permis, et c'est le cas d'une boîte achetée vieillie). |
| ⟶ retour sur la cave | `5 / 50`, la valeur `62,50 €`, l'âge en mois, la maturité, et « À faire tourner » si le lot dort depuis plus de dix-huit mois. |
| ⟶ cliquer le lot | Le panneau s'ouvre **dans l'URL** (`?lot=…`) : grand livre avec « Entrée en cave », puis « J'en fume un », puis les autres mouvements. |
| ⟶ « J'en fume un » avec une note et un mot | « Décompté, et noté au carnet », avec le lien vers l'entrée. Le stock passe à `4 / 50`. |
| ⟶ « J'en fume un » **sans rien saisir** | « Décompté de votre cave » — et **aucune entrée** n'est créée. C'est voulu : voir l'ADR 0006, D2. |
| ⟶ ouvrir le panneau, puis fumer depuis un second onglet, puis valider le premier | « Il n'en reste que N » — le refus du serveur sur une demande périmée. Le seul chemin qu'aucun test unitaire n'atteint. |
| ⟶ relever 66,5 % / 19 °C | Le relevé s'affiche, et l'écart avec la cible est dit en toutes lettres. |
| ⟶ « Exporter ma cave (CSV) » | Un fichier `vitola-cave.csv`, en-tête `cigar_slug,qty,…`. **Aucun identifiant interne** : un uuid ne veut rien dire ailleurs qu'ici. |
| ⟶ importer un CSV avec un slug inconnu | L'identifiant fautif est **nommé**, et rien n'est importé. Un import qui saute quatre lignes sur quarante est le pire résultat possible. |
| `/cigares/undercrown-10-robusto` | « Dans votre cave », le compte, et « J'en fume un » qui tire du lot le plus ancien. |
| `/cigares/<slug>/degustation` | Un sélecteur « Depuis quel lot », facultatif, sous les arômes. |
| `/carnet/<id>` d'une dégustation non décomptée | « Pas encore décomptée de votre cave » et le bouton qui le fait. |
| `/statistiques` | Entrées, cigares fumés (**plus grand** que les entrées, et la page dit pourquoi), note moyenne, rythme sur douze mois, ce qui reste en cave. |
| La cave d'autrui, par son URL | 404 — jamais « accès refusé », qui confirmerait qu'elle existe. |

---

## LES URL À OUVRIR POUR RECETTER LA FIN DE P1 (livrée dans la nuit du 22 au 23 août)

Connecté avec `test_un`. La file de validation demande `jeremy`, seul compte au-dessus de `member`.

| URL | Ce qu'on doit y voir |
|---|---|
| `/parametres` | Quatre sections : profil, préférences, confidentialité, consentements. Puis « Vos données » : export et effacement. |
| ⟶ changer le nom affiché, enregistrer | **« Enregistré. »** C'est l'assertion qui comptait le plus de la soirée : avant la 0009, ce bouton renvoyait `permission denied for function is_privileged_context`. |
| ⟶ mettre le pseudo `TEST_UN` | Refus : le pseudo est en minuscules, underscore permis, tiret non. Le refus se lit **sous le champ**. |
| ⟶ décocher « Apparaître dans les recherches » | Enregistré. Le profil disparaît alors des recherches de destinataires du carnet — c'est le seul des quatre interrupteurs de confidentialité qui **soit honoré aujourd'hui**, et la page ne prétend pas le contraire pour les autres. |
| ⟶ passer l'échelle sur 20 | Enregistré ici, et `/carnet` affiche désormais /20 — c'est le même réglage, déménagé. `/carnet` garde une ligne qui dit laquelle est en vigueur, avec le lien qui revient ici. |
| ⟶ la section Consentements | « Le registre est vide », et pour chaque type sa base légale. Trois disent « Ce traitement n'a pas lieu aujourd'hui. La case arrivera avec lui. » **Aucune case à cocher, et c'est la décision.** |
| ⟶ « Télécharger mes données » | Un JSON, `Cache-Control: no-store, private`, 22 sources. |
| ⟶ « Supprimer mon compte » | Le bouton reste inerte tant que le mot demandé n'est pas saisi **exactement**. Ne pas aller au bout avec un compte de QA qu'on veut garder. |
| `/cigares/undercrown-10-robusto` | En bas de fiche, « Proposer une correction ». |
| `/cigares/undercrown-10-robusto/proposer` | Les champs **pré-remplis avec les valeurs actuelles**. Changer la longueur, laisser le reste. |
| ⟶ envoyer | « Proposition envoyée. » Elle ne porte **que** le champ changé : c'est un diff, pas une copie de la fiche. |
| `/cigares/undercrown-10-robusto/historique` | La proposition, « En attente », son auteur, sa date, et le détail avant → après. |
| **En `jeremy`** : `/contributions` | La file, la plus ancienne en tête, avec le diff et les deux boutons. |
| ⟶ Accepter | On **navigue** vers `/contributions?decidee=…` et une bande `role="status"` dit ce qui vient d'être fait — la confirmation ne peut pas vivre dans un formulaire qui vient de disparaître. La fiche porte la nouvelle valeur. |
| ⟶ proposer, puis changer la fiche, puis ouvrir la file | **« La fiche a changé depuis »**, champ par champ. Le garde-fou d'un wiki : on n'écrase pas une modification qu'on n'a pas vue. |
| **En `test_un`** : `/contributions` | Ses propres propositions, oui. La file, non : à sa place, « La file est réservée aux relecteurs » et comment on le devient. **Cacher la section aurait fait ressembler la contribution à une impasse** — c'est l'inverse de ce que veut un wiki. |
| `/cigares/comparer?c=<slug>&c=<slug>` | Deux colonnes alignées ligne à ligne. Ajouter jusqu'à quatre ; la sélection est **dans l'URL**, donc partageable. |
| `/codes-de-boite` | Le décodeur. `EL OCT 18` → **El Laguito**, octobre, et l'année **marquée ambiguë** : deux chiffres ne disent pas 1998 plutôt que 2018. |
| ⟶ `MSU OCT 18` | « Usine inconnue » — pas une hypothèse. Les six sigles connus sont en base (`BM`, `EL`, `FPG`, `FR`, `HM`, `JM`), chacun avec la réserve que les codes cubains ont été volontairement modifiés. Deviner une manufacture à partir de trois lettres est exactement ce qu'un référentiel ne doit pas faire. |
| `/sitemap.xml` | Six URL, **toutes publiques et toutes des pages**, aucune fiche, aucune marque, et l'origine est le vrai domaine — jamais `localhost`. |
| `/robots.txt` | `Disallow: /` partout. Tant que la Q1 n'est pas tranchée, rien n'est indexable. |
| `/opengraph-image` | Une carte neutre : le nom du site, sa promesse, l'avertissement sanitaire. **Aucun cigare, aucune marque** — elle voyage plus loin que la page. |

---

## REJOUER TOUS LES PARCOURS

Chacun se rejoue d'une commande, contre la vraie base, et **nettoie derrière lui** :

```bash
pnpm build && pnpm start --port 3100
pnpm tsx tooling/parcours/cave.ts            # 42 assertions
pnpm tsx tooling/parcours/parametres.ts      # 25 assertions
pnpm tsx tooling/parcours/reference.ts       # 24 assertions
pnpm tsx tooling/parcours/contributions.ts   # 26 assertions
```

Le mot de passe se surcharge par `PARCOURS_PASSWORD`. Ces parcours **écrivent dans la vraie base** :
caves, lots, événements, propositions de révision. Ils effacent ce qu'ils écrivent, et l'état final
a été vérifié à zéro. `audit_log` ne s'efface jamais.

Les pièges d'écriture de ces parcours sont dans « PIÈGES DE CET ENVIRONNEMENT » — lis-les **avant**
d'en écrire un cinquième, ils coûtent une heure chacun la première fois.

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
psql -f supabase/migrations/0008_cave.sql
psql -f supabase/tests/07_cave_rls.sql            # 17 assertions
psql -f supabase/migrations/0009_profile_guard.sql
psql -f supabase/tests/08_profile_guard.sql        # 6 assertions
psql -f supabase/tests/00_rls_coverage.sql
```

**Joue la 08 *avant* la 0009 une fois, pour voir.** Elle échoue sur `permission denied for function
is_privileged_context` — l'erreur exacte que voyait un membre en enregistrant son profil. Un test de
régression qui ne casse pas sur le schéma d'avant ne teste rien, et celui-là a été écrit dans cet
ordre pour cette raison.

Le §3 de la 0006 se déclare absent par un `NOTICE` sur une base nue : `pg_cron` n'existe ni en local
ni sur l'image de la CI. C'est attendu, ce n'est pas un échec.

Le seed écrit aussi dans `public` (la roue des arômes, section 6) : sur une base nue, appliquer
**0003 avant `seed.sql`**, faute de quoi la table est absente.

Commandes du projet : `pnpm dev`, `pnpm check` (le portail avant commit), `pnpm test:e2e`
(exige un `pnpm build` préalable), `pnpm storybook`.
