import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!
);

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

async function createEmbedding(text: string) {
    const response = await openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: text
    });
    return response.data[0].embedding;
}

async function updateMissingEmbeddings() {
    // Get rows without embeddings
    const { data: rows, error } = await supabase
        .from('memories')
        .select('id, content')
        .is('embedding', null);

    if (error) {
        console.error('Error fetching rows:', error);
        return;
    }

    console.log(`Found ${rows?.length} rows without embeddings`);

    // Update each row
    for (const row of rows || []) {
        try {
            const text = row.content.text;
            console.log('Processing:', text.substring(0, 100));

            const embedding = await createEmbedding(text);

            const { error: updateError } = await supabase
                .from('memories')
                .update({ embedding })
                .eq('id', row.id);

            if (updateError) {
                console.error('Error updating row:', row.id, updateError);
            } else {
                console.log('Updated row:', row.id);
            }
        } catch (err) {
            console.error('Error processing row:', row.id, err);
        }
    }
}

updateMissingEmbeddings();