import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "./generated/prisma/client.js";
import { config } from "./config.js";

// L'adaptateur relie Prisma à la base SQLite indiquée dans DATABASE_URL.
const adapter = new PrismaBetterSqlite3({
    url: config.DATABASE_URL
});

// Cette instance est partagée par les repositories du backend.
export const prisma = new PrismaClient({
    adapter
});