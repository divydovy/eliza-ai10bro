#!/usr/bin/env python3

"""
Generate illustrative imagery for AI10BRO broadcasts using Gemini Nano Banana Pro.
V2: Uses Claude to generate better prompts from full documents + improved visual style.
"""

import os
import sys
import json
import sqlite3
from pathlib import Path
from anthropic import Anthropic
from google import genai
from google.genai import types


def get_document_content(document_id, db_path="agent/data/db.sqlite"):
    """Fetch the full document content from the memories table."""
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        cursor.execute("""
            SELECT content
            FROM memories
            WHERE id = ?
        """, (document_id,))

        result = cursor.fetchone()
        conn.close()

        if result:
            content = json.loads(result[0])
            return content.get('text', '')
        return None
    except Exception as e:
        print(f"⚠️  Could not fetch document: {e}", file=sys.stderr)
        return None


def create_image_prompt_with_llm(document_text, broadcast_summary):
    """
    Use Claude to analyze the full document and create an optimal Gemini image prompt.

    This produces much better results than using just the broadcast summary because:
    - Claude can identify the most visualizable concepts
    - It can extract technical details for accuracy
    - It can suggest better metaphors and visual compositions
    """

    anthropic_key = os.environ.get("ANTHROPIC_API_KEY")
    if not anthropic_key:
        print("⚠️  ANTHROPIC_API_KEY not found, falling back to basic prompt", file=sys.stderr)
        return create_fallback_prompt(broadcast_summary)

    try:
        client = Anthropic(api_key=anthropic_key)

        prompt = f"""You are an expert at creating prompts for AI image generation.

Analyze this technical article and create a detailed Gemini Nano Banana Pro image prompt that will generate an engaging, informative illustration.

ARTICLE:
{document_text[:3000]}

BROADCAST SUMMARY:
{broadcast_summary}

STYLE REQUIREMENTS:
- Modern, tech-forward aesthetic with depth and dimension
- Use gradients, subtle shadows, and layering for visual interest
- Bold, vibrant color palette (3-4 colors) - avoid pastels
- Isometric or 3D perspective where appropriate
- Include clear text labels and annotations
- Professional but eye-catching - think tech conference slides
- Add "© ai10bro" watermark in bottom right corner
- White or light gradient background
- 16:9 aspect ratio, optimized for social media

Your prompt should:
1. Identify the key technical concept to visualize
2. Suggest specific visual elements (icons, diagrams, flows)
3. Describe the composition and layout
4. Specify colors and visual style
5. Include relevant text labels or callouts

Generate ONLY the image prompt, no explanation. Make it detailed and specific for best results."""

        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=500,
            messages=[{"role": "user", "content": prompt}]
        )

        generated_prompt = response.content[0].text.strip()
        print(f"   🤖 Generated prompt using Claude ({len(generated_prompt)} chars)")
        return generated_prompt

    except Exception as e:
        print(f"⚠️  Claude prompt generation failed: {e}", file=sys.stderr)
        return create_fallback_prompt(broadcast_summary)


def create_fallback_prompt(broadcast_text):
    """Fallback prompt if LLM generation fails."""
    return f"""Create a modern, engaging tech illustration for this concept:

"{broadcast_text}"

Style: Modern tech aesthetic with depth - use gradients, subtle shadows, isometric perspective. Bold vibrant colors (avoid pastels). Include clear text labels. Professional but eye-catching.

Add "© ai10bro" watermark in bottom right.
White/light gradient background. 16:9 format."""


def generate_image(document_id, broadcast_text, output_dir="broadcast-images"):
    """
    Generate an image using:
    1. Full document from database
    2. Claude to create optimal Gemini prompt
    3. Gemini Nano Banana Pro to generate the image

    Args:
        document_id: ID to fetch full document content
        broadcast_text: Broadcast summary (fallback if doc not found)
        output_dir: Directory to save the image

    Returns:
        Path to the saved image, or None if generation fails
    """

    # Check for Gemini API key
    gemini_key = os.environ.get("GEMINI_API_KEY")
    if not gemini_key:
        print("❌ GEMINI_API_KEY not found in environment", file=sys.stderr)
        return None

    try:
        print(f"🎨 Generating image for document {document_id}...")

        # Try to get full document content
        document_content = get_document_content(document_id)

        if document_content:
            print(f"   📄 Loaded full document ({len(document_content)} chars)")
            # Use LLM to create optimal prompt from full document
            image_prompt = create_image_prompt_with_llm(document_content, broadcast_text)
        else:
            print(f"   ⚠️  Using broadcast summary only")
            image_prompt = create_fallback_prompt(broadcast_text)

        # Initialize Gemini client
        client = genai.Client(api_key=gemini_key)

        print(f"   🖼️  Generating with Gemini Nano Banana Pro...")

        # Generate image
        response = client.models.generate_content(
            model="gemini-3-pro-image-preview",
            contents=[image_prompt],
            config=types.GenerateContentConfig(
                response_modalities=['TEXT', 'IMAGE'],
                image_config=types.ImageConfig(
                    aspect_ratio="16:9",
                    image_size="2K"
                ),
            )
        )

        # Extract and save image
        for part in response.parts:
            if part.inline_data:
                os.makedirs(output_dir, exist_ok=True)
                output_path = os.path.join(output_dir, f"{document_id}.png")
                image = part.as_image()
                image.save(output_path)

                print(f"✅ Image saved to: {output_path}")
                return output_path
            elif part.text:
                print(f"   💭 Gemini: {part.text[:100]}...")

        print("❌ No image generated in response", file=sys.stderr)
        return None

    except Exception as e:
        print(f"❌ Error generating image: {str(e)}", file=sys.stderr)
        return None


def main():
    """CLI interface"""
    if len(sys.argv) < 3:
        print("Usage: python generate-broadcast-image-v2.py <document_id> <broadcast_text>")
        print("\nExample:")
        print('  python generate-broadcast-image-v2.py doc-123 "MIT develops new battery technology"')
        sys.exit(1)

    document_id = sys.argv[1]
    broadcast_text = " ".join(sys.argv[2:])

    image_path = generate_image(document_id, broadcast_text)

    if image_path:
        print(f"\n✅ Success! Image path: {image_path}")
        sys.exit(0)
    else:
        print("\n❌ Failed to generate image")
        sys.exit(1)


if __name__ == "__main__":
    main()
