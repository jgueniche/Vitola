# 0020 — Le sujet d'une page échoue franchement ; ce qui l'accompagne se rend vide en le disant

- **Statut** : **Acceptée** le 14 septembre 2026 — session d'audit
  (« une règle pour ce qu'une page fait d'un échec passager de son fournisseur »)
- **Date** : 2026-09-14
- **Décideur** : @jgueniche
- **Concerne** : les 17 fichiers de `lib/**/queries.ts` · `lib/supabase/server.ts` ·
  `lib/degrade.ts` (nouveau) · `components/layout/unavailable.tsx` (nouveau) ·
  les 53 pages qui lisent la base · `app/error.tsx` · `docs/audit-2026-09-14.md`

## Contexte

Le 14 septembre, l'API de Supabase a mis **0,44 à 18,2 s** pour lire cinq lignes d'une table qui
en contient deux, et a échoué **3 fois sur 20**. La base derrière répondait en **38 ms**, 18
connexions sur 60. Le goulot était la couche PostgREST/Kong du projet, pas notre SQL. Elle s'est
rétablie seule une heure et demie plus tard, sans redémarrage — et c'est le fait qui décide :
**ce qui se rétablit seul peut redégrader seul.** Une panne qu'on ne peut ni prévoir ni empêcher
n'appelle pas un correctif d'infrastructure, elle appelle une règle de comportement.

Remesuré le soir même, vingt appels identiques : **0,51 à 4,43 s, 0 échec**. La variance n'est
donc pas partie — deux appels sur vingt passent encore 3,5 s à lire deux lignes — elle est
seulement redescendue sous le seuil où elle casse. La base, elle, est inchangée : 16 connexions
sur 60, 1 active, 0 `idle in transaction`, 64 Mo.

### Ce que le journal disait, et ce que le code dit

Deux routes ont reçu le même 502 :

```
GET /journal 500   Error: Could not read the journal: Bad Gateway
GET /cigares 200   Error: Could not read the origin facet: Bad Gateway
```

La lecture naturelle est que `/cigares` a **dégradé** — rendu sa page avec une facette en moins —
et que `/journal` a **jeté**. C'est la lecture qu'a faite l'audit, et le code ne la soutient pas.

`publishedOriginCountries()` jette exactement comme `listJournal()` :
`if (error) throw new Error(...)`. `app/(app)/cigares/page.tsx` l'attend dans un `Promise.all` de
cinq lectures, sans `catch`. Il n'y a **ni `Suspense` ni `loading.tsx` nulle part dans le dépôt** —
`grep` en fait foi. Les deux pages prennent donc la même frontière d'erreur ; la différence de
statut vient de l'endroit où le flux avait déjà été envoyé, c'est-à-dire de rien que nous ayons
écrit.

**La conclusion est plus simple et plus mauvaise que « deux accidents d'écriture » : rien ne
dégrade nulle part.** Sur les 17 fichiers de requêtes, **79 lectures jettent**. Quatre ne jettent
pas — `isFeatureEnabled()`, `reportSlaHours()`, `publicPublishedArticles()`, `venuesFlag()` — et
chacune porte l'argument écrit de son repli. C'est la preuve que la règle manquante n'est pas un
mécanisme : le mécanisme existe quatre fois. C'est **la décision**, qui n'a jamais été prise en
général.

