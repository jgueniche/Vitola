# 0010 — Un club est un groupe et un calendrier, pas un second fil ; une conversation a exactement deux personnes, et la plateforme peut la lire

- **Statut** : **Acceptée** le 23 août 2026
- **Date** : 2026-08-23
- **Décideur** : @jgueniche
- **Concerne** : P3 (social, F7) · P5 (lieux) · P8 (modération) · `public.clubs` ·
  `public.club_members` · `public.events` · `public.event_attendees` ·
  `public.conversations` · `public.messages`

## Contexte

L'ADR 0007 a livré le fil et laissé de côté les trois dernières tables du §5.6 — clubs, événements,
messagerie — en posant la question ouverte : sont-elles attendues en v1 ? **Elles le sont**,
arbitrage du 23 août 2026. Ce document les tranche avant le SQL, comme les précédentes, et la
messagerie est la raison pour laquelle il ne pouvait pas être écrit en passant.

Cinq faits cadrent ce qui suit.

**1. `public.review_visibility` est partagé entre `reviews` et `posts`**, et l'ADR 0007 en a fait
une force : les deux portées sont directement comparables, ce qui rend écrivable la contrainte
« une publication n'est jamais plus visible que l'entrée qu'elle pointe ». Y ajouter une valeur
`club` coûterait **deux migrations** — `ALTER TYPE … ADD VALUE` s'exécute dans une transaction mais
la valeur n'y est utilisable par rien, ni policy, ni index partiel, ni `CHECK`. C'est la leçon
mesurée de l'ADR 0004, et elle décide plus qu'on ne croit.

**2. `posts.venue_id` n'existe pas** et n'existera qu'en P5. Un événement se tient quelque part ;
en v1, ce quelque part n'a pas de table.

**3. L'ADR 0004 avait nommé le club d'avance**, dans son seuil de réouverture n° 2 : « la médiane
des destinataires par entrée `shared` dépasse 8 → le bon modèle devient alors le club de P3 ».
`reviews` est vide, donc le seuil n'est pas atteint, mais la phrase dit ce qu'un club est censé
remplacer : un partage nommé qui a grossi.

**4. Une conversation privée porte potentiellement de la donnée de l'art. 9**, comme le carnet.
Contrairement au carnet, elle en porte **celle de deux personnes à la fois**, et une seule d'entre
elles décide de l'écrire.

**5. Le DSA nous oblige sur le contenu privé aussi.** Un message signalé par son destinataire doit
pouvoir être examiné. Cela veut dire que la plateforme peut lire un message — et qu'il faut le dire
dans la politique de confidentialité plutôt que de laisser croire le contraire.

## Options

### D1 · Un club a-t-il un fil ?

**A — Oui, et `posts` gagne une portée `club`.** Le fil du club est le fil, filtré.
*Coût :* deux migrations pour la valeur d'enum (fait 1), et surtout la fin de la comparabilité des
portées : `posts.visibility = reviews.visibility` cesse d'avoir un sens quand l'une des deux valeurs
n'existe que d'un côté. Le trigger de cascade de l'ADR 0007 devient une expression à cas.

**B — Oui, et `posts` gagne un `club_id` nullable dont l'audience dérive.** Pas d'enum touché.
*Coût :* `posts.visibility` cesse de dire la vérité sur une ligne : une publication de club marquée
`followers` serait lisible de ses abonnés **et** du club, ou de l'un des deux, et aucun `CHECK` ne
peut exprimer « cette colonne est ignorée ». La colonne qui décide de l'audience aurait deux sens
selon une autre colonne — exactement ce que `kind` évite dans `reviews`.

**C — Non. Un club est un groupe et un calendrier.** Une description, des membres, des événements.
*Coût :* un club sans conversation ressemble à une liste. Quelqu'un voudra y publier.

### D2 · On rejoint un club librement, ou sur demande ?

Même question que l'abonnement de l'ADR 0007, et la même réponse s'y applique ou pas.

**A — Libre**, avec retrait par le propriétaire. Cohérent avec D1 de l'ADR 0007.
**B — Sur demande**, avec une file. Une demi-phase, et le même argument contre : une adhésion
approuvée en janvier ne se redemande pas en juin.

### D3 · Un événement appartient-il à un club ?

**A — Toujours.** Pas d'événement hors club.
*Coût :* annoncer une dégustation ouverte demande de créer un club pour une soirée.

**B — Facultativement.** `events.club_id` nullable.
*Coût :* deux chemins de lecture — les événements d'un club, et les événements tout court.

### D4 · Combien de personnes dans une conversation ?

