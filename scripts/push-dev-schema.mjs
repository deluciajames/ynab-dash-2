import { readFile } from "node:fs/promises";
import pg from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to update the development schema.");
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const schema = await readFile(new URL("../server/schema.sql", import.meta.url), "utf8");
  await pool.query(schema);
  console.log("Development database schema is up to date.");
} finally {
  await pool.end();
}
