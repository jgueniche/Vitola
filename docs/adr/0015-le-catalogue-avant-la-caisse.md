# 0015 — Le catalogue naît avant la caisse, et il s'alimente sans développeur

- **Statut** : **Acceptée** le 25 août 2026 — commande du porteur (« il me faut une interface
  pour l'alimenter sans passer par toi »)
- **Date** : 2026-08-25
- **Décideur** : @jgueniche
- **Concerne** : P7 (boutique, F10) · ADR 0003 (acceptée : Checkout, boutique propre) ·
  `shop.products` · `shop.product_reviews` · `/admin/boutique` ·
  `lib/compliance/tobacco-terms.ts` · `docs/setup/supabase.md` (exposition du schéma)

## Contexte

L'ADR 0003 est tranchée — boutique propre d'abord, Stripe Checkout — et ses clés n'existent pas
encore. Le porteur demande la moitié qui ne dépend d'aucune clé : **le catalogue**, avec une
interface d'administration complète (titre, description, prix, stock, catégorie, image), pour
préparer la boutique sans passer par une session de développement. Cinq faits cadrent la
décision.

**1. Le §2 fait du catalogue une surface juridique avant d'être une surface commerciale.** La
boutique ne vend que des accessoires ; le garde-fou existe en TypeScript
(`lib/compliance/tobacco-terms.ts`) avec sa subtilité mesurée — les noms d'accessoires
*contiennent* le mot (« coupe-cigare », « cave à cigares ») — et son commentaire promet depuis
P1 : « repris par un trigger en P7 ». Un contrôle applicatif seul se contourne par n'importe
quelle écriture directe.

**2. Un panier qui ne se vide pas est une promesse à l'écran.** La session P8 a refusé de montrer
une boutique sans paiement, et l'ADR 0003 confirme. Le catalogue peut donc naître **sans aucune
route publique** : `/admin/boutique` alimente, et `/boutique` arrive avec Checkout.

**3. `shop` est un schéma neuf, et les schémas neufs ont coûté trois migrations.** L'amorçage
Supabase est par schéma (0005, 0007) : chaque grant s'écrit explicitement, `service_role` compris
— l'export RGPD lira `shop.product_reviews` le jour où il y a des lignes, et un 500 découvert par
un membre est le bug de la 0007. Et le schéma devra être **exposé à PostgREST** : la boutique de
P7 se lit par le client comme le reste, et l'admin d'aujourd'hui écrit par la session. C'est un
réglage de projet, documenté dans `docs/setup/supabase.md` — le quatrième qui ne vit dans aucun
fichier exécutable.

**4. Les avis clients demandent des acheteurs.** Le porteur les liste (« comme toute
marketplace ») ; un avis produit est du contenu de membre — donc RGPD (colonne vers
`auth.users`, export, effacement) et DSA (signalable) le jour où il existe. Ce qui peut être faux
plus tard doit être déclaré maintenant ; ce qui ne peut pas encore exister ne doit pas avoir de
porte d'écriture.

**5. Le stock d'un catalogue fermé n'est pas le stock d'une caisse ouverte.** Tant que rien ne se
vend, `stock_qty` est un inventaire déclaratif que l'admin corrige à la main. Le jour de
Checkout, le décompte devient transactionnel (webhook) — et c'est ce jour-là que la règle de la
cave (« une quantité est une somme d'événements ») se posera, pas avant.

## Options

### D1 · Le catalogue attend-il les clés Stripe ?

**A — Tout P7 d'un bloc, aux clés.** *Coût :* le porteur ressaisit son catalogue dans l'urgence
de l'ouverture, ou le dicte à une session — l'inverse de la demande.

**B — Le catalogue maintenant, la caisse aux clés, aucune route publique entre les deux.** Les
produits ont un `status` ; « publié » veut dire « prêt pour l'ouverture », et la policy de
lecture publique existe dès aujourd'hui pour que `/boutique` n'ait rien à changer le jour où elle
naît.

### D2 · Où vit le garde-fou tabac ?

**A — La validation d'écran seule.** *Coût :* contournable par toute écriture directe ; le §5.8
demande le trigger.

**B — Trois barrières.** L'enum fermé `shop.product_category` (aucune valeur tabac — la vraie
barrière) ; le trigger `shop.tg_refuse_tobacco_listing()` qui retire d'abord les composés
d'accessoires puis refuse les termes interdits (le lexique de `tobacco-terms.ts`, dupliqué en SQL
et gardé par un test de dérive dans les deux sens) ; et la validation d'écran qui redit le refus
en français avant que la base ne parle en `23514`.

### D3 · Les avis clients, maintenant ou avec la caisse ?

**A — Table et écriture maintenant.** *Coût :* des avis sans acheteurs, sur des produits que
personne ne peut voir — et la question « achat vérifié » tranchée par accident, avant que les
commandes existent.

**B — La table maintenant, AUCUNE policy d'écriture.** Le schéma est déclaré à l'inventaire RGPD
dès sa naissance (colonnes vers `auth.users` : `author_id` en cascade, `created_by` en
`set null`), la modération a ses colonnes `hidden_*` hors de tout grant, et l'écriture s'ouvre
avec la caisse — qui décidera d'« achat vérifié » et ajoutera la surface au CHECK de
`mod.reports` au moment où un avis peut exister.

### D4 · Qui écrit le catalogue ?

**A — Les `editor`.** *Coût :* le rôle du wiki mélangé au commerce.
**B — `admin` seul, par la session.** La boutique propre est celle du porteur ; les policies
`has_min_role('admin')` suffisent et aucune porte n'est nécessaire (la D1 de l'ADR 0014). Le jour
des partenaires (marketplace v2), un rôle `vendor` sera une ADR.

## Décision

**D1 : option B.** Le catalogue naît maintenant, dans `shop`, sans route publique. `/boutique`
arrive avec Checkout et lira les mêmes policies.

**D2 : option B — les trois barrières**, et le test
`tests/compliance/shop-lexicon-drift.test.ts` échoue si le lexique SQL et le lexique TypeScript
divergent, dans un sens comme dans l'autre.

**D3 : option B.** `shop.product_reviews` existe, déclarée partout où une donnée personnelle se
déclare, et **rien ne peut y écrire** — pas de grant, pas de policy. L'ouvrir est un geste de P7.

**D4 : option B.** Les écrans vivent sous `/admin/boutique` : liste, création, édition (panneau
dans l'URL — la règle de `/cave`), publication, archivage, suppression, image. L'image vit dans
un bucket **privé** `shop-images` (le §8 n'admet de public qu'`articles-media`), écrite par
l'admin seul, lue en URL signée.

## Conséquences

**Ce que nous acceptons, y compris désagréable.**

- **`shop` entre dans `db_schema`** — un réglage de console de plus qu'aucune migration ne
  rejoue, ajouté à `docs/setup/supabase.md`. Le schéma reste vide de droits pour qui n'en a pas :
  l'exposition ne donne que ce que les grants et la RLS donnent.
- **Le lexique vit en double**, TypeScript et SQL, comme le signe des mouvements de cave — une
  duplication de logique, payée pour qu'un refus soit une phrase à l'écran ET une garantie en
  base. Le test de dérive est le prix d'entretien.
- **`stock_qty` s'écrit à la main jusqu'à Checkout.** C'est un inventaire d'ouverture prolongé ;
  la règle « une quantité est une somme » arrive avec la première vente, pas avant.
- **Supprimer un produit supprime son image et rien d'autre.** Le jour où des commandes
  référencent un produit, la suppression deviendra un archivage forcé — contrainte de P7.

**Ce que cela interdit désormais.**

- **Une valeur tabac dans `shop.product_category`.** L'auto-contrôle de la migration compare les
  libellés de l'enum au lexique interdit.
- **Écrire un avis produit**, par qui que ce soit, tant que P7 n'a pas tranché « achat vérifié ».
- **Une route publique `/boutique`** avant Checkout — un rayon sans caisse est une promesse à
  l'écran (ADR 0003, position de P8).
- **Un champ de prix sur autre chose qu'un accessoire.** Rien ne change aux règles §2 : le prix
  d'un produit du tabac reste `msrp_eur` sur `ref.cigars`, derrière son drapeau fermé.

## Quand rouvrir

1. **Les clés Stripe arrivent** → la caisse (Checkout, webhook idempotent, décompte
   transactionnel du stock), l'ouverture des avis (achat vérifié), la surface DSA, la route
   publique.
2. **Des partenaires vendent** (marketplace v2, refusée pour l'instant par l'arbitrage 0003) →
   un rôle `vendor`, Stripe Connect, et une ADR entière.
3. **Le catalogue dépasse ~200 produits** → la recherche et la pagination que la liste v1 n'a pas.

## Question ouverte

Aucune — les trois décisions commerciales restantes (structure juridique/TVA, périmètre de
livraison, politique de retours) sont celles de l'ADR 0003, dues avant l'**ouverture** de la
boutique, pas avant son remplissage.
