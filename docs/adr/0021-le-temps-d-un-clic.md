# 0021 — Le temps d'un clic : une frontière de chargement, une session vérifiée sur place

- **Statut** : **Acceptée** le 15 septembre 2026 — session d'audit de la latence
  (« un temps de latence anormalement long après les clics, notamment quand je change de section »)
- **Date** : 2026-09-15
- **Décideur** : @jgueniche
- **Concerne** : `middleware.ts` · `lib/supabase/middleware.ts` · `lib/supabase/server.ts` ·
  `app/(app)/loading.tsx` (nouveau) · `app/(app)/boutique/loading.tsx` (nouveau) ·
  `app/(public)/journal/loading.tsx` (nouveau) · `components/layout/loading-skeleton.tsx` (nouveau) ·
  `app/(app)/boutique/page.tsx` · `app/(app)/lieux/page.tsx` · `components/cigar/cigar-card.tsx` ·
  `components/cigar/facet-panel.tsx` · `tooling/audit/navigation.ts` · `tooling/audit/soft-nav-trace.ts` ·
  `docs/audit-2026-09-15-latence.md`

## Contexte

Le porteur décrit « un temps de latence anormalement long après les clics, notamment quand je
change de section », et le compare aux autres sites — Alpha Report, Cadency — « où tout marche
très bien ». La question posée est de savoir si c'est Supabase, Vercel, le front, ou autre chose.
Tout est mesuré dans [`docs/audit-2026-09-15-latence.md`](../audit-2026-09-15-latence.md) ; ce
qui suit est ce qui décide.

### Ce qu'un clic coûtait, mesuré en navigateur

Le dépôt n'avait **aucune frontière de chargement** — ni `Suspense`, ni `loading.tsx`, `grep` en
fait foi, et l'ADR 0020 l'avait déjà noté sans en tirer la conséquence. Or toute page du groupe
`(app)` est dynamique. Un clic sur « Boutique » envoie donc le navigateur chercher **la page
entière** sur le serveur, et le routeur de Next garde **l'ancienne page à l'écran, inchangée**,
jusqu'à ce que la nouvelle soit intégralement rendue et reçue. Entre le clic et le premier pixel
qui bouge : rien. C'est cela, la latence décrite — pas un chiffre serveur, un **silence**.

Et ce silence dure ce que le serveur met à rendre. Tracé sur le build local, navigation douce par
navigation douce (l'en-tête n'est **pas** re-rendu, contrairement à ce que l'audit du 14 comptait
sur des chargements complets) :

| navigation             | lectures | chaîne critique                                      |
| ---------------------- | -------- | ---------------------------------------------------- |
| cigares → boutique     | 3        | drapeau → rayon → signature des images, **en série** |
| boutique → carnet      | 5        | `auth/user` → lignes ‖ partages → auteurs ‖ cigares  |
| cave → cigares         | 6        | `auth/user` → recherche ‖ facettes → `cigar_stats`   |
| cigares → lieux        | 5        | drapeau → `auth/user` → lieux ×3                     |
| boutique → suggestions | 2        | `auth/user` → `rpc:suggest_cigars`                   |

Deux constantes dans ces chaînes :

1. **`auth/user` en tête de chaque page** — `currentUser()` appelle `getUser()`, un aller-retour
   vers le serveur d'auth, **après** que le middleware a déjà fait le même appel pour la même
   requête. La base le dit elle-même : dans `pg_stat_statements`, **104 000 lectures de
   `auth.users` pour 25 700 requêtes PostgREST** — quatre appels d'auth pour une lecture de
   données.
2. **Le préchargement** — une page de liste déclenche **19 à 41 requêtes de préchargement** au
   défilement (`/cigares` : 41, `/boutique` : 28, `/carnet` : 22), chacune traversant le
   middleware, donc chacune un appel d'auth, pour un clic au plus.

### Ce qui n'est pas la cause, et qu'il fallait mesurer pour l'écarter

- **Supabase n'est pas plus lent pour Vitola que pour Alpha Report.** Mêmes sondes, depuis le même
  conteneur, dans la même minute : auth p50 348 ms contre 539 ms, PostgREST p50 561 ms contre
  409 ms — même ordre de grandeur, le transatlantique dedans. Le projet est en palier **Nano**
  (`shared_buffers` 224 Mo, `work_mem` 2 Mo ; Alpha Report est un cran au-dessus), et sa couche
  API répond à 75–120 ms au p50 depuis Paris pour une lecture qui coûte 0,04 ms en base. C'est
  un impôt par appel, pas une panne ; la panne du 14 est l'ADR 0020.
- **Vercel est en `cdg1` depuis ce matin** (PR #29). Avant, les journaux Supabase montrent les
  fonctions à Washington : `rest` depuis IAD, **p95 9,3 s, max 16,3 s, 23 erreurs 5xx** sur
  403 appels ; depuis CDG, p50 75 ms, p95 553 ms. Le middleware, lui, tourne à **Londres**
  (« Vercel Edge Functions », LHR), donc chaque requête passait par Londres pour demander à Paris
  si la session existait.
- **Abracom a le même profil** parce qu'il a la même architecture — Next 16, pages dynamiques,
  middleware `getUser()`, aucun `loading.tsx` — pas parce qu'un fournisseur commun serait en
  panne. Sa production répond bien depuis `cdg1`.

## Options

**A — Un cache devant les lectures.** Refusé, pour la raison de l'ADR 0020 : un cache posé pour
masquer une latence masque aussi la fraîcheur, et sur un référentiel dont la valeur est la
provenance, cela se décide pour ses propres raisons.

**B — Réécrire les requêtes en fonctions SQL** (`header_context()`, la fiche en un appel).
Utile, nommé, et **pas premier** : la base répond en 0,04 ms ; ce qui coûte, c'est chaque
traversée de l'API, et la chaîne la plus longue d'une navigation douce compte trois appels. Une
fonction de plus n'enlève pas le silence du clic.

**C — Une frontière de chargement, et la session vérifiée sur place.** Retenue.

## Décision

**Un clic commet immédiatement, et la session ne demande plus rien à personne.**

1. **Trois `loading.tsx`** — `app/(app)/`, `app/(app)/boutique/`, `app/(public)/journal/` — et un
   seul composant, `LoadingSkeleton` : la forme d'une tête de page puis des lignes entre deux
   filets, `aria-busy`, un mot pour le lecteur d'écran, aucune carte. Le routeur change l'URL au
   clic, garde l'en-tête, et dessine le squelette là où la page viendra.
2. **`getClaims()` remplace `getUser()`**, dans le middleware et dans `currentUser()`. Le jeton
   est vérifié **sur place**, contre les clés publiques du projet (ES256, `kid` ; le JWKS est
   chargé une fois et gardé dix minutes par instance). Un cookie forgé échoue toujours. Ce que la
   vérification locale ne voit pas, c'est une révocation **pendant la durée de vie restante du
   jeton** — une heure au plus — et c'est exactement la confiance que la base accorde déjà au
   même jeton : PostgREST vérifie la signature et rien d'autre. Le middleware n'était pas une
   porte plus stricte que la donnée derrière lui ; il coûtait seulement un aller-retour de plus.
   Le rafraîchissement d'une session expirée passe par le même chemin qu'avant, et ses cookies
   voyagent pareil.
3. **Ce qui ne dépend de rien commence ensemble.** `/boutique` lance le rayon avant de connaître
   le drapeau ; `/lieux` lit le drapeau, les paramètres et la session d'un seul `Promise.all`.
   Le `catch` posé sur le rayon n'est pas un repli : il marque la lecture comme prise en charge
   pour le cas où `notFound()` la laisse derrière lui, et l'`await` jette toujours.
4. **Une grille dense ne précharge pas.** `prefetch={false}` sur les bagues de `/cigares`, ses
   facettes, et les produits de la boutique. La navigation principale garde son préchargement :
   c'est elle que le porteur clique.

## Conséquences

- **Ce qu'on accepte.** Une session révoquée reste valable jusqu'à l'expiration de son jeton, une
  heure au plus — le délai que la base acceptait déjà. Le jour où `suspend` s'arme (ADR 0013, D5),
  suspendre devra aussi invalider les jetons, et cette ADR est l'endroit où on le retrouvera.
- **Ce que cela interdit.** Un `getUser()` sur un chemin chaud : il n'a sa place que là où l'on a
  besoin du **dossier** et non de l'identité — l'export RGPD, qui cite ses dates, et le dit.
- **Ce que cela ne fait pas.** Les chaînes en série qui restent — la fiche puis ses statistiques,
  les lignes du carnet puis leurs auteurs, le rayon puis ses images signées — sont la matière de
  l'option B, nommée et pas construite : `header_context()` pour les chargements complets,
  `cigar_page()` pour la fiche.
- **Deux leviers qui ne sont pas du code**, et qu'il appartient au porteur d'actionner ou non :
  le palier **Nano** de Supabase, dont l'API met 75 à 120 ms là où un Micro en met ~30 (c'est
  l'écart mesuré avec Alpha Report, et la panne du 14 est de la même famille) ; et le plan
  **Hobby** de Vercel, dont les fonctions Fluid tournent sur 0,6 vCPU. Aucun des deux ne rend un
  clic silencieux ; les deux allongent ce que le squelette a maintenant à couvrir.

## Question ouverte

**Faut-il monter d'un palier — Supabase Micro, Vercel Pro — avant l'ouverture commerciale ?** La
mesure de cette ADR dit combien chaque appel coûte ; elle ne dit pas ce que le porteur accepte de
payer par mois pour le raccourcir. Après cette ADR, un clic donne un retour immédiat et le
serveur rend une page en une à trois traversées d'API ; le palier décide de la durée de chacune.
