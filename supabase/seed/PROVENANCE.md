# Provenance des données d'amorçage

**Exigé par le §2 du brief.** L'article L341-1 du code de la propriété intellectuelle protège les
bases de données par un droit *sui generis* : extraire une part substantielle d'une base
concurrente est une contrefaçon, indépendamment du droit d'auteur. En cas de contestation, c'est à
nous de démontrer que nos données n'en proviennent pas. Ce document est cette démonstration.

---

## 1. Deux sources, deux régimes

| Source | Ce qu'elle fournit | Régime |
|---|---|---|
| **A — Saisie de mémoire** | Manufactures, marques, vitoles, 123 fiches curées, codes de boîte | À relire (§2) |
| **B — Arrêté d'homologation des prix (Douane)** | 900 prix de vente au détail, 817 fiches supplémentaires | Donnée publique officielle, exacte à sa date |
| **C — Site officiel Habanos S.A.** | Confirmation de 13 vitoles, ajout d'une vitole manquante | Spécifications publiées par le fabricant |

### Source A — saisie de mémoire

**Saisie par Claude (assistant IA), à partir de ses connaissances propres du domaine.**

Formulé sans détour, parce que la formulation compte ici :

- **Aucune base tierce n'a été consultée**, ni pendant la génération, ni avant. Ni Halfwheel, ni
  Cigar Aficionado, ni CigarDojo, ni Cuban Cigar Website, ni aucun catalogue de revendeur.
- **Aucun script de collecte automatisée n'existe dans ce dépôt**, et il n'y en aura pas.
- **Aucune requête réseau n'a été émise** vers un site du secteur au moment de la saisie.
- Les données correspondent à des **faits de métier publics et non originaux** : noms de marques,
  pays de production, noms de vitoles, dimensions nominales, mois en espagnol. Des faits bruts ne
  sont protégeables ni par le droit d'auteur ni, isolément, par le droit *sui generis* — c'est leur
  extraction massive depuis une base identifiée qui l'est, et il n'y en a pas eu.
- La **sélection et l'organisation** (quelles marques retenir, quels champs, quels regroupements)
  sont propres à ce projet et découlent du modèle de données du §5.1 du brief.

### Source B — l'arrêté d'homologation des prix

**Arrêté du 5 août 2026 portant homologation des prix de vente au détail des tabacs manufacturés
en France, applicable au 1er septembre 2026.** Publié au Journal officiel et diffusé en *open data*
par la Direction générale des douanes et droits indirects.

C'est une **publication officielle de l'État français**, pas une base tierce : le droit *sui generis*
de l'article L341-1 CPI ne s'y applique pas, et les textes officiels sont librement réutilisables.
Le fichier a été téléchargé directement depuis `douane.gouv.fr`, converti en texte et analysé par un
script ; aucun site du secteur n'a été sollicité.

- Fichier : `Maquette JORF 1er septembre 2026.pdf`
- Colonne retenue : **prix de vente au détail à l'unité** (jamais le prix au conditionnement)
- Reporté dans `msrp_eur`, avec `msrp_source = 'douane-fr'` et `msrp_effective_on = 2026-09-01`

**Ces prix expirent.** L'homologation est révisée à peu près tous les mois. Un prix sans date est
une désinformation en quelques semaines : c'est pourquoi le schéma refuse un `msrp_eur` sans source
ni date d'effet, par contrainte de table. **Rafraîchir à chaque nouvel arrêté.**

Trois pièges rencontrés en analysant ce PDF, consignés pour la prochaine fois :

1. **Les milliers n'ont pas de séparateur** (`2112,50`). Un motif attendant des groupes de trois
   écartait en silence toute boîte au-dessus de 1 000 € — soit la plupart des boîtes de 25.
2. **Un motif de nombre tolérant les espaces est pire.** Sur `… en 32 46,00 1472,00`, il avalait la
   quantité et lisait `3246,00` comme prix unitaire. Un chiffre faux, parfaitement plausible.
3. **Les chiffres romains piègent l'appariement flou.** `Siglo VI` ressemble à `Siglo I` à 0,97 et
   `Medaille d'Or n°2` à `n°4` à 0,97. L'appariement impose désormais l'égalité **exacte** des
   chiffres et nombres, quel que soit le score de similarité.

Les fiches issues de cette source portent le nom homologué, minoré de son conditionnement. Elles
n'ont ni vitole, ni force, ni cape : l'arrêté ne les donne pas, et je ne les invente pas.

### Source C — le site officiel de Habanos S.A.

La page « Principal shapes and sizes » de `habanos.com` publie les cotes officielles des principaux
formats. Treize de mes vitoles y ont été confrontées **une par une** : toutes correspondent au
millimètre. Elles portent désormais la mention de cette confirmation, et sortent du régime « à
relire ». Cela n'atteste pas des 37 autres, mais treize sur treize sans écart est un signal
raisonnable sur la qualité du jeu de haute confiance.

Deux enseignements en sont sortis :

- La vitole de galera **Exquisitos** (double figurado, 46 × 145) manquait à la base. Elle est
  ajoutée — et à ne pas confondre avec « Cohíba Exquisitos », nom **commercial** d'une panetela
  fine dont la galera est Seoane. Le même mot désigne deux objets différents.
- Habanos donne « Siglo VI » comme vitole de salida du **Cañonazo**, et « Tres Petit Corona » pour
  la **Perla**, là où j'avais retenu l'usage courant. L'écart est consigné dans le CSV plutôt que
  tranché seul : la nomenclature de salida est réellement ambiguë.

Il s'agit des spécifications publiées par le fabricant lui-même sur son site public, consultées
manuellement — pas d'une base concurrente, et pas d'une extraction automatisée.

