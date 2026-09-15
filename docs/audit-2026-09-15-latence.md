# Audit de la latence — 15 septembre 2026

Écrit pendant la session du 15 septembre, à la demande du porteur : « j'ai un temps de latence
anormalement long après les clics, notamment quand je vais changer de section. Il faut que tu
vérifies de partout si c'est un problème de Supabase, de Vercel, de Front ou autre. » Le même
symptôme est décrit sur Abracom ; Alpha Report et Cadency, eux, « marchent très bien ».

Ce fichier contient **ce qui a été mesuré**, dans l'ordre où l'on peut le rejouer, puis ce qui
a été construit et ce que cela a changé. La décision est l'[ADR 0021](adr/0021-le-temps-d-un-clic.md).

---

## Partie I — ce que le porteur ressent, mesuré en navigateur sur la production

`tooling/audit/navigation.ts`, Chromium réel, compte de parcours `test1`, portail passé, connecté,
puis dix clics sur la navigation principale. Le conteneur qui mesure est à Washington (`iad1`
dans `x-vercel-id`) : chaque chiffre porte un aller-retour transatlantique de plus que ce que
voit un lecteur à Paris — **c'est la structure qui compte, pas le plancher.**

| clic                   | URL change   | contenu | TTFB du RSC | requêtes pendant le clic           |
| ---------------------- | ------------ | ------- | ----------- | ---------------------------------- |
| cigares → boutique     | 1 045 ms     | 1 092   | 429 ms      | 1 RSC, 11 images, 4 préchargements |
| boutique → carnet      | 1 000 ms     | 1 010   | 635 ms      | 1 RSC, 4 préchargements            |
| carnet → cave          | 834 ms       | 854     | 462 ms      | 1 RSC, 9 préchargements            |
| cave → cigares         | 950 ms       | 969     | 635 ms      |                                    |
| cigares → lieux        | **1 376 ms** | 1 398   | 633 ms      |                                    |
| lieux → boutique       | 735 ms       | 753     | 420 ms      |                                    |
| boutique → suggestions | 543 ms       | 550     | 348 ms      |                                    |
| suggestions → cigares  | 796 ms       | 814     | 530 ms      |                                    |
| cigares → boutique     | 609 ms       | 621     | 399 ms      |                                    |
| boutique → carnet      | **1 349 ms** | 1 359   | 727 ms      |                                    |

**Le fait qui décide : « URL change » et « contenu » sont la même colonne.** Le routeur ne
change rien à l'écran tant que la page entière n'est pas arrivée. Entre le clic et ce moment —
0,5 à 1,4 s d'ici, sans doute 0,3 à 1 s depuis Paris — il ne se passe **rien**. Il n'y a ni
`Suspense` ni `loading.tsx` dans le dépôt ; l'ADR 0020 l'avait constaté sans en tirer la
conséquence.

Et les chargements complets disent la seconde chose : **une page de liste précharge tout ce
qu'elle montre.**

| page (chargement complet) | TTFB   | `load` | repos réseau | préchargements           |
| ------------------------- | ------ | ------ | ------------ | ------------------------ |
| `/cigares`                | 691 ms | 808 ms | **6,4 s**    | **40**                   |
| `/boutique`               | 679 ms | 2,9 s  | 5,8 s        | 30 (+ 11 images signées) |
| `/carnet`                 | 610 ms | 742 ms | 5,0 s        | 31                       |
| `/cave`                   | 546 ms | 738 ms | 3,5 s        | 17                       |

Après un défilement jusqu'en bas : **64** préchargements sur `/cigares`, **56** sur `/lieux`,
**42** sur `/boutique`. Chacun traverse le middleware. Pendant les cinq minutes de cette mesure,
les journaux Supabase comptent **377 appels `/auth/v1/user`** venus de « Vercel Edge
Functions » — pour un seul navigateur.

## Partie II — ce que chaque clic coûte au serveur, tracé sur le build local

