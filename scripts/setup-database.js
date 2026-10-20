import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import pg from 'pg'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is missing. Add your Supabase connection string to .env first.')
}

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

try {
  const schema = await readFile(new URL('../database/schema.sql', import.meta.url), 'utf8')
  await pool.query(schema)
  console.log('Workly database schema applied successfully.')
} finally {
  await pool.end()
}
