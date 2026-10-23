# Changelog

## 0.1.3

- Raise the `reviewer` default from 30 to 40 steps, the same as `sidekick`. In 63 recorded reviews, 7 hit the old 20-step limit, and the resumed ones needed about 26, 29, and 32 steps in total.

## 0.1.2

- Raise the `reviewer` default from 20 to 30 steps; reviews of large diffs were running out of steps before the write-up.
- `explore`, `reviewer`, and `scout` no longer stop when repository instructions require a tool they don't have, such as a shell-only search CLI; they use their own tools instead.
- Releases are published to npm from version tags with trusted publishing and provenance.

## 0.1.1

- Raise the `scout` default from 24 to 32 steps; multi-part research briefs were running out of steps before the write-up.

## 0.1.0

- First release: `sidekick`, `explore`, `reviewer`, `scout`, `general`, `worker`, and `verifier` lanes with light and medium model tiers, lead guidance for top-level sessions, the `fusion` skill, and the step-limit fix.