`tooling/audit/soft-nav-trace.ts` : le serveur local est lancé avec le compteur d'allers-retours
du 14 septembre (`trace-roundtrips.mjs`), et le navigateur pose un marqueur avant et après chaque
clic. Contrairement à `roundtrips.ts`, qui faisait des `page.goto`, ce sont des **navigations
douces** — celles du porteur. Le conteneur est à ~140 ms de Paris par appel.

| navigation douce       | 1ᵉʳ retour | lectures | chaîne critique | ce qui se lit, dans l'ordre (décalage : cible (durée))                                                   |
| ---------------------- | ---------- | -------- | --------------- | -------------------------------------------------------------------------------------------------------- |
| cigares → boutique     | 979 ms     | 3        | 962 ms          | +407 `feature_flags` (178) → +587 `products` (167) → +758 signature des images (204)                     |
| boutique → carnet      | 935 ms     | 5        | 920 ms          | +216 **`auth/user`** (147) → +366 `reviews` ‖ `review_shares` → +534 `profiles` ‖ `cigars` (386)         |
| carnet → cave          | 513 ms     | 3        | 495 ms          | +183 **`auth/user`** (141) → +328 `humidors` ‖ `humidor_inventory`                                       |
| cave → cigares         | 871 ms     | 6        | 837 ms          | +194 **`auth/user`** (150) → +350 `aroma_taxonomy` ‖ `profiles` ‖ `cigars` ×2 (486) → +596 `cigar_stats` |
| cigares → lieux        | 1 088 ms   | 5        | 1 064 ms        | +193 `feature_flags` (349) → +545 **`auth/user`** (144) → +692 `venues` ×3                               |
| boutique → suggestions | 563 ms     | 2        | 552 ms          | +198 **`auth/user`** (140) → +340 `rpc:suggest_cigars` (212)                                             |

Trois constats que la lecture du code ne donnait pas :

1. **L'en-tête n'est pas re-rendu sur une navigation douce.** Aucun `notifications` ni `profiles`
   d'en-tête dans ces fenêtres ; ils n'apparaissent que sur les chargements complets. L'audit du
   14 septembre comptait « trois allers-retours d'en-tête sur chaque page » parce qu'il mesurait
   des `page.goto`. La mesure était juste ; ce qu'elle mesurait n'était pas le clic.
2. **`auth/user` est en tête de presque chaque chaîne**, ~140 ms avant la première lecture de
   données — et le middleware venait de faire le même appel pour la même requête (il n'apparaît
   pas dans la trace : le bac à sable Edge a son propre `fetch`). Le premier appel de données ne
   part qu'à +180–545 ms.
3. **Les chaînes sont courtes mais en série** : la boutique lit le drapeau, puis le rayon, puis
   signe les images ; les lieux lisent le drapeau, puis la session, puis les lieux.

La base le dit à sa façon, dans `pg_stat_statements` depuis la dernière remise à zéro :
**103 783 lectures de `auth.users`** (et autant de `sessions`, `identities`, `mfa_factors`,
`mfa_amr_claims` — les cinq requêtes de `/auth/v1/user`) pour **25 740 requêtes PostgREST**.
Quatre vérifications d'identité par lecture de données.

## Partie III — Supabase, Vercel, le front : qui fait quoi

### Supabase — un impôt par appel, et le même pour Vitola et Alpha Report

Mêmes sondes, même conteneur, même minute, douze appels chacune (le transatlantique inclus) :

| sonde                                  | Vitola (Nano)  | Alpha Report (org Pro) |
| -------------------------------------- | -------------- | ---------------------- |
| `/auth/v1/settings` (GoTrue)           | p50 **348 ms** | p50 539 ms             |
| `/rest/v1/…` (PostgREST, table réelle) | p50 **569 ms** | —                      |
| `/rest/v1/zz_probe` (404 du cache)     | p50 561 ms     | p50 409 ms             |

