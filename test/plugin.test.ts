import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import plugin, { readSkill, SKILL_ID } from "../src/index.ts";
import { leadGuidance } from "../src/guidance.ts";
import { parseModel, readOptions } from "../src/options.ts";
import { applyRole, loadPrompt, ROLE_NAMES, rolePermissions, type AgentDraft } from "../src/roles.ts";
import { reroleTrailingPrefill } from "../src/step-cap.ts";

const ROOT = new URL("..", import.meta.url).pathname;
const opts = (raw: unknown = {}) => readOptions(raw, ROLE_NAMES);

test("parseModel splits provider, model, and variant", () => {
  assert.deepEqual(parseModel("openai/gpt-5#high", "m"), { providerID: "openai", id: "gpt-5", variant: "high" });
  assert.deepEqual(parseModel("openrouter/google/gemini-2.5-flash", "m"), { providerID: "openrouter", id: "google/gemini-2.5-flash" });
  for (const bad of ["gpt-5", "/gpt-5", "openai/", "a/b#c#d", "a/b#", 5]) assert.throws(() => parseModel(bad, "m"));
});

test("readOptions defaults: no tiers, build and plan lead, temp scratch dir, step-cap fix on", () => {
  const o = opts(undefined);
  assert.deepEqual(o.models, {});
  assert.deepEqual(o.leadAgents, ["build", "plan"]);
  assert.equal(o.scratchDir, join(tmpdir(), "opencode-fusion"));
  assert.equal(o.stepCapFix, true);
});

test("readOptions rejects typos instead of ignoring them", () => {
  assert.throws(() => opts({ models: { heavy: "a/b" } }), /not a tier/);
  assert.throws(() => opts({ roles: { sidekik: {} } }), /not a Fusion role/);
  assert.throws(() => opts({ roles: { sidekick: { steps: 0 } } }), /positive integer/);
  assert.throws(() => opts({ scratchDir: "relative/dir" }), /absolute/);
  assert.throws(() => opts({ leadAgents: "build" }), /list/);
  assert.throws(() => opts({ roles: { scout: { disabled: "true" } } }), /true or false/);
  assert.throws(() => opts({ stepCapFix: "false" }), /true or false/);
});

test("model precedence: role override, then tier, then inherit", () => {
  const o = opts({ models: { light: "p/light", medium: "p/medium#high" }, roles: { reviewer: { model: "q/review" } } });
  const draft = (role: (typeof ROLE_NAMES)[number]) => {
    const a: AgentDraft = {};
    applyRole(a, role, o, "prompt");
    return a;
  };
  assert.deepEqual(draft("worker").model, { providerID: "p", id: "light" });
  assert.deepEqual(draft("sidekick").model, { providerID: "p", id: "medium", variant: "high" });
  assert.deepEqual(draft("reviewer").model, { providerID: "q", id: "review" });
  const none: AgentDraft = {};
  applyRole(none, "sidekick", opts(), "prompt");
  assert.equal(none.model, undefined);
});

test("applyRole appends rules after existing ones and sets steps and mode", () => {
  const a: AgentDraft = { permissions: [{ action: "*", resource: "*", effect: "allow" }] };
  applyRole(a, "explore", opts({ roles: { explore: { steps: 12 } } }), "p");
  assert.equal(a.mode, "subagent");
  assert.equal(a.steps, 12);
  assert.deepEqual(a.permissions![0], { action: "*", resource: "*", effect: "allow" });
  assert.deepEqual(a.permissions![1], { action: "*", resource: "*", effect: "deny" });
});

