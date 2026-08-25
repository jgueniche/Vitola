# supabase/ — conventions

## Deux règles absolues

1. **Jamais de modification via l'interface Supabase** (§0.4). Toute évolution du schéma est une
   migration versionnée dans `migrations/`, relue et rejouable. Une base dont l'état ne se
   reconstruit pas depuis ce dossier est une base perdue.
2. **RLS activée dès la création de chaque table, avec au moins une policy explicite** (§0.5).
   Chaque migration se termine par l'auto-contrôle qui échoue s'il manque l'une ou l'autre.

## Écrire une migration

```sql
-- au début
begin;
-- ... DDL, index, grants, policies ...
-- à la fin : l'auto-contrôle (copier depuis 0001_p1_referential.sql §11)
commit;
```

Ordre des sections, qui est aussi l'ordre des dépendances : extensions → enums → fonctions
partagées → tables → recherche → index → grants → RLS → storage → auto-contrôle.

## Pièges avérés

- **`SET LOCAL ROLE` hors transaction est ignoré.** Un test RLS qui l'oublie tourne en
  superutilisateur et passe toujours. Ouvrir un `BEGIN` explicite dans chaque test.
- **Une fonction `language sql` est validée à sa création.** Elle ne peut pas référencer une table
  définie plus bas dans le même fichier. Ordonner, ou passer en `plpgsql`.
- **`authenticated` a besoin de `USAGE ON SCHEMA extensions`.** Sans ce grant, toute contrainte
  `CHECK` appelant `slugify()` ou `unaccent()` fait échouer les `INSERT` clients.
- **Ne jamais mettre `FORCE ROW LEVEL SECURITY` sur `public.profiles`.** Le propriétaire de
  `current_app_role()` serait alors soumis aux policies que cette fonction évalue : récursion
  infinie. Toutes les autres tables sont en `FORCE`.
- **`search_path = ''` impose de qualifier les configurations de recherche** :
  `to_tsvector('pg_catalog.french', …)`, jamais `'french'`.
- **Un `CHECK` ne peut pas appeler `current_date`.** La règle des 18 ans vit dans un trigger.
- **Une policy qui interroge une table interroge aussi ses droits.** La branche `shared` de
  `reviews` lit `review_shares`, sur laquelle `anon` n'a aucun `GRANT` : un simple
  `select from reviews` en tant qu'anonyme échouait sur « permission denied for table
  review_shares ». Découpez les policies **par rôle** — `to anon` ne doit contenir que des
  branches qu'un anonyme peut évaluer. Elles sont OR-ées, le résultat est le même, et une branche
  morte n'est jamais planifiée.
- **Deux tables dont les policies se lisent l'une l'autre : récursion, même sans boucle de
  données.** PostgreSQL détecte le cycle sur le **graphe des policies**, pas sur le chemin
  d'exécution. `reviews` ↔ `review_shares` en est un ; le raisonnement « en pratique ça ne
  reboucle pas » est faux et l'erreur est `infinite recursion detected in policy`. On coupe du
  côté **froid** — celui qu'on écrit rarement — par une fonction `SECURITY DEFINER` :
  `public.owns_review()`, comme `current_app_role()` avant elle. Le chemin chaud reste un `EXISTS`
  ordinaire, servi par son index.
- **`alter default privileges` est par schéma.** Celui de 0002 ne couvrait que `public` ; les deux
  fonctions de trigger de `ref` sont restées appelables par un visiteur anonyme depuis le premier
  jour, et le test censé le voir filtrait lui aussi sur `public`. Corrigé par 0005. Leçon générale :
  **un contrôle qui ne regarde qu'un schéma ne protège qu'un schéma.**
- **BYPASSRLS ne dit rien des droits de table.** `service_role` contourne la RLS, donc on le
  suppose capable de tout ; il n'avait **aucun droit** sur `ref` jusqu'à la 0007, et l'export RGPD
  répondait 500 à tout membre connecté. Même cause que le piège précédent, à l'envers :
  l'amorçage de Supabase est **par schéma** lui aussi — il accorde tout sur `public` et ignore les
  schémas qu'on crée soi-même. Un schéma neuf doit accorder explicitement à `service_role` ce dont
  le code serveur a besoin, et rien de plus.
- **Un auto-contrôle de migration ne peut pas attraper ce que sa migration vient de corriger.**
  Elle accorde puis vérifie : le contrôle passe toujours. La régression future ne se voit que
  depuis un fichier de `tests/` qui n'accorde rien — ici `06_service_role_reads.sql`.
