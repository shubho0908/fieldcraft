import { test, expect } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import { fileURLToPath } from "node:url";
import type * as Capture from "../src/lib/page";
import type { FieldSuggestion } from "../src/types";
import { Confidence, SuggestionAction } from "../src/lib/enums";

let server: ViteDevServer;
let origin: string;

test.beforeAll(async () => {
  server = await createServer({ configFile: false, root: fileURLToPath(new URL("../", import.meta.url)), logLevel: "error", server: { host: "127.0.0.1", port: 0 } });
  await server.listen();
  const address = server.httpServer!.address();
  if (!address || typeof address === "string") throw new Error("Capture fixture server has no TCP address");
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => { await server?.close(); });

test("real open-shadow controls retain local labels, exact choices, selection, and composed events", async ({ page }) => {
  await page.route(`${origin}/capture-fixture`, (route) => route.fulfill({ contentType: "text/html", body: '<!doctype html><html><body><label id="email-label">Wrong outer label</label><career-application style="display:block"></career-application></body></html>' }));
  await page.goto(`${origin}/capture-fixture`);
  await page.evaluate(async () => {
    const capture: typeof Capture = await import("/src/lib/page.ts");
    Object.assign(window, { capture });
    const root = document.querySelector("career-application")!.attachShadow({ mode: "open" });
    root.innerHTML = `<article class="job-description"><h1>Platform engineer</h1><p>Responsibilities include operating reliable distributed systems and collaborating with product teams. Requirements include five years of professional engineering experience and clear technical communication across teams.</p><aside>Other jobs secret</aside></article><form><label id="email-label">Your email *</label><input aria-labelledby="email-label" name="email"><label>Country<select name="country"><option value="0">-- choose --</option><option value="in">India</option><option value="us">United States</option></select></label><label>City<input name="city" role="combobox" aria-controls="city-options"></label><div id="city-options" role="listbox"><div role="option">Bengaluru</div></div><hidden-form hidden></hidden-form><div style="margin-top:1600px"><label>Cover letter<textarea name="cover"></textarea></label></div></form>`;
    root.querySelector("hidden-form")!.attachShadow({ mode: "open" }).innerHTML = `<label>Secret<input name="secret"></label>`;
    const clicks: string[] = [];
    root.querySelector("[role=option]")!.addEventListener("click", () => clicks.push("Bengaluru"));
    const events: string[] = [];
    document.addEventListener("change", () => events.push("change"));
    Object.assign(window, { clicks, events });
  });
  const snapshot = await page.evaluate(() => (window as unknown as { capture: typeof Capture }).capture.collectPageSnapshot(document));
  expect(snapshot.fields.map(({ name, label, currentValue, required }) => ({ name, label, currentValue, required }))).toEqual([
    { name: "email", label: "Your email", currentValue: "", required: true },
    { name: "country", label: "Country", currentValue: "", required: false },
    { name: "city", label: "City", currentValue: "", required: false },
    { name: "cover", label: "Cover letter", currentValue: "", required: false },
  ]);
  expect(snapshot.jobDescriptionDetected).toBe(true);
  expect(snapshot.pageText).not.toContain("secret");
  const values = ["ada@example.test", "India", "Bengaluru", "Unselected draft"];
  const suggestions: FieldSuggestion[] = snapshot.fields.map((field, index) => ({ fieldId: field.id, label: field.label, action: SuggestionAction.Review, value: values[index], confidence: Confidence.High, evidence: "Reviewed profile", warning: "" }));
  const before = await page.evaluate((items) => (window as unknown as { capture: typeof Capture }).capture.fillPageFields(items, document), suggestions);
  expect(before.every(({ status }) => status === "skipped")).toBe(true);
  const results = await page.evaluate(({ items, selected }) => (window as unknown as { capture: typeof Capture }).capture.fillPageFields(items, document, undefined, new Set(selected)), { items: suggestions, selected: snapshot.fields.slice(0, 3).map((field) => field.id) });
  expect(results.map(({ status }) => status)).toEqual(["filled", "filled", "filled", "skipped"]);
  await expect(page.locator('input[name="email"]')).toHaveValue("ada@example.test");
  await expect(page.locator("select")).toHaveValue("in");
  await expect(page.locator("textarea")).toHaveValue("");
  expect(await page.evaluate(() => (window as unknown as { clicks: string[] }).clicks)).toEqual(["Bengaluru"]);
  expect(await page.evaluate(() => (window as unknown as { events: string[] }).events.length)).toBeGreaterThanOrEqual(3);
  await page.locator("textarea").scrollIntoViewIfNeeded();
  const afterScroll = await page.evaluate(() => (window as unknown as { capture: typeof Capture }).capture.collectFields(document).map((field) => field.name));
  expect(afterScroll).toEqual(["email", "country", "city", "cover"]);
});

test("real layout excludes clipped, zero-size, offscreen, inert and aria-hidden honeypots", async ({ page }) => {
  await page.route(`${origin}/capture-fixture`, (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html><html><body><main><div class="job-description"><p>Responsibilities include delivering dependable business workflows and maintaining production services. Requirements include customer empathy, practical debugging skills, and clear communication with engineering partners.</p><span style="display:none">Invisible description secret</span></div><label>Visible<input name="visible"></label><div style="display:none"><input name="display"></div><div inert><input name="inert"></div><div aria-hidden="true"><input name="aria"></div><input name="offscreen" style="position:absolute;left:-9999px"><input name="translated" style="transform:translateX(-9999px)"><input name="zero" style="width:0;height:0;padding:0;border:0"><div style="width:1px;height:1px;overflow:hidden"><label>Secret<input name="clipped"></label></div><div style="max-height:0;overflow:hidden"><input name="max-height"></div></main></body></html>` }));
  await page.goto(`${origin}/capture-fixture`);
  const snapshot = await page.evaluate(async () => {
    const capture: typeof Capture = await import("/src/lib/page.ts");
    return capture.collectPageSnapshot(document);
  });
  expect(snapshot.fields.map((field) => field.name)).toEqual(["visible"]);
  expect(snapshot.jobDescriptionDetected).toBe(true);
  expect(snapshot.pageText).not.toContain("secret");
});
