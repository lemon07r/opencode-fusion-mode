# opencode-fusion-mode

Fusion mode for [OpenCode 2](https://opencode.ai). Your session's agent becomes the **lead**: it keeps intent, planning, judgment, and review. A persistent **sidekick** implements decided work, and smaller **lanes** take bounded reading, research, edits, and checks. Each lane can run on a cheaper or faster model tier than the lead.

The lead's context stays focused on decisions, and routine work moves to models that cost less.

## Quick start

```sh
opencode plugin add opencode-fusion-mode
```

Or add it to `opencode.json(c)`:

```jsonc
{
  "plugins": ["opencode-fusion-mode"]
}
```

To install straight from GitHub instead, use `github:lemon07r/opencode-fusion-mode` (add `#<commit>` to pin a version).

That's it. With no options, every lane runs on the lead's own model, which already keeps the lead's context clean. To save cost, give the lanes their own models:

```jsonc
{
  "plugins": [
    {
      "package": "opencode-fusion-mode",
      "options": {
        "models": {
          "medium": "openai/gpt-5#medium",
          "light": "google/gemini-2.5-flash"
        }
      }
    }
  ]
}
```

Models use OpenCode's `provider/model#variant` form. Run `opencode models` to see yours.

## Lanes

| Agent | Tier | Does | Tools |
| --- | --- | --- | --- |
| `sidekick` | medium | Decided implementation, integration, debugging from a concrete failure. Resumed for follow-ups. | all |
| `explore` | medium | Read-only code tracing and mapping. | read, glob, grep |
| `reviewer` | medium | One fresh-context review of the final diff. | read, glob, grep |
| `scout` | medium | External docs, changelogs, upstream research. | read, glob, grep, web |
| `general` | light | Bounded routine multi-step work. | all |
| `worker` | light | Mechanical edits, renames, docs, narrow tests. | all |
| `verifier` | light | Runs named builds, tests, and linters; no edits. | read, glob, grep, shell |

`explore` and `general` replace OpenCode's built-in agents of the same name. No lane can start further subagents or ask you questions. Read-only lanes may also read the scratch directory, where the lead saves diffs and command output for them.

## What the plugin adds

- **The lanes above**, as subagents with short prompts, permissions, and step limits.
- **Lead guidance**: a short system section (about 250 words) for top-level `build` and `plan` sessions. It covers what the lead keeps, when to hand a build to the sidekick, how to write a contract, and that a lane's summary is a claim to check. Subagents never see it. The text depends only on your options, so it stays in the prompt cache. Session generation requests (`session.generate`, used by plugins that ask questions about the live session, such as cache-reusing compaction) get the same section, so they reuse that cache too.
- **A `fusion` skill** with the full procedure: contracts, reviewing results, concurrency, escalation, and recovery. The lead loads it only when it splits multi-step work.
- **A step-limit fix.** When an agent reaches its `steps` limit, OpenCode ends the request with an assistant message asking for a summary. Gemini and current Claude models reject that with a 400 error, so the lane fails and its work is lost. The plugin moves that message to the user role, so the lane returns its summary instead.

## Options

```jsonc
{
  "package": "opencode-fusion-mode",
  "options": {
    // Tier models. Unset tiers inherit the lead's model.
    "models": { "medium": "provider/model#variant", "light": "provider/model" },

    // Per-lane overrides.
    "roles": {
      "reviewer": { "model": "provider/model#high" },
      "sidekick": { "steps": 60 },
      "scout": { "disabled": true }
    },

    // Agents that get the lead guidance. Default: ["build", "plan"].
    "leadAgents": ["build", "plan"],

    // Where the lead saves diffs and command output for lanes without a shell.
    // Default: <system temp dir>/opencode-fusion. Absolute or ~/ paths.
    "scratchDir": "~/scratch/opencode",

    // Set to false to leave OpenCode's step-limit request unchanged.
    "stepCapFix": true
  }
}
```

A disabled role is not added. For `general` and `explore`, disabling leaves OpenCode's built-in agent unchanged. Unknown tiers or role names are errors, so a typo doesn't silently do nothing.

### Overriding a lane

Your own `agents` config is applied after the plugin and wins field by field; permission rules you add are appended after the plugin's. For example, this gives the sidekick more steps and the reviewer its own model:

```jsonc
{
  "agents": {
    "sidekick": { "steps": 60 },
    "reviewer": { "model": "anthropic/claude-sonnet-4-5" }
  }
}
```

If you grant a read-only lane shell patterns such as `git diff*`, remember that wildcards also match flags like `--output=<file>`, so they are not a read-only boundary.

### Slash shortcuts

OpenCode's own `commands` config can launch a lane directly:

```jsonc
{
  "commands": {
    "review": { "agent": "reviewer", "subagent": true, "template": "Review this scope and report actionable defects only:\n\n$ARGUMENTS" },
    "sidekick": { "agent": "sidekick", "subagent": true, "template": "$ARGUMENTS" }
  }
}
```

## How to get the most out of it

- **Pick tiers by how cheaply a wrong answer is caught.** The sidekick and reviewer need a capable model. Light lanes only get work whose result is quick to check, such as an edit that applies or a command that passes.
- **Keep the lead strong.** Planning, judgment, and review stay with it, and the guidance tells it to check delegated analysis rather than repeat it.
- **Resume the sidekick.** The guidance asks the lead to reuse one sidekick per workstream by session ID, which keeps that lane's context and cache warm.

## Compatibility

- Requires OpenCode 2.0.26 or newer. The plugin creates its lanes through the agent transform (`editor.update` on a new ID), which OpenCode 2.0.26 supports but does not document. If a future release changes that, the lanes won't appear; please open an issue.
- If another plugin or your config already defines a `fusion` skill, yours is kept.

## Development

```sh
bun install
bun run validate      # type check and tests
bun run pack:inspect  # list the files npm would publish
```

To try a local checkout, point a project at it: `"plugins": ["/path/to/opencode-fusion-mode"]`.

### Releasing

Bump `version` in `package.json`, add a `CHANGELOG.md` entry, and merge to `main`. Then push a matching tag:

```sh
git tag v0.1.2 && git push origin v0.1.2
```

The Release workflow checks that the tag matches `package.json`, runs the checks, publishes to npm through trusted publishing (with provenance), and creates the GitHub release from the changelog entry.

## Credits

The lane design draws on the Fusion mode in [shariq-pi-extensions](https://github.com/shariqriazz/shariq-pi-extensions) for the Pi coding agent.

## License

MIT