- **La clé de service passe par PostgREST comme tout le monde.** C'est le piège le plus coûteux de
  ce dépôt après l'exposition des schémas, parce qu'il contredit l'intuition : `service_role`
  contourne la RLS (`BYPASSRLS`), donc on le croit capable de tout. Il ne l'est pas — il n'a
  **aucun droit de table dans `mod`**, seul `postgres` en a, et `mod` n'est de toute façon pas
  exposé. Un `insert` depuis `app/api/**` n'aboutit pas, quel que soit le code écrit au-dessus.
  Le passage est une fonction `SECURITY DEFINER` dans `public`, propriété de `postgres`, accordée
  à `service_role` **et à personne d'autre** : `public.file_report()` (0006). Une porte de la
  taille du geste, pas une réouverture du schéma.
- **Le type d'un schéma non exposé ne se met pas dans la signature d'une fonction exposée.**
  PostgREST doit résoudre chaque type pour le sérialiser. `file_report()` prend donc son motif en
  `text` et le cast en `mod.report_reason` à l'intérieur : l'enum valide toujours, simplement une
  valeur inconnue ressort en `22P02` au lieu d'être refusée à la porte.
- **PostgreSQL analyse une condition d'un seul tenant, court-circuit compris.** Écrit
  `if pg_cron existe and cron.job ne contient rien`, l'auto-contrôle de 0006 échouait sur
  « relation "cron.job" does not exist » là où la garde devait précisément l'éviter. La branche
  non évaluée est quand même **analysée**. Un `if` imbriqué, ou un `execute`, diffère l'analyse.
- **Un trigger en droits d'appelant ne peut appeler que ce que l'appelant peut appeler.**
  `tg_protect_profile_privileges()` appelait `is_privileged_context()`, que la 0002 avait fermée aux
  clients — délibérément et avec raison. Résultat : **aucun membre n'a pu modifier son profil depuis
  P1**, et rien ne l'a vu parce qu'aucun écran n'écrivait dans `profiles`. Le prédicat est descendu
  dans le trigger (0009) et l'auxiliaire a été retiré : une fonction qu'aucun trigger en droits
  d'appelant ne peut appeler n'est pas un auxiliaire, c'est un piège tendu au prochain garde-fou.
  La garde générale vit dans `tests/02_function_grants.sql` et lit les **corps**, parce que plpgsql
  ne déclare aucune dépendance — c'est exactement ce qui a rendu ce bug invisible aux outils.
- **La correction la plus tentante est parfois celle qui désarme le test.** Passer ce trigger en
  `SECURITY DEFINER` l'aurait fait tourner en tant que `postgres`, donc `current_user in
  ('postgres', …)` aurait été **vrai**, donc le garde-fou aurait été sauté pour tout le monde. Vert,
  et ouvert.
- **Une transaction ne demande pas un privilège.** `SECURITY DEFINER` est le réflexe quand deux
  tables doivent s'écrire ensemble ; il est presque toujours de trop. Un appel PostgREST **est**
  une transaction, donc une fonction `SECURITY INVOKER` en `plpgsql` écrit les deux lignes sous la
  RLS de l'appelant et ne peut rien écrire qu'il n'aurait pu écrire à la main :
  `public.smoke_from_humidor()` (0008). `file_report()` a payé le privilège parce que `mod` est
  injoignable autrement — c'est une exception, pas un modèle. L'auto-contrôle de 0008 échoue si la
  fonction repasse un jour en `DEFINER`.
- **Une vue sans `security_invoker` s'exécute avec les droits de son propriétaire**, c'est-à-dire
  `postgres`, c'est-à-dire toutes les lignes de tout le monde. Une vue qui lit des tables sous RLS
  doit porter `with (security_invoker = true)`, et l'auto-contrôle de 0008 le relit dans
  `reloptions` — comme celui de 0003 relit le prédicat de `cigar_stats`.
- **Une colonne dénormalisée se recalcule par la somme, jamais par un delta.** Un trigger qui
  incrémente se trompe une fois et ment ensuite pour toujours ; un trigger qui refait
  `sum()` sur le grand livre se répare au mouvement suivant. `humidor_items.qty` (0008), asserté
  par V16 de `tests/07_cave_rls.sql`, qui casse volontairement la colonne pour vérifier qu'elle
  se remet.
- **Une contrainte peut être parfaitement cohérente et parfaitement fausse.**
  `aging_start_date >= purchase_date` a été écrite, appliquée, testée verte, puis retirée le jour
  même : une boîte achetée vieillie se repose **avant** d'être achetée. Aucune assertion ne
  l'aurait vue, parce que rien dans le SQL ne dit ce qu'une date signifie. Ce genre de bug se
  trouve en rangeant une vraie boîte dans un vrai navigateur.
- **Une policy résout un nom nu dans la portée la plus INTERNE.** La policy
  d'insertion de `posts` comparait la portée d'une publication à celle de
  l'entrée qu'elle pointe : `where r.id = review_id and r.visibility = visibility`.
  `reviews` a une colonne `visibility`, donc la condition comparait la colonne à
  elle-même et valait **toujours vrai** — une publication publique sur une entrée
  réservée aux abonnés était acceptée. Qualifier la table extérieure
  (`posts.visibility`) est la correction ; la relecture ne trouve pas ce bug,
  parce que l'expression est juste à l'œil. Assertion P3 de `tests/09_social_rls.sql`.
- **Une policy permissive de plus ne peut jamais RETIRER une ligne.** Elles sont
  OR-ées : c'est la bonne sémantique pour ouvrir (`show_humidor`, la branche
  `followers`), et c'est l'inverse de ce qu'il faut pour un blocage. Un blocage
  est un `AND`, donc une policy `as restrictive`, et il n'y a pas d'autre
  mécanisme dans PostgreSQL qui dise cela.
- **Une policy restrictive s'ajoute aussi pour EMPÊCHER une ouverture de
  cascader.** Les trois tables filles de `humidors` ne redisent pas la propriété :
  elles rejoignent le parent par un `EXISTS` soumis à sa RLS. Ouvrir `humidors`
  pour `privacy.show_humidor` ouvrait donc **le grand livre**, c'est-à-dire quand
  la personne a fumé quoi — la donnée que le carnet protège par un défaut
  `private`, republiée par une porte de côté. Trois policies restrictives
  propriétaires referment cela, et l'auto-contrôle de 0010 vérifie qu'elles y
  sont : rien ne casse si elles disparaissent, une lecture rend simplement plus.
- **Un prédicat dans une policy s'évalue une fois PAR LIGNE examinée.**
  `blocks_between(author_id)` en `SECURITY DEFINER` coûtait 2 420 appels pour
  rendre vingt lignes de fil — l'essentiel du coût de la page. La même règle
  rendue sous forme de **tableau** par une fonction sans argument s'évalue une
  seule fois, en InitPlan, dès qu'on l'enveloppe dans `(select …)` : c'est le
  geste de `(select auth.uid())` de la 0003, appliqué à une fonction. 29 ms → 2 ms.
  Écrire `x = any ((select f())::uuid[])` : sans le cast, `ANY (sous-requête)` est
  la forme ensembliste et PostgreSQL refuse `uuid = uuid[]`.
- **Le planificateur ne voit pas à travers un paramètre.** Une fonction qui
  choisit sa branche par un argument — `(p_scope = 'discover' and …) or
  (p_scope = 'following' and …)` — ne peut prouver aucune des deux, donc elle
  n'utilise aucun index partiel et trie la table. 258 ms sur 50 000 lignes contre
  2,5 ms pour la même requête écrite en dur. Un `if` en plpgsql sépare les deux
  et chacune est planifiée sur un prédicat constant. Corollaire : `set search_path
  = ''` empêche l'*inlining* d'une fonction `language sql`, donc une fonction SQL
  paramétrée du dépôt ne sera jamais inlinée — le `if` n'est pas une option de
  style.
- **Un filtre d'ONGLET n'est pas un filtre de DROIT, et les confondre coûte une
  page.** `feed_page(scope => 'discover')` filtre `visibility = 'public'` dans son
  corps : cela dit de quoi la page parle. Le réutiliser pour lire *une*
  publication rendait toute publication réservée introuvable à son adresse, y
  compris pour son auteur — donc impossible à supprimer. Lire un fil et lire une
  ligne sont deux questions ; `post_card()` (0013) est la seconde, et elle n'a
  aucun prédicat d'audience du tout.
- **Un `upsert` PostgREST écrit TOUTES les colonnes de sa charge dans le `DO UPDATE`.**
  `event_attendees` accorde `insert (event_id, user_id, status)` et
  `update (status)` seulement — une réponse ne déménage pas vers un autre
  événement ni vers quelqu'un d'autre. Un upsert devient
  `insert … on conflict (event_id, user_id) do update set event_id = excluded.event_id,
  user_id = …, status = …`, donc il demande l'UPDATE sur les trois colonnes et
  se fait refuser en `42501`. Et comme une écriture refusée **rend zéro ligne
  au lieu de lever**, l'écran se repeignait sur « 0 personnes viennent » sans
  message nulle part. Le geste correct sous des droits de colonne est
  `update` puis `insert` si rien n'a bougé — deux instructions, chacune dans
  son droit, chacune relue. Trouvé au deuxième clic dans un navigateur, jamais
  par un type ni par une policy.
- **Une vue matérialisée n'accepte pas de RLS.** `cigar_stats` n'est sûre que par son
  `where visibility = 'public'` : ce prédicat est la frontière de sécurité, pas une optimisation.
  L'auto-contrôle de 0003 relit `pg_get_viewdef()` pour vérifier qu'il y est toujours.

## Colonnes que le client ne doit jamais écrire

`profiles.role`, `profiles.reputation`, `profile_settings.adult_confirmed_at`,
`cigars.search_vector`. Barrées deux fois : absentes de tout `GRANT`, et refusées par un trigger
de garde. Ne pas relâcher l'une en pensant que l'autre suffit.

Depuis 0003 et 0004, cinq de plus, barrées par le seul `GRANT` de colonne — et assertées par
l'auto-contrôle de leur migration : `reviews.user_id` et `reviews.cigar_id` (une entrée ne change
ni d'auteur ni de cigare), `comments.hidden_at`, `comments.hidden_by` et `comments.hidden_reason`
(masquer est un acte de modération, écrit par du code à clé de service — y compris pour un
modérateur connecté).

Depuis 0008, deux de plus, et l'une d'elles a une nuance qui vaut d'être lue :
`humidor_items.cigar_id` (un lot ne change pas de cigare) et **`humidor_items.qty`, qui est dans
le `GRANT INSERT` et dans aucun `GRANT UPDATE`**. Déclarer ce qu'on vient d'acheter est un
inventaire d'ouverture ; changer un stock est un événement. C'est cette nuance qui permet à
l'ajout d'un lot de rester une seule requête — un trigger `after insert` en tire l'événement
`add` — donc atomique sans fonction. Les deux sens sont assertés : que `qty` reste insérable et
qu'elle ne soit jamais modifiable.

Depuis 0022, quatre de plus, dont trois d'une famille nouvelle : `shop.products.vendor_id` est
dans le `GRANT INSERT` et dans aucun `GRANT UPDATE` (un produit ne change pas de vendeur — le
motif de `reviews.user_id`), et **`vendors.status`, `vendors.owner_id` et
`products.review_note` sont dans le `GRANT UPDATE` mais gardés par un trigger** : un grant de
colonne ne sait pas distinguer deux rôles applicatifs (`admin` et vendeur) du même rôle
PostgreSQL (`authenticated`). Les triggers de garde suivent la lettre de la 0009 — prédicat de
privilège inline, `SECURITY INVOKER`, `has_min_role()` appelable par l'appelant — parce que
chacun des trois écarts de cette recette a déjà coûté son bug.

## Seed

Aucun scraping, jamais (§2, art. L341-1 CPI). Chaque ligne de `seed/*.csv` doit être justifiable
dans `seed/PROVENANCE.md`. C'est une contrainte juridique, pas une préférence : en cas de
contestation, la charge de la preuve nous incombe.

```bash
cd supabase/seed && psql -v ON_ERROR_STOP=1 -f seed.sql   # idempotent, rejouable
```

Sans psql ni connecteur, il existe `seed_standalone.sql` : même logique, données inlinées, aucune
méta-commande, collable dans l'éditeur SQL du tableau de bord. Il est **généré** — après toute
modification d'un CSV, relancer `pnpm tsx tooling/scripts/build-standalone-seed.ts`, faute de quoi
la CI échoue.

Trois règles sur l'amorçage :

1. **Il ne publie rien.** Les fiches arrivent en `draft`. `supabase/tests/01_seed_integrity.sql`
   échoue si une seule est publiée — une donnée non relue ne doit jamais être visible.
2. **L'incertitude se signale, elle ne se cache pas.** Une dimension douteuse porte
   `Dimensions à vérifier` ; une vitole inconnue reste vide plutôt que d'être approximée. Un
   référentiel qui promet d'être vérifié ne peut pas combler ses trous par des suppositions.
3. **Le rejeu ne duplique pas.** La clé de rapprochement est le slug. Vérifié en CI.
