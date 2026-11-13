import 'server-only';
import { Prisma, PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __b2bPrisma: PrismaClient | undefined;
}

/** Single Prisma client per process (hot-reload safe). */
export const db: PrismaClient =
  globalThis.__b2bPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : process.env.NODE_ENV === 'test' ? [] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalThis.__b2bPrisma = db;

export type Tx = Prisma.TransactionClient;
