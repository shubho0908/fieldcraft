import { test as base, expect, chromium, type BrowserContext, type Page } from "@playwright/test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CandidateProfile } from "../src/types";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
export const resumeFixture = (name: string) =>
  fileURLToPath(new URL(`../src/lib/__fixtures__/resumes/${name}`, import.meta.url));

export const test = base.extend<{ extensionPage: Page }>({
  extensionPage: async ({}, use) => {
    let manifest: {
      manifest_version: number;
      background: { service_worker: string };
      side_panel: { default_path: string };
      content_security_policy: { extension_pages: string };
    };
    try {
      manifest = JSON.parse(await readFile(join(dist, "manifest.json"), "utf8"));
    } catch (cause) {
      throw new Error("Browser regressions require the production Chrome extension. Run bun run build in apps/extension first.", { cause });
    }

    const profileDir = await mkdtemp(join(tmpdir(), "fieldcraft-browser-"));
    let context: BrowserContext | undefined;
    try {
      context = await chromium.launchPersistentContext(profileDir, {
        channel: "chromium",
        headless: true,
        args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
        viewport: { width: 480, height: 1000 },
      });
      // Both parsing and saving must work with no external services or credentials.
      await context.route(/^https?:\/\//, (route) => route.abort());
      await context.setOffline(true);
      const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
      const extensionId = new URL(worker.url()).host;
      await worker.evaluate(async () => {
        await chrome.storage.local.clear();
        await chrome.storage.session.clear();
        await chrome.storage.local.set({
          "fieldcraft.profile": {
            onboardingComplete: true,
            identity: { fullName: "Ada Example", email: "ada@example.test" },
          },
          "fieldcraft.settings": { autofillMode: "direct", researchCompany: false },
        });
      });
      const page = await context.newPage();
      // This is the manifest's real sidepanel entry, served by Chrome with MV3 CSP.
      await page.goto(`chrome-extension://${extensionId}/${manifest.side_panel.default_path}`);
      await openResumeEditor(page);
      await use(page);
    } finally {
      try {
        await context?.close();
      } finally {
        await rm(profileDir, { recursive: true, force: true });
      }
    }
  },
});

export async function openResumeEditor(page: Page) {
  await page.getByRole("button", { name: "Profile and settings", exact: true }).click();
  await page.locator(".editor-footer .primary-button").click();
  await expect(page.getByRole("textbox", { name: /Resume text preview/ })).toBeVisible();
}

export async function uploadResume(page: Page, filename: string, bytes?: Buffer) {
  const attachment = page.locator(".attachment-card");
  const preview = page.getByRole("textbox", { name: /Resume text preview/ });
  await page.getByLabel("Upload resume", { exact: true }).setInputFiles(
    bytes ? { name: filename, mimeType: "application/pdf", buffer: bytes } : resumeFixture(filename),
  );
  await expect(attachment).toHaveAttribute("aria-busy", "true");
  await expect(preview).toBeDisabled();
  await expect(page.locator(".editor-footer .primary-button")).toBeDisabled();
  await expect(attachment).toHaveAttribute("aria-busy", "false");
  await expect(preview).toBeEnabled();
  return preview;
}

export async function savedProfile(page: Page): Promise<CandidateProfile> {
  return page.evaluate(async () => {
    const stored = await chrome.storage.local.get("fieldcraft.profile");
    return stored["fieldcraft.profile"];
  });
}

export async function saveResume(page: Page, filename: string, expectedText: string, uploadedBytes?: Buffer) {
  // Experience -> Defaults -> Writing/AI -> persist through the real editor.
  const next = page.locator(".editor-footer .primary-button");
  await next.click();
  await next.click();
  await next.click();
  await expect(page.locator(".profile-editor")).toHaveCount(0);
  const profile = await savedProfile(page);
  expect(profile.resumeText).toBe(expectedText);
  expect(profile.resumeAttachment?.name).toBe(filename);
  const bytes = uploadedBytes ?? await readFile(resumeFixture(filename));
  expect(profile.resumeAttachment?.dataUrl).toBe(`data:application/pdf;base64,${bytes.toString("base64")}`);
  // The saved preview must survive remounting, not merely live in React state.
  await page.reload();
  await openResumeEditor(page);
  await expect(page.getByRole("textbox", { name: /Resume text preview/ })).toHaveValue(expectedText);
  await expect(page.locator(".attachment-card strong")).toHaveText(filename);
  return profile;
}

export { expect };
