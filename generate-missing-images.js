#!/usr/bin/env node

/**
 * Generate images for WordPress posts missing featured images
 * Uses Gemini image generation API
 */

const { execSync } = require('child_process');
const path = require('path');

const GEMINI_SKILL_PATH = '/Users/davidlockie/.claude/plugins/cache/every-marketplace/compounding-engineering/2.8.1/skills/gemini-imagegen';
const OUTPUT_DIR = '/Users/davidlockie/Documents/Projects/Eliza/broadcast-images';

// Posts needing images with their prompts
const posts = [
    {
        id: 142,
        title: "CRISPR-like Tools Edit Mitochondria DNA",
        prompt: "CRISPR-like tools editing mitochondrial DNA in a cell, showing genetic therapy breakthrough with glowing DNA strands and molecular editing tools, scientific illustration style, biotechnology theme"
    },
    {
        id: 141,
        title: "Algae-Based Bio-Altimeter",
        prompt: "Algae-based bio-altimeter on a weather balloon floating in the atmosphere, showing bioluminescent algae sensors measuring altitude, scientific visualization style with Earth curve in background"
    },
    {
        id: 140,
        title: "Innovative Corneal Coating",
        prompt: "Eye with innovative hydrogel biopolymer coating on cornea, transparent bioengineered material protecting eye tissue, medical illustration style showing cross-section of corneal layers"
    },
    {
        id: 127,
        title: "Injectable GelMA Hydrogel",
        prompt: "Injectable GelMA hydrogel with mesoporous silica nanoparticles promoting bone regeneration, showing molecular structure and bone healing process, biomedical illustration style"
    },
    {
        id: 126,
        title: "DIAL Framework Protein Expression",
        prompt: "DIAL framework controlling protein expression in engineered cells, showing molecular switches and dynamic gene regulation, synthetic biology visualization with glowing proteins"
    },
    {
        id: 125,
        title: "Living Microbial Cement Supercapacitors",
        prompt: "Living microbial cement supercapacitors with bacterial cells embedded in concrete matrix, showing bioelectrical energy storage, sustainable technology illustration with microorganisms and circuits"
    },
    {
        id: 124,
        title: "Pig Kidney Xenotransplantation",
        prompt: "Pig kidney xenotransplantation surgery showing bioengineered organ transplant, medical breakthrough visualization with anatomical illustration style, highlighting cross-species transplant success"
    },
    {
        id: 123,
        title: "Huntington's Disease Treatment",
        prompt: "Gene therapy treatment for Huntington's disease showing DNA repair in brain neurons, medical breakthrough with glowing neural pathways and genetic correction, scientific illustration style"
    },
    {
        id: 122,
        title: "Extracellular Vesicles Bone Repair",
        prompt: "Extracellular vesicles delivering therapeutic cargo to bone tissue for regeneration, showing nanoscale vesicles and cellular communication, biomedical illustration with molecular detail"
    },
    {
        id: 121,
        title: "Lab-Grown Human Embryo Model",
        prompt: "Lab-grown human embryo model producing blood cells in petri dish, showing stem cell differentiation and hematopoiesis, scientific research visualization with cellular detail"
    },
    {
        id: 120,
        title: "Personal Genome Sequencing Affordable",
        prompt: "DNA sequencing machine analyzing personal genome, showing affordable genomics technology with DNA double helix visualization, modern laboratory setting with biotechnology equipment"
    },
    {
        id: 119,
        title: "Personal Genome Sequencing Under $2000",
        prompt: "Accessible genome sequencing technology showing DNA analysis workflow, affordable biotechnology for personalized medicine, scientific visualization with cost-effective equipment"
    },
    {
        id: 118,
        title: "Bio-Innovators Grow Vibrant Colors",
        prompt: "Biologically grown vibrant pigments and dyes produced by engineered microorganisms, showing colorful bacterial cultures in laboratory, sustainable biotechnology replacing toxic chemicals"
    },
    {
        id: 117,
        title: "Scientists Grow Color Without Chemicals",
        prompt: "Biological color production using living organisms, showing spectrum of naturally produced pigments from bacteria and fungi, sustainable biotech alternative to synthetic dyes"
    },
    {
        id: 116,
        title: "Shiitake Mycelium Memristors",
        prompt: "Shiitake mushroom mycelium bioelectronic memristors, showing fungal network with electronic circuits integrated, sustainable computing technology with organic materials"
    },
    {
        id: 115,
        title: "3D-printed Carotid Artery-on-Chips",
        prompt: "3D-printed carotid artery-on-chip showing blood vessel model for thrombosis research, microfluidic device with cellular detail, bioengineering visualization of vascular system"
    },
    {
        id: 98,
        title: "Self-healing Fungi Concrete",
        prompt: "Self-healing concrete with fungal mycelium repairing cracks, showing microscopic view of fungi growing through concrete structure, sustainable construction biomaterial"
    },
    {
        id: 97,
        title: "Biocement Bricks",
        prompt: "Biocement bricks grown from bacteria showing sustainable construction material, bacterial cultures producing calcium carbonate, eco-friendly building blocks with microorganism detail"
    },
    {
        id: 96,
        title: "Self-Healing Bio Concrete",
        prompt: "Bio-concrete with embedded bacteria healing structural cracks, showing Bacillus bacteria producing limestone to repair damage, sustainable infrastructure material visualization"
    },
    {
        id: 90,
        title: "Living Architecture Genetic Engineering",
        prompt: "Genetically engineered plants growing into architectural structures, showing living building materials and bio-designed construction, futuristic sustainable architecture with plant-based framework"
    },
    {
        id: 88,
        title: "MIT Self-Healing Concrete",
        prompt: "MIT self-healing concrete with bacterial spores activated by water, showing crack repair process at microscopic level, innovative biomaterial for infrastructure"
    },
    {
        id: 83,
        title: "AI Optimizes Biosensors Lead Detection",
        prompt: "AI-optimized biosensors detecting lead in drinking water, showing molecular sensors and machine learning interface, water safety biotechnology with glowing detection signals"
    },
    {
        id: 82,
        title: "Biomimetic Microspheres Bone Regeneration",
        prompt: "Biomimetic mineralized microspheres reprogramming stem cells for bone healing, showing spherical particles interacting with bone tissue, regenerative medicine visualization"
    },
    {
        id: 81,
        title: "Engineered Bacteria Target Tumors",
        prompt: "Engineered bacteria delivering precision therapy to cancer tumors, showing bacterial cells targeting tumor site, programmable bioorthogonal delivery system with molecular detail"
    },
    {
        id: 60,
        title: "Data-Driven Omics Integration",
        prompt: "Multi-omics data integration showing genomics, proteomics, and metabolomics networks, systems biology visualization with interconnected molecular pathways, data-driven biological insights"
    },
    {
        id: 45,
        title: "Data-Driven Synthetic Microbes",
        prompt: "Engineered synthetic microbes for sustainable biomanufacturing, showing modified bacteria producing valuable compounds, industrial biotechnology with fermentation tanks and molecular pathways"
    },
    {
        id: 41,
        title: "Sustainable Alternative to Single-Use Plastics",
        prompt: "Biodegradable bioplastic made from algae and seaweed extracts, showing sustainable material replacing single-use plastics, ocean-derived biomaterial with molecular structure"
    },
    {
        id: 40,
        title: "Bio-Concrete 52.5 MPa Strength",
        prompt: "High-strength bio-concrete achieving 52.5 MPa while sequestering CO2, showing bacterial carbonation process in concrete matrix, sustainable construction material capturing carbon"
    }
];

console.log(`🎨 Generating ${posts.length} images for WordPress posts\n`);

let generated = 0;
let failed = 0;

for (const post of posts) {
    const filename = `post-${post.id}.png`;
    const outputPath = path.join(OUTPUT_DIR, filename);

    console.log(`\n📝 Post ${post.id}: ${post.title}`);
    console.log(`   Generating image...`);

    try {
        const cmd = `cd ${GEMINI_SKILL_PATH} && python3 scripts/generate_image.py "${post.prompt}" "${outputPath}"`;
        const output = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
        console.log(`   ✅ Generated: ${filename}`);
        generated++;
    } catch (error) {
        console.error(`   ❌ Failed: ${error.message}`);
        failed++;
    }
}

console.log('\n' + '='.repeat(60));
console.log('📊 Generation Summary:');
console.log(`   ✅ Generated: ${generated}`);
console.log(`   ❌ Failed: ${failed}`);
console.log(`   📝 Total: ${posts.length}`);
console.log('='.repeat(60));
