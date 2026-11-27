# La Roulotte — API du food truck

Backend du projet La Roulotte réalisé avec TypeScript, Express et Prisma.

Le projet utilise le kit fourni par le professeur. Le contrat API se trouve dans `la-roulotte-kit/contrat/openapi.yaml`.

## État du projet

Le backend est organisé en modules et utilise TypeScript, Express, Prisma et SQLite. Il couvre les fonctionnalités des paliers 1 à 3, le paiement du Palier 4 et une de ses options complémentaires : les ETags. La seconde option complémentaire du Palier 4 n'est pas incluse. Les fonctionnalités sont détaillées ci-dessous.

## Architecture et choix de méthode

Les modules suivent le trajet d'une demande : **route → contrôleur → service → repository**. Les routes appliquent l'authentification et les rôles ; les contrôleurs valident les entrées avec Zod et préparent les réponses HTTP ; les services portent les règles métier ; les repositories effectuent les accès Prisma. Les services ne reçoivent pas `req` ou `res`, et Prisma n'est utilisé que dans les repositories (le seed reste un outil de préparation des données).

`backend/src/container.ts` assemble l'authentification, les services, les repositories, le bus d'événements et la passerelle de paiement. `createApp(container)` permet de remplacer ces dépendances dans les tests. `backend/src/db.ts` partage une seule instance de `PrismaClient`.

Les DTOs du menu et des commandes définissent les données visibles par le site ; ils évitent d'exposer directement les objets de la base. Les entrées sont validées avec des schémas Zod stricts, conformément au contrat. Le module `backend/src/fourni/auth/` est celui du kit et n'a pas été modifié.

Les choix de conception principaux sont :

- **Repositories** : ils encapsulent les accès Prisma et les écritures transactionnelles du stock, des commandes et des paiements.
- **Decorator de cache** : `backend/src/menu/cached-dish.repository.ts` enveloppe le repository Prisma du menu. Les modifications de plats invalident le cache ; les événements de commande l'invalident aussi lorsque le stock peut changer.
- **Observer** : `backend/src/orders/order.service.ts` publie les événements après l'enregistrement réussi ; `backend/src/realtime/event-bus.ts` les distribue aux abonnés SSE sans faire dépendre le service d'Express.
- **Adapter et Factory** : `backend/src/orders/payment.gateway.ts` adapte l'API HTTP du simulateur à l'interface utilisée par le service. Le container choisit cette implémentation pour l'application ; les tests peuvent injecter une passerelle factice.
- **Observabilité** : Pino écrit des logs JSON ; l'identifiant `X-Request-Id` est ajouté aux réponses et aux journaux, sans enregistrer le jeton d'authentification.

Le health check passe du contrôleur à son repository : il n'a pas de règle métier nécessitant un service dédié.

## Modèle de données

- Un **utilisateur** peut posséder plusieurs commandes.
- Un **plat** appartient à une catégorie et peut être associé à plusieurs allergènes.
- Une **commande** appartient à un utilisateur et contient des lignes `OrderItem`. Chaque ligne conserve le prix unitaire au moment de la commande, même si le prix du plat change ensuite.
- Les commandes portent un statut de traitement et, depuis le Palier 4, un statut de paiement. Le verrou interne d'un paiement n'est pas exposé dans les DTOs.

## Ce que permet le Palier 1

Le Palier 1 met en place le parcours de base pour commander à la Roulotte. Le client peut parcourir la carte, chercher un plat, choisir une catégorie ou filtrer selon les allergènes. Il crée ensuite un compte ou se connecte, compose son panier et envoie sa commande.

Une fois la commande envoyée, le serveur vérifie que les plats existent et sont disponibles. Il recalcule le prix à partir de la carte — le navigateur ne peut pas imposer son propre prix — puis enregistre la commande avec le statut **Reçue**. Le client peut ensuite retrouver ses propres commandes.

