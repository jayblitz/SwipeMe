import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pkg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

// Optimized connection pool for handling 1000+ daily users
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Connection limits
  max: 20, // Maximum connections in pool (tune based on db plan limits)
  // Timeouts
  idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
  connectionTimeoutMillis: 10000, // Timeout after 10 seconds if can't connect
  // Statement timeout to prevent long-running queries
  statement_timeout: 30000, // 30 second query timeout
});

// Monitor pool health
pool.on("error", (err: Error) => {
  console.error("Unexpected database pool error:", err);
});

export const db = drizzle(pool, { schema });

// Export pool for health checks
export { pool };
