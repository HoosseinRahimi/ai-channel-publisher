import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/schema.ts",
  out: "./drizzle-d1",
  migrations: {
    // Wrangler D1 `migrations_dir` uses flat `0000_..` folders.
    prefix: "timestamp",
  },
});
