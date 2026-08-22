# Charte éditoriale

Exigée par le §2 du brief (loi Évin, art. L3512-4 CSP). Elle s'applique à **tout** texte publié :
copie d'interface, articles, descriptions de fiches, e-mails, notifications, réponses de modération.

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

## En cas de doute

Récrire au fait. Si le fait seul ne tient pas debout, c'est que le texte reposait sur
l'appréciation — il ne devait pas être publié.

Toute zone grise se documente dans `docs/decisions-log.md` et remonte au conseil juridique (Q1).