En arrière-plan, les comptes et les commandes sont enregistrés dans la base de données. Les mots de passe sont protégés, l'accès aux commandes dépend du rôle connecté et les informations envoyées à l'API sont vérifiées.

Ce premier palier pose donc les bases : la carte, les comptes et la création et la consultation des commandes. Les fonctions de cuisine, d'administration et de stock décrites dans la section suivante ont été ajoutées après la présentation orale.

## Ce que nous avons ajouté après la présentation orale

Ces ajouts correspondent au Palier 2. Ils permettent à la cuisine de traiter les commandes et à l'administration de gérer la carte.

### Suivi et traitement des commandes

Une commande n'est plus seulement enregistrée : l'équipe peut la suivre jusqu'à sa remise au client. Elle commence au statut **Reçue**, puis la cuisine la fait avancer dans l'ordre : **En préparation**, **Prête** et enfin **Remise au client**. Une étape ne peut pas être sautée : par exemple, une commande reçue ne peut pas passer directement à « Prête ».

La cuisine ou l'administration met à jour le statut avec `PATCH /orders/:id/status`. Le client, lui, peut annuler uniquement sa propre commande et seulement tant que la cuisine ne l'a pas commencée. Il ne peut ni modifier la commande d'un autre client, ni faire avancer lui-même sa commande. Le serveur vérifie ces règles à chaque demande ; si une transition n'est pas permise, il la refuse.

### Gestion des plats

L'administration peut ajouter un plat avec `POST /dishes`, corriger ses informations avec `PATCH /dishes/:id` ou le retirer avec `DELETE /dishes/:id`. Ces actions sont réservées au rôle ADMIN. Le serveur vérifie les informations reçues, notamment le prix, la catégorie et les allergènes. Si le plat a déjà été commandé, il ne peut pas être supprimé afin de préserver l'historique des commandes ; l'administration peut plutôt le marquer comme indisponible.

### Gestion du stock

Certains plats sont disponibles en quantité limitée. Par exemple, le seed fournit 8 brownies : si une commande en contient 3, il en reste 5. Si cette commande est annulée, les 3 portions sont remises en stock.

Les plats dont le stock vaut `null` n'ont pas de limite de portions, comme les frites dans les données de démonstration. Si un client demande plus de portions qu'il n'en reste, sa commande est refusée. Le stock des autres plats de cette commande ne bouge pas non plus : la commande est traitée entièrement ou pas du tout.

### Où se trouvent les DTO ?

Un DTO (« Data Transfer Object ») est la forme propre et limitée des données que l'API renvoie au site. Il évite d'envoyer directement les objets internes de la base de données. Par exemple, le DTO d'un plat contient son nom, son prix, sa catégorie, ses allergènes et son stock ; celui d'une commande contient son statut, son client, ses plats et les montants calculés.

Chaque DTO reste dans le module auquel il appartient, près du contrôleur qui l'utilise : `backend/src/menu/dish.dto.ts` prépare les réponses des plats, et `backend/src/orders/order.dto.ts` celles des commandes. Le contrôleur s'en sert avant d'envoyer la réponse au front, ce qui aide à garder le format prévu par le contrat API.

### Migration et données de démonstration

La migration du Palier 2 ajoute le champ de stock sans effacer les plats existants. Pour les plats déjà présents, `stock` vaut `null` (stock illimité). Le seed charge les stocks d'exemple définis dans `la-roulotte-kit/donnees/menu.json`. Attention : relancer `npm run seed` repart de données propres et efface les données actuellement enregistrées.

### Palier 3 : photos et suivi en direct

Quand une nouvelle commande arrive, la cuisine et l'administration reçoivent un événement `order.created`. Les changements de statut sont diffusés sous `order.updated` à la cuisine, à l'administration et au client concerné. Un client ne reçoit donc pas les mises à jour des commandes des autres. Le flux `GET /events` est réservé aux personnes connectées et reste ouvert ; un petit signal périodique maintient la connexion. En cas de coupure, le site peut reprendre son actualisation habituelle.

