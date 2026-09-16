#!/usr/bin/env bash
# Stitch press-haptics Detox screenshots into an mp4 when Detox did not emit video.
# Bash 3.2 safe (macOS runners).
set -euo pipefail

ROOT="${1:-artifacts/detox}"

if find "$ROOT" -type f \( -name '*.mp4' -o -name '*.mov' \) 2>/dev/null | grep -q .; then
  echo "Detox already produced mp4/mov under $ROOT"
  exit 0
fi

pngs=()
while IFS= read -r png; do
  [ -n "$png" ] && pngs+=("$png")
done < <(find "$ROOT" -type f -name 'press-haptics*.png' 2>/dev/null | sort)

if [ ${#pngs[@]} -eq 0 ]; then
  echo "No press-haptics screenshots to stitch"
  exit 0
fi

brew list ffmpeg >/dev/null 2>&1 || brew install ffmpeg
mkdir -p "$ROOT/press-haptics-demo"
list="$ROOT/press-haptics-demo/frames.txt"
: > "$list"
for png in "${pngs[@]}"; do
  echo "file '$(pwd)/$png'" >> "$list"
  echo "duration 2" >> "$list"
done
last="${pngs[$((${#pngs[@]} - 1))]}"
echo "file '$(pwd)/$last'" >> "$list"
ffmpeg -y -f concat -safe 0 -i "$list" -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" \
  -pix_fmt yuv420p "$ROOT/press-haptics-demo/press-haptics-demo.mp4"
