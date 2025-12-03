#!/usr/bin/env python3

"""
Generate illustrative imagery for AI10BRO broadcasts using Gemini Nano Banana Pro.
Uses a standardized prompt style to create unique, explanatory visuals.
"""

import os
import sys
import base64
from google import genai
from google.genai import types

def create_image_prompt(broadcast_text):
    """
    Transform broadcast text into a standardized image generation prompt.

    Style guidelines:
    - Clean, minimalist illustrations
    - Infographic-style where appropriate
    - Avoid generic AI art aesthetics
    - Focus on clarity and information communication
    """

    # Extract key concepts from broadcast
    # This is a simplified version - could use LLM for better extraction
    prompt = f"""Create a clean, professional illustration that explains or visualizes this concept:

"{broadcast_text}"

Style requirements:
- Minimalist, infographic-style design
- Use a limited color palette (2-3 colors max)
- Clear, simple shapes and icons
- Avoid photorealism - use flat design or line art
- Include text labels if helpful for clarity
- White or light background
- Professional, educational tone

The image should help viewers quickly understand the key concept or breakthrough mentioned in the text."""

    return prompt


def generate_image(broadcast_text, broadcast_id, output_dir="broadcast-images"):
    """
    Generate an image for a broadcast using Gemini Nano Banana Pro.

    Args:
        broadcast_text: The text content of the broadcast
        broadcast_id: Unique ID for the broadcast (used in filename)
        output_dir: Directory to save the image

    Returns:
        Path to the saved image, or None if generation fails
    """

    # Check for API key
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("❌ GEMINI_API_KEY not found in environment", file=sys.stderr)
        return None

    try:
        # Initialize Gemini client
        client = genai.Client(api_key=api_key)

        # Create standardized prompt
        prompt = create_image_prompt(broadcast_text)

        print(f"🎨 Generating image for broadcast {broadcast_id}...")
        print(f"   Using model: gemini-3-pro-image-preview (Nano Banana Pro)")

        # Generate image with Pro model for better quality
        response = client.models.generate_content(
            model="gemini-3-pro-image-preview",  # Nano Banana Pro
            contents=[prompt],
            config=types.GenerateContentConfig(
                response_modalities=['TEXT', 'IMAGE'],
                image_config=types.ImageConfig(
                    aspect_ratio="16:9",  # Good for social media
                    image_size="2K"       # High quality
                ),
            )
        )

        # Extract and save image
        for part in response.parts:
            if part.inline_data:
                # Create output directory if it doesn't exist
                os.makedirs(output_dir, exist_ok=True)

                # Save image with broadcast ID
                output_path = os.path.join(output_dir, f"{broadcast_id}.png")
                image = part.as_image()
                image.save(output_path)

                print(f"✅ Image saved to: {output_path}")
                return output_path
            elif part.text:
                # Print any text response (usually explanation of the image)
                print(f"   AI explanation: {part.text[:100]}...")

        print("❌ No image generated in response", file=sys.stderr)
        return None

    except Exception as e:
        print(f"❌ Error generating image: {str(e)}", file=sys.stderr)
        return None


def main():
    """CLI interface for testing"""
    if len(sys.argv) < 3:
        print("Usage: python generate-broadcast-image.py <broadcast_id> <broadcast_text>")
        print("\nExample:")
        print('  python generate-broadcast-image.py test-123 "MIT develops new battery technology"')
        sys.exit(1)

    broadcast_id = sys.argv[1]
    broadcast_text = " ".join(sys.argv[2:])

    image_path = generate_image(broadcast_text, broadcast_id)

    if image_path:
        print(f"\n✅ Success! Image path: {image_path}")
        sys.exit(0)
    else:
        print("\n❌ Failed to generate image")
        sys.exit(1)


if __name__ == "__main__":
    main()
