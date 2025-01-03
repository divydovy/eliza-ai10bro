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

async function checkMemories() {
  // First check knowledge memories
  const { data: knowledgeMemories, error: knowledgeError } = await supabase
    .from('memories')
    .select('*')
    .eq('type', 'knowledge')
    .limit(3)

  if (knowledgeError) {
    console.error('Error fetching knowledge memories:', knowledgeError)
    process.exit(1)
  }

  console.log('Sample knowledge memories:')
  knowledgeMemories.forEach(memory => {
    console.log(`ID: ${memory.id}`)
    console.log(`Room ID: ${memory.roomId}`)
    console.log(`Type: ${memory.type}`)
    console.log(`Content: ${JSON.stringify(memory.content, null, 2)}`)
    console.log(`Has Embedding: ${memory.embedding ? 'Yes' : 'No'}`)
    console.log(`Created At: ${memory.createdAt}`)
    console.log('---')
  })

  // Then check document memories
  const { data: documentMemories, error: documentError } = await supabase
    .from('memories')
    .select('*')
    .eq('type', 'documents')
    .limit(3)

  if (documentError) {
    console.error('Error fetching document memories:', documentError)
    process.exit(1)
  }

  console.log('\nSample document memories:')
  documentMemories.forEach(memory => {
    console.log(`ID: ${memory.id}`)
    console.log(`Room ID: ${memory.roomId}`)
    console.log(`Type: ${memory.type}`)
    console.log(`Content: ${JSON.stringify(memory.content, null, 2)}`)
    console.log(`Has Embedding: ${memory.embedding ? 'Yes' : 'No'}`)
    console.log(`Created At: ${memory.createdAt}`)
    console.log('---')
  })
}

checkMemories().catch(console.error)