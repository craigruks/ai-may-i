// Proves where the rules come from, and that the repo file (which the gated agent can
// write) can only tighten them: never allow, never lengthen, never pick what is scanned.
// Which tier each pair of files gives is in spec/tiers.json ("config").
import { describe, expect, it } from "bun:test";
import spec from "../spec/tiers.json" with { type: "json" };
import { DEFAULT_CONFIG, effectiveRules, type LoadInput, loadConfig } from "../src/config.js";
import { decide } from "../src/policy.js";

const USER = "/home/u/.config/may-i/config.json";
const REPO = "/work/repo/.may-i.json";

function input(files: Record<string, string>, env: LoadInput["env"] = {}): LoadInput {
  return { env, home: "/home/u", cwd: "/work/repo/sub", readText: (p) => files[p] ?? null };
}

interface ConfigCase {
  name: string;
  userFile?: string;
  repoFile?: string;
  reference: string;
  tier: string;
}
const cases: ConfigCase[] = spec.config;

describe("loadConfig: the tier a pair of files gives", () => {
  it.each(cases)("$name", (c) => {
    const files: Record<string, string> = {};
    if (c.userFile !== undefined) files[USER] = c.userFile;
    if (c.repoFile !== undefined) files[REPO] = c.repoFile;
    const rules = effectiveRules(loadConfig(input(files)).config);
    const tier: string = decide({ references: [c.reference], unreadable: [] }, rules).tier;
    expect(tier).toBe(c.tier);
  });
});

describe("loadConfig", () => {
  it("asks for everything by default, with a 120 s timeout", () => {
    const { config, warnings } = loadConfig(input({}));
    expect(config).toEqual(DEFAULT_CONFIG);
    expect(config.timeoutSeconds).toBe(120);
    expect(warnings).toEqual([]);
  });

  it("reads the user file under XDG_CONFIG_HOME, and the repo file from a parent of the cwd", () => {
    const files = {
      "/xdg/may-i/config.json": '{"allow":["op://Staging/*"]}',
      [REPO]: '{"deny":["op://Prod/root/*"]}',
    };
    const { config } = loadConfig(input(files, { XDG_CONFIG_HOME: "/xdg" }));
    expect(config.user.allow).toEqual(["op://Staging/*"]);
    expect(config.repo.deny).toEqual(["op://Prod/root/*"]);
  });

  it("lets a repo file shorten the timeout, never lengthen it", () => {
    const timeout = (repo: number) =>
      loadConfig(input({ [USER]: '{"timeoutSeconds":90}', [REPO]: `{"timeoutSeconds":${repo}}` }))
        .config.timeoutSeconds;
    expect(timeout(30)).toBe(30);
    expect(timeout(300)).toBe(90);
  });

  it("keeps scan files and file flags in the user's hands", () => {
    const files = {
      [USER]: '{"scanFiles":[".env.schema"],"fileFlags":["--env"]}',
      [REPO]: '{"scanFiles":["/tmp/planted"]}',
    };
    const { config } = loadConfig(input(files));
    expect(config.scanFiles).toEqual([".env.schema"]);
    expect(config.fileFlags).toEqual(["--env-file", "--path", "--env"]);
  });

  it.each([
    ["a repo allow", { [REPO]: '{"allow":["op://*"]}' }, "ignored `allow`"],
    ["a repo scan file", { [REPO]: '{"scanFiles":["x"]}' }, "ignored `scanFiles`"],
    ["a bad field", { [USER]: '{"deny":"op://Prod/*"}' }, "`deny` must be a list of strings"],
    ["an unknown key", { [USER]: '{"denyy":["op://Prod/*"]}' }, "unknown key `denyy`"],
    ["a file that is not JSON", { [USER]: "{" }, "not valid JSON"],
  ])("says what it did with %s", (_, files, warning) => {
    expect(loadConfig(input(files)).warnings.join("\n")).toContain(warning);
  });
});
