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

async function processDocuments() {
    try {
        const bucketId = 'agent_documents';
        console.log('Listing files in bucket:', bucketId);

        // List files in bucket
        const { data: files, error } = await supabase.storage
            .from(bucketId)
            .list();

        if (error) {
            console.error('Storage error:', error);
            return;
        }

        console.log('Files found:', files);

        // Process each file
        for (const file of files || []) {
            console.log('Processing:', file.name);

            try {
                // Download file directly using storage API
                const { data, error: downloadError } = await supabase.storage
                    .from(bucketId)
                    .download(file.name);

                if (downloadError) {
                    console.error('Download error:', downloadError);
                    continue;
                }

                // Convert blob to text
                const text = await data.text();
                console.log('Content preview:', text.substring(0, 100));

                // Create embedding
                const embedding = await createEmbedding(text);

                // Store in database
                const { error: insertError } = await supabase
                    .from('agent_documents')
                    .insert({
                        id: crypto.randomUUID(),
                        content: {
                            text,
                            source: file.name,
                            title: file.name
                        },
                        embedding,
                        type: 'document'
                    });

                if (insertError) {
                    console.error('Error storing document:', insertError);
                } else {
                    console.log('Processed:', file.name);
                }
            } catch (fileError) {
                console.error('Error processing file:', file.name, fileError);
            }
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

processDocuments();