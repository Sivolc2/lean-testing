#!/usr/bin/env bash
set -e

export PATH="$HOME/.elan/bin:$PATH"

echo "==> Building Lean simulator..."
lake build

echo "==> Generating visualizer/trajectory.json..."
lake exe lean-testing

echo "==> Installing npm deps..."
npm install --silent

echo "==> Starting server at http://localhost:8080"
npx http-server visualizer -p 8080 -c-1
