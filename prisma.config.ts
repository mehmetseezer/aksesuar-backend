// prisma.config.ts
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "ts-node prisma/seed.ts", // ← Bu satırı ekleyin
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});