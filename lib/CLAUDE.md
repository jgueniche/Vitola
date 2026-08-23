# lib/ — conventions

## Pur et testable

Aucun import React, aucun accès au DOM, aucun effet de bord implicite. Ce qui est ici doit pouvoir
tourner dans un test Node sans harnais. C'est ce qui permet de couvrir l'age gate et le garde-fou
tabac par des tests rapides plutôt que par des parcours de navigateur.

Seuils de couverture sur `lib/` : 80 % des instructions, 75 % des branches (`vitest.config.ts`).

## Fichiers à source unique

Ces fichiers sont **la** définition de quelque chose. Dupliquer leur contenu ailleurs est un bug :

| Fichier | Définit |
|---|---|
| `brand.ts` | Le nom commercial. Nulle part ailleurs (§1, et Q7 est encore ouverte). |
| `routes.ts` | Les segments d'URL français et la liste des routes publiques. |
| `theme.ts` | Les deux seules couleurs qui doivent exister en TypeScript (meta tags, images OG). |
| `compliance/age-gate.ts` | La signature du cookie 18+ et le calcul de majorité. |
| `compliance/tobacco-terms.ts` | Le lexique interdit en boutique. Repris par un trigger en P7. |
| `compliance/dsa.ts` | Les motifs de signalement, les surfaces signalables, le délai annoncé. |
| `i18n/index.ts` | Le point d'entrée de toute copie visible. |
| `release.ts` | La phase de la roadmap et le commit déployé, servis par `/api/health`. |
| `reviews/model.ts` | Les quatre portées, ce que chacune fait *aujourd'hui*, les bornes de `reviews`, et l'échelle des six critères. |
| `reviews/draft.ts` | Ce qu'est un brouillon de dégustation valide, et ce qui le rend invalide. |
| `humidor/model.ts` | Le signe d'un mouvement, les bornes de la cave, la courbe de maturité, le format CSV. |
| `stats/queries.ts` | Ce que comptent les statistiques, et le plafond qu'elles annoncent. |
| `settings/model.ts` | Les défauts de `profile_settings`, et la base légale de chaque consentement. |
| `wiki/model.ts` | Les onze colonnes qu'une contribution peut proposer, et la forme d'un diff. |
| `boxcode/decode.ts` | La **forme** d'un code de boîte. Le **sens** est en base, dans `ref.box_codes`. |
| `site.ts` | L'origine sur laquelle le site répond — sitemap et `metadataBase`. |
| `flags.ts` | La lecture d'un drapeau, et le repli fermé qui va avec. |
| `social/model.ts` | Ce qu'est une publication, les deux portées qu'elle accepte, et **le curseur keyset**. |
| `social/confirmations.ts` | Ce qu'un `?fait=…` veut dire, pour les pages qui en reçoivent un. |
| `social/groups.ts` | Les bornes d'un club, d'un événement et d'un message, le vocabulaire des deux enums, et **le slug d'un club**. |

## Le garde-fou tabac ne s'applique pas aux commentaires

Mesuré, pas supposé, et consigné dans l'ADR 0005 : passés six commentaires de fiche parfaitement
ordinaires, `isShopTextAllowed()` en refuse quatre — *cigare*, *havane*, *boîte de 25*, *vitole*.
Le garde-fou n'est pas cassé ; il existe pour refuser une **annonce de boutique**, et le vocabulaire
d'une annonce interdite est celui d'un commentaire légitime.

Le critère d'un commentaire est **l'incitation, pas le vocabulaire** : c'est le test en une question
de `docs/editorial-guidelines.md`, appliqué par un humain sur signalement. Ne pas rebrancher un
filtre lexical ici en croyant bien faire.

## Le garde-fou tabac a une subtilité

Le catalogue boutique est fait d'accessoires dont le nom **contient** le mot : « coupe-cigare »,
« cave à cigares », « cendrier à cigares ». Un filtre par sous-chaîne les rejetterait tous, tandis
qu'une annonce « Robusto 2019, boîte de 25 » passerait. Les composés d'accessoires sont donc
retirés **avant** le test. La vraie barrière reste l'enum fermé `shop.products.category`.

## Supabase

`supabase/admin.ts` (clé secrète, contourne la RLS) n'est importable que depuis `app/api/**` et
`supabase/functions/**`. Une règle ESLint le refuse partout ailleurs.

Une Server Action qui a besoin de la clé — le rafraîchissement de `cigar_stats` après une écriture
publique est le seul cas à ce jour — n'élargit pas la règle : elle appelle un module posé **dans**
la frontière déjà permise, `app/api/_stats/refresh.ts`. Un dossier Next préfixé par `_` est exclu du
routage, donc c'est un module et jamais un endpoint. Percer le garde-fou pour éviter un import un peu
long serait le mauvais échange : la règle a justement été élargie à `app/**/*.ts` pour fermer le
trou qu'un `actions.ts` laissait.

## Les portées ne se filtrent pas ici

`reviews/queries.ts` ne contient aucun `.eq('visibility', …)`, et c'est la règle centrale de
l'ADR 0004 : quatre policies SELECT décident, donc la même fonction renvoie des lignes différentes
selon qui appelle. Une requête qui doublerait une policy serait un bug même juste, parce qu'elle
survivrait à la policy qu'elle double.

Ce qui **est** dupliqué, ce sont les bornes — longueurs, intervalles, les six clés de `scores` —
parce qu'un `CHECK` refuse en `23514`, ce qui n'est une phrase pour personne.
`tests/unit/reviews-model.test.ts` relit la migration 0003 et échoue si l'une d'elles dérive.

## La seule règle dupliquée qui ne soit pas une borne

`humidor/model.ts` recopie le **signe** d'un mouvement de cave, que `public.humidor_event_delta()`
définit déjà. C'est la seule duplication de logique du dossier, et elle est justifiée par une
phrase : « il vous en restera 4 » se lit **avant** de confirmer, pas après un aller-retour.

Une duplication de logique se paie autrement qu'une duplication de borne. Une borne qui dérive
affiche un message maladroit ; un signe qui dérive affiche un stock que la base contredit, en
silence, dans la direction que personne ne vérifie. `tests/unit/humidor-model.test.ts` relit donc
les branches du `case` dans la migration 0008 et compare arme par arme — `move` compris, qui vaut
zéro des deux côtés et que « corriger » en `-qty` viderait tous les lots déplacés.

## Le fil ne se filtre pas ici non plus, et il ne s'hydrate pas ici non plus

`social/queries.ts` ne contient aucun `.eq('visibility', …)` ni aucun `not in` de blocage, pour la
raison de toujours : cinq policies décident, dont une **restrictive**, et une requête qui les
doublerait survivrait à ce qu'elle double.

Ce qui est nouveau, c'est la seconde moitié. Le carnet s'hydrate en trois allers-retours — les
lignes, puis les auteurs, puis les cigares —, ce qui est un coût fixe et jamais un N+1. Un fil ne
peut pas se le permettre : il lui faut en plus le nombre de braises, le nombre de commentaires et
« l'ai-je braisée », qui sont des questions **par ligne**. Le fil passe donc par `feed_page()`, qui
répond à tout en **un seul appel**, en droits d'appelant. Le critère de sortie de P3 est tenu par la
forme de la donnée plutôt que par une discipline à se rappeler.

Corollaire à ne pas oublier : `feed_page()` a une notion d'**onglet**, `post_card()` n'en a pas.
Lire une publication à son adresse en demandant au fil une page d'une ligne a rendu toute
publication réservée aux abonnés introuvable, y compris pour son auteur.

## Les clubs, l'agenda et la messagerie non plus, et la nuance est ailleurs

`social/group-queries.ts` ne double aucune des treize policies de la 0014 — onze permissives et deux
restrictives. La nuance par rapport au fil : `clubs`, `events` et les deux tables d'appartenance
sont lisibles par **tout le monde**, y compris un visiteur déconnecté, donc leurs policies ne
filtrent rien et la tentation de les « aider » d'un `.eq()` est réelle. `conversations` et
`messages` sont l'inverse — leurs policies sont toute la règle d'accès — et ni ce fichier ni un
écran ne la redisent.

Deux `.eq()` de ce fichier méritent d'être lus deux fois, parce qu'ils ressemblent à une policy
doublée sans en être une : « de quels clubs suis-je membre » change le libellé d'un bouton et jamais
la présence d'une ligne, et « à qui puis-je écrire » empêche le formulaire de proposer un nom que la
base refusera. Une liste qui offre une porte fermée est un piège, pas une barrière.

La boîte de réception passe par `conversation_inbox()` (0015) pour la raison qui a produit
`feed_page()` : qui est l'autre, quel est le dernier message et combien n'ai-je pas lu sont trois
questions **par ligne**. Le reste s'hydrate en un nombre fixe de requêtes — les identifiants, puis
les profils — ce qui est le motif du carnet et jamais un N+1.

Une duplication de logique de plus, et la troisième du dossier : `clubSlug()` recopie ce que
`public.slugify()` sait déjà faire. Elle est justifiée par le formulaire, qui montre l'adresse du
club **pendant** qu'on tape son nom — un aller-retour par frappe n'en est pas un — et
`tests/unit/groups-model.test.ts` la compare à `clubs_slug_format` pour qu'un slug produit ici ne
soit jamais un slug que le CHECK refuse.

## Les caves ne se filtrent pas ici non plus

`humidor/queries.ts` ne contient aucun `.eq('user_id', …)` : `humidors` avait une seule policy
`select`, `user_id = auth.uid()`, et les trois autres tables la rejoignent par un `EXISTS`.
« Mes caves », c'était donc ce que rend `select * from humidors`.

**Ce paragraphe annonçait que P3 changerait cela, et P3 ne l'a pas changé.** La 0010 ouvre bien
`humidors` à un tiers quand `privacy.show_humidor` est coché — donc ces fonctions rendraient la cave
de quelqu'un d'autre — mais elle referme aussitôt les trois tables filles par des policies
**restrictives** propriétaires. Sans elles, ouvrir une cave ouvrait son grand livre, c'est-à-dire
quand la personne a fumé quoi.

Conséquence pratique : ces fonctions restent « mes caves », et la cave d'un tiers se lit par
`social/queries.ts` → `shared_humidor_shelf()`, qui projette trois colonnes et jamais le prix. Une
policy filtre des lignes ; elle ne sait pas cacher une colonne, et un prix de tabac sur le profil
d'un membre est précisément ce que le §2 regarde.
