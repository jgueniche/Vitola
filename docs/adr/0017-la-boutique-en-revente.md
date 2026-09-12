# 0017 — La boutique revend : personne ne vend ici que nous

- **Statut** : **Acceptée** le 12 septembre 2026 — première session de QA humaine, décision du
  porteur (« on va laisser tomber la marketplace ; on va plutôt partir du principe qu'on achète
  nous à des partenaires et puis on revend derrière nous »)
- **Date** : 2026-09-12
- **Décideur** : @jgueniche
- **Remplace** : [ADR 0016](./0016-la-marketplace-d-accessoires.md) — ses D1 à D5 sont annulées
  ou réécrites, sa D7 (le modèle d'argent) disparaît avec son objet
- **Concerne** : `shop.vendors` · `shop.products` · les policies de `storage.objects` du bucket
  `shop-images` · `/boutique` · `/admin/boutique` · les routes supprimées `/vendeur` et
  `/boutique/vendeurs/[slug]` · DSA art. 30 · DAC7 · droit de la consommation (art. L221-18)

## Contexte

L'ADR 0016 a livré une marketplace le 25 août 2026 : deux entrées publiques (une recherche
transversale à facettes et une vitrine par vendeur), un espace vendeur, une relecture
avant publication, et une question ouverte sur le modèle d'argent (D7 : commission Connect
contre abonnement-vitrine).

Dix-huit jours plus tard, la première session de QA humaine l'annule en une phrase. Le modèle
voulu est la **revente** : nous achetons à des partenaires, nous stockons, nous revendons. C'est
un changement de qui est le commerçant, et presque tout ce que la 0016 avait construit en
découlait.

Trois faits rendent la décision moins coûteuse qu'elle n'en a l'air.

**1. Rien de monétaire n'avait été construit.** La 0016 s'était arrêtée avant la caisse — pas de
clés Stripe, pas de structure juridique. Il n'y a donc ni flux à défaire, ni contrat de vendeur à
dénoncer, ni euro à rendre. La D7 ne se tranche pas : elle n'a plus d'objet.

**2. Aucun vendeur réel n'existait.** Deux lignes de `shop.vendors` en base, toutes deux de QA.
L'entrée était humaine par construction (0016, D1) et personne n'avait été invité.

**3. La frontière §2 ne dépendait jamais du vendeur.** Elle tient par l'enum fermé de
`shop.products.category` et par le trigger lexical de la 0021, élargi par la 0022. Changer qui
encaisse ne la touche pas — et c'est ce qui permet d'annuler cinq règles sur six sans rien rouvrir
du seul sujet qui ne se rouvre pas.

## Décision

### D1 — `shop.vendors` porte le partenaire, et le mot « vendor » devient juste

La table garde ses lignes, son nom et ses colonnes d'identité. Ce qu'elle décrit change : **celui à
qui l'on achète**. Et « vendor » est le mot exact — en achats, un *vendor* est un fournisseur,
celui qui vend *à* vous. Ce qui était faux, c'était le mot à l'écran : « espace vendeur »,
« vitrine du vendeur ». Ceux-là partent avec les écrans.

Conséquence : **il n'y a pas de dette de nommage reportée.** On ne renomme pas 480 occurrences
pour réparer un vocabulaire d'interface.

### D2 — Un partenaire n'a pas de compte : `owner_id` disparaît

Tout l'espace vendeur tenait au rattachement `vendors.owner_id` (0016, D2). Sans vitrine, une
colonne qui désigne un membre est une donnée personnelle qui ne sert plus à rien — et une colonne
qui ne sert à rien finit par servir à autre chose. Elle est supprimée, avec son trigger de garde
et les deux policies de `storage.objects` qui la lisaient pour autoriser un dépôt d'image.

### D3 — Un partenaire n'est pas une vitrine : la table n'est plus lisible d'un visiteur

`vendors_select_active` est retirée. Savoir à qui nous achetons est une information de compta, pas
une page du site. Restent les policies d'admin, et `/admin/boutique/partenaires` est le seul écran
qui les lit.

### D4 — La lecture publique d'un produit ne dépend plus de personne

