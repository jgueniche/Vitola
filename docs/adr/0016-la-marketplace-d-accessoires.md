# 0016 — La marketplace d'accessoires : deux entrées, un vendeur qui ne publie pas, et pas un euro qui circule

- **Statut** : **Acceptée** le 25 août 2026 — GO du porteur (« la marketplace d'accessoires,
  l'option B de la discussion du 25 août »), qui déclenche le point 2 de « Quand rouvrir » de
  l'ADR 0015
- **Date** : 2026-08-25
- **Décideur** : @jgueniche
- **Concerne** : ADR 0015 (le catalogue avant la caisse) · ADR 0003 (acceptée : Checkout ; la
  marketplace y était « une v2 possible ») · ADR 0011 (l'asymétrie de publication des lieux) ·
  `shop.products` · `shop.product_reviews` · `/admin/boutique` · le futur `/boutique` ·
  DSA art. 30 · DAC7 (directive 2021/514)

## Contexte

L'ADR 0003 avait rangé la marketplace de partenaires en « v2 possible » ; l'ADR 0015 en avait
fait son deuxième déclencheur de réouverture (« des partenaires vendent → un rôle vendor, Stripe
Connect, et une ADR entière »). **Le GO est donné le 25 août 2026**, avec un périmètre précis :
le modèle cible est celui d'Amazon, à deux entrées — une recherche transversale à facettes sur
tous les produits publiés, ET une page vitrine par vendeur (« la boutique Elie Bleu ») — et
**rien de monétaire ne se construit** : pas de clés Stripe, pas de structure juridique (Q10),
donc catalogue et vitrines, jamais la caisse.

Six faits cadrent la décision.

**1. Le vendeur et la marque sont deux questions, et Amazon les sépare pour une raison.** Elie
Bleu fabrique des caves ; une civette parisienne en vend. La facette « marque » répond à « qui
fabrique », la vitrine répond à « qui vend » — un produit porte les deux, et les confondre
rendrait l'une des deux questions sans réponse. Les marques d'accessoires ne touchent **pas**
`ref.brands` : ce schéma est le référentiel des marques de cigares, sa provenance est sa valeur
(PROVENANCE.md), et y verser des fabricants de briquets diluerait exactement ce qu'il promet.

**2. Un vendeur n'est ni au-dessus ni au-dessous d'un membre.** `has_min_role()` est une échelle
— `member < contributor < editor < moderator < admin` — et chaque échelon contient les
précédents. « Vendeur » n'est pas un échelon : un `editor` peut vendre, un vendeur peut être
simple `member`, et un vendeur suspendu reste un membre entier. Mettre `vendor` dans l'enum
`app_role` donnerait au vendeur les droits d'un membre au mieux, les retirerait au pire, et
casserait la sémantique de l'échelle dans les deux cas.

**3. L'asymétrie de publication est déjà tranchée, deux fois.** Les lieux (ADR 0011) : un lieu
naît `pending` et son auteur ne le publie pas — le WITH CHECK de sa policy l'exige, un `editor`
publie. Les gammes (ADR 0009) : la 0019 a corrigé une table où l'insertion publiait. Un produit
de vendeur est le même problème avec un enjeu §2 en plus : le trigger lexical de la 0021 refuse
un produit du tabac, mais un vendeur qui publierait lui-même pourrait mettre en ligne n'importe
quoi d'autre — contrefaçon, produit dangereux, description trompeuse — sous le nom de la
plateforme. La relecture avant publication n'est pas un luxe, c'est la position déjà prise.

**4. Le DSA art. 30 exigera une traçabilité avant que le premier contrat se conclue.** Une
plateforme qui permet à des consommateurs de conclure des contrats à distance avec des
professionnels doit obtenir d'eux, avant de leur ouvrir ses services : nom, adresse, téléphone
et courriel ; un document d'identification ; leurs coordonnées de paiement ; leur inscription au
registre du commerce et son numéro ; et une auto-certification de conformité au droit de
l'Union. Elle doit de plus faire des efforts raisonnables pour vérifier ces informations.
**Aujourd'hui, aucun contrat ne peut se conclure** — pas de caisse — donc l'article ne mord pas
encore ; mais l'activation d'un vendeur est le moment où cette collecte a lieu, et le schéma
doit la porter dès maintenant pour que rien ne soit à refaire le jour des clés.

**5. La boutique propre existe déjà, et rien ne se refait.** L'ADR 0015 a livré `shop.products`,
`/admin/boutique`, le trigger lexical, le bucket. La marketplace ne remplace rien : elle ajoute
le vendeur comme dimension, et la boutique du porteur devient **le premier vendeur** — ses
produits basculent dessus, ses écrans continuent de marcher.

**6. L'ADR 0015 D1 disait « aucune route publique », et ce renversement doit être conscient.**
La position tenait par « un rayon sans caisse est une promesse à l'écran ». Elle est renversée
ici — les vitrines existent avant la caisse — mais le renversement est **gardé par un drapeau
fermé** : tant que le porteur n'ouvre pas commercialement, aucune route publique ne rend rien.
Un drapeau naît dans une migration, avec le code qui le lit (`admin_set_flag` refuse une clé
inconnue) ; l'ouverture est donc un acte tracé de l'admin, pas un déploiement.

## Options

### D1 · Comment un vendeur existe-t-il ?

**A — L'inscription libre** : un membre coche « devenir vendeur ».
*Coût :* une marketplace ouverte est une place de marché au sens du DSA dès le premier contrat,
avec les obligations de l'art. 30 sur des inconnus — et le §2 confié à des inconnus.

**B — L'entrée est humaine.** `shop.vendors`, créée par l'admin seul (policy INSERT
`has_min_role('admin')`), à trois états — `pending` (créé, pas encore ouvert), `active` (la
vitrine vit), `suspended` (coupé, réversible). Un vendeur naît `pending` par défaut — la
naissance uniforme des lieux — et l'activation est un second geste, celui où la traçabilité du
fait 4 se collecte. La table porte l'identité de vitrine (nom, slug, description, logo,
contact) **et** les colonnes de traçabilité art. 30 (`legal_name`, `registration` — le numéro
au registre, SIREN en France —, `address`, `contact_email`, `contact_phone`), nullables : la
contrainte dure « pas d'activation sans traçabilité » arriverait aujourd'hui sur la seule
boutique existante — celle du porteur, dont la structure juridique est précisément la question
Q10, ouverte. Exiger un numéro au registre qui n'existe pas fabriquerait une donnée inventée
dans une colonne juridique : le registre de consentements à l'envers. La barrière dure (un
CHECK) arrive avec la caisse, qui est aussi le moment où l'art. 30 devient opposable.

