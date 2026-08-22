# Provenance des données d'amorçage

**Exigé par le §2 du brief.** L'article L341-1 du code de la propriété intellectuelle protège les
bases de données par un droit *sui generis* : extraire une part substantielle d'une base
concurrente est une contrefaçon, indépendamment du droit d'auteur. En cas de contestation, c'est à
nous de démontrer que nos données n'en proviennent pas. Ce document est cette démonstration.

---

## 1. Comment ces données ont été produites

**Elles ont été saisies par Claude (assistant IA), à partir de ses connaissances propres du domaine.**

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

## 2. Ce que cela ne garantit pas

**Cette origine ne vaut pas exactitude.** Un modèle de langage restitue des faits mémorisés : il en
inverse, en approxime, en invente parfois. Ces CSV sont un **point de départ à relire**, pas un
référentiel vérifié.

C'est pour cette raison que le chargement est conçu ainsi :

| Garde-fou | Effet |
|---|---|
| **Toutes les fiches cigares sont chargées en `draft`** | Aucune n'est visible d'un visiteur anonyme. La RLS l'impose, ce n'est pas une convention. |
| **15 vitoles portent `Dimensions à vérifier`** | Cotes de confiance moyenne, signalées plutôt qu'omises : le relecteur n'a qu'à confirmer. |
| **45 fiches non cubaines n'ont aucune vitole** | Les cotes exactes varient d'une manufacture à l'autre et ne sont pas connues avec certitude. Les rattacher au format cubain le plus proche aurait introduit une donnée fausse. Le format annoncé figure en note. |
| **Les sigles d'usine cubains sont signalés** | Voir §4. |
| **Aucune année de fondation incertaine n'a été inventée** | Le champ reste vide. |

## 3. Niveaux de confiance, par jeu de données

| Fichier | Lignes | Confiance | Ce qui reste à vérifier |
|---|---:|---|---|
| `01_manufacturers.csv` | 30 | **Élevée** sur les noms, pays et groupes | Raisons sociales exactes, villes |
| `02_brands.csv` | 114 | **Élevée** sur les noms, pays, `is_cuban` | Les années de fondation, quand elles sont renseignées. Les rattachements marque → manufacture pour les marques non cubaines, qui changent de main. |
| `03_vitolas.csv` | 50 | **Élevée** pour 35, **moyenne** pour 15 | Les 15 marquées `Dimensions à vérifier` |
| `04_cigars.csv` | 123 | **Élevée** sur le couple marque + nom commercial. **Moyenne** sur la force et la cape, qui sont des appréciations conventionnelles. | Toutes les forces et capes. Les années de sortie. Les 45 fiches sans vitole. |
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

1. **Les 15 vitoles marquées à vérifier.** Une dimension fausse contamine toutes les fiches qui la
   référencent. C'est le poste le plus rentable.
2. **Les 78 fiches cubaines**, dont le rattachement marque → vitole est standard et se contrôle vite.
3. **Les forces et les capes**, qui sont conventionnelles et se corrigent au fil de l'eau.
4. **Les 45 fiches non cubaines**, à compléter par leurs cotes réelles.
5. **Les sigles d'usine**, une fois une source d'observation directe constituée.

## 6. Contributions futures

Toute donnée ajoutée après cet amorçage passe par `ref.cigar_revisions` et hérite des mêmes
règles : origine documentée, aucune extraction de base tierce, publication par un relecteur.
Si un contributeur verse un lot manifestement recopié, il doit être refusé — le risque n'est pas
la qualité, il est juridique.

---

*Dernière mise à jour : à la génération de l'amorçage. Toute modification manuelle des CSV doit être
consignée ici.*
