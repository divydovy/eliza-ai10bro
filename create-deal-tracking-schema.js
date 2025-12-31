#!/usr/bin/env node

const Database = require('better-sqlite3');

const db = new Database('./agent/data/db.sqlite');

console.log('🔧 Creating Deal Tracking Schema...\n');

// Create tables for deals, products, and milestones
db.exec(`
    -- Deals & Transactions
    CREATE TABLE IF NOT EXISTS deals (
        id TEXT PRIMARY KEY,
        deal_type TEXT NOT NULL CHECK(deal_type IN ('funding', 'ma', 'partnership', 'ipo', 'licensing')),
        announced_date DATE,
        closed_date DATE,

        -- Parties
        company_id TEXT REFERENCES tracked_entities(id),
        lead_investor_id TEXT REFERENCES tracked_entities(id),
        acquirer_id TEXT,
        partner_ids TEXT, -- JSON array

        -- Financial
        amount_usd BIGINT,
        amount_currency TEXT DEFAULT 'USD',
        valuation_usd BIGINT,

        -- Funding specifics
        round_stage TEXT, -- 'pre-seed', 'seed', 'series_a', 'series_b', 'series_c', 'series_d+'
        investors TEXT, -- JSON array of investor_ids

        -- Context
        description TEXT,
        use_of_funds TEXT,
        source_document_id TEXT REFERENCES memories(id),
        source_url TEXT,

        -- Metadata
        confidence TEXT DEFAULT 'announced' CHECK(confidence IN ('confirmed', 'announced', 'rumored')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Products
    CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        company_id TEXT REFERENCES tracked_entities(id),

        -- Product details
        name TEXT NOT NULL,
        description TEXT,
        category TEXT, -- 'material', 'chemical', 'diagnostic', 'therapeutic', 'platform', 'service'

        -- Launch info
        launch_date DATE,
        launch_stage TEXT CHECK(launch_stage IN ('research', 'pilot', 'beta', 'commercial', 'scaled')),

        -- Market
        target_market TEXT,
        target_application TEXT, -- JSON array
        competitive_alternatives TEXT,

        -- Performance
        key_metrics TEXT, -- JSON
        trl_level INTEGER CHECK(trl_level BETWEEN 1 AND 9),

        -- Regulatory
        regulatory_status TEXT,
        regulatory_date DATE,

        -- References
        technology_ids TEXT, -- JSON array
        source_document_id TEXT REFERENCES memories(id),
        source_url TEXT,

        -- Metadata
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Company Milestones
    CREATE TABLE IF NOT EXISTS company_milestones (
        id TEXT PRIMARY KEY,
        company_id TEXT REFERENCES tracked_entities(id),

        -- Milestone details
        milestone_type TEXT CHECK(milestone_type IN ('revenue', 'production_scale', 'customer', 'partnership', 'regulatory', 'team', 'technology')),
        title TEXT NOT NULL,
        description TEXT,
        announced_date DATE,

        -- Quantitative (if applicable)
        metric_name TEXT,
        metric_value NUMERIC,
        metric_unit TEXT,
        previous_value NUMERIC,

        -- Context
        significance TEXT CHECK(significance IN ('breakthrough', 'incremental', 'target_met', 'target_exceeded')),
        source_document_id TEXT REFERENCES memories(id),
        source_url TEXT,

        -- Metadata
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_deals_company ON deals(company_id);
    CREATE INDEX IF NOT EXISTS idx_deals_type ON deals(deal_type);
    CREATE INDEX IF NOT EXISTS idx_deals_date ON deals(announced_date);
    CREATE INDEX IF NOT EXISTS idx_deals_investor ON deals(lead_investor_id);

    CREATE INDEX IF NOT EXISTS idx_products_company ON products(company_id);
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
    CREATE INDEX IF NOT EXISTS idx_products_launch_date ON products(launch_date);
    CREATE INDEX IF NOT EXISTS idx_products_regulatory_status ON products(regulatory_status);

    CREATE INDEX IF NOT EXISTS idx_milestones_company ON company_milestones(company_id);
    CREATE INDEX IF NOT EXISTS idx_milestones_type ON company_milestones(milestone_type);
    CREATE INDEX IF NOT EXISTS idx_milestones_date ON company_milestones(announced_date);
`);

console.log('✅ Tables created successfully!\n');

// Show schema
const tables = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table'
    AND name IN ('deals', 'products', 'company_milestones')
    ORDER BY name
`).all();

console.log('📊 Created tables:');
for (const table of tables) {
    const count = db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get();
    console.log(`   ${table.name}: ${count.count} rows`);
}

// Show all entity-related tables
console.log('\n📊 All Entity-Related Tables:');
const entityTables = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table'
    AND (name LIKE '%entit%' OR name IN ('deals', 'products', 'company_milestones'))
    ORDER BY name
`).all();

for (const table of entityTables) {
    const count = db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get();
    console.log(`   ${table.name}: ${count.count} rows`);
}

console.log('\n✅ Deal tracking schema ready!');
console.log('\n💡 Next steps:');
console.log('   1. node detect-entity-deals.js sample  # Extract deals from documents');
console.log('   2. node detect-entity-mentions.js full  # Full entity mention scan');
console.log('   3. node generate-entity-focused-broadcasts.js 10  # Test entity-aware broadcasts');

db.close();
