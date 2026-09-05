# Pages cigare — audit et refonte

Audit de la fiche cigare, du carnet et de la liste, et propositions de refonte, dessinés au format
**Design Components** (`.dc.html`) et publiés comme canevas Claude Design. Ce ne sont pas des
composants de l'application : ce sont des maquettes, à traduire en React une fois la direction
validée. La charte (§4 du brief) ne change pas ; ce qui change est la distribution.

| Fichier | Contenu | Cadre |
|---|---|---|
| `Avant.dc.html` | La fiche telle que le code la rend aujourd'hui, avec douze constats numérotés | 1240 × 4140 |
| `Main.dc.html` | La fiche refondue, direction A « le rail », en 1440 — un réglage visiteur / membre | 1440 × 2000 |
| `Mobile.dc.html` | La même fiche à 390 px, le geste sous le pouce | 390 × 2760 |
| `DirectionA.dc.html`, `DirectionB.dc.html`, `DirectionC.dc.html` | Les trois plans en fil de fer, pour et contre | 520 × 980 |
| `Parcours.dc.html` | Quatre gestes, avant et après, en clics comptés dans le code | 1240 × 1000 |
| `Carnet.dc.html` | Mon carnet, groupé par mois, en lignes | 1100 × 1500 |
| `Liste.dc.html` | Les cigares, en grille de bagues, avec les fiches lacunaires dites lacunaires | 1240 × 1250 |
| `Composants.dc.html` | Les sept règles de taille des encarts | 1240 × 2350 |
| `canvas.json` | Quatre pages, la disposition, les notes de cadrage | — |

Les sources sont dans `src/` : un fragment par planche, et `shared.css` pour les tokens et les
primitives. `node design/fiche-cigare/build.mjs` assemble les `.dc.html`.

## L'audit, en douze constats

Lus dans `app/(app)/cigares/[slug]`, `components/reviews`, `components/data` et
`components/layout`, et mesurés en base le 5 septembre 2026.

1. **Un seul couloir de 768 px, sept blocs de même poids.** Fiche, gestes et parole des membres
   s'empilent, séparés par cinq fois la même bague — l'élément signature devient un trait.
2. **Les jauges parlent sans étiquette.** Ni « Cepo », ni « Force », ni « Cape » ; la silhouette se
   dessine dans la largeur de son propre libellé (≈ 100 px) et ne montre rien.
3. **Le référentiel est un trou pour 862 fiches sur 940.** 78 fiches publiées ont une vitole, 123 une
   force ; les autres s'ouvrent sur « Vitole non renseignée » et un prix.
4. **Le geste le plus rare a la meilleure place.** « Proposer une correction » est le premier bouton ;
   « Noter ce cigare » arrive au cinquième écran.
5. **Trois formulaires pour un seul geste.** Cave, carnet et fil demandent chacun date, note, mot et
   portée ; le sélecteur de portée est déployé deux fois (≈ 300 px), plus un troisième groupe de
   radios. `docs/decisions-log.md` le note déjà comme piège de parcours.
6. **L'état vide des notes est une boîte de 150 px**, et c'est l'état de 937 fiches sur 940.
7. **Tout est la même boîte.** Entrée, commentaire, formulaire, état vide, carte de hub : même
   filet, même surface, même marge, quel que soit le contenu.
8. **Deux listes de « ce qu'on en dit » sans explication.** Entrées (impressions) et commentaires
   (la fiche, ADR 0005) se suivent sans que la page dise pourquoi.
9. **Trois invitations à se connecter** pour un visiteur, identiques.
10. **La police display descend sous son plancher.** `.font-display` encode `max(2rem, 1em)` dans
    `@layer base`, mais `text-2xl` est dans la couche utilitaire et gagne : 91 occurrences de
    Bodoni à 18, 20 ou 24 px.
11. **Les boutons qui comptent font 32 px** (`size="sm"`), sous la cible tactile de 44 px.
12. **Trouver une fiche coûte quatre clics** depuis n'importe où : aucune recherche dans l'en-tête,
    aucune entrée directe « Cigares ».

## La direction retenue

**A · le rail.** Trois zones pour trois questions — qu'est-ce que c'est (la fiche, bornée, avec ses
lacunes qui deviennent la porte du wiki), qu'est-ce que j'en fais (un rail collant : la cave, un
seul geste, mon carnet), qu'en dit-on (la carte des notes, les entrées en lignes, la discussion de
la fiche dite pour ce qu'elle est). En mobile le rail devient une carte en ligne et une barre sous
le pouce.

Le geste unique « J'en fume un » remplace les trois formulaires sans rien ajouter en base :
`smoke_from_lot()` écrit l'entrée et décompte le lot (ADR 0006), « Le dire au fil » crée la
publication qui pointe l'entrée (ADR 0007). Il s'ouvre par `?geste=fumer` — l'état dans l'URL.

Les directions B (onglets) et C (le carnet d'abord) sont dessinées à côté, avec leur pour et leur
contre, pour que le choix se fasse en voyant.

## Ce qui vient du code, et ce qui n'en vient pas

Couleurs, fontes, 3 px, filets et durées sont repris à l'identique de `app/globals.css`. Les
composants remontés suivent leur implémentation : `components/band/band.tsx`,
`components/data/{ring-gauge,strength-meter,wrapper-scale}.tsx`, `components/ui/{button,field}.tsx`,
`components/reviews/{entry-card,stats-panel,scope-selector}.tsx`, `components/layout/site-header.tsx`.

La fiche exemple est réelle (Hoyo de Monterrey · Epicure No. 2, `ref.cigars`). Les entrées, les
commentaires et les membres sont des exemples.

## Régénérer le canevas

```bash
node design/fiche-cigare/build.mjs
node <skill>/seed-canvas.mjs --template <skill>/payload.template.html \
  --out pages-cigare-refonte.html --title "Pages cigare — refonte" \
  --artboard Avant.dc.html --artboard Main.dc.html --artboard Mobile.dc.html \
  --artboard DirectionA.dc.html --artboard DirectionB.dc.html --artboard DirectionC.dc.html \
  --artboard Parcours.dc.html --artboard Carnet.dc.html --artboard Liste.dc.html \
  --artboard Composants.dc.html --canvas canvas.json
```

`pages-cigare-refonte.html` est un produit de sortie (éditeur embarqué) : il n'est pas versionné.
