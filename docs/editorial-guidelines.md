# Charte éditoriale

Exigée par le §2 du brief (loi Évin, art. L3512-4 CSP). Elle s'applique à **tout** texte publié :
copie d'interface, articles, descriptions de fiches, e-mails, notifications, réponses de modération —
**et, depuis l'ADR 0005, au texte que les membres publient sous une fiche.** Voir §« Contenu versé
par des tiers ».

> Ce n'est pas une préférence de style. La frontière entre informer et promouvoir est ici la
> frontière entre licite et illicite.

---

## Le test en une question

> **Ce texte donne-t-il une information, ou donne-t-il envie ?**

Informer est le métier du site. Donner envie de consommer est de la publicité en faveur du tabac.
Un même fait peut relever de l'un ou de l'autre selon la formulation — c'est la formulation qui est
réglementée, pas le fait.

| Interdit | Autorisé | Ce qui change |
|---|---|---|
| « Un incontournable de la maison » | « Produit depuis 1969, l'un des formats les plus vendus de la marque » | Jugement de valeur → fait vérifiable |
| « À ne pas manquer » | « Édition limitée, 2 000 boîtes » | Injonction → donnée |
| « Le meilleur rapport qualité-prix » | *(rien : le prix n'est pas un argument éditorial)* | Argument commercial → suppression |
| « Parfait pour débuter » | « Force légère à moyenne » | Recommandation → classification |
| « Une expérience inoubliable » | « Combustion d'environ 90 minutes » | Promesse sensorielle → mesure |
| « Offrez-vous… » | *(rien)* | Incitation à l'achat → suppression |

## Ce qui ne s'écrit jamais

- **Aucune incitation, aucune injonction.** Pas d'impératif tourné vers la consommation :
  « goûtez », « essayez », « offrez-vous », « laissez-vous tenter ».
- **Aucun superlatif d'appréciation** appliqué à un produit du tabac : meilleur, incontournable,
  mythique, légendaire, exceptionnel, must-have.
- **Aucun argument de prix, de rareté valorisante ou d'investissement.** « Cote en hausse »,
  « bonne affaire », « valeur sûre » sont exclus, y compris dans un article.
- **Aucune association avec la réussite, la séduction, la fête, la performance, la détente
  réparatrice.** Le registre « récompense méritée » est précisément celui que la loi vise.
- **Aucune minimisation du risque.** Jamais « moins nocif que », « naturel », « sans additif »,
  « artisanal donc plus sain ».
- **Aucun contenu montrant ou suggérant un mineur**, ni de personnage susceptible d'attirer un
  public mineur.
- **Aucun partenariat rémunéré avec un fabricant, un importateur ou un distributeur de tabac.**
  Ni article sponsorisé, ni contenu offert, ni voyage de presse accepté.

## Ce qui s'écrit

- **Le fait, sourcé.** Origine, dimensions, composition, dates, procédés, histoire de la
  manufacture, terminologie.
- **La classification, pas l'appréciation.** « Force : moyen-corsé » est une donnée. « Puissant et
  généreux » est une publicité.
- **La description de dégustation au passé et à la première personne**, portée par un membre
  identifié : « j'ai relevé du cèdre et du poivre ». C'est un témoignage, pas une promesse faite
  par le site. Les notes agrégées sont présentées comme des statistiques, avec leur effectif.
- **Le contexte critique.** Un défaut de construction, une contrefaçon répandue, une baisse de
  qualité constatée : les mentionner relève de l'information et éloigne du registre promotionnel.

## Cas particuliers

**Fiches produit.** Aucun prix affiché (`show_indicative_prices` est à `false`), aucun revendeur,
aucune disponibilité, aucun lien sortant marchand. La fiche décrit un objet ; elle n'y donne pas
accès.

**Lieux (P5).** Un avis porte sur l'accueil, le confort du fumoir, la ventilation, la qualité du
conseil, l'amplitude horaire. Jamais sur l'assortiment, les prix ou l'intérêt d'y acheter. Le
statut de cet annuaire reste à valider juridiquement (Q6).

**Boutique (P7).** Accessoires uniquement. On peut y être commercial — c'est un commerce licite —
mais jamais en s'appuyant sur le tabac : « coupe à double lame, acier japonais » et non « pour
sublimer vos havanes ».

**Réseaux sociaux et newsletter.** Mêmes règles, sans exception. Un extrait est plus exposé qu'un
article, pas moins.

## Contenu versé par des tiers

Ajouté le 22 août 2026, en même temps que les commentaires de fiche. L'[ADR 0005](adr/0005-cible-des-commentaires.md)
l'exige, et pour une raison simple : **la loi Évin ne distingue pas selon qui a tapé le texte.** Un
éditeur répond de ce qu'il publie. Un commentaire élogieux sous une fiche produit est, dans tout le
site, ce qui ressemble le plus à de la publicité indirecte — et il est écrit par quelqu'un qui n'a
pas lu ce document.

D'où la conséquence : **le test en une question cesse d'être un critère de rédaction pour devenir
aussi un critère de modération.** C'est la même question, posée à un texte qu'on n'a pas écrit.

### Le critère est l'incitation, pas le vocabulaire

Il faut le dire explicitement parce que l'inverse est tentant, et parce qu'il a été mesuré. Le
garde-fou de la boutique — `isShopTextAllowed()`, qui refuse une annonce contenant du vocabulaire
tabac — **ne se réutilise pas ici**. Passés six commentaires parfaitement ordinaires, il en refuse
quatre :

| Commentaire | Refusé sur |
|---|---|
| « J'ai fumé ce cigare hier soir, combustion irrégulière » | *cigare* |
| « Un havane bien construit » | *havane* |
| « Boîte de 25 achetée en 2021 » | *boite de 25* |
| « Cette vitole est plus courte que la fiche ne l'indique » | *vitole* |
| « Le robusto de cette marque a changé depuis 2019 » | *(passe — `robusto` n'est pas au lexique)* |

Le garde-fou n'est pas cassé : il fait son travail, qui est de refuser une **annonce de boutique**.
Il se trouve que le vocabulaire d'une annonce interdite et celui d'un commentaire légitime sont les
mêmes mots — et que le seul commentaire à passer est celui qui ne dit rien de vérifiable. Une liste
de mots refuserait la moitié de ce que la fonctionnalité existe pour permettre, en laissant filer ce
qu'elle devrait attraper.

**Aucun filtre lexical n'est donc appliqué aux commentaires.** La barrière est humaine, et elle
s'appuie sur le signalement.

### Ce qu'un modérateur retire

Dans cet ordre, du plus net au plus discutable :

1. **L'incitation directe.** « Foncez », « à essayer absolument », « le meilleur de la gamme »,
   « courez chez votre buraliste ». C'est le motif `tobacco_promotion`.
2. **Le lien marchand**, sous toutes ses formes — URL, nom de revendeur, prix négocié, « MP pour
   l'adresse ». Le §2 interdit la mise en relation commerciale, pas seulement la vente.
3. **Le contenu illicite** au sens du DSA, et le harcèlement.

### Ce qu'un modérateur ne retire pas

- **Un avis négatif**, même sévère. « Tirage bouché sur trois sur cinq » est exactement ce qu'un
  référentiel vérifié doit accueillir. La roue des arômes comporte d'ailleurs une famille
  `Défaut` pour cette raison — voir `supabase/seed/PROVENANCE.md`, source D.
- **Le vocabulaire du métier.** Voir le tableau ci-dessus.
- **Une correction de fiche mal aiguillée.** Un commentaire qui signale une erreur factuelle n'est
  pas une faute : c'est une contribution qui s'est trompée de porte. Elle repart vers la file de
  révision du wiki. Le motif `inaccurate` existe pour ce tri.

### Ce qu'un retrait doit porter

Un commentaire retiré n'est pas supprimé : `hidden_at`, `hidden_by` et `hidden_reason` sont posés
ensemble, la contrainte de table refuse l'un sans les autres. **Le motif est obligatoire parce que
le DSA exige une décision motivée et contestable**, et parce que son auteur continue de voir son
propre commentaire — on ne conteste pas ce qu'on ne voit plus.

Le motif s'écrit comme le reste : au fait. « Incitation à la consommation (§2) », pas « inapproprié ».

## En cas de doute

Récrire au fait. Si le fait seul ne tient pas debout, c'est que le texte reposait sur
l'appréciation — il ne devait pas être publié.

Toute zone grise se documente dans `docs/decisions-log.md` et remonte au conseil juridique (Q1).