**Supabase ne répond pas plus lentement à Vitola qu'à Alpha Report.** Ce n'est donc pas le
fournisseur qui distingue les deux sites. Ce qui les distingue est le nombre d'appels par clic,
et le fait que Vitola attend chacun avant de rien montrer.

Le projet est en palier **Nano** — `shared_buffers` 224 Mo, `effective_cache_size` 384 Mo,
`work_mem` 2 Mo, `max_connections` 60 ; Alpha Report a 256 Mo / 768 Mo / 3,5 Mo, un cran
au-dessus. Depuis Paris (fonctions en `cdg1`, journaux Supabase par chemin) :

| chemin                    | appels | p50       | max |
| ------------------------- | ------ | --------- | --- |
| `/auth/v1/user`           | 10     | **35 ms** | 85  |
| `/rest/v1/feature_flags`  | 4      | 89 ms     | 91  |
| `/rest/v1/cigars`         | 51     | 57 ms     | 799 |
| `/rest/v1/profiles`       | 7      | 71 ms     | 204 |
| `/rest/v1/articles`       | 13     | 103 ms    | 748 |
| `/rest/v1/aroma_taxonomy` | 5      | 131 ms    | 716 |

Une lecture par clé primaire qui coûte 0,04 ms en base en coûte **75 à 120 à la porte de l'API**.
C'est le prix du palier, pas une panne — la panne du 14 septembre (0,4 à 18 s, 3 échecs sur 20)
est une autre chose, traitée par l'ADR 0020. La base elle-même est saine : 18 connexions sur 60,
1 active, 64 Mo, 24 jours de disponibilité.

### Vercel — Washington jusqu'à ce matin, Londres pour le middleware, Hobby pour le reste

- **Les fonctions étaient à Washington jusqu'au 15 septembre 08:42 UTC** (PR #29). Les journaux
  Supabase gardent la trace des deux mondes : `rest` depuis **IAD**, 403 appels, p50 328 ms,
  **p95 9,3 s, max 16,3 s, 23 erreurs 5xx** ; depuis **CDG**, 124 appels, p50 75 ms, p95 553 ms,
  0 erreur. Une page qui fait cinq appels en série les payait cinq fois à travers l'Atlantique.
- **Le middleware tourne à Londres** — `Vercel Edge Functions`, colo `LHR`, « Amazon Data
  Services UK » — donc chaque requête d'un lecteur parisien passait par Londres pour demander à
  Paris si sa session existait, avant d'être servie depuis Paris.
- **Le plan est Hobby** : fonctions Fluid à 0,6 vCPU, 1 Go. Ce n'est pas ce qui rend un clic
  silencieux, mais c'est ce qui allonge chaque rendu que le silence couvre.
- `x-vercel-id` de production sur une route dynamique : `iad1::cdg1::…` — deux segments, la
  région est bien celle déclarée (le piège de lecture du 14 septembre tient toujours).
- **Abracom** répond `iad1::cdg1::…` lui aussi : même région, même architecture — Next 16,
  middleware `getUser()`, pages dynamiques, pas de `loading.tsx` — donc même symptôme, sans qu'un
  fournisseur commun soit en cause.
- Deux choses vues en passant : `vitola.vercel.app` répond **451 `DEPLOYMENT_DISABLED`** — ce
  n'est pas notre projet, dont l'hôte est `vitola-teal.vercel.app`, mais `lib/site.ts` avait ce
  littéral en troisième repli ; et les journaux d'erreurs de production portent quatre
  `SUPABASE_SECRET_KEY is missing` sur `/cigares/[slug]` — la clé n'est pas posée chez Vercel,
  donc le rafraîchissement de `cigar_stats` après une écriture échoue, et seul le `pg_cron`
  (6 861 exécutions, toutes les cinq minutes) tient les moyennes à jour.

### Le front — trois défauts, tous dans le dépôt

1. **Aucune frontière de chargement.** Le clic ne change rien à l'écran avant l'arrivée de la
   page entière (partie I).
