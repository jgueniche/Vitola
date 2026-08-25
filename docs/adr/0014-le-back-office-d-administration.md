# 0014 — L'administration regroupe ce qui existe et n'ouvre qu'une porte : le drapeau devient un acte tracé

- **Statut** : **Acceptée** le 25 août 2026 — commande du porteur (« interface admin, tu peux la lancer quand tu veux »)
- **Date** : 2026-08-25
- **Décideur** : @jgueniche
- **Concerne** : transverse (hors §9) · `/admin` · `public.feature_flags` · `public.audit_log` ·
  `ref.cigars` (relecture) · `ref.lines` (gammes) · `public.profiles` (annuaire des comptes) ·
  ADR 0013 (le patron des portes)

## Contexte

Le porteur demande une interface d'administration. L'inventaire honnête d'abord, parce qu'il
décide du périmètre : **la moitié existe déjà**, chacune à sa place — la file de modération
(`/moderation`, 0018), la file de relecture wiki (`/contributions`), la publication des lieux
(`/lieux`), l'écriture du journal (`/journal/ecrire`), la promotion des rôles (panneau admin sur
le profil d'un membre, `/api/roles`). Ce qui n'existe **pas** passe aujourd'hui par du SQL à la
main : changer un drapeau, retrouver un compte non découvrable, suivre la relecture des 862
fiches publiées jamais relues, créer une gamme.

Cinq faits cadrent la décision.

**1. Presque tous les pouvoirs manquants sont déjà couverts par une policy.**
`profiles_select_directory` montre tous les profils à un `moderator`+ (y compris non
découvrables) ; `cigars_update_editor` couvre `status`, `verified_at`, `verified_by` — donc
dépublier, republier et marquer relue sont des écritures de session ordinaires ;
`lines_insert_editor` / `lines_update_editor` couvrent la naissance et la publication d'une
gamme (0019). Construire des portes pour cela serait payer un privilège que la RLS rend déjà.

**2. `feature_flags` est la seule exception.** La 0001 a décidé « Writes are service-role only :
a flag change is a deployment event, not a user action » — aucun grant d'écriture client. Or six
drapeaux gouvernent désormais des décisions d'exploitation (ouvrir l'inscription, resserrer les
commentaires, couper `/lieux`, afficher les prix, le délai DSA publié), et les changer demande un
`UPDATE` privilégié à la main. C'est cette position-là que cette ADR renverse — consciemment.

**3. `audit_log` ne s'écrit que par la clé de service**, et un changement de drapeau qui ne
laisse pas de trace est exactement l'état que la 0018 a refusé pour la modération : un acte sans
histoire. `dsa_report_sla_hours` est publié dans les mentions légales — le changer change un
engagement, sans déploiement.

**4. Le patron existe** : une fonction `SECURITY DEFINER` **de la taille du geste**, gardée par
`has_min_role()` à l'intérieur, qui écrit l'acte et sa trace dans la même transaction
(`mod_decide`, 0018). Et sa limite aussi : on ne paie ce privilège que quand aucune policy ne
peut faire le travail (0006, 0013).

**5. `warn`, `suspend`, `delete` restent sans bras** (ADR 0013, D4), chacun avec son déclencheur.
Une interface admin n'est pas une raison de les armer : `suspend` attend l'ouverture des
inscriptions, qui créera la population qu'il concerne.

## Options

### D1 · Où vivent les pouvoirs de l'écran ?

**A — Des portes `SECURITY DEFINER` pour tout**, sur le modèle de `mod_*`.
*Coût :* réécrire dans chaque fonction des vérifications que quatre policies font déjà, à un
endroit où plus rien ne les surveille. C'est l'option B de l'ADR 0006, généralisée.

**B — La session pour tout ce qu'une policy couvre, une porte pour le seul geste qu'aucune
policy ne peut faire.** Comptes, fiches et gammes s'écrivent et se lisent par la session de
l'admin, sous les policies existantes ; seul le drapeau passe par une porte, parce que
`feature_flags` n'a pas de grant d'écriture et `audit_log` pas de grant d'insertion — et que les
deux écritures doivent être une transaction.

### D2 · Que peut la porte des drapeaux ?

**A — Tout** : créer, modifier, supprimer des drapeaux, charge utile libre.
*Coût :* un drapeau créé à l'écran est un drapeau qu'aucun code ne lit — le registre de
consentements à l'envers. Et une charge utile libre peut casser ce qu'un écran lit
(`venues_enabled.types`, `comments_min_role.min_role`).

**B — Modifier seulement** : `enabled` sur toute clé existante, la charge utile bornée à ce que
l'écran sait éditer. Une clé inconnue est refusée avec sa raison.

### D3 · Qui entre, et par où ?

