import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_API_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing required environment variables')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function addMemoriesPolicy() {
  // Add policy to allow access to memories table
  const { error } = await supabase.rpc('add_memories_policy')

  if (error) {
    console.error('Error adding memories policy:', error)
    process.exit(1)
  }

  console.log('Successfully added memories policy')
}

addMemoriesPolicy().catch(console.error)