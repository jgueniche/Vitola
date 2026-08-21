# P0 · Livrable 3 — Plan de design

---

## 1. Les cinq hex

Le §4.2 en énumère dix. En voici cinq — le noyau dont tout le reste dérive. Chacun porte un nom
de la classification des cape : la palette **est** l'échelle métier, elle n'y ressemble pas.

| Nom | Hex | Rôle | Pourquoi celui-là |
|---|---|---|---|
| **Oscuro** | `#161210` | Fond racine | Brun-noir chaud, pas `#000` ni `#0A0A0A`. Un noir neutre est le réglage par défaut de tout dark mode ; ce brun, lui, se lit comme une feuille. C'est la première chose que l'œil enregistre et la seule qui distingue l'interface avant même la lecture. |
| **Maduro** | `#221B17` | Surfaces, cartes | Un cran au-dessus d'Oscuro, ~4 % de luminance d'écart. La séparation vient du filet, pas de l'ombre : la surface est presque le fond, ce qui laisse l'accent porter seul la hiérarchie. |
| **Cèdre** | `#7A5C43` | Bordures, texte tertiaire | Le bois de la boîte. C'est le seul ton « moyen » de la palette : il sert de charnière entre le fond et le texte, et empêche l'interface de tomber dans un contraste binaire. |
| **Claro** | `#C9A227` → `#D9BC72` | **Accent unique** | Le laiton de la bague. Employé en dégradé, jamais en aplat de grande surface. Un seul accent chromatique dans toute l'application : dès qu'un deuxième apparaît, l'interface ressemble à un tableau de bord. |
| **Parchemin** | `#EDE6D8` | Texte principal | Blanc cassé chaud. Un `#FFF` sur ce fond vibre et fatigue ; le parchemin pose le texte comme une encre sur un papier, ce qui est exactement le registre éditorial visé. |

### Contraste — mesuré, pas estimé

Ratios WCAG 2.1 calculés sur les hex du §4.2, contre les deux fonds réels de l'application.
Le fond critique n'est pas Oscuro mais **Maduro** (`#221B17`) : les cartes, donc l'essentiel du
texte, reposent dessus.

| Token | sur Oscuro | sur Maduro | Verdict |
|---|---|---|---|
| Parchemin `#EDE6D8` | 14,99:1 | 13,67:1 | AAA — texte principal |
| Claro clair `#D9BC72` | 10,09:1 | 9,20:1 | AAA |
| Claro `#C9A227` | 7,70:1 | 7,02:1 | AAA |
| Fumée `#9C948A` | 6,22:1 | 5,67:1 | AA — texte secondaire |
| Alerte `#B8863B` | 5,77:1 | 5,26:1 | AA |
| Succès `#5E7A52` | 3,88:1 | 3,54:1 | **UI seulement**, pas de texte |
| Cèdre `#7A5C43` | 3,05:1 | **2,78:1** | **Bordures seulement** — échoue le seuil UI sur Maduro |
| Colorado `#8C4F2E` | 2,90:1 | **2,65:1** | **Échoue partout**, y compris comme élément UI |
| Erreur `#9B3D32` | 2,75:1 | **2,51:1** | **Échoue partout** |

Light mode, Encre `#181513` sur Papier `#F3EEE4` : **15,72:1**. Aucun problème de ce côté.

**Un problème réel, à traiter avant P0 et pas en P8.** Le brief demande une erreur en « bordeaux
mat, jamais rouge vif » — c'est la bonne intention chromatique, mais `#9B3D32` sur Maduro plafonne
à **2,51:1**. Le seuil est de 4,5:1 pour du texte et de 3:1 pour un composant d'interface : cette
valeur ne peut donc porter **ni** un message d'erreur, **ni** une bordure de champ invalide. Un
formulaire d'inscription dont l'erreur est invisible aux malvoyants n'est pas un détail esthétique.
Même constat pour Colorado, promu « accent secondaire » par le §4.2 : à 2,65:1 il ne peut pas
porter de texte.

**Correctif proposé — un palier, pas une nouvelle couleur.** On conserve les hex du brief pour les
aplats et les fonds teintés, et on ajoute pour chacun une variante « lisible » de même teinte et
même saturation, éclaircie jusqu'au seuil :

