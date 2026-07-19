# Fieldcraft monorepo

Fieldcraft is a local-first Chrome extension and its product site.

## Workspaces

- `apps/extension` — the Chrome MV3 extension
- `apps/web` — the Next.js product site
- `packages/config` — shared TypeScript baseline

The repository keeps Bun, the package manager already used by the extension, and uses Turborepo to coordinate workspaces.

```bash
bun install
bun run dev
bun run build
bun run test
bun run doctor
```

To work on one application, run `bun run extension:dev` or `bun run --filter fieldcraft-web dev`.

## Extension download delivery

The extension-release workflow packages `fieldcraft-extension-latest.zip` for GitHub Releases. The landing-page download button proxies the built-in latest-release URL: `https://github.com/shubho0908/fieldcraft/releases/download/latest/fieldcraft-extension-latest.zip`. Set the optional server-side `EXTENSION_DOWNLOAD_URL` environment variable only to replace it with a stable HTTPS object URL in S3, Cloudflare R2, or equivalent.

The ZIP must unpack into a folder whose root contains `manifest.json`. Users download the ZIP, unzip it, then use Chrome's **Load unpacked** flow. See [apps/web/.env.example](apps/web/.env.example) for the optional override.
