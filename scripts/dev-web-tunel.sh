#!/usr/bin/env bash
# Servidor web + TÚNEL público (ngrok do Expo). Para alguém de FORA da rede
# poder abrir o Honra — testes com pessoas reais que não estão no mesmo Wi-Fi.
# O túnel do Expo entra direto na app; o localtunnel mete uma página de aviso
# em inglês pelo caminho, e a primeira impressão de quem testa não pode ser essa.
export PATH="$HOME/.local/nodejs/bin:$PATH"
cd "$(dirname "$0")/.."
exec npx expo start --web --tunnel --port 8081