| Rôle | Aplat (brief, inchangé) | Variante texte / icône (ajoutée) | sur Maduro |
|---|---|---|---|
| Erreur | `#9B3D32` | `--erreur-lisible` `#CA675B` | 4,53:1 AA |
| Colorado | `#8C4F2E` | `--colorado-lisible` `#C16E41` | 4,51:1 AA |
| Succès | `#5E7A52` | `--succes-lisible` `#6D8D5F` | 4,55:1 AA |
| Cèdre | `#7A5C43` | `--cedre-lisible` `#A47C5A` | 4,53:1 AA |

La palette du brief reste la palette du brief. On ne lui ajoute aucune teinte : on lui ajoute
quatre paliers de luminance, ce que toute échelle de cape fait déjà de toute façon. Ces valeurs
demandent votre validation (voir **Q11**), et `tooling/scripts/check-tokens.ts` refusera en CI tout
usage textuel d'un token de la colonne « aplat ».

**La palette est aussi une donnée.** Les six valeurs `wrapper_shade` de `ref.cigars` sont les six
couleurs de l'échelle. Le composant `<WrapperScale />` affiche la cape d'un cigare comme une
position sur cette échelle — le même vocabulaire chromatique sert de décor et d'information. C'est
ce qui interdit d'ajouter une couleur « parce qu'il en faut une pour ce badge ».

---

## 2. Les quatre rôles typographiques

| Rôle | Fonte | Réglages | Emploi |
|---|---|---|---|
| **Display** | Bodoni Moda (variable) | 32 → 72 px · `tracking -0.02em` · poids 400–600 · `optical-sizing: auto` | Titres de page, nom du cigare, titres d'article. **Jamais sous 32 px** : une didone à fort contraste perd ses déliés en petit corps et devient illisible. Un seul Display par écran. |
| **Eyebrow** | Marcellus | 11–13 px · petites capitales · `tracking 0.14em` · Cèdre ou Fumée | Surtitres de section, libellés de champ, catégorie d'article, mentions de la bague. C'est le registre gravé — il donne l'autorité sans hausser la voix. |
| **UI / Corps** | Inter (variable) | 14 / 16 / 18 px · `line-height 1.6` · mesure max `68ch` · `font-feature-settings: 'tnum','cv05'` | Tout le reste : navigation, boutons, formulaires, corps d'article. Chiffres tabulaires activés par défaut, pour que les colonnes de notes ne dansent pas. |
| **Données** | JetBrains Mono | 12–14 px · `tracking 0.02em` | Codes de boîte (`MSU JUN 19`), cepo × longueur (`38 × 192 mm`), SKU, dates de production, identifiants de révision. Tout ce qui se compare colonne par colonne ou se recopie à la main. |

**Règle d'arbitrage.** Un nombre est en Données s'il se compare ou se recopie ; en UI s'il se lit.
Une note (`92`) se lit → Inter tabulaire. Un code de boîte (`MSU JUN 19`) se recopie → JetBrains Mono.

**Interdits, rappelés ici parce qu'ils reviennent toujours :** Playfair Display ; emoji dans l'UI ;
titre en sans-serif gras ; Bodoni sous 32 px ; plus d'un niveau Display par écran.

---

## 3. Wireframes