**A — N participants**, avec une table de jonction. Le §5.6 l'écrit ainsi (`conversations`,
`messages`).
*Coût :* aucune contrainte de base ne sait exprimer « au moins deux » ni « exactement deux » sur une
table de jonction. Toute la sémantique — qui peut ajouter quelqu'un, ce que voit un arrivant des
messages d'avant, ce qui se passe quand il ne reste qu'une personne — devient du code, et chacune
de ces questions est un choix sur de la donnée art. 9.

**B — Exactement deux, en colonnes.** `conversations(member_a, member_b)` avec `member_a < member_b`
et un index unique sur la paire.
*Coût :* pas de conversation de groupe. Quelqu'un la voudra, et le club serait l'endroit — mais D1
vient de dire que le club n'a pas de fil.

### D5 · Qui peut écrire à qui ?

**A — N'importe qui à n'importe qui.** C'est la porte ouverte au démarchage, sur un site dont les
membres publient ce qu'ils fument.
**B — Seulement entre personnes liées par un abonnement**, dans un sens ou dans l'autre. Le graphe
d'abonnement devient le signal de consentement.
**C — Sur demande d'abord** — une invitation à converser, acceptée ou non. Une file de plus.

## Décision

**D1 : option C. Un club est un groupe et un calendrier, jamais un second fil.**

Ce qui l'emporte n'est pas le coût de la migration, c'est le fait 1 pris au sérieux : la valeur de
`posts.visibility` doit continuer de vouloir dire une seule chose. Un club en v1 porte un nom, une
description, des membres et **ses événements** — ce qui est exactement ce que le §1 promet
(« je retrouve des amateurs de mon niveau ») et ce que la monétisation « Cercle » suppose.

Ce que cela laisse dehors est nommé et non oublié : **il n'y a pas de fil de club**, et la
réouverture a un seuil, plus bas.

**D2 : libre, avec retrait par le propriétaire.** La même décision que l'abonnement, pour la même
raison — un contrôle a priori que le temps défait vaut moins qu'un contrôle qui reste exerçable — et
la cohérence a ici une valeur propre : deux mécanismes d'adhésion différents dans un même produit
sont deux choses à expliquer.

**D3 : option B, `events.club_id` nullable.** Un club sans événement est une liste, un événement
sans club est une invitation, et les deux existent dans la vraie vie.

`events.venue_id` **n'est pas créée**. P5 apporte les lieux ; d'ici là un événement porte un
`location_text` libre, qui est ce que les gens taperaient de toute façon et qui se migrera en une
requête le jour venu. Créer une colonne que rien ne remplit et qu'aucune policy ne lit est ce que
l'ADR 0007 a déjà refusé pour `posts.venue_id`.

**D4 : option B, exactement deux personnes, en colonnes.**

La raison est le fait 4. Chacune des questions que l'option A rend nécessaires — qui ajoute, que
voit un arrivant, que devient une conversation à une personne — est une décision sur de la donnée
que le §2 range possiblement à l'art. 9, et aucune ne se tranche en écrivant une table de jonction.
Deux colonnes ordonnées (`member_a < member_b`) et un index unique donnent une paire canonique :
« la conversation entre X et Y » est une lecture, pas une recherche, et il ne peut pas y en avoir
deux.

**D5 : option B. On écrit à quelqu'un qu'on suit, ou qui nous suit.**

Le graphe d'abonnement existe, il est déjà le signal d'audience du carnet, et s'en servir comme
signal de consentement ne coûte rien de plus. Ce n'est pas une protection forte — l'abonnement est
libre, donc quelqu'un peut s'abonner puis écrire — mais c'est un geste de plus, traçable, et qui se
défait : retirer un abonné referme le canal pour l'avenir. Le blocage, lui, le referme entièrement
et dans les deux sens.

**Et une décision qui n'était dans aucune option, parce qu'elle ne se choisit pas :
un message n'est pas chiffré de bout en bout, et la plateforme peut le lire.**

Le fait 5 l'impose : un message signalé doit pouvoir être examiné. Le dire est la seule position
tenable — une messagerie qui laisse croire à une confidentialité qu'elle n'offre pas est pire qu'une
messagerie franche. La politique de confidentialité gagne donc un paragraphe, et `mod.reports`
gagne `public.messages` dans sa liste de cibles.

## Conséquences

**Ce que nous acceptons, y compris désagréable.**

- **Il n'y a pas de conversation de groupe**, et le club n'en tient pas lieu. Trois personnes qui
  veulent parler ensemble ouvrent trois conversations. C'est mauvais, c'est assumé, et le seuil de
  réouverture est plus bas.
- **Un club est ouvert et sa liste de membres est publique.** Appartenir à « Les amateurs de
  maduro » se voit. C'est peu sensible en soi, et c'est ce qui rend un club trouvable ; un club
  privé demanderait la file d'adhésion que D2 refuse.
- **Supprimer un message le retire pour les deux.** Pas de suppression « de son côté » : une
  suppression qui ne retire rien chez l'autre est un bouton qui ment. Ce qui a été lu a été lu, et
  la même phrase que pour `review_shares` s'applique.
- **Effacer son compte ampute les conversations de l'autre.** Les messages partent en cascade, donc
  la moitié d'un échange disparaît chez quelqu'un qui n'a rien demandé. C'est le bon arbitrage —
  l'art. 17 prime — et il doit être écrit dans la politique plutôt que découvert.
- **La plateforme peut lire un message.** Non chiffré de bout en bout, examinable sur signalement.
- **Un événement n'a pas de lieu structuré avant P5.** Une chaîne de caractères, donc pas de carte,
  pas de rayon, pas de tri par distance.

**Ce que cela interdit désormais.**

- **Ajouter une valeur à `review_visibility`** sans accepter deux migrations et sans rouvrir la
  comparabilité que l'ADR 0007 D2 établit.
- **Publier dans un club.** Il n'y a pas de table pour cela, et `posts.club_id` n'existe pas.
- **Écrire à un inconnu.** La policy `INSERT` de `conversations` exige un lien d'abonnement dans un
  sens ou dans l'autre, et l'absence de blocage.
- **Une conversation à trois.** La clé unique sur la paire l'interdit structurellement.
- **Un compteur de messages non lus tenu par un delta.** Comme partout ailleurs : une somme, jamais
  une incrémentation.

**Index prévus** :

| Index | Sert |
|---|---|
| `club_members (club_id, user_id)` unique | L'appartenance, et la policy de lecture du club |
| `club_members (user_id)` | « Mes clubs » |
| `events (starts_at) where starts_at >= current_date` — non partiel, voir plus bas | L'agenda |
| `events (club_id, starts_at)` | Les événements d'un club |
| `event_attendees (event_id, user_id)` unique | La présence, et son compteur |
| `conversations (member_a, member_b)` unique | La paire canonique |
| `messages (conversation_id, created_at desc, id desc)` | Le fil d'une conversation, en keyset |

Le partiel sur `events` est écrit ici puis retiré à l'écriture : un index partiel dont le prédicat
appelle `current_date` n'est pas immuable, et PostgreSQL le refuse. C'est le même piège que le
`CHECK` des 18 ans, consigné dans `supabase/CLAUDE.md`.

## Quand rouvrir

1. **Plus de trois conversations distinctes entre les mêmes trois personnes en un mois.** Le besoin
   de groupe est alors démontré plutôt que supposé, et il se sert par un fil de club — donc D1 et D4
   se rouvrent ensemble, pas séparément.
2. **La médiane des membres par club dépasse 30**, ou un club dépasse 200 membres. Une liste cesse
   d'être une liste, et l'absence de fil devient une gêne réelle plutôt qu'une simplification.
3. **Un club demandé fermé plus d'une fois sur cinq à la création.** D2 redevient la file d'adhésion.
4. **Un signalement de message par mois.** Le passage par `file_report()` suffit à un par mois ; au
   delà, il faut l'écran de P8 et une politique de rétention explicite.
5. **P5 livre les lieux.** `events.venue_id` arrive, et `location_text` devient un repli.

## Question ouverte

**Combien de temps garde-t-on un message ?**

Aucune limite n'est posée ici : un message vit tant que ses deux auteurs ont un compte. C'est le
comportement attendu d'une messagerie et c'est aussi le plus mauvais du point de vue de la
minimisation (art. 5.1.e), sur des données que le §2 range possiblement à l'art. 9.

Trois réponses tiennent :

- **Sans limite** (ce que cette ADR fait) : le comportement attendu, et une conversation de trois
  ans qu'on n'a jamais relue reste en base.
- **Purge automatique** au bout de douze ou vingt-quatre mois, annoncée. Défendable, et surprenante
  pour qui archive.
- **Purge à la demande, par conversation** : un bouton « effacer cette conversation » qui l'efface
  pour les deux, sans automatisme. C'est le compromis que je proposerais, et il coûte une policy et
  un bouton — mais il fait effacer chez quelqu'un d'autre, ce qui est exactement ce que D4 essaie
  d'éviter de décider seul.

Rien ne se bloque sur la réponse : les trois s'écrivent au-dessus du même schéma.
