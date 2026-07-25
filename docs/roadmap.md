# Roadmap

Where `@neutro/form` is headed beyond the current stable release. Nothing here is scheduled to a specific version unless stated — these are candidates, not commitments.

## Under consideration

Each of these is deliberately not yet built. They're listed for visibility, not urgency — several are waiting on a specific signal before work starts.

**React Native adapter** — the core engine and the React adapter already work in React Native today (`form.set('field', value)` in `TextInput`'s `onChangeText`, `form.get('field')` for the `value` prop), but there's no official adapter package with RN-idiomatic patterns, and `connect()`'s DOM bridge doesn't apply outside the browser. A real RN adapter would need its own connection mechanism (no `HTMLElement`/`MutationObserver` to hook into) rather than a thin re-export of the React adapter. See [Community FAQ → Does it work with React Native?](/community#does-it-work-with-react-native).

**Field / Controller-style components** — a render-prop `<Field>` component for the framework adapters, and a vanilla `<neutro-field>` web component, in the style of React Hook Form's `Controller`. Deliberately deferred: a controlled `<Field>` re-renders on every keystroke, undermining the zero-rerender story that's one of this library's two core differentiators; a vanilla web component can't express `arrayRemove`/`arrayMove` path updates through a static HTML attribute, and isn't SSR-safe. Worth building only if real adoption patterns show developers consistently struggling with the current hook/connect APIs — not speculatively.

**Visual devtools panel** — an in-page UI overlay/panel variant of `devtools()`, beyond the console-only devtools shipped in 0.1.0. No specific version target.

## Known limitations to close

**Strongly typed field paths — raw array-of-array nesting only partially caught.** `Path<T>` catches ordinary path typos at compile time, but a *raw* array nested directly inside another array (no object wrapper), e.g. `cube: number[][][]`, only type-checks one level deep — `'cube.0.1'` compiles, `'cube.0.1.2'` needs an `as Path<T>` cast even though it's runtime-correct. Object-wrapped array nesting (`items.0.taxes.1.rate`) is unaffected. Worth a dedicated fix only if raw non-object-wrapped nested arrays become a real, reported user need — see [TypeScript Guide → Strict path types](/guides/typescript#strict-path-types-v0-4) and [Community → Honest Gaps](/community#honest-gaps) for the full detail.

## Shipped

The v0.5.0 release closed out an 8-item performance/correctness/coverage gate (indexed array-op scans, modular bundle splitting, browser-level competitor comparisons, class-validator benchmarking, nested-array correctness, a full performance audit, and a React re-render fix) — see the [Benchmarks](/benchmarks/) page and [Changelog](https://github.com/neutro-web/form/blob/main/CHANGELOG.md) for specifics.
