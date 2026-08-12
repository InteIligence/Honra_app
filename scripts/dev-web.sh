#!/usr/bin/env bash
export PATH="$HOME/.local/nodejs/bin:$PATH"
cd "$(dirname "$0")/.."
exec npx expo start --web --port 8081
