# Broadcast Prompt Improvements for AI10BRO

## Current Issues
The broadcasts are too technical and scientific, reading like academic paper abstracts with:
- Heavy use of technical jargon (UMA MLIP, DFT, FastCSP, FPO algorithm, etc.)
- Focus on methodology rather than impact
- Missing the human/societal angle
- Not building community engagement

## Recommended Prompt Changes

### Current Prompts (Too Technical)
```javascript
twitter: "Create a compelling Twitter/X post about this scientific breakthrough..."
farcaster: "Focus on the crypto/web3 implications if relevant..."
```

### Improved Prompts (Community-Focused)

```javascript
const PLATFORM_PROMPTS = {
    twitter: `You are ai10bro, a friendly AI helping build a positive tech future.
Create an engaging tweet that:
- Explains WHY this matters for humanity's future (not just what it does)
- Uses simple language anyone can understand
- Includes a provocative question or call-to-action
- Sparks curiosity and conversation
Must be under 240 characters. Add 1-2 relevant hashtags like #FutureTech #HumanAI #Web3`,

    bluesky: `You are ai10bro, bridging cutting-edge tech with human needs.
Write a post that:
- Connects this innovation to real-world benefits
- Makes complex ideas accessible and exciting
- Encourages community discussion
- Shows optimism about our collective future
Must be under 250 characters. Be conversational, not academic.`,

    telegram: `You are ai10bro, your community's guide to transformative technology.
Create a broadcast that:
- Opens with an attention-grabbing question or statement
- Explains the human impact FIRST, technical details SECOND
- Uses analogies to make complex ideas relatable
- Includes a "What this means for you" section
- Ends with thought-provoking questions for discussion
Add emojis for readability. Maximum 3900 characters.`,

    farcaster: `You are ai10bro, connecting web3 builders with breakthrough ideas.
Write a cast that:
- Highlights how this could reshape decentralized systems
- Focuses on practical applications, not just theory
- Invites builders to explore possibilities
- Balances technical accuracy with accessibility
Must be under 320 characters. Be inspiring, not dry.`,

    threads: `You are ai10bro, making tomorrow's tech understandable today.
Create a post that:
- Tells a mini-story about the innovation's potential
- Uses vivid imagery and relatable examples
- Emphasizes positive societal impact
- Invites readers to imagine the possibilities
Must be under 500 characters. Be visual and optimistic.`
};
```

## Content Filtering Guidelines

Add these filters before broadcast generation:

```javascript
// Filter overly technical papers
function shouldCreateBroadcast(content, title) {
    // Skip pure math/theory papers
    const skipKeywords = [
        'arxiv.org/abs/math',
        'proof of theorem',
        'convergence analysis',
        'bounds for'
    ];

    // Prioritize human-impact topics
    const priorityKeywords = [
        'healthcare', 'climate', 'education', 'accessibility',
        'sustainability', 'community', 'safety', 'wellbeing',
        'creative', 'artistic', 'social good', 'ethical AI'
    ];

    const contentLower = (content + title).toLowerCase();

    // Skip if too theoretical
    if (skipKeywords.some(kw => contentLower.includes(kw))) {
        return false;
    }

    // Prioritize human-centered content
    const hasPriority = priorityKeywords.some(kw => contentLower.includes(kw));

    // For technical content, only broadcast if it has clear applications
    if (!hasPriority && contentLower.includes('arxiv')) {
        return contentLower.includes('application') ||
               contentLower.includes('real-world') ||
               contentLower.includes('practical');
    }

    return true;
}
```

## Example Transformations

### Before (Current Style)
"FastCSP uses UMA MLIP for rapid & accurate crystal structure prediction in molecular crystals. Eliminates need for DFT and classical force fields, enabling high-throughput screening. Open-source release democratizes access to advanced CSP tools."

### After (Improved Style)
"Imagine designing new medicines 1000x faster! This breakthrough lets scientists predict crystal structures instantly, speeding up drug discovery. The best part? It's now free for everyone to use. How might this change healthcare? 💊🔬"

### Before (Current Style)
"New paper explores using LLMs with symbolic solvers for accurate tax filing, reducing errors and costs. Integrates plain-text rules into formal logic for improved performance & auditability."

### After (Improved Style)
"AI just made tax filing actually make sense! By combining language understanding with logic systems, we can now catch errors before they happen. Could this finally end tax season stress? What financial tasks would you want AI to simplify? 💰"

## Implementation Steps

1. Update `generate-platform-broadcasts.js` with new prompts
2. Add content filtering before broadcast generation
3. Implement quality scoring based on engagement potential
4. A/B test different prompt styles
5. Monitor engagement metrics

## Success Metrics
- Higher engagement rates (likes, replies, shares)
- More accessible language (readability scores)
- Increased community discussion
- Better balance of technical/human content
- Growing follower count across platforms