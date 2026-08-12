#!/usr/bin/env bash
# Serve a build web NOVA (dist, exportada com o código atual) como SPA.
cd "$(dirname "$0")/.."
exec python3 -m http.server 8090 --directory dist
