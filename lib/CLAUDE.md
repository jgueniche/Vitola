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

## Les caves ne se filtrent pas ici non plus

`humidor/queries.ts` ne contient aucun `.eq('user_id', …)`, et cette fois ce n'est pas une nuance :
`humidors` n'a qu'une policy `select`, `user_id = auth.uid()`, et les trois autres tables la
rejoignent par un `EXISTS`. « Mes caves », c'est donc ce que rend `select * from humidors`. Le jour
où P3 ouvrira une cave à un tiers via `privacy.show_humidor`, ces fonctions renverront celle d'un
autre — correctement, sans qu'une ligne change — et c'est la page qui devra dire de quoi elle
parle, comme `listMyNotebook` le fait déjà.
