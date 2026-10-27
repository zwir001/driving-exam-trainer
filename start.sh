#!/usr/bin/env bash
# Builds the Angular app (if needed) and starts the local server at http://localhost:8000
set -e
cd "$(dirname "$0")"
if [ ! -f app/dist/prawko/browser/index.html ]; then
  [ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"
  (cd app && npm install && npm run build)
fi
python3 tools/serve.py "$@"
