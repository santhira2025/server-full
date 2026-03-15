/**
 * Programmatic smee tunnel — avoids smee-client v5 CLI URL validation bug.
 * Usage: npx tsx src/tunnel.ts
 */
import "dotenv/config"

const SMEE_URL = process.env.SMEE_URL || "https://smee.io/Cvwd5grsATZOrsxa"
const TARGET_PORT = Number(process.env.PORT) || 3000
const TARGET_PATH = "/webhook/github"
const TARGET = `http://localhost:${TARGET_PORT}${TARGET_PATH}`

async function startTunnel() {
    try {
        // Dynamic import to avoid bundling issues
        const SmeeClient = (await import("smee-client")).default
        const smee = new SmeeClient({
            source: SMEE_URL,
            target: TARGET,
            logger: console,
        })

        const events = await smee.start()

        console.log(`\n  Smee tunnel active`)
        console.log(`  Source:  ${SMEE_URL}`)
        console.log(`  Target:  ${TARGET}\n`)

        // Graceful shutdown
        const shutdown = () => {
            console.log("\nShutting down tunnel...")
            events.close()
            process.exit(0)
        }
        process.on("SIGINT", shutdown)
        process.on("SIGTERM", shutdown)
    } catch (err: any) {
        console.error("Failed to start smee tunnel:", err.message)
        console.error("\nMake sure smee-client is installed: npm i -D smee-client")
        process.exit(1)
    }
}

startTunnel()
