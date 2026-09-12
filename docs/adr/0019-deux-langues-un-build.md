# 0019 — Deux langues, un build par langue : la locale est une décision de compilation

- **Statut** : **Acceptée** le 12 septembre 2026 — première session de QA humaine
  (« traduire en anglais au minimum le site »)
- **Date** : 2026-09-12
- **Décideur** : @jgueniche
- **Concerne** : `lib/i18n/index.ts` · `messages/fr.json` et `messages/en.json` ·
  `next.config.ts` · `app/layout.tsx` · `lib/format/index.ts` · `lib/brand.ts` ·
  `tests/unit/i18n-parity.test.ts` · Q1 (ouverture) · Q7 (nom de domaine)

## Contexte

Le §0.10 du brief dit une chose et une seule sur la langue : **le contenu est en français, le code
en anglais**, et aucune chaîne visible n'est écrite en dur — tout passe par `messages/fr.json`,
lu par `lib/i18n`. La règle a tenu neuf phases : 164 fichiers lisent `m`, 1 997 clés existent, et
`pnpm check` casse si l'une est renommée.

La QA du 12 septembre demande l'anglais. La forme qui vient à l'esprit est un **sélecteur dans
l'en-tête** : un cookie, une locale résolue par requête, deux dictionnaires. Elle n'est pas
disponible au prix qu'elle paraît coûter, et la raison se mesure.

**1. La copie est lue au chargement du module, pas au rendu.** 120 des 164 fichiers écrivent
`const copy = m.venues` **à la portée du module**. Un module est évalué une fois par processus, à
l'import : une locale par requête devrait donc être lisible **avant** le premier import, ce qui
n'a pas de sens, ou alors les 120 fichiers passent à un appel dans le corps du composant.

**2. Next 16 n'offre pas de contexte de requête synchrone.** `cookies()` et `headers()` rendent une
`Promise` — le shim synchrone de Next 15 a disparu. Un layout ne peut pas non plus envelopper le
rendu de ses enfants dans un `AsyncLocalStorage` : les enfants RSC ne sont pas rendus dans la pile
d'appel du layout. Il n'existe donc aucun endroit où « la locale courante » puisse être lue par une
fonction pure, ce qu'est `m`.

**3. 48 des fichiers sont des composants client.** Ils recevraient le dictionnaire en prop ou par un
provider : 124 Ko de JSON dans la charge RSC de chaque page, ou un filetage de props à travers
48 composants.

Le coût d'un sélecteur n'est donc pas « ajouter un cookie » : c'est **réécrire la façon dont 164
fichiers lisent leur copie**, pour un site qui n'a pas encore ouvert ses inscriptions (Q1).

## Options

**A — Un build par langue.** `NEXT_PUBLIC_LOCALE=en pnpm build` produit le site anglais. Zéro site
d'appel change, les deux dictionnaires se vérifient l'un contre l'autre au compilateur, et la
valeur est inlinée par le bundler — donc le serveur et le navigateur ne peuvent pas diverger sur
la langue, qui est précisément la classe de bug qu'une locale d'exécution introduit. Coût : **pas
de bascule dans la page**, et deux déploiements à tenir (un domaine ou un sous-domaine par langue).

**B — `next-intl` et le routage par segment (`/fr/...`, `/en/...`).** La solution attendue. Coût
réel : les 120 lectures à la portée du module passent dans le corps des composants, les 48
composants client prennent un provider, toutes les routes gagnent un segment — donc `lib/routes.ts`,
le sitemap, le middleware du portail, les `PUBLIC_PATHS`, les liens de l'age gate et les 48 écrans
de l'audit a11y. C'est une phase, pas une tâche.

**C — Une locale par requête sans routage** (cookie lu dans chaque page). Dette immédiate : chaque
page devient dynamique, donc `/` et le journal perdent leur prérendu statique — ce qui est le
critère de sortie mesuré de P6 (Lighthouse SEO = 100, et le levier d'indexation qui va avec).

## Décision

**Option A.** La locale est une décision de compilation, lue une fois, au chargement du module, dans
une variable que le bundler a déjà remplacée par sa valeur.

```ts
export const LOCALE: Locale = isLocale(process.env.NEXT_PUBLIC_LOCALE)
  ? process.env.NEXT_PUBLIC_LOCALE
  : DEFAULT_LOCALE
export const m = dictionaries[LOCALE]
```

Quatre choses tiennent cette décision, et elles sont dans le dépôt :

1. **`Record<Locale, Messages>`**, avec `Messages = typeof fr`. Une clé que l'anglais n'a pas est une
   **erreur de compilation**, pas un `undefined` en production.
2. **`tests/unit/i18n-parity.test.ts`** prend l'autre direction, que le compilateur laisse passer
   (TypeScript admet les propriétés en excès sur une valeur qui n'est pas un littéral frais) : une
   clé que le français a perdue, une interpolation renommée — `{n}` pour `{count}`, le vrai
   dérapage, qui ne casse rien et affiche l'accolade au milieu d'une phrase —, et un message vide.
3. **`next.config.ts` casse le build** sur une valeur inconnue. Un repli silencieux vers le français
   sur une faute de frappe donnerait un site anglais qui parle français par endroits.
4. **`INTL_LOCALE` et `LANG` vivent dans `lib/i18n`, pas dans `lib/brand.ts`.** Ce que `Intl`
   formate et ce que dit `<html lang>` sont la langue du **build** ; `BRAND.locale` et
   `BRAND.timeZone` restent ceux du **marché**, qui est la France dans les deux langues — mêmes
   prix en euros, mêmes lieux, même décret, même « aujourd'hui » à Paris.

## Conséquences

**Ce qu'on accepte, et c'est désagréable** : il n'y a **pas de sélecteur de langue**. Un visiteur
anglophone qui arrive sur le domaine français n'a pas de bouton — il a une autre adresse, et
personne ne l'y conduit encore. C'est la contrepartie assumée : un sélecteur qui marche à moitié
est pire qu'une seconde adresse qui marche entièrement, et l'i18n de P8 avait déjà tranché dans ce
sens en refusant un sélecteur sans seconde langue.

**Ce que cela interdit désormais** : écrire `m.x` dans une branche conditionnelle de locale, ou
importer directement `messages/en.json` ailleurs que dans `lib/i18n`. Les deux fabriqueraient un
écran bilingue.

**Un mot sur un mot** : le terme anglais pour *vitole* **est** le nom commercial du site — `vitola`.
Le contrôle de `tooling/scripts/check-tokens.ts` l'a trouvé sur sept libellés, et c'est un vrai
défaut de copie et pas seulement un artefact du garde-fou : un `<dt>` qui dit « Vitola » sur un site
qui s'appelle Vitola est ambigu pour le lecteur, là où « Vitole » ne l'est pas. Le libellé nu dit
donc **Format**, les termes d'art espagnols prennent la forme que l'écran du vitolario emploie déjà
(« Salida name », « Galera name »), et le mot reste en minuscule dans le fil du texte, où personne
ne peut le confondre avec un nom. **Le garde-fou n'a pas été assoupli.**

## Quand rouvrir

**Le trafic anglophone, mesuré.** Le jour où une part des lecteurs arrive sur le domaine anglais et
cherche le français — ou l'inverse —, la bascule dans la page a un client, et l'option B a un
budget. D'ici là, le seul chiffre qui compte est zéro : le site n'a pas ouvert ses inscriptions.

**Ou la troisième langue.** À trois dictionnaires, un build par langue devient une matrice de
déploiements, et le calcul change.

## Question ouverte

**Sur quelle adresse le site anglais répond-il ?** Un sous-domaine (`en.`) partage les cookies du
portail — donc une personne majeure le reste en changeant de langue — mais dilue le signal
d'indexation. Un domaine séparé fait l'inverse, et demande un second passage du portail. La
question dépend de Q7 (le nom de domaine, toujours ouverte) et n'a pas à être tranchée pour que le
dictionnaire existe : il est complet, vérifié, et attend son `vercel.json`.
