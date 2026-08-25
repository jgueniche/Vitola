# 0003 — Utiliser Stripe Checkout hébergé en v1, Payment Element seulement si la conversion l'exige

- **Statut** : **Acceptée** le 25 août 2026 — arbitrage du porteur, voir en fin de document
- **Date** : 2026-08-21
- **Décideur** : @jgueniche
- **Concerne** : P7 · `shop.*` · `app/api/stripe/webhook/route.ts`

## Contexte

La boutique de P7 vend **exclusivement des accessoires** — coupes, briquets, cendriers, caves,
hygromètres, étuis, produits d'humidification, livres, entretien. Le §2 interdit toute vente de
tabac ; l'enum `shop.products.category` est fermée et un déclencheur refuse les libellés à
consonance tabac. Rien dans cette ADR ne touche à ce périmètre.

Contraintes qui pèsent sur le choix du paiement :

1. **Périmètre PCI.** Une page de paiement hébergée par Stripe relève du SAQ A, le questionnaire le
   plus léger. Un formulaire de carte servi depuis notre domaine — même avec des iframes Stripe —
   relève du SAQ A-EP, sensiblement plus exigeant.
2. **TVA européenne.** Vente de biens physiques à des consommateurs de plusieurs États membres :
   guichet unique OSS, taux par pays, mentions de facture. Stripe Tax couvre ce calcul ; le faire à
   la main est un chantier à part entière.
3. **DSP2 / authentification forte.** 3-D Secure est obligatoire sur les cartes européennes.
4. **Une personne.** Chaque écran de paiement construit à la main est un écran à maintenir, à
   tester et à corriger quand un moyen de paiement change.
5. **La direction artistique.** Le §4 construit une identité qu'une page Stripe standard
   interrompt. C'est le seul argument sérieux contre Checkout, et il est réel.

## Options

**A — Stripe Checkout (page hébergée).** Redirection vers `checkout.stripe.com`, retour sur une
page de confirmation.
*Apporte :* SAQ A, 3DS, Stripe Tax, Link, Apple Pay et Google Pay sans code, collecte d'adresse,
codes promo, pages traduites et accessibles, conformité maintenue par l'éditeur.
*Coûte :* rupture visuelle. La personnalisation se limite au logo, à quelques couleurs et à une
police — insuffisant pour reproduire le §4.

**B — Payment Element (intégré).** Le formulaire vit dans nos pages.
*Apporte :* continuité visuelle complète, tunnel maîtrisé.
*Coûte :* SAQ A-EP, gestion manuelle du cycle `PaymentIntent`, des états 3DS, des échecs et des
reprises. Stripe Tax reste utilisable mais s'appelle explicitement. Estimation : **3 à 4 sessions
supplémentaires sur P7**, plus une charge de maintenance permanente à chaque évolution des moyens de
paiement.

**C — Formulaire de carte propre.** Hors de question : SAQ D, sans contrepartie.

## Décision

**Option A pour la v1**, exactement comme le §3 le prévoit — mais avec une exigence que le brief ne
formule pas : **le modèle de données de commande ne connaît pas Stripe.**

Le raisonnement : la boutique est une source de marge secondaire adossée à un projet dont le cœur
est éditorial et communautaire. Dépenser quatre sessions sur l'esthétique d'un tunnel de paiement
avant d'avoir la moindre commande, c'est optimiser un chiffre qui n'existe pas encore. Checkout
permet de savoir si quelqu'un achète ; Payment Element permettra d'améliorer la conversion **une
fois** cette conversion mesurée.

## Conséquences

**Acceptées :**

- **Une rupture visuelle au moment du paiement.** Atténuée par la personnalisation de Checkout
  (logo, fond Maduro, accent Claro, Bodoni si la police est acceptée) et par un retour immédiat sur
  une page de confirmation entièrement à notre main. Cela reste un compromis, pas une solution.
- **Le webhook devient un composant critique.** `checkout.session.completed` crée la commande. Il
  faut donc : vérification de signature, table `shop.stripe_events` avec `event_id` **unique** pour
  l'idempotence, écriture transactionnelle, tolérance à la re-livraison (Stripe rejoue), et un
  chemin de rattrapage si le webhook est manqué (interrogation de la session au retour client).
  Rien de tout cela n'est optionnel — c'est le critère de sortie de P7.
- **Le panier reste chez nous.** `shop.carts` / `cart_items` sont notre modèle ; la session Stripe
  est créée à la volée à partir du panier, jamais l'inverse. C'est ce qui rend l'option B atteignable
  plus tard sans toucher au domaine.
- **Aucune donnée de carte ne transite chez nous, jamais.** Y compris en journalisation.

**Ce que cela interdit :** afficher un formulaire de carte sur nos pages en v1, même « juste pour
tester ». Cela ferait basculer le périmètre PCI sans décision explicite.

**Chemin vers l'option B, entretenu dès P7 :** les tables `orders` / `order_items` / `refunds`
n'ont aucune colonne nommée d'après Stripe hormis `provider_reference` et `provider` ; le calcul du
total est fait par nous et vérifié contre Stripe, jamais lu depuis Stripe. Basculer vers Payment
Element devient alors un changement d'interface, pas une migration.

## Quand rouvrir

- Le taux d'abandon mesuré **entre le panier et la confirmation dépasse 40 %** sur au moins
  200 sessions, **et** l'analyse d'entonnoir désigne la redirection comme cause, **ou**
- un moyen de paiement nécessaire au marché visé n'est pas servi par Checkout, **ou**
- la boutique devient une source de revenu de premier plan plutôt qu'un complément.

## Questions ouvertes

1. **Quelle est la structure juridique qui encaisse, et est-elle immatriculée à la TVA ?** Cela
   conditionne la configuration de Stripe Tax, les mentions de facture et le seuil OSS. Sans
   réponse, P7 ne peut pas se clore. Voir **Q10**.
2. **Quel périmètre de livraison en v1 ?** France seule simplifie fortement la TVA et le
   transport ; l'UE entière impose l'OSS dès la première commande transfrontalière.
3. **Qui traite les retours et sous quel délai ?** Le droit de rétractation de 14 jours est
   opposable et doit apparaître dans les CGV **avant** l'ouverture de la boutique.

### Arbitrage rendu — 25 août 2026

**Boutique propre d'abord, Checkout hébergé — l'option A telle qu'écrite.** Le porteur a tranché
entre trois ambitions qui lui étaient présentées : (A) la boutique du brief, (B) une place de
marché de partenaires d'emblée (Stripe Connect, KYC, DAC7), (C) une vitrine partenaires sans
paiement. Sa réponse : « boutique propre d'abord ». La marketplace reste une v2 possible, et
c'est précisément ce que cette ADR préservait — le modèle de commande ignore Stripe.

La construction attend toujours ses trois clés : les clés Stripe, **le catalogue réel**
(accessoires, prix, stock — une décision commerciale qu'aucune session n'invente), et la
structure juridique qui encaisse (Q10). Les trois questions ouvertes ci-dessus restent dues
avant l'ouverture de la boutique.

**Un périmètre a été refusé au passage, et il faut le retrouver ici** : l'idée d'afficher le
stock des civettes par cigare contre un abonnement payant des buralistes cumule ce que la loi
Évin interdit — désigner où acheter un produit du tabac précis, et être rémunéré pour cette mise
en avant. Elle n'entre ni dans cette ADR ni dans aucune autre ; le détail est dans
`docs/decisions-log.md` et la règle n° 1 de `CLAUDE.md` la couvre déjà.
