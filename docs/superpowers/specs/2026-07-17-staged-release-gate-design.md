# Staged release gate: `main` + `release` two-branch flow

## Context

CLAUDE.md's Release Flow section previously documented a two-branch gate (push to `release`, release-please opens a PR against it) that never actually existed in the GitHub Actions wiring — `release-please.yml` had no `target-branch` override, so every push (`main` or `release`) always opened its PR against `main`. This was corrected during the v0.5.0 release (commit `b295e81`) to describe the real main-only flow.

Verified before writing this design:
- `.github/workflows/release-please.yml` triggers on `push: branches: [main, release]`, no `target-branch` set.
- `origin/release` is 183 commits behind `origin/main` (confirmed via `git rev-list --left-right --count origin/release...origin/main`).
- `ci.yml` and `bench-regression.yml` both scope their `pull_request` trigger to `branches: [main]` only — a release-please PR targeting `release` would get **no** CI or bench-regression checks under the current wiring. This is a real safety gap, not a cosmetic one.
- `docs.yml` triggers on `workflow_run` for `["CI", "Bench Full"]` filtered to `branches: [main]` — already correctly scoped and needs no change. `workflow_run`'s `branches` filter matches the *triggering workflow's own branch*, so a CI run on `release` cannot accidentally satisfy this filter.
- `publish.yml` triggers on `push: tags: ['v*']` — branch-agnostic, no change needed.
- `bench-full.yml` triggers on `push: tags: ['v*']` but hardcodes `checkout ref: main` and its final step pushes its auto-commit (`docs/benchmarks/index.md`, `bench/results/baseline.json`) directly to `main` via `git push origin main`. **This is not branch-agnostic** and requires a change — see Design section 1.
- No branch protection currently exists on `main` (`gh api repos/.../branches/main/protection` → 404). `bench-full.yml` already carries a maintainer comment anticipating this ("requires github-actions[bot] to bypass branch protection on main") — that guidance is pre-existing and as yet unapplied.
- No release-please PRs are currently open (`gh pr list --state open` → empty) — the trigger-scope change (main → release-only) has no in-flight PR to orphan.

Now that 0.5.0 has shipped, we want a real staged gate instead of standing one up for the first time under release pressure.

## Adversarial review

Before implementation, this design went through a two-pass adversarial review: two independent reviewers examined it cold against the actual workflow files, then their claims were individually re-verified against the repo (not taken on trust). Confirmed findings and how they're resolved below; the Design and Ship Sequence sections already reflect the fixes.

1. **CONFIRMED, critical — `bench-full.yml` races the required merge-back step.** Because it hardcodes `ref: main` and pushes there, and the release tag/version-bump commit is created on `release`, a tag-triggered `bench-full.yml` run firing before the human merge-back (step 5) would benchmark stale pre-release code and land an auto-commit on `main` *ahead of* the pending merge-back — corrupting the fast-forward relationship for the next cycle. **Fix:** `bench-full.yml` now targets `release`, not `main` (Design section 1), so its auto-commit lands on the same branch as the version bump and travels through the same merge-back PR, eliminating the race rather than just narrowing it.
2. **CONFIRMED — step 5 (merge-back) was underspecified prose**, unlike step 2 which spells out an exact command. Combined with `main` requiring PRs (no direct pushes) once protection is live, an ad-hoc direct push would simply be rejected. **Fix:** step 5 is now an explicit PR-based procedure with exact commands (Ship Sequence section).
3. **CONFIRMED — no automated drift detection if merge-back is skipped.** First failure signal would otherwise be a hard `--ff-only` error on the *next* release cycle, possibly weeks later. **Fix:** added a scheduled ancestry check (Design section 4).
4. **Checked and dismissed:** `docs.yml`'s `workflow_run.branches` filter is confirmed safe (matches triggering workflow's own branch, not global). Manifest/config-file divergence between branches is real in principle but fully subsumed by findings 1–3 — it only manifests if the merge-back discipline already broke.

## Goals

- `main` is trunk: only updated via PR merge (no direct pushes), every merge fully CI-gated.
- `release` is a deliberate "ready to ship" checkpoint: it only ever fast-forwards to a commit on `main`, never diverges independently, and ends every cycle as a strict subset of `main` again.
- Releases are triggered from `release` only — pushes to `main` no longer trigger release-please.
- Anything that needs to run on `main` (CI, bench-regression, docs deploy) also needs to run for `release` where relevant (PRs/pushes targeting `release`), so the release-please PR gets the same safety net a normal PR gets.

## Non-goals

- No new/different checks exclusive to `release` (e.g. a fuller bench suite, manual approval gate) — this is a checkpoint, not a separate staging tier with its own quality bar.
- No change to `publish.yml` — tag-triggered and branch-agnostic already.
- No change to `docs.yml` — stays main-only; docs should reflect trunk, not a release checkpoint mid-flight.

## Design

### 1. Workflow changes

- **`ci.yml`**: add `release` to both `push.branches` and `pull_request.branches` (`[main, release]`), so the release-please PR (which will target `release`) and the post-release main-sync merge both get full CI.
- **`bench-regression.yml`**: add `release` to `pull_request.branches` (`[main, release]`), same reasoning.
- **`release-please.yml`**: change `push.branches` from `[main, release]` to `[release]` only, and add `target-branch: release` to the `googleapis/release-please-action@v4` step's `with:` block.
- **`bench-full.yml`**: change `checkout ref: main` to `checkout ref: release`, and change the "Commit results to main" step's `git push origin main` to `git push origin release` (rename the step to "Commit results to release"). This makes the bench-results auto-commit land on the same branch as release-please's version-bump commit, so both travel through the same merge-back PR (Ship Sequence step 5) instead of racing to update `main` independently. Also remove the now-stale maintainer comment about needing a `github-actions[bot]` bypass on `main` protection — see Branch policy below for why it's no longer needed.
- **`docs.yml`**: unchanged.
- **New: a scheduled drift-check workflow** (e.g. `.github/workflows/release-branch-drift.yml`, cron alongside `bench-weekly.yml`'s existing weekly schedule) that runs `git merge-base --is-ancestor origin/release origin/main` and fails loudly (or opens an issue) if `release` is not an ancestor of `main` — i.e., if a merge-back was skipped. This is a safety-net check on the *relationship* between the two branches, not a new quality bar on `release` itself, so it doesn't conflict with the non-goal of keeping `release` checkpoint-only.

### 2. Branch policy

- `main`: branch-protected to require PRs (no direct pushes). Applied as a GitHub repo settings change (via `gh api` or UI), **last**, after the workflow changes are verified — broader blast radius than a workflow file, since it changes how every future push behaves, not just release-related ones. No bypass-actor exception is needed for this protection rule: under this design, nothing pushes to `main` directly anymore — `bench-full.yml` now targets `release` (not `main`), and the merge-back (Ship Sequence step 5) goes through a normal PR. `bench-full.yml`'s existing bypass comment predates this design and can be removed/ignored once the retarget to `release` lands.
- `release`: no new commits originate here except release-please's own version-bump/CHANGELOG commit and `bench-full.yml`'s results commit. It only advances by fast-forwarding to a chosen commit on `main`, or by the merge-back PR (which fast-forwards `main` up to `release`, not the reverse).

### 3. Ship sequence

1. Feature work merges to `main` via PR — unchanged, already CI + bench-regression gated.
2. When ready to release: fast-forward `release` to the chosen commit on `main`:
   ```
   git checkout release
   git merge --ff-only main
   git push origin release
   ```
3. That push triggers `release-please.yml`, which opens/updates its PR against `release` (via `target-branch: release`).
4. Merging that PR creates the version-bump + CHANGELOG commit(s) on `release`, tags `vX.Y.Z` — triggers `publish.yml` (npm publish) and `bench-full.yml` (benchmark regen, now committing its results to `release`).
5. **Required sync step — merge-back PR**, done once `bench-full.yml`'s commit (if any) has landed on `release`:
   ```
   git fetch origin main release
   git checkout -b merge-release-<version> origin/main
   git merge --ff-only origin/release
   git push origin merge-release-<version>
   gh pr create --base main --head merge-release-<version> --title "chore: sync release vX.Y.Z back to main"
   ```
   Merge that PR through the normal `main` PR flow (full CI applies, per Design section 1's widened trigger scope). This keeps `main`'s "PR-only" invariant intact — no bypass exception needed for this step — and ensures `release`'s tip is an ancestor of `main`'s tip again, which is what makes the *next* cycle's `git merge --ff-only main` in step 2 valid. **This PR must be merged via a real merge commit ("Create a merge commit"), never squash or rebase:** the drift check (Design section 4) verifies `git merge-base --is-ancestor origin/release origin/main`, which only holds if `release`'s commits become literal ancestors of `main` through a true merge; a squash or rebase merge synthesizes a new SHA on `main`, permanently breaking that ancestor relationship and causing the drift check to false-positive forever on an otherwise correctly-synced repo.

### 4. Verification plan

Empirical verification at each step, checked against real GitHub state, not just YAML inspection:

1. Land the workflow changes (`ci.yml`, `bench-regression.yml`, `release-please.yml`, `bench-full.yml`, new drift-check workflow) on `main` via a normal PR. No release triggers yet, since `release-please.yml` no longer listens on `main`.
2. Fast-forward `release` to that commit and push it (real `release` branch, not a throwaway). Since `release` is currently 183 commits behind, this first sync fast-forwards it all the way to current `main`, which already includes the published 0.5.0 commits — release-please should find nothing new to release (no-op or no PR), making this a low-risk first signal.
3. Confirm via `gh run list` that `release-please.yml` actually fired on the `release` push.
4. If a PR opens, confirm via `gh pr view --json baseRefName` that it targets `release`, not `main`.
5. Confirm via `gh pr checks` that CI and bench-regression actually ran on that PR, proving the trigger-scope fix works.
6. Only after this dry run is confirmed clean is the flow trusted for a real version-bump release.
7. On the first real release cycle, confirm via `gh run list`/`gh api` that `bench-full.yml` checked out and pushed to `release` (not `main`), and manually verify the merge-back PR (step 5) actually gets `release`'s tip merged into `main` with `git merge-base --is-ancestor` before considering the cycle closed.
8. Trigger the new drift-check workflow manually (`workflow_dispatch` or wait for its cron) once, on a known-good state, to confirm it passes cleanly — and optionally once against a deliberately-diverged test state to confirm it actually fails when it should.
9. Apply `main` branch protection (no direct pushes) as the final step, once everything above is verified. Note that under this design nothing pushes to `main` directly anymore — `bench-full.yml` now targets `release`, and the merge-back goes through a normal PR — so no bypass-actor exception is needed on `main` at all. (Design section 2's earlier bypass note applies only if `release` itself is ever protected, which is out of scope here.)

At every push (workflow-change PR, the `release` fast-forward, any branch-protection change), stop and get explicit user go-ahead — prior authorization does not carry forward to new pushes.

### 5. CLAUDE.md update

Once verified working end-to-end, rewrite the Release Flow section to describe the real two-branch flow: roles of `main`/`release`, the fast-forward-only + merge-back-after-release discipline, and the updated `target-branch: release` wiring — replacing the current main-only description.

## Testing

No application code changes — this is CI/release infrastructure. "Testing" is the verification plan in section 4: real GitHub Actions run history and PR metadata, not local test suites.
