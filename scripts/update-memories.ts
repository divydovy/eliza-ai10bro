import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { stringToUuid } from '@elizaos/core'
import OpenAI from 'openai'

dotenv.config()

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_API_KEY
const OPENAI_API_KEY = process.env.OPENAI_API_KEY

if (!SUPABASE_URL || !SUPABASE_KEY || !OPENAI_API_KEY) {
  console.error('Missing required environment variables')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const openai = new OpenAI({ apiKey: OPENAI_API_KEY })

async function generateEmbedding(text: string) {
  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-ada-002",
      input: text,
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    return null;
  }
}

const createMemory = async (content: string, type: string = 'knowledge') => {
  // First generate the embedding
  const embedding = await generateEmbedding(content);
  if (!embedding) {
    console.error('Failed to generate embedding for:', content);
    return;
  }

  // Try to insert the memory
  const { error: insertError } = await supabase
    .from('memories')
    .insert([
      {
        content: { text: content },
        type,
        roomId: null,
        embedding
      }
    ])
    .select()
    .single();

  if (insertError) {
    if (insertError.code === '23505') { // Unique violation
      console.log('Memory already exists:', content);
    } else {
      console.error('Error inserting memory:', insertError);
    }
    return;
  }

  console.log('Successfully created memory:', content);
};

async function main() {
  const testMemory = "Sid's Serpent Snacks website is bright purple with red spots";
  await createMemory(testMemory);
}

main().catch(console.error)