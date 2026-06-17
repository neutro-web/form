# Contributing

## Commit format

This repository uses [Conventional Commits](https://www.conventionalcommits.org/). Every commit message must start with a type prefix:

| Prefix | What it does |
|---|---|
| `feat:` | New feature → bumps minor version |
| `fix:` | Bug fix → bumps patch version |
| `docs:` | Documentation only — no version bump |
| `perf:` | Performance improvement → bumps patch |
| `refactor:` | Code refactor — no version bump |
| `ci:` | CI/CD changes — no version bump |
| `feat!:` or `BREAKING CHANGE:` footer | Breaking change → bumps major version |

Examples:
```
feat: add resetField to FormInstance
fix(core): isEmpty now detects empty FileList
docs: add persistence guide
feat!: rename validator to validate (BREAKING CHANGE)
```

## How releases work

Releases are automated via `release-please`. When commits are pushed to `main`:

1. `release-please` parses the commit history and opens a "Release PR" that bumps `packages/alias/package.json` and generates `CHANGELOG.md` entries.
2. When the release PR is merged, `release-please` creates a `vX.Y.Z` tag automatically.
3. The `vX.Y.Z` tag triggers `.github/workflows/publish.yml`, which runs tests, builds, and publishes `@neutro/form` to npm.

You do NOT need to push tags manually.

## Running tests

```bash
pnpm install
pnpm test
```

## Building docs

```bash
pnpm docs:dev
```
