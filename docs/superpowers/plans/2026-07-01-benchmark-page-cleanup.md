# Benchmark Page Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix broken footnote rendering and cramped layout on the generated `docs/benchmarks/index.md` page.

**Architecture:** Register `markdown-it-footnote` in VitePress config (fixes footnotes site-wide, not just this page); restructure `bench/scripts/generate-page.ts`'s Scorecard and Methodology sections for readability; fix a version-fallback bug in `merge-results.ts` while in the area.

**Tech Stack:** VitePress 1.3, markdown-it-footnote (new), existing bench TypeScript scripts.

## Global Constraints

- `bench/scripts/scorecard.ts`'s `buildScorecard()` function signature and return shape must not change — only how `generate-page.ts` calls/renders it.
- Footnote emission logic (`addFootnote`, `reasonMarker` in `generate-page.ts`) already produces correct GFM footnote syntax — do not modify it, only make the renderer understand it.
- All other tables (`correctnessTable`, `browserTable`, `bundleSizeTable`) are unchanged — only the Scorecard section and Methodology section are restructured.

---

### Task 1: Register the footnote plugin in VitePress

**Files:**
- Modify: `package.json`
- Modify: `docs/.vitepress/config.ts`

**Interfaces:**
- Produces: working `[^key]`/`[^key]: text` footnote rendering site-wide in VitePress, consumed visually by every page that uses footnote syntax (currently only `docs/benchmarks/index.md`).

- [ ] **Step 1: Add the dependency**

In `package.json`, add to `devDependencies` (alphabetical order, after `lefthook`):

```json
    "markdown-it-footnote": "^3.0.3",
```

Full updated block:

```json
  "devDependencies": {
    "@biomejs/biome": "^2.5.0",
    "jsdom": "^25.0.0",
    "lefthook": "^2.1.9",
    "markdown-it-footnote": "^3.0.3",
    "typescript": "^5.0.0",
    "vitepress": "^1.3.0",
    "vitest": "^3.2.6"
  },
```

- [ ] **Step 2: Install**

```bash
pnpm install
```

Expected: `markdown-it-footnote` appears in `pnpm-lock.yaml`, no errors.

- [ ] **Step 3: Wire it into VitePress config**

In `docs/.vitepress/config.ts`, add the import at the top:

```ts
import { defineConfig } from 'vitepress'
import footnote from 'markdown-it-footnote'
```

Then add a `markdown` key to the `defineConfig({...})` object, alongside the existing `vite` key:

```ts
export default defineConfig({
  title: '@neutro/form',
  description: 'Zero-dependency reactive form engine for every framework.',
  base: '/form/',
  srcExclude: ['superpowers/**'],
  ignoreDeadLinks: [/localhost/],

  markdown: {
    config: (md) => {
      md.use(footnote)
    },
  },

  vite: {
    server: { port: 7000 },
    preview: { port: 7001 },
  },

  // ...rest of themeConfig unchanged...
```

- [ ] **Step 4: Verify footnotes render**

```bash
pnpm docs:dev &
sleep 3
curl -s http://localhost:7000/form/benchmarks/ -o /tmp/bench-page-check.html
grep -o "footnote-ref\|footnotes" /tmp/bench-page-check.html | head -5
kill %1
```

Expected: at least one match for `footnote-ref` or `footnotes` in the served HTML — VitePress's markdown-it-footnote plugin emits these CSS classes when footnotes are present and parsed (confirms the plugin is active; note VitePress dev serves client-rendered HTML, so if `curl` shows nothing, instead open `http://localhost:7000/form/benchmarks/` in a browser and confirm footnote markers appear as small superscript numbers, not raw `[^...]` text).

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml docs/.vitepress/config.ts
git commit -m "docs: register markdown-it-footnote plugin so [^ref] syntax renders correctly"
```

---

### Task 2: Split the Scorecard into grouped tables and simplify the Methodology legend

**Files:**
- Modify: `bench/scripts/generate-page.ts`

**Interfaces:**
- Consumes: `buildScorecard(baseline): ScorecardRow[]` from `bench/scripts/scorecard.ts` (unchanged signature — `ScorecardRow = { library: string, badges: Record<string, Verdict> }`).
- Produces: same `docs/benchmarks/index.md` output file, restructured content.

- [ ] **Step 1: Replace `scorecardTable()` to take a columns parameter**

Find this function in `bench/scripts/generate-page.ts`:

```ts
function scorecardTable(): string {
  const rows = buildScorecard(baseline)
  const columns = ['array-state-integrity', 'async-race', 'dependency-trigger', 're-renders/10', 're-renders/100', 'async-latency', 'array-ops', 'async-cancellation', 'bundle-size']
  const header = `| Library | ${columns.join(' | ')} |`
  const divider = `|---|${columns.map(() => '---').join('|')}|`
  const body = rows.map(r => {
    const cells = columns.map(c => BADGE_LABEL[r.badges[c] ?? 'na'])
    return `| ${r.library} | ${cells.join(' | ')} |`
  }).join('\n')
  return `${header}\n${divider}\n${body}`
}
```

Replace with:

```ts
function scorecardTable(columns: string[]): string {
  const rows = buildScorecard(baseline)
  const header = `| Library | ${columns.join(' | ')} |`
  const divider = `|---|${columns.map(() => '---').join('|')}|`
  const body = rows.map(r => {
    const cells = columns.map(c => BADGE_LABEL[r.badges[c] ?? 'na'])
    return `| ${r.library} | ${cells.join(' | ')} |`
  }).join('\n')
  return `${header}\n${divider}\n${body}`
}
```

(Only the function signature changed — `columns` is now a parameter instead of a hardcoded local constant.)

- [ ] **Step 2: Replace the Methodology + Scorecard section of the `lines` array**

Find this block in `bench/scripts/generate-page.ts`:

```ts
const lines: string[] = [
  `# Benchmarks`,
  ``,
  `> Measured on: GitHub Actions ubuntu-latest, Node ${baseline.meta.nodeVersion}, Chromium (Playwright)`,
  `> Last updated: ${date} | neutro/form v${version}`,
  ``,
  `## Methodology`,
  ``,
  `Three dimensions: **correctness** (PASS/FAIL), **browser performance** (Playwright Chromium), and **bundle size** (esbuild + gzip).`,
  `Badges are always relative to neutro/form: ✅ Win (neutro beats this library by >10%), ➖ Tied (within 10%), ❌ Behind (neutro trails by >10%, no documented reason), ⚖️ Tradeoff (either neutro trails by >10% due to a documented design choice, or neutro passes a correctness/capability check that this library architecturally cannot — the library's failure has a documented reason, so a harsh "neutro wins" framing is softened to Tradeoff instead — see footnotes), — N/A (surface doesn't apply to this library).`,
  ``,
  `## Scorecard`,
  ``,
  scorecardTable(),
  ``,
  `## Correctness`,
  ``,
]
```

Replace with:

```ts
const lines: string[] = [
  `# Benchmarks`,
  ``,
  `> Measured on: GitHub Actions ubuntu-latest, Node ${baseline.meta.nodeVersion}, Chromium (Playwright)`,
  `> Last updated: ${date} | neutro/form v${version}`,
  ``,
  `## Methodology`,
  ``,
  `Three dimensions: **correctness** (PASS/FAIL), **browser performance** (Playwright Chromium), and **bundle size** (esbuild + gzip). Badges are always relative to neutro/form:`,
  ``,
  `- ✅ **Win** — neutro beats this library by more than 10%`,
  `- ➖ **Tied** — within 10% either way`,
  `- ❌ **Behind** — neutro trails by more than 10%, no documented reason`,
  `- ⚖️ **Tradeoff** — neutro trails for a documented design reason, *or* neutro passes a check this library architecturally can't (a harsh "neutro wins" is softened to Tradeoff instead) — see footnotes`,
  `- — **N/A** — surface doesn't apply to this library`,
  ``,
  `## Scorecard`,
  ``,
  `### Correctness`,
  ``,
  scorecardTable(['array-state-integrity', 'async-race', 'dependency-trigger']),
  ``,
  `### Performance`,
  ``,
  scorecardTable(['re-renders/10', 're-renders/100', 'async-latency', 'array-ops', 'async-cancellation']),
  ``,
  `### Size`,
  ``,
  scorecardTable(['bundle-size']),
  ``,
  `## Correctness`,
  ``,
]
```

- [ ] **Step 3: Regenerate the page and inspect it**

```bash
cd bench && pnpm bench:generate
cat ../docs/benchmarks/index.md
```

Expected: the `## Scorecard` section now has three `###` subsections (Correctness, Performance, Size), each with a narrower table (3, 5, and 1 data columns respectively, plus the Library column). The Methodology section is now a bulleted list, not a single paragraph. No TypeScript errors from the `pnpm bench:generate` command.

- [ ] **Step 4: Commit**

```bash
git add bench/scripts/generate-page.ts docs/benchmarks/index.md
git commit -m "bench: split Scorecard into 3 grouped tables, bullet the badge legend"
```

---

### Task 3: Fix local-run version fallback

**Files:**
- Modify: `bench/scripts/merge-results.ts`

**Interfaces:**
- Produces: `merged.meta.neutroVersion` — consumed by `generate-page.ts`'s `const version = baseline.meta.neutroVersion` (unchanged consumer, only the value improves for local runs).

- [ ] **Step 1: Find and replace the version line**

In `bench/scripts/merge-results.ts`, find:

```ts
const neutroVersion = (process.env.NEUTRO_VERSION ?? '').replace(/^v/, '') || 'unknown'
```

Replace with:

```ts
function readLocalVersion(): string {
  try {
    return JSON.parse(readFileSync('../package.json', 'utf8')).version ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

const neutroVersion = (process.env.NEUTRO_VERSION ?? '').replace(/^v/, '') || readLocalVersion()
```

This reads the repo root's `package.json` (`bench/`'s parent directory, hence `'../package.json'` relative to `bench/`'s cwd when scripts run via `pnpm --dir bench run ...`) as a local-dev fallback when `NEUTRO_VERSION` isn't set. `readFileSync` is already imported at the top of this file (used for `results/*.json` reads) — no new import needed.

- [ ] **Step 2: Verify**

```bash
cd bench && pnpm bench:merge
grep neutroVersion results/latest.json
```

Expected: a version string like `"neutroVersion": "0.4.2"` — not `"unknown"` — since `NEUTRO_VERSION` is unset locally and the fallback now reads the real `package.json` version.

- [ ] **Step 3: Regenerate the page to confirm the header updates**

```bash
pnpm bench:generate
head -5 ../docs/benchmarks/index.md
```

Expected: `> Last updated: <date> | neutro/form v0.4.2` (or whatever the current root `package.json` version is) — not `vunknown`.

- [ ] **Step 4: Commit**

```bash
git add bench/scripts/merge-results.ts docs/benchmarks/index.md
git commit -m "bench: fall back to root package.json version for local runs instead of 'unknown'"
```

---

## Self-Review Notes

- **Spec coverage:** Fix 1 (footnote plugin) → Task 1. Fix 2 (scorecard split) → Task 2 Step 1-2. Fix 3 (bulleted legend) → Task 2 Step 2. Fix 4 (version fallback) → Task 3. All four spec items covered.
- **Type consistency:** `scorecardTable(columns: string[])` signature is defined once in Task 2 Step 1 and used identically (3 calls with different array literals) in Task 2 Step 2 — no mismatch.
- **No placeholders:** every step shows exact before/after code, not descriptions.
