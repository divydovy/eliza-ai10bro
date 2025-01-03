import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { AgentRuntime, ModelProviderName, Plugin, CacheManager, ICacheAdapter } from '@elizaos/core'
import { SupabaseDatabaseAdapter } from '@elizaos/adapter-supabase'

dotenv.config()

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_API_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing required environment variables')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function main() {
  // First get a sample memory to get its embedding
  const { data: memories, error: memoriesError } = await supabase
    .from('memories')
    .select('*')
    .eq('type', 'knowledge')
    .like('content->>text', '%Sid\'s Serpent Snacks%')

  if (memoriesError) {
    console.error('Error querying memories:', memoriesError)
    process.exit(1)
  }

  console.log('\nFound direct matches:', memories.length)
  memories.forEach(memory => {
    console.log('\nContent:', memory.content.text)
    console.log('Has embedding:', !!memory.embedding)
    console.log('Type:', memory.type)
    console.log('Room ID:', memory.roomId)
    console.log('Created at:', memory.createdAt)
    console.log('---')
  })

  // If we have a memory with an embedding, search for similar ones
  if (memories.length > 0 && memories[0].embedding) {
    const { data: similarMemories, error: similarError } = await supabase.rpc(
      'search_memories',
      {
        query_embedding: memories[0].embedding,
        query_match_threshold: 0.1,
        query_match_count: 5,
        query_roomId: null,
        query_table_name: 'memories',
        query_unique: true
      }
    )

    if (similarError) {
      console.error('Error performing similarity search:', similarError)
    } else {
      console.log('\nSimilar memories found via vector search:', similarMemories.length)
      similarMemories.forEach(memory => {
        console.log('\nContent:', memory.content.text)
        console.log('Similarity:', memory.similarity)
        console.log('Type:', memory.type)
        console.log('Room ID:', memory.roomId)
        console.log('---')
      })
    }
  }
}

main().catch(console.error)