#!/usr/bin/env node

/**
 * PubMed Fetcher for Biology Papers
 * Uses PubMed E-utilities API (free, no key required)
 *
 * Usage: node fetch-pubmed.js "search term"
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const searchTerm = process.argv[2] || 'biomimicry';
const PAPERS_DIR = 'Papers';

// Ensure Papers directory exists
if (!fs.existsSync(PAPERS_DIR)) {
    fs.mkdirSync(PAPERS_DIR, { recursive: true });
}

async function searchPubMed(term) {
    // Step 1: Search for PMIDs
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi`;
    const searchParams = {
        db: 'pubmed',
        term: `${term}[Title/Abstract]`,
        reldate: 1,  // Last 1 day
        retmax: 10,  // Max 10 results
        retmode: 'json'
    };

    console.log(`🔍 Searching PubMed for: "${term}"`);

    const searchResponse = await axios.get(searchUrl, { params: searchParams });
    const pmids = searchResponse.data.esearchresult.idlist;

    if (pmids.length === 0) {
        console.log(`   No new papers found for "${term}"`);
        return;
    }

    console.log(`   Found ${pmids.length} new papers`);

    // Step 2: Fetch abstracts for each PMID
    for (const pmid of pmids) {
        await fetchAndSave(pmid, term);
    }
}

async function fetchAndSave(pmid, searchTerm) {
    const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi`;
    const fetchParams = {
        db: 'pubmed',
        id: pmid,
        rettype: 'abstract',
        retmode: 'xml'
    };

    try {
        const response = await axios.get(fetchUrl, { params: fetchParams });
        const xml = response.data;

        // Parse XML (basic parsing for MVP)
        const titleMatch = xml.match(/<ArticleTitle>(.*?)<\/ArticleTitle>/s);
        const abstractMatch = xml.match(/<AbstractText.*?>(.*?)<\/AbstractText>/s);
        const pubDateMatch = xml.match(/<PubDate>.*?<Year>(\d{4})<\/Year>.*?<\/PubDate>/s);
        const authorsMatch = xml.matchAll(/<Author.*?><LastName>(.*?)<\/LastName>.*?<ForeName>(.*?)<\/ForeName>.*?<\/Author>/gs);

        const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '') : 'Unknown Title';
        const abstract = abstractMatch ? abstractMatch[1].replace(/<[^>]*>/g, '') : 'No abstract available';
        const year = pubDateMatch ? pubDateMatch[1] : new Date().getFullYear();

        const authors = [];
        for (const match of authorsMatch) {
            authors.push(`${match[2]} ${match[1]}`);
        }

        // Create markdown file
        const filename = `${pmid}_${searchTerm.replace(/\s+/g, '_')}.md`;
        const filepath = path.join(PAPERS_DIR, filename);

        // Skip if already exists
        if (fs.existsSync(filepath)) {
            console.log(`   ⏭️  Skipping ${pmid} (already exists)`);
            return;
        }

        const markdown = `---
title: "${title}"
source: "https://pubmed.ncbi.nlm.nih.gov/${pmid}/"
published: ${year}
authors:
${authors.map(a => `  - "${a}"`).join('\n')}
tags:
  - "pubmed"
  - "${searchTerm}"
---

# ${title}

**PubMed ID:** ${pmid}
**Published:** ${year}
**Authors:** ${authors.join(', ')}

## Abstract

${abstract}

🔗 Source: https://pubmed.ncbi.nlm.nih.gov/${pmid}/
`;

        fs.writeFileSync(filepath, markdown);
        console.log(`   ✅ Saved: ${filename}`);

    } catch (error) {
        console.error(`   ❌ Error fetching PMID ${pmid}:`, error.message);
    }
}

// Main execution
(async () => {
    await searchPubMed(searchTerm);
})();
