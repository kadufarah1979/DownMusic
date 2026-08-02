#!/usr/bin/env bash
# Baixa os binarios estaticos (yt-dlp e ffmpeg) para resources/bin,
# que sao embarcados no AppImage via extraResources (electron-builder).
# Rode antes de `npm run dist` num ambiente novo.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p resources/bin

# mesma fonte e mesmas flags do CI (.github/workflows/build.yml)
DL=(curl -fsSL --retry 3 --retry-delay 5 --retry-all-errors --max-time 180)

echo "-> yt-dlp (standalone Linux)"
"${DL[@]}" https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o resources/bin/yt-dlp
chmod +x resources/bin/yt-dlp

echo "-> ffmpeg (estatico amd64)"
tmp="$(mktemp -d)"
"${DL[@]}" https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-linux64-gpl.tar.xz -o "$tmp/ffmpeg.tar.xz"
tar -xf "$tmp/ffmpeg.tar.xz" -C "$tmp"
cp "$tmp"/ffmpeg-master-latest-linux64-gpl/bin/ffmpeg resources/bin/ffmpeg
chmod +x resources/bin/ffmpeg
rm -rf "$tmp"

echo "OK:"
resources/bin/yt-dlp --version | head -1
resources/bin/ffmpeg -version | head -1