C'était la D4 de la 0016 : « suspendre coupe tout en un UPDATE », la vitrine et les produits
disparaissant ensemble. **En revente c'est faux, et pas seulement approximatif.** Le stock est à
nous : cesser d'acheter chez quelqu'un ne dé-vend pas ce qu'on a déjà acheté, et une policy qui le
ferait retirerait de la vente des articles payés, en silence, le jour où un partenaire ferme.

`products_select_published` ne teste plus que `status = 'published'`. « Arrêter » un partenaire
garde son sens — on n'achète plus là — et ne touche plus au rayon.

### D5 — Un produit peut changer de partenaire

`products.vendor_id` devient nullable et entre dans le `GRANT UPDATE`. La 0022 l'en avait exclu
(« un produit ne change pas de vendeur »), ce qui était juste quand le vendeur était l'auteur de la
fiche. En revente, racheter le même article ailleurs est ordinaire, et la fiche est la nôtre dans
les deux cas.

### D6 — Un produit se publie par un admin, et c'est tout ce qui reste de la relecture

Les quatre policies vendeur de `shop.products` disparaissent. Il n'y a plus de soumission, donc
plus de refus motivé à transmettre, donc plus de « modifier, c'est retirer » (0016, D3). Les
colonnes `submitted_at` et `review_note` restent : elles portent l'historique des fiches déjà
relues, et un brouillon garde une note de travail.

## Ce que cela change comme obligation légale, et il faut le dire

L'**art. 30 du DSA** — la traçabilité du professionnel — vise une plateforme qui permet à des
consommateurs de conclure un contrat avec un **tiers** professionnel. En revente, le professionnel
c'est nous : l'obligation **change de nature plutôt que de disparaître**, et devient celle du droit
de la consommation — information précontractuelle, droit de rétractation (art. L221-18), garantie
légale de conformité. Elle s'arme avec la caisse, pas avant.

**DAC7** disparaît du chemin : la directive vise le déclarant qui verse des revenus à des vendeurs
tiers. Il n'y a plus de vendeur tiers.

Les colonnes de traçabilité (`legal_name`, `registration`, `address`, `contact_email`) restent, et
pour une raison indépendante : savoir à qui l'on achète est une obligation **comptable**. Elles
changent simplement de fondement.

Le `vendor` de `mod.reports` reste dans le CHECK, et n'est plus signalable de nulle part : les
signalements déjà déposés contre une vitrine doivent rester lisibles, et une file de modération qui
ne sait pas ouvrir sa propre histoire est pire qu'une surface que personne ne peut atteindre.

## Conséquences

**Ce qui est retiré** : `/vendeur` (l'espace vendeur, 268 lignes et son `actions.ts`),
`/boutique/vendeurs/[slug]` (la vitrine), la facette « vendeur » de la recherche, la mention
« vendu par » sur une fiche produit et sur une carte, le lien d'espace vendeur dans `/parametres`
et dans l'en-tête, `tooling/parcours/marketplace.ts` (un parcours qui affirmait qu'un vendeur peut
publier affirmerait désormais une contre-vérité).

**Ce qui ne bouge pas** : l'enum fermé de `products.category`, le trigger lexical §2 sur les deux
tables, `shop_enabled` comme coupe-circuit, le panier-cookie, le paiement de démonstration, les
avis produits sans porte d'écriture (ADR 0015, D3).

**Ce qui reste à faire** : réécrire un parcours navigateur du tunnel d'achat — les étapes 12 à
12 ter de `marketplace.ts` couvraient le panier et la confirmation `QA-`, et cette couverture est
perdue avec le fichier. Déclencheur : la prochaine session qui touche `/boutique`, et de toute
façon les clés Stripe, qui réécriront le tunnel.

## Question ouverte

**Qui sont les partenaires, et à quelles conditions ?** La revente suppose des contrats
d'approvisionnement, des marges et un stock réel — trois choses qui n'existent pas encore et
qu'aucune table ne décrira avant qu'elles existent. `shop.products.stock_qty` est aujourd'hui un
nombre qu'un admin saisit ; le jour où il représente un carton dans une pièce, il devient un
inventaire, et un inventaire est une ADR.
