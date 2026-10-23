import { readFileSync } from "node:fs";
import type { FusionOptions, ModelRef, Tier } from "./options.ts";

export interface Permission {
  action: string;
  resource: string;
  effect: "allow" | "ask" | "deny";
}

export interface RoleSpec {
  description: string;
  tier: Tier;
  steps: number;
  /** Tools a read-only lane may use; undefined means the lane keeps normal tool access. */
  tools?: readonly string[];
}

/** `general` and `explore` replace OpenCode's built-ins of the same name. */
export const ROLES = {
  sidekick: {
    description: "Persistent owner of already-decided implementation and concrete-failure debugging; resume the same session for follow-ups.",
    tier: "medium",
    steps: 40,
  },
  explore: {
    description: "Read-only codebase tracing and mapping with read, glob, and grep; no shell, so pass saved command output as a file path.",
    tier: "medium",
    steps: 30,
    tools: ["read", "glob", "grep"],
  },
  reviewer: {
    description: "One fresh-context advisory review of a diff or module; no shell, so save the diff to a file and pass its path.",
    tier: "medium",
    steps: 40,
    tools: ["read", "glob", "grep"],
  },
  scout: {
    description: "Read-only research in external docs, changelogs, and upstream sources; no shell.",
    tier: "medium",
    steps: 32,
    tools: ["read", "glob", "grep", "webfetch", "websearch"],
  },
  general: {
    description: "Bounded routine multi-step work whose result is cheap to check.",
    tier: "light",
    steps: 28,
  },
  worker: {
    description: "Mechanical edits, renames, documentation, and narrow test authoring from a fully specified contract.",
    tier: "light",
    steps: 28,
  },
  verifier: {
    description: "Runs named builds, tests, linters, or reproductions and returns concise pass/fail diagnostics; no source edits.",
    tier: "light",
    steps: 24,
    tools: ["read", "glob", "grep", "shell"],
  },
} as const satisfies Record<string, RoleSpec>;

export type RoleName = keyof typeof ROLES;
export const ROLE_NAMES = Object.keys(ROLES) as RoleName[];

const PROMPT_FILE: Record<RoleName, string> = {
  sidekick: "sidekick",
  explore: "explore",
  reviewer: "reviewer",
  scout: "scout",
  general: "worker",
  worker: "worker",
  verifier: "verifier",
};

export function loadPrompt(role: RoleName): string {
  return readFileSync(new URL(`../prompts/${PROMPT_FILE[role]}.md`, import.meta.url), "utf8").trim();
}

const rule = (action: string, effect: Permission["effect"] = "allow", resource = "*"): Permission => ({ action, resource, effect });

/** Rules appended after the agent's existing ones; the last matching rule wins. */
export function rolePermissions(role: RoleName, scratchDir: string): Permission[] {
  const spec: RoleSpec = ROLES[role];
  const common = [rule("subagent", "deny"), rule("question", "deny"), rule("skill", "deny", "fusion")];
  if (!spec.tools) return common;
  return [
    rule("*", "deny"),
    ...spec.tools.map((tool) => rule(tool)),
    rule("read", "ask", "*.env"),
    rule("read", "ask", "*.env.*"),
    rule("read", "allow", "*.env.example"),
    rule("external_directory", "ask"),
    rule("external_directory", "allow", `${scratchDir}/*`),
    ...common,
  ];
}

export function roleModel(role: RoleName, options: FusionOptions): ModelRef | undefined {
  return options.roles[role]?.model ?? options.models[ROLES[role].tier];
}

export function enabledRoles(options: FusionOptions): RoleName[] {
  return ROLE_NAMES.filter((role) => options.roles[role]?.disabled !== true);
}

/** Minimal shape of OpenCode's mutable Agent.Info that this plugin writes. */
export interface AgentDraft {
  description?: string;
  mode?: string;
  system?: string;
  steps?: number;
  model?: ModelRef;
  permissions?: Permission[];
}

/** Applies a role's defaults to an agent draft. User config is merged after plugins, so it still wins. */
export function applyRole(agent: AgentDraft, role: RoleName, options: FusionOptions, prompt: string): void {
  agent.description = ROLES[role].description;
  agent.mode = "subagent";
  agent.system = prompt;
  agent.steps = options.roles[role]?.steps ?? ROLES[role].steps;
  const model = roleModel(role, options);
  if (model) agent.model = { ...model };
  agent.permissions = [...(agent.permissions ?? []), ...rolePermissions(role, options.scratchDir)];
}