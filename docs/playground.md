# Playground

An interactive, self-contained demo of `@agw/form` running directly in the browser — no build step required.

```html
<iframe
  src="../hardened_sandbox_playground.html"
  style="width:100%;height:800px;border:none;border-radius:8px;"
  title="@agw/form interactive playground"
></iframe>
```

The playground exercises all major features:

- Multi-step wizard with scoped validation per step
- Async uniqueness checks with visible AbortSignal cancellation
- Cursor-preserving phone number formatter via the DOM bridge
- Multi-select field
- Date cross-field dependency (end date re-validates when start date changes)
- Dynamic array CRUD with move and swap operations
- `reset(newValues)` re-seeding

To run it locally, open `hardened_sandbox_playground.html` directly in a browser from the repository root. It uses Tailwind via CDN and has the engine inlined as vanilla JS.
