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

async function listRooms() {
  const { data: rooms, error } = await supabase
    .from('rooms')
    .select('*')

  if (error) {
    console.error('Error fetching rooms:', error)
    process.exit(1)
  }

  console.log('Available rooms:')
  rooms.forEach(room => {
    console.log(`ID: ${room.id}`)
    console.log(`User ID: ${room.userId}`)
    console.log(`Agent ID: ${room.agentId}`)
    console.log(`Created At: ${room.createdAt}`)
    console.log('---')
  })
}

listRooms().catch(console.error)