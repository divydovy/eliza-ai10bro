import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!
);

async function uploadTest() {
    const testContent = "This is a test document about WordPress. WordPress is a free and open-source content management system written in PHP.";

    // Create test file
    fs.writeFileSync('test.txt', testContent);

    // Upload to Supabase
    const { data, error } = await supabase.storage
        .from('agent_documents')
        .upload('test.txt', fs.readFileSync('test.txt'));

    if (error) {
        console.error('Upload error:', error);
    } else {
        console.log('Uploaded:', data);
    }
}

uploadTest();