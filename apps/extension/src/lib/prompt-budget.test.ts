import { describe, expect, it, vi } from "vitest";
import { generateText } from "ai";
import { DEFAULT_PROFILE, DEFAULT_SETTINGS } from "./defaults";
import { ANALYSIS_INSTRUCTIONS, buildAnalysisInput } from "./prompt";
import { runJobAnalysis } from "./openai";
import type { PageSnapshot } from "../types";

vi.mock("ai", () => ({
  generateText: vi.fn(),
  jsonSchema: (schema: unknown) => schema,
  Output: { object: (config: { schema: unknown }) => config.schema },
}));
vi.mock("./ai-provider", () => ({ createAiModel: vi.fn(() => ({})) }));

const snapshot: PageSnapshot = {
  title: "Nurse", url: "https://example.com/job", hostname: "example.com",
  ats: "Generic", headings: [], pageText: "Provide patient care.", fields: [],
  capturedAt: "2026-11-14T00:00:00Z",
};

describe("prompt context policy and budgets", () => {
  it("derives candidate context from the profile without assuming a software role", async () => {
    const profile = { ...DEFAULT_PROFILE, headline: "Registered nurse", targetRoles: "Critical care nurse", resumeText: "ICU nurse, 2018–present" };
    expect(ANALYSIS_INSTRUCTIONS).not.toContain("for an experienced software engineer");
    expect(ANALYSIS_INSTRUCTIONS).toMatch(/headline, target roles, and resume/i);
    expect(ANALYSIS_INSTRUCTIONS).toMatch(/currentDate/);
    expect(ANALYSIS_INSTRUCTIONS).toMatch(/per-skill.*total/i);
    expect(ANALYSIS_INSTRUCTIONS).toMatch(/consent.*attestation.*legal.*review/i);
    expect(ANALYSIS_INSTRUCTIONS).toMatch(/jobDescriptionDetected.*false/);
    vi.mocked(generateText).mockResolvedValueOnce({ output: { fit: { score: 80 } }, finishReason: "stop" } as never);
    await runJobAnalysis(snapshot, profile, DEFAULT_SETTINGS, { apiKey: "mock-key", installId: "test" });
    const call = vi.mocked(generateText).mock.calls[0][0];
    expect(call.instructions).toBe(ANALYSIS_INSTRUCTIONS);
    expect(call.prompt).toContain("Registered nurse");
    expect(call.prompt).toContain("Critical care nurse");
  });

  it("bounds resume and proof points while returning visible notices through the real pipeline", async () => {
    const profile = { ...DEFAULT_PROFILE, resumeText: "R".repeat(90_000), proofPoints: "P".repeat(60_000) };
    const input = JSON.parse(buildAnalysisInput(snapshot, profile, DEFAULT_SETTINGS));
    expect(input.candidateProfile.resumeText).toHaveLength(30_000);
    expect(input.candidateProfile.proofPoints).toHaveLength(12_000);
    expect(input.contextWarnings).toEqual(expect.arrayContaining([expect.stringMatching(/resume.*truncated/i), expect.stringMatching(/proof points.*truncated/i)]));
    vi.mocked(generateText).mockResolvedValueOnce({ output: { fit: { score: 80 }, missingFacts: ["Confirm degree"] }, finishReason: "stop" } as never);
    const result = await runJobAnalysis(snapshot, profile, DEFAULT_SETTINGS, { apiKey: "mock-key", installId: "test" });
    expect(result.missingFacts).toEqual(expect.arrayContaining(["Confirm degree", expect.stringMatching(/resume.*truncated/i), expect.stringMatching(/proof points.*truncated/i)]));
    expect(profile.resumeText).toHaveLength(90_000);
    expect(profile.proofPoints).toHaveLength(60_000);
  });

  it("does not warn or alter content within the profile budgets", async () => {
    const profile = { ...DEFAULT_PROFILE, resumeText: "Resume truth", proofPoints: "Proof truth" };
    const input = JSON.parse(buildAnalysisInput(snapshot, profile, DEFAULT_SETTINGS));
    expect(input.contextWarnings).toEqual([]);
    expect(input.candidateProfile.resumeText).toBe(profile.resumeText);
    expect(input.candidateProfile.proofPoints).toBe(profile.proofPoints);
    vi.mocked(generateText).mockResolvedValueOnce({ output: { fit: { score: 80 } }, finishReason: "stop" } as never);
    const result = await runJobAnalysis(snapshot, profile, DEFAULT_SETTINGS, { apiKey: "mock-key", installId: "test" });
    expect(result.missingFacts).toEqual([]);
  });

  it("announces existing page and field limits rather than silently dropping context", async () => {
    const largeSnapshot = { ...snapshot, pageText: "J".repeat(70_000), fields: Array.from({ length: 105 }, (_, i) => ({ id: `field-${i}`, label: `Question ${i}` })) } as PageSnapshot;
    const input = JSON.parse(buildAnalysisInput(largeSnapshot, DEFAULT_PROFILE, DEFAULT_SETTINGS));
    expect(input.jobApplicationPage.fields).toHaveLength(100);
    expect(input.jobApplicationPage.pageText).toHaveLength(60_000);
    expect(input.contextWarnings).toEqual(expect.arrayContaining([expect.stringMatching(/page text.*truncated/i), expect.stringMatching(/5.*fields.*omitted/i)]));
    vi.mocked(generateText).mockResolvedValueOnce({ output: { fit: { score: 80 } }, finishReason: "stop" } as never);
    const result = await runJobAnalysis({ ...largeSnapshot, fields: [] }, DEFAULT_PROFILE, DEFAULT_SETTINGS, { apiKey: "mock-key", installId: "test" });
    expect(result.missingFacts).toContainEqual(expect.stringMatching(/page text.*truncated/i));
  });
});
