import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient; _prismaVersion?: number };

const SCHEMA_VERSION = 4; // bump after schema changes to force re-creation

if (globalForPrisma._prismaVersion !== SCHEMA_VERSION) {
  globalForPrisma.prisma = undefined!;
  globalForPrisma._prismaVersion = SCHEMA_VERSION;
}

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL! }),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