/** Last matching rule wins, as in OpenCode. */
const decide = (rules: ReturnType<typeof rolePermissions>, action: string, resource = "x") => {
  const glob = (pattern: string, value: string) => new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`).test(value);
  let effect = "allow";
  for (const r of rules) if (glob(r.action, action) && glob(r.resource, resource)) effect = r.effect;
  return effect;
};

test("read-only lanes cannot edit or run commands; verifier can run commands but not edit", () => {
  for (const role of ["explore", "reviewer", "scout"] as const) {
    const rules = rolePermissions(role, "/scratch");
    assert.equal(decide(rules, "edit"), "deny", role);
    assert.equal(decide(rules, "shell"), "deny", role);
    assert.equal(decide(rules, "read"), "allow", role);
    assert.equal(decide(rules, "read", "app/.env"), "ask", role);
    assert.equal(decide(rules, "external_directory", "/scratch/review.diff"), "allow", role);
    assert.equal(decide(rules, "external_directory", "/etc/passwd"), "ask", role);
  }
  const verifier = rolePermissions("verifier", "/scratch");
  assert.equal(decide(verifier, "shell"), "allow");
  assert.equal(decide(verifier, "edit"), "deny");
  assert.equal(decide(rolePermissions("scout", "/s"), "webfetch"), "allow");
  for (const role of ROLE_NAMES) {
    const rules = rolePermissions(role, "/s");
    assert.equal(decide(rules, "subagent"), "deny", role);
    assert.equal(decide(rules, "question"), "deny", role);
    assert.equal(decide(rules, "skill", "fusion"), "deny", role);
  }
});

test("every role has a non-empty prompt with a RESULT line", () => {
  for (const role of ROLE_NAMES) assert.match(loadPrompt(role), /RESULT: /, role);
});

test("lead guidance names the scratch dir and drops disabled lanes", () => {
  const full = leadGuidance(opts({ scratchDir: "/work/scratch" }));
  assert.match(full, /`\/work\/scratch`/);
  assert.match(full, /`sidekick`/);
  assert.match(full, /cheap to check/);
  const lean = leadGuidance(opts({ roles: { sidekick: { disabled: true }, worker: { disabled: true }, general: { disabled: true }, explore: { disabled: true }, scout: { disabled: true }, reviewer: { disabled: true } } }));
  assert.doesNotMatch(lean, /sidekick|cheap to check|cannot run commands/);
  assert.match(lean, /`verifier` runs named checks/);
  assert.ok(full.split(/\s+/).length < 320, "guidance stays short");
});

test("reroleTrailingPrefill moves only a trailing text-only assistant turn", () => {
  const prefill = [{ role: "user", content: [{ type: "text", text: "go" }] }, { role: "assistant", content: [{ type: "text", text: "MAX STEPS" }] }];
  assert.equal(reroleTrailingPrefill(prefill), true);
  assert.equal(prefill[1].role, "user");
  const toolCall = [{ role: "assistant", content: [{ type: "tool-call", id: "1" }] }];
  assert.equal(reroleTrailingPrefill(toolCall), false);
  const toolResult = [{ role: "assistant", content: [{ type: "text", text: "x" }] }, { role: "tool", content: [] }];
  assert.equal(reroleTrailingPrefill(toolResult), false);
  assert.equal(reroleTrailingPrefill([]), false);
  assert.equal(reroleTrailingPrefill([{ role: "assistant", content: [] }]), false);
});

test("readSkill parses frontmatter", () => {
  const { description, content } = readSkill(readFileSync(join(ROOT, "skills/fusion/SKILL.md"), "utf8"));
  assert.match(description, /^Procedure for splitting work/);
  assert.match(content, /^# Fusion/);
});

function fakeContext(options: unknown, sessions: Record<string, { parentID?: string }>) {
  const agents = new Map<string, Record<string, unknown>>([["general", { id: "general", permissions: [] }]]);
  const skills = new Map<string, unknown>();
  const hooks: Record<string, (event: any) => Promise<void> | void> = {};
  const ctx = {
    options,
    agent: {
      transform: async (fn: (editor: any) => void) =>
        fn({
          get: (id: string) => agents.get(id),
          update: (id: string, f: (a: any) => void) => {
            const a = agents.get(id) ?? { id, permissions: [] };
            agents.set(id, a);
            f(a);
          },
        }),
    },
    skill: { transform: async (fn: (editor: any) => void) => fn({ get: (id: string) => skills.get(id), add: (s: any) => skills.set(s.id, s) }) },
    session: {
      get: async ({ sessionID }: { sessionID: string }) => {
        if (!(sessionID in sessions)) throw new Error("missing");
        return sessions[sessionID];
      },
      hook: async (name: string, fn: (event: any) => void) => {
        hooks[name] = fn;
      },
    },
  };
  return { ctx, agents, skills, hooks };
}

const contextEvent = (agent: string, sessionID: string, last = { role: "user", content: [{ type: "text", text: "hi" }] }) => ({
  agent,
  sessionID,
  system: [] as { type: string; text: string }[],
  messages: [last],
});

test("plugin registers lanes and the skill, and guides only top-level lead sessions", async () => {
  const { ctx, agents, skills, hooks } = fakeContext({ models: { light: "p/l" }, roles: { scout: { disabled: true } } }, {
    top: {},
    child: { parentID: "top" },
  });
  await plugin.setup(ctx as never);
  assert.deepEqual([...agents.keys()].sort(), ["explore", "general", "reviewer", "sidekick", "verifier", "worker"]);
  assert.deepEqual((agents.get("worker") as AgentDraft).model, { providerID: "p", id: "l" });
  assert.ok(skills.has(SKILL_ID));

  const lead = contextEvent("build", "top");
  await hooks.context(lead);
  assert.equal(lead.system.length, 1);
  assert.match(lead.system[0].text, /^# Fusion mode/);

  for (const [agent, sessionID] of [["build", "child"], ["sidekick", "top"], ["build", "unknown"]]) {
    const event = contextEvent(agent, sessionID);
    await hooks.context(event);
    assert.equal(event.system.length, 0, `${agent}/${sessionID}`);
  }
});

test("plugin step-cap fix can be turned off", async () => {
  for (const stepCapFix of [true, false]) {
    const { ctx, hooks } = fakeContext({ stepCapFix }, { s: { parentID: "p" } });
    await plugin.setup(ctx as never);
    const event = contextEvent("worker", "s", { role: "assistant", content: [{ type: "text", text: "MAX" }] });
    await hooks.context(event);
    assert.equal(event.messages[0].role, stepCapFix ? "user" : "assistant");
  }
});

test("published files contain nothing machine- or person-specific", () => {
  const banned = /\/home\/|\/Users\/|\.local\/tmp|cliproxy|lamim|lr7|claude-opus|gpt-6|gemini-3/i;
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
  const files = ["src", "prompts", "skills"].flatMap((dir) => walk(join(ROOT, dir))).concat(["index.ts", "README.md", "CHANGELOG.md", "package.json"].map((name) => join(ROOT, name)));
  for (const file of files) assert.doesNotMatch(readFileSync(file, "utf8"), banned, file);
});