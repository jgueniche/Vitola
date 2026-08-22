# 0005 — Accrocher les commentaires à la fiche cigare, et en tirer les conséquences de modération

- **Statut** : Proposée — cible tranchée par @jgueniche le 22 août 2026 ; les conséquences
  ci-dessous attendent validation
- **Date** : 2026-08-22
- **Décideur** : @jgueniche
- **Concerne** : P1 (fiches, modération) · P3 (fil social) · P8 (back-office) · `ref.cigars`
  · `public.comments` · `docs/editorial-guidelines.md`

## Contexte

Le §5.6 du brief liste `comments` parmi les tables du social et les accroche implicitement aux
`posts` de P3. L'attente exprimée est autre : **commenter une fiche cigare**. Trois cibles étaient
possibles, et ce ne sont pas trois variantes d'une même table — ce sont trois produits.

Un fait cadre tout le reste : **la modération n'existe nulle part**. Il n'y a pas de schéma `mod`
dans la base déployée, pas de table `reports`, pas de `moderation_actions` — vérifié, pas supposé.
Le §5.9 les prévoit, la Q12 les repousse à P3, et le back-office à P8.

Second fait, moins visible : **la charte éditoriale ne lie que nous.** `docs/editorial-guidelines.md`
s'applique à « tout texte publié : copie d'interface, articles, descriptions de fiches, e-mails,
notifications, réponses de modération ». Aucune de ces catégories n'est écrite par un membre, parce
qu'aucun contenu de membre n'existe encore.

## Options

**A — La fiche cigare.** `comments(cigar_id, author_id, body)`. L'équivalent d'une page de
discussion d'encyclopédie, adossée à l'objet dont on parle.
*Coût :* le commentaire est public dès qu'il est écrit — les fiches sont lisibles d'un visiteur
anonyme derrière le portail. Les obligations DSA naissent donc en P1, et un texte élogieux de membre
sous une fiche produit est ce qui, dans tout le produit, ressemble le plus à de la publicité
indirecte au sens du §2.

**B — L'entrée de carnet.** `comments(review_id, …)`. La portée est déjà résolue : l'ADR 0004 la
définit, un commentaire hérite de celle de l'entrée commentée.
*Coût :* ce n'est pas commenter un cigare. C'est une conversation entre gens qui se connaissent,
qui ne construit aucune connaissance partagée sur la fiche.

**C — La publication du fil.** `comments(post_id, …)`, le §5.6 tel qu'écrit.
*Coût :* bloqué jusqu'à P3, et ne répond pas à l'attente exprimée.

## Décision

**Option A : les commentaires s'accrochent à `ref.cigars`.**

Une table `public.comments` avec `cigar_id` en clé étrangère, `author_id`, `body`, et rien d'autre.
Pas de `visibility` : un commentaire de fiche est public par construction, puisque la fiche l'est.

C'est une séparation nette d'avec l'ADR 0004, et elle est voulue : **le carnet a des portées, les
commentaires n'en ont pas.** Deux mécanismes distincts pour deux objets distincts, plutôt qu'un
mécanisme générique qui servirait mal les deux. Un commentaire s'adresse aux lecteurs de la fiche ;
une entrée de carnet s'adresse à qui son auteur a nommé.

## Conséquences

**Ce que nous acceptons, y compris désagréable.**

- **Les obligations DSA arrivent en P1, pas en P3 — le défaut de la Q12 ne tient plus.** La Q12
  répondait « P3 livre le signalement et une file de traitement par e-mail », en raisonnant que
  l'obligation naît avec le premier contenu utilisateur public, donc avec le fil. Cette décision
  avance ce premier contenu d'une phase entière. P1 doit donc livrer, avec les commentaires et non
  après : un mécanisme de signalement, une file de traitement, et un délai annoncé. Le point de
  contact DSA est déjà publié dans les mentions légales. Rien de tout cela n'existe : ni schéma
  `mod`, ni `reports`. **C'est le vrai coût de cette décision, et il est en travail, pas en risque.**

- **La charte éditoriale doit couvrir le contenu des membres.** La loi Évin ne distingue pas selon
  qui a tapé le texte : un éditeur répond de ce qu'il publie. `docs/editorial-guidelines.md` gagne
  donc une section sur le contenu versé par des tiers, et le test en une question — *informe-t-il,
  ou donne-t-il envie ?* — devient un critère de modération et non seulement de rédaction.

