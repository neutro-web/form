# Benchmark Page Cleanup

**Date:** 2026-07-01
**Status:** Approved
**Scope:** `bench/scripts/generate-page.ts`, `docs/.vitepress/config.ts`, `bench/package.json`

---

## Problem

The generated `docs/benchmarks/index.md` has two real defects, both confirmed by screenshot:

1. **Footnotes render as raw literal text.** `generate-page.ts` emits standard GFM footnote syntax (`[^key]` inline references, `[^key]: text` definitions), but VitePress has no `markdown-it-footnote` plugin registered — so instead of superscript jump-links and a clean footnotes section, the page shows a giant unbroken paragraph of `[^array-state-integrity-formik]: formik — state-map rekey...` literal strings.

2. **The page reads as cramped and disorganized.** Two contributing causes: (a) the Scorecard is a single 9-column table, forcing horizontal scroll and dense cells on any normal viewport; (b) the Methodology section explains all 5 badge meanings as one run-on prose paragraph instead of a scannable list.

## Fix 1: Real Footnotes

`markdown-it-footnote` is a VitePress/docs-site dependency, not a `bench/` dependency — add it to the **root** `package.json` devDependencies (VitePress config lives at `docs/.vitepress/config.ts`, built via the root `pnpm docs:build`/`docs:dev` scripts).

In `docs/.vitepress/config.ts`, add:

```ts
import footnote from 'markdown-it-footnote'

export default defineConfig({
  // ...existing config...
  markdown: {
    config: (md) => {
      md.use(footnote)
    },
  },
})
```

No change to `generate-page.ts`'s footnote-emission logic (`addFootnote`, `reasonMarker`) — the syntax it produces is already correct; it just needs a renderer that understands it.

## Fix 2: Scorecard Split Into Grouped Tables

Replace the single `scorecardTable()` function (which builds one 9-column table) with a `scorecardTable(columns: string[], heading: string)` function called three times, once per group:

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

Called under `## Scorecard` as three `###` subsections:

```ts
lines.push(
  `## Scorecard`, ``,
  `### Correctness`, ``,
  scorecardTable(['array-state-integrity', 'async-race', 'dependency-trigger']), ``,
  `### Performance`, ``,
  scorecardTable(['re-renders/10', 're-renders/100', 'async-latency', 'array-ops', 'async-cancellation']), ``,
  `### Size`, ``,
  scorecardTable(['bundle-size']), ``,
)
```

`buildScorecard()` itself (in `bench/scripts/scorecard.ts`) is unchanged — it already returns all badges per library; the split only changes which columns each rendered table selects, at the presentation layer.

## Fix 3: Bulleted Badge Legend

Replace the single Methodology paragraph that inlines all 5 badge meanings with a bulleted list:

```ts
`## Methodology`, ``,
`Three dimensions: **correctness** (PASS/FAIL), **browser performance** (Playwright Chromium), and **bundle size** (esbuild + gzip). Badges are always relative to neutro/form:`, ``,
`- ✅ **Win** — neutro beats this library by more than 10%`,
`- ➖ **Tied** — within 10% either way`,
`- ❌ **Behind** — neutro trails by more than 10%, no documented reason`,
`- ⚖️ **Tradeoff** — neutro trails for a documented design reason, *or* neutro passes a check this library architecturally can't (a harsh "neutro wins" is softened to Tradeoff instead) — see footnotes`,
`- — **N/A** — surface doesn't apply to this library`,
``,
```

## Fix 4 (bonus, same file): version fallback

`baseline.meta.neutroVersion` is `'unknown'` when `NEUTRO_VERSION` is unset (true for all local runs; CI sets it from the git tag). Currently `generate-page.ts` just prints whatever `merge-results.ts` wrote, producing `neutro/form vunknown`. This isn't a `generate-page.ts` bug — the fix belongs in `bench/scripts/merge-results.ts`, where `neutroVersion` is computed:

```ts
const neutroVersion = (process.env.NEUTRO_VERSION ?? '').replace(/^v/, '')
  || JSON.parse(readFileSync('../package.json', 'utf8')).version
  || 'unknown'
```

This reads the root `package.json`'s `version` field as a local-dev fallback, keeping `'unknown'` only as the last resort if that read somehow fails.

## What Stays the Same

- `bench/scripts/scorecard.ts` (`buildScorecard`) — unchanged, already returns per-library badges for all columns; grouping happens at render time.
- `bench/lib/verdict.ts`, `bench/annotations.ts` — unchanged, no data/logic changes.
- `correctnessTable()`, `browserTable()`, `bundleSizeTable()` — unchanged, these already render fine (the screenshots' complaints were about the Scorecard and Methodology sections specifically, and the footnote rendering which is a VitePress config fix, not a table-generation fix).
- Section order: Methodology → Scorecard → Correctness → Browser → Bundle Size → Architecture Notes → Footnotes — unchanged.

## Out of Scope

- No visual/CSS theming changes to VitePress itself (dark mode, table styling) — this fix is markdown structure and content only.
- No change to which surfaces exist or what data is collected — purely how it's presented.
