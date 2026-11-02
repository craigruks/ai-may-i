## Credentials

Paste this into your repo's AGENTS.md.

- Any recipe or command that needs production credentials starts with `may-i --`, and says why with `--reason`:
  `may-i --reason "migrate the orders table" -- op run --env-file .env.prod -- ./scripts/migrate.sh`
- Staging recipes don't need it. Staging references are allowed, and run with the staging token already in the environment.
- Name secrets as `op://` references in `.env.*` files. Never read, print or copy a token.
- When `may-i` exits 77, a person said no or nobody answered. Don't retry; say what you needed and why.