- **Le garde-fou tabac existant ne se réutilise pas tel quel — mesuré, pas supposé.** Passé six
  commentaires de fiche parfaitement ordinaires dans `isShopTextAllowed()`, **quatre sont refusés** :
  « j'ai fumé ce *cigare* hier soir, combustion irrégulière » (`cigare`), « un *havane* bien
  construit » (`havane`), « *boîte de 25* achetée en 2021 » (`boite de 25`), « cette *vitole* est
  plus courte que la fiche ne l'indique » (`vitole`). Et « le robusto de cette marque a changé
  depuis 2019 » passe, parce que `robusto` n'est pas dans le lexique.

  Le garde-fou n'est pas cassé : il fait exactement son travail, qui est de refuser une **annonce de
  boutique**. Il se trouve que le vocabulaire d'une annonce interdite et celui d'un commentaire
  légitime sont les mêmes mots. C'est la subtilité des composés d'accessoires déjà consignée dans
  `lib/CLAUDE.md`, prise par l'autre bout — là-bas un filtre par sous-chaîne rejetait
  « coupe-cigare », ici il rejetterait la moitié de ce que la fonctionnalité existe pour permettre.
  Un commentaire demande donc son propre critère, et ce critère est **l'incitation, pas le
  vocabulaire** : c'est le test en une question de la charte, pas une liste de mots.

- **Une fiche fusionnée emporte ses commentaires.** `ref.cigars` porte `status='merged'` et
  `merged_into_id` : la déduplication du wiki (§5.3) déplace une fiche vers une autre. Les
  commentaires doivent suivre la fusion, sinon ils disparaissent d'une page sans avoir été
  supprimés. `on delete cascade` sur `cigar_id` couvre la suppression, pas la fusion — c'est un
  chemin à écrire, pas une clé étrangère à poser.

- **862 fiches sur 940 sont publiées sans avoir été relues.** Elles deviennent commentables le jour
  où cette table existe. Ce n'est pas une objection à la décision, c'est un argument de plus pour
  rouvrir la dérogation à `PROVENANCE.md` §2 avant, et non après.

**Ce que cela interdit désormais.**

- **Pas de note dans un commentaire.** La note est le carnet (§5.4) et sa moyenne bayésienne. Un
  commentaire qui porterait un score créerait une seconde population de notes, invisible de
  `cigar_stats` et impossible à réconcilier.
- **Pas de commentaire sur une fiche en brouillon.** Un brouillon n'est pas public ; la RLS le
  garantit déjà pour la fiche, et la policy des commentaires doit s'en déduire par `EXISTS` sur
  `ref.cigars` plutôt que le redire — le mécanisme est celui de `ref.cigar_images`, ligne 1230 de
  la migration 0001.
- **Pas de réputation gagnée en commentant.** Le barème de la Q14 récompense la révision approuvée,
  pas la prise de parole. Un commentaire est bon marché ; en faire une monnaie, c'est en fabriquer.

## Quand rouvrir

1. **Le volume de signalements dépasse ce qu'une file par e-mail absorbe** — en pratique, plus de
   quelques-uns par jour. Le back-office de P8 devient alors urgent et non planifié.
2. **Le conseil juridique (Q1) qualifie le commentaire de fiche comme publicité indirecte.** Le
   repli est alors l'option B : les commentaires migrent vers l'entrée de carnet, où l'audience est
   choisie par son auteur. Le prévoir, c'est garder `body` et `author_id` indépendants de `cigar_id`.
3. **Les commentaires servent à signaler des erreurs de fiche** plutôt qu'à discuter. Ce serait le
   signe que le besoin réel est la contribution wiki (F3) et non la conversation, et que le bouton
   manquant est « proposer une correction ».

## Question ouverte

**Modération a priori ou a posteriori, et qui a le droit de commenter ?**

Le DSA n'impose pas la modération préalable ; le §2, lui, fait de nous l'éditeur d'un texte qui
parle de tabac sur une page de produit. Les deux régimes sont défendables et ne coûtent pas la même
chose :

- **A posteriori** — le commentaire paraît, le signalement le retire. C'est le standard, c'est ce
  que la Q12 suppose, et c'est peu coûteux. Cela veut dire qu'un texte non conforme au §2 est
  visible pendant un temps.
- **A priori** — rien ne paraît sans relecture. Conforme au §2 par construction, et probablement
  intenable : c'est la relecture des 862 fiches, tous les jours, pour toujours.

Une troisième voie existe et je la recommande : **a posteriori, mais réservé aux membres ayant un
seuil de réputation**, en réutilisant le palier `contributor` à 50 points de la Q14. Commenter cesse
d'être le premier geste d'un compte neuf, ce qui écarte l'essentiel du spam sans faire de nous un
censeur préalable.

Il faut aussi trancher **le délai de traitement d'un signalement**, qui doit être publié. La Q12 ne
le chiffre pas.
