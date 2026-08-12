#!/usr/bin/env bash
# Igual ao dev-web.sh mas respeita a porta atribuída pelo harness (PORT),
# para poder correr uma 2.ª instância quando a 8081 já está ocupada.
export PATH="$HOME/.local/nodejs/bin:$PATH"
cd "$(dirname "$0")/.."
exec npx expo start --web --port "${PORT:-8082}"