### 3.1 Accueil — après l'age gate

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Fumer nuit gravement à votre santé et à celle de votre entourage.           │  ← <HealthNotice/>
├──────────────────────────────────────────────────────────────────────────────┤     permanent, non
│  VITOLA        Cigares   Vitoles   Lieux   Journal   Boutique    ⌕    ○      │     masquable
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│         C O M P R E N D R E   C E   Q U E   L ' O N   F U M E                │  ← Eyebrow, Cèdre
│                                                                              │
│         Le référentiel du cigare,                                            │  ← Display 64px
│         écrit par ceux qui le fument.                                        │     Parchemin
│                                                                              │
│         ┌────────────────────────────────────────────────────┐               │
│         │ ⌕  Une marque, une vitole, un format…              │               │  ← champ unique
│         └────────────────────────────────────────────────────┘               │     radius 3px
│           Cohíba · Partagás · Padrón · Lancero · Robusto                     │  ← 12px Fumée
│                                                                              │
│         ┌─ Scanner une bague ──────┐   4 218 fiches · 71 marques             │
│         │  [icône bague]  Ouvrir   │   vérifiées par 340 contributeurs       │  ← preuve, pas
│         └──────────────────────────┘                                         │     promesse
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│  ╔══════════════════════════ AU CATALOGUE ══════════════════════════════╗    │  ← <Band variant
│                                                                              │     ="divider"/>
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │╔════════════╗│  │╔════════════╗│  │╔════════════╗│  │╔════════════╗│      │  ← <Band variant
│  │║  COHÍBA    ║│  │║  PARTAGÁS  ║│  │║  PADRÓN    ║│  │║ MONTECRISTO║│      │     ="header"/> :
│  │║  Siglo VI  ║│  │║  Serie D 4 ║│  │║  1964 Ex.  ║│  │║  No. 2     ║│      │     la carte EST
│  │╚════════════╝│  │╚════════════╝│  │╚════════════╝│  │╚════════════╝│      │     une bague
│  │              │  │              │  │              │  │              │      │
│  │ 52 × 150 mm  │  │ 50 × 124 mm  │  │ 56 × 152 mm  │  │ 52 × 156 mm  │      │  ← JetBrains Mono
│  │ ▓▓▓▓▓░ Moyen │  │ ▓▓▓▓▓▓ Corsé │  │ ▓▓▓▓▓▓ Corsé │  │ ▓▓▓▓░░ Moyen │      │  ← StrengthMeter
│  │ ●○○○○○ Colo. │  │ ●●●●○○ Madu. │  │ ●●●●●○ Osc.  │  │ ●●●○○○ C.Ma. │      │  ← WrapperScale
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│  ╔═══════════════════════════ AU JOURNAL ════════════════════════════════╗   │
│                                                                              │
│  ┌────────────────────────────────┐  LEXIQUE                                 │
│  │                                │  Ce que « ligero » veut                  │  ← Display 32px
│  │      [photo clair-obscur]      │  vraiment dire                           │
│  │      une source de lumière     │                                          │
│  │                                │  Les feuilles du haut du plant, leur     │  ← 68ch max
│  │                                │  combustion, et pourquoi le mot est      │
│  └────────────────────────────────┘  employé à tort. — 6 min                 │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│  Mentions légales · Confidentialité · CGU · Santé · Contact       fr ▾       │
│  Vitola est un site d'information. Aucun produit du tabac n'y est vendu.     │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Fiche cigare — `/cigares/cohiba-siglo-vi`

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Fumer nuit gravement à votre santé et à celle de votre entourage.           │
├──────────────────────────────────────────────────────────────────────────────┤
│  VITOLA        Cigares   Vitoles   Lieux   Journal   Boutique    ⌕    ○      │
├──────────────────────────────────────────────────────────────────────────────┤
│  Cigares › Cohíba › Línea 1492 › Siglo VI                                    │
│                                                                              │
│  ╔══════════════════════════════════════════════════════════════════════╗    │  ← <Band variant
│  ║        C O H Í B A            ·           S I G L O   V I            ║    │     ="header"/>
│  ╚══════════════════════════════════════════════════════════════════════╝    │     lockup Marcellus
│                                                                              │
│  Siglo VI                                                    ┌────────────┐  │  ← Display 56px
│  Cuba · Línea 1492 · Cañonazo                                │            │  │
│                                                              │  [photo    │  │
│  ┌───────────────────────┬────────────────────────┐          │   bague    │  │
│  │ CEPO × LONGUEUR       │ 52 × 150 mm            │          │   clair-   │  │  ← Eyebrow / Mono
│  │ VITOLE DE GALERA      │ Cañonazo               │          │   obscur]  │  │
│  │ FORME                 │ Parejo                 │          │            │  │
│  │ CAPE                  │ ●●●○○○  Colorado       │          │            │  │  ← WrapperScale
│  │ SOUS-CAPE             │ Cuba — Vuelta Abajo    │          └────────────┘  │
│  │ TRIPE                 │ Cuba — Vuelta Abajo    │           ◦ ◦ ◦ ◦        │
│  │ FORCE                 │ ▓▓▓▓▓░  Moyen-corsé    │                          │
│  │ SORTIE                │ Régulière · 2002       │                          │
│  │ CONDITIONNEMENT       │ Boîte de 25, de 10     │                          │
│  └───────────────────────┴────────────────────────┘                          │
│                                                                              │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐              │
│  │  Ajouter à la    │ │  Noter cette     │ │  Comparer        │              │  ← verbes actifs.
│  │  cave            │ │  dégustation     │ │                  │              │     Aucun CTA
│  └──────────────────┘ └──────────────────┘ └──────────────────┘              │     d'achat (§2)
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│  ╔════════════════════════ APPRÉCIATIONS ═══════════════════════════════╗    │
│                                                                              │
│    ┌────────────┐    Construction  ▓▓▓▓▓▓▓▓░░  8,4                           │
│    │            │    Tirage        ▓▓▓▓▓▓▓▓▓░  8,9                           │
│    │   9 1      │    Combustion    ▓▓▓▓▓▓▓▓░░  8,1                           │  ← Inter tabulaire
│    │   ─────    │    Arômes        ▓▓▓▓▓▓▓▓▓░  9,2                           │
│    │   / 100    │    Évolution     ▓▓▓▓▓▓▓▓░░  8,7                           │
│    │            │    Finale        ▓▓▓▓▓▓▓▓▓░  9,0                           │
│    └────────────┘                                                            │
│    142 dégustations       Moyenne bayésienne · pondérée par le volume        │  ← honnêteté
│                                                                              │     statistique
│    ARÔMES LES PLUS CITÉS                                                     │
│    cèdre 71 · cuir 58 · poivre noir 44 · cacao 39 · miel 22 · foin 18        │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│  ╔═══════════════════════ DANS LE MÊME FORMAT ══════════════════════════╗    │
│   [4 cartes-bagues, même vitole, autres marques]                             │
├──────────────────────────────────────────────────────────────────────────────┤
│  Fiche vérifiée le 12 mars 2026 par @editrice · 7 révisions                  │  ← modèle wiki
│  Proposer une correction  ·  Voir l'historique                                │     assumé
└──────────────────────────────────────────────────────────────────────────────┘
```

**Ce que cet écran ne contient pas, et pourquoi.** Aucun prix (`msrp_eur` existe mais son flag est
`false`), aucun revendeur, aucune disponibilité, aucun bouton d'achat, aucun « en promotion ».
Le §2 n'est pas une clause à respecter en fin de projet : c'est une contrainte de composition
qu'il faut tenir dès le premier wireframe, sinon la page se construit autour d'un vide.

### 3.3 Scan de bague — `/scanner`

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Fumer nuit gravement à votre santé et à celle de votre entourage.           │
├──────────────────────────────────────────────────────────────────────────────┤
│  ‹ Retour                    SCANNER UNE BAGUE                    27/30 ⓘ    │  ← quota du jour,
├──────────────────────────────────────────────────────────────────────────────┤     annoncé avant
│                                                                              │
│         ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░              │
│         ░░░░░░░░░░░░  flux caméra, assombri hors cadre  ░░░░░░░░░            │
│         ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░              │
│    ╔═════════════════════════════════════════════════════════════════╗       │
│    ║                                                                 ║       │  ← LE CADRE DE
│    ║              (   la bague, ici, à l'horizontale   )             ║       │     VISÉE EST UNE
│    ║                                                                 ║       │     BAGUE : mêmes
│    ╚═════════════════════════════════════════════════════════════════╝       │     filets laiton
│         ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░              │     que <Band/>
│         ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░              │
│                                                                              │
│      Cigare à l'horizontale · bague centrée · lumière de côté                │  ← 3 conseils, pas
│                                                                              │     un tutoriel
│                    ┌──────────────────────┐                                  │
│                    │   ◉   Photographier  │        [⌘] Chercher à la main    │  ← porte de sortie
│                    └──────────────────────┘                                  │     toujours offerte
└──────────────────────────────────────────────────────────────────────────────┘

        ↓  révélation — la seule séquence orchestrée de l'application (§4.5)
           220 ms ease-out, désactivée sous prefers-reduced-motion

┌──────────────────────────────────────────────────────────────────────────────┐
│  ‹ Reprendre                     RÉSULTAT                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ╔══════════════════════════════════════════════════════════════════╗       │  ← la bague se
│   ║       P A R T A G Á S       ·       S E R I E   D   N ° 4        ║       │     reforme depuis
│   ╚══════════════════════════════════════════════════════════════════╝       │     le cadre de
│                                                                              │     visée
│   Serie D No. 4                                     ▓▓▓▓▓▓▓▓▓░  confiance 91 │
│   Cuba · Robusto · 50 × 124 mm                                               │
│                                                                              │
│   ┌───────────────────────┐  ┌───────────────────────┐                       │
│   │   C'est celui-ci      │  │   Ce n'est pas ça     │                       │
│   └───────────────────────┘  └───────────────────────┘                       │
│                                                                              │
│   AUTRES POSSIBILITÉS                                                        │  ← Eyebrow
│   ┌────────────────────────────────────────────────────────────┐             │
│   │ Partagás · Serie E No. 2      54 × 141 mm            ▓▓░ 34 │             │
│   │ Partagás · Serie P No. 2      52 × 156 mm            ▓░░ 19 │             │
│   └────────────────────────────────────────────────────────────┘             │
│                                                                              │
│   Aucune ne correspond ?  Créer la fiche  →  formulaire pré-rempli           │  ← l'échec alimente
│                                                                              │     le référentiel
└──────────────────────────────────────────────────────────────────────────────┘
```

