import { PrismaClient } from "@prisma/client";

function runtimeDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) return undefined;
  const params = new URLSearchParams(url.split("?")[1] ?? "");
  if (url.includes("pooler.supabase.com")) params.set("pgbouncer", "true");
  params.set("connection_limit", params.get("connection_limit") ?? "1");
  params.set("pool_timeout", params.get("pool_timeout") ?? "30");
  return `${url.split("?")[0]}?${params.toString()}`;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const db = globalForPrisma.prisma ?? new PrismaClient({
  datasources: runtimeDatabaseUrl() ? { db: { url: runtimeDatabaseUrl() } } : undefined,
});
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
