import { SupabaseDatabaseAdapter } from "@ai16z/adapter-supabase";
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config();

async function testVectorSearch() {
    try {
        console.log("Testing Supabase vector search...");

        const db = new SupabaseDatabaseAdapter(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY
        );

        await db.init();

        // Test vector search
        const testEmbedding = new Array(1536).fill(0.1); // Mock embedding
        const results = await db.searchMemoriesByEmbedding(testEmbedding, {
            tableName: "memories",
            match_threshold: 0.5,
            count: 5
        });

        console.log("Vector search results:", results);

    } catch (error) {
        console.error("Vector search error:", error);
    }
}

testVectorSearch();