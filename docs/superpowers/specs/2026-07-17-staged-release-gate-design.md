# Staged release gate: `main` + `release` two-branch flow

## Context

CLAUDE.md's Release Flow section previously documented a two-branch gate (push to `release`, release-please opens a PR against it) that never actually existed in the GitHub Actions wiring — `release-please.yml` had no `target-branch` override, so every push (`main` or `release`) always opened its PR against `main`. This was corrected during the v0.5.0 release (commit `b295e81`) to describe the real main-only flow.

Verified before writing this design:
- `.github/workflows/release-please.yml` triggers on `push: branches: [main, release]`, no `target-branch` set.
- `origin/release` is 183 commits behind `origin/main` (confirmed via `git rev-list --left-right --count origin/release...origin/main`).
- `ci.yml` and `bench-regression.yml` both scope their `pull_request` trigger to `branches: [main]` only — a release-please PR targeting `release` would get **no** CI or bench-regression checks under the current wiring. This is a real safety gap, not a cosmetic one.
- `docs.yml` triggers on `workflow_run` for `["CI", "Bench Full"]` filtered to `branches: [main]` — already correctly scoped and needs no change.
- `publish.yml` and `bench-full.yml` trigger on `push: tags: ['v*']` — branch-agnostic, no change needed.

Now that 0.5.0 has shipped, we want a real staged gate instead of standing one up for the first time under release pressure.

## Goals

- `main` is trunk: only updated via PR merge (no direct pushes), every merge fully CI-gated.
- `release` is a deliberate "ready to ship" checkpoint: it only ever fast-forwards to a commit on `main`, never diverges independently, and ends every cycle as a strict subset of `main` again.
- Releases are triggered from `release` only — pushes to `main` no longer trigger release-please.
- Anything that needs to run on `main` (CI, bench-regression, docs deploy) also needs to run for `release` where relevant (PRs/pushes targeting `release`), so the release-please PR gets the same safety net a normal PR gets.

## Non-goals

- No new/different checks exclusive to `release` (e.g. a fuller bench suite, manual approval gate) — this is a checkpoint, not a separate staging tier with its own quality bar.
- No change to `publish.yml` or `bench-full.yml` — both are tag-triggered and branch-agnostic already.
- No change to `docs.yml` — stays main-only; docs should reflect trunk, not a release checkpoint mid-flight.

## Design

### 1. Workflow changes

- **`ci.yml`**: add `release` to both `push.branches` and `pull_request.branches` (`[main, release]`), so the release-please PR (which will target `release`) and the post-release main-sync merge both get full CI.
- **`bench-regression.yml`**: add `release` to `pull_request.branches` (`[main, release]`), same reasoning.
- **`release-please.yml`**: change `push.branches` from `[main, release]` to `[release]` only, and add `target-branch: release` to the `googleapis/release-please-action@v4` step's `with:` block.
- **`docs.yml`**: unchanged.

### 2. Branch policy

- `main`: branch-protected to require PRs (no direct pushes). Applied as a GitHub repo settings change (via `gh api` or UI), **last**, after the workflow changes are verified — broader blast radius than a workflow file, since it changes how every future push behaves, not just release-related ones.
- `release`: no new commits originate here except release-please's own version-bump/CHANGELOG commit. It only advances by fast-forwarding to a chosen commit on `main`.

### 3. Ship sequence

1. Feature work merges to `main` via PR — unchanged, already CI + bench-regression gated.
2. When ready to release: fast-forward `release` to the chosen commit on `main` (`git checkout release && git merge --ff-only main && git push origin release`).
3. That push triggers `release-please.yml`, which opens/updates its PR against `release` (via `target-branch: release`).
4. Merging that PR creates the version-bump + CHANGELOG commit(s) on `release`, tags `vX.Y.Z` — triggers `publish.yml` (npm publish) and `bench-full.yml` (benchmark regen), both unchanged and tag-triggered.
5. **Required sync step**: immediately fast-forward-merge `release` back into `main` so the version-bump commit lands on `main` too. Without this, `release` would have a commit `main` doesn't, breaking the "release is always a subset of main" invariant for the next cycle.

### 4. Verification plan

Empirical verification at each step, checked against real GitHub state, not just YAML inspection:

1. Land the workflow changes (`ci.yml`, `bench-regression.yml`, `release-please.yml`) on `main` via a normal PR. No release triggers yet, since `release-please.yml` no longer listens on `main`.
2. Fast-forward `release` to that commit and push it (real `release` branch, not a throwaway). Since `release` is currently 183 commits behind, this first sync fast-forwards it all the way to current `main`, which already includes the published 0.5.0 commits — release-please should find nothing new to release (no-op or no PR), making this a low-risk first signal.
3. Confirm via `gh run list` that `release-please.yml` actually fired on the `release` push.
4. If a PR opens, confirm via `gh pr view --json baseRefName` that it targets `release`, not `main`.
5. Confirm via `gh pr checks` that CI and bench-regression actually ran on that PR, proving the trigger-scope fix works.
6. Only after this dry run is confirmed clean is the flow trusted for a real version-bump release.
7. Apply `main` branch protection (no direct pushes) as the final step, once everything above is verified.

At every push (workflow-change PR, the `release` fast-forward, any branch-protection change), stop and get explicit user go-ahead — prior authorization does not carry forward to new pushes.

### 5. CLAUDE.md update

Once verified working end-to-end, rewrite the Release Flow section to describe the real two-branch flow: roles of `main`/`release`, the fast-forward-only + merge-back-after-release discipline, and the updated `target-branch: release` wiring — replacing the current main-only description.

## Testing

No application code changes — this is CI/release infrastructure. "Testing" is the verification plan in section 4: real GitHub Actions run history and PR metadata, not local test suites.