### D2 · Le rattachement du compte au vendeur

**A — Une valeur `vendor` dans `app_role`.** Refusée par le fait 2.

**B — Une table de liaison `vendor_members`** (n comptes ↔ 1 vendeur, rôles internes).
*Coût :* trois décisions de plus — qui ajoute un compte, qui le retire, ce que voit chacun —
pour un besoin qui n'existe pas : il y a aujourd'hui zéro vendeur réel.

**C — `vendors.owner_id`, une colonne.** Un vendeur est géré par un compte, posé par l'admin au
rattachement, `unique` (un compte gère au plus une boutique), `on delete set null` (l'effacement
RGPD du compte laisse la boutique orpheline, que l'admin rattache ou suspend — les produits ne
disparaissent pas avec le compte de leur gestionnaire). La RLS qui en découle tient en un
prédicat : `owner_id = (select auth.uid())` est « ma boutique », et les policies vendeur de
`shop.products` le rejoignent par un `EXISTS`. Le jour où une boutique a des employés, la
colonne devient une table de liaison — une migration, pas une refonte.

### D3 · Qui publie un produit de vendeur ?

**A — Le vendeur publie, l'admin dépublie a posteriori.** C'est l'asymétrie de `ref.lines`
d'avant la 0019 — à l'envers, et corrigée une fois déjà.

