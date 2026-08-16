/**
 * Database migration runner.
 *
 * Applies the SQL migrations in `drizzle/` using the migrator that ships with
 * `drizzle-orm` itself (a production dependency) — so the runtime container
 * does not need `drizzle-kit` or any build tooling. `drizzle-kit migrate`
 * remains available locally via `pnpm db:migrate`.
 *
 * Usage: node scripts/migrate.mjs
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("[migrate] DATABASE_URL is required to run migrations.");
  process.exit(1);
}

const connection = await mysql.createConnection(connectionString);
const db = drizzle(connection);

console.log("[migrate] applying migrations…");
await migrate(db, { migrationsFolder: "drizzle" });
console.log("[migrate] migrations applied.");
await connection.end();
