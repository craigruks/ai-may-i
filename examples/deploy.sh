#!/bin/sh
# Stand-in for your deploy. wrangler reads its token from the environment without
# naming it, so the script declares the one secret it uses:
# reads: CLOUDFLARE_API_TOKEN
set -eu
npx wrangler deploy --env "$1"
