
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { prisma } from "../src/db.js";
import { hashPassword } from "../src/fourni/auth/index.js";
import { Role } from "../src/generated/prisma/client.js";

async function main() {
  // Le seed repart d'une base propre : il efface les données actuelles avant de les recréer.
  await prisma.$transaction(async (tx) => {
    await tx.orderItem.deleteMany();
    await tx.order.deleteMany();
    await tx.dish.deleteMany();
    await tx.allergen.deleteMany();
    await tx.category.deleteMany();
    await tx.user.deleteMany();
  });

  // Le menu et les comptes de démonstration sont décrits dans ce fichier JSON.
  const menuPath = fileURLToPath(
    new URL("../donnees/menu.json", import.meta.url)
  );

  const contenu = readFileSync(menuPath, "utf-8");
  const data = JSON.parse(contenu);

  // Créer d'abord les catégories, car les plats doivent y être rattachés.
  for (const category of data.categories) {
    await prisma.category.create({
      data: {
        name: category.name,
        position: category.position,
      },
    });
  }

  // Ajouter les allergènes avant les plats pour pouvoir créer leurs relations.
  for (const allergen of data.allergens) {
    await prisma.allergen.create({
      data: {
        code: allergen.code,
        label: allergen.label,
      },
    });
  }

  // Créer les plats et relier chacun à sa catégorie et à ses allergènes.
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

  // Les mots de passe sont hachés avant d'être stockés en base.
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

// Lancer le seed, signaler les erreurs et fermer proprement la connexion Prisma.
main()
  .catch((error) => {
    console.error("Erreur pendant le seed :", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