2. **Deux vérifications d'identité par requête**, toutes deux des appels réseau : le middleware
   (`getUser()`) et la page (`currentUser()` → `getUser()`), en série (partie II).
3. **Le préchargement des grilles** : 40 à 64 requêtes par page de liste, chacune un passage par
   le middleware, donc chacune un appel d'auth (partie I).

## Partie IV — ce qui a été construit, et ce que cela change

L'ADR 0021 : trois `loading.tsx` et un `LoadingSkeleton` ; `getClaims()` à la place de
`getUser()` dans le middleware et dans `currentUser()`, qui rend désormais un `SessionUser`
(`id`, `email`) ; le rayon de la boutique lancé avant le drapeau et les trois lectures des lieux
lancées ensemble ; `prefetch={false}` sur les bagues, les facettes et les produits.

**Même trace, même serveur local, même compte, après :**

| navigation douce       | 1ᵉʳ retour        | contenu            | lectures | ce qui se lit                                                |
| ---------------------- | ----------------- | ------------------ | -------- | ------------------------------------------------------------ |
| cigares → boutique     | 979 → **135 ms**  | 979 → **529 ms**   | 3        | +114 `products` ‖ `feature_flags` → +294 signature           |
| boutique → carnet      | 935 → **78 ms**   | 935 → **435 ms**   | 4        | +69 `reviews` ‖ `review_shares` → +242 `profiles` ‖ `cigars` |
| carnet → cave          | 513 → **57 ms**   | 513 → **365 ms**   | 2        | +47 `humidors` ‖ `humidor_inventory`                         |
| cave → cigares         | 871 → **36 ms**   | 871 → **766 ms**   | 5        | +48 facettes ‖ recherche → +350 `cigar_stats`                |
| cigares → lieux        | 1 088 → **48 ms** | 1 088 → **435 ms** | 4        | +37 `feature_flags` → +206 `venues` ×3                       |
| boutique → suggestions | 563 → **47 ms**   | 563 → **351 ms**   | 1        | +40 `rpc:suggest_cigars`                                     |

- **Le premier retour visuel passe sous 140 ms partout** : c'est la frontière de chargement.
- **Le contenu arrive 150 à 650 ms plus tôt** : c'est l'appel d'auth retiré du chemin critique —
  la première lecture de données part maintenant à +37–115 ms au lieu de +180–545.
- **Plus aucun `/auth/v1/user`.** Les journaux Supabase, sur le rejeu d'avant : 12 appels du
  middleware et 10 des pages en cinq minutes ; sur le rejeu d'après : **zéro**, et exactement un
  `/.well-known/jwks.json` par processus, gardé dix minutes.
