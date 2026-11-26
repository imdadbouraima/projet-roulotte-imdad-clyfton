# La Roulotte — API du food truck

Backend du projet La Roulotte réalisé avec TypeScript, Express et Prisma.

Le projet utilise le kit fourni par le professeur (Vous). Le contrat API se trouve dans `la-roulotte-kit/contrat/openapi.yaml`.

## Où nous en sommes

La base technique est créée :

- serveur Express;
- TypeScript;
- Prisma avec SQLite;
- configuration avec des variables d'environnement;
- module d'authentification fourni;
- modèles des utilisateurs, catégories, allergènes, plats, commandes et lignes de commande;
- route `/health`;
- routes d'authentification;
- routes du menu;
- routes des commandes.

La migration du Palier 1 est configurée.

## Validation

Le Palier 1 a été vérifié avec :

- 11 tests Vitest locaux;
- `npm run typecheck`;
- la validation Prisma;
- la recette officielle du Palier 1;
- 37 tests sur 37 réussis.

## Répartition

- Clyfton : création et consultation des commandes.
- Imdad : menu, catégories, allergènes, plats et données initiales.

## Préparer le projet

Dans le dossier `backend` :

```bash
cd backend
npm install
cp .env.example .env
npx prisma migrate dev
npx prisma generate
npm run seed
```

## Lancer l'API

Dans un premier terminal :

```bash
cd backend
npm run seed
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

## Vérifier le Palier 1

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
npm run recette:1
```
