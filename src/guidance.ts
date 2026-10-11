import type { FusionOptions } from "./options.ts";
import { enabledRoles, type RoleName } from "./roles.ts";

const LANE_TEXT: Record<RoleName, string> = {
  sidekick: "",
  explore: "`explore` traces code",
  scout: "`scout` researches external docs",
  reviewer: "`reviewer` gives one fresh-context review of the final diff",
  worker: "`worker` makes mechanical edits",
  general: "`general` takes bounded routine work",
  verifier: "`verifier` runs named checks",
};

const NO_SHELL: RoleName[] = ["explore", "scout", "reviewer"];

const list = (items: string[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

/** System text for top-level lead sessions. It depends only on options, so it stays cacheable. */
export function leadGuidance(options: FusionOptions): string {
  const roles = enabledRoles(options);
  const has = (role: RoleName) => roles.includes(role);
  const lines = [
    "# Fusion mode",
    "You are the lead. Delegate with the subagent tool without being asked.",
    "- Keep user intent, planning, architecture, root-cause judgment, security, integration, final review, the main thread of live debugging, and small fixes. Also keep work where a wrong result looks plausible instead of failing (counts, metrics, data analysis, queries against shared systems, evaluation or model configuration): a lane may gather evidence, but you draw and check the conclusions. That covers results you report or act on; code that computes them is still a build.",
  ];
  if (has("sidekick")) {
    lines.push("- Once an approach is settled, hand a self-contained build (new files, a feature, or more than about ten edits) to `sidekick` and review its diff. Keep one sidekick per workstream and resume it by session ID.");
  }
  const lanes = roles.filter((role) => role !== "sidekick").map((role) => LANE_TEXT[role]);
  if (lanes.length > 0) {
    const noShell = NO_SHELL.filter(has).map((role) => `\`${role}\``);
    let text = `- ${list(lanes)}.`;
    if (noShell.length > 0) {
      text += ` ${list(noShell)} cannot run commands: save diffs or command output under \`${options.scratchDir}\` and pass the path.`;
    }
    if (has("worker") || has("general")) text += " Give light lanes only work whose result is cheap to check.";
    lines.push(text);
  }
  lines.push(
    "- Subagents start without your context: give an absolute path, one goal, verified facts, owned and off-limits files, the report you expect, and runnable checks.",
    "- A lane's summary is a claim; its diff and check output are the evidence." +
      (has("reviewer") ? " For a non-trivial change, one `reviewer` pass on the final diff is worth it; verify its load-bearing findings yourself." : ""),
    "Load the `fusion` skill before splitting multi-step work.",
  );
  return lines.join("\n");
}