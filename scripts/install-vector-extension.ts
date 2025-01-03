import { Client } from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const databaseUrl = process.env.POSTGRES_URL

if (!databaseUrl) {
  console.error('Missing POSTGRES_URL environment variable')
  process.exit(1)
}

const client = new Client({
  connectionString: databaseUrl,
  ssl: {
    rejectUnauthorized: false
  }
})

async function main() {
  await client.connect()

  try {
    // Install vector extension
    await client.query(`
      CREATE EXTENSION IF NOT EXISTS vector;
    `)

    console.log('Installed vector extension')

    // Verify installation
    const { rows } = await client.query(`
      SELECT installed_version
      FROM pg_available_extensions
      WHERE name = 'vector';
    `)

    console.log('Vector extension version:', rows[0]?.installed_version || 'not installed')
  } finally {
    await client.end()
  }
}

main().catch(console.error)