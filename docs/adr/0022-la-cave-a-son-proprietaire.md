# 0022 — Rendre chaque cave à son propriétaire, et n'en ouvrir une que par une invitation acceptée

- **Statut** : **Acceptée** le 26 septembre 2026 — demande du porteur (« il faut absolument que
  chaque cave soit strictement personnelle, hormis la possibilité de partager une cave ») ; ses
  deux questions **tranchées le 27 septembre 2026** (voir la dernière section) — lecture seule
  confirmée, « Montrer ma cave » gardé pour les seuls destinataires (D7, migration `0038`)
- **Date** : 2026-09-26
- **Décideur** : @jgueniche
- **Concerne** : `public.humidors` · `public.humidor_items` · `public.humidor_events` ·
  `public.humidor_readings` · `public.humidor_shares` (nouvelle) · `public.notifications` ·
  `public.shared_humidor_shelf()` · migrations `0036` et `0038` · `app/(app)/cave/**` ·
  `app/(app)/membres/[handle]` · `lib/humidor/**` · ADR 0006 (D4) · ADR 0007 (D5)

## Contexte

Deux signalements le même jour, qui sont le même défaut vu des deux côtés.

**« La suppression d'une cave ne marche pas, sans message d'erreur. »** Les journaux de l'API le
racontent à la seconde près, le 26 septembre entre 15:53:13 et 15:53:42 UTC. Un membre B ouvre
`/cave` : la liste rend **deux** caves (`content-range 0-1/*`), la sienne et celle d'un membre A.
B ouvre celle de A : une ligne, zéro lot, zéro relevé. B clique « Supprimer cette cave » :
`DELETE /rest/v1/humidors?id=eq.… → 204`. Retour à la liste : deux caves. Le `204` est vrai —
PostgREST a exécuté la requête — et la suppression n'a rien supprimé : `humidors_delete_own`
refuse la ligne d'autrui, et **une policy qui refuse ne lève pas**, elle rend zéro ligne.
`deleteHumidor()` ne lisait pas ce zéro et redirigeait comme après un succès. Rejoué sur la
chaîne complète des migrations : la même suppression, faite par le compte qui possède la cave,
rend une ligne et emporte lots, grand livre et relevés.

**Sur le compte d'un membre apparaît la cave qu'un autre a créée.** La 0010 a ajouté
`humidors_select_shown` — `user_id <> auth.uid() and shows_humidor(user_id)` — pour que « Montrer
ma cave » ouvre la ligne `humidors` à tout membre connecté. Or `lib/humidor/queries.ts` ne filtre
sur personne, par principe : « mes caves », c'était ce que rend `select * from humidors`. Le
fichier l'avait écrit d'avance — « le jour où `show_humidor` ouvre une cave à un tiers, ces
fonctions rendront celle de quelqu'un d'autre » — et `lib/CLAUDE.md` affirmait ensuite qu'elles
restaient « mes caves ». Elles ne l'étaient plus depuis le 23 août. Trois membres sur neuf ont la
clé cochée ; deux ont une cave ; chacun voyait celle de l'autre dans sa liste, dans le menu
« déplacer vers », et à son adresse avec le bouton de suppression, le formulaire d'hygrométrie et
l'import CSV.

**Le troisième fait est le plus grave, et aucun signalement ne l'avait vu.** Les policies
restrictives de la 0010 ne ferment que le `SELECT` des tables filles. Leurs policies d'écriture
disent `exists (select 1 from humidors h where h.id = humidor_id)` — donc « toute cave que je peux
lire », que `humidors_select_shown` venait d'élargir. Mesuré en local sur les 35 migrations, en
tant que B, sur la cave de A :

| Geste de B                                            | Résultat                             |
| ----------------------------------------------------- | ------------------------------------ |
| lister ses caves                                      | la cave de A y figure                |
| supprimer la cave de A                                | 0 ligne, aucune erreur               |
| écrire un relevé d'hygrométrie dans la cave de A      | **inséré**                           |
| ranger 99 cigares dans la cave de A, sans `RETURNING` | **inséré**                           |
| `delete from humidor_items` / `humidor_readings`, nus | **les lots et relevés de A partent** |
| déplacer un de ses lots vers la cave de A             | refusé — par chance                  |

L'insertion sans `RETURNING` n'est pas un cas d'école : c'est exactement ce que fait l'import CSV
(`.insert(rows)` sans `.select()`, que PostgREST envoie avec `RETURNING 1`), et le formulaire
d'import s'affichait sur la cave de A. Un `DELETE` dont aucune clause ne lit de colonne n'applique
**aucune** policy `SELECT`, restrictive comprise. Le déplacement n'est refusé que parce que sa clause
`WHERE` lit une colonne, ce qui rattache la policy restrictive à la nouvelle ligne — une protection
que personne n'a écrite.

La cause commune tient en une phrase : **les tables filles ne redisaient pas la propriété, elles
héritaient de la visibilité du parent**, et ouvrir le parent en lecture a ouvert les enfants en
écriture. La 0010 avait vu la moitié lecture du problème et l'avait refermée ; l'autre moitié est
restée ouverte trente-quatre jours.

Le porteur demande en même temps une fonction nouvelle : partager une cave avec un autre membre,
qui doit **accepter** pour qu'elle apparaisse chez lui, et pouvoir ensuite la **masquer**.

## Options

### D1 · Refermer la cave

**A — Filtrer `user_id` dans `lib/humidor/queries.ts`.** Referme les listes, pas les écritures, et
double une policy — la règle de l'ADR 0004 l'interdit parce qu'un filtre survit à la policy qu'il
double.

**B — Verrouiller les écritures des enfants, garder `humidors_select_shown`.** Referme les trous
d'écriture ; laisse la cave de A dans les listes de B, sauf à filtrer — l'option A à nouveau.

**C — Retirer `humidors_select_shown`, et poser un verrou restrictif `FOR ALL` sur les quatre
tables.** L'étagère du profil n'a jamais eu besoin de la policy : `shared_humidor_shelf()` est
`SECURITY DEFINER` et revérifie elle-même la clé et le blocage. Un verrou restrictif est AND-é avec
toutes les policies présentes **et futures** : une policy permissive ajoutée demain ne pourra plus
rouvrir une cave par la porte de côté, ni en lecture ni en écriture.

### D2 · Partager — par la RLS ou par une porte

**A — Une branche de policy pour le destinataire.** Une permissive sur `humidors` pour les partages
acceptés, et les verrous des enfants élargis à « propriétaire ou destinataire ». _Coûts :_ le cycle
`humidors ↔ humidor_shares` (la leçon `reviews ↔ review_shares`, à couper par une fonction) ; toute
requête « mes caves » devrait désormais filtrer `user_id` — le piège qui vient de produire ce
défaut ; et **une policy ne sait pas cacher une colonne** : le prix payé, le vendeur (un lieu
d'achat de tabac — §2), les notes, les codes de boîte et le grand livre (quand on a fumé quoi)
passeraient tous au destinataire.

**B — Une table d'invitations, et deux portes `SECURITY DEFINER` de la taille du geste.** La table
dit qui a été invité et ce qu'il a répondu ; le destinataire lit ce qu'on lui a proposé, puis le
contenu d'une cave acceptée — quels cigares, combien, depuis combien de jours — et rien d'autre.
C'est le geste de l'ADR 0007 D5 (l'étagère du profil), appliqué à une personne nommée.

### D3 · « Masquer »

**A — Masquer, c'est supprimer le partage.** Irréversible pour le destinataire : seul le
propriétaire peut réinviter.

**B — Un état du partage, qui n'appartient qu'au destinataire.** `hidden_at`, réversible ; et
« quitter » reste disponible comme suppression.

## Décision

**C, B et B.** Une cave n'est lue et écrite que par son propriétaire, par tout chemin qui passe par
la RLS ; la partager est une invitation qui ne produit rien tant qu'elle n'est pas acceptée, et ce
qui se lit ensuite passe par une porte qui ne rend que trois colonnes.

1. **La cave est refermée (0036 §1).** `humidors_select_shown` est retirée ; `humidors_owner_only`,
   `humidor_items_owner_only`, `humidor_events_owner_only` et `humidor_readings_owner_only` sont
   **restrictives et `FOR ALL`**, et chacune nomme `auth.uid()` au lieu d'hériter de la visibilité
   du parent. `lib/humidor/queries.ts` redevient vrai sans une ligne changée : « mes caves » est ce
   que rend `select * from humidors`.
2. **`public.humidor_shares`** porte `(humidor_id, recipient_id)`, `created_at`, `accepted_at` et
   `hidden_at`. Seul le propriétaire invite — jamais lui-même, jamais par-dessus un blocage — et
   l'invitation naît en attente : `accepted_at` et `hidden_at` sont hors du `GRANT INSERT`. Seul le
   destinataire répond : le `GRANT UPDATE` ne porte que ces deux colonnes, et sa policy n'a qu'une
   branche, la sienne. Chacun des deux peut mettre fin au partage.
3. **Le destinataire lit par deux portes.** `humidor_shares_received()` rend ce qu'on lui a
   proposé — le nom de la cave, qui la propose, où il en est ; la capacité et le nombre de cigares
   seulement une fois accepté. `shared_humidor_lots(uuid)` rend, pour une cave acceptée, le cigare,
   la quantité et l'âge en jours. Jamais le prix, le vendeur, le code de boîte, l'emplacement, les
   notes, le grand livre ni les relevés : l'auto-contrôle de la 0036 relit les colonnes de sortie.
   Un blocage, dans un sens ou dans l'autre, ferme les deux portes.
4. **Lecture seule en v1.** Le destinataire ne range, ne fume et ne relève rien dans la cave d'un
   autre : les verrous restrictifs le refusent quel que soit le chemin.
5. **Masquer est un choix du destinataire, et il le garde pour lui.** `hidden_at` est hors du
   `GRANT SELECT` de `authenticated` : le propriétaire voit « en attente » ou « acceptée », jamais
   « masquée ». Le destinataire le relit par sa porte. Masquer ne se fait que sur un partage
   accepté (CHECK), se défait d'un clic, et se distingue de « quitter », qui supprime.
6. **Une invitation se dit.** `notification_kind` gagne `humidor_share`, écrite par `tg_notify()`
   comme les quatre autres — sans quoi le destinataire devrait tomber sur l'invitation par hasard.

Et le défaut d'interface qui a rendu tout cela silencieux se corrige à part : `deleteHumidor()` lit
ce que la suppression a rendu, et dit « refusée » plutôt que de rediriger comme après un succès.

## Conséquences

- **« Montrer ma cave » continue de faire ce qu'il promet**, sur le profil, par
  `shared_humidor_shelf()`. Il n'ouvre plus la ligne `humidors`, et la promesse du réglage — « sans
  lui, votre cave est illisible d'un tiers, par n'importe quel chemin » — devient enfin exacte : le
  seul chemin est la fonction, qui lit la clé. _(Le lendemain, la D7 borne ce chemin aux
  destinataires d'un partage, et le partage devient un second chemin, qui ne lit pas la clé : la
  promesse du réglage a été réécrite en conséquence.)_
- **Le destinataire ne voit aucune valeur**, puisqu'il ne voit aucun prix : ni « valeur du stock »,
  ni prix par lot. L'âge en jours dérive de la date d'achat quand la date de vieillissement manque ;
  c'est la donnée que le §5.5 veut afficher, et le propriétaire a choisi la personne.
- **Supprimer une cave emporte ses partages** (`on delete cascade`), supprimer un compte emporte
  ceux qu'il a donnés et reçus. Les deux côtés entrent dans l'inventaire RGPD — sauf `hidden_at`
  dans l'export du propriétaire, qui est la donnée du destinataire.
- **La RLS de la cave ne dépend plus d'aucune autre table** que `humidors` pour dire « à moi » :
  les verrous nomment `auth.uid()`. Une porte de lecture nouvelle — pour un club, un ménage — sera
  une fonction de plus, jamais une policy permissive, parce que les verrous l'annuleraient.
- **Le parcours de B sur la cave de A n'existe plus** : elle n'est dans aucune de ses listes, et son
  adresse rend 404.

## Quand rouvrir

Le jour où un destinataire demande à **écrire** dans une cave partagée — la cave d'un ménage, d'un
club. La D4 se rouvre alors avec deux questions qui ne se tranchent pas en passant : un rôle porté
par le partage, et **dans quel carnet s'écrit l'entrée** quand on fume le cigare d'un autre.

## Questions tranchées — 27 septembre 2026

Les deux questions étaient posées ainsi :

1. **Un destinataire doit-il pouvoir écrire ?** Lecture seule par défaut, parce que fumer depuis une
   cave écrit une entrée de carnet au nom du fumeur et décompte le stock d'un autre.
2. **« Montrer ma cave » doit-il survivre au partage ?** Le réglage est facultatif, coché par trois
   membres, et ne montre qu'une projection sur le profil. Si « strictement personnelle » veut aussi
   dire « pas même sur mon profil », le retirer est une migration d'une page — la fonction, la clé
   et son écran.

**Arbitrage du porteur** : « Oui il peut juste consulter la cave » ; « Oui on garde la case montrer
la cave (mais uniquement à quelqu'un à qui on l'a partagé) ».

**La première confirme la D4** : lecture seule, et rien ne change dans le code. La section « Quand
rouvrir » reste le déclencheur.

**La seconde devient une septième décision.**

7. **« Montrer ma cave » ne s'adresse qu'aux personnes à qui une cave est partagée (0038).**
   `shared_humidor_shelf(owner)` ne rend plus que les caves de ce propriétaire partagées avec
   l'appelant, **acceptées et non masquées**, tant que la case est cochée et qu'aucun blocage ne
   les sépare. Trois lectures de la phrase du porteur ont été tranchées en l'écrivant :

   - **Par cave, pas par personne.** Un destinataire lit sur le profil la cave qu'on lui a
     partagée, jamais les autres caves du même propriétaire : le partage se fait cave par cave
     (D2), et l'étagère ne peut pas ouvrir plus que lui. Lire « à quelqu'un à qui on l'a
     partagée » comme « à quiconque a reçu une de mes caves » aurait rouvert, pour chaque
     destinataire, toutes les autres — la fuite du 26 septembre, en plus petit.
   - **Masquée, elle quitte aussi le profil.** Masquer, c'est « ne plus l'avoir affichée » (D5) ;
     qu'elle revienne par la page de quelqu'un d'autre démentirait le geste. La réafficher la rend
     partout.
   - **La case ne reprend pas le partage.** Décochée, l'étagère est vide pour tout le monde, mais
     une cave acceptée reste lisible par sa porte, `shared_humidor_lots()`, qui ne lit pas la clé.
     Deux gestes, deux portes : retirer un partage se fait sur la cave, et une case de profil qui
     reprendrait sans le dire ce qu'on a donné nommément serait un second interrupteur caché.

   Le propriétaire n'étant le destinataire d'aucune de ses caves, son propre profil ne lit pas
   l'étagère : il dit à qui elle se montre. Le type de retour de la fonction ne change pas — même
   projection qu'en 0010, jamais le prix — et `25_cave_montree.sql` éprouve un tiers, un invité,
   un destinataire, le masquage, la case décochée, le blocage et le propriétaire ; il échoue sur la
   chaîne qui s'arrête à la 0037 (« un tiers sans partage lit 2 lot(s) »).
