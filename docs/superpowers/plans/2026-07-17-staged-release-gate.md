# Staged Release Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a real two-branch (`main`/`release`) staged release gate, replacing the current main-only release-please flow, per `docs/superpowers/specs/2026-07-17-staged-release-gate-design.md`.

**Architecture:** `main` stays trunk (PR-only). `release` becomes a fast-forward-only checkpoint of `main` that release-please watches via `target-branch: release`. `bench-full.yml` is retargeted from `main` to `release` so its auto-commit rides the same branch as the version bump. A new scheduled workflow detects if the required post-release merge-back to `main` was skipped.

**Tech Stack:** GitHub Actions (YAML workflows), `gh` CLI, git.

## Global Constraints

- Never push to `origin`, merge a PR, or create a tag without the user's explicit go-ahead for that specific action — prior authorization does not carry forward (per user's standing instruction this session).
- All workflow YAML changes must parse as valid YAML before committing (verified via `ruby -ryaml -e "YAML.load_file('<path>')"` — no YAML linter is installed in this repo, and `python3` here lacks PyYAML).
- Every fact used in a step must be re-verified against live repo/GitHub state at execution time if more than a few commits may have landed since this plan was written — don't trust stale line numbers or branch positions blindly.
- No new CI job or check may run with lower rigor than what `main` already gets — the whole point of the widened trigger scope is parity, not a lesser tier for `release`.

---

## File Structure

- Modify: `.github/workflows/ci.yml` — widen push/pull_request triggers to include `release`.
- Modify: `.github/workflows/bench-regression.yml` — widen pull_request trigger to include `release`.
- Modify: `.github/workflows/release-please.yml` — trigger on `release` push only; add `target-branch: release`.
- Modify: `.github/workflows/bench-full.yml` — retarget checkout/commit from `main` to `release`; drop the stale bypass comment.
- Create: `.github/workflows/release-branch-drift.yml` — weekly scheduled ancestry check between `release` and `main`.
- Modify: `CLAUDE.md` — rewrite the "Release Flow" section to describe the real two-branch flow (last task, after the dry run is verified).

---

### Task 1: Widen `ci.yml` to cover the `release` branch

**Files:**
- Modify: `.github/workflows/ci.yml:3-7`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: CI now runs on push/PR against `release`, which Task 6 (the workflow-change PR) and Task 3's release-please PR both rely on for coverage.

- [ ] **Step 1: Edit the trigger block**

Change:
```yaml
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
```
to:
```yaml
on:
  push:
    branches: [main, release]
  pull_request:
    branches: [main, release]
```

- [ ] **Step 2: Verify YAML is valid**

Run: `ruby -ryaml -e "YAML.load_file('.github/workflows/ci.yml')" && echo VALID`
Expected: `VALID` printed, no exception.

- [ ] **Step 3: Verify the trigger diff is exactly the intended change**

Run: `git diff .github/workflows/ci.yml`
Expected: only the two `branches:` lines change, from `[main]` to `[main, release]`. No other lines touched.

- [ ] **Step 4: Stage (do not commit yet — committed together in Task 6)**

Run: `git add .github/workflows/ci.yml`

---

### Task 2: Widen `bench-regression.yml` to cover the `release` branch

**Files:**
- Modify: `.github/workflows/bench-regression.yml:3-5`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: bench-regression now runs on PRs against `release`, same reasoning as Task 1.

- [ ] **Step 1: Edit the trigger block**

Change:
```yaml
on:
  pull_request:
    branches: [main]
```
to:
```yaml
on:
  pull_request:
    branches: [main, release]
```

- [ ] **Step 2: Verify YAML is valid**

Run: `ruby -ryaml -e "YAML.load_file('.github/workflows/bench-regression.yml')" && echo VALID`
Expected: `VALID` printed.

- [ ] **Step 3: Verify the diff is minimal**

Run: `git diff .github/workflows/bench-regression.yml`
Expected: only the `branches:` line changes.

- [ ] **Step 4: Stage**

Run: `git add .github/workflows/bench-regression.yml`

---

### Task 3: Point `release-please.yml` at the `release` branch

**Files:**
- Modify: `.github/workflows/release-please.yml`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: release-please now only fires on pushes to `release` and opens its PR with base `release` — Task 7's dry run depends on this.

- [ ] **Step 1: Edit the trigger and add `target-branch`**

Current file (no blank line between `name:` and `on:` — match exactly):
```yaml
name: release-please
on:
  push:
    branches: [main, release]
jobs:
  release-please:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - uses: googleapis/release-please-action@v4
        with:
          token: ${{ secrets.RELEASE_PLEASE_TOKEN }}
          config-file: release-please-config.json
          manifest-file: .release-please-manifest.json
```

Change to:
```yaml
name: release-please
on:
  push:
    branches: [release]
jobs:
  release-please:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - uses: googleapis/release-please-action@v4
        with:
          token: ${{ secrets.RELEASE_PLEASE_TOKEN }}
          config-file: release-please-config.json
          manifest-file: .release-please-manifest.json
          target-branch: release
```

- [ ] **Step 2: Verify YAML is valid**

Run: `ruby -ryaml -e "YAML.load_file('.github/workflows/release-please.yml')" && echo VALID`
Expected: `VALID` printed.

- [ ] **Step 3: Verify the diff**

Run: `git diff .github/workflows/release-please.yml`
Expected: `branches: [main, release]` → `branches: [release]`, and a new `target-branch: release` line added under `with:`. No other lines touched.

- [ ] **Step 4: Stage**

Run: `git add .github/workflows/release-please.yml`

---

### Task 4: Retarget `bench-full.yml` from `main` to `release`

**Files:**
- Modify: `.github/workflows/bench-full.yml`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: the bench-results auto-commit now lands on `release`, not `main` — this is what Task 7's merge-back step (executed by the user later, not part of this plan's automated steps) picks up.

- [ ] **Step 1: Edit checkout ref**

Change:
```yaml
      - uses: actions/checkout@v4
        with:
          ref: main
          token: ${{ secrets.GITHUB_TOKEN }}
```
to:
```yaml
      - uses: actions/checkout@v4
        with:
          ref: release
          token: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 2: Rename and edit the commit step**

Change:
```yaml
      - name: Commit results to main
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add bench/results/baseline.json docs/benchmarks/index.md
          if ! git diff --cached --quiet; then
            git commit -m "chore: update benchmarks [skip ci]"
            git push origin main
          fi
```
to:
```yaml
      - name: Commit results to release
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add bench/results/baseline.json docs/benchmarks/index.md
          if ! git diff --cached --quiet; then
            git commit -m "chore: update benchmarks [skip ci]"
            git push origin release
          fi
```

- [ ] **Step 3: Remove the now-stale maintainer bypass comment**

Delete these lines (currently above the `jobs:` key):
```yaml
# NOTE FOR MAINTAINERS: The "Commit results to main" step requires
# github-actions[bot] to bypass branch protection on main.
# Go to: GitHub Settings → Branches → main protection rule
# → "Allow specified actors to bypass required pull requests"
# → add "github-actions[bot]"
```
This is stale per the design doc's Branch policy section: nothing pushes to `main` directly anymore under this design, so no bypass exception is needed there.

- [ ] **Step 4: Verify YAML is valid**

Run: `ruby -ryaml -e "YAML.load_file('.github/workflows/bench-full.yml')" && echo VALID`
Expected: `VALID` printed.

- [ ] **Step 5: Verify the diff**

Run: `git diff .github/workflows/bench-full.yml`
Expected: `ref: main` → `ref: release`, the step name (`Commit results to main` → `Commit results to release`), the single `git push origin main` → `git push origin release`, and the 5-line maintainer comment block removed. No other lines touched (in particular, `NEUTRO_VERSION: ${{ github.ref_name }}` must be untouched — that's the tag name, unaffected by branch retargeting).

- [ ] **Step 6: Stage**

Run: `git add .github/workflows/bench-full.yml`

---

### Task 5: Add the release-branch drift-check workflow

**Files:**
- Create: `.github/workflows/release-branch-drift.yml`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: a weekly check that fails loudly if `release` is not an ancestor of `main` (i.e., a merge-back was skipped).

- [ ] **Step 1: Write the workflow file**

```yaml
name: Release Branch Ancestry Check

on:
  schedule:
    - cron: '0 3 * * 0'
  workflow_dispatch:

permissions:
  contents: read

jobs:
  check-drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Verify release is an ancestor of main
        run: |
          git fetch origin main release
          if git merge-base --is-ancestor origin/release origin/main; then
            echo "OK: release is an ancestor of main — no drift."
          else
            echo "::error::release has diverged from main — a post-release merge-back (see CLAUDE.md Release Flow) was likely skipped. Open a merge-back PR from release into main."
            exit 1
          fi
```

- [ ] **Step 2: Verify YAML is valid**

Run: `ruby -ryaml -e "YAML.load_file('.github/workflows/release-branch-drift.yml')" && echo VALID`
Expected: `VALID` printed.

- [ ] **Step 3: Verify it's scheduled distinctly from `bench-weekly.yml`**

Run: `grep -A1 "schedule:" .github/workflows/bench-weekly.yml .github/workflows/release-branch-drift.yml`
Expected: `bench-weekly.yml` shows `cron: '0 2 * * 0'`, `release-branch-drift.yml` shows `cron: '0 3 * * 0'` — staggered by an hour so they don't contend for runner capacity.

- [ ] **Step 4: Stage**

Run: `git add .github/workflows/release-branch-drift.yml`

---

### Task 6: Land the workflow changes on `main` via PR

**Files:** none new — commits the staged changes from Tasks 1–5.

**Interfaces:**
- Consumes: staged changes from Tasks 1–5.
- Produces: a merged commit on `main` that Task 7's dry run fast-forwards `release` to.

- [ ] **Step 1: Verify everything intended is staged and nothing else**

Run: `git status`
Expected: exactly these 5 files staged: `.github/workflows/ci.yml`, `.github/workflows/bench-regression.yml`, `.github/workflows/release-please.yml`, `.github/workflows/bench-full.yml`, `.github/workflows/release-branch-drift.yml`. No unrelated changes.

- [ ] **Step 2: Commit**

```bash
git commit -m "ci: build a real staged release gate on main/release

Widens ci.yml/bench-regression.yml to cover the release branch,
points release-please at release via target-branch, retargets
bench-full.yml's commit from main to release to avoid racing the
required post-release merge-back, and adds a weekly drift check
between the two branches."
```

- [ ] **Step 3: STOP — get explicit user go-ahead before pushing**

This pushes a new branch and opens a PR against `main`. Per this session's standing instruction, do not proceed without the user's explicit go-ahead for this specific push, even though the overall plan was approved.

- [ ] **Step 4: Push a feature branch and open the PR**

```bash
git push -u origin HEAD:staged-release-gate
gh pr create --base main --head staged-release-gate \
  --title "ci: build a real staged release gate on main/release" \
  --body "Implements docs/superpowers/specs/2026-07-17-staged-release-gate-design.md. See that spec's Adversarial review section for what was checked."
```

- [ ] **Step 5: Verify CI passes on the PR**

Run: `gh pr checks staged-release-gate --watch`
Expected: all checks (`CI / test`, `CI / bench-apps-typecheck`) pass. If `bench-regression` doesn't fire (it only triggers on PRs, and this PR targets `main` — it should fire, since `bench-regression.yml`'s trigger already includes `main`), confirm it ran too.

- [ ] **Step 6: STOP — get explicit user go-ahead before merging**

- [ ] **Step 7: Merge the PR**

Run: `gh pr merge staged-release-gate --squash --delete-branch`
Expected: PR merges into `main`, branch deleted.

---

### Task 7: Dry-run the `release` branch fast-forward and verify the new wiring empirically

**Files:** none — this is a verification task, no code changes.

**Interfaces:**
- Consumes: the merged commit from Task 6 (must be on `main` before this task starts).
- Produces: empirical confirmation that `release-please.yml`'s new `target-branch: release` wiring, and the widened CI/bench-regression scope, actually work against real GitHub state — required before Task 8 (CLAUDE.md update) can truthfully describe the flow as working.

- [ ] **Step 1: Confirm Task 6 actually landed on `main` before touching `release`**

This task does not share memory with Task 6 — verify Task 6's outcome from repo state, don't assume it happened:

```bash
git fetch origin --prune
git log --oneline origin/main -1
git log origin/main --oneline | grep -m1 "staged release gate"
```
Expected: the second command finds a match (the squash-merge commit from Task 6). If it finds nothing, Task 6 has not merged yet — stop and do not proceed with this task.

- [ ] **Step 2: Confirm `release`'s current position and check for a stale local branch**

```bash
git log --oneline origin/release -1
git rev-list --left-right --count origin/release...origin/main
git rev-parse --verify -q release && echo "WARNING: local 'release' branch already exists — inspect it (git log release -5) before continuing; do not blindly overwrite it" || echo "no local release branch, safe to proceed"
```
Expected: the count line shows `0	N` (release strictly behind `main`, zero commits ahead — if it shows anything else, `release` has diverged unexpectedly; stop and investigate). Expected: "no local release branch, safe to proceed" — if the warning prints instead, stop and manually inspect what's on the local branch before Step 4, since `checkout -B` would silently discard it.

- [ ] **Step 3: STOP — get explicit user go-ahead before pushing to the real `release` branch**

Confirmed already ("use the real release branch, it's fine") for this plan's dry run specifically — still state clearly before executing which command is about to run, since prior approval doesn't carry forward automatically per the standing instruction.

- [ ] **Step 4: Fast-forward `release` to `main` and push**

```bash
git checkout -B release origin/main
git push origin release
```
(Using `checkout -B release origin/main` rather than `merge --ff-only` here because this is the very first sync in 183 commits, and Step 2 already confirmed no local `release` branch holds unpushed work. This produces the same result as a fast-forward: `release`'s new tip becomes identical to `main`'s tip. The subsequent push is a normal, non-force push — GitHub rejects it outright if it were somehow not a fast-forward from the remote's perspective.)

- [ ] **Step 5: Confirm `release-please.yml` fired on the push**

Run: `gh run list --workflow=release-please.yml --branch=release --limit=3`
Expected: a run listed with a recent timestamp, status `completed`.

- [ ] **Step 6: Check whether a PR opened, and if so, confirm its base branch — do NOT merge it**

```bash
gh pr list --base release --state open
```
If a PR is listed, run `gh pr view <number> --json baseRefName,title` and confirm `baseRefName` is `"release"`. **Do not merge this PR as part of this task, even if it looks correct** — merging it creates a real version tag and cascades into `publish.yml` (npm publish), which is irreversible. This task is verification-only; merging a real release PR needs its own explicit user go-ahead, separate from and beyond the go-ahead already given for the branch push in Step 3. If no PR is listed, that's expected and fine — per the spec, this first sync includes only already-released commits, so release-please should find nothing new to release (a no-op).

- [ ] **Step 7: If a PR opened, confirm CI and bench-regression ran on it**

Run: `gh pr checks <number>`
Expected: `CI / test`, `CI / bench-apps-typecheck`, and `bench-regression` (the check context is `Bench Regression / bench-regression`, since GitHub names contexts `<workflow name> / <job id>`) all present and passing — proving the Task 1/2 trigger-scope changes actually work for a PR targeting `release`, not just `main`.

- [ ] **Step 8: Record the outcome**

Note in the plan's tracking (or directly to the user) which of the two outcomes happened: (a) no PR opened — release-please correctly found nothing new, confirming the wiring without exercising the full merge flow, or (b) a PR opened targeting `release` with CI passing — confirming the full wiring end to end. Either outcome is a valid pass per the spec's step 2 expectation; only a PR opening against `main` (wrong base) or `release-please.yml` not firing at all would be a failure requiring a stop-and-fix before Task 8.

---

### Task 8: Update CLAUDE.md's Release Flow section

**Files:**
- Modify: `CLAUDE.md` (the "### Release Flow" section, currently lines 88–104 as of this plan's writing — re-locate by searching for `### Release Flow` at execution time, since line numbers will have shifted after Tasks 1–7's commits).

**Interfaces:**
- Consumes: confirmed outcome from Task 7 (must be a pass, per that task's Step 8, before this task starts — do not document a flow as real until it's been verified against live GitHub state). This task does not share memory with Task 7 — the orchestrator dispatching this task must paste Task 7's recorded Step 8 outcome directly into this task's prompt. If that outcome isn't available, re-verify independently first: `gh run list --workflow=release-please.yml --branch=release --limit=3` must show a completed run, and `git rev-list --left-right --count origin/release...origin/main` must show `0\t0` (release and main identical, confirming the Task 7 fast-forward landed) before proceeding.
- Produces: none consumed by later tasks — this is the final task in the plan.

- [ ] **Step 1: Locate the current section**

Run: `grep -n "^### Release Flow" CLAUDE.md`
Note the line number for the section start; the section ends at the next `### ` heading (`### Benchmark Suite`).

- [ ] **Step 2: Replace the section content**

Replace the entire `### Release Flow` section (from its heading through the line before `### Benchmark Suite`) with:

```markdown
### Release Flow

`main` is trunk: every merge lands via PR (no direct pushes) and is fully CI-gated by `ci.yml` and `bench-regression.yml`. `release` is a deliberate "ready to ship" checkpoint: it only ever fast-forwards to a commit already on `main`, and after each release cycle it's merged back into `main` so it never carries a commit `main` doesn't have. `.github/workflows/release-please.yml` triggers only on pushes to `release` and passes `target-branch: release` to `googleapis/release-please-action@v4`, so its PR always targets `release`, not `main`.

**To cut a release:**
1. Fast-forward `release` to the commit on `main` you want to ship: `git checkout release && git merge --ff-only main && git push origin release`.
2. That push triggers `release-please.yml`, which opens/updates a "chore(release): release vX.Y.Z" PR against `release`, computing the version bump from conventional commits since the last tag.
3. Merge the PR — release-please creates the `vX.Y.Z` tag on `release` and bumps all `package.json` files via `extra-files`.
4. The tag push triggers `publish.yml` (tests, builds, and publishes `@neutro/form` to npm) and `bench-full.yml` (re-runs the full benchmark suite). `bench-full.yml` now checks out and commits its results to `release` (not `main`) — see below for why.
5. **Required:** once `bench-full.yml`'s commit (if any) has landed on `release`, open a PR merging `release` back into `main` (`git checkout main && git pull && git merge --ff-only release`, push to a feature branch, `gh pr create --base main`) and merge it through the normal `main` PR flow. **Merge this PR via a real merge commit ("Create a merge commit"), never squash or rebase** — the weekly `release-branch-drift.yml` check verifies `release`'s tip is a literal git ancestor of `main`'s tip via `git merge-base --is-ancestor`, and a squash/rebase merge synthesizes a new SHA that breaks this permanently, turning the check into a false positive on an otherwise healthy repo. This keeps `release`'s tip an ancestor of `main`'s tip, which is what makes the *next* cycle's fast-forward in step 1 valid.

**Why `bench-full.yml` targets `release`, not `main`:** the version-bump/CHANGELOG commit from step 3 lands on `release`. If `bench-full.yml` (tag-triggered, so it can fire within seconds of step 3) still checked out and pushed to `main`, its auto-commit could land on `main` *before* the step 5 merge-back happens, corrupting the fast-forward relationship. Targeting `release` means both commits travel through the same merge-back PR together.

**Version sync:** `release-please-config.json` lists all 9 `package.json` files under `extra-files`. Every release PR bumps all of them in lockstep — no manual version edits needed.

Only `@neutro/form` (the alias package) is published — all other packages are `"private": true` and are bundled into the alias.
```

(Deliberately drops the old "not wired to anything" caveat, the `release-as` history note, and the resync-only-on-changelog-type note about stale PR checks — those described the *old* main-only flow's quirks; re-verify at execution time whether the changelog-type resync behavior still applies under `target-branch: release` and re-add a note if Task 7 observed it does.)

- [ ] **Step 3: Verify the section renders correctly**

Run: `sed -n '/^### Release Flow/,/^### Benchmark Suite/p' CLAUDE.md | head -n -1`
Expected: the new section text, ending cleanly before `### Benchmark Suite` with no leftover old content.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: describe the real two-branch release flow

Replaces the main-only description with the verified main/release
staged gate: target-branch: release wiring, bench-full.yml retargeted
to release, and the required post-release merge-back."
```

- [ ] **Step 5: STOP — get explicit user go-ahead before pushing**

- [ ] **Step 6: Push and open a PR against `main`**

```bash
TASK6_PR=$(gh pr list --base main --state merged --search "staged release gate" --json number --jq '.[0].number')
git push -u origin HEAD:docs-release-flow-update
gh pr create --base main --head docs-release-flow-update \
  --title "docs: describe the real two-branch release flow" \
  --body "Follow-up to #${TASK6_PR}, written after Task 7's empirical dry-run verification passed."
```

- [ ] **Step 7: STOP — get explicit user go-ahead before merging, then merge**

Run: `gh pr merge docs-release-flow-update --squash --delete-branch` (only after go-ahead).

---

## Deferred, not part of this plan's automated execution

- **Applying `main` branch protection** (require PRs, no direct pushes) is part of the design (spec section "Branch policy") but is deliberately left as a manual follow-up the user performs when ready, not an automated task here — it's a repo-wide setting change with broader blast radius than any single workflow file, and the spec explicitly places it last, "once everything above is verified." `gh api`'s `-f`/`-F` flags build a flat JSON body — they cannot express a nested field like `required_pull_request_reviews.required_approving_review_count` (that syntax would send a literal top-level key of that name, not a nested object, and the API would reject or misconfigure it). The correct approach is a JSON body file:
  ```bash
  cat > /tmp/branch-protection.json <<'EOF'
  {
    "required_status_checks": {
      "strict": true,
      "contexts": ["CI / test", "CI / bench-apps-typecheck", "Bench Regression / bench-regression"]
    },
    "enforce_admins": false,
    "required_pull_request_reviews": null,
    "restrictions": null
  }
  EOF
  gh api repos/neutro-web/form/branches/main/protection -X PUT --input /tmp/branch-protection.json
  ```
  (Check-run contexts follow GitHub's `<workflow name> / <job id>` convention — confirmed against this repo's actual workflow/job names, not guessed.) Review and adjust these fields with the user before running — this plan does not execute it.
- **A real version-bump release cycle** (the spec's verification-plan item 7) can only happen the next time there's actually a release-worthy change on `main` — this plan's Task 7 dry run only exercises the no-new-commits path (or, if commits happen to be release-worthy at execution time, the full path opportunistically). Either way, treat the first *real* version-bump release under this flow with extra attention even after this plan completes.
