# 0009 — Rouvrir `ref.lines` par la contribution, jamais par un import, et lui donner le `status` qu'elle n'a pas

- **Statut** : **Proposée** — attend arbitrage
- **Date** : 2026-08-23
- **Décideur** : @jgueniche
- **Concerne** : P1 (référentiel, contribution wiki) · `ref.lines` · `ref.cigars.line_id`

## Contexte

`ref.lines` existe depuis la migration 0001 et contient **zéro ligne**. Ce n'est pas un oubli : le
`CLAUDE.md` porte la décision et son déclencheur. Le déclencheur est arrivé — la file de
contribution existe depuis la fin de P1 — donc la décision se relit, et c'est ce document.

Quatre faits, dont un que la décision d'origine avait vu et un qu'elle n'avait pas.

**1. Le remplissage demande deux gestes, pas un.** Écrire une liste de gammes (Cohíba > Línea 1492,
Montecristo > Línea 1935), et **rattacher 940 fiches à ces gammes une par une**. Le second est
beaucoup plus long que le premier, et beaucoup plus facile à faire faux.

**2. `ref.lines` n'a pas de colonne `status`.** C'est le fait que la décision d'origine avait vu, et
il est décisif : contrairement à `ref.cigars`, une gamme est **publique dès son insertion**. Il n'y
a pas de brouillon, pas de relecture possible avant visibilité, pas de filet. Une erreur
d'appartenance est immédiatement une erreur factuelle sur la promesse du référentiel — « tous les
cigares, sourcés et vérifiés ».

**3. `ref.cigars.line_id` est déjà nullable et déjà lu.** La fiche affiche `lines.name` quand il
existe et s'en passe sinon. Rouvrir la table ne demande aucun changement d'écran côté lecture ; ce
qui manque est entièrement du côté écriture.

**4. La file de contribution ne sait proposer que les onze colonnes de `wiki/model.ts`, et
`line_id` n'en fait pas partie.** C'est le fait que la décision d'origine n'avait pas vu : « la file
wiki rouvrira `ref.lines` » supposait que la file savait déjà proposer un rattachement. Elle ne le
sait pas.

## Options

### A — Laisser la table vide, définitivement

Retirer `line_id` de `ref.cigars` et `ref.lines` du schéma.

*Coût :* la gamme est une notion réelle du métier, présente sur toutes les sources sérieuses, et
c'est un axe de recherche que les amateurs utilisent. La retirer est une décision produit
irréversible prise pour une raison de remplissage.

### B — Amorcer une liste de gammes maintenant, rattacher plus tard

Insérer les gammes des grandes marques, laisser `line_id` nul partout.

*Coût :* une table de gammes que rien ne référence est un menu déroulant vide de sens, et la liste
elle-même est le geste « qu'un modèle de langage fait mal ». Surtout : elle est publique dès
l'insertion, donc une gamme inventée est en ligne sans avoir été relue par personne.

### C — Rouvrir par la contribution, avec un `status`

Trois pièces qui vont ensemble :

1. **`ref.lines` gagne `status ref.entry_status`, par défaut `draft`** — la colonne qui lui manque
   pour être traitée comme `ref.cigars` l'est déjà, et la policy `select` publique se borne à
   `published`.
2. **La file gagne une douzième colonne proposable, `line_id`**, avec ce que cela implique dans
   `wiki/model.ts` et dans le diff.
3. **Une gamme se propose depuis la fiche du cigare qu'on veut y rattacher**, comme tout le reste :
   on ne crée pas une gamme dans l'abstrait, on la crée parce qu'on a une boîte qui la porte.

*Coût :* une migration, une colonne de plus dans le diff, et un écran de proposition qui doit
accepter « une gamme qui n'existe pas encore » — donc le même problème que l'ADR 0008, en plus
petit.

### D — Rouvrir sans `status`, en réservant l'insertion aux relecteurs

Pas de migration : un `editor` insère une gamme, un membre ne peut que la choisir.