## 2. Ce que cela ne garantit pas

**Cette origine ne vaut pas exactitude.** Un modèle de langage restitue des faits mémorisés : il en
inverse, en approxime, en invente parfois. Ces CSV sont un **point de départ à relire**, pas un
référentiel vérifié.

C'est pour cette raison que le chargement est conçu ainsi :

| Garde-fou | Effet |
|---|---|
| **Toutes les fiches cigares sont chargées en `draft`** | Aucune n'est visible d'un visiteur anonyme. La RLS l'impose, ce n'est pas une convention. |
| **Un prix ne peut exister sans sa source et sa date** | Contrainte de table, pas convention. Un prix orphelin est refusé à l'insertion. |
| **Un prix unitaire au-dessus de 1 500 € échoue en CI** | Garde-fou contre un prix de boîte lu comme un prix unitaire. Le cigare le plus cher de l'arrêté est à 750 € l'unité. |
| **15 vitoles portent `Dimensions à vérifier`** | Cotes de confiance moyenne, signalées plutôt qu'omises : le relecteur n'a qu'à confirmer. |
| **45 fiches non cubaines n'ont aucune vitole** | Les cotes exactes varient d'une manufacture à l'autre et ne sont pas connues avec certitude. Les rattacher au format cubain le plus proche aurait introduit une donnée fausse. Le format annoncé figure en note. |
| **Les sigles d'usine cubains sont signalés** | Voir §4. |
| **Aucune année de fondation incertaine n'a été inventée** | Le champ reste vide. |

## 3. Niveaux de confiance, par jeu de données

| Fichier | Lignes | Confiance | Ce qui reste à vérifier |
|---|---:|---|---|
| `01_manufacturers.csv` | 30 | **Élevée** sur les noms, pays et groupes | Raisons sociales exactes, villes |
| `02_brands.csv` | 114 | **Élevée** sur les noms, pays, `is_cuban` | Les années de fondation, quand elles sont renseignées. Les rattachements marque → manufacture pour les marques non cubaines, qui changent de main. |
| `03_vitolas.csv` | 51 | **Confirmée par source officielle** pour 13, **élevée** pour 24, **moyenne** pour 14 | Les 14 marquées `Dimensions à vérifier` |
| `04_cigars.csv` — 123 curées | 123 | **Élevée** sur le couple marque + nom commercial. **Moyenne** sur la force et la cape, qui sont des appréciations conventionnelles. | Toutes les forces et capes. Les années de sortie. Les 45 fiches sans vitole. |
| `04_cigars.csv` — 817 issues de l'arrêté | 817 | **Élevée** sur le nom et le prix (source officielle). **Nulle** sur le reste : ces colonnes sont vides. | Libellés à normaliser, vitoles / forces / capes à renseigner. |
| Prix (900 fiches) | 900 | **Élevée à la date du 1ᵉʳ septembre 2026** | Rien à vérifier, mais **à rafraîchir à chaque arrêté** |
| `05_box_codes.csv` | 18 | **Élevée** pour les 12 codes de mois. **Faible** pour les 6 sigles d'usine. | Voir §4 |

## 4. Le cas particulier des codes d'usine cubains

Les douze codes de mois (`ENE`…`DIC`) sont les abréviations espagnoles des mois : stables,
publiques, non problématiques.

Les **sigles d'usine à trois lettres sont un autre sujet**. Depuis 1985, Cuba a remplacé les noms
de manufacture par des codes qui **changent délibérément** afin de masquer l'origine de production.
Leur correspondance n'est pas publiée : elle résulte du travail d'observation de collectionneurs,
consigné dans des bases privées.

Deux conséquences, et elles vont dans le même sens :

1. **Je ne peux pas les produire de mémoire de façon fiable.** Les six sigles historiques présents
   dans le CSV sont donnés à titre indicatif et explicitement marqués comme à vérifier.
2. **Ils ne doivent pas être recopiés depuis une base de collectionneurs.** Ce serait exactement
   l'extraction que le §2 interdit. La seule voie légitime est l'observation directe : des
   photographies de boîtes versées par les membres, décodées et consignées par nous. C'est plus
   lent, et c'est la seule voie.

## 5. Procédure de relecture

Une fiche ne passe de `draft` à `published` que par un relecteur humain, qui renseigne alors
`verified_by` et `verified_at`. La RLS interdit à l'auteur d'une fiche de la publier lui-même —
c'est vérifié par le test T8 de `docs/phase-0/03b-verification.sql`.

Ordre de relecture recommandé, du plus rentable au moins :

1. **Les 14 vitoles marquées à vérifier.** Une dimension fausse contamine toutes les fiches qui la
   référencent. C'est le poste le plus rentable.
2. **Les 78 fiches cubaines**, dont le rattachement marque → vitole est standard et se contrôle vite.
3. **Les forces et les capes**, qui sont conventionnelles et se corrigent au fil de l'eau.
4. **Les 45 fiches non cubaines curées**, à compléter par leurs cotes réelles.
5. **Les 817 fiches issues de l'arrêté**, dont le libellé est à normaliser et les caractéristiques à
   renseigner. Le prix, lui, n'est pas à vérifier : il est officiel.
6. **Les sigles d'usine**, une fois une source d'observation directe constituée.

## 6. Contributions futures

Toute donnée ajoutée après cet amorçage passe par `ref.cigar_revisions` et hérite des mêmes
règles : origine documentée, aucune extraction de base tierce, publication par un relecteur.
Si un contributeur verse un lot manifestement recopié, il doit être refusé — le risque n'est pas
la qualité, il est juridique.

---

*Dernière mise à jour : à la génération de l'amorçage. Toute modification manuelle des CSV doit être
consignée ici.*