**B — Le vendeur écrit des brouillons et NE PUBLIE PAS : le WITH CHECK l'exige.** Ses policies
INSERT et UPDATE portent `status = 'draft'` — il ne peut ni créer ni amener une ligne vers
`published` ou `archived`, quelle que soit la requête forgée. « Soumettre à relecture » n'est
pas un quatrième statut : c'est `submitted_at`, un horodatage que le vendeur pose (et retire)
sur son brouillon — pas d'`ALTER TYPE`, et la file admin est `status = 'draft' AND submitted_at
IS NOT NULL`, du plus ancien au plus récent, l'ordre d'une file. L'admin publie, refuse
(retour au brouillon avec un motif : `review_note`, lisible du vendeur), dépublie. Conséquence
assumée : **modifier, c'est retirer** — un vendeur qui veut corriger une fiche publiée la
repasse en brouillon (son UPDATE ne peut aboutir qu'à `draft`), et elle repart en relecture.
Tant que la relecture est un humain et les vendeurs une poignée, c'est le bon prix ; une table
de révisions serait le wiki, pour un catalogue qui n'en a pas le trafic. Deux colonnes se
gardent par un trigger, parce qu'un grant de colonne ne sait pas distinguer deux rôles
applicatifs du même rôle PostgreSQL : `vendors.status` et `vendors.owner_id` ne se changent que
par un admin (`tg_protect_vendor_privileges`), et `products.review_note` ne s'écrit que par un
admin — le motif exact du trigger de garde de `profiles`.

### D4 · Les produits existants

**Un vendeur « Vitola » naît dans la migration**, `active`, `owner_id null` — la boutique
propre est celle du porteur, gérée depuis `/admin/boutique` par ses policies admin, sans passer
par l'espace vendeur. `products.vendor_id` bascule dessus puis devient `NOT NULL` : un produit
sans vendeur n'existe pas. La colonne est hors de tout `GRANT UPDATE` — un produit ne change pas
de vendeur, le motif de `reviews.user_id`. La FK est `on delete restrict` : un vendeur ne se
supprime pas tant qu'il a des produits — suspendre est le verbe normal, supprimer est le geste
rare d'une boutique vide.

### D5 · La marque d'accessoire : colonne ou table ?

**A — Une table `shop.accessory_brands`.** *Coût :* qui la remplit, qui la publie, que fait une
marque orpheline — le problème de `ref.lines`, recréé dans `shop` pour zéro marque réelle.

**B — `products.brand`, une colonne texte, nullable.** C'est ce que le §5.8 du brief écrivait.
La facette de marque est un filtre d'égalité sur la colonne ; la distinction du fait 1 est
tenue (deux colonnes, deux parcours) ; et le trigger lexical s'étend à `brand` — une marque
d'accessoire nommée « Habanos » est exactement ce que le §2 interdit d'afficher en boutique.
La table arrive si les facettes deviennent sales ou si une page de marque est demandée — le
seuil des ~200 produits de l'ADR 0015 vaut ici aussi.

### D6 · Les avis produits

**Inchangés — ADR 0015 D3 tient mot pour mot.** `shop.product_reviews` existe, déclarée
partout où une donnée personnelle se déclare, et **rien ne peut y écrire** tant que la caisse
n'a pas tranché « achat vérifié ». La fiche produit publique lit la table (il n'y a rien) et
son état vide le dit : un avis demandera un achat.

### D7 · Le modèle d'argent — la question OUVERTE de cette ADR

Commission sur transaction (Stripe Connect : KYC des vendeurs, reversements, la plateforme
encaisse et redistribue) contre abonnement-vitrine (le vendeur paie l'emplacement, encaisse
chez lui — mais « encaisse chez lui » sans caisse chez nous veut dire un lien sortant, donc un
parcours d'achat hors plateforme à concevoir). **Intranchable aujourd'hui** : sans clés Stripe
il n'y a rien à essayer, sans structure juridique (Q10) il n'y a personne pour encaisser, et le
choix engage la fiscalité du porteur. **Rien de monétaire ne se construit** : pas de colonne de
commission, pas de champ d'abonnement, pas de compte Connect — le schéma ne préjuge de rien.

**DAC7, consigné comme prérequis du jour où l'argent circule.** La directive 2021/514 fait de
toute plateforme qui permet à des vendeurs de percevoir une contrepartie un **opérateur de
plateforme déclarant** : collecte du NIF et de l'identité fiscale de chaque vendeur, déclaration
annuelle de leurs revenus à l'administration (DPI-DAC7), information des vendeurs. Ce n'est ni
du schéma ni de l'écran aujourd'hui — c'est la ligne qui empêchera de brancher Connect « juste
pour essayer » : le premier euro reversé déclenche l'obligation.

## Décision

**D1 : option B.** `shop.vendors`, entrée humaine, trois états, naissance `pending`, colonnes
de traçabilité art. 30 posées et nullables — la contrainte dure arrive avec la caisse.

**D2 : option C.** `owner_id`, unique, `on delete set null`, gardée par le trigger ; « ma
boutique » est un prédicat d'une ligne et les policies vendeur de `products` le rejoignent par
`EXISTS`.

**D3 : option B.** Le WITH CHECK vendeur exige `draft` ; `submitted_at` est la soumission ;
l'admin publie, refuse avec motif, dépublie. La lecture publique d'un produit exige **aussi**
que son vendeur soit `active` : suspendre un vendeur coupe sa vitrine et retire ses produits de
la recherche transversale en un UPDATE d'une ligne — c'est l'EXISTS de la policy, soumis à la
RLS de `vendors`, qui le garantit.

**D4, D5, D6 : comme énoncé.** Le vendeur « Vitola » naît dans la 0022 et rien ne se refait ;
`brand` est une colonne sous le trigger lexical ; les avis restent sans porte.

**D7 : ouverte**, avec DAC7 consigné. Rien de monétaire.

**Le drapeau : `shop_enabled`**, né dans la 0022, **fermé**. Tout `/boutique` — recherche,
fiche, vitrines — répond 404 tant qu'il est fermé, et la carte du hub ne se rend pas (le motif
`venues_enabled`). L'ouvrir est le geste d'ouverture commerciale du porteur, par
`/admin/drapeaux`, tracé dans `audit_log`.

**Les écrans.** L'espace vendeur vit sous `/vendeur` (le motif de `/moderation` : un membre qui
n'a pas de boutique lit pourquoi la page ne lui est pas ouverte ; le lien vit sur
`/parametres`, où le rôle est déjà chargé) : ses produits, créer, modifier, soumettre, retirer,
et sa vitrine (description, logo, contact). La relecture vit dans `/admin/boutique` (la file
des soumissions, publier, refuser avec motif, dépublier) et `/admin/boutique/vendeurs` (créer
un vendeur, rattacher un compte, activer, suspendre). Le public : `/boutique` (facettes
catégorie, marque, vendeur, prix — le motif de `/cigares` : des liens, un `<form method="get">`,
zéro JavaScript), `/boutique/[slug]` (la fiche : prix, marque, vendeur en lien — **aucun bouton
d'achat** : la caisse n'existe pas, on ne promet rien), `/boutique/vendeurs/[slug]` (la
vitrine).

## Conséquences

**Ce que nous acceptons, y compris désagréable.**

- **L'ADR 0015 D1 est renversée en conscience** : des routes publiques existent avant la
  caisse, gardées par un drapeau fermé. Le renversement attend l'ouverture commerciale — et le
  jour où le drapeau s'ouvre sans caisse, une fiche produit sans bouton d'achat est une
  décision d'affichage assumée, pas une promesse cassée.
- **Un vendeur activé aujourd'hui peut l'être sans traçabilité complète.** La colonne existe,
  l'écran la demande et dit ce qui manque, mais le CHECK attend la caisse — parce que
  l'imposer aujourd'hui exigerait un numéro au registre que la boutique propre n'a pas (Q10).
- **`submitted_at` est écrit par le vendeur, donc antidatable par un POST forgé.** L'ordre de
  la file de relecture est une courtoisie, pas une frontière de sécurité : antidater fait
  doubler une file que relit un seul humain, et ne publie rien.
- **Modifier une fiche publiée la retire de la vente** jusqu'à re-relecture. C'est le prix de
  « le vendeur ne publie pas », payé à chaque correction de prix — tenable à une poignée de
  vendeurs, à revoir si la relecture devient un goulot mesuré.
- **Le trigger de garde s'ajoute à la liste des colonnes barrées deux fois**
  (`supabase/CLAUDE.md`) : `vendors.status`, `vendors.owner_id`, `products.review_note`.

**Ce que cela interdit désormais.**

- **Une inscription vendeur en libre-service**, par quelque écran que ce soit.
- **Un produit publié par son vendeur**, par quelque requête que ce soit — le WITH CHECK est
  la barrière, pas l'écran.
- **Une marque d'accessoire dans `ref.brands`**, dans un sens comme dans l'autre.
- **Un euro qui circule** — commission, abonnement, lien de paiement sortant — avant que D7
  soit tranchée, avec ses prérequis (clés, Q10, DAC7).
- **Un rôle `vendor` dans `app_role`**, aujourd'hui et le jour de Connect.

## Quand rouvrir

1. **Les clés Stripe arrivent** → D7 se tranche (Connect contre abonnement), le CHECK de
   traçabilité art. 30 se pose, l'auto-certification et la vérification « efforts
   raisonnables » deviennent un parcours d'activation, DAC7 devient un chantier, les avis
   s'ouvrent (achat vérifié — ADR 0015), et la surface DSA des avis s'ajoute au CHECK de
   `mod.reports`.
2. **Une boutique a besoin de plusieurs mains** → `owner_id` devient une table de liaison,
   avec l'ADR courte qui décide qui ajoute et qui retire.
3. **Les facettes de marque deviennent sales, ou une page de marque est demandée** → la
   colonne `brand` devient une table.
4. **La relecture devient un goulot mesuré** (des soumissions qui attendent des jours) → la
   règle « modifier, c'est retirer » se rediscute, probablement vers des révisions de fiche.

## Question ouverte

**D7 — le modèle d'argent** (commission Connect contre abonnement-vitrine), intranchable sans
clés Stripe ni structure juridique (Q10), avec DAC7 comme prérequis du premier euro reversé.
