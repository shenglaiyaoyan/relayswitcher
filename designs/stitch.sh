#!/bin/bash
# Stitch 官方包便捷调用(用法:./stitch.sh tool <name> -d '<json>')
# API key 放在同目录 stitch-key.txt(已 gitignore,不入库)
export NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:7897 HTTP_PROXY=http://127.0.0.1:7897
export STITCH_API_KEY="$(cat "$(dirname "$0")/stitch-key.txt" | tr -d '\r\n')"
cd "$(dirname "$0")"
exec npx -y @_davideast/stitch-mcp "$@"
