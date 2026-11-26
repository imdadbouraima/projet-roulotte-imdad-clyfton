
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { prisma } from "../src/db.js";
import { hashPassword } from "../src/fourni/auth/index.js";
import { Role } from "../src/generated/prisma/client.js";

async function main() {
  // 1. Lire le fichier menu.json
  const menuPath = fileURLToPath(
    new URL("../donnees/menu.json", import.meta.url)
  );

  const contenu = readFileSync(menuPath, "utf-8");
  const data = JSON.parse(contenu);

  // 2. Créer les catégories
  for (const category of data.categories) {
    await prisma.category.create({
      data: {
        name: category.name,
        position: category.position,
      },
    });
  }

  // 3. Créer les allergènes
  for (const allergen of data.allergens) {
    await prisma.allergen.create({
      data: {
        code: allergen.code,
        label: allergen.label,
      },
    });
  }

  // 4. Créer les plats et les relier aux catégories et allergènes
  for (const dish of data.dishes) {
    await prisma.dish.create({
      data: {
        name: dish.name,
        description: dish.description,
        priceCents: dish.priceCents,
        available: dish.available,

        category: {
          connect: {
            name: dish.category,
          },
        },

        allergens: {
          connect: dish.allergens.map((code: string) => ({
            code: code,
          })),
        },
      },
    });
  }

  // 5. Créer les utilisateurs
  for (const user of data.users) {
    const passwordHash = await hashPassword(user.password);

    await prisma.user.create({
      data: {
        email: user.email,
        name: user.name,
        passwordHash,
        role: user.role as Role,
      },
    });
  }

  console.log("Seed terminé avec succès !");
}

// 6. Exécuter le seed et gérer les erreurs
main()
  .catch((error) => {
    console.error("Erreur pendant le seed :", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