### 3.4 Fiche cigare à 360 px — le plancher, pas une adaptation

```
┌────────────────────────────────┐
│ Fumer nuit gravement à votre    │  Le bandeau sanitaire ne se
│ santé et à celle de votre       │  réduit jamais : il passe sur
│ entourage.                      │  deux lignes, il ne disparaît pas.
├────────────────────────────────┤
│ ☰   VITOLA                  ⌕  │
├────────────────────────────────┤
│ ╔════════════════════════════╗ │  La bague est le seul élément
│ ║  COHÍBA   ·   SIGLO VI     ║ │  qui traverse toutes les tailles
│ ╚════════════════════════════╝ │  sans changer de nature.
│                                │
│ Siglo VI                       │  Display descend à 32 px —
│ Cuba · Línea 1492              │  son plancher absolu.
│                                │
│ ┌────────────────────────────┐ │
│ │      [photo bague]         │ │
│ └────────────────────────────┘ │
│                                │
│ CEPO × LONGUEUR                │  Le tableau à deux colonnes
│ 52 × 150 mm                    │  devient une pile étiquette /
│                                │  valeur. L'Eyebrow porte
│ CAPE                           │  l'étiquette : aucune bordure
│ ●●●○○○  Colorado               │  supplémentaire n'est requise.
│                                │
│ FORCE                          │
│ ▓▓▓▓▓░  Moyen-corsé            │
│                                │
│ ┌────────────────────────────┐ │  Une action principale pleine
│ │     Ajouter à la cave      │ │  largeur ; les deux autres
│ └────────────────────────────┘ │  passent en liens.
│  Noter · Comparer              │
└────────────────────────────────┘
```

---

## 4. L'élément signature, en une phrase

> **La bague est le seul objet que tout fumeur retire, retourne et conserve avant d'avoir goûté
> quoi que ce soit — en faire le composant unique de l'interface, c'est laisser le produit fournir
> sa propre grammaire visuelle plutôt que d'en emprunter une au logiciel.**

Ce qui en découle, et qui n'est pas négociable : `<Band />` se décline en quatre variantes
(`header` sur les cartes, `divider` entre les sections éditoriales, `badge` sur les profils,
`viewfinder` sur l'écran de scan) et le reste de l'interface **se tait** — filets à
`rgba(237,230,216,0.07)`, rayon 3 px, pas d'ombre, un seul accent. Un deuxième élément mémorable
n'en ferait pas deux : il n'en resterait aucun.
