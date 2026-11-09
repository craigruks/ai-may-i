// Proves the example checker holds each recipe to the fields its script reads: the examples
// pass, and every way of showing an approval more fields than the command uses fails.
import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkEnvFiles } from "../examples/check-env-files.js";

const EXAMPLES = fileURLToPath(new URL("../examples", import.meta.url));

/** A throwaway repo: a justfile plus whatever env files and scripts the case needs. */
function repo(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "env-files-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

const MIGRATE = '#!/bin/sh\npsql "$DATABASE_URL" -f latest.sql\n';
const recipe = (name: string, envFile: string, script = "./migrate.sh") =>
  `${name}:\n    may-i -- op run --env-file ${envFile} -- ${script}\n`;
const says = (dir: string) => checkEnvFiles(dir).map((p) => p.says);

describe("checkEnvFiles", () => {
  it("passes the examples this repo ships", () => {
    expect(checkEnvFiles(EXAMPLES)).toEqual([]);
  });

  it("passes a recipe whose env file names exactly what its script reads", () => {
    const dir = repo({
      justfile: recipe("migrate", ".env.migrate"),
      ".env.migrate": "DATABASE_URL=op://Prod/postgres/url\n",
      "migrate.sh": MIGRATE,
    });
    expect(checkEnvFiles(dir)).toEqual([]);
  });

  it("fails an env file shared by two recipes", () => {
    const dir = repo({
      justfile: recipe("migrate", ".env.prod") + recipe("migrate-again", ".env.prod"),
      ".env.prod": "DATABASE_URL=op://Prod/postgres/url\n",
      "migrate.sh": MIGRATE,
    });
    expect(says(dir)).toContain(".env.prod is shared by migrate, migrate-again");
  });

  it("fails a field the script never reads", () => {
    const dir = repo({
      justfile: recipe("migrate", ".env.migrate"),
      ".env.migrate": "DATABASE_URL=op://Prod/postgres/url\nSTRIPE_KEY=op://Prod/stripe/key\n",
      "migrate.sh": MIGRATE,
    });
    expect(says(dir)).toContain(".env.migrate names STRIPE_KEY, which ./migrate.sh never reads");
  });

  it("fails a secret the script reads that its env file does not name", () => {
    const dir = repo({
      justfile: recipe("migrate", ".env.migrate") + recipe("pay", ".env.pay", "./pay.sh"),
      ".env.migrate": "DATABASE_URL=op://Prod/postgres/url\n",
      ".env.pay": "STRIPE_KEY=op://Prod/stripe/key\n",
      "migrate.sh": `${MIGRATE}curl -u "$STRIPE_KEY:" https://api.stripe.com\n`,
      "pay.sh": '#!/bin/sh\necho "$STRIPE_KEY"\n',
    });
    expect(says(dir)).toContain("./migrate.sh reads STRIPE_KEY, which .env.migrate does not name");
  });

  it("counts a `# reads:` comment for a tool that reads the environment itself", () => {
    const dir = repo({
      justfile: recipe("deploy", ".env.deploy", "./deploy.sh"),
      ".env.deploy": "CLOUDFLARE_API_TOKEN=op://Prod/cloudflare/token\n",
      "deploy.sh": "#!/bin/sh\n# reads: CLOUDFLARE_API_TOKEN\nwrangler deploy\n",
    });
    expect(checkEnvFiles(dir)).toEqual([]);
  });

  it("fails a recipe that runs op behind may-i with no env file of its own", () => {
    const dir = repo({ justfile: 'prod +cmd:\n    may-i -- op run -- "$@"\n' });
    expect(says(dir)).toContain("prod runs op behind may-i with no --env-file of its own");
  });

  it("fails a recipe whose script it cannot read, such as a catch-all", () => {
    const dir = repo({
      justfile: 'prod +cmd:\n    may-i -- op run --env-file .env.prod -- "$@"\n',
      ".env.prod": "DATABASE_URL=op://Prod/postgres/url\n",
    });
    expect(says(dir)).toContain('prod runs "$@", which the check cannot read');
  });

  it("fails a line that is not NAME=op://vault/item/field", () => {
    const dir = repo({
      justfile: recipe("migrate", ".env.migrate"),
      ".env.migrate": "DATABASE_URL=postgres://user:hunter2@db/prod\n",
      "migrate.sh": MIGRATE,
    });
    expect(says(dir)).toContain(".env.migrate line 1 is not NAME=op://vault/item/field");
  });

  it("ignores recipes that do not run op behind may-i", () => {
    const dir = repo({ justfile: "test:\n    bun test\n" });
    expect(checkEnvFiles(dir)).toEqual([]);
  });
});
