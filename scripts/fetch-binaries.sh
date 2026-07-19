#!/usr/bin/env bash
# Baixa os binarios estaticos (yt-dlp e ffmpeg) para resources/bin,
# que sao embarcados no AppImage via extraResources (electron-builder).
# Rode antes de `npm run dist` num ambiente novo.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p resources/bin

echo "-> yt-dlp (standalone Linux)"
curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o resources/bin/yt-dlp
chmod +x resources/bin/yt-dlp

echo "-> ffmpeg (estatico amd64)"
tmp="$(mktemp -d)"
curl -fsSL https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz -o "$tmp/ffmpeg.tar.xz"
tar -xf "$tmp/ffmpeg.tar.xz" -C "$tmp"
cp "$tmp"/ffmpeg-*-static/ffmpeg resources/bin/ffmpeg
chmod +x resources/bin/ffmpeg
rm -rf "$tmp"

echo "OK:"
resources/bin/yt-dlp --version | head -1
resources/bin/ffmpeg -version | head -1
