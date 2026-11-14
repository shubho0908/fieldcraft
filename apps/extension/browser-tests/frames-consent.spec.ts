import { test, expect, chromium, type BrowserContext, type Page, type Worker } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RuntimeRequest, TabAnalysisSession } from "../src/types";

let server: Server;
let origin: string;
let embeddedOrigin: string;
let context: BrowserContext;
let worker: Worker;
let profile: string;
let extensionId: string;
let requestPage: Page;

test.beforeAll(async () => {
  server = createServer((request, response) => {
    response.setHeader("Content-Type", "text/html");
    if (request.url === "/embedded") {
      response.end('<!doctype html><title>Embedded application</title><label>Full name<input id="name"></label><label>Email<input id="email"></label><button id="submit" type="submit">Submit application</button><script>document.querySelector("#submit").onclick=()=>window.submitted=true</script>');
      return;
    }
    response.end(`<!doctype html><title>Example — Careers</title><main><h1>Customer support specialist</h1><article class="job-description"><h2>About this role</h2><p>Unique posting evidence: help customers solve problems, communicate clearly, and improve our support documentation.</p></article><label>Full name<input id="name"></label><label>Email<input id="email"></label><candidate-contact></candidate-contact><iframe title="Application" src="${embeddedOrigin}/embedded"></iframe><div hidden><iframe title="Hidden application" src="${embeddedOrigin}/embedded"></iframe></div></main><script>customElements.define('candidate-contact',class extends HTMLElement{connectedCallback(){this.attachShadow({mode:'open'}).innerHTML='<label>Phone<input id="phone" type="tel"></label>'}})</script>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "0.0.0.0", resolve));
  const port = (server.address() as { port: number }).port;
  origin = `http://127.0.0.1:${port}`;
  embeddedOrigin = `http://localhost:${port}`;
  profile = await mkdtemp(join(tmpdir(), "fieldcraft-frames-"));
  const dist = fileURLToPath(new URL("../dist/", import.meta.url));
  context = await chromium.launchPersistentContext(profile, {
    channel: "chromium", headless: true,
    args: ["--remote-debugging-port=0", `--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
    viewport: { width: 520, height: 1000 },
  });
  worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  extensionId = new URL(worker.url()).host;
  await worker.evaluate(async () => {
    await chrome.storage.local.clear();
    await chrome.storage.session.clear();
    await chrome.storage.local.set({
      "fieldcraft.profile": { onboardingComplete: true, identity: { fullName: "Ada Example", email: "ada@example.test", phone: "+1 555 0100" } },
      "fieldcraft.settings": { autofillMode: "direct", researchCompany: false },
    });
  });
  requestPage = await context.newPage();
  await requestPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);
});

test.afterAll(async () => {
  await context?.close();
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  if (profile) await rm(profile, { recursive: true, force: true });
});

function request(message: RuntimeRequest): Promise<any> {
  return requestPage.evaluate((value) => chrome.runtime.sendMessage(value), message);
}

async function tabSession(tabId: number): Promise<TabAnalysisSession> {
  const result = await request({ type: "FIELDCRAFT_GET_TAB_SESSION", tabId });
  expect(result.ok).toBe(true);
  return result.session;
}

async function openApplication() {
  const page = await context.newPage();
  await page.goto(origin);
  await expect(page.frameLocator('iframe[title="Application"]').locator("#name")).toBeVisible();
  const tabId = await worker.evaluate(async (url) => (await chrome.tabs.query({})).find((tab) => tab.url === url)!.id!, page.url());
  return { page, tabId };
}

test("Direct review captures distinct cross-origin and shadow fields without writing; only selected fields are filled", async () => {
  const { page, tabId } = await openApplication();
  const windowId = await worker.evaluate(async (id) => (await chrome.tabs.get(id)).windowId, tabId);
  await requestPage.evaluate((id) => {
    document.body.innerHTML = '<button id="open-native-panel">Open review panel</button>';
    document.querySelector<HTMLButtonElement>("#open-native-panel")!.onclick = () => { void chrome.sidePanel.open({ windowId: id }); };
  }, windowId);
  await requestPage.locator("#open-native-panel").click();
  await worker.evaluate((id) => chrome.tabs.update(id, { active: true }), tabId);
  const port = (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0];
  const nativeConnection = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  let panel: Page | undefined;
  for (const candidate of nativeConnection.contexts()[0].pages()) {
    if (candidate.url().startsWith(`chrome-extension://${extensionId}/`) && !await candidate.evaluate(() => chrome.tabs.getCurrent())) panel = candidate;
  }
  expect(panel, "Chrome must expose the actual native sidepanel, not a mocked extension tab").toBeDefined();
  if (!panel) throw new Error("Native sidepanel unavailable");
  await panel.getByRole("button", { name: "Review Direct-fill answers", exact: true }).click({ timeout: 10_000 });
  await expect(panel.locator(".answer-card")).toHaveCount(5, { timeout: 10_000 });
  const session = await tabSession(tabId);
  expect(session.snapshot!.url).toBe(page.url());
  expect(session.snapshot!.fields.map((field) => field.label).sort()).toEqual(["Email", "Email", "Full name", "Full name", "Phone"]);
  expect(new Set(session.snapshot!.fields.map((field) => field.id)).size).toBe(5);
  expect(session.snapshot!.frames).toHaveLength(2);
  for (const field of session.snapshot!.fields) expect(field.id).toMatch(new RegExp(`^frame-${field.frameId}:`));
  expect(session.snapshot!.pageText.split("Unique posting evidence:").length - 1).toBe(1);
  expect(session.selectedFieldIds).toEqual([]);
  await expect(panel.getByRole("button", { name: "Fill selected", exact: true })).toBeDisabled();
  await expect(page.locator("#name")).toHaveValue("");
  await expect(page.locator("#email")).toHaveValue("");
  await expect(page.locator("candidate-contact input")).toHaveValue("");
  await expect(page.frameLocator('iframe[title="Application"]').locator("#name")).toHaveValue("");
  await expect(page.frameLocator('iframe[title="Application"]').locator("#email")).toHaveValue("");
  const embedded = session.snapshot!.fields.find((field) => field.frameId !== 0 && field.label === "Full name")!;
  const suggestionIndex = session.analysis!.suggestions.findIndex((item) => item.fieldId === embedded.id);
  await panel.locator(".answer-card").nth(suggestionIndex).getByRole("button", { name: "Select Full name", exact: true }).click();
  await panel.getByRole("button", { name: "Select Phone", exact: true }).click();
  await panel.screenshot({ path: process.env.FIELDCRAFT_FRAME_SCREENSHOT || "/home/user/.capy/work/accuracy/direct-frame-review.png", fullPage: true });
  await panel.getByRole("button", { name: "Fill selected", exact: true }).click();
  await expect(page.frameLocator('iframe[title="Application"]').locator("#name")).toHaveValue("Ada Example");
  await expect(page.locator("#name")).toHaveValue("");
  await expect(page.locator("#email")).toHaveValue("");
  await expect(page.locator("candidate-contact input")).toHaveValue("+1 555 0100");
  await expect(page.frameLocator('iframe[title="Application"]').locator("#email")).toHaveValue("");
  expect(await page.frameLocator('iframe[title="Application"]').locator("body").evaluate(() => (window as any).submitted)).toBeUndefined();
  await panel.close();
  await page.close();
});

test("a same-URL iframe reload invalidates captured answers instead of filling a new document", async () => {
  const { page, tabId } = await openApplication();
  expect(await request({ type: "FIELDCRAFT_DIRECT_FILL", tabId, url: page.url() })).toMatchObject({ ok: true });
  const session = await tabSession(tabId);
  const field = session.snapshot!.fields.find((item) => item.frameId !== undefined && item.frameId !== 0 && item.label === "Full name");
  expect(field).toBeDefined();
  const suggestion = session.analysis!.suggestions.find((item) => item.fieldId === field!.id)!;
  expect(await request({ type: "FIELDCRAFT_UPDATE_TAB_REVIEW", tabId, url: page.url(), runId: session.runId, analysis: session.analysis!, selectedFieldIds: [field!.id] })).toMatchObject({ ok: true });
  const frame = page.frames().find((item) => item.url() === `${embeddedOrigin}/embedded`)!;
  await frame.goto(frame.url());
  const result = await request({ type: "FIELDCRAFT_FILL_TAB", tabId, url: page.url(), runId: session.runId, suggestions: [suggestion] });
  expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/changed|document|again/i) });
  await expect(page.frameLocator('iframe[title="Application"]').locator("#name")).toHaveValue("");
  await page.close();
});
