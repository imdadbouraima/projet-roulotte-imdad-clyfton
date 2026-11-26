# La Roulotte — API du food truck

Projet de Clyfton et Imdad : l'API de click & collect du food truck La Roulotte.

## Ce qu'on a fait jusqu'ici

- Un dépôt GitHub partagé pour nous deux.
- Le kit du prof (front, recette, contrat) gardé à part et ignoré par Git : on n'y touche pas.
- Un `.gitignore` qui écarte le kit, `node_modules`, `.env` et la base de données.
- Notre API rangée dans le dossier `backend`, avec son `package.json` et les bibliothèques demandées par le sujet.
- Le module de connexion et le menu du prof copiés dans `backend`, sans les modifier.
- La base de données avec Prisma (SQLite) : utilisateurs, plats, catégories, allergènes, commandes.
- L'API démarre, avec ces routes :
  - `GET /health`
  - `/auth` : inscription, connexion, profil (module du prof)
  - `GET /categories`, `GET /allergens`
  - `GET /dishes` (filtres, recherche, pagination) et `GET /dishes/:id`

## Lancer

```bash
cd backend
npm install
cp .env.example .env
npm run db:migrate
npm run dev
```

## Prochaines étapes

- Remplir la base avec le menu (`npm run seed`)
- Ajouter, modifier et supprimer des plats
- Les commandes
- Le paiement
- Le suivi en direct (`/events`)
