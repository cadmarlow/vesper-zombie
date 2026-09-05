#!/bin/zsh
cd -- "$(dirname -- "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "VESPER a besoin de Node.js. Installez Node.js puis relancez ce fichier."
  read -r "?Appuyez sur Entrée pour fermer."
  exit 1
fi
node scripts/serve.mjs --open
