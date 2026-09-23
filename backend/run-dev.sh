#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if ! python3 -c "import uvicorn" >/dev/null 2>&1; then
  echo "uvicorn is not installed in the active Python environment."
  echo
  echo "Install backend dependencies with:"
  echo "  python3 -m pip install fastapi uvicorn python-dotenv qdrant-client google-genai"
  echo
  echo "Then run:"
  echo "  ./run-dev.sh"
  exit 1
fi

python3 -m uvicorn src.main:app --host 127.0.0.1 --port 8000 --reload