_(C'est aussi la règle de mesure de la journée appliquée à l'audit lui-même : une mesure qui ne
change pas quand la page change mesure autre chose que ce qu'on croit. Deux lignes de journal ne
disent pas ce qu'a fait le code qui les a émises.)_

### La lecture qui ment déjà, et que personne n'avait vue

Une cinquième fonction ne jette pas, et celle-là n'a pas d'argument écrit :

```ts
/** The signed-in user, or null. Never throws: a broken session is not a 500. */
export async function currentUser() {
  const { data, error } = await supabase.auth.getUser()
  return error ? null : data.user
}
```

Le commentaire est juste sur une session cassée et faux sur une panne. **38 pages appellent
`currentUser()`**, et une dizaine en font `if (!user) redirect(routes.signIn())`. Pendant les
quatre-vingt-dix minutes du 14 septembre, un membre connecté ouvrant `/carnet`, `/cave` ou `/fil`
était donc **renvoyé à la page de connexion** — et sur `/cigares`, il recevait l'aperçu de neuf
fiches réservé aux visiteurs. Le site ne lui a pas dit « je n'ai pas pu lire » : il lui a dit
**« vous n'êtes pas connecté »**, ce qui est un fait sur lui, et un fait faux.

C'est exactement la faute que cette ADR existe pour interdire, déjà en production depuis P1, et
c'est le meilleur argument qu'un repli mal choisi est pire qu'une erreur.

### La frontière que le dépôt protège le plus

`lib/CLAUDE.md` interdit de doubler une policy RLS en TypeScript, et un `catch` qui rend `[]` est
le doublage le plus efficace qu'on puisse écrire : il survit à la policy qu'il double, et il rend
« rien » là où la base aurait rendu quelque chose. Quatre tables rendent **légitimement** zéro
ligne — `reviews`, `posts`, `venues`, `products` — donc quatre écrans où « rien à voir ici » est
une phrase vraie tous les jours et fausse le jour de la panne.

Le cas le plus net n'est pas une liste, c'est une fiche : `app/(app)/cigares/[slug]/page.tsx`
fait `const cigar = await getCigarBySlug(slug); if (!cigar) notFound()`. Un repli qui rendrait
`null` sur erreur transformerait une panne de trente secondes en **« ce cigare n'existe pas »**,
sur un référentiel dont toute la valeur est la provenance. Et `listReviewsForCigar()` est l'autre
bord du même piège : quatre policies SELECT décident, 937 fiches sur 940 n'ont aucune note
publique, donc zéro ligne y est l'état normal et un repli à `[]` y serait **indétectable**.

**Un échec doit se distinguer d'un refus.** C'est la contrainte qui élimine des options, pas un
principe qu'on ajoute après coup.

### Le fait qui décide de l'endroit où la règle vit

`listAromaWheel()` est **le sujet** de `/aromes` — la page _est_ la roue des arômes — et **une
facette** de `/cigares`, parmi onze autres. La même fonction, les deux rôles. `publishedCounts()`
est le lede de `/cigares` et rien ailleurs ; `getCigarStats()` n'est le sujet d'aucune page.

**« Essentiel » et « accessoire » ne sont donc pas des propriétés d'une requête. Ce sont des
propriétés d'une page.** Une requête ne sait pas qui l'appelle, et lui faire porter la décision
obligerait à dupliquer chaque fonction ambivalente — ou, pire, à trancher une fois pour toutes au
détriment d'un des deux appelants.

## Options

**A — Un `try/catch` dans chaque fonction de `lib/**/queries.ts`, rendant une valeur vide.**
L'option qui vient à l'esprit, et deux choses l'éliminent. La requête ne connaît pas son rôle
(ci-dessus), et la valeur vide est le mensonge RLS : `[]` sur `reviews` est indiscernable de ce
que rendent les policies. Elle transforme de surcroît 79 décisions en un réflexe, ce que la
commande de session refuse explicitement (« ce n'est pas un try/catch partout »).

**B — La décision au site d'appel, sur une valeur à deux états.** Les fonctions de requête
continuent de jeter — aucune ligne de `lib/**/queries.ts` ne change. La page enveloppe ses
lectures **accessoires** dans un `accessoire()` qui rend `{ ok: true, value }` ou
`{ ok: false }`, et le rendu de `{ ok: false }` **dit** que la donnée n'a pas pu être lue. Le
sujet reste `await` nu et jette. Coût : une décision à prendre 53 fois, et un type à déballer là
où on lisait un tableau.

**C — Une frontière d'erreur React par section.** L'idée juste sur le papier : `<ErrorBoundary>`
autour de chaque encart. Elle ne s'applique pas à ce code — les lectures accessoires sont faites
**dans le corps de la page**, dans un `Promise.all` en tête de fonction, pas dans le composant qui
les affiche. Il faudrait d'abord descendre chaque lecture dans son propre composant async et poser
un `Suspense` par encart : c'est une refonte du rendu de 53 pages, et elle rendrait chaque page
progressive alors que la moitié sont prérendues ou proches de l'être (le critère de sortie mesuré
de P6, Lighthouse SEO = 100).

**D — Un cache devant l'API, servant la dernière réponse connue.** Refusée, et l'interdit est
antérieur à cette ADR : « un cache posé pour cacher une panne cache aussi la prochaine ». Sur un
référentiel dont la valeur est la provenance, la fraîcheur est une promesse au lecteur, pas un
réglage — et une fiche servie depuis un cache ne sait pas dire de quand elle date. La mise en
cache se décidera un jour ; elle ne se décidera pas _en réaction à une panne_, parce qu'une
décision prise sous ce motif optimise pour le mauvais jour.

## Décision

**Option B.** Une seule règle, pour tout le site :

> **Ce qui est le sujet de la page échoue franchement. Ce qui l'accompagne se rend vide en le
> disant — et « en le disant » n'est pas facultatif.**

Le test qui tranche, page par page : **si ce bloc disparaissait, la page répondrait-elle encore à
la question avec laquelle le lecteur est venu ?** Si oui, c'est un accompagnement. Une facette, un
compteur, un encart de suggestions, les arômes les plus cités, une provenance, un badge de
notification : accompagnement. Une fiche cigare sans sa fiche, un article sans son article, une
cave sans son inventaire : sujet.

Trois choses ne sont **jamais** un accompagnement, quoi que dise le test :

1. **Ce qui alimente un `notFound()` ou un `redirect()`.** Un échec qui devient « cela n'existe
   pas » ou « vous n'êtes pas connecté » énonce un fait faux au lieu d'avouer une panne.
2. **Ce qui alimente une décision de droit** — un rôle, un drapeau, une appartenance. Le repli est
   alors celui de `flags.ts`, écrit avant cette ADR et inchangé par elle : **fermé**. Une panne
   n'ouvre pas une porte.
3. **Une écriture.** La règle porte sur les lectures. Une Server Action qui échoue le dit et ne
   dégrade rien ; un geste à moitié écrit est le contraire d'un accompagnement.

Et la contrainte qui gouverne toutes les autres : **la valeur de repli n'est jamais la valeur
vide du type.** Jamais `[]`, jamais `null`, jamais `0`. `{ ok: false }` est un troisième état,
que le compilateur oblige à déballer et que l'écran oblige à nommer. C'est ainsi qu'un échec se
distingue d'un refus — et la RLS reste la seule chose qui décide de ce qui se lit.

## Conséquences

**Ce que l'on accepte.**

- **`lib/**/queries.ts` ne gagne pas un seul `catch`.** Les 79 lectures continuent de jeter, et
  c'est voulu : une fonction qui jette est une fonction dont l'appelant doit décider. Le fichier
  de requêtes devient le mauvais endroit où chercher le comportement de panne, et `lib/CLAUDE.md`
  le dit.
- **La décision se prend 53 fois, à la main, et se relit dans la revue.** C'est le coût nommé par
  la commande de session. Il n'y a pas de règle automatique : un linter qui devinerait le sujet
  d'une page se tromperait sur `/aromes`.
- **Un écran peut désormais afficher « indisponible » là où il affichait une facette.** C'est un
  état de plus à dessiner, et il passe par `messages/*.json` comme le reste — donc dans les deux
  langues (ADR 0019).
- **`currentUser()` cesse de mentir, et cela coûte une page d'erreur là où il y avait une
  redirection.** Un membre dont l'identité n'a pas pu être lue voit « nous n'avons pas pu lire »
  au lieu de la page de connexion. C'est plus brutal et c'est vrai ; l'ancien comportement était
  doux et faux.

**Ce que cela interdit désormais.**

- Écrire `catch { return [] }` — ou `?? []`, ou `?? null` — sur une lecture de base. Un test
  unitaire lit les fichiers de requêtes et échoue si un `catch` y apparaît sans l'argument écrit
  qui le justifie, sur le modèle des quatre replis existants.
- Faire décider une fonction de requête du comportement de panne de ses appelants.
- Poser un cache pour masquer une dégradation du fournisseur (interdit D, ci-dessus).

## Quand rouvrir

Trois seuils, mesurables :

1. **Si la dégradation devient permanente plutôt qu'épisodique** — dix minutes de suite au-dessus
   de 5 s, ou plus de 5 % d'échecs sur une journée — la question cesse d'être « que rend la page »
   et devient commerciale : le palier du projet Supabase. Une règle de comportement ne rachète pas
   un plafond de ressources.
2. **Si le nombre d'encarts « indisponible » visibles en même temps dépasse trois sur un écran**,
   la dégradation gracieuse est devenue du bruit et le sujet de la page est probablement mal
   choisi. Reclasser, ne pas ajouter de repli.
3. **Si la mise en cache est décidée pour ses propres raisons** — une promesse de fraîcheur écrite,
   un lecteur à qui l'on dit de quand date ce qu'il lit — elle change ce que « accessoire » veut
   dire, et cette ADR est à relire. Elle ne sera pas décidée pendant une panne.

## Question tranchée — « échouer franchement », est-ce le droit de rester nu ?

**Posée le 14 septembre, arbitrée le 15 : option (b), sur délégation (« fais selon tes reco »).**

Un sujet qui échoue rend `app/error.tsx` : un titre, une phrase, un bouton « Réessayer ». Pas
d'en-tête, pas de navigation, pas de mot-marque — le lecteur était **hors du site**, et c'est ce
que le porteur a appelé « le site blanc ». Trois réponses étaient sur la table :

- **(a)** L'écran garde l'en-tête et le pied du site.
- **(b)** L'écran reste nu et gagne deux liens écrits en dur, qui ne lisent rien.
- **(c)** Rien ne change.

**(a) est écartée par une mesure, pas par un goût** : l'en-tête lit la base **trois fois sur
chaque page connectée** (`docs/audit-2026-09-14.md`, partie III). L'écran d'erreur pourrait donc
échouer pour la raison même qui le fait afficher. Ce qu'il gagnerait en navigation, il le perdrait
en fiabilité, au pire moment.

**(b) est retenue**, et les deux destinations sont choisies par la même mesure : l'accueil fait
**zéro** aller-retour (il est prérendu), le journal en fait **un** — les deux pages les moins
chères du site, et l'accueil est la seule qui ne **peut pas** échouer pour la raison qui a amené
le lecteur là. `routes` et `m` sont des lectures de module ; **rien sur cet écran n'attend quoi que
ce soit**, et c'est la propriété à préserver si on le retouche.

### La conséquence qu'il a fallu corriger en même temps

L'arbitrage a fait remonter un défaut de la première livraison : **`SiteHeader` appelait
`currentUser()` nu**. Comme cette fonction jette désormais plutôt que de mentir (D5), une panne
de l'API d'auth transformait l'en-tête — donc **tout le groupe `(app)`, y compris les pages qui
n'ont pas besoin de session** — en écran d'erreur. Le rayon d'explosion dépassait la panne.

C'est la règle de cette ADR appliquée à l'en-tête lui-même : **l'en-tête n'est le sujet d'aucune
page**, donc il dégrade. Mais il ne dégrade pas en mensonge — afficher « Se connecter » à qui a
une session illisible est exactement la fausse affirmation d'identité que D5 retire. L'en-tête a
donc **trois** états et non deux : connecté, déconnecté, et **illisible**, où le coin du compte
n'affiche ni le menu ni « Se connecter » mais dit qu'il n'a pas pu lire, et où la navigation se
réduit aux sections visiteur — les seules qui fonctionnent quoi qu'il arrive.

**La règle générale à en retenir** : une lecture faite par un composant monté sur **toutes** les
pages n'est jamais un sujet, quelle que soit son importance. Sa dégradation est obligatoire, et
son repli doit être muet plutôt que faux.
