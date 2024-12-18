import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!
);

async function verifyDocuments() {
    // Check documents in the table
    const { data, error } = await supabase
        .from('agent_documents')
        .select('*');

    if (error) {
        console.error('Error fetching documents:', error);
        return;
    }

    console.log('Documents found:', data?.length);
    console.log('Sample document:', {
        id: data?.[0]?.id,
        content: data?.[0]?.content,
        hasEmbedding: !!data?.[0]?.embedding,
        embeddingLength: data?.[0]?.embedding?.length
    });
}

verifyDocuments();