L'administration peut envoyer une photo avec `PUT /dishes/:id/image`. L'API accepte les fichiers PNG, JPEG et WebP jusqu'à 2 Mo, vérifie leur contenu réel et remplace l'ancienne photo. Elle enregistre ensuite une adresse `imageUrl` sur le plat, par exemple `/uploads/dishes/<identifiant>.webp`. Un plat sans photo a `imageUrl: null`. Les fichiers sont enregistrés dans `backend/uploads/dishes/` et servis par l'API avec les en-têtes nécessaires pour être affichés depuis le site. La migration du Palier 3 ajoute le champ `imageUrl` sans effacer les plats existants.

#### Comment l'envoi d'une photo est organisé

Le traitement suit les rôles habituels du backend, plutôt que de tout faire dans le contrôleur :

1. La route vérifie que la personne est connectée et qu'elle a le rôle ADMIN. Le middleware de réception limite aussi le fichier à 2 Mo.
2. Le contrôleur vérifie l'identifiant du plat et la présence du fichier, puis transmet les données de l'image au service. Il prépare ensuite la réponse destinée au site.
3. Le service vérifie que le contenu correspond bien à une image PNG, JPEG ou WebP, puis s'assure que le plat existe. Il coordonne le remplacement de la photo : le fichier est enregistré, son adresse est sauvegardée sur le plat, puis l'ancienne photo est supprimée.
4. Le repository se charge de mettre à jour le plat dans la base. Le module de stockage s'occupe des fichiers sur le disque, et le DTO prépare la forme de la réponse envoyée au site.

Cet ordre évite de supprimer l'ancienne photo avant que la nouvelle soit enregistrée. Si la mise à jour en base échoue après la création du nouveau fichier, le service tente de supprimer ce fichier pour ne pas laisser une photo inutilisée. Le contrat de l'API et la réponse reçue par le site restent les mêmes ; le changement concerne surtout la répartition du travail entre les couches.

`GET /health` vérifie maintenant que l'API peut joindre la base : la réponse indique `database: "up"` si tout va bien et renvoie le statut 503 si la base est indisponible. Chaque réponse porte aussi un `X-Request-Id`, repris dans les journaux du serveur pour retrouver plus facilement une requête en cas de problème.

Le repository décoré met en cache les listes de plats. Les modifications administratives invalident ce cache immédiatement ; les commandes le font aussi après toute écriture susceptible de changer le stock.

### Palier 4 : paiement avec le simulateur

Le Palier 4 ajoute le paiement d'une commande avec le faux prestataire fourni dans `la-roulotte-kit/pay-sim`. Il sert à tester le parcours sans traiter de vrai paiement ni de vraie carte bancaire. Une commande commence avec `paymentStatus: "UNPAID"` ; après un paiement accepté, le serveur l'enregistre comme `PAID`. La migration ajoute ce statut aux commandes déjà présentes, en les laissant impayées. Un indicateur interne empêche deux paiements simultanés pour la même commande ; il n'est pas envoyé au site.

Depuis le détail d'une commande, son client peut choisir un jeton de test puis demander le paiement avec `POST /orders/:id/payment`. Le serveur vérifie que la personne connectée est bien propriétaire de cette commande, qu'elle n'a pas déjà été payée et qu'elle n'a pas été annulée. La cuisine et l'administration ne peuvent pas payer à la place du client. Le montant est repris du total enregistré en base, jamais du navigateur.

Le backend appelle le simulateur avec le montant en centimes, la devise `EUR`, la référence `order-<id>` et le jeton fourni. Les réglages sont dans le fichier local `backend/.env` : `PAYMENT_URL` indique l'adresse du simulateur et `PAYMENT_API_KEY` sa clé. Les valeurs d'exemple dans `backend/.env.example` sont destinées au simulateur fourni ; une vraie clé ne doit pas être ajoutée au dépôt. Si tu as déjà créé ton fichier `.env`, ajoute-y ces deux réglages :

