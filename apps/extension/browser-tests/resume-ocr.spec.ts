import { test, expect, uploadResume, saveResume, savedProfile } from "./extension";
import { portraitResume, shortFactsResume } from "./portrait-resume";

const nativeTokens = ["ada+qa@example.test", "35.07%", "2021-09-17", "INV-0010"];

function expectExactNativeFacts(text: string) {
  for (const token of nativeTokens) {
    expect(text.split(token).length - 1, `Exact native token: ${token}`).toBe(1);
  }
  // Also forbid OCR variants silently accompanying the exact native facts.
  expect(text.match(/\b\S+@\S+/g)).toEqual(["ada+qa@example.test"]);
  expect(text.match(/\b\d+(?:\.\d+)?%/g)).toEqual(["35.07%"]);
  expect(text.match(/\b\d{4}-\d{2}-\d{2}\b/g)).toEqual(["2021-09-17"]);
  expect(text.match(/\bINV[-\s]?\S+/gi)).toEqual(["INV-0010"]);
}

test("scan-only upload recognizes candidate facts offline under production MV3 CSP", async ({ extensionPage: page }) => {
  const preview = await uploadResume(page, "scanned-resume.pdf");
  await expect(preview).toHaveValue(/Contoso/);
  const text = await preview.inputValue();
  expect(text.trim().length).toBeGreaterThanOrEqual(100);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await saveResume(page, "scanned-resume.pdf", text);
});

test("mixed native and scanned pages save every page's facts", async ({ extensionPage: page }) => {
  const preview = await uploadResume(page, "mixed-resume.pdf");
  await expect(preview).toHaveValue(/Contoso/);
  const text = await preview.inputValue();
  expect(text).toContain("DIGITAL PAGE TWO HEADING");
  expect(text).toContain("Northwind");
  expect(text).toContain("Contoso");
  expect(text).toContain("\f");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await saveResume(page, "mixed-resume.pdf", text);
});

test("large raster OCR adds facts without replacing or duplicating embedded candidate truth", async ({ extensionPage: page }) => {
  const preview = await uploadResume(page, "native-text-with-image.pdf");
  await expect(preview).toHaveValue(/RasterCo/);
  const text = await preview.inputValue();
  expect(text).toContain("IMAGE PROJECT EXPERIENCE");
  expect(text).toContain("RasterCo");
  expect(text).toContain("Northwind");
  expectExactNativeFacts(text);
  await expect(page.getByRole("alert")).toHaveCount(0);
  const profile = await saveResume(page, "native-text-with-image.pdf", text);
  expectExactNativeFacts(profile.resumeText);
});

test("a substantial textless portrait cannot erase readable exact embedded facts", async ({ extensionPage: page }) => {
  const bytes = await portraitResume();
  const filename = "native-text-with-portrait.pdf";
  const preview = await uploadResume(page, filename, bytes);
  await expect(preview).toHaveValue(/Northwind/);
  const text = await preview.inputValue();
  expectExactNativeFacts(text);
  await expect(page.getByRole("alert")).toHaveCount(0);
  const profile = await saveResume(page, filename, text, bytes);
  expectExactNativeFacts(profile.resumeText);
});

test("confident short image-only facts survive beside readable native text", async ({ extensionPage: page }) => {
  const bytes = await shortFactsResume();
  const filename = "native-text-with-short-facts.pdf";
  const preview = await uploadResume(page, filename, bytes);
  const text = await preview.inputValue();
  expect(text).toContain("2026-10-05");
  expect(text).toMatch(/\+44\s+20\s+7946\s+0958/);
  expect(text).toContain("AWS");
  for (const token of nativeTokens) expect(text.split(token).length - 1).toBe(1);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await saveResume(page, filename, text, bytes);
});

test("unreadable scanned replacement keeps the previous saved resume and original file", async ({ extensionPage: page }) => {
  const preview = await uploadResume(page, "scanned-resume.pdf");
  await expect(preview).toHaveValue(/Contoso/);
  const originalText = await preview.inputValue();
  const original = await saveResume(page, "scanned-resume.pdf", originalText);

  const afterFailure = await uploadResume(page, "unreadable-scan.pdf");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(afterFailure).toHaveValue(originalText);
  await expect(page.locator(".attachment-card strong")).toHaveText("scanned-resume.pdf");
  const stored = await savedProfile(page);
  expect(stored.resumeText).toBe(original.resumeText);
  expect(stored.resumeAttachment).toEqual(original.resumeAttachment);
  // Persist the editor after failure too: unchanged storage alone is insufficient.
  const persisted = await saveResume(page, "scanned-resume.pdf", originalText);
  expect(persisted.resumeAttachment).toEqual(original.resumeAttachment);
});
