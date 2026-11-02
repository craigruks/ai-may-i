---
title: Task runners
description: Put may-i in front of your deploy recipes with just, make or a shell alias.
---

A recipe that starts with `may-i` gates every run of it, by you or by an agent. The
agent runs the recipe it already knows, and the tier comes from the vault in each
reference in the recipe's env file.

The examples below are in the repo:
[`examples/justfile`](https://github.com/craigruks/ai-may-i/blob/main/examples/justfile),
[`examples/.env.staging`](https://github.com/craigruks/ai-may-i/blob/main/examples/.env.staging),
[`examples/.env.prod`](https://github.com/craigruks/ai-may-i/blob/main/examples/.env.prod)
and [`examples/AGENTS.snippet.md`](https://github.com/craigruks/ai-may-i/blob/main/examples/AGENTS.snippet.md).
CI runs `just --dry-run` on every recipe, and
[`test/examples.test.ts`](https://github.com/craigruks/ai-may-i/blob/main/test/examples.test.ts)
checks that staging comes out `allow` and prod comes out `ask`.

## The env files

Each file has `op://` references only, never values. `op run` resolves them for the one
command it starts. may-i reads the same file and decides on the vault in each reference.

```sh
# .env.prod
DATABASE_URL=op://Prod/postgres/url
STRIPE_SECRET_KEY=op://Prod/stripe/secret-key
CLOUDFLARE_API_TOKEN=op://Prod/cloudflare/api-token
```

`.env.staging` has the same variables, in the `Staging` vault. With
`{ "allow": ["op://Staging/*"] }` in your config, a staging recipe runs at once and a prod
recipe asks.

## just

```just
# Staging: allowed, so it runs straight away and is still recorded.
deploy-staging:
    may-i -- op run --env-file .env.staging -- ./deploy.sh staging

# Prod: asks first. The reason is shown in the prompt and kept in the receipt.
deploy-prod reason="ship main to production":
    may-i --reason {{ quote(reason) }} -- op run --env-file .env.prod -- ./deploy.sh production

# Any one-off command with prod credentials: `just prod ./scripts/backfill.sh --since 7d`.
[positional-arguments]
prod +cmd:
    may-i --reason "just prod $*" -- op run --env-file .env.prod -- "$@"
```

`just deploy-prod "rotate the Stripe key"` passes a reason of your own.

## make

```make
deploy-staging:
	may-i -- op run --env-file .env.staging -- ./deploy.sh staging

deploy-prod:
	may-i --reason "ship main to production" -- op run --env-file .env.prod -- ./deploy.sh production
```

## A shell alias

```sh
alias prod='may-i -- op run --env-file .env.prod --'
prod ./scripts/backfill.sh --since 7d
```

## Exit codes in a script

may-i returns the command's own exit code when it ran, and 77 when it refused, so a
script can tell "refused" from "ran and failed":

```sh
may-i --reason "nightly backfill" -- op run --env-file .env.prod -- ./scripts/backfill.sh
case $? in
  0) echo "done" ;;
  77) echo "refused: nobody approved it" ;;
  *) echo "the backfill failed" ;;
esac
```

## Tell your agents

Paste [`examples/AGENTS.snippet.md`](https://github.com/craigruks/ai-may-i/blob/main/examples/AGENTS.snippet.md)
into your repo's AGENTS.md. It tells an agent to start any prod command with `may-i --`,
to give a `--reason`, to keep secrets as `op://` references, and to stop on exit 77
instead of trying again.