```env
PAYMENT_URL="http://localhost:4010"
PAYMENT_API_KEY="sk_test_roulotte"
```

Chaque tentative est limitée à 2 secondes, avec au plus 3 tentatives. Le serveur réessaie après une erreur réseau, un délai dépassé ou une réponse 5xx, en attendant 100 ms puis 200 ms entre les tentatives. La même `Idempotency-Key` est utilisée pour tous les essais d'un paiement : si le prestataire a reçu le premier appel mais que sa réponse s'est perdue, un nouvel essai ne crée pas un second paiement. Un refus 402 n'est pas réessayé et laisse la commande impayée, ce qui permet au client de choisir un autre jeton. La réponse du prestataire est validée avant que le paiement soit considéré comme accepté.

Si le prestataire reste en panne, l'API renvoie `502 PAYMENT_PROVIDER_ERROR` ; s'il dépasse les délais, elle renvoie `504 PAYMENT_PROVIDER_TIMEOUT`. Un paiement refusé donne `402 PAYMENT_DECLINED`. Une commande déjà payée ou annulée renvoie `409 CONFLICT`, un autre client reçoit `404 NOT_FOUND`, et un membre du personnel reçoit `403 FORBIDDEN`. Une fois le paiement accepté et enregistré, l'API renvoie la commande mise à jour et diffuse `order.updated` aux abonnés autorisés.

### Option complémentaire retenue au Palier 4

Le **cache HTTP** utilise les ETags d'Express sur `GET /dishes`. Si le contenu n'a pas changé, le serveur répond `304 Not Modified` sans renvoyer à nouveau la représentation. Un test HTTP vérifie ce comportement. C'est la seule option complémentaire du Palier 4 incluse dans le projet.

## Limites connues

- Le paiement est un parcours de démonstration avec le simulateur fourni ; aucune carte ni transaction réelle n'est traitée.
- Les photos sont stockées sur le disque local et le bus SSE ainsi que le cache sont en mémoire. Pour plusieurs instances d'API, il faudrait un stockage de fichiers partagé et un bus partagé.
- Le tag Git `palier-4` reste à créer et à pousser après le commit de la version finale.

## Validation

Les paliers 1 à 4 ont été vérifiés avec :

- 28 tests Vitest locaux, sans utilisation de la base de développement.
- `npm run typecheck`;
- `npx prisma validate`;
- la recette officielle `recette:4` : 71 tests réussis, avec le simulateur de paiement.

## Répartition

- Clyfton : création et consultation des commandes.
- Imdad : menu, catégories, allergènes, plats et données initiales.

## Préparer et lancer le projet

Pour une base locale neuve, ces cinq commandes installent, configurent, initialisent les données de démonstration et démarrent l'API :

```bash
cd backend
npm ci
cp .env.example .env
npm run db:setup
npm run dev
```

`npm run db:setup` crée le client Prisma, applique les migrations et charge le seed. Le seed efface les données déjà présentes : ne relance pas cette commande sur une base à conserver.

Pour une base existante, démarre simplement l'API :

```bash
cd backend
npm run dev
```

L'API fonctionne sur `http://localhost:3000`.

## Lancer le site

Dans un deuxième terminal :

```bash
cd la-roulotte-kit
npm install
npm run front
```

Le site fonctionne sur `http://localhost:5173`.

## Comptes de démonstration

| Rôle | Email | Mot de passe |
|---|---|---|
| ADMIN | admin@roulotte.test | Admin123! |
| STAFF | cuisine@roulotte.test | Cuisine123! |
| CUSTOMER | client@roulotte.test | Client123! |

## Pour vérifier les paliers 1 à 4

Dans `backend` :

```bash
npm test
npm run typecheck
npx prisma validate
npx prisma migrate status
```

Avec l'API démarrée, dans `la-roulotte-kit` :

```bash
cd la-roulotte-kit
npm run recette:4
```