- **Préchargements au chargement de `/cigares` : 41 → 19** (les liens de section et de
  navigation restent préchargés, ce sont eux que l'on clique).

**Ce qui n'a pas changé, et qui est nommé** : les chaînes en série qui restent — recherche puis
`cigar_stats`, lignes du carnet puis auteurs, rayon puis images signées — et les deux lectures
d'en-tête des chargements complets. C'est l'option B de l'ADR, une fonction SQL par écran, et
elle ne vaut le coût que sur le palier où chaque traversée d'API ne coûte plus 75 ms.

## Partie V — le correctif mesuré sur Vercel, avant fusion

Le déploiement de prévisualisation de la branche (`cdg1`, derrière l'authentification Vercel,
ouvert par le lien de partage que `PARCOURS_ACCESS_URL` visite une fois), même script, même
compte, même conteneur. Deux passes — la première sur un déploiement qui venait de naître, la
seconde une fois ses instances chaudes ; c'est la seconde qui compte.

| clic                   | URL change (avant → après) | contenu (avant → après) | TTFB du RSC |
| ---------------------- | -------------------------- | ----------------------- | ----------- |
| cigares → boutique     | 1 045 → **44 ms**          | 1 092 → 744             | 507 ms      |
| boutique → carnet      | 1 000 → **63 ms**          | 1 010 → 674             | 492 ms      |
| carnet → cave          | 834 → **51 ms**            | 854 → 729               | 444 ms      |
| cave → cigares         | 950 → **40 ms**            | 969 → 740               | 534 ms      |
| cigares → lieux        | 1 376 → **60 ms**          | 1 398 → 974             | 539 ms      |
| lieux → boutique       | 735 → **44 ms**            | 753 → 758               | 334 ms      |
| boutique → suggestions | 543 → **41 ms**            | 550 → 1 037             | 891 ms      |
| suggestions → cigares  | 796 → **44 ms**            | 814 → 940               | 770 ms      |
| cigares → boutique     | 609 → **44 ms**            | 621 → 726               | 517 ms      |
| boutique → carnet      | 1 349 → **73 ms**          | 1 359 → 839             | 658 ms      |

**Ce que cela dit, et ce que cela ne dit pas.**

- **Le silence a disparu** : 40 à 73 ms entre le clic et le changement d'écran, quelle que soit
  la page — c'est la frontière de chargement, et elle ne dépend d'aucun fournisseur.
- **Le contenu arrive en 0,55 à 1,0 s d'ici** — 0,4 à 0,8 s depuis Paris —, contre 0,55 à 1,4 s
  avant. Ce temps est désormais **tout entier le serveur** : le passage par le middleware, la
  fonction, et une à trois traversées de l'API Supabase à 75–120 ms chacune au p50, avec la
  variance d'un palier partagé (le même `/suggestions` répond en 348 ms un jour et 891 ms le
  suivant, pour une seule lecture). Le squelette couvre ce temps ; il ne le raccourcit pas.
- **Les journaux Supabase tranchent la question de l'auth.** Pendant la mesure d'avant sur la
  production : **376 appels `/auth/v1/user`** en cinq minutes depuis « Vercel Edge Functions »,
  plus 16 depuis les pages. Pendant les deux passes d'après sur la prévisualisation : **aucun** —
  cinq lectures de `/.well-known/jwks.json` en tout, une par instance née, gardée dix minutes.
- **Le préchargement au chargement de `/cigares` : 40–48 → 27–36, et 64 → 37 après défilement.**
  Ce qui reste précharge la navigation, les sections et les liens que la page a en propre.
  `/lieux` en garde 57 : ses lignes sont des liens, et elles suivent la même règle dans le
  commit qui suit cette mesure.

## Partie VI — ce qui n'est pas du code

Deux leviers, tous deux à la main du porteur, et aucun ne remplace ce qui précède :

1. **Le palier Supabase.** Nano met 75–120 ms à la porte pour une lecture de 0,04 ms ; le même
   appel sur le palier d'Alpha Report est mesuré dans la même fourchette depuis ce conteneur, mais
   la panne du 14 (« ce qui se rétablit seul peut redégrader seul ») est celle d'un palier partagé.
   Un Micro est la première marche.
2. **Le plan Vercel.** Hobby rend sur 0,6 vCPU ; Pro (Standard, 1 vCPU) raccourcit chaque rendu
   et donne des journaux plus longs qu'une heure. Il ne change pas le nombre d'appels.

Et une variable à poser chez Vercel, qui n'est pas de la latence : `SUPABASE_SECRET_KEY`.

## Comment rejouer

```bash
# le clic tel que le porteur le vit, en production (PARCOURS_INSECURE=1 seulement dans le
# conteneur de session, dont le mandataire sortant ré-émet les certificats)
PARCOURS_INSECURE=1 pnpm tsx tooling/audit/navigation.ts

# ce que chaque clic coûte au serveur, sur un build local
pnpm build
VITOLA_TRACE_FILE=/tmp/trace.jsonl NODE_OPTIONS="--import ./tooling/audit/trace-roundtrips.mjs" pnpm start --port 3100
VITOLA_TRACE_FILE=/tmp/trace.jsonl pnpm tsx tooling/audit/soft-nav-trace.ts
```
