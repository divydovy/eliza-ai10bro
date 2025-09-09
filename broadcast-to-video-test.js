#!/usr/bin/env node

/**
 * Broadcast to Video Test
 * 
 * This script demonstrates converting a broadcast into a video using:
 * 1. Remotion (local rendering)
 * 2. Alternative: Cheap API solutions
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Sample broadcast content
const SAMPLE_BROADCAST = {
  title: "Bioengineering River Banks",
  content: `Breakthrough: Metro Vancouver uses bioengineering with willow cuttings to stabilize river banks in Brae Island Regional Park, combating soil erosion effectively without synthetic materials.

Why it matters: This sustainable approach leverages natural resources to protect ecosystems and reduce environmental impact, showcasing a viable alternative to traditional engineering methods.`,
  scenes: [
    {
      text: "BREAKTHROUGH IN VANCOUVER",
      duration: 2
    },
    {
      text: "Bioengineering with willow cuttings",
      subtitle: "Natural river bank stabilization",
      duration: 3
    },
    {
      text: "Combating soil erosion",
      subtitle: "Without synthetic materials",
      duration: 3
    },
    {
      text: "Why it matters:",
      subtitle: "Sustainable ecosystem protection",
      duration: 2
    },
    {
      text: "AI10BRO",
      subtitle: "Follow for more eco-tech updates",
      duration: 2
    }
  ]
};

// Option 1: Create a simple Remotion project
function setupRemotion() {
  console.log('📹 Setting up Remotion test project...\n');
  
  // Create a minimal Remotion composition
  const remotionConfig = `
import { Composition } from 'remotion';
import { BroadcastVideo } from './BroadcastVideo';

export const RemotionRoot = () => {
  return (
    <Composition
      id="BroadcastVideo"
      component={BroadcastVideo}
      durationInFrames={360} // 12 seconds at 30fps
      fps={30}
      width={1080}
      height={1920} // Vertical for TikTok/Reels/Shorts
      defaultProps={{
        broadcast: ${JSON.stringify(SAMPLE_BROADCAST, null, 2)}
      }}
    />
  );
};
`;

  const videoComponent = `
import { AbsoluteFill, Sequence, useCurrentFrame, interpolate } from 'remotion';

export const BroadcastVideo = ({ broadcast }) => {
  const frame = useCurrentFrame();
  
  return (
    <AbsoluteFill style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
      {broadcast.scenes.map((scene, index) => {
        const start = index * 90; // 3 seconds per scene
        const opacity = interpolate(
          frame,
          [start, start + 10, start + 80, start + 90],
          [0, 1, 1, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        
        return (
          <Sequence from={start} durationInFrames={90} key={index}>
            <AbsoluteFill style={{
              justifyContent: 'center',
              alignItems: 'center',
              padding: 50,
              opacity
            }}>
              <h1 style={{
                fontSize: 80,
                color: 'white',
                textAlign: 'center',
                fontFamily: 'Arial Black',
                textShadow: '2px 2px 4px rgba(0,0,0,0.5)'
              }}>
                {scene.text}
              </h1>
              {scene.subtitle && (
                <p style={{
                  fontSize: 40,
                  color: 'rgba(255,255,255,0.9)',
                  textAlign: 'center',
                  marginTop: 20,
                  fontFamily: 'Arial'
                }}>
                  {scene.subtitle}
                </p>
              )}
            </AbsoluteFill>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
`;

  console.log('To use Remotion locally:');
  console.log('1. npm create video@latest broadcast-video');
  console.log('2. cd broadcast-video');
  console.log('3. Replace src/Root.tsx with the config above');
  console.log('4. npm start (preview) or npx remotion render (export)');
  console.log('\n---OR---\n');
}

// Option 2: Use a cheap API service
async function useAPIService() {
  console.log('🎬 Alternative: Use JSON2Video API (Cheaper than Remotion Lambda)\n');
  
  // JSON2Video is $0.01 per video, way cheaper than most alternatives
  const json2videoTemplate = {
    "template": "simple-text-overlay",
    "width": 1080,
    "height": 1920,
    "duration": 12,
    "fps": 30,
    "scenes": SAMPLE_BROADCAST.scenes.map((scene, i) => ({
      "start": i * 2.4,
      "duration": scene.duration,
      "elements": [
        {
          "type": "text",
          "text": scene.text,
          "style": {
            "fontSize": "80px",
            "color": "#FFFFFF",
            "fontWeight": "bold",
            "textAlign": "center"
          },
          "position": {
            "x": "50%",
            "y": "40%"
          },
          "animation": {
            "type": "fade",
            "duration": 0.5
          }
        },
        scene.subtitle && {
          "type": "text",
          "text": scene.subtitle,
          "style": {
            "fontSize": "40px",
            "color": "#FFFFFF",
            "textAlign": "center"
          },
          "position": {
            "x": "50%",
            "y": "55%"
          }
        }
      ].filter(Boolean)
    }))
  };

  console.log('JSON2Video Template:');
  console.log(JSON.stringify(json2videoTemplate, null, 2));
  console.log('\nTo render:');
  console.log('1. Get API key from https://json2video.com');
  console.log('2. Cost: ~$0.01 per video');
  console.log('3. curl -X POST https://api.json2video.com/v2/render \\');
  console.log('     -H "Authorization: Bearer YOUR_API_KEY" \\');
  console.log('     -H "Content-Type: application/json" \\');
  console.log('     -d \'' + JSON.stringify(json2videoTemplate) + '\'');
}

// Option 3: Use OpenRouter with a multimodal model
function useOpenRouter() {
  console.log('\n🤖 Option 3: Generate with OpenRouter + Local Assembly\n');
  
  const prompt = `Convert this environmental news into a TikTok video script with exact timings:

"${SAMPLE_BROADCAST.content}"

Format as:
[0-2s] Hook text
[2-4s] Main point
[4-6s] Why it matters
[6-8s] Call to action`;

  console.log('Use OpenRouter to generate script:');
  console.log('- Model: meta-llama/llama-3.2-90b-vision-instruct ($0.0009/1k tokens)');
  console.log('- Then use local ffmpeg + TTS for assembly');
  console.log('- Total cost: < $0.001 per video\n');
  
  // Save template for ffmpeg assembly
  const ffmpegScript = `
#!/bin/bash
# Generate video with ffmpeg + text overlays

# Create text overlays
ffmpeg -f lavfi -i color=c=purple:s=1080x1920:d=12 \\
  -vf "drawtext=text='BREAKTHROUGH':fontsize=80:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,0,2)', \\
       drawtext=text='Willow Bioengineering':fontsize=60:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,2,5)', \\
       drawtext=text='Sustainable Solution':fontsize=60:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,5,8)', \\
       drawtext=text='Follow AI10BRO':fontsize=70:fontcolor=yellow:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,8,12)'" \\
  -c:v libx264 -t 12 output.mp4
`;
  
  fs.writeFileSync('generate-video.sh', ffmpegScript);
  console.log('Saved ffmpeg script to generate-video.sh');
}

// Main execution
console.log('🎥 Broadcast to Video Test\n');
console.log('Sample Broadcast:');
console.log('-'.repeat(50));
console.log(SAMPLE_BROADCAST.content);
console.log('-'.repeat(50));
console.log('\n');

setupRemotion();
useAPIService();
useOpenRouter();

console.log('\n✅ Test setup complete!');
console.log('\nQuickest option: JSON2Video API ($0.01/video)');
console.log('Cheapest option: OpenRouter + ffmpeg (~$0.001/video)');
console.log('Best quality: Remotion local (free but needs setup)');