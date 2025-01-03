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

async function cleanMemories() {
  // Delete all memories of type 'knowledge'
  const { error: memoriesError } = await supabase
    .from('memories')
    .delete()
    .eq('type', 'knowledge')

  if (memoriesError) {
    console.error('Error deleting memories:', memoriesError)
    process.exit(1)
  }

  console.log('Successfully deleted all knowledge memories')
}

cleanMemories().catch(console.error)