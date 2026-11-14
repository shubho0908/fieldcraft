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

test("real scroll containers retain accessible fields and frame hosts without admitting clipped traps", async ({ page }) => {
  await page.route(`${origin}/scroll-fixture`, (route) => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><iframe id="upper"></iframe><div id="scroll" style="width:400px;height:150px;overflow:auto"><label>Start<input name="start"></label><div style="height:600px"></div><label>Last<input name="last"></label><iframe id="scroll-frame"></iframe></div><div style="width:400px;height:100px;overflow-x:clip;overflow-y:visible"><div style="margin-top:200px"><label>Axis<input name="axis"></label><iframe id="axis-frame"></iframe></div></div><div style="width:100px;height:100px;overflow:hidden"><div style="margin-left:200px"><input name="trap"><iframe id="clipped"></iframe></div></div><div style="height:2000px"></div>`,
  }));
  await page.goto(`${origin}/scroll-fixture`);
  const capture = () => page.evaluate(async () => {
    const engine: typeof Capture = await import("/src/lib/page.ts");
    const { isFrameHostVisible } = await import("/src/lib/frame-document.ts");
    return {
      fields: engine.collectFields(document).map((field) => field.name),
      frames: Object.fromEntries(Array.from(document.querySelectorAll("iframe"), (frame) => [frame.id, isFrameHostVisible(frame)])),
    };
  });
  const expected = { fields: ["start", "last", "axis"], frames: { upper: true, "scroll-frame": true, "axis-frame": true, clipped: false } };
  expect(await capture()).toEqual(expected);
  await page.evaluate(() => {
    document.querySelector("#scroll")!.scrollTop = 1000;
    window.scrollTo(0, 900);
  });
  expect(await capture()).toEqual(expected);
});

test("real slots and display-contents preserve whole postings, job headers and table boundaries", async ({ page }) => {
  const description = "Responsibilities include operating reliable distributed services and working with product partners. Requirements include professional engineering experience and clear communication across teams.";
  await page.route(`${origin}/slot-fixture`, (route) => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><header>Site chrome secret</header><main><career-post class="job-description" style="display:contents"><section slot="description"><header><h1>Engineer</h1><p>Canadian citizenship is mandatory.</p></header><div class="job-description-body">${description}</div><table><tr><th>Location</th><td>Toronto onsite only</td></tr><tr><th>Certification</th><td>A medical license is mandatory.</td></tr></table></section><p>Unassigned secret</p></career-post><section class="job-description">Mandatory qualification: French fluency.</section><career-form style="display:block"><label slot="contact">Email<input name="email"></label><label slot="blocked">Secret<input name="blocked"></label><input name="unassigned"></career-form><h2>References</h2><reference-contact style="display:block"></reference-contact></main>`,
  }));
  await page.goto(`${origin}/slot-fixture`);
  const snapshot = await page.evaluate(async () => {
    document.querySelector("career-post")!.attachShadow({ mode: "open" }).innerHTML = '<article><slot name="description">Unused fallback secret</slot></article>';
    document.querySelector("career-form")!.attachShadow({ mode: "open" }).innerHTML = '<form><slot name="contact"></slot><div inert aria-hidden="true"><slot name="blocked"></slot></div></form>';
    document.querySelector("reference-contact")!.attachShadow({ mode: "open" }).innerHTML = '<label>Full name<input name="reference"></label>';
    const capture: typeof Capture = await import("/src/lib/page.ts");
    return capture.collectPageSnapshot(document);
  });
  for (const text of [description, "Canadian citizenship is mandatory.", "French fluency.", "A medical license is mandatory."]) {
    expect(snapshot.jobDescriptionText).toContain(text);
    expect(snapshot.pageText.split(text)).toHaveLength(2);
  }
  expect(snapshot.jobDescriptionText).toMatch(/Location\s+Toronto onsite only\s+Certification/);
  expect(snapshot.headings).toContain("Engineer");
  expect(snapshot.pageText).not.toContain("secret");
  expect(snapshot.fields.map(({ name, section }) => ({ name, section }))).toEqual([
    { name: "email", section: "Application" },
    { name: "reference", section: "References" },
  ]);
});

test("real exact choice filling rejects ambiguous options and never submits", async ({ page }) => {
  await page.route(`${origin}/choice-fixture`, (route) => route.fulfill({
    contentType: "text/html",
    body: '<!doctype html><form><label>Years<select><option value="">Choose</option><option value="1">2</option><option value="2">3</option></select></label><fieldset><legend>Rating</legend><label>2<input type="radio" name="rating" value="1"></label><label>3<input type="radio" name="rating" value="2"></label></fieldset><label>City<input role="combobox" aria-controls="cities"></label><div id="cities" role="listbox"><div role="option" data-value="1">2</div><div role="option" data-value="2">3</div></div><button type="submit">Submit</button></form>',
  }));
  await page.goto(`${origin}/choice-fixture`);
  const result = await page.evaluate(async () => {
    let submits = 0;
    let clicks = 0;
    document.querySelector("form")!.addEventListener("submit", (event) => { event.preventDefault(); submits++; });
    document.querySelectorAll("[role=option]").forEach((option) => option.addEventListener("click", () => { clicks++; }));
    const capture: typeof Capture = await import("/src/lib/page.ts");
    const fields = capture.collectFields(document);
    const suggestions: FieldSuggestion[] = fields.map((field) => ({ fieldId: field.id, label: field.label, action: "review", value: "2", confidence: "high", evidence: "Explicit review", warning: "" }));
    const results = await capture.fillPageFields(suggestions, document, undefined, new Set(fields.map((field) => field.id)));
    return { statuses: results.map((item) => item.status), submits, clicks };
  });
  expect(result).toEqual({ statuses: ["failed", "failed", "failed"], submits: 0, clicks: 0 });
  await expect(page.locator("select")).toHaveValue("");
  await expect(page.locator("input[type=radio]:checked")).toHaveCount(0);
  await expect(page.locator("[role=combobox]")).toHaveValue("");
});

test("real asynchronous combobox writes preserve intervening edits with and without a matching option", async ({ page }) => {
  await page.route(`${origin}/combo-fixture`, (route) => route.fulfill({ contentType: "text/html", body: '<!doctype html><label>City<input role="combobox" aria-controls="cities" value="Previous city"></label><div id="cities" role="listbox"></div>' }));
  await page.goto(`${origin}/combo-fixture`);
  for (const matching of [false, true]) {
    const result = await page.evaluate(async (matching) => {
      const input = document.querySelector("input")!;
      input.value = "Previous city";
      const list = document.querySelector("#cities")!;
      list.innerHTML = matching ? '<div role="option">Bengaluru</div>' : "";
      let clicks = 0;
      list.querySelector("[role=option]")?.addEventListener("click", () => { clicks++; });
      const capture: typeof Capture = await import("/src/lib/page.ts");
      const [field] = capture.collectFields(document);
      const suggestion: FieldSuggestion = { fieldId: field.id, label: field.label, action: "review", value: "Bengaluru", confidence: "high", evidence: "Explicit review", warning: "" };
      const pending = capture.fillPageFields([suggestion], document, undefined, new Set([field.id]));
      input.value = "New user input";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      const results = await pending;
      return { status: results[0].status, value: input.value, clicks };
    }, matching);
    expect(result).toEqual({ status: "failed", value: "New user input", clicks: 0 });
  }
});
