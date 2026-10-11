import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Plugin } from "@opencode/plugin";
import { leadGuidance } from "./guidance.ts";
import { readOptions } from "./options.ts";
import { applyRole, enabledRoles, loadPrompt, ROLE_NAMES, type AgentDraft } from "./roles.ts";
import { reroleTrailingPrefill } from "./step-cap.ts";

export const PLUGIN_ID = "opencode-fusion-mode";
export const SKILL_ID = "fusion";

const SKILL_PATH = fileURLToPath(new URL("../skills/fusion/SKILL.md", import.meta.url));

/** Splits a SKILL.md into its frontmatter description and body. */
export function readSkill(text: string): { description: string; content: string } {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (!match) return { description: "", content: text.trim() };
  const description = /^description:\s*(.+)$/m.exec(match[1])?.[1].trim().replace(/^["']|["']$/g, "") ?? "";
  return { description, content: match[2].trim() };
}

/**
 * Fusion mode for OpenCode: the session's own agent is the lead, a persistent
 * sidekick implements decided work, and read-only and light lanes take bounded
 * work. Adds the lanes as agents (user config still overrides them), the lead's
 * guidance on top-level sessions, the `fusion` skill, and a fix for lanes that
 * fail at their step limit.
 */
export default {
  id: PLUGIN_ID,
  async setup(ctx) {
    const options = readOptions(ctx.options, ROLE_NAMES);
    const roles = enabledRoles(options);
    const prompts = new Map(roles.map((role) => [role, loadPrompt(role)]));

    await ctx.agent.transform((editor) => {
      for (const role of roles) {
        editor.update(role, (agent) => applyRole(agent as unknown as AgentDraft, role, options, prompts.get(role)!));
      }
    });

    const skill = readSkill(readFileSync(SKILL_PATH, "utf8"));
    await ctx.skill.transform((editor) => {
      if (editor.get(SKILL_ID)) return;
      // Skill.Info uses branded strings; these values are fixed and valid.
      editor.add({ id: SKILL_ID, name: "Fusion", description: skill.description, path: SKILL_PATH, content: skill.content } as Parameters<typeof editor.add>[0]);
    });

    const guidance = leadGuidance(options);
    const leads = new Set(options.leadAgents);
    const isChild = new Map<string, boolean>();
    const childSession = async (sessionID: string): Promise<boolean> => {
      const known = isChild.get(sessionID);
      if (known !== undefined) return known;
      let child = false;
      try {
        child = Boolean((await ctx.session.get({ sessionID })).parentID);
      } catch {
        return true;
      }
      if (isChild.size > 2000) isChild.clear();
      isChild.set(sessionID, child);
      return child;
    };

    await ctx.session.hook("context", async (event) => {
      if (options.stepCapFix) reroleTrailingPrefill(event.messages);
      if (leads.has(event.agent) && !(await childSession(event.sessionID))) {
        event.system.push({ type: "text", text: guidance });
      }
    });
  },
} satisfies Plugin.Plugin;