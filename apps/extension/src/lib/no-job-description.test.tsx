import { describe, expect, it, vi } from "vitest";
import { generateText } from "ai";
import { renderToStaticMarkup } from "react-dom/server";
import { runJobAnalysis, sanitizeAnalysis } from "./openai";
import { DEFAULT_PROFILE, DEFAULT_SETTINGS } from "./defaults";
import { toSafeAnalysis } from "./analysis";
import { FitVerdict } from "./enums";
import { ResultsDashboard } from "../components/DashboardViews";
import type { PageSnapshot } from "../types";

vi.mock("ai", () => ({ generateText: vi.fn(), jsonSchema: (value: unknown) => value, Output: { object: (value: unknown) => value } }));
vi.mock("./ai-provider", () => ({ createAiModel: vi.fn(() => ({})) }));

const snapshot: PageSnapshot & { jobDescriptionDetected: boolean } = { title: "Apply", url: "https://jobs.lever.co/acme/role/apply", hostname: "jobs.lever.co", ats: "Lever", headings: ["Apply"], pageText: "Full name Email Resume Submit application", fields: [], capturedAt: "2026-11-14T00:00:00Z", jobDescriptionDetected: false };
const parsed = () => toSafeAnalysis({ fit: { score: 93, verdict: FitVerdict.Excellent, strongestMatches: ["Strong match"], gaps: [], hardBlockers: [], recommendation: "Apply" } });

describe("fit requires captured job context", () => {
  it("discards a confident model score when the page contains only an application", () => {
    const result = sanitizeAnalysis(parsed(), snapshot, [], false);
    expect(result.fit.score).toBeNull();
    expect(result.fit.strongestMatches).toEqual([]);
    expect(result.fit).toHaveProperty("unavailableReason", expect.stringMatching(/no job description.*posting/i));
  });

  it("keeps field analysis available through the real mocked model path with a null score", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { ...parsed(), fit: { ...parsed().fit, score: null, unavailableReason: "No job description" } }, finishReason: "stop" } as never);
    const result = await runJobAnalysis(snapshot, DEFAULT_PROFILE, DEFAULT_SETTINGS, { apiKey: "test-only", installId: "test-only" });
    expect(result.fit.score).toBeNull();
    expect(result.fit).toHaveProperty("unavailableReason", expect.stringMatching(/no job description/i));
    expect(result.suggestions).toEqual([]);
    const html = renderToStaticMarkup(<ResultsDashboard analysis={result} snapshot={snapshot} status="done" error="" activeTab="fit" selected={new Set()} selectedCount={0} fillResults={[]} toast="" onOpenSettings={() => {}} onAnalyze={() => {}} onTab={() => {}} onToggle={() => {}} onChange={() => {}} onSelectSafe={() => {}} onFill={() => {}} />);
    expect(html).toMatch(/no job description/i);
    expect(html).not.toContain("score-ring");
    expect(html).not.toContain("weak fit");
  });
});
