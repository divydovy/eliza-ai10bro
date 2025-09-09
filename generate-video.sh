
#!/bin/bash
# Generate video with ffmpeg + text overlays

# Create text overlays
ffmpeg -f lavfi -i color=c=purple:s=1080x1920:d=12 \
  -vf "drawtext=text='BREAKTHROUGH':fontsize=80:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,0,2)', \
       drawtext=text='Willow Bioengineering':fontsize=60:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,2,5)', \
       drawtext=text='Sustainable Solution':fontsize=60:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,5,8)', \
       drawtext=text='Follow AI10BRO':fontsize=70:fontcolor=yellow:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,8,12)'" \
  -c:v libx264 -t 12 output.mp4
