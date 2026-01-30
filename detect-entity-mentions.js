#!/usr/bin/env node

const Database = require('better-sqlite3');
const crypto = require('crypto');

const db = new Database('./agent/data/db.sqlite');

console.log('🔍 Entity Mention Detection System\n');

// Get all tracked entities
const entities = db.prepare('SELECT id, name, type, focus_area FROM tracked_entities').all();
console.log(`📊 Loaded ${entities.length} entities to track\n`);

// Context filters for ambiguous entity names
const CONTEXT_FILTERS = {
    'Extracellular': {
        // STRICT: Only match if company explicitly mentioned
        // Require specific company identifiers (never match bare "extracellular")
        requiredContext: [
            /Extracellular\s+(Inc|Company|Ltd|LLC)/gi,
            /extracellular\.com/gi,
            /Extracellular.*?(raised|raises|funding|round|Series\s+[A-D])/gi,
            /Extracellular.*?(startup|biotech\s+company|cellular\s+agriculture\s+company)/gi
        ],
        // If ANY scientific usage appears, reject completely
        negative: [
            /extracellular\s+(matrix|matrices|vesicles?|space|domain|environment|medium|fluid|compartment|milieu|region|fraction|components?|proteins?|markers?|signals?|secretion|molecules?|factors?|polymeric|electrons?|lncRNA|recordings?)/gi,
            /\b(ECM|EV|EVs)\b/g,
            /\bthe\s+extracellular/gi,
            /\bof\s+extracellular/gi,
            /\bthrough\s+extracellular/gi
        ],
        positive: null  // Not used when requiredContext is set
    }
    // Add more ambiguous entities here as needed
};

// Create case-insensitive regex patterns for each entity
const entityPatterns = entities.map(entity => ({
    ...entity,
    // Create pattern that matches entity name with word boundaries
    // Also handle variations like possessive ('s) and plural (s)
    pattern: new RegExp(`\\b${entity.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}('s|s)?\\b`, 'gi'),
    contextFilter: CONTEXT_FILTERS[entity.name] || null
}));

function generateId() {
    return crypto.randomBytes(16).toString('hex');
}

// Prepare statements
const insertMention = db.prepare(`
    INSERT INTO entity_mentions (id, document_id, entity_id, mention_count, context)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
        mention_count = excluded.mention_count,
        context = excluded.context
`);

const checkExistingMention = db.prepare(`
    SELECT id FROM entity_mentions
    WHERE document_id = ? AND entity_id = ?
`);

const updateMention = db.prepare(`
    UPDATE entity_mentions
    SET mention_count = ?, context = ?
    WHERE document_id = ? AND entity_id = ?
`);

function extractContext(text, match, contextLength = 100) {
    const matchIndex = match.index;
    const start = Math.max(0, matchIndex - contextLength);
    const end = Math.min(text.length, matchIndex + match[0].length + contextLength);

    let context = text.substring(start, end);

    // Add ellipsis if truncated
    if (start > 0) context = '...' + context;
    if (end < text.length) context = context + '...';

    return context;
}

function detectEntitiesInDocument(docId, text) {
    const detectedEntities = new Map(); // entity_id -> {count, contexts}

    for (const entity of entityPatterns) {
        const matches = [...text.matchAll(entity.pattern)];

        if (matches.length > 0) {
            // Apply context filters for ambiguous entities
            if (entity.contextFilter) {
                // Check for required context (strict mode)
                if (entity.contextFilter.requiredContext) {
                    const hasRequiredContext = entity.contextFilter.requiredContext.some(pattern =>
                        pattern.test(text)
                    );

                    if (!hasRequiredContext) {
                        // Required context not found - skip this entity
                        continue;
                    }
                }

                // Check negative patterns (exclude if found)
                if (entity.contextFilter.negative) {
                    const hasNegativeMatch = entity.contextFilter.negative.some(pattern =>
                        pattern.test(text)
                    );

                    if (hasNegativeMatch) {
                        // Negative scientific terms found - skip even if required context present
                        continue;
                    }
                }

                // Check positive patterns if defined (legacy mode)
                if (entity.contextFilter.positive && !entity.contextFilter.requiredContext) {
                    const hasPositiveMatch = entity.contextFilter.positive.some(pattern =>
                        pattern.test(text)
                    );

                    if (!hasPositiveMatch) {
                        // Positive context required but not found - skip this entity
                        continue;
                    }
                }
            }

            // Get contexts for first 3 mentions
            const contexts = matches.slice(0, 3).map(m => extractContext(text, m));

            detectedEntities.set(entity.id, {
                name: entity.name,
                type: entity.type,
                count: matches.length,
                contexts: contexts.join(' | ')
            });
        }
    }

    return detectedEntities;
}

function processDocuments(limit = null, offset = 0) {
    // Get documents that haven't been processed or have high scores
    let query = `
        SELECT id, content
        FROM memories
        WHERE type = 'documents'
    `;

    if (limit) {
        query += ` LIMIT ${limit} OFFSET ${offset}`;
    }

    const docs = db.prepare(query).all();

    console.log(`📚 Processing ${docs.length} documents (offset: ${offset})...\n`);

    let processedCount = 0;
    let mentionsFound = 0;
    let entitiesDetected = new Set();

    for (const doc of docs) {
        try {
            const content = JSON.parse(doc.content);
            const text = content.text || '';

            if (!text) continue;

            const detected = detectEntitiesInDocument(doc.id, text);

            if (detected.size > 0) {
                for (const [entityId, data] of detected) {
                    // Check if mention already exists
                    const existing = checkExistingMention.get(doc.id, entityId);

                    if (existing) {
                        updateMention.run(data.count, data.contexts, doc.id, entityId);
                    } else {
                        insertMention.run(
                            generateId(),
                            doc.id,
                            entityId,
                            data.count,
                            data.contexts
                        );
                    }

                    mentionsFound += data.count;
                    entitiesDetected.add(data.name);

                    if (data.count > 1) {
                        console.log(`  ✅ ${data.name} (${data.type}): ${data.count} mentions in doc ${doc.id.substring(0, 8)}...`);
                    }
                }
            }

            processedCount++;

            if (processedCount % 1000 === 0) {
                console.log(`  📊 Progress: ${processedCount}/${docs.length} documents...`);
            }

        } catch (error) {
            console.error(`  ❌ Error processing doc ${doc.id}:`, error.message);
        }
    }

    return { processedCount, mentionsFound, entitiesDetected: Array.from(entitiesDetected) };
}

// Main execution
const args = process.argv.slice(2);
const mode = args[0] || 'sample';

if (mode === 'sample') {
    console.log('🎯 Running in SAMPLE mode (1000 documents)...\n');
    const stats = processDocuments(1000, 0);

    console.log(`\n📊 Sample Results:`);
    console.log(`   Processed: ${stats.processedCount} documents`);
    console.log(`   Mentions found: ${stats.mentionsFound}`);
    console.log(`   Unique entities detected: ${stats.entitiesDetected.length}`);
    console.log(`   Entities: ${stats.entitiesDetected.slice(0, 10).join(', ')}${stats.entitiesDetected.length > 10 ? '...' : ''}`);

} else if (mode === 'full') {
    console.log('🚀 Running in FULL mode (all documents)...\n');
    const stats = processDocuments();

    console.log(`\n📊 Full Run Results:`);
    console.log(`   Processed: ${stats.processedCount} documents`);
    console.log(`   Mentions found: ${stats.mentionsFound}`);
    console.log(`   Unique entities detected: ${stats.entitiesDetected.length}`);

} else if (mode === 'doc') {
    // Process specific document
    const docId = args[1];
    if (!docId) {
        console.error('❌ Please provide a document ID: node detect-entity-mentions.js doc <doc_id>');
        process.exit(1);
    }

    const doc = db.prepare('SELECT id, content FROM memories WHERE id = ? AND type = "documents"').get(docId);
    if (!doc) {
        console.error(`❌ Document ${docId} not found`);
        process.exit(1);
    }

    console.log(`🎯 Analyzing document: ${docId}\n`);

    const content = JSON.parse(doc.content);
    const text = content.text || '';
    const detected = detectEntitiesInDocument(doc.id, text);

    if (detected.size === 0) {
        console.log('   ℹ️  No entity mentions found in this document');
    } else {
        console.log(`   ✅ Found ${detected.size} entities:\n`);
        for (const [entityId, data] of detected) {
            console.log(`   📍 ${data.name} (${data.type}): ${data.count} mention(s)`);
            console.log(`      Context: ${data.contexts}\n`);
        }
    }
} else {
    console.error('❌ Invalid mode. Use: sample, full, or doc <doc_id>');
    process.exit(1);
}

// Show summary stats
const totalMentions = db.prepare('SELECT COUNT(*) as count FROM entity_mentions').get();
const topEntities = db.prepare(`
    SELECT e.name, e.type, e.confidence,
           COUNT(DISTINCT em.document_id) as doc_count,
           SUM(em.mention_count) as total_mentions
    FROM entity_mentions em
    JOIN tracked_entities e ON e.id = em.entity_id
    GROUP BY e.id
    ORDER BY doc_count DESC
    LIMIT 10
`).all();

console.log(`\n📊 Entity Mention Database Summary:`);
console.log(`   Total mention records: ${totalMentions.count}`);
console.log(`\n   Top 10 Most Mentioned Entities:`);
for (const entity of topEntities) {
    console.log(`     ${entity.name} (${entity.type}, ${entity.confidence}): ${entity.doc_count} docs, ${entity.total_mentions} mentions`);
}

console.log('\n✅ Entity detection complete!');

db.close();
