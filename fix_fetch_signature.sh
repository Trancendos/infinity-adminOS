#!/bin/bash
workers=(
  "ai-api"
  "api-gateway"
  "files-api"
  "hive"
  "infinity-one"
  "lighthouse"
  "monitoring-dashboard"
  "void"
  "ws-api"
  "auth-api"
)

for worker in "${workers[@]}"; do
  file="workers/$worker/src/index.ts"
  if [ -f "$file" ]; then
    echo "Fixing $file"
    # Replace ctx: ExecutionContext with _ctx: ExecutionContext
    sed -i 's/ctx: ExecutionContext/_ctx: ExecutionContext/g' "$file"
    # Also handle the case where it was already added but not used
    sed -i 's/async fetch(request: Request, env: Env): Promise<Response>/async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response>/g' "$file"
  fi
done