`/admin` exige `admin` ; un autre rôle lit pourquoi la page ne lui est pas ouverte (le patron de
`/moderation` et `/journal/ecrire` — jamais une page blanche). Pas d'entrée de navigation
globale : l'en-tête tourne sur toutes les pages et n'a pas à payer une lecture de rôle pour un
lien qu'un compte peut suivre — le lien vit sur `/parametres`, à côté de celui de la modération
(leçon de P8). Le rôle lu à l'écran décide **ce qui se rend**, jamais ce qui peut se produire :
chaque écriture repasse par une policy ou par la garde de la porte.

## Décision

**D1 : option B.** L'écran d'administration est un **regroupement**, pas un privilège : tableau
de bord, comptes, fiches et gammes travaillent sous les policies existantes, par la session. Une
seule porte naît : `public.admin_set_flag(p_key, p_enabled, p_payload)`.

**D2 : option B.** La porte est `SECURITY DEFINER`, propriété de `postgres`, accordée à
`authenticated` seul, gardée par `has_min_role('admin')` en première ligne (errcode `42501`).
Elle **refuse une clé inconnue**, écrit le drapeau **et** sa trace `audit_log` (`before_state` /
`after_state`) dans la même transaction, et rend l'état d'après. La charge utile est optionnelle
et remplace l'existante seulement quand elle est fournie ; l'écran ne sait l'éditer que là où une
forme est connue (`dsa_report_sla_hours.hours`, `comments_min_role.min_role`).

**D3 : comme énoncé.** Cinq écrans : `/admin` (tableau de bord — signalements ouverts contre le
délai publié, propositions wiki, lieux en attente, fiches non relues, comptes, et les liens vers
les files existantes), `/admin/drapeaux`, `/admin/comptes` (recherche, rôle, lien vers le profil
où vit déjà le panneau de promotion), `/admin/fiches` (la relecture : marquer relue, dépublier,
republier — le chemin qui résorbe les 862 et déclenchera l'ADR 0008), `/admin/gammes` (créer en
brouillon, publier, dépublier, supprimer — le bras d'éditeur que la 0019 annonçait).

**Et une policy de plus, pas une porte** : `lines_delete_admin` (avec son grant), parce qu'une
gamme créée par erreur ne doit pas demander un geste SQL pour disparaître. `ref.cigars` a déjà
son `cigars_delete_admin` ; les gammes rejoignent ce régime. La suppression d'une gamme publiée
laisse les fiches attachées intactes (`on delete set null`).

## Conséquences

**Ce que nous acceptons, y compris désagréable.**

- **La position de la 0001 sur les drapeaux est renversée** : un drapeau n'est plus un événement
  de déploiement, c'est un acte d'administration — tracé, signé, transactionnel. Le
  renversement est le prix d'une exploitation à un humain sans accès SQL.
- **Changer `dsa_report_sla_hours` change un engagement publié.** La porte ne l'interdit pas ;
  l'écran le dit en toutes lettres avant le geste. Interdire à l'admin de changer un délai qu'il
  publie serait faux ; le laisser le faire sans le prévenir aussi.
- **Marquer une fiche « relue » écrase `verified_at`.** L'horodatage de publication devient un
  horodatage de relecture, et `verified_by` est enfin ce que le comparateur attendait pour
  afficher « relue le » — c'est le sens que la colonne aurait toujours dû avoir.
- **Pas de suppression de compte, pas de suspension, pas d'édition de fiche dans `/admin`.**
  Supprimer un compte reste le geste RGPD de son titulaire ; suspendre attend son bras (0013,
  D4) ; corriger une fiche reste le wiki — l'admin relit, il ne réécrit pas sans trace.

**Ce que cela interdit désormais.**

- **Un `UPDATE` de `feature_flags` hors de la porte**, y compris par la clé de service dans du
  code nouveau : le chemin est la porte, parce qu'elle est le seul qui trace.
- **Créer un drapeau depuis l'écran.** Un drapeau naît dans une migration, avec le code qui le
  lit.
- **Une porte de plus sans relire la D1.** Le prochain besoin d'admin se pose d'abord la
  question « une policy existe-t-elle ? », et la réponse est presque toujours oui.

## Quand rouvrir

1. **`public_signup_open` passe à vrai** → `suspend` s'arme (0013), et `/admin/comptes` gagne le
   geste avec son ADR.
2. **Un deuxième compte au-dessus de `member` existe** → la question « qui promeut, sur quel
   critère » (fin de P1) se rouvre, avec l'écran qu'elle mérite.
3. **La relecture des 862 fiches est résorbée** → l'ADR 0008 se déclenche (proposer une fiche
   nouvelle).
4. **Un drapeau demande une charge utile que l'écran ne sait pas éditer** → la forme se déclare
   dans le registre des drapeaux, jamais en JSON libre à l'écran.

## Question ouverte

Aucune : le périmètre est celui de la commande, et les gestes exclus ont chacun leur déclencheur
documenté ci-dessus.
