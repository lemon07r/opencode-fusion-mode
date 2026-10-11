import { homedir, tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

export type Tier = "light" | "medium";

export interface ModelRef {
  providerID: string;
  id: string;
  variant?: string;
}

export interface RoleOptions {
  model?: ModelRef;
  steps?: number;
  disabled?: boolean;
}

export interface FusionOptions {
  models: Partial<Record<Tier, ModelRef>>;
  roles: Record<string, RoleOptions>;
  leadAgents: string[];
  scratchDir: string;
  stepCapFix: boolean;
}

export const DEFAULT_LEAD_AGENTS = ["build", "plan"];

/** Parses `provider/model` with an optional `#variant`; the model ID may itself contain slashes. */
export function parseModel(value: unknown, where: string): ModelRef {
  if (typeof value !== "string") throw new Error(`${where} must be a "provider/model#variant" string`);
  const [ref, variant, extra] = value.trim().split("#");
  const slash = ref.indexOf("/");
  if (extra !== undefined || slash <= 0 || slash === ref.length - 1 || variant === "") {
    throw new Error(`${where} must look like "provider/model" or "provider/model#variant", got "${value}"`);
  }
  return { providerID: ref.slice(0, slash), id: ref.slice(slash + 1), ...(variant ? { variant } : {}) };
}

export function expandHome(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return path;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Validates plugin options. Unknown roles are rejected so a typo does not silently do nothing. */
export function readOptions(raw: unknown, knownRoles: readonly string[]): FusionOptions {
  const input = isRecord(raw) ? raw : {};
  const models: FusionOptions["models"] = {};
  if (input.models !== undefined) {
    if (!isRecord(input.models)) throw new Error("models must be an object with light and/or medium");
    for (const [tier, value] of Object.entries(input.models)) {
      if (tier !== "light" && tier !== "medium") throw new Error(`models.${tier} is not a tier; use light or medium`);
      if (value !== undefined && value !== null && value !== "") models[tier] = parseModel(value, `models.${tier}`);
    }
  }

  const roles: FusionOptions["roles"] = {};
  if (input.roles !== undefined) {
    if (!isRecord(input.roles)) throw new Error("roles must be an object keyed by role name");
    for (const [name, value] of Object.entries(input.roles)) {
      if (!knownRoles.includes(name)) throw new Error(`roles.${name} is not a Fusion role (${knownRoles.join(", ")})`);
      if (!isRecord(value)) throw new Error(`roles.${name} must be an object`);
      const role: RoleOptions = {};
      if (value.model !== undefined) role.model = parseModel(value.model, `roles.${name}.model`);
      if (value.steps !== undefined) {
        if (!Number.isInteger(value.steps) || (value.steps as number) < 1) throw new Error(`roles.${name}.steps must be a positive integer`);
        role.steps = value.steps as number;
      }
      if (value.disabled !== undefined) {
        if (typeof value.disabled !== "boolean") throw new Error(`roles.${name}.disabled must be true or false`);
        role.disabled = value.disabled;
      }
      roles[name] = role;
    }
  }

  let leadAgents = DEFAULT_LEAD_AGENTS;
  if (input.leadAgents !== undefined) {
    if (!Array.isArray(input.leadAgents) || input.leadAgents.some((id) => typeof id !== "string" || id === "")) {
      throw new Error("leadAgents must be a list of agent IDs");
    }
    leadAgents = input.leadAgents as string[];
  }

  let scratchDir = join(tmpdir(), "opencode-fusion");
  if (input.scratchDir !== undefined) {
    if (typeof input.scratchDir !== "string" || input.scratchDir.trim() === "") throw new Error("scratchDir must be a path");
    const expanded = expandHome(input.scratchDir.trim());
    if (!isAbsolute(expanded)) throw new Error("scratchDir must be absolute or start with ~/");
    scratchDir = resolve(expanded);
  }

  if (input.stepCapFix !== undefined && typeof input.stepCapFix !== "boolean") throw new Error("stepCapFix must be true or false");

  return { models, roles, leadAgents, scratchDir, stepCapFix: input.stepCapFix !== false };
}
