/**
 * Run Drizzle versioned migrations against the configured database.
 *
 * Usage:
 *   # 1. Generate SQL migration files from schema changes:
 *   npx drizzle-kit generate
 *
 *   # 2. Apply pending migrations:
 *   npm run migrate
 *
 * The migrator tracks applied migrations in a `__drizzle_migrations` table
 * so each migration runs exactly once.
 */
import "dotenv/config"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { Pool } from "pg"

async function runMigrations(): Promise<void> {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl:
            process.env.NODE_ENV === "production"
                ? { rejectUnauthorized: true }
                : { rejectUnauthorized: false },
    })

    const db = drizzle(pool)

    console.log("Running database migrations…")
    await migrate(db, { migrationsFolder: "./drizzle" })
    console.log("Migrations complete.")

    await pool.end()
}

runMigrations().catch(err => {
    console.error("Migration failed:", err)
    process.exit(1)
})
