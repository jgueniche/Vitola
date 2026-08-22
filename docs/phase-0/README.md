# Phase 0 — Livrable de planification

> Produit en réponse au §10 du [`BRIEF.md`](../../BRIEF.md). **Aucun code applicatif n'a été
> écrit.** Le travail s'arrête ici et attend votre validation, conformément au §0.1.

## Les six livrables

| § | Livrable | Fichier |
|---|---|---|
| 10.1 | Arborescence complète du dépôt | [`01-arborescence.md`](./01-arborescence.md) |
| 10.2 | Schéma SQL complet de P1 | [`02-schema-p1.md`](./02-schema-p1.md) — note de relecture<br>[`03-schema-p1.sql`](./03-schema-p1.sql) — la migration<br>[`03b-verification.sql`](./03b-verification.sql) — la preuve d'exécution |
| 10.3 | Plan de design | [`04-plan-design.md`](./04-plan-design.md) |
| 10.4 | Trois ADR initiales | [`../adr/`](../adr/) |
| 10.5 | Questions ouvertes, classées par impact | [`05-questions-ouvertes.md`](./05-questions-ouvertes.md) |
| 10.6 | Estimation par phase | [`06-estimation.md`](./06-estimation.md) |

## Ce qu'il faut retenir en une page

**Le schéma a été exécuté, pas seulement rédigé.** Appliqué sur une PostgreSQL 16 réelle contre des
doublures des objets Supabase, puis soumis à **25 assertions — toutes vertes**. Deux défauts réels
en sont sortis, invisibles à la relecture : un ordre de définition qui faisait échouer la migration,
et un `GRANT USAGE ON SCHEMA extensions` manquant qui aurait fait échouer **tout** `INSERT` client
dans `ref.*`. Les deux sont corrigés dans le fichier livré.

**Un écart structurel demande votre accord.** `birth_date`, `preferences` et `privacy` sont sortis
de `profiles` vers une table `profile_settings` réservée au propriétaire. Raison : la RLS est ligne
à ligne, pas colonne à colonne — une table unique ne peut pas être à la fois un annuaire public et
le dépositaire d'une date de naissance. Sept autres écarts, mineurs, sont listés et justifiés un par
un dans le livrable 2.

**La palette du §4.2 a un problème d'accessibilité mesuré.** La couleur d'erreur `#9B3D32` plafonne
à **2,51:1** sur le fond des cartes — sous le seuil de 3:1 exigé même pour un élément non textuel.
Un message d'erreur dans cette couleur est illisible pour une partie des utilisateurs, et l'audit
axe-core de P8 le relèvera. Quatre variantes éclaircies, de teinte et de saturation identiques, sont
proposées (**Q11**). Aucune teinte nouvelle n'est ajoutée à la palette.

**Le brief se contredit à deux endroits**, et je ne les ai pas tranchés seul :
- **Q8** — le §8 impose des buckets privés, le §9 impose LCP < 2,0 s sur la fiche cigare. Une image
  en URL signée n'est pas mise en cache par le CDN. J'ai livré la version **conforme au brief**
  (bucket privé) ; ma recommandation est de l'ouvrir pour les seules images du référentiel.
- **Q13** — le §2 impose `noindex` derrière l'age gate, le §9 impose Lighthouse SEO ≥ 95. Résolu par
  la séparation `app/(public)/` et `app/(app)/`, déjà présente dans l'arborescence.

**Deux manques dans le brief lui-même.** L'abonnement « Cercle » du §7 n'est livré par aucune phase
alors qu'il contraint le schéma de la cave en P2 (**Q9**). Et la saisie du référentiel — 15 à
25 heures de travail humain, non-développement, sur le chemin critique de P1 — n'apparaît nulle part
dans la roadmap (**Q3**). C'est le poste le plus souvent fatal à ce type de projet.

**Estimation : 58 à 84 sessions** au total ; **13 à 19** jusqu'à un référentiel consultable,
cherchable et contribuable.

## Ce que j'attends de vous

Le livrable 5 contient 23 questions, chacune assortie d'une **réponse par défaut**. Vous n'avez à
répondre qu'à celles où mon défaut vous déplaît. Les huit premières sont bloquantes ; les quatre qui
conditionnent le démarrage de P0 et P1 sont **Q2** (région Supabase, irréversible), **Q3** (qui
saisit le référentiel), **Q8** (bucket privé ou public) et **Q11** (les quatre tokens de contraste).

## Rejouer la vérification

```bash
createdb vitola
cd docs/phase-0 && psql -d vitola -f 03b-verification.sql
```

Le fichier crée ses propres doublures Supabase, applique la migration, puis exécute les
23 assertions et le contrôle de couverture RLS. Attendu : `PASS` partout, sortie 0.
