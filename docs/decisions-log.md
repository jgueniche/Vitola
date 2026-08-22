# Journal des micro-décisions

Ce qui ne mérite pas une ADR mais qu'il faut pouvoir retrouver. Ordre antichronologique.

## Signalement DSA, commentaires à l'écran, roue des arômes

Migration 0006 et seed section 6, appliqués sur le projet réel le 22 août 2026. Ce qui manquait
pour que l'ADR 0005 soit tenue : la file existait, le délai était déclaré, **le moyen d'écrire dans
la file n'existait pas**.

**La clé de service ne suffisait pas, et c'est le point le plus contre-intuitif de la session.**
`service_role` contourne la RLS — il porte `BYPASSRLS` — donc on le croit capable de tout. Vérifié
sur le projet plutôt que supposé : il n'a **aucun droit de table dans `mod`**, seul `postgres` en a,
et `mod` n'est de toute façon pas exposé à PostgREST. Un `insert` depuis `app/api/**` n'aurait
jamais abouti, quel que soit le code écrit au-dessus. Le passage est celui que
`lib/compliance/gdpr.ts` annonçait déjà en toutes lettres — « Closing this needs a SECURITY DEFINER
RPC in public, and it ships with the reporting endpoint » : `public.file_report()`, propriété de
`postgres`, accordée à `service_role` et à personne d'autre. Le schéma reste fermé ; ce qui traverse
est une porte de la taille d'un geste.

**L'export RGPD se referme dans la même migration que celle qui ouvre le trou.** Trois liens vers
`mod` étaient déclarés `unreachable` avec, pour motif, « aucun signalement n'existe aujourd'hui ».
Cet argument meurt à la ligne où le premier signalement devient possible.
`public.moderation_records_for_subject()` les rend à leur sujet, et `PERSONAL_DATA_SOURCES` gagne
une troisième forme :
`RpcSource`. La forme `UnreachableSource` reste déclarée bien qu'elle n'ait plus d'occurrence —
c'est là que la prochaine omission devra s'argumenter.

**Le seuil de la déduplication porte sur un dossier ouvert, pas sur une cible.** Deux signalements
du même membre sur le même contenu tant que rien n'est tranché : un doublon, renvoyé tel quel. Après
décision : un nouveau dossier. L'inverse — dédupliquer sur la cible seule — fermerait la porte pour
toujours, y compris quand le contenu change après coup. Assertion S8.

**Le frein horaire vit dans la fonction SQL, faute de mieux.** Le §8 prévoit Upstash pour le rate
limiting ; il arrive en P4. En attendant, compter les lignes est le garde-fou disponible, et il ne
peut pas vivre dans la route, qui ne sait pas lire `mod`. Vingt par heure et par signalant : le
seuil vise le script, pas la personne qui signale plusieurs commentaires d'un même fil.

**`/mentions-legales` est devenue dynamique, et c'est le bon compromis.** Elle lit
`feature_flags.dsa_report_sla_hours` à chaque rendu. La page pourrait rester statique avec un client
sans cookies et une revalidation ; ce serait un délai publié potentiellement périmé, sur un engagement.
Toujours frais vaut mieux que toujours caché. La page d'accueil, elle, reste statique — c'est elle
qui porte le Lighthouse de la Q13, pas celle-ci. Le repli, lui, ne tombe jamais : `reportSlaHours()`
avale l'erreur et rend la constante épinglée, parce qu'une page juridique qui refuse de s'afficher
est une page qui a cessé en silence de prendre son engagement. Un test e2e le prouve **sans base de
données** — c'est exactement la classe de panne d'`AGE_GATE_SECRET` chez Vercel.

**Aucun filtre lexical sur les commentaires, et c'est écrit dans la charte.** L'ADR 0005 l'avait
mesuré ; `docs/editorial-guidelines.md` gagne la section « Contenu versé par des tiers » qui en tire
la règle : le critère est **l'incitation, pas le vocabulaire**. Le tableau des quatre commentaires
ordinaires refusés par `isShopTextAllowed()` y figure, avec le détail qui fait mal — le seul des six
à passer le filtre est celui qui ne dit rien de vérifiable.

**Le rafraîchissement de `cigar_stats` est planifié, pas déclenché.** `refresh_cigar_stats()`
existait depuis 0003 et rien ne l'appelait : la moyenne d'une fiche serait restée vide pour
toujours. Une tâche `pg_cron` toutes les cinq minutes est le filet — elle ne dépend d'aucun code
futur qui se souviendrait d'appeler, et elle rattrape la fenêtre de 90 jours de `review_count_90d`,
qui se périme **sans qu'aucune écriture n'ait lieu**. Le rafraîchissement à l'écriture, lui, arrive
avec le carnet : c'est le chemin qui sert la personne, et il n'a rien à servir tant que rien
n'écrit. `pg_cron` n'existe ni en local ni sur l'image de la CI ; la section se déclare absente par
un `NOTICE` et son auto-contrôle exige la planification partout où l'extension est là.

**La roue des arômes est un seed, pas une migration.** C'est du contenu éditorial : il se relit, se
corrige et se rejoue comme les CSV voisins. Conséquence non évidente — `seed.sql` écrit désormais
dans `public` et plus seulement dans `ref`, donc la base de seed de la CI doit appliquer 0003 avant
de charger. Une famille `Défaut` aussi fournie que les autres, et aucun descripteur ne nomme le
tabac : une nomenclature qui ne saurait nommer que l'agréable serait un outil promotionnel au sens
du §2.

**`/aromes` existe parce qu'un schéma sans écran ne compte pas.** Une nomenclature que personne ne
peut lire est une table, pas un vocabulaire — et les oublis d'une roue ne se voient qu'à plat,
jamais dans un CSV. Dessinée en listes et non en cercle : la forme circulaire du §5.4 appartient au
**contrôle de saisie** de la dégustation, où la géométrie travaille. Ici il n'y a rien à
sélectionner, et un cercle serait de la décoration.

**Une règle ESLint avait un trou de la taille exacte de ce qu'on écrivait.** L'interdiction
d'importer le client `service_role` couvrait `app/**/*.tsx` — pas `app/**/*.ts`. Le premier
`actions.ts` hors de `app/api` tombait précisément dedans. Jamais exploité ; un garde-fou ne se juge
pas là-dessus.

## Schéma du carnet, des commentaires et de la modération

Migrations 0003 à 0005, appliquées sur le projet réel le 22 août 2026. Elles exécutent les ADR 0004
et 0005, acceptées le même jour. Le carnet relève de P2, les commentaires de P1 — c'est l'ADR 0005
qui avance leur échéance ; les deux arrivent ensemble parce que `cigar_stats` et `comments` lisent
la même fiche.

**Une policy qui interroge une table interroge aussi ses droits.** La branche `shared` de `reviews`
lit `review_shares`, sur laquelle `anon` n'a aucun `GRANT`. Écrite en une seule policy
`to anon, authenticated`, elle faisait échouer un simple `select from reviews` en tant qu'anonyme :
« permission denied for table review_shares ». C'est-à-dire la lecture publique cassée, exactement
comme `current_app_role()` l'avait cassée en 0002 — et par le même mécanisme, un an de leçons plus
tard. Les policies sont donc découpées **par rôle** : `to anon` ne contient que la branche
`visibility = 'public'`. Elles sont OR-ées, le résultat est identique, et une branche qu'un
anonyme ne peut pas évaluer n'est jamais planifiée pour lui. Trouvé par l'assertion C4, pas en
relisant.

**Deux policies qui se lisent l'une l'autre, c'est une récursion — même sans boucle de données.**
L'ADR 0004 affirmait le contraire, en raisonnant sur le chemin d'exécution : `review_shares` lit
`reviews` pour l'auteur, `reviews` lit `review_shares` pour les destinataires, mais aucun aller-
retour réel ne semblait possible. PostgreSQL ne raisonne pas ainsi : il détecte le cycle sur le
**graphe des policies**, et refuse avec `infinite recursion detected in policy for relation
"review_shares"`. Le cycle est coupé du côté froid — partager est rare, lire est constant — par
`public.owns_review()`, en `SECURITY DEFINER`, qui ne répond que sur son appelant. Le chemin chaud
reste un `EXISTS` ordinaire servi par `review_shares_grantee_idx`. La correction est consignée dans
l'ADR, qui n'est pas réécrite pour autant : la décision tenait, c'est son mécanisme qui manquait
d'une pièce.

**`cigar_stats` est une vue matérialisée : elle n'accepte aucune RLS.** Son
`where visibility = 'public'` n'est donc pas une optimisation, c'est la frontière de sécurité
entière — même forme que le filtre par sujet de l'export RGPD. L'auto-contrôle de 0003 relit
`pg_get_viewdef()` et casse la migration si le prédicat disparaît. L'assertion C10 le vérifie par le
comportement, avec des notes choisies pour que les deux cas soient impossibles à confondre : quatre
entrées à 91, 50, 60 et 70, dont une seule publique. Tout compter donnerait 67,75 sur quatre ; on
mesure 70,0 sur une.

**Le seuil de prise de parole vit dans un drapeau, pas dans une policy.** L'ADR 0005 laissait la
question ouverte et je recommandais `contributor`. Appliqué tel quel, cela livrait une
fonctionnalité que personne ne peut utiliser : `contributor` vaut 50 points de réputation, soit
cinq révisions approuvées, et la réputation démarre à zéro. Le défaut retenu est donc `member`, dans
`feature_flags.comments_min_role`, lu par `public.comment_min_role()`. Le risque couvert — le spam —
est par ailleurs nul tant que `public_signup_open` est à `false` et qu'il existe trois comptes.
Resserrer est un `UPDATE` d'une ligne ; desserrer après que des gens se sont exprimés ne l'est pas.
**À rouvrir le jour où l'inscription s'ouvre.** L'assertion M14 vérifie que le drapeau agit dans les
deux sens, pas seulement qu'il refuse.

**Le schéma `mod` n'est pas exposé à PostgREST, et l'export RGPD le déclare.** Qui a signalé qui, et
ce qu'un modérateur en a fait, est la donnée la plus sensible du produit : la RLS est la première
barrière, l'injoignabilité la seconde. Conséquence assumée : la clé de service passe par PostgREST
comme tout le monde, donc l'export ne peut pas lire ces trois liens. Ils sont **déclarés** dans
`PERSONAL_DATA_SOURCES` avec le motif de leur absence, que le type rend obligatoire et qu'un test
vérifie non vide. Une omission d'une demande d'accès se motive, elle ne se découvre pas. À refermer
par un RPC `SECURITY DEFINER` le jour où l'endpoint de signalement existe — il n'y a aujourd'hui
aucun signalement.

**Un contrôle qui ne regarde qu'un schéma ne protège qu'un schéma.** Les advisors Supabase, relancés
après 0004, ont relevé neuf avertissements dont quatre inattendus :
`ref.tg_cigars_search_vector()` et `ref.tg_touch_dependent_cigars()`, toutes deux `SECURITY
DEFINER`, appelables par `anon` et `authenticated` via `/rest/v1/rpc/…` **depuis le premier jour**.
Ce n'est pas une régression de 0003 ni 0004 : la migration 0002 avait fermé ce trou, mais son
auto-contrôle et `supabase/tests/02_function_grants.sql` filtraient tous deux sur
`pronamespace = 'public'`. Le fichier qui existait pour voir ce trou ne pouvait pas le voir. La
0005 ferme les deux fonctions **et** élargit le contrôle à `ref` et `mod` — l'élargissement compte
plus que la correction, sans lui elle se reperdrait à la prochaine fonction. Neuf avertissements
tombent à cinq ; lecture publique vérifiée intacte après coup, en HTTP anonyme réel : 940 fiches,
114 marques, écriture refusée en 42501.

## Phase 1 — conformité RGPD

**Les endpoints RGPD lisent avec la clé de service, et c'est la RLS qui l'impose.** Contre-intuitif
sur un dépôt où tout passe par la RLS : `audit_log` n'a **aucune** policy `SELECT` pour un membre,
seulement `audit_log_select_admin`. Un export bâti sur la session du demandeur serait donc
silencieusement incomplet — il rendrait un fichier d'apparence entière, amputé de la seule table qui
trace ce qu'on a fait de ses données. La clé de service est le seul moyen d'être complet, et le
filtre `.eq(colonne, id)` devient alors toute la frontière de sécurité : il est écrit à **un seul
endroit**, `collectPersonalData`, et un test vérifie que les 14 sources y passent.

**L'inventaire des données personnelles est vérifié par le compilateur, puis par le schéma.** Deux
garde-fous superposés, parce qu'aucun des deux ne suffit. Le type mappé de `lib/compliance/gdpr.ts`
refuse une table ou une colonne qui n'existe pas dans `database.types.ts` — vérifié en cassant
volontairement les deux cas. Et `tests/compliance/gdpr-inventory.test.ts` relit le SQL : les
13 colonnes qui référencent `auth.users` doivent toutes être déclarées, **et** la portée annoncée
(`erased` / `anonymised`) doit correspondre au `ON DELETE` réel. Une source documentée « anonymisée »
qui casserait en cascade est pire qu'une source non documentée : c'est une promesse que la base ne
tient pas. Confronté à la base déployée, pas seulement au fichier : les 13 correspondent.

**Effacer un contributeur détruit ses propositions de révision.** `ref.cigar_revisions.author_id`
est `NOT NULL` : la clé étrangère ne peut que cascader, là où tous les autres liens vers un membre
sont `on delete set null`. Un partant emporte donc ses révisions, y compris celles qu'un tiers a
relues. C'est un trou réel dans l'historique du wiki. Il n'est pas corrigé ici — cela demande une
migration et une décision sur ce qu'est une révision sans son auteur — mais l'effacement en
enregistre le **nombre** dans `audit_log`, pour que la perte soit mesurée et non découverte.

**La trace précède l'effacement, et son échec l'annule.** `audit_log.actor_id` sera mis à NULL par la
cascade quelques millisecondes plus tard : c'est `entity_id`, simple texte sans clé étrangère, qui
survit. Il ne contient que l'identifiant — ni pseudo, ni adresse. Une fois `auth.users` parti,
il ne désigne plus personne, et c'est précisément l'intention.

**`ip_hash` n'est jamais écrit.** La colonne existe pour le jour où un haché poivré servira à
quelque chose. En écrire un aujourd'hui ajouterait une donnée personnelle **et** un secret
obligatoire de plus — pour rien. Le §2 demande de tracer qui a fait quoi, pas d'où.

**L'effacement se confirme en retapant son pseudo.** Pas une case à cocher : le geste est immédiat
et irréversible. Accessoirement, une valeur que seul le titulaire connaît est une valeur qu'une
requête d'une autre origine ne peut pas porter.

**`/api/health` sert désormais le commit déployé.** La branche par défaut du dépôt et `master` sont
deux réglages distincts, et Vercel déploie la première : une fusion dans `master` seule ne change
rien en production, et rien sur le site ne le dit. Le commit rend l'écart visible d'une requête HTTP.
La phase, elle, a répondu `P0` pendant tout P1 — un littéral enfoui dans un handler dérive parce que
rien ne le relit. Elle vit maintenant dans `lib/release.ts`, épinglée par un test.

## Phase 1 — identité

**`@supabase/ssr`, la deuxième et dernière dépendance de P1.** Annoncée quand la consultation
anonyme a été livrée : elle ne sert qu'à porter une session à travers les cookies, ce dont une
lecture anonyme n'avait pas besoin. Elle est devenue nécessaire le jour où il a fallu un auteur.

**Lien magique, pas de mot de passe.** Un mot de passe sur un site qui traite du tabac est un
identifiant qui vaut d'être volé pour ce qu'il dit de son porteur, et en stocker un n'achète rien
ici. Le lien est à usage unique et valable une heure. **Attention QA** : le SMTP intégré de Supabase
est limité à quelques envois par heure — une connexion suffit, la session dure.

**Le rafraîchissement de session vit dans le middleware, avec l'age gate.** Non par commodité :
seul le middleware peut réécrire un cookie, un Server Component ne le peut pas. Sans cela un membre
connecté est déconnecté en silence à l'expiration de son jeton — exactement la classe de bug du
portail qui redemandait la date de naissance, évitée au même endroit.

**`getUser()`, jamais `getSession()`.** `getSession()` fait confiance au cookie tel qu'il se
présente, et un cookie se forge. `getUser()` interroge le serveur d'authentification. C'est toute la
différence entre une session et une affirmation.

**Le callback accepte `code` ET `token_hash`.** `code` vient d'un flux PKCE, ce que produit
`signInWithOtp` côté serveur — le chemin normal. `token_hash` est ce qu'émettent les gabarits de
courriel récents de Supabase et l'API d'administration. N'en gérer qu'un casse le flux le jour où
quelqu'un modifie le gabarit, sans que rien dans le code ne suggère pourquoi.

**`/auth/callback` est public, et c'est asserté.** `tests/unit/routes.test.ts` énumère
exhaustivement `PUBLIC_PATHS` : ajouter une route publique est un acte délibéré, pas un oubli. Le
callback doit être joignable avant le portail, sinon la session n'est jamais établie — il ne rend
rien, il pose des cookies et redirige.

**L'en-tête ne lit la session que derrière le portail.** `SiteHeader` n'est rendu que dans
`app/(app)/`, dont les routes sont déjà dynamiques. La page d'accueil reste statique et cacheable,
ce dont dépend le Lighthouse SEO ≥ 95 de Q13.

## Phase 1 — référentiel consultable

**`@supabase/supabase-js`, et elle seule.** Le §3 demande une justification par dépendance.
Celle-ci porte tout l'accès aux données ; l'écrire à la main voudrait dire réimplémenter PostgREST,
ses filtres et son encodage des jointures. `@supabase/ssr` n'est **pas** installée : elle ne sert
qu'à porter une session d'authentification à travers les cookies, et la consultation du référentiel
est anonyme. Elle viendra avec `connexion/`, avec sa propre justification. `nuqs` était déjà là mais
n'est pas utilisée : les facettes sont des liens lus côté serveur, sans état client.

**Le schéma `ref` a dû être exposé à PostgREST.** Un projet Supabase n'expose que `public` et
`graphql_public` ; `ref` en était absent, donc aucune requête client n'aurait résolu, quel que soit
le code. Changement de configuration du projet, pas du schéma. La RLS gouverne exactement comme
avant — vérifié par requête HTTP anonyme réelle : 114 marques lisibles, 0 fiche sur 940 (toutes en
brouillon), écriture refusée en 42501.

**Les facettes sont des liens, pas des cases à cocher.** Aucun JavaScript client sur la recherche :
chaque option est un `<a>` vers l'URL que la page aurait avec la facette basculée. La recherche est
donc partageable, fonctionne avant hydratation, et l'état vit dans l'URL comme le veut
`app/CLAUDE.md`. Le champ texte est un `<form method="get">` pour la même raison.

**Le repliement des accents est dupliqué en TypeScript, à contrecœur.** `search_vector` est bâti sur
`immutable_unaccent()`, donc une requête non repliée ne remonte rien — en silence. L'alternative
propre (un RPC qui replie côté serveur) mettait un aller-retour devant chaque recherche. La
duplication est donc assumée et bornée par un test : les 15 caractères non-ASCII du référentiel ont
été relevés dans la vraie base. Onze se replient à l'identique ; quatre divergent (`« » “ ”`, que
`unaccent()` transforme en `<< >> " "`) sans conséquence, la tokenisation les écartant de toute
façon — vérifié, pas supposé.

