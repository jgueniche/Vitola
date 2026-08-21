# 0002 — Garder toute la recherche dans PostgreSQL, y compris la fusion hybride

- **Statut** : Proposée — attend validation
- **Date** : 2026-08-21
- **Décideur** : @jgueniche
- **Concerne** : P1 (recherche facettée) · P4 (reconnaissance de bague) · `lib/search/` · `ref.cigars`

## Contexte

Le brief emploie le mot « recherche » pour **deux problèmes différents**, et les confondre serait
une erreur de conception.

**Problème 1 — la recherche facettée du référentiel (P1).** Corpus de 5 000 fiches au lancement,
peut-être 50 000 à terme. Requête typique : une chaîne partielle plus quatre facettes, avec les
compteurs par facette. Critère de sortie : **< 300 ms**. Difficultés propres : accents
(`Cohíba` / `Cohiba`), noms propres hispanophones que le stemming français mutile, fautes de frappe
(`montecristo` / `monte cristo`), et le fait qu'**un brouillon ne doit jamais fuiter** dans les
résultats d'un tiers.

**Problème 2 — la sélection de candidats pour le scan (P4).** Le §6 impose une fusion Reciprocal
Rank Fusion (k=60) entre un classement vectoriel (cosinus sur `band_embeddings`, top-20) et un
classement lexical (trigramme sur les `text_tokens` renvoyés par le VLM). Objectif : top-3 ≥ 85 %.

Point commun : les deux interrogent `ref.cigars`, dont la visibilité est régie par la RLS.

## Options

**A — Tout dans PostgreSQL.** `tsvector` (GIN) pour le lexical, `pg_trgm` (GIN) pour l'approximatif,
`pgvector` (HNSW) pour le visuel, RRF calculé en SQL par un `full outer join` de deux CTE classées.

**B — Moteur externe** (Meilisearch, Typesense, Algolia) pour le lexical, `pgvector` pour le visuel.

**C — Moteur externe pour tout**, y compris les vecteurs (Typesense et Algolia savent faire).

## Décision

**Option A. Les deux classements restent dans la même base, et la fusion RRF est une requête SQL.**

L'argument décisif n'est ni la performance ni le coût — c'est la **RLS**.

Un index externe est un miroir des données, sans les policies. Dès qu'un classement sort de
PostgreSQL, il faut réimplémenter « qui a le droit de voir quoi » dans le moteur *et* le
resynchroniser à chaque changement de statut. Sur ce projet, cela signifie qu'un brouillon, une
fiche rejetée ou une fiche fusionnée peuvent apparaître dans une réponse de recherche pendant la
fenêtre de réindexation. C'est la définition d'une fuite. En restant dans Postgres, la RLS
s'applique aux résultats **gratuitement et sans fenêtre** — c'est exactement ce qu'a vérifié
l'assertion T6/T7 du livrable 2.

Deuxième argument, propre au §6 : la RRF fusionne deux **rangs**. Si le lexical vit dans
Meilisearch et le vectoriel dans Postgres, la fusion se fait côté application, sur deux top-K
tronqués récupérés par le réseau, avec deux latences à additionner et deux modes de panne. En SQL,
c'est une requête, une transaction, une vue cohérente.

Le coût d'entrée est nul : le §3 énumère déjà `pgvector`, `pg_trgm` et `unaccent`.

### Ce que cela implique concrètement

**Recherche facettée (P1).** `search_vector` est alimenté par trigger (et non en colonne générée :
il doit contenir la marque, la ligne et la vitole, qui sont sur d'autres lignes). Deux
configurations sont combinées : `simple` pour les noms propres — le stemming français transforme
« Behike » et « Behiké » en lexèmes distincts et racine « Montecristo » — et `french` pour la prose
d'origine. Poids `A` marque et nom commercial, `B` ligne et vitole, `C` manufacture, `D` origines.
Classement par `ts_rank_cd`, secours par similarité trigramme au-delà de 0,3 quand le `tsquery` ne
rend rien. Facettes servies par des index **partiels** sur `status = 'published'` : l'index reste
petit et le planificateur peut les combiner en bitmap.

**Sélection de candidats (P4).** RRF en SQL :

```sql
with lexical as (
  select id, row_number() over (order by ts_rank_cd(search_vector, q) desc) as r
    from ref.cigars, to_tsquery('pg_catalog.simple', :tokens) q
   where search_vector @@ q limit 50
),
visual as (
  select cigar_id as id, row_number() over (order by embedding <=> :q_vec) as r
    from ref.band_embeddings order by embedding <=> :q_vec limit 20
)
select id, sum(1.0 / (60 + r)) as rrf
  from (select * from lexical union all select * from visual) s
 group by id order by rrf desc limit 3;
```

## Conséquences

**Acceptées :**

- **Pas de tolérance aux fautes « gratuite ».** Meilisearch corrige les typos par défaut ; ici, il
  faut la construire (trigramme + seuil calibré). Budget : environ une session sur P1.
- **Pas de recherche instantanée à la frappe sans travail.** Le typeahead passe par
  `/api/search/suggest`, avec debounce, limite de débit et requête trigramme dédiée.
- **Les compteurs de facettes coûtent une passe supplémentaire.** À 5 000 lignes, négligeable ;
  c'est la première chose qui se dégradera en croissant.
- **HNSW se construit en mémoire.** À surveiller au moment où `band_embeddings` dépassera quelques
  centaines de milliers de lignes ; sans rapport avec P1.

**Ce que cela interdit :** ajouter un moteur externe « juste pour l'autocomplétion ». Ce serait
rouvrir la faille de synchronisation pour un gain d'ergonomie.

## Quand rouvrir

Seuils mesurables, dans cet ordre :

1. p95 de la recherche facettée **> 250 ms** sur le corpus réel → dénormaliser d'abord dans une vue
   matérialisée `ref.cigar_search` (cepo et longueur recopiés depuis `vitolas`), ce qui supprime la
   jointure sans quitter Postgres.
2. Si p95 reste **> 250 ms** après cela, ou si le corpus dépasse **200 000 fiches** → Typesense en
   miroir **du seul contenu publié**, l'index externe n'ayant alors jamais connaissance des
   brouillons. La faille décrite plus haut disparaît par construction, ce qui rend l'option
   acceptable — mais pas avant.
3. Top-3 du scan **< 85 %** avec un RRF correctement calibré → le problème est le modèle
   d'embedding ou le corpus de référence, pas le moteur. Ne pas changer de moteur pour cela.

## Questions ouvertes

1. **Quel modèle d'embedding, et hébergé où ?** Le §3 propose SigLIP ou CLIP via Replicate ou
   Hugging Face. `vector(1152)` correspond à SigLIP-So400m. Envoyer une photo d'utilisateur à un
   endpoint hors UE est un transfert de données personnelles à documenter. Voir **Q5**.
2. **Les 200 photos annotées du §6 existent-elles ?** Sans ce corpus, le critère de sortie de P4
   n'est pas mesurable et la phase ne peut pas se clore. Voir **Q17**.
