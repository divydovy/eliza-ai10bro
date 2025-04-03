export const tweetTemplate = `
# Context
{{recentMessages}}

# Topics
{{topics}}

# Post Directions
{{postDirections}}

# Recent interactions between {{agentName}} and other users:
{{recentPostInteractions}}

# Task
Generate a tweet that:
1. Relates to the recent conversation or requested topic
2. Matches the character's style and voice
3. Is concise and engaging
4. Must be UNDER 257 characters (this is a strict requirement as we need to reserve 23 characters for the URL that will be automatically appended)
5. Speaks from the perspective of {{agentName}}

Generate only the tweet text, no other commentary. Do not include any URLs - they will be added automatically.`;
