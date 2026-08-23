# 0013 — Le modérateur entre dans `mod` par des portes de la taille du geste, et la décision emporte son acte dans la même transaction

- **Statut** : **Acceptée** le 23 août 2026 — commande de session du 23 août (« avance sur ce que
  tu peux »), qui ouvre P8 sur ce document
- **Date** : 2026-08-23
- **Décideur** : @jgueniche
- **Concerne** : P8 (modération, F12) · `mod.reports` · `mod.moderation_actions` ·
  `public.comments` / `public.posts` / `public.post_comments` / `public.venue_reviews`
  (colonnes `hidden_*`) · Q12 · les obligations DSA avancées par l'ADR 0005

## Contexte

Le mécanisme de signalement est livré depuis P1 : `POST /api/signalements` écrit dans
`mod.reports` par `public.file_report()`, le délai de 72 h est publié dans les mentions légales,
et neuf surfaces sont signalables. Ce qui manque est consigné dans le `CLAUDE.md` racine depuis le
même jour : **personne ne peut relever la file**. P8 est la phase qui devait le corriger.

Cinq faits cadrent la décision.

**1. Le schéma `mod` n'est pas exposé à PostgREST, et c'est une décision, pas un oubli.** La 0004
le dit : c'est une seconde barrière derrière la RLS, sur les données les plus sensibles du produit
— qui a signalé qui, et ce qu'un modérateur en a fait. La 0006 en a tiré la règle qui gouverne
tout ce dossier : quand il faut malgré tout passer, on paie le privilège d'une fonction
`SECURITY DEFINER` **de la taille du geste** — `file_report()` pour écrire un signalement,
`moderation_records_for_subject()` pour l'export RGPD — jamais d'une réouverture du schéma.

**2. Les policies du modérateur existent déjà, et ne servent à rien tant qu'aucun grant ne les
atteint.** `reports_select_moderator`, `reports_update_moderator`,
`moderation_actions_select_moderator` sont dans la 0004 ; mais aucun rôle client n'a de droit de
table dans `mod`, et le schéma n'est pas joignable. La 0004 a anticipé l'écran de P8 sans lui
ouvrir de chemin — le chemin est exactement ce que cette ADR décide.

**3. Masquer est un acte à trois colonnes, sur quatre surfaces.** `comments`, `posts`,
`post_comments` et `venue_reviews` portent `hidden_at` / `hidden_by` / `hidden_reason`, les trois
ensemble ou aucune, hors de tout grant client — « y compris pour un modérateur connecté », dit le
commentaire de 0004. Les cinq autres surfaces signalables (`reviews`, `ref.cigars`, `profiles`,
`venues`, `messages`) n'ont pas de colonne de masquage : une décision peut les concerner, un acte
de masquage non.

**4. Le DSA demande une décision motivée et contestable, pas une disparition.** C'est la raison
d'être du masquage réversible (0004) : un DELETE ne sait pas dire pourquoi. Le journal de ce qui a
été fait est `mod.moderation_actions`, en ajout seul — « un historique qui peut se réécrire n'est
pas un historique ».

**5. L'enum `moderation_verb` a cinq valeurs, et deux d'entre elles n'ont aujourd'hui aucun bras.**
`hide` et `restore` ont leurs colonnes ; `warn` supposerait une notification que
`notification_kind` ne sait pas porter (et qu'aucun écran ne rend) ; `suspend` supposerait un
mécanisme de bannissement que rien ne porte non plus ; `delete` contredit le fait 4. Offrir un
verbe sans bras, c'est le registre de consentements à l'envers : un bouton qui fabrique un
enregistrement et pas un effet.

## Options

### D1 · Par où le modérateur lit-il la file, et écrit-il sa décision ?

- **A. Exposer `mod` à PostgREST** et accorder aux rôles clients les droits de table que les
  policies attendent. C'est défaire la décision de la 0004 pour servir un écran : la RLS
  redeviendrait la seule barrière sur « qui a signalé qui », et chaque erreur future de policy
  serait une fuite au lieu d'un refus.
- **B. La clé de service depuis `app/api`.** Elle n'a aucun droit de table dans `mod` — vérifié à
  nos dépens par l'export RGPD — et lui en accorder rouvrirait le schéma à tout le code serveur,
  pas à un geste.
- **C. Des fonctions `SECURITY DEFINER` dans `public`, une par geste, gardées par
  `has_min_role('moderator')` à l'intérieur.** Le motif exact de `file_report()` et de
  `moderation_records_for_subject()`, appliqué au troisième acteur qui devait entrer dans `mod` :
  après le signaleur et la personne concernée, le modérateur.

### D2 · La décision et son acte : une transaction ou deux ?

Trancher un signalement retenu, c'est trois écritures : le statut du rapport, la ligne de
`moderation_actions`, et le masquage sur la table cible. Les répartir entre un RPC (pour `mod`)
et un write PostgREST (pour la cible) fabrique l'état que le DSA interdit : un contenu masqué
sans trace motivée, ou une trace sans effet, selon lequel des deux appels échoue. L'ADR 0006 a
déjà tranché cette famille — un geste qui touche plusieurs tables est **une fonction**, donc une
transaction. Ici la fonction est `DEFINER` non pour acheter l'atomicité (elle serait gratuite)
mais parce que `mod` est injoignable autrement — la même exception que `file_report()`, pour la
même raison, et l'acte de masquage voyage dedans parce qu'il fait partie du même geste.

### D3 · Que voit le modérateur d'un signalement ?

Tout, sauf **l'identité du signaleur**. La policy `reports_select_moderator` rend la ligne
entière ; la porte peut être plus étroite que la policy, et elle l'est : un signalement se juge
sur ce qu'il vise et ce qu'il dit, jamais sur qui l'envoie — et un signaleur qui sait son nom
visible signale moins. L'asymétrie est voulue et dans l'autre sens pour la décision :
`decided_by` et `moderator_id` sont signés, parce qu'un acte de modération engage celui qui le
prend. Le contenu visé, lui, ne passe **pas** par la porte : l'écran le lit sous les droits de
l'appelant, par les policies modérateur que chaque surface porte déjà — la porte rend des lignes
de `mod`, la RLS continue de décider du reste.

### D4 · Quels verbes en v1 ?

`hide` et `restore`, plus la décision sans acte (retenue avec note, ou rejetée). `warn`,
`suspend` et `delete` restent dans l'enum et sont **refusés par la porte** avec un message qui
dit pourquoi — le fait 5. Un avertissement viendra quand `notifications` saura le porter ; une
suspension viendra avec l'ouverture des inscriptions, qui créera la population qu'elle concerne ;
`delete` ne viendra pas tant que le masquage motivé lui suffit.

## Décision

1. **Trois portes `SECURITY DEFINER` dans `public`, propriété de `postgres`, accordées à
   `authenticated` seul, gardées par `has_min_role('moderator')` en première ligne** :
   `mod_queue(p_scope, p_limit)` (la file — `open` : ouverts et en cours, du plus ancien au plus
   récent, l'ordre du délai ; `decided` : tranchés, du plus récent), `mod_report(p_id)` (une
   ligne), `mod_acknowledge(p_id)` (accusé de réception : `acknowledged_at`, statut `reviewing`).
   Aucune ne rend `reporter_id`.
2. **Une quatrième porte fait la décision entière : `mod_decide(p_report, p_decision, p_note,
   p_verb, p_act_reason)`.** Statut + horodatage + signature sur `mod.reports`, ligne d'acte dans
   `mod.moderation_actions` quand un verbe est donné, et masquage ou rétablissement sur la table
   cible — dans la même transaction. Elle refuse `hide`/`restore` sur une surface sans colonnes
   `hidden_*`, refuse `warn`/`suspend`/`delete` en v1, et exige une raison d'acte pour masquer
   (le CHECK des trois colonnes l'exigerait de toute façon — le message de la fonction est pour
   les humains).
3. **L'écran est `/moderation`** : la file avec l'âge de chaque signalement rapporté au délai
   publié (`dsa_report_sla_hours`), le détail avec l'aperçu du contenu visé lu sous les droits de
   l'appelant, et les formulaires de décision. Un `member` qui ouvre l'adresse voit pourquoi elle
   ne lui est pas ouverte, comme `/journal/ecrire` le fait pour les relecteurs. C'est la réponse
   d'écran de Q12.
4. **Le journal de la modération est `mod.moderation_actions` et rien d'autre.** `audit_log`
   continue de porter les gestes de conformité de compte (exports, effacements) ; deux journaux
   qui disent la même chose finissent par la dire différemment.

## Conséquences

- La 0018 n'accorde **aucun droit de table** dans `mod` et n'expose toujours pas le schéma : les
  quatre fonctions sont tout le chemin, et l'auto-contrôle le vérifie.
- Les policies modérateur de la 0004 sur `mod` restent en place : elles gardent le jour où une
  exposition serait décidée, et ne coûtent rien d'ici là.
- `hidden_by` porte l'`auth.uid()` du modérateur même sous `DEFINER` — les claims JWT survivent
  au changement de rôle d'exécution.
- Le masquage d'un avis de lieu retire sa note de la moyenne de la fiche sans autre geste : la
  policy de lecture publique de `venue_reviews` filtre déjà `hidden_at is null`.
- Un signalement tranché reste lisible par son auteur via `reports_select_own` (ses champs à lui),
  et entre dans son export RGPD via `moderation_records_for_subject()` — rien ne change pour lui.

## Quand rouvrir

- **`warn`** : quand `notification_kind` gagne une valeur de modération et qu'un écran la rend.
  Déclencheur : le premier signalement retenu où masquer est trop et ne rien dire pas assez.
- **`suspend`** : à l'ouverture des inscriptions (`public_signup_open`), avec l'arbitrage
  auth-ban contre colonne de schéma qui n'a pas à être pris avant.
- **L'exposition du schéma `mod`** : si un jour la file dépasse ce que des fonctions savent
  servir (recherche, tri multiple, pagination profonde). Dix fonctions `mod_*` seraient le signe.

## Question ouverte

**Qui modère ?** La porte est `has_min_role('moderator')` et il n'existe aujourd'hui aucun compte
`moderator` : `jeremy` (`admin`) passe, et personne d'autre. C'est le goulot déjà consigné pour
le wiki et les lieux, une surface de plus — et la promotion reste un `UPDATE` à la main tant
qu'aucun écran d'administration des rôles n'existe. Nommer quelqu'un, et décider si le délai de
72 h publié est tenable à un seul, est un arbitrage du porteur.
