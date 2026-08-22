# Journal des micro-décisions

Ce qui ne mérite pas une ADR mais qu'il faut pouvoir retrouver. Ordre antichronologique.

## Phase 0 — réalisation

**Next 16 plutôt que Next 15.** Le §3 du brief dit « Next.js 15 », écrit avant la sortie de la 16.
Même App Router, même React 19. Démarrer un projet neuf sur une majeure déjà dépassée coûterait
une migration dans les mois qui viennent. Réversible sans douleur tant qu'il n'y a pas de code
métier. Conséquences constatées : `next lint` n'existe plus (ESLint tourne seul), et la clé
`eslint` de `next.config.ts` a disparu.

**TypeScript 6, pas 7.** TS 7 est la version courante, mais `typescript-eslint` la refuse
explicitement au démarrage. Comme `pnpm lint` doit passer (§0.7), le projet est épinglé sur TS 6.
À revérifier quand typescript-eslint annonce le support.

**Version de React épinglée dans la config ESLint.** `eslint-plugin-react` appelle
`context.getFilename()`, retirée d'ESLint 10, dans sa détection automatique. Déclarer la version
court-circuite ce chemin de code.

**`postcss` en dépendance explicite.** Avec le `node_modules` strict de pnpm, Next ne résolvait pas
`postcss` et sautait **silencieusement** tout le traitement — build vert, aucune feuille de style
émise. Le symptôme n'apparaissait qu'après un build propre, le cache masquant la panne.

**Le sombre est inconditionnel.** Voir Q23.

**Palier de contraste ajouté à la palette.** La couleur d'erreur du §4.2 plafonne à 2,51:1 sur les
cartes. Quatre variantes éclaircies, même teinte, même saturation. Voir Q11.

**L'échelle de cape est éclaircie par rapport à la feuille réelle.** Un maduro fidèle (`#4a261a`)
est indiscernable de la surface maduro sur laquelle il repose : les deux derniers crans de
l'échelle disparaissaient. C'est une échelle symbolique, réglée pour être perçue, jamais seul
porteur de sens — le libellé est toujours affiché.

**Trois dépendances évitées.** `jose` (l'age gate signe via Web Crypto, présent partout),
`vite-tsconfig-paths` (Vite résout les alias nativement), `pg` (le contrôle de couverture RLS
tourne en `psql` dans la CI). Le §3 demande une justification par dépendance ; l'absence en est
la meilleure.

**Une page `/cigares` d'attente en P0.** L'age gate renvoie par défaut vers le référentiel, qui
n'existe qu'en P1 : sans cette page, un adulte franchissant le portail atterrissait sur un 404.
Découvert en capturant les écrans, pas en relisant le code.

**Les scans de conformité masquent les commentaires.** Sans cela, une phrase expliquant pourquoi
une chose est absente déclenche l'alerte que cette chose est présente. Constaté deux fois : sur
`health-notice.tsx` et sur `band.tsx`.

**Captures d'écran : attendre `load`, pas `domcontentloaded`.** `domcontentloaded` n'attend pas les
feuilles de style : les captures sortaient non stylées de façon intermittente. Vaut pour tout
futur test de régression visuelle.
