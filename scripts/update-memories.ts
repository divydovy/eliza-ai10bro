import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import dotenv from 'dotenv'
import { v4 as uuid } from 'uuid'

dotenv.config()

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_API_KEY
const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const BUCKET_NAME = 'agent_documents'
const CHARACTER_ID = '550e8400-e29b-41d4-a716-446655440000' // Fixed UUID for Matt Mullenweg

if (!SUPABASE_URL || !SUPABASE_KEY || !OPENAI_API_KEY) {
  console.error('Missing required environment variables')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const openai = new OpenAI({ apiKey: OPENAI_API_KEY })

async function ensureAccount() {
  // Check if account exists
  const { data: existingAccount } = await supabase
    .from('accounts')
    .select('id')
    .eq('id', CHARACTER_ID)
    .single()

  if (!existingAccount) {
    // Create account if it doesn't exist
    const { error } = await supabase
      .from('accounts')
      .insert({
        id: CHARACTER_ID,
        name: 'Matt Mullenweg',
        email: 'matt@wordpress.com'
      })

    if (error) {
      console.error('Error creating account:', error)
      process.exit(1)
    }
    console.log('Created account for Matt Mullenweg')
  }
}

async function getEmbedding(text: string) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-ada-002',
    input: text.replace(/\n/g, ' ')
  })
  return response.data[0].embedding
}

async function processFile(filePath: string) {
  // Download file from Storage
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .download(filePath)

  if (error) {
    console.error(`Error downloading ${filePath}:`, error)
    return
  }

  const text = await data.text()

  // Check if memory with this content already exists using raw SQL
  const { data: existingMemories, error: searchError } = await supabase
    .from('memories')
    .select('id, content')
    .eq('userId', CHARACTER_ID)
    .eq('type', 'knowledge')

  if (searchError) {
    console.error(`Error checking for existing memory: ${searchError.message}`)
    return
  }

  // Check for exact match
  const exists = existingMemories?.some(memory =>
    memory.content &&
    typeof memory.content === 'object' &&
    'text' in memory.content &&
    memory.content.text === text
  )

  if (exists) {
    console.log(`Memory for ${filePath} already exists, skipping...`)
    return
  }

  const embedding = await getEmbedding(text)

  // Insert into memories table
  const { error: insertError } = await supabase
    .from('memories')
    .insert({
      id: uuid(),
      userId: CHARACTER_ID,
      content: { text },
      embedding,
      type: 'knowledge',
      createdAt: new Date().toISOString()
    })

  if (insertError) {
    console.error(`Error inserting memory for ${filePath}:`, insertError)
    return
  }

  console.log(`Successfully processed ${filePath}`)
}

async function main() {
  // Ensure account exists before processing files
  await ensureAccount()

  // List all files in the knowledge bucket
  const { data: files, error } = await supabase.storage
    .from(BUCKET_NAME)
    .list()

  if (error) {
    console.error('Error listing files:', error)
    process.exit(1)
  }

  // Process each file
  for (const file of files) {
    if (file.name.endsWith('.txt')) {
      await processFile(file.name)
    }
  }
}

main().catch(console.error)