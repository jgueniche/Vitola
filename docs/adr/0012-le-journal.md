# 0012 — Un article est du contenu en base, jamais du code ; la frontière du portail passe entre deux audiences d'articles, pas au bord du journal

- **Statut** : **Acceptée** le 23 août 2026 — la commande de session du 23 août couvre P4 à P8 dans l'ordre du §9, et P6 s'ouvre sur ce document
- **Date** : 2026-08-23
- **Décideur** : @jgueniche
- **Concerne** : P6 (éditorial, F9) · Q13 · Q1 · `public.articles` · `public.article_links` ·
  `/journal` · `app/sitemap.ts` · `docs/editorial-guidelines.md`

## Contexte

Le §9 donne à P6 un critère de sortie — « Lighthouse SEO ≥ 95 » — et le §5.8 un schéma
(`articles`, `article_links`). Cinq faits cadrent ce qui suit, et deux d'entre eux forcent des
écarts avec la lettre du brief.

**1. Le §5.8 écrit `body_mdx`, et du MDX en base est du code, pas du contenu.** MDX se compile en
JavaScript et s'exécute dans le rendu : un article stocké en base et rendu en MDX est une
injection de code offerte à quiconque obtient le droit d'écrire un article — un `editor`
compromis, une faille d'écriture, une migration maladroite. Le dépôt a refusé `SECURITY DEFINER`
quand `INVOKER` suffisait ; c'est la même famille de décision.

**2. Q13 a déjà tranché la géographie, il reste à tracer la rue.** Le score Lighthouse se mesure
sur `app/(public)/` — accueil, pages légales, « journal éditorial **sans mention de produit** ».
Un article qui nomme une marque vit derrière le portail, en `noindex`, comme les fiches. Le
journal a donc **deux audiences** et une seule adresse : couper `/journal` en deux routes selon
l'audience est impossible (deux groupes de routes ne peuvent pas servir le même segment), et
donner deux adresses au journal en ferait deux produits.

**3. La newsletter demande ce que l'environnement n'a pas.** Resend (§3) n'a pas de clé ici, le
domaine attend Q7, et un double opt-in exige d'envoyer des courriels. Collecter des adresses sans
pouvoir ni envoyer ni confirmer serait le pire des états : une table de données personnelles au
service de rien — exactement ce que le refus des cases de consentement de P1 a écarté.

**4. Le brief interdit une dépendance sans justification écrite (§3)**, et le dépôt en a évité
trois en P0 en écrivant moins. Aucun outil Markdown n'est installé.

**5. `robots.txt` interdit tout tant que Q1 n'est pas tranchée**, et l'audit « page is not blocked
from indexing » de Lighthouse plafonne le score d'une page interdite d'indexation. Le critère de
sortie de P6 ne peut donc pas se mesurer sur la configuration de production d'aujourd'hui — il se
mesure sur la configuration **d'ouverture**, qui doit exister comme levier et rester fermée.

## Options

### D1 · Où vit un article ?

**A — Des fichiers MDX dans le dépôt.** Versionnés, revus en PR, rendus statiquement — le meilleur
SEO possible.
*Coût :* écrire un article demande un commit, donc un développeur ; le §5.8 définit une table, pas
un dossier ; et `article_links` (un article ↔ des fiches) devient une convention de frontmatter
qu'aucune contrainte ne tient.

**B — La table du §5.8**, `status draft|published`, écrite par un `editor` depuis un écran.
*Coût :* le rendu est dynamique (le cache de Next fait le reste), et l'écran d'écriture est à
construire.

### D2 · Dans quelle langue s'écrit le corps ?

**A — MDX, comme le §5.8 l'écrit.** *Coût :* le fait 1. Du code exécutable en base, évalué au
rendu, sur un site que le §2 expose juridiquement — c'est la surface d'attaque la plus chère du
produit pour un gain nul : personne n'a demandé de composants dans un article.

**B — Markdown complet, rendu par une dépendance** (react-markdown et l'écosystème remark).
*Coût :* une quinzaine de paquets transitifs pour des tableaux et des notes de bas de page que la
charte éditoriale n'emploie pas.

**C — Un sous-ensemble Markdown défini par le dépôt**, rendu par `lib/journal/markdown.ts` en
éléments React (jamais `dangerouslySetInnerHTML`) : titres `##`/`###`, paragraphes, listes,
emphase, liens `https` seulement, citations. Ce que le parseur ne connaît pas se rend
littéralement — un article ne casse jamais, il s'affiche moins joliment.
*Coût :* un parseur maison est un risque classique ; il est borné par la taille du sous-ensemble,
et épinglé par des tests qui incluent les cas d'injection (HTML brut, `javascript:`, liens
relatifs vers l'arrière du portail).

### D3 · Où passe la frontière du portail ?

**A — Tout le journal devant.** *Coût :* un article nommant une marque serait public — interdit
par Q13.

**B — Tout le journal derrière.** *Coût :* plus rien à mesurer pour le critère de sortie, et le
journal cesse d'être l'outil SEO que F9 promet.

**C — Une colonne `audience enum(public|gated)`, une seule adresse.** `/journal` entre dans les
routes publiques ; la **page** d'un article `gated` exige elle-même le cookie du portail et
redirige vers `/majorite` sinon, avec `noindex` par métadonnée. Le sitemap et le flux RSS ne
listent que le `public`.
*Coût :* une route publique dont certaines lignes se défendent seules — une entorse au « protégé
par défaut » du middleware, bornée par le fait que la garde vit dans **une** fonction partagée par
la page et par rien d'autre.

### D4 · Que peut nommer un article public ?

Le garde-fou de Q13 (« sans mention de produit ») doit être vérifiable, pas déclaratif.

**A — Une relecture humaine seule.** *Coût :* la dérive est silencieuse.

**B — Trois barrières.** La structure : `article_links` est **interdit sur un article public**
(trigger — le lien vers une fiche est précisément la mention qu'on s'interdit). L'outillage : le
test e2e existant qui balaie `app/(public)` à la recherche d'un nom de marque réel couvre le
journal public dès qu'il existe. L'humain : la charte éditoriale s'applique, et publier reste un
geste d'`editor`.

### D5 · Et la newsletter ?

**A — Une table d'abonnés dès maintenant.** *Coût :* le fait 3.
**B — Rien en v1 : le flux RSS est l'abonnement.** Il ne collecte rien, ne promet rien, et sert
le même besoin. La newsletter arrive avec une clé Resend et un domaine (Q7), comme le scan
attend ses clés.

## Décision

**D1 : option B — la table du §5.8**, `public.articles`, avec `status draft|published` et
`published_at` posé à la publication. `reading_time` est calculé à l'écriture depuis le corps,
jamais saisi (la règle de la note de dégustation, en plus petit).

**D2 : option C — le sous-ensemble maison, et pas de MDX.** L'écart avec la lettre du §5.8 est
assumé et porte un argument de sécurité : **un article est du contenu, jamais du code.** La
colonne s'appelle `body_md`. Si le sous-ensemble devient étroit, l'option B reste ouverte — c'est
un changement de rendu, pas de schéma.

**D3 : option C — une adresse, deux audiences.** `/journal` et `/journal/[slug]` entrent dans les
routes publiques ; un article `gated` se défend lui-même : cookie du portail exigé, `noindex`,
absent du sitemap et du flux. Le levier d'indexation global, lui, reste fermé tant que Q1 n'est
pas tranchée — le critère de P6 se mesure avec le levier ouvert, en local, et le chiffre est
consigné.

**D4 : option B — les trois barrières**, dont la structurelle : pas d'`article_links` sur un
article public, tenu par un trigger.

**D5 : option B — pas de newsletter en v1.** Le flux RSS des articles publics tient lieu
d'abonnement. À signaler, pas à cacher : F9 la promettait, et elle attend une clé et un domaine.

**Qui écrit : un `editor`, et il publie lui-même.** Contrairement au wiki (l'auteur d'une fiche
ne la publie pas), l'article n'a pas de séparation proposeur/relecteur : écrire dans le journal
**est** le privilège, gagné par le rôle. Un `member` ne voit pas les brouillons et n'écrit rien.

## Conséquences

**Ce que nous acceptons, y compris désagréable.**

- **Pas de composants dans un article** — pas de tableau interactif, pas d'embed. Un article est
  du texte, des titres, des listes, des liens et des images plus tard.
- **Un parseur maison à maintenir**, borné et testé. Le jour où il gêne, react-markdown le
  remplace sans toucher la base.
- **Une route publique dont certaines lignes se gardent elles-mêmes.** La garde est une fonction,
  appelée par la page de l'article, et le test de parcours la traverse dans les deux sens.
- **Pas de newsletter en v1**, et le §7 la promettait. Elle attend Resend et Q7.
- **Le critère Lighthouse se mesure levier ouvert**, pas en production : la production reste
  `noindex` partout tant que Q1 n'est pas tranchée.

**Ce que cela interdit désormais.**

- **Évaluer quoi que ce soit venant de `body_md`.** Le rendu construit des éléments React ; ni
  `dangerouslySetInnerHTML`, ni `eval`, ni compilation MDX, jamais.
- **Un lien `article_links` sur un article public** — le trigger le refuse.
- **Un article public nommant une marque.** Le balayage e2e de `app/(public)` échoue dessus.
- **Collecter une adresse courriel** avant qu'un envoi soit possible et confirmé.

## Quand rouvrir

1. **Une clé Resend et un domaine (Q7) existent** → D5 se rouvre : double opt-in, table
   d'abonnés, consentement daté dans `consents`.
2. **Q1 tranche l'indexation** → le levier s'ouvre en production, et le chiffre Lighthouse se
   remesure sur le vrai domaine.
3. **Trois articles butent sur le sous-ensemble en un mois** → D2 passe à l'option B
   (react-markdown), justification déjà écrite ici.
4. **Un back-office arrive (P8)** → l'écran d'écriture minimal de P6 s'y fond.

## Question ouverte

**Qui écrit le journal, éditorialement ?** Le rôle `editor` ouvre l'écran, mais la ligne
éditoriale — quels sujets, quel rythme, qui signe — est une décision du porteur du produit. Les
deux articles d'amorçage livrés avec P6 sont des **brouillons**, écrits pour montrer la forme et
relus par personne : les publier est votre geste, pas le mien.
