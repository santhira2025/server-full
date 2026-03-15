import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema.js"

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set")
}

const isProduction = process.env.NODE_ENV === "production"

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
})

// Surface unexpected pool errors instead of crashing silently
pool.on("error", (err) => {
    console.error("[db] Unexpected pool error:", err.message)
})

export { pool }
export const db = drizzle(pool, { schema })
