# Landing page — maquettes

Maquettes de la page d'accueil, dessinées au format **Design Components** (`.dc.html`) et
publiées comme canevas Claude Design. Ce ne sont pas des composants de l'application : ce sont
des maquettes, à traduire en React une fois la direction validée.

| Fichier | Contenu | Cadre |
|---|---|---|
| `Main.dc.html` | La landing complète | 1440 × 9860 |
| `Mobile.dc.html` | La même page à 390 px | 390 × 5320 |
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

Le cigare de la planche est construit en CSS pur : la cape est un cylindre ombré, la bague est un
véritable anneau 3D de seize lattes posées sur un cylindre de rayon 58 px, éclairé par une nappe
fixe en espace écran — c'est ce qui fait lire le raccourci des lattes comme du métal. `Mobile`
recadre exactement la même planche (échelle 0,40) au lieu de la redessiner.

## Régénérer le canevas

```bash
node <skill>/seed-canvas.mjs --template <skill>/payload.template.html \
  --out vitola-landing.html --title "Vitola Accueil" \
  --artboard Main.dc.html --artboard Mobile.dc.html --artboard Bague.dc.html \
  --canvas canvas.json
```

`vitola-landing.html` est un produit de sortie (2,4 Mo, éditeur embarqué) : il n'est pas versionné.
