---
name: fusion
description: Procedure for splitting work across Fusion lanes - writing delegation contracts, reviewing results, concurrency, escalation, and recovery. Load before splitting multi-step work.
---

# Fusion

The lead (your session's agent) owns intent, planning, judgment, and review. One persistent `sidekick` per workstream implements decided work; read-only and light lanes take bounded work.

## Lanes

- **Medium:** `sidekick` (decided implementation, integration, concrete-failure debugging), `explore` (read-only code tracing), `reviewer` (one fresh-context review of the final diff), `scout` (external docs and upstream research).
- **Light:** `general` (bounded routine multi-step work), `worker` (mechanical edits, renames, docs, narrow tests), `verifier` (builds, tests, linters, reproductions; shell but no edits).

Lanes can be disabled; use only those your Fusion guidance names, and do that lane's work yourself or in the nearest available lane otherwise.

`explore`, `reviewer`, and `scout` have no shell. When they need command output, run the command yourself and pass the saved file (for a review, write `git diff <range>` to a file in the scratch directory from your Fusion guidance). Read-only work that needs many commands can go to `sidekick` with "no edits" in the contract. Don't move analysis to a light lane because it needs a shell.

Each lane has a step limit. Give each contract one deliverable that fits, and split large sweeps.

## The delegation contract

Subagents start without your conversation. Specify the work rather than describe it: settle interfaces, consequential choices, and hypotheses before dispatch.

```text
Repo: <absolute path>
Goal: <one sentence, one deliverable>
Already known: <verified facts, symbols, files, decisions; running servers or jobs to reuse>
Scope: <files or directories it owns>
Leave alone: <files owned elsewhere, configuration, generated output>
Return: <exact fields>, at most <N> bullets, each with path:line
Stop and report BLOCKED if: <ambiguities that need you>
Validation: <exact commands, or none>
```

- Lane prompts already require a `RESULT:` first line and a step-budget report, so contracts needn't repeat them.
- Mark anything in "Already known" you haven't checked as an assumption; lanes treat the rest as settled.
- Ask for `path:line` evidence, not pasted code or full logs.

## Reviewing results

- A lane's prose is a claim; the diff and check output are the evidence. Review the whole diff, then batch all corrections into one follow-up on the same session.
- Don't rerun checks a lane passed unless the evidence is missing or looks wrong, or the inputs changed.
- Treat root-cause claims without a shown failing path, and delegated analysis in general, as hypotheses: check the load-bearing parts yourself before stating them as fact.

## Concurrency and ownership

- One writer per file across active lanes.
- A few concurrent read-only lanes, or two or three file-disjoint edit lanes, is usually plenty; heavy builds or test suites are best run one lane at a time.
- Default to one blocking handoff. Use background lanes only when you have independent work to do meanwhile.
- Delegation hands over ownership: don't edit inside a running lane's scope, and don't redo its work afterwards.
- Resume the same sidekick by session ID for follow-ups; it keeps its context.
- To redirect a lane still running in the background (a changed requirement, or a user message that affects its work), call `subagent` with its session ID and the new instructions. They steer the current run and a single report still arrives, so don't start a second lane for it.
- After compaction or a resumed session, check which lanes already finished and what is on disk before relaunching anything.

## Escalation and recovery

- **BLOCKED on ambiguity:** decide, then resume the same session with the decision.
- **Escalate:** move from a light lane to `explore` or `sidekick` when the work needs real tracing or implementation. Take work back if the sidekick is BLOCKED twice or the task turns judgment-heavy.
- **Disagreement:** verify the disputed fact yourself. Use one reviewer, not a panel: extra reviewers tend to add false positives rather than defects. Don't tell the reviewer code is already audited or safe; that framing hides real bugs.
- **Retries:** after one scoped retry, re-scope or take the work back. Transient upstream errors usually clear on one retry with fewer lanes running; authentication and quota errors don't.
- **Fallback:** do trivial lookups or emergency repairs yourself when no lane is usable.