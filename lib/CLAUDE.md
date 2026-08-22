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
