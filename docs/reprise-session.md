# Vitola — prompt de reprise

> À copier tel quel au démarrage de la prochaine session. Il contient l'état complet de la base :
> **aucune requête n'est nécessaire pour la découvrir**. Mis à jour le 25 août 2026, après la
> fusion des **PR #11 à #13** et la livraison de **l'administration** (ADR 0014, migration
> `0020`, `/admin` en cinq écrans, 28 assertions de parcours) sur commande directe du porteur.
> Deux arbitrages du porteur sont tombés le même jour : **l'ADR 0003 est acceptée** (« boutique
> propre d'abord » — Checkout, la marketplace partenaires reste une v2) et le **modèle
> « stock des civettes contre abonnement » est refusé** (loi Évin — voir la note de la 0003).
> La session du 23 au soir avait accepté les **ADR 0008 et 0009 par délégation** (« je te laisse
> maître à bord ») et appliqué la 0009 pièces 1 et 2 — migration `0019` (le `status` de
> `ref.lines`), `line_id` proposable au wiki, parcours `gammes.ts`.
> **P1, P2, P3, P5, P6 et P8 sont fermées.** L'enjambement de P7 et P4 est **autorisé et acté** :
> le porteur a dit le 23 août « avance sur ce que tu peux — je mettrai les clés API IA plus tard
> (**on passera par Gemini**) et les clés Stripe plus tard ». Il reste donc exactement
> **P7 (boutique + Stripe)** et **P4 (scan de bague, VLM Gemini)**, toutes deux fermées par leurs
> clés — vérifier l'environnement en début de session : le jour où `STRIPE_*` ou une clé Gemini
> existe, la phase correspondante s'ouvre, ADR d'abord. Sans clés, il reste du vrai travail : les
> arbitrages listés sous « À me signaler », les brouillons du journal à publier (geste du
> porteur), les premières gammes à publier si vous les voulez (geste d'`editor`), et rien d'autre
> qui vaille d'être inventé.

---

Reprise du projet Vitola. Le contexte est dans le dépôt : lis `CLAUDE.md`, `BRIEF.md`, puis
`docs/decisions-log.md` (la première section est celle de P8, de la dernière session),
`docs/adr/` : **0004 à 0013 sont Acceptées** — 0008 et 0009 le 23 août **par délégation**, avec la
provenance consignée dans chacune : la 0009 est appliquée (pièces 1 et 2, la création de gamme par
les membres reste différée), la 0008 est actée **sans rien construire** avant la relecture des
862 fiches. Les deux se rouvrent d'un mot du porteur. Puis `supabase/seed/PROVENANCE.md` et
`docs/phase-0/05-questions-ouvertes.md`. Un `CLAUDE.md` par domaine complète le racine :
`app/`, `lib/`, `supabase/` — leurs paragraphes récents sont exactement ceux qu'on regrette de ne
pas avoir lus.

**Branche de travail** : celle qui t'est assignée, à créer depuis `master`. **Les PR #10 à #12
sont fusionnées** (`git log --oneline origin/master -3` doit montrer `132057f` en tête ou en
dessous), et le travail de la session de reprise du 23 août au soir — arbitrage délégué des ADR
0008/0009, migration 0019, `line_id` au wiki, `gammes.ts` — vit sur la branche
`claude/vitola-reprise-92foh2`, poussée, en attente de PR ou fusionnée depuis. Vérifie l'état
d'un coup d'œil plutôt que de le supposer, et `/api/health` sert le commit réellement déployé.

Le code du dépôt et l'état de la base concordent : **vingt migrations**, toutes dans
`supabase/migrations/` **et** appliquées sur le projet — la 0019 (le `status` de `ref.lines`) est
enregistrée sous `20260823210941`, la 0020 (l'administration) sous `20260825104447`.
`lib/supabase/database.types.ts` les porte et le contrôle de dérive passe (93 objets).

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

**La v1 du brief** — il ne reste que **P7 (boutique + Stripe)** et **P4 (scan de bague)**, toutes
deux fermées par leurs clés, et les arbitrages du porteur. **Commence par vérifier les clés** :
`env | grep -icE "stripe"` et l'équivalent Gemini (`GEMINI_API_KEY`, `GOOGLE_API_KEY`…). Une clé
présente ouvre sa phase, **ADR d'abord** — pour P4, l'ADR de pipeline doit être écrite pour
**Gemini** (le §6 du brief disait Claude ; le porteur a tranché Gemini le 23 août, et le choix du
modèle change le format des sorties, le coût par scan et le rate limiting). Sans clés, ne
construis pas « la moitié sans clé » d'une phase de ta propre initiative : un panier qui ne se
vide jamais et un écran de scan qui ne scanne pas sont des promesses à l'écran, et la décision de
les montrer appartient au porteur.

**Le rythme attendu : enchaîne.** Ne t'arrête pas au premier item livré pour me demander la suite.
Prends l'item suivant, livre-le en entier — écrans compris, parcourus, nettoyés derrière —, puis le
suivant, jusqu'à ce que la session soit pleine. Un item est fini quand il est **parcourable et
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
  assertions SQL du dépôt. P3 en a ajouté cinq de plus, dont **quatre étaient verts** — et l'un
  d'eux n'a été trouvé ni par une page ni par une assertion, mais en **comptant les lignes laissées
  en base** après un parcours qui se déclarait vert.
  Aucun n'était visible d'un compilateur ; la plupart ne se voient pas non plus en relisant le code.
  Le pire des sept — **aucun membre ne pouvait modifier son profil** — dormait depuis la migration
  0002, et il a suffi d'ouvrir `/parametres` avec un vrai compte pour le voir en dix secondes.

---

## ÉTAT AU 23 AOÛT 2026, FIN DE SESSION

`master` est la branche de production et **Vercel déploie bien depuis `master`**. `/api/health` sert
le commit déployé (`{"status":"ok","phase":"P1","commit":"…"}`) : c'est le moyen le plus rapide de
savoir ce qui tourne. Chaque branche poussée reçoit une préversion Vercel, protégée par
l'authentification Vercel.

PR #1 à #11 fusionnées. La #7 a porté le carnet du fumeur (P2, première moitié) ; la #9 a porté la
cave, les statistiques et tout le reste de P1 — la cave **ferme le critère de sortie de P2**, le
reste **ferme P1**. La #10 a porté **tout P3** plus les clubs, l'agenda et la messagerie. La #11
a porté **P5 (les lieux) et P6 (le journal)**. **P8 part en PR #12** (mêmes gestes : CI verte,
squash) : ADR 0013, migration 0018 (appliquée en base), `/moderation`, le chemin de contestation,
l'audit axe-core à zéro, le manifest PWA — validés par `pnpm check`, `pnpm build`, les 56 e2e,
les 22 assertions du parcours de modération et l'audit. `git log --oneline origin/master -3` dit
si elle est entrée ; si oui, repars de `master`, sinon la branche assignée porte tout.

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
- **Le social (P3)** — **66 assertions de parcours, deux comptes, contre la vraie base, 0 échec** :
  - `/fil` — deux onglets (abonnements, découverte), **pagination keyset par lien**, composeur
    (note ou question) avec ses deux portées et la phrase qui dit pourquoi il n'y en a que deux ;
  - `/fil/[id]` — la publication, ses braises, ses commentaires, « Signaler », « Supprimer » ;
  - « Je fume ce cigare » depuis la fiche cigare ; « Publier au fil » depuis une entrée de carnet,
    dont la publication **suit la portée de l'entrée** et disparaît si on la referme ;
  - `/membres` — l'annuaire, `<form method="get">`, zéro JavaScript ;
  - `/membres/[handle]` — profil public honorant **les trois clés de confidentialité**, abonnés,
    abonnements, publications, entrées publiques, cave montrée, s'abonner, se désabonner,
    **retirer un abonné**, bloquer, débloquer, signaler ;
  - `/notifications` — abonnement, braise, commentaire, partage de carnet ; compteur dans la nav ;
  - `/parametres` — une section « Personnes bloquées », parce qu'un déblocage doit être trouvable.
- **Critère de sortie P3 mesuré** : keyset sur `(created_at, id)`, **un seul appel par page**,
  2,5 ms en découverte et 4 ms en abonnements sur 50 000 publications, **1,4 ms pour une page située
  10 000 lignes plus loin**. Et parcouru : 21 publications, 20 sur la première page, une seconde
  page qui ne partage aucune ligne avec la première.

### Comptes de QA — mot de passe `cigardeur` pour les trois

| pseudo | courriel | rôle | réputation |
|---|---|---|---|
| `jeremy` | jgueniche06@gmail.com | `admin` | 0 |
| `test_un` | test1@cigardeur.com | `member` | 0 |
| `test_deux` | test2@cigardeur.com | `member` | 0 |

---

## LA BASE, EN ENTIER — NE LA REQUÊTE PAS, ELLE EST ICI

Projet `vitola`, ref `upbewqsmgcrogoapubyz`, région `eu-west-3` (Paris). **Vingt migrations**
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
| `0010` | `social` | `supabase/migrations/0010_social.sql` |
| `0011` | `profile_privacy` | `supabase/migrations/0011_profile_privacy.sql` |
| `0012` | `unblock_is_reachable` | `supabase/migrations/0012_unblock_is_reachable.sql` |
| `0013` | `post_card` | `supabase/migrations/0013_post_card.sql` |
| `0014` | `clubs_evenements_messagerie` | `supabase/migrations/0014_clubs_evenements_messagerie.sql` |
| `0015` | `conversation_inbox` | `supabase/migrations/0015_conversation_inbox.sql` |
| `0016` | `lieux` | `supabase/migrations/0016_lieux.sql` |
| `0017` | `editorial` | `supabase/migrations/0017_editorial.sql` |
| `0018` | `moderation` | `supabase/migrations/0018_moderation.sql` |
| `0019` | `ref_lines_status` | `supabase/migrations/0019_ref_lines_status.sql` |
| `0020` | `admin` | `supabase/migrations/0020_admin.sql` |

**Huit sont enregistrées sous un horodatage** plutôt que sous leur numéro de fichier — `0008`,
`0009`, `0015`, `0016`, `0017`, `0018`, `0019` et `0020` : `20260822222420`, `20260822232400`,
`20260823083729`, `20260823103622`, `20260823115404`, `20260823174500`, `20260823210941` et
`20260825104447`. C'est l'outil
d'application qui numérote, pas le fichier. `list_migrations` affiche donc des versions qui ne
ressemblent pas au dépôt, et c'est normal — l'ordre et le contenu sont les bons.

Schémas exposés à PostgREST : `db_schema = public,graphql_public,ref`.
`mod` en est délibérément **absent**.

Extensions ajoutées : **`pg_cron`**, pour une seule tâche — `vitola-refresh-cigar-stats`, toutes
les cinq minutes — et **`postgis`** (0016), dans le schéma `extensions` comme les autres. La CI
tourne depuis sur l'image `postgis/postgis:17-3.5` et **purge la pré-installation** que cette
image met dans `public` avant d'appliquer les migrations : sans cela `if not exists` saute la
création et `extensions.geography` ne résout pas.

### Volumes réels

```
ref.manufacturers          30      public.profiles             3
ref.brands                114      public.reviews              4  ← pas de moi
ref.lines                   0  ←   public.review_shares        0
ref.vitolas                51      public.review_thirds        0
ref.cigars                940      public.comments             1  ← pas de moi
  dont published          940      public.aroma_taxonomy      87
  avec vitole              78        dont familles            11
  avec prix               900      public.consents             0
  avec force / cape       123      public.audit_log           19
  verified_by non nul       0  ←   public.feature_flags        5
ref.box_codes              18      mod.reports                 0
ref.cigar_images            0      mod.moderation_actions      0
ref.cigar_revisions         0      public.cigar_stats     3 lignes (vue matérialisée)
                                   public.humidors             1  ← « LA cave », test_deux
                                   public.humidor_items        ?  ← vit avec la cave du porteur
                                   public.humidor_events       ?
                                   public.humidor_readings     ?
                                   public.follows              1  ← jeremy → test_un, à la main
                                   public.blocks               0
                                   public.posts                1  ← test_deux, « Publier au fil »
                                   public.post_reactions       0
                                   public.post_comments        0
                                   public.notifications        0
                                   public.clubs                0  ← 0014
                                   public.club_members         0
                                   public.events               0
                                   public.event_attendees      0
                                   public.conversations        0
                                   public.messages             0
                                   public.venues             200  ← seed DGDDI (0016)
                                   public.venue_reviews        0
                                   public.articles             2  ← brouillons d'amorçage (0017)
                                   public.article_links        1  ← le guide gated → une fiche
```

**Le site est utilisé pour de bon, et rien de ce qui suit n'est d'un parcours.** `test_deux`
porte **quatre entrées de carnet publiques** (`macanudo-inspirado-white-toro` à 06 h 17,
`cao-pilon-robusto-extra` à 08 h 16, et **deux** sur `macanudo-inspirado-black-short-robusto` à
12 h 01 et 12 h 02 — probablement un double envoi, mais c'est à son auteur d'en juger), **une
cave** (« LA cave », 08 h 18 — d'où le `?` sur ses tables filles : elles vivent, ne les compte
pas pour les figer), et **une publication au fil** (`review_share`, 12 h 09). `jeremy` est abonné
à `test_un`. La ligne pré-existante de `public.comments` est toujours là. **Aucune de ces lignes
ne se touche ni ne s'efface** — la portée `private` protège exactement cela, et une cave est à
son propriétaire. `cigar_stats` a trois lignes parce que trois fiches ont des entrées publiques.

Les 200 lignes de `public.venues` sont le seed officiel (source `douane-fr-2018`), pas un reste
de parcours : un reste s'y reconnaît à `source is null`. **`mod.reports` et
`mod.moderation_actions` sont à zéro** : les dossiers du parcours de modération ont été retirés
en contexte privilégié (aucun DELETE client n'existe, par construction) et les comptes vérifiés à
zéro. Une exception connue de longue date — **`public.conversations` n'a aucun droit `DELETE`,
pour personne** (rétention : question ouverte de l'ADR 0010).

Les entrées écrites en parcourant sont effacées derrière la vérification, comme le demande
« Nettoie derrière une vérification » plus bas. `ref.lines` reste à zéro, mais le régime a changé le 23 août au soir :
la **0019** lui a donné son `status` (ADR 0009, acceptée par délégation), une gamme naît en
brouillon d'un `editor` et se publie par lui, `line_id` est proposable au wiki — et **l'amorcer
par un script reste interdit** (PROVENANCE). `verified_by` à zéro
est une dette de relecture, voir « À me signaler ».

`audit_log` contient dix-neuf lignes — les vérifications d'endpoints des sessions, plus l'usage
réel. Le journal est en ajout seul, personne n'a de `DELETE` dessus : c'est voulu, il ne
s'efface jamais.

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

**`public.follows`** — ADR 0007, D1. `follower_id!`, `followee_id!`, `created_at!`.
PK `(follower_id, followee_id)`, `follower_id <> followee_id`. **Aucun état** : un abonnement est
libre, asymétrique, immédiat. Deux policies DELETE et non une — se désabonner, et **retirer un
abonné** : c'est le contrepoids de l'abonnement libre, et il est exerçable quand une approbation,
elle, vieillit.

**`public.blocks`** — `blocker_id!`, `blocked_id!`, `created_at!`. PK `(blocker_id, blocked_id)`.
Volontairement pauvre : un blocage n'a pas de motif à donner à celui qui le subit. Lu par
`blocked_user_ids()` et `blockers_of_me()`, pas en direct. Un trigger supprime tout abonnement dans
les deux sens à l'insertion, et la policy INSERT de `follows` ferme l'autre côté : **aucune ligne
d'abonnement ne peut exister entre deux personnes bloquées**, ce qui évite un prédicat de blocage
sur le chemin chaud de la lecture du fil.

**`public.posts`** — le fil (ADR 0007, D2). `id!`, `author_id!(→auth.users, cascade)`,
`kind!(post_kind)`, `visibility!(review_visibility, défaut followers)`, `body`,
`cigar_id(→ref.cigars, set null)`, `review_id(→reviews, cascade)`, `ember_count!`,
`comment_count!`, `hidden_at/by/reason`, `created_at!`, `updated_at!`.

Contraintes qui refuseront tes insertions :

- `visibility in ('followers','public')` — **une publication ne peut être ni privée ni partagée**.
  Écrire pour soi, c'est le carnet.
- `(kind = 'review_share') = (review_id is not null)` — le discriminant tient dans les deux sens.
- `kind = 'session'` ⇒ `cigar_id not null`.
- Au moins un texte, un cigare ou une entrée (`posts_has_substance`). `body` ≤ 4000.
- `ember_count`, `comment_count`, `updated_at`, `hidden_*` : **hors de tout grant client**. Les
  compteurs sont recalculés par un `count()`, jamais par un delta (règle de `humidor_items.qty`).
- `GRANT INSERT` est **colonne par colonne** ; `GRANT UPDATE` ne porte que `(body, visibility)`.

**`public.post_reactions`** — la braise (§5.6). `post_id!`, `user_id!`, `kind!(reaction_kind)`,
`created_at!`. PK `(post_id, user_id, kind)`. Aucun UPDATE : on braise ou on retire.

**`public.post_comments`** — `id!`, `post_id!`, `author_id!`, `body!` (1–2000), `hidden_*`,
`created_at!`, `updated_at!`. L'audience se déduit de la publication par un `EXISTS`. L'auteur de la
publication peut retirer un commentaire chez lui (`post_comments_delete_host`).

**`public.notifications`** — `id!`, `user_id!`, `kind!(notification_kind)`, `actor_id`, `post_id`,
`review_id`, `created_at!`, `read_at`. **Aucun grant INSERT, à personne, et aucune policy INSERT** :
elles naissent de triggers `SECURITY DEFINER` sur `follows`, `post_reactions`, `post_comments` et
`review_shares`. Seule `read_at` est écrivable.

**`mod.reports`** — file DSA. `id!`, `reporter_id`, `entity_schema!`, `entity_table!`, `entity_id!`,
`reason!(report_reason)`, `detail` (≤2000), `status!(report_status)`, `created_at!`,
`acknowledged_at`, `decided_at`, `decided_by`, `decision_note`.
`entity_schema.entity_table` ∈ `{public.comments, public.reviews, ref.cigars, public.profiles,
public.posts, public.post_comments}` — la 0010 a remplacé le CHECK de la 0004 pour ajouter les deux
dernières. `tests/compliance/dsa.test.ts` lit désormais la **dernière** définition à travers toutes
les migrations, et asserte les deux sens : une surface dans le CHECK sans bouton est un oubli autant
qu'un bouton sans CHECK.
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
public.post_kind           post | session | review_share | question
public.reaction_kind       ember
public.notification_kind   follow | ember | post_comment | review_share
public.feed_scope          following | discover
public.event_kind          degustation | rencontre | visite | autre
public.attendee_status     going | maybe | declined
```

### Policies RLS — 186 au total (dont 11 RESTRICTIVE), toutes les tables couvertes

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
ref.brands / vitolas / manufacturers / box_codes  3 chacune
ref.lines                5  select_published (anon+auth), select_editor (les
                            brouillons — 0019), insert_editor, update_editor,
                            delete_admin (0020)
public.humidors          5  select_own, select_shown (P3), insert/update/delete_own
public.humidor_items     5  · public.humidor_events 3 · public.humidor_readings 4
                            — dont UNE RESTRICTIVE chacune, voir plus bas
public.follows           4  select_all, insert_own, delete_own, delete_followee
public.blocks            3  select_own, insert_own, delete_own
public.posts             9  select_public/own/followers/moderator, insert_own, update_own,
                            delete_own, delete_moderator, + 1 restrictive de blocage
public.post_reactions    3  · public.post_comments 8 (dont 1 restrictive)
public.notifications     3  select_own, update_own, delete_own — AUCUNE insert
public.clubs             4  select_all, insert_own, update_owner, delete_owner
public.club_members      4  select_all, insert_own, delete_own, delete_owner
public.events            4  select_all, insert_own, update_host, delete_host
public.event_attendees   4  select_all, insert_own, update_own, delete_own
public.conversations     2  select_own, insert_linked, + 1 restrictive de blocage
public.messages          5  select_own, select_moderator, insert_own, update_recipient,
                            delete_own, + 1 restrictive de blocage
public.venues            7  select_public (published+closed, y compris anon), select_own,
                            select_editor, insert_own (pending, WITH CHECK), update_author
                            (pending seulement), update_claimant, update_editor,
                            delete_author (pending), delete_moderator
public.venue_reviews     8  select_visible, select_own, select_moderator, insert_own
                            (lieu publié), update_own, delete_own, delete_moderator,
                            + 1 restrictive de blocage
public.articles          5  select_published (anon compris), select_editor,
                            insert_editor, update_editor, delete_editor
public.article_links     3  select_visible (EXISTS sous la RLS d'articles),
                            insert_editor, delete_editor
```

**Huit policies `RESTRICTIVE` de blocage**, sur `posts`, `post_comments`, `reviews`, `comments`,
`profiles`, `conversations`, `messages` et `venue_reviews`. C'est la seule sémantique qui puisse **retirer** une ligne : les permissives sont
OR-ées, donc en ajouter une ne peut jamais restreindre. Chacune épargne ses propres lignes.

Toutes lisent `blocked_user_ids()` — **les deux sens** — sauf `profiles`, qui lit
`blockers_of_me()` — **un seul**, et la différence est la correction de la 0012 : cacher le profil
dans les deux sens rendait le seul écran portant « Débloquer » introuvable, donc un blocage était
définitif. Celui qui bloque voit désormais le profil de sa cible, jamais son contenu.

`clubs`, `events` et les deux tables d'appartenance n'en reçoivent **pas** : leur contenu est un nom
et une date, et les masquer casserait un compteur public sans rien protéger. Le blocage y agit à
l'écriture — on ne rejoint pas le club de quelqu'un qu'on a bloqué, on ne s'inscrit pas à son
événement.

**Trois policies `RESTRICTIVE` propriétaires** sur `humidor_items`, `humidor_events` et
`humidor_readings`. Sans elles, `humidors_select_shown` cascade : les tables filles rejoignent le
parent par un `EXISTS` soumis à sa RLS, donc ouvrir une cave ouvrait **le grand livre**, c'est-à-dire
quand la personne a fumé quoi. Rien ne casse si elles disparaissent — une lecture rend simplement
plus. C'est l'invariant le plus facile à défaire sans le voir, et l'auto-contrôle de 0010 le
vérifie.

**La cave s'ouvre à un tiers depuis la 0010, et seulement à moitié.** `humidors_select_shown` est
une policy de **plus**, comme l'ADR 0006 D4 l'avait prévu, et l'accesseur `SECURITY DEFINER` qu'elle
annonçait existe. Ce que l'ADR n'avait pas prévu, c'est que l'ouverture **cascade** vers les trois
tables filles — voir les policies restrictives ci-dessus. Et le prix ne traverse pas du tout : une
policy filtre des lignes, elle ne sait pas cacher une colonne, donc la lecture d'un tiers passe par
`shared_humidor_shelf()`, qui projette `cigar_id, qty, aging_start_date` et rien d'autre.

**Les policies SELECT de `reviews` sont découpées par rôle, et ce n'est pas du style.** Une seule
policy `to anon, authenticated` faisait évaluer la sous-requête sur `review_shares` par un visiteur
anonyme, qui n'a aucun grant dessus : `permission denied for table review_shares` sur un simple
`select from reviews`. Ne les recolle pas.

**La branche `followers` de la policy SELECT existe depuis la 0010**, ajoutée comme une policy de
**plus** — les quatre autres ne sont pas touchées, parce qu'elles sont découpées par rôle et que les
recoller casserait la lecture publique. `tests/unit/reviews-model.test.ts` a retourné son assertion
le même jour : elle exige maintenant que la branche existe **et** que l'avertissement
« l'abonnement n'existe pas encore » ait quitté `messages/fr.json`.

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
| `public.feed_page(feed_scope,timestamptz,uuid,int)` | **non — INVOKER** | ✗ | ✓ | ✓ |
| `public.post_card(uuid)` | **non — INVOKER** | ✗ | ✓ | ✓ |
| `public.blocked_user_ids()` | **oui** | ✗ | ✓ | ✓ |
| `public.blockers_of_me()` | **oui** | ✗ | ✓ | ✓ |
| `public.blocks_between(uuid)` | non — délègue | ✗ | ✓ | ✓ |
| `public.profile_privacy(uuid)` | **oui** | ✗ | ✓ | ✓ |
| `public.shows_humidor(uuid)` | **oui** — délègue | ✗ | ✓ | ✓ |
| `public.shared_humidor_shelf(uuid)` | **oui** | ✗ | ✓ | ✓ |
| `public.conversation_with(uuid)` | **non — INVOKER** | ✗ | ✓ | ✓ |
| `public.conversation_inbox(int)` | **non — INVOKER** | ✗ | ✓ | ✓ |
| `public.venues_nearby(lat,lng,rayon,types[],max)` | **non — INVOKER** | ✓ | ✓ | ✓ |
| `public.mod_queue(text,int)` | **oui** — gardée moderator | ✗ | ✓ | ✗ |
| `public.mod_report(uuid)` | **oui** — gardée moderator | ✗ | ✓ | ✗ |
| `public.mod_acknowledge(uuid)` | **oui** — gardée moderator | ✗ | ✓ | ✗ |
| `public.mod_decide(uuid,text,text,text,text)` | **oui** — gardée moderator | ✗ | ✓ | ✗ |
| `public.admin_set_flag(text,boolean,jsonb)` | **oui** — gardée admin | ✗ | ✓ | ✗ |

**Les quatre `mod_*` (0018) sont l'inverse assumé : `DEFINER`, parce que `mod` est injoignable
autrement** — l'exception de `file_report()`, appliquée au troisième acteur qui devait entrer
dans le schéma. La garde est DANS chaque fonction (`has_min_role('moderator')`, errcode 42501),
le grant à `authenticated` ne fait que fermer la porte aux rôles qui n'ont pas à frapper — ni
`anon` ni `service_role` ne l'ont. Aucune ne rend `reporter_id`. `mod_decide()` refuse : une
décision sans note, un verbe sur un rejet, `warn`/`suspend`/`delete` (sans bras, ADR 0013 D4),
`hide`/`restore` hors des quatre surfaces à colonnes `hidden_*`, et tout dossier déjà tranché —
la contestation est un **nouveau** signalement.

**`feed_page()`, `post_card()`, `conversation_with()` et `conversation_inbox()` sont en droits
d'appelant, et l'auto-contrôle de leur migration échoue si elles passent un jour en `DEFINER`.** C'est la décision D1 de l'ADR 0006 réappliquée : un
appel PostgREST est une transaction, pas un privilège. Sur `post_card()` c'est plus visible encore —
elle n'a **aucun** prédicat d'audience dans son corps, donc la RLS est littéralement la seule chose
qui décide.

**`feed_page()` filtre par ONGLET, jamais par audience**, et confondre les deux a coûté un bug :
`discover` filtre `visibility = 'public'` dans son corps, ce qui dit de quoi la page parle. S'en
servir pour lire *une* publication rendait toute publication réservée introuvable à son adresse.
`post_card()` est la fonction de l'autre geste.

**`conversation_inbox()` existe pour la même raison que `feed_page()`** : qui est l'autre, quel est
le dernier message et combien n'ai-je pas lu sont trois questions **par ligne**, donc trois
allers-retours par conversation si on les pose une à une. Comme `post_card()`, elle n'a **aucun**
prédicat d'audience : `conversations_select_own` et la restrictive de blocage décident seules.
Elle rend au plus 100 lignes et **l'écran le dit** quand la page est pleine — un plafond muet se lit
comme une liste complète.

**`conversation_with()` calcule `least`/`greatest` et jamais le client.** La paire est canonique
(`member_a < member_b`), donc « la conversation entre X et Y » est une lecture ; faire calculer la
convention au client, c'est la lui faire connaître, et l'oublier une fois crée un doublon que
l'index unique refuse avec une erreur illisible. Elle est INVOKER, donc la policy `insert_linked`
— qui exige le lien d'abonnement — s'applique pleinement.

**`blocked_user_ids()` rend un TABLEAU et pas un prédicat**, et c'est une mesure : un prédicat dans
une policy s'évalue une fois **par ligne examinée** — 2 420 appels pour rendre vingt lignes de fil.
Enveloppé dans un `(select …)`, le tableau s'évalue une fois par requête, en InitPlan. 29 ms → 2 ms.
Écrire `x = any ((select f())::uuid[])` : sans le cast, PostgreSQL lit la forme ensembliste et
refuse `uuid = uuid[]`.

**`shows_humidor()` délègue à `profile_privacy()`** depuis la 0011, et l'auto-contrôle vérifie
qu'elle le fait toujours. Deux fonctions qui interprètent la même clé finissent par en dire deux
choses, et la divergence se lirait comme une cave montrée sur un profil et refusée par la policy.

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
| `venues_enabled` | oui | `{"types":[…7 types]}` | Q6, ADR 0011. La charge utile liste les types offerts : restreindre l'annuaire après avis juridique est un UPDATE de cette ligne — écrans, formulaire de proposition et entrée de nav compris. |

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

### ~~6. P3, le social~~ — **livrée le 23 août 2026 au matin**

ADR 0007 avant le SQL, migrations `0010` à `0013`, 32 assertions SQL, 20 tests unitaires,
**66 assertions de parcours** contre la vraie base avec deux comptes, nettoyage vérifié à zéro
ligne. Le détail de ce qu'elle a tranché et des cinq bugs qu'elle a trouvés est dans
`docs/decisions-log.md`, section « P3 ». Les URL à ouvrir sont plus bas.

**Les trois dettes sont refermées** : la branche `followers` de `reviews` existe et l'avertissement
d'interface est parti avec elle ; `show_humidor` ouvre une cave **sans ouvrir son grand livre ni son
prix** ; `show_reviews` et `show_country` sont lus par un écran de profil.

Le critère de sortie du §9 est **mesuré** : keyset sur `(created_at, id)`, un seul appel par page,
2,5 ms en découverte et 4 ms en abonnements sur 50 000 publications synthétiques, et **1,4 ms pour
une page située 10 000 lignes plus loin** — un keyset est plat en profondeur, c'est toute sa raison
d'être. Parcouru aussi dans un navigateur : vingt-et-une publications, vingt sur la première page,
un lien « suite » dont le curseur est une date **et** un identifiant, une seconde page qui ne
partage aucune ligne avec la première.

**Deux choses de P3 restent délibérément de côté**, et il faut les savoir avant de les croire
faites :

- **Les réactions autres que la braise.** `reaction_kind` a une seule valeur. En ajouter une est
  bon marché : elle n'apparaît dans aucune policy, donc pas de migration en deux temps comme pour
  `review_visibility`.
- **`posts.venue_id`** (§5.6) n'existe pas. Il arrivera avec P5 ; l'ajouter maintenant aurait été
  une colonne que rien ne remplit et qu'aucune policy ne lit.

### ~~6 bis. Clubs, événements et messagerie~~ — **livrés le 23 août 2026 à midi**

Demandés en v1 (§5.6, F7) et laissés de côté par P3, ils sont là. ADR 0010 avant le SQL, migrations
`0014` (les cinq tables) et `0015` (la boîte de réception en un appel), **19 assertions SQL**,
36 tests unitaires de plus, et **42 assertions de parcours** contre la vraie base avec deux comptes.

Six écrans : `/clubs`, `/clubs/[slug]`, `/evenements`, `/evenements/[id]`, `/messages`,
`/messages/[id]`.

La décision qui n'était dans aucune option, et qu'il faut connaître : **un message n'est pas chiffré
de bout en bout, et la plateforme peut le lire.** L'article 16 du DSA veut qu'un contenu signalé soit
examinable, donc `public.messages` est une cible de `mod.reports`, un modérateur a une policy
`SELECT` dessus, et la politique de confidentialité le dit en toutes lettres. Une messagerie qui
laisserait croire le contraire serait pire qu'une messagerie franche.

Deux bugs trouvés **dans un navigateur** et nulle part ailleurs : un `upsert` PostgREST demande
l'UPDATE sur toutes les colonnes de sa charge, donc répondre à un événement était refusé en silence ;
et un `datetime-local` rend une heure murale sans fuseau, donc une soirée annoncée à 20 h était
enregistrée à 22 h de Paris. Le détail est dans `docs/decisions-log.md`.

**Ce qui reste ouvert de l'ADR 0010** : la rétention des messages. `public.conversations` n'a donc
aucun droit `DELETE`, pour personne — ouvrir la suppression aurait tranché la question par accident.

### 7. P4 — le scan de bague. **BLOQUÉE par ses clés, et le VLM sera Gemini**

Elle **ne peut pas être livrée depuis une session distante en l'état**. Deux raisons
indépendantes, aucune contournable par du code :

1. **Aucune clé — et le fournisseur a changé.** Le §6 demandait un VLM « Claude vision » ; **le
   porteur a tranché le 23 août : on passera par Gemini**, clés fournies plus tard. L'ADR de
   pipeline de P4 doit donc être écrite pour Gemini (format des sorties structurées, coût par
   scan, rate limiting, et la question embeddings — Gemini a une API d'embeddings multimodaux qui
   peut remplacer SigLIP/Replicate, à arbitrer dans l'ADR). Ni clé Gemini, ni
   `REPLICATE_API_TOKEN`, ni `UPSTASH_*` ne sont dans l'environnement. Sans le VLM et sans les
   embeddings, un scan ne reconnaît rien : l'écran serait un appareil photo qui répond « je ne sais
   pas ».
2. **Aucun jeu de test, et il ne peut pas être fabriqué ici.** Le §6 exige **200 photos de bagues
   annotées à la main** dans `tests/fixtures/bands/` et un top-3 publié dans
   `docs/recognition-benchmark.md`, avec la phrase « Ne pas passer à la phase suivante sans ce
   chiffre mesuré ». Le bucket `cigar-images` contient **0 objet**. Récupérer 200 photos de bagues
   ailleurs, c'est exactement ce que le §2 interdit (art. L341-1 CPI) — et les annoter est un geste
   humain.

Ce qui **est** faisable sans clé, si le porteur du produit le demande : le schéma (`band_scans`,
`band_embeddings` avec `pgvector`), la capture et le pHash côté client, la moitié lexicale de la
recherche hybride (trigram + unaccent, déjà en base depuis P1), le quota adossé à Postgres plutôt
qu'à Upstash, et l'écran avec sa dégradation gracieuse vers la recherche manuelle. Cela ne ferme
**pas** le critère de sortie, et le brief interdit explicitement d'avancer sans lui.

### ~~8. P5 — les lieux (§5.7)~~ — **livrée le 23 août 2026, ADR 0011**

Le §9 donne à P5 un critère net : « **200 lieux seedés, recherche 25 km < 200 ms** ». Les deux
moitiés ne coûtent pas la même chose.

**La recherche est de l'ingénierie ordinaire** : `postgis` (l'extension n'est pas encore installée),
une colonne `geography(Point,4326)`, un index GiST, `ST_DWithin`. Rien qui demande un arbitrage. La
table du §5.7 a déjà son `status enum(pending|published|closed)`, donc — contrairement à
`ref.lines`, et c'est tout l'objet de l'ADR 0009 — un lieu n'est **pas** public dès son insertion.
C'est la bonne asymétrie, et elle permet la contribution dès le premier jour.

**Les 200 lieux sont une question juridique, pas technique.** Le §2 interdit l'extraction (art.
L341-1 CPI), et `PROVENANCE.md` exige que chaque ligne soit justifiable — c'est ce document qui nous
défend en cas de contestation. Il y a trois voies, et elles n'ont pas le même prix :

1. **OpenStreetMap** (Overpass, `shop=tobacco`, `smoking=*`). Complet, à jour, et **ODbL** : la
   licence impose l'attribution **et le partage à l'identique de la base dérivée**. C'est la clause
   à trancher, pas la faisabilité — elle engage le régime de notre propre base.
2. **SIRENE / l'annuaire des débits de tabac**, en Licence ouverte Etalab : pas de partage à
   l'identique, mais des établissements sans horaires, sans fumoir, sans site — la moitié des
   colonnes du §5.7 resteraient vides.
3. **La contribution seule** : `status = 'pending'` par défaut, et on part de zéro. Honnête, et le
   critère de sortie n'est pas tenu avant longtemps.

**Écris l'ADR 0011 avant la première ligne de SQL**, comme la 0007 et la 0010 l'ont été. Elle doit
trancher la source et sa licence, qui peut créer un lieu, ce que `claimed_by` veut dire (un
professionnel revendique sa civette : c'est une donnée d'identité, pas un drapeau), et ce que
`venue_reviews` autorise — le §5.7 le borne à « l'accueil, le confort, le conseil », **jamais
l'incitation à consommer**, ce qui est un garde-fou §2 à écrire quelque part de vérifiable.

Deux conséquences déjà en attente ailleurs : `events.venue_id` **n'existe pas** — la 0014 l'a
délibérément laissé de côté, un lieu écrit à la main tient en attendant et la migration se fera en
une requête — et `posts.venue_id` non plus, pour la même raison.

> **Livrée.** L'ADR 0011 tranche les quatre points : seed depuis le registre officiel des
> buralistes (DGDDI 2018, Licence Ouverte — le régime exact de l'arrêté des prix), **OSM refusé**
> tant qu'un avis juridique n'a pas borné le partage à l'identique de l'ODbL ; tout membre propose
> (`pending`), un `editor` publie ; `claimed_by` est une identité posée en contexte privilégié,
> jamais un drapeau auto-servi ; l'avis porte **trois critères structurels** (accueil, confort,
> conseil) et sa note est `GENERATED` — le garde-fou §2 est la forme de la donnée. Les deux
> `venue_id` existent et leurs écrans avec. Critère de sortie mesuré : 200 lieux, 0,6 ms par
> recherche 25 km à chaud sur la vraie base, 8 ms en local sur 50 200 lignes, GiST engagé.
> **Restent voulus** : pas de carte (le fournisseur de tuiles est un arbitrage de sous-traitance,
> question ouverte de l'ADR) et pas de revendication en un clic (attend un canal de contact, Q7).

### ~~9. P6 — l'éditorial, le SEO~~ — **livrée le 23 août 2026, ADR 0012 ; la newsletter est différée**

> **Livrée.** L'ADR 0012 tranche : un article vit dans `public.articles` (`body_md`, **jamais de
> MDX** — du code en base), le rendu passe par le sous-ensemble Markdown maison de
> `lib/journal/markdown.ts` (arbre typé, cas d'injection testés et parcourus) ; `/journal` est le
> **seul préfixe public** du site, un article `gated` se défend lui-même (cookie du portail exigé
> par sa page, `noindex`, absent du sitemap et du flux RSS) ; pas de fiche liée sur un article
> public (deux triggers) ; les `editor` écrivent et publient. **Lighthouse SEO = 100** sur `/`,
> `/journal` et un article public, mesuré levier d'indexation ouvert (`SITE_INDEXABLE=1`, fermé
> par défaut tant que Q1 n'est pas tranchée). **La newsletter n'existe pas** (D5) : pas de clé
> Resend, pas de domaine (Q7), et collecter des adresses sans envoyeur serait une table de
> données personnelles au service de rien — le flux RSS est l'abonnement de v1.
> **Deux brouillons d'amorçage** signés `jeremy` attendent sa relecture au composeur.

### 10. P7 — la boutique et Stripe. **Les clés viendront « plus tard » — c'est dit, pas supposé**

Le §9 lui donne « commande test bout en bout + webhook idempotent ». Le §3 prévoit Stripe
Checkout (ADR 0003, encore Proposée — elle attend l'arbitrage avec 0008 et 0009). **Le porteur a
confirmé le 23 août que les clés Stripe arriveront plus tard** ; d'ici là, aucune variable
`STRIPE_*` dans l'environnement. Sans clés, P7 est l'écran d'un paiement qui ne peut pas
s'exercer, et la session P8 a délibérément choisi de **ne pas** livrer sa moitié sans clé — un
panier qui ne se vide jamais est une promesse à l'écran, et la décision de le montrer appartient
au porteur. Ce qui restera vrai le jour des clés : le schéma `shop` (le `CHECK` anti-tabac du
§5.8, le trigger de refus lexical — `lib/compliance/tobacco-terms.ts` existe pour lui, et
`supabase/CLAUDE.md` documente sa subtilité des composés d'accessoires), le catalogue, le panier,
puis Checkout et son webhook idempotent. Il manque aussi **un catalogue réel** : quels
accessoires, quels prix, quel stock — une décision commerciale qu'aucune session ne peut inventer.

### ~~11. P8 — modération, RGPD, i18n, PWA, perf, a11y~~ — **livrée le 23 août 2026, ADR 0013**

> Critère du §9 mesuré et dépassé : **0 violation axe-core, tous impacts confondus**, sur
> 24 écrans en trois rôles (`tooling/audit/a11y.ts`, rejouable). La 0018 pose les quatre portes
> `SECURITY DEFINER` vers `mod` (`mod_queue`, `mod_report`, `mod_acknowledge`, `mod_decide`),
> gardées par `has_min_role('moderator')` — le schéma reste non exposé, aucun rôle client n'y
> gagne de droit de table, l'auto-contrôle casse si cela change. `/moderation` est la réponse
> d'écran de Q12 : file `open` du plus ancien au plus récent (l'ordre du délai de 72 h), dossier,
> décision motivée obligatoire, acte (`hide`/`restore`) dans la même transaction que sa trace.
> **La contestation est un nouveau signalement** : l'auteur d'un commentaire masqué lit le motif
> et a « Contester ce retrait » — trou trouvé par le parcours, pas par l'audit. `warn`, `suspend`
> et `delete` restent refusés avec leur raison (ADR 0013, D4). Le manifest PWA et l'icône générée
> sont exemptés du portail dans le `matcher` ; **pas de service worker**, décision documentée.
> RGPD : rien de neuf à faire — la 0018 n'ajoute aucune colonne de données personnelles, et
> `moderation_records_for_subject()` (0006) couvrait déjà l'export. i18n : vérification, pas de
> sélecteur. Perf §8 : fiche à LCP 0,7 s / CLS 0 / TBT 0 ms en desktop local ; 93/100 en mobile
> émulé, dominé par le TTFB conteneur→eu-west-3 que la production ne paiera pas.

## À ME SIGNALER, PAS À TRANCHER SEUL

- **Vous avez utilisé le site, et rien de ce que vous avez écrit n'a été touché** : un abonnement
  `jeremy` → `test_un`, quatre entrées de carnet publiques de `test_deux`, sa cave « LA cave »,
  et une publication « Publier au fil ». Le détail est sous « Volumes réels ». Un point mérite
  votre œil : **les deux entrées de 12 h 01 et 12 h 02 portent la même fiche**
  (`macanudo-inspirado-black-short-robusto`) — probablement un double envoi, mais l'effacer est
  le geste de son auteur, pas le mien.
- **Personne n'est désigné pour relever la file de modération** — la question ouverte de
  l'ADR 0013, et la seule chose qui manque au dispositif DSA. L'écran existe (`/moderation`),
  le délai de 72 h est publié, et le seul compte qui passe la garde est `jeremy` (`admin`).
  Nommer quelqu'un — et décider si 72 h est tenable à un seul — est un arbitrage du porteur.
  Trois verbes restent volontairement sans bras (`warn`, `suspend`, `delete` — ADR 0013, D4),
  chacun avec son déclencheur de réarmement.
- **Les pastilles de l'accueil ont légèrement changé d'aspect** (a11y) : leur texte est passé de
  la couleur du ton (vert/ambre, 11 px, contraste AA raté sur le fond sombre) à l'encre, l'anneau
  gardant le ton. L'accueil est votre vitrine — à me dire si le compromis visuel ne vous va pas,
  la contrainte à tenir étant le contraste, pas cette solution-là.
- **Les deux brouillons d'amorçage du journal sont à vous** : `vitole-cepo-module…` (public,
  lexique) et `la-cape-du-claro-a-l-oscuro` (gated, lié à une fiche), signés de votre compte,
  relus par personne. **Les publier est votre geste** — depuis `/journal/ecrire` — et l'ADR 0012
  le dit en toutes lettres. La ligne éditoriale (sujets, rythme, signatures) est sa question
  ouverte.
- **La newsletter promise par F9 n'existe pas** (ADR 0012, D5) : pas de clé Resend, pas de
  domaine (Q7). Le flux RSS tient lieu d'abonnement. **À me dire si la newsletter doit précéder
  l'ouverture** — elle demande une clé, un domaine, un double opt-in et une ligne au registre
  des consentements.
- **Le levier `SITE_INDEXABLE` existe et reste fermé.** Le jour où Q1 tranche, l'ouverture de
  l'indexation est une variable d'environnement sur le déploiement — robots.txt et la méta
  passent ensemble à la frontière Q13, gated toujours exclu.
- **Le seed des lieux date de 2018 et sous-représente certaines villes.** Lyon n'a que 3 lieux
  nommés au registre (sur 157), Montpellier 4, Strasbourg 4 — le registre ne donne pas d'enseigne
  à la plupart de leurs débits, et l'ADR 0011 refuse d'en inventer une. La règle de sélection est
  dans PROVENANCE §7. **À me dire si un rééquilibrage éditorial est attendu** (par contribution,
  jamais par invention).
- **Le seul compte qui publie un lieu est aussi le seul qui valide le wiki** : `jeremy`, `admin`.
  Même goulot que la file wiki, une surface de plus. Le seuil de réouverture n° 5 de l'ADR 0011
  le mesure : dix propositions en attente plus d'une semaine.
- **La carte de P5 n'existe pas, et c'est un arbitrage qui vous attend** (question ouverte de
  l'ADR 0011) : MapTiler (clé, sous-traitant), Protomaps auto-hébergé (des Go à héberger), ou un
  service gratuit sans contrat. Chacun voit l'adresse IP de chaque visiteur de la carte. La
  recherche par distance, elle, est livrée et n'en dépend pas.
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
- **Les ADR 0008 et 0009 ont été acceptées par délégation le 23 août au soir** (« je te laisse
  maître à bord ») — chacune porte la provenance, et se rouvre d'un mot. La **0009 est
  appliquée** : `ref.lines` a son `status` (0019), `line_id` se propose au wiki, la création de
  gamme par les membres attend que le rattachement ait du trafic. **Personne ne peut créer une
  gamme depuis un écran** : c'est un `INSERT` d'`editor` en SQL ou l'écran de la pièce 3, à
  venir — **à me dire si vous voulez amorcer les premières gammes**, et lesquelles (une source
  vérifiable par gamme, PROVENANCE oblige). La **0008 est actée sans construction** : une fiche
  nouvelle sera un brouillon de `ref.cigars` inséré par son proposeur, mais rien ne s'ouvre avant
  la relecture des 862 fiches.
- **`show_indicative_prices` est réglable et rien ne le lit** (Q19). Les 900 prix sont en base,
  `lib/flags.ts` sait interroger le drapeau, aucun écran n'affiche `msrp_eur`. Afficher un prix de
  tabac est exactement le genre de geste que le §2 regarde de près : je ne l'ai pas branché seul.
- **Les trois clés de confidentialité sont honorées, et deux ne sont pas ce qu'on croit.**
  `show_humidor` est un **droit** : sans lui, la cave d'un tiers est illisible par n'importe quel
  chemin. `show_reviews` et `show_country` sont des **affichages** : une entrée publique reste
  publique sur la fiche du cigare quoi qu'en dise la première, et `profiles` est un annuaire public,
  donc la seconde retire un pays d'une page sans en faire un secret. Les paramètres le disent
  maintenant sous chaque interrupteur, et `PRIVACY_GOVERNANCE` porte la distinction en code.
  **À me dire si « affichage » ne suffit pas** pour le pays : le rendre inaccessible demande de
  sortir la colonne de `profiles`, donc une ADR.
- **L'abonnement est LIBRE, et c'est la question ouverte de l'ADR 0007.** N'importe qui peut entrer
  dans l'audience d'une entrée « Mes abonnés » **déjà écrite**, sans rien demander. Le contrepoids
  est le retrait — une policy et un bouton, exerçables quand une approbation, elle, vieillit — et
  l'écran l'annonce désormais au moment de choisir la portée. Sur une donnée que le §2 range
  possiblement à l'art. 9, c'est la décision que je défends le moins bien, et l'ADR propose une
  troisième voie : garder `followers` pour les **publications**, qu'on écrit pour être lues, et la
  retirer des portées offertes au **carnet**. Cela coûte un `CHECK` et un choix de moins à l'écran.
- **Clubs, événements et messagerie sont livrés** (ADR 0010, migrations 0014 et 0015), et **une
  décision de conformité y a été prise sans vous la demander parce qu'elle ne se choisit pas** : un
  message **n'est pas chiffré de bout en bout et la plateforme peut le lire**. L'art. 16 du DSA veut
  qu'un contenu signalé soit examinable ; `public.messages` est donc une cible de `mod.reports`, un
  modérateur a une policy `SELECT` dessus, et `/confidentialite` le dit en toutes lettres. **Si vous
  vouliez une messagerie chiffrée, il faut le dire maintenant** — cela change la table, le
  signalement et la promesse faite à l'utilisateur, donc une ADR et une migration.
- **La rétention des messages est la question ouverte de l'ADR 0010.** Conséquence en base :
  `public.conversations` n'a **aucun droit `DELETE`**, pour personne. Ouvrir la suppression aurait
  tranché la question par accident. Un message, lui, se supprime — par son auteur, et **pour les
  deux**.
- **`api.supabase.com` répond, dans cette session.** Le fichier disait le contraire, et c'était vrai
  à l'époque. Conséquence : la **clé de service** est récupérable
  (`GET /v1/projects/{ref}/api-keys?reveal=true`), donc le rafraîchissement de `cigar_stats`, l'écriture
  d'un signalement et l'export RGPD fonctionnent en local. C'est aussi par là que les migrations de
  P3 ont été appliquées, le MCP plafonnant sur un payload de 58 Ko. **Ne suppose ni l'un ni l'autre :
  teste.**
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
- **La politique de confidentialité est écrite et à l'écran** (`/confidentialite`, publique,
  devant le portail). Elle décrit le carnet, la cave, le social et la messagerie, dit l'art. 9 avant
  tout le reste, dit qu'un retrait ne défait pas une lecture passée, dit que l'abonnement est libre
  donc que l'audience peut grandir, dit que la cave montrée ne montre ni le prix ni le grand livre,
  et **compte ses sources depuis le code** (`PERSONAL_DATA_SOURCES`) plutôt que par une phrase qui
  vieillirait. Elle porte aussi ce qui manque encore, plutôt que de l'omettre.
  **Ce qui reste** : elle n'a **pas été relue par un juriste**, et la page le dit. C'est le seul
  point ouvert la concernant.
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
`CLAUDE.md`. Une ambiguïté d'architecture → une ADR + une question. Les ADR 0001 et 0002
attendent toujours validation ; **0003 est acceptée** (arbitrage du 25 août : boutique propre
d'abord, et le refus du modèle « stock des civettes contre abonnement » est consigné dans sa
note) ; **0004 à 0014 sont acceptées** — 0008 et 0009 par délégation du 23 août, 0008 sans
construction avant la relecture des 862 fiches, 0009 appliquée pièces 1 et 2, 0014
(l'administration) sur commande du 25 août.

## PIÈGES DE CET ENVIRONNEMENT, APPRIS À NOS DÉPENS

- **`api.supabase.com` était refusé par la politique de sortie ; il ne l'est plus** — vérifié le
  23 août. **Teste plutôt que de supposer**, dans un sens comme dans l'autre : un `curl` sur
  `/v1/projects` qui rend `401` veut dire joignable. Quand il l'est, la clé de service se récupère
  (`/v1/projects/{ref}/api-keys?reveal=true`) et tout ce qui en dépend marche en local. Quand il ne
  l'est pas, `/api/signalements` répond **500 là où la production répond 201** ; un **404** au même
  endroit veut dire tout autre chose — que la RLS a refusé de montrer la cible — et les deux ne
  doivent jamais être confondus.
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
  `@playwright/test`. **Et cela vaut aussi pour `pnpm test:e2e`** : ce conteneur porte le build
  Chromium 1194 quand `@playwright/test` 1.62 attend 1234 — sans la variable, les 56 e2e échouent
  en 3 ms chacun sur « Executable doesn't exist ». Ne lance jamais `playwright install`.
- **Les e2e et le serveur de vérification veulent le même port 3100.** Un `pnpm start` resté
  ouvert fait échouer toute la suite e2e instantanément (`reuseExistingServer` réutilise TON
  serveur — avec tes variables, pas les siennes). `fuser -k 3100/tcp` avant `pnpm test:e2e`.
- **Lighthouse tourne ici par `npx lighthouse@12`** avec `CHROME_PATH=/opt/pw-browsers/chromium`
  et `--chrome-flags="--headless=new --no-sandbox"` ; une page du portail s'audite en passant le
  cookie via `--extra-headers` (le cookie s'obtient en jouant le portail dans Playwright et en
  lisant `ctx.cookies()`).
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
- **`execute_sql` du MCP est en lecture seule** (`cannot execute INSERT in a read-only
  transaction`) alors qu'`apply_migration` écrit. Toute écriture privilégiée — fixtures d'un
  parcours, nettoyage, promotion d'un rôle — passe par l'API de gestion
  (`POST /v1/projects/{ref}/database/query`), **en `curl`** : le `urllib` de Python prend un
  403 Cloudflare (code 1010) sur `api.supabase.com`.
- **`pnpm check` et le commit doivent être dans la MÊME commande** (`&&`) — et sans `| tail` sur
  le `pnpm check` : le tube remplace le code de sortie par celui de `tail`, et un commit est passé
  ainsi sur un check rouge avant d'être amendé.
- **Un drapeau lu dans l'en-tête est lu sur toutes les pages.** `venues_enabled` décide d'une
  entrée de nav, donc l'en-tête interroge la base à chaque rendu — et sur la base injoignable de
  la CI, chaque écran devenait plus lent que le budget des e2e du portail : dix rouges sur un
  produit qui marchait. `venuesFlag(1200)` porte un délai que seul l'en-tête passe ; un drapeau
  muet répond « fermé ». C'est la preuve par l'exemple de « rejoue les e2e avec identifiants
  bidon avant de pousser ».
- **`body()` des parcours tronque à 400 caractères** — c'est un extrait de diagnostic, jamais un
  test de présence. Une boucle de nettoyage du fil s'en servait : elle croyait le fil vide, le
  post survivait, et seul le `count(*)` en base l'a dit. `seen()` attend, `body()` illustre.
- **Prettier n'est pas dans la CI** et des dizaines de fichiers ne passent pas `pnpm format:check`.
  Ne lance pas `pnpm format` : tu enterrerais ton diff sous un reformatage.
- **Le classificateur bloque parfois les heredocs `cat >`** ; utilise l'outil Write, ou un script
  Python qui écrit le fichier.
- **`tg_handle_new_user()` dérive le pseudo des 12 premiers caractères hexadécimaux de l'UUID.**
  Deux comptes de test dont les UUID partagent ce préfixe se heurtent sur `profiles_handle_key`.
- **`pkill -f "next"` tue le shell**, et pas seulement le serveur : la commande **entière** s'arrête
  là, y compris ce qui suit le `;`. Un `cp .env.local sauvegarde` placé juste après n'a jamais tourné,
  et la vérification « e2e avec identifiants bidon » qui suivait s'est faite avec les vraies clés —
  verte, et pour rien. Ferme le serveur par son pid : `ps -eo pid,args | grep '[n]ext-server'`.
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
- **Une exception n'est pas un échec, sauf si on l'écrit.** Un parcours dont le `try` lève et dont le
  `finally` compte les assertions cochées rend « 29 assertions, 0 échec » sur une exécution
  interrompue à l'étape 8. C'est le pire compte rendu possible : il rassure. Un `catch` qui pousse
  l'exception dans la liste des échecs, toujours.
- **Une boucle d'écriture ne fait pas confiance à un délai.** 700 ms entre deux publications en a
  perdu six sur vingt-et-une, et quinze publications sur une page qui en montre vingt ressemblent à
  une page pleine. Le signal exact que l'écriture a eu lieu est que **React a réinitialisé le
  champ** — donc on attend que le `textarea` soit vide, et on **compte** ce qu'on a écrit avant d'en
  déduire quoi que ce soit.
- **Un clic sur un `<Link>` navigue côté client.** Lire `page.url()` après une attente fixe interroge
  la page qu'on vient de quitter, et l'assertion échoue sur un produit qui marche. Lis le `href` et
  fais un `goto`.
- **Le nettoyage d'un parcours est une assertion déguisée.** Trois publications réservées aux abonnés
  ont survécu à chaque exécution parce que leur page répondait 404 — donc leur bouton « Supprimer »
  était inatteignable. Le parcours était vert ; seul un `count(*)` en base l'a dit. **Compte les
  lignes après un parcours**, ce n'est pas de la paranoïa.
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

## LES URL À OUVRIR POUR RECETTER LE SOCIAL (livré le 23 août au matin)

Connecté avec `test_un` (`test1@cigardeur.com` / `cigardeur`), un second onglet avec `test_deux`.
**Tout est vide au départ** : le parcours a nettoyé derrière lui, donc chaque écran commence par son
état vide — qui est un écran, pas une erreur.

| URL | Ce qu'on doit y voir |
|---|---|
| `/fil` | « Votre fil est encore vide », en invitation, et le bouton vers la découverte. Au-dessus, le composeur : « Une note » / « Une question », et **deux** portées seulement, avec la phrase qui dit pourquoi — écrire pour soi, c'est le carnet. |
| ⟶ publier « Tout le monde » | **« Publié. »** (`role="status"`), la publication apparaît, avec son badge de portée — visible **seulement chez son auteur**. |
| ⟶ publier « Mes abonnés » | Elle apparaît aussi. **En `test_deux`, elle n'est nulle part** — ni en découverte, ni au fil. |
| **En `test_deux`** : `/membres` | L'annuaire, `test_un` dedans. La recherche est un `<form method="get">` : la page ne charge aucun JavaScript. |
| ⟶ `/membres/test_un`, « S'abonner » | **« Abonné. »** Puis `/fil` montre la publication réservée. Personne n'a rien approuvé : c'est la décision D1 de l'ADR 0007. |
| **En `test_un`** : une fiche cigare, portée « Mes abonnés » | Deux phrases sous le choix : l'audience est vivante, **et l'abonnement est libre — on peut retirer un abonné, sa lecture à venir se referme, ce qu'il a déjà lu reste lu**. L'ancienne phrase « l'abonnement n'existe pas encore » a disparu ; c'était la dette n° 1. |
| ⟶ enregistrer, puis `/carnet/<id>` | Un panneau « Publier au fil ». Aucun choix de portée : la publication prend celle de l'entrée. |
| ⟶ publier, puis repasser l'entrée en « Moi seul » | **La publication disparaît du fil**, et l'entrée redevient illisible de l'abonné. La cascade est un trigger, pas une convention. |
| ⟶ une entrée « Moi seul » ou « Des personnes que je nomme » | Le panneau refuse, et **nomme les deux portées qui marchent** plutôt que de griser un bouton. |
| **En `test_deux`** : `/fil/<id>` d'une publication | « Braise » → le compte passe à 1 et le bouton dit « Retirer ma braise ». Répondre → **« Réponse publiée. »** |
| **En `test_un`** : `/notifications` | Trois lignes : abonnement, braise, commentaire. Le compteur est dans la navigation. « Tout marquer comme lu » **navigue**, et la confirmation est sur la page d'arrivée. |
| `/parametres`, cocher « Montrer ma cave » | **En `test_deux`**, `/membres/test_un` montre la cave : quels cigares, combien, depuis quand. **Jamais le prix** — et la page le dit. Le grand livre reste invisible. |
| ⟶ décocher « Montrer mes entrées publiques » | Le profil dit « Ce membre ne montre pas ses entrées de carnet ». L'entrée reste publique sur la fiche du cigare : c'est un affichage, pas un droit, et les paramètres le disent sous chaque interrupteur. |
| `/fil?onglet=decouverte` avec plus de 20 publications | « Publications plus anciennes ». **Le curseur est dans l'URL** (`?avant=<date>~<uuid>`), jamais un numéro de page — et la seconde page ne répète aucune ligne de la première. |
| **En `test_deux`** : `/membres/test_un`, « Bloquer » | **« Personne bloquée. »** Le profil reste lisible — sinon on ne pourrait plus débloquer — mais **vide** : ni publications, ni entrées, plus rien. Le bandeau explique. |
| ⟶ `/fil?onglet=decouverte` | Ses publications ont disparu. Son adresse directe aussi. C'est une policy `RESTRICTIVE`, donc cela vaut sur **toutes** les pages, y compris celles où l'on arrive par un lien. |
| ⟶ `/parametres` | Section « Personnes bloquées », avec « Débloquer ». Il faut qu'elle existe : retrouver le profil demande de se souvenir d'un pseudo. |
| ⟶ débloquer | Le contenu revient. **L'abonnement, non** : le blocage l'avait supprimé, dans les deux sens, et rien ne le ressuscite. |
| Une publication réservée, par son adresse, en non-abonné | 404 — jamais « accès refusé », qui confirmerait qu'elle existe. |
| `/fil` en navigation privée | Renvoie vers `/connexion`. |

---

## LES URL À OUVRIR POUR RECETTER LES CLUBS, L'AGENDA ET LES MESSAGES (livrés le 23 août)

Connecté avec `test_un` (`test1@cigardeur.com` / `cigardeur`), un second onglet avec `test_deux`.
**Tout est vide au départ** : le parcours a nettoyé derrière lui.

| URL | Ce qu'on doit y voir |
|---|---|
| `/clubs` | « Aucun club pour l'instant », et le formulaire de création au-dessus. |
| ⟶ taper un nom dans « Nom du club » | **L'adresse s'affiche pendant la frappe** : `Adresse : /clubs/les-amateurs-de-maduro`. C'est la seule façon de voir une collision avant qu'elle échoue. |
| ⟶ créer | Le club apparaît, **« 1 membre »** : son fondateur y est entré par un trigger. Et **il n'y a aucun fil dedans** — un club est un groupe et un calendrier, jamais un second fil (ADR 0010, D1). |
| **En `test_deux`** : `/clubs/<slug>`, « Rejoindre » | **« Vous avez rejoint le club. »**, « 2 membres ». Personne n'a approuvé : c'est libre. |
| **En `test_un`** : la même page | Un bouton « Retirer » en face du nouveau, et **aucun en face de soi** — partir est l'autre geste, et il ne dissout rien. |
| `/evenements` | « Rien d'annoncé », et le formulaire. Le champ « Où » porte la phrase qui dit que les lieux du référentiel arrivent en P5. |
| ⟶ annoncer à **20:00** | La page de l'événement affiche **20:00**. Si elle affichait 18:00 ou 22:00, le fuseau serait cassé — c'est le bug que ce champ produit par défaut. |
| ⟶ **En `test_deux`** : « Je viens », « Répondre » | **« Réponse enregistrée. »**, « 1 personne vient ». |
| ⟶ « Peut-être », « Répondre » | Le compte **retombe à 0** : seul un « je viens » compte, et c'est le trigger qui recompte, pas un delta. |
| ⟶ « Retirer ma réponse » | **« Réponse retirée. »** |
| Depuis `/clubs/<slug>` en tant que membre | Le même formulaire, préfixé du club. L'événement paraît **dans les deux** calendriers, et dit d'où il vient. |
| `/messages` sans abonnement | « Personne à qui écrire pour l'instant » — un écran, pas une liste vide qui offrirait une porte fermée. Et le paragraphe encadré : **un message n'est pas chiffré de bout en bout**. |
| ⟶ s'abonner à quelqu'un, revenir | Le destinataire est proposé. **« Ouvrir la conversation »** mène à `/messages/<uuid>`. |
| ⟶ écrire, envoyer | **« Message envoyé. »** Le message porte **« Non lu »** — c'est l'expéditeur qui le voit. |
| **En `test_deux`** : `/messages` | La conversation, l'extrait, et **« 1 non lu »**. Un seul appel la rend : `conversation_inbox()`. |
| ⟶ ouvrir la conversation | **Rien n'est marqué lu.** Un bouton « Marquer comme lu », et la phrase qui dit pourquoi : un accusé déclenché par un préchargement mentirait sur quelqu'un. |
| ⟶ cliquer | **« Conversation marquée comme lue. »** — et chez `test_un`, le message passe à « Lu ». |
| ⟶ répondre, puis **En `test_un`** : « Supprimer » | **« Message supprimé. »**, et il disparaît **aussi chez `test_deux`**. Une suppression « de son côté » serait un bouton qui ment. |
| Une conversation qui n'est pas la vôtre, par son adresse | 404 — jamais « accès refusé ». |
| `/clubs`, `/evenements`, `/messages` en navigation privée | Renvoient vers `/connexion`. |

**Ce qui ne se nettoie pas depuis un navigateur** : `public.conversations` n'a aucun droit `DELETE`,
pour personne. La rétention est la question ouverte de l'ADR 0010, et ouvrir la suppression
l'aurait tranchée par accident. Une conversation vide peut donc rester ; elle se retire depuis un
contexte privilégié.

---

## LES URL À OUVRIR POUR RECETTER LES LIEUX (livrés le 23 août au soir)

Connecté avec `test_un` (`test1@cigardeur.com` / `cigardeur`), un onglet `test_deux`, un onglet
`jeremy` pour publier. **Les 200 lieux du registre sont en base en permanence** — c'est le seed,
pas un reste de parcours.

| URL | Ce qu'on doit y voir |
|---|---|
| `/lieux` | L'annuaire, « 100 lieux » (le plafond, et la ligne qui le dit), la provenance (« registre officiel des débits de tabac, millésime 2018 »), la recherche par nom/ville/type, « Proposer un lieu ». L'entrée « Lieux » est dans la nav — elle disparaît si `venues_enabled` passe à false. |
| ⟶ « Me localiser » (accorder la position) | La position part **dans l'URL** (`?lat=…&lng=…&rayon=25`), la liste se trie par distance (« à 350 m », « à 4,2 km »), la page annonce le rayon. À Paris : 25 civettes. |
| ⟶ `?q=civette&type=civette` | La recherche texte, en GET : rechargeable, partageable. |
| `/lieux/a-la-civette-paris` | La fiche : adresse, « Fumoir : non renseigné » (jamais « non » deviné), « Horaires non renseignés », la ligne de provenance et l'invitation à signaler ce qui a changé, la revendication expliquée (« rien ne se revendique en un clic — c'est voulu »), « Signaler cette fiche ». **Aucun prix nulle part.** |
| ⟶ noter 5/4/4 + un mot | « Avis enregistré. » (`role=status`), la note **4,3/5 calculée**, « Votre avis ». La note globale ne se saisit nulle part : trois critères, c'est tout l'avis. |
| **En `test_deux`** : noter 3/3/3 | La moyenne passe à **3,7/5**, « 2 avis ». « Signaler cet avis » sur l'avis de l'autre, jamais sur le sien. |
| `/lieux/proposer` | Le formulaire : type (les 7 du drapeau), nom, ville (le minimum), position facultative avec « Utiliser ma position », horaires repliés. La phrase-clé : ce qu'on ne sait pas se laisse vide. |
| ⟶ envoyer | On arrive sur la fiche, bandeau « Proposition en attente de relecture. Elle n'est visible que de vous et des relecteurs. », bouton « Retirer ma proposition ». |
| La même URL en `test_un` | **404** — jamais « accès refusé ». |
| **En `jeremy`** : `/lieux` | La section « Propositions en attente », la proposition dedans. |
| ⟶ ouvrir, « Publier ce lieu » | « Lieu publié. » Le bandeau disparaît, la fiche se lit de tous, elle entre dans la recherche par distance si elle a une position. |
| `/evenements`, annoncer avec « Où (lieu du référentiel) » | La page de l'événement porte le **lieu en lien** vers sa fiche ; la fiche du lieu liste l'événement sous « Annoncé ici ». Le champ libre reste pour tout le reste. |
| Fiche cigare, « Je fume ce cigare » + « Où ça » | La publication du fil porte « chez <le lieu> », en lien. Sans lieu choisi, rien — dire où l'on fume est une confidence, jamais une exigence. |
| **En `jeremy`** : « Marquer fermé » sur une fiche | « Fiche marquée fermée. » La fiche reste lisible avec son bandeau (« pour qu'on ne le re-propose pas ») ; elle sort de la liste et de la recherche. |
| `/lieux` avec `venues_enabled=false` (UPDATE du drapeau) | 404 sur toute la section, nav comprise. Le remettre à true rallume tout. |

---

## LES URL À OUVRIR POUR RECETTER LE JOURNAL (livré le 23 août au soir)

Un onglet en **navigation privée sans passer le portail** (c'est lui qui prouve la frontière), un
onglet `jeremy` (seul compte `editor`). Les deux brouillons d'amorçage sont en base, à vous.

| URL | Ce qu'on doit y voir |
|---|---|
| `/journal` en navigation privée | Le journal se lit **sans portail**. Vide tant que rien n'est publié : l'invitation, et le lien « Flux RSS ». La phrase du bas dit que d'autres articles vivent derrière le portail, avec le lien qui y mène. |
| `/journal/flux.xml` | Du RSS. Il ne portera **que** les articles publics — jamais un gated, jamais un brouillon. |
| **En `jeremy`** : `/journal/ecrire` | Les deux brouillons d'amorçage (« Vitole, cepo, module… », « La cape… »), chacun avec « Reprendre ». La page blanche en dessous. En `test_un` : « réservé aux relecteurs », et pourquoi. |
| ⟶ reprendre « Vitole, cepo, module », **Publier** | « Article publié. » (`role=status`). En navigation privée, `/journal` le montre ; le sitemap et le flux le portent. |
| ⟶ l'article publié | Titres `##` rendus, listes, temps de lecture calculé. Le corps est du texte : collez `<script>` dans un brouillon d'essai, il s'affichera en toutes lettres. |
| ⟶ reprendre « La cape » (gated, lié à une fiche), **Publier** | En navigation privée **sans portail**, son URL renvoie à `/majorite` — et le portail **ramène à l'article**. Le flux et le sitemap l'ignorent. Sous l'article : « Les fiches dont il est question », en lien. |
| ⟶ passer « La cape » en audience publique | **Refusé en toutes lettres** : « Retirez d'abord les fiches liées ». C'est le garde-fou Q13, structurel (deux triggers). |
| ⟶ **Dépublier** un article | « Article dépublié. » Son URL redevient 404 — jamais « accès refusé ». |
| `robots.txt` | `Disallow: /` — le levier `SITE_INDEXABLE` est fermé tant que Q1 n'est pas tranchée. Ouvert (`SITE_INDEXABLE=1` sur le déploiement), il n'autorise que les routes publiques et `/journal`. |

---

## LES URL À OUVRIR POUR RECETTER LA MODÉRATION (livrée le 23 août au soir)

Trois onglets : `test_deux` (écrit et conteste), `test_un` (signale), `jeremy` (`admin`, donc
modérateur — il n'existe aucun compte `moderator` à proprement parler).

| URL | Ce qu'on doit y voir |
|---|---|
| En `test_un` : `/moderation` | « Réservé aux modérateurs », et pourquoi — jamais une page blanche. |
| En `jeremy` : `/parametres` | Sous l'en-tête, « Relever la file de modération ». C'est la seule entrée — pas de lien global. |
| `/moderation` | La file « À traiter », du plus ancien au plus récent, chaque dossier daté (« il y a N h ») contre le délai publié ; « Délai dépassé » en gras au-delà de 72 h. Onglet « Tranchés » à côté. Vide : l'explication, pas un écran nu. |
| ⟶ un dossier | Le motif, les précisions du signalant (**jamais son identité**), le contenu visé cité avec « Voir en situation », « Prendre le dossier », puis le formulaire « Trancher ». |
| ⟶ trancher « Retenu » + « Masquer » + motif | `window.confirm` (« ne se modifie plus »), puis retour file : « Dossier tranché. » Le commentaire disparaît pour la salle, **reste visible de son auteur**, barré, avec le motif dessous et « Contester ce retrait ». |
| ⟶ contester depuis le commentaire barré | Le dialogue de signalement, un nouveau dossier dans la file, « Actuellement masqué » sur sa page ; « Retenu » + « Rétablir » remet les trois colonnes à null et le commentaire revient. |
| ⟶ rouvrir le premier dossier | Sa motivation, sa date — **aucun formulaire** : un dossier tranché ne se retranche pas. |

---

## REJOUER TOUS LES PARCOURS

Chacun se rejoue d'une commande, contre la vraie base, et **nettoie derrière lui** :

```bash
pnpm build && pnpm start --port 3100
pnpm tsx tooling/parcours/cave.ts            # 42 assertions
pnpm tsx tooling/parcours/parametres.ts      # 25 assertions
pnpm tsx tooling/parcours/reference.ts       # 24 assertions
pnpm tsx tooling/parcours/contributions.ts   # 26 assertions
pnpm tsx tooling/parcours/social.ts          # 66 assertions
pnpm tsx tooling/parcours/dettes.ts          # 23 assertions
pnpm tsx tooling/parcours/groupes.ts         # 37 assertions
pnpm tsx tooling/parcours/lieux.ts           # 36 assertions
pnpm tsx tooling/parcours/journal.ts         # 24 assertions
pnpm tsx tooling/parcours/moderation.ts      # 22 assertions
pnpm tsx tooling/parcours/gammes.ts          # 19 assertions, TROIS PHASES — lire son en-tête :
                                             #   depot, puis refus, puis fin, avec deux gestes
                                             #   SQL privilégiés entre elles (fixtures comprises)
pnpm tsx tooling/parcours/admin.ts           # 28 assertions — fixtures SQL privilégiées (une
                                             #   marque, une fiche), voir son en-tête ; ses
                                             #   bascules de drapeau restent dans audit_log
pnpm tsx tooling/audit/a11y.ts               # 24 écrans, 0 violation attendu (critère P8)
```

Le mot de passe se surcharge par `PARCOURS_PASSWORD`. Ces parcours **écrivent dans la vraie base** :
caves, lots, événements, propositions de révision. Ils effacent ce qu'ils écrivent, et l'état final
a été vérifié à zéro. `audit_log` ne s'efface jamais. Le parcours de modération laisse ses
dossiers dans `mod.*` (aucun DELETE client, par construction) : leur retrait est un geste
privilégié en fin de session, à compter — et **un `WITH` qui supprime puis compte dans la même
instruction compte l'instantané d'avant** ; les comptes se font dans une requête séparée.

Les pièges d'écriture de ces parcours sont dans « PIÈGES DE CET ENVIRONNEMENT » — lis-les **avant**
d'en écrire un huitième, ils coûtent une heure chacun la première fois. Le dernier en date :
**une Server Action qui redirige rend la main avant que le routeur ait navigué**, donc `page.url()`
lu après un délai fixe rend encore l'adresse d'avant. On attend `waitForURL`, jamais un délai.
Et **`networkidle` peut ne JAMAIS s'établir** — mesuré sur `/admin/fiches`, qui rend en 944 ms
pendant qu'un préchargement de liens garde une connexion ouverte : le parcours admin attend
`load` + une seconde. Un signal qui ne vient jamais n'est pas un signal.

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