**Deux états vides, pas un.** « Aucune fiche ne correspond » et « le référentiel n'est pas encore
ouvert » ne disent pas la même chose. Confondre les deux ferait passer une règle de publication
délibérée pour une recherche ratée.

**Le garde-fou du nom commercial heurte le vocabulaire du métier.** `check-tokens` interdit le
littéral `Vitola` hors de `lib/brand.ts` ; c'est aussi le terme de métier pour un format. Seule la
sensibilité à la casse du motif rend les deux compatibles : le format reste en minuscule, la marque
garde sa majuscule. Les messages d'erreur de `lib/referential/` sont formulés en conséquence.

## Phase 0 — réalisation

**Next 16 plutôt que Next 15.** Le §3 du brief dit « Next.js 15 », écrit avant la sortie de la 16.
Même App Router, même React 19. Démarrer un projet neuf sur une majeure déjà dépassée coûterait
une migration dans les mois qui viennent. Réversible sans douleur tant qu'il n'y a pas de code
métier. Conséquences constatées : `next lint` n'existe plus (ESLint tourne seul), et la clé
`eslint` de `next.config.ts` a disparu.

**TypeScript 6, pas 7.** TS 7 est la version courante, mais `typescript-eslint` la refuse
explicitement au démarrage. Comme `pnpm lint` doit passer (§0.7), le projet est épinglé sur TS 6.
À revérifier quand typescript-eslint annonce le support.

**Version de React épinglée dans la config ESLint.** `eslint-plugin-react` appelle
`context.getFilename()`, retirée d'ESLint 10, dans sa détection automatique. Déclarer la version
court-circuite ce chemin de code.

**`postcss` en dépendance explicite.** Avec le `node_modules` strict de pnpm, Next ne résolvait pas
`postcss` et sautait **silencieusement** tout le traitement — build vert, aucune feuille de style
émise. Le symptôme n'apparaissait qu'après un build propre, le cache masquant la panne.

**Le sombre est inconditionnel.** Voir Q23.

**Palier de contraste ajouté à la palette.** La couleur d'erreur du §4.2 plafonne à 2,51:1 sur les
cartes. Quatre variantes éclaircies, même teinte, même saturation. Voir Q11.

**L'échelle de cape est éclaircie par rapport à la feuille réelle.** Un maduro fidèle (`#4a261a`)
est indiscernable de la surface maduro sur laquelle il repose : les deux derniers crans de
l'échelle disparaissaient. C'est une échelle symbolique, réglée pour être perçue, jamais seul
porteur de sens — le libellé est toujours affiché.

**Trois dépendances évitées.** `jose` (l'age gate signe via Web Crypto, présent partout),
`vite-tsconfig-paths` (Vite résout les alias nativement), `pg` (le contrôle de couverture RLS
tourne en `psql` dans la CI). Le §3 demande une justification par dépendance ; l'absence en est
la meilleure.

**Une page `/cigares` d'attente en P0.** L'age gate renvoie par défaut vers le référentiel, qui
n'existe qu'en P1 : sans cette page, un adulte franchissant le portail atterrissait sur un 404.
Découvert en capturant les écrans, pas en relisant le code.

**Les scans de conformité masquent les commentaires.** Sans cela, une phrase expliquant pourquoi
une chose est absente déclenche l'alerte que cette chose est présente. Constaté deux fois : sur
`health-notice.tsx` et sur `band.tsx`.

**Captures d'écran : attendre `load`, pas `domcontentloaded`.** `domcontentloaded` n'attend pas les
feuilles de style : les captures sortaient non stylées de façon intermittente. Vaut pour tout
futur test de régression visuelle.