*Coût :* c'est l'état d'aujourd'hui moins la policy, et cela déplace tout le travail sur les
relecteurs — dont il y en a **un**. Et cela laisse l'asymétrie intacte : une gamme insérée par
erreur est publique immédiatement, sans étape de relecture, alors qu'une correction d'un champ de
fiche en a une.

## Décision

**Option C : `ref.lines` gagne un `status`, et se remplit par la contribution.**

Ce qui l'emporte n'est pas la commodité, c'est **l'asymétrie du fait 2**. Aujourd'hui, corriger la
longueur d'un cigare passe par une file de relecture, et créer une gamme entière serait immédiat et
public. C'est exactement à l'envers : la gamme est le fait le plus structurant des deux, et le seul
des deux qui n'a pas de filet.

Donner un `status` à `ref.lines` supprime l'asymétrie, et rend le reste possible sans risque.

L'ordre des trois pièces compte, et il est celui-ci :

1. **La migration d'abord** (`status`, la policy `select` bornée à `published`, l'auto-contrôle).
   Elle est additive et sans écran : elle peut précéder tout le reste sans conséquence — la leçon
   des 0006 et 0007, « une migration additive peut précéder son écran, l'inverse est un 500 ».
2. **Le rattachement ensuite** : `line_id` dans les colonnes proposables. Un contributeur peut alors
   rattacher une fiche à une gamme **existante**, ce qui est le geste le plus fréquent et le moins
   risqué.
3. **La création de gamme en dernier**, et seulement si le rattachement a du trafic. Elle a le même
   problème que l'ADR 0008 — qui insère, et sous quel nom — et se résout de la même façon : le
   proposeur insère un `draft`, un relecteur publie.

## Conséquences

**Ce que nous acceptons.**

- **Une migration sur une table vide**, ce qui est le meilleur moment pour en faire une. Zéro ligne
  à migrer, aucune compatibilité à tenir.
- **`ref.lines` cesse d'être en lecture seule pour les clients.** Comme `ref.cigars` sous l'ADR
  0008, et bornée de la même façon.
- **Le rattachement restera longtemps incomplet.** 940 fiches, une par une, par des gens qui ont la
  boîte. C'est lent, et c'est la seule façon dont ce soit juste. Un `line_id` nul reste le cas
  normal, et la fiche s'en passe déjà.
- **Une douzième colonne dans le diff**, donc une de plus à relire dans l'écran de validation.

**Ce que cela interdit désormais.**

- **Amorcer `ref.lines` par un script.** C'est l'option B, écartée. `supabase/seed/PROVENANCE.md`
  exige qu'une ligne soit justifiable ; une gamme devinée ne l'est pas.
- **Publier une gamme sans relecture.** C'est tout l'objet du `status`.
- **Rattacher en masse.** Un `update` qui rattacherait 200 fiches à une gamme par correspondance de
  nom est exactement l'erreur que le fait 1 décrit, appliquée deux cents fois.

## Quand rouvrir

1. **Une source de gammes libre de droits et vérifiable apparaît** — un fabricant qui publie sa
   propre nomenclature, par exemple. L'option B redevient défendable pour cette marque-là, et pour
   elle seule, avec sa ligne dans `PROVENANCE.md`.
2. **Le rattachement plafonne sous 5 % des fiches après six mois d'ouverture.** La notion de gamme
   ne serait alors pas portée par les contributeurs, et l'option A — la retirer — redeviendrait
   honnête.

## Question ouverte

**La gamme doit-elle être un axe de recherche facettée ?**

Le §5.1 la donne dans le référentiel, le §F2 liste les facettes — marque, pays, cepo, longueur,
force, cape, type de sortie — et **la gamme n'y est pas**. Tant que `line_id` est nul presque
partout, une facette « gamme » renverrait un résultat vide pour presque tout, ce qui est pire que
son absence.

Je propose de ne pas l'ajouter maintenant, et de la reconsidérer au seuil de 5 % ci-dessus. Mais
c'est un choix d'interface autant que de données, et si vous voyez la gamme comme une entrée
principale du référentiel plutôt que comme un attribut, l'ordre des trois pièces change.
