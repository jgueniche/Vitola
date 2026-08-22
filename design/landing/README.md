# Landing page — maquettes

Maquettes de la page d'accueil, dessinées au format **Design Components** (`.dc.html`) et
publiées comme canevas Claude Design. Ce ne sont pas des composants de l'application : ce sont
des maquettes, à traduire en React une fois la direction validée.

| Fichier | Contenu | Cadre |
|---|---|---|
| `Main.dc.html` | La landing complète, neuf modules | 1440 × 10780 |
| `Mobile.dc.html` | La même page à 390 px | 390 × 6760 |
| `Bague.dc.html` | L'élément signature : la bague en volume + ses trois variantes plates | 900 × 880 |
| `canvas.json` | Disposition des trois plans sur le canevas, notes de cadrage | — |

## Ce qui vient du code, et ce qui n'en vient pas

Les couleurs, les fontes, le rayon de 3 px, les filets et les durées sont repris **à
l'identique** de `app/globals.css` (§4.2 à §4.5 du brief). Les composants remontés en maquette
suivent leur implémentation : `components/band/band.tsx`, `components/cigar/cigar-card.tsx`,
`components/data/{wrapper-scale,strength-meter,ring-gauge}.tsx`,
`components/compliance/health-notice.tsx`.

Une seule liberté prise sur le code existant : la carte cigare est coiffée d'une bague. Le §4.4
du brief le prévoit (« en-tête des cartes cigare ») mais `CigarCard` ne l'implémente pas encore.

## La planche

Le cigare est construit en CSS et SVG, en calques séparés — c'est ce qui permet de régler la
matière sans toucher à l'éclairage :

1. **La base** : la feuille, ses taches, et la couture de roulage en deux périodes qui battent
   l'une contre l'autre pour que la spirale cesse d'être régulière.
2. **La lumière** : le drapé du cylindre et la chute d'intensité en s'éloignant de la braise.
   Elle se pose *avant* la texture, sinon elle l'efface.
3. **La matière** : marbrure, nervures et grain, trois tuiles `feTurbulence` en `overlay`.
4. **Les accents** : le gras de la cape, le liseré sur l'arête haute, le rebond de la braise
   sous le cigare.

L'ensemble passe dans un `feDisplacementMap` (`#leafRough`, amplitude 3) : la couture ondule et
la silhouette cesse d'être parfaite au pixel. La cendre a le sien (`#ashRough`, amplitude 6), qui
casse son bord — une cendre régulière se lit immédiatement comme un dessin. Elle part exactement
au diamètre du cigare et s'émousse vers la pointe : c'est la continuité de la silhouette qui la
rend soudée, pas un raccord.

La bague est un véritable anneau 3D de seize lattes posées sur un cylindre de rayon 58 px,
éclairé par une nappe **fixe en espace écran** — c'est ce qui fait lire le raccourci des lattes
comme du métal. La fumée naît sur la braise (colonne étroite et dense) et se disloque en montant.

`Mobile` recadre exactement la même planche (échelle 0,37) au lieu de la redessiner.

Le réglage « Mouvement » met les animations **en pause** au lieu de les supprimer : `animation:
none` renverrait la fumée à son état initial, c'est-à-dire invisible, et un export PNG sortirait
sans fumée.

## Régénérer le canevas

```bash
node <skill>/seed-canvas.mjs --template <skill>/payload.template.html \
  --out vitola-landing.html --title "Vitola Accueil" \
  --artboard Main.dc.html --artboard Mobile.dc.html --artboard Bague.dc.html \
  --canvas canvas.json
```

`vitola-landing.html` est un produit de sortie (2,4 Mo, éditeur embarqué) : il n'est pas versionné.
