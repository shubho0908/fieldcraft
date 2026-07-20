# Fieldcraft

Fieldcraft is a **local-first Chrome extension** that helps you read job applications clearly, judge fit against your real experience, and fill forms only after you review each answer. This repository is a **Bun + Turborepo monorepo** that also ships the product marketing site.

It never submits an application for you.

## Workspaces

| Path | Package name | Description |
|------|--------------|-------------|
| [`apps/extension`](apps/extension) | `fieldcraft-extension` | Chrome MV3 side-panel extension (Vite + CRXJS) |
| [`apps/web`](apps/web) | `fieldcraft-web` | Next.js product / marketing site |
| [`packages/config`](packages/config) | `@fieldcraft/config` | Shared TypeScript baseline (`tsconfig.base.json`) |

App-specific details (features, architecture, eval harness) live in:

- [apps/extension/README.md](apps/extension/README.md) — extension product docs
- [apps/extension/PRIVACY.md](apps/extension/PRIVACY.md) — privacy policy
- [packages/config/README.md](packages/config/README.md) — shared config scope

## Prerequisites

- [Bun](https://bun.sh/) (repo `packageManager`: `bun@1.3.14`)
- Chrome (for loading the extension)

## Quick start

```bash
bun install
```

### Run everything Turborepo knows about

```bash
bun run dev      # turbo run dev  — extension Vite + web Next (persistent)
bun run build    # turbo run build
bun run check    # turbo run check (typecheck)
bun run test     # turbo run test
bun run doctor   # react-doctor at repo root
```

### Work on one app

```bash
# Extension (Vite / CRXJS)
bun run extension:dev
bun run extension:build
# equivalent:
bun run --filter fieldcraft-extension dev
bun run --filter fieldcraft-extension build
bun run --filter fieldcraft-extension check
bun run --filter fieldcraft-extension test

# Product site (Next.js)
bun run --filter fieldcraft-web dev
bun run --filter fieldcraft-web build
bun run --filter fieldcraft-web check
```

You can also `cd apps/extension` or `cd apps/web` and run that package’s scripts with Bun from there.

## Extension

### Load a development build

1. `bun run extension:dev`
2. Open `chrome://extensions`, enable **Developer mode**, **Load unpacked**
3. Select the CRXJS / Vite output directory shown in the terminal (typically `apps/extension/dist`)
4. Open a job page and use **⌥F** (macOS) / **Ctrl+Shift+F** (Windows) (or the toolbar icon) to open the side panel

### Production build

```bash
bun run extension:build
# output: apps/extension/dist  (manifest.json at the package root of the build)
```

Zip packaging for GitHub Releases is handled by CI (see below). For a manual zip:

```bash
cd apps/extension/dist
zip -r ../../../fieldcraft-extension.zip . -x "*.map"
```

The ZIP root must contain `manifest.json` so Chrome **Load unpacked** works after unzip.

### Eval & live eval

From the extension package (or with `--filter fieldcraft-extension`):

```bash
bun run --filter fieldcraft-extension eval
OPENAI_API_KEY=sk-... bun run --filter fieldcraft-extension eval:live
```

Full env table and architecture notes: [apps/extension/README.md](apps/extension/README.md).

## Product site (`apps/web`)

```bash
bun run --filter fieldcraft-web dev
# http://localhost:3000
```

The landing page includes:

- Product walkthrough / GSAP demo (desktop-oriented; small screens show a desktop-required message)
- **Download extension** dialog with Chrome install steps
- Proxy download API at `GET /api/extension/download`

### Extension download delivery

By default the download route streams the latest CI-published asset:

`https://github.com/shubho0908/fieldcraft/releases/download/latest/fieldcraft-extension-latest.zip`

Optional server-side override (stable object URL in S3, Cloudflare R2, etc.):

```bash
# apps/web/.env.local  (see apps/web/.env.example)
EXTENSION_DOWNLOAD_URL=https://downloads.example.com/fieldcraft/latest.zip
```

Users: download ZIP → unzip → Chrome **Load unpacked** → select the folder that contains `manifest.json`.

## Releases & CI

Workflow: [`.github/workflows/extension-release.yml`](.github/workflows/extension-release.yml)

Triggers on pushes to `main` that touch extension-related paths, version tags `v*.*.*`, or manual `workflow_dispatch`.

It:

1. `bun install --frozen-lockfile`
2. Typechecks, tests, and builds **only** `fieldcraft-extension`
3. Zips `apps/extension/dist` to:
   - `fieldcraft-extension-<version>.zip`
   - `fieldcraft-extension-latest.zip` (branch builds also refresh the `latest` GitHub Release)

Path filters include `apps/extension/**`, `packages/config/**`, root lockfile / `package.json` / `turbo.json`, and the workflow file itself.

## Repository layout

```text
.
├── apps/
│   ├── extension/          # Chrome MV3 extension
│   │   ├── public/         # icons, fonts
│   │   ├── src/            # side panel, background, content, lib
│   │   ├── package.json    # fieldcraft-extension
│   │   └── vite.config.ts
│   └── web/                # Next.js site
│       ├── app/            # App Router pages, API routes, styles
│       ├── package.json    # fieldcraft-web
│       └── .env.example
├── packages/
│   └── config/             # shared tsconfig base
├── package.json            # monorepo root (workspaces + turbo scripts)
├── turbo.json
├── bun.lock
└── README.md
```

## What the extension does (short)

- Reads the open job/application tab and maps visible form fields
- Scores fit against a profile you control; optional Exa company research
- Supports OpenAI, Gemini, and custom OpenAI-compatible providers
- **Analyze with AI** or **Direct-fill** from profile facts
- Requires field-level review; never presses Submit

See [apps/extension/README.md](apps/extension/README.md) for full product, safety, and architecture documentation.
