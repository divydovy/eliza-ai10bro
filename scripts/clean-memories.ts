import pkg from 'pg';
const { Pool } = pkg;
import fs from 'fs';
import path from 'path';

const characterPath = process.argv[2] || 'characters/photomatt.character.json';
const characterContent = JSON.parse(fs.readFileSync(path.join(process.cwd(), characterPath), 'utf-8'));
const POSTGRES_URL = characterContent.settings?.secrets?.POSTGRES_URL;

if (!POSTGRES_URL) {
  console.error('Missing POSTGRES_URL in character file')
  process.exit(1)
}

const pool = new Pool({
  connectionString: POSTGRES_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function cleanMemories() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Delete all document and fragment memories
    await client.query(`
      DELETE FROM memories
      WHERE type IN ('documents', 'fragments')
    `)

    await client.query('COMMIT')
    console.log('Successfully deleted all document and fragment memories')
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Error deleting memories:', error)
    process.exit(1)
  } finally {
    client.release()
  }
}

cleanMemories().catch(console.error)