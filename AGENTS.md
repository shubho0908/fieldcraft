# Fieldcraft — Agent Notes

This is a **Bun + Turborepo monorepo** with two main surfaces: a Chrome MV3 extension (`apps/extension`) and a Next.js marketing site (`apps/web`).

## Structure

| Path | Package | Description |
|------|---------|-------------|
| `apps/extension` | `fieldcraft-extension` | Chrome MV3 side-panel extension (Vite + CRXJS) |
| `apps/web` | `fieldcraft-web` | Next.js product / marketing site |
| `packages/config` | `@fieldcraft/config` | Shared TypeScript baseline |

## Common commands

Run from the repo root with Bun:

```bash
bun install
bun run dev          # turbo run dev
bun run build        # turbo run build
bun run check        # turbo run check
bun run test         # turbo run test
bun run doctor       # react-doctor at repo root
```

Per-app filters:

```bash
bun run --filter fieldcraft-extension dev
bun run --filter fieldcraft-extension build
bun run --filter fieldcraft-extension check

bun run --filter fieldcraft-web dev      # http://localhost:3000
bun run --filter fieldcraft-web build
bun run --filter fieldcraft-web check
```

## Extension

- `bun run extension:dev` or `bun run --filter fieldcraft-extension dev`
- Load `apps/extension/dist` in `chrome://extensions` (Developer mode, Load unpacked).
- The side panel opens with `Ctrl+Shift+F` (Windows) / `Option+F` (macOS) or the toolbar icon.
- Tests/evals: `bun run --filter fieldcraft-extension eval` or `OPENAI_API_KEY=... bun run --filter fieldcraft-extension eval:live`.

## Web app

- `bun run --filter fieldcraft-web dev` runs the Next.js 16 marketing site on `http://localhost:3000`.
- Static assets live in `apps/web/public/`.
- The download route at `/api/extension/download` proxies the latest GitHub Release ZIP.

## Conventions

- Use `next/font/local` for web fonts and keep `display: swap`.
- Prefer semantic HTML, one `<h1>` per page, and proper heading order.
- Keep client components minimal; lazy-load dialogs and heavy demo components.
- Run `bun run check` before committing.

## Important files

- `apps/extension/README.md` — extension product docs
- `apps/extension/PRIVACY.md` — privacy policy
- `apps/web/app/layout.tsx` — site metadata, OG/Twitter, JSON-LD
- `apps/web/public/llms.txt` — LLM/agent site index
- `apps/web/public/ai.txt` — AI usage/attribution policy
- `apps/web/public/robots.txt` — crawler directives for search and AI bots
