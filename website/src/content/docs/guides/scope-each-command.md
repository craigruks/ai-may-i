---
title: Name only the fields a command uses
description: One env file per recipe, and a check in pre-commit and CI that holds each one to the secrets its script reads.
sidebar:
  label: Scope each command
---

may-i lists every `op://` reference a command can reach. It cannot know which of them the
command will read, so it shows you whatever you hand it. Give five recipes one shared
`.env.prod`, and approving a database migration shows you the Stripe key and the deploy
token too. You approve fields the command never touches, and the list stops meaning
anything.

The fix is a rule in your repo, not in may-i: **each recipe gets an env file of its own,
naming only the secrets its script reads.** Then the approval lists exactly those fields.
may-i cannot enforce it at run time, so a check enforces it before the code lands.

## The rule

1. Each recipe that runs `op` behind may-i has an `--env-file` of its own, shared with no
   other recipe.
2. Every line of that file is `NAME=op://vault/item/field`.
3. The script reads every name in the file, and the file names every secret the script
   reads. A tool that reads the environment itself, such as `wrangler` reading
   `CLOUDFLARE_API_TOKEN`, is declared in the script with a `# reads: NAME` comment.

A catch-all recipe that runs any command with prod credentials breaks rule 1 by design: it
needs every field. Give each job its own recipe instead.

## The example

[`examples/`](https://github.com/craigruks/ai-may-i/tree/main/examples) follows the rule:

```just
deploy-prod reason="ship main to production":
    may-i --reason {{ quote(reason) }} -- op run --env-file .env.deploy-prod -- ./deploy.sh production

db-migrate-prod:
    may-i --reason "apply pending database migrations to production" -- op run --env-file .env.db-migrate-prod -- ./scripts/migrate.sh
```

```sh
# .env.db-migrate-prod
DATABASE_URL=op://Prod/postgres/url
```

```sh
# scripts/migrate.sh
psql "$DATABASE_URL" -f migrations/latest.sql
```

Approving `db-migrate-prod` shows one field, `op://Prod/postgres/url`.

## The check

[`examples/check-env-files.ts`](https://github.com/craigruks/ai-may-i/blob/main/examples/check-env-files.ts)
reads your justfile and fails on:

- a recipe that runs `op` behind may-i with no `--env-file` of its own, or one that runs a
  script the check cannot read, such as `"$@"`;
- an env file shared by two recipes;
- a line that is not `NAME=op://vault/item/field`;
- a name the script never reads;
- a secret the script reads that its own file does not name.

It needs nothing but Bun, or Node 23.6 or later. Copy it into your repo and add a recipe:

```just
check-env-files:
    bun check-env-files.ts
```

[`test/check-env-files.test.ts`](https://github.com/craigruks/ai-may-i/blob/main/test/check-env-files.test.ts)
proves each failure fails, so the check is known to catch what it claims.

## Run it before the code lands

As a pre-commit hook,
[`examples/pre-commit`](https://github.com/craigruks/ai-may-i/blob/main/examples/pre-commit):

```sh
cp pre-commit .githooks/pre-commit
git config core.hooksPath .githooks
```

In CI, so a commit made without the hook still cannot merge:

```yaml
- uses: oven-sh/setup-bun@v2
- run: bun check-env-files.ts
```
