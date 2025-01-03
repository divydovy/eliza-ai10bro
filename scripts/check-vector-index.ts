import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_API_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function main() {
  // Check if the vector extension is installed
  const { data: extensions, error: extensionError } = await supabase.rpc('check_vector_extension')

  if (extensionError) {
    console.error('Error checking vector extension:', extensionError)
    process.exit(1)
  }

  console.log('Vector extension status:', extensions)

  // Check if the memories table has a vector index
  const { data: indexes, error: indexError } = await supabase.rpc('check_vector_index')

  if (indexError) {
    console.error('Error checking vector index:', indexError)
    process.exit(1)
  }

  console.log('Vector index status:', indexes)
}

main().catch(console.error)