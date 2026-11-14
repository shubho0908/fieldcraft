import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateText } from "ai";
import { analysisUnits, auditGrounding, judgeGrounding, judgeSourceProvenance } from "./grounding";
import { EVAL_FIXTURES } from "./fixtures";
import { toSafeAnalysis } from "../analysis";
import { AI_MODELS, Provider, resolveMaxOutputTokens, resolveModel } from "../models";
import { hundredFieldOutput } from "../__fixtures__/large-analysis";
import type { AnalysisUnit, GroundingAudit, GroundingFinding } from "./types";

vi.mock("ai", () => ({
  generateText: vi.fn(),
  jsonSchema: (schema: unknown) => schema,
  Output: { object: (config: { schema: unknown }) => config.schema },
}));
vi.mock("../ai-provider", () => ({ createAiModel: vi.fn(() => ({})) }));

const analysis = toSafeAnalysis({ company: { summary: "Acme builds software", product: "Software", stage: "Unknown", size: "Unknown", funding: "Unknown", engineeringSignals: [], risks: [], sources: [] }, fit: { score: 80, verdict: "strong", strongestMatches: ["Built React interfaces"], gaps: [], hardBlockers: [], recommendation: "" } });
const sources: GroundingAudit["sources"] = [{ id: "p", kind: "profile", text: "Built React interfaces" }, { id: "j", kind: "job", text: "Acme builds software. Software" }];
function audit(): GroundingAudit {
  return { sources, findings: analysisUnits(analysis).map((unit) => ({ id: unit.id, status: "supported", reason: "Explicit evidence", citations: [{ sourceId: unit.id.startsWith("fit.") ? "p" : "j", quote: unit.text }] })) };
}
describe("independent grounding audit validation", () => {
  it("checks source provenance as a unit invariant, not a sanitized-run accuracy metric", () => {
    const fixture = EVAL_FIXTURES[0];
    const invalid = { ...analysis, company: { ...analysis.company, sources: [{ title: "Job", url: fixture.snapshot.url }] } };
    expect(judgeSourceProvenance(invalid, sources, fixture).ok).toBe(false);
  });
  it("accepts complete audits with exact evidence in allowed sources", () => { expect(judgeGrounding(analysis, audit()).ok).toBe(true); });
  it("rejects omitted units and duplicate findings", () => {
    const missing = audit(); missing.findings.pop(); expect(judgeGrounding(analysis, missing).ok).toBe(false);
    const duplicate = audit(); duplicate.findings.push(duplicate.findings[0]); expect(judgeGrounding(analysis, duplicate).ok).toBe(false);
  });
  it("rejects invented quotes and job-only evidence for a candidate match", () => {
    const forged = audit(); forged.findings[0].citations[0].quote = "Invented quote"; expect(judgeGrounding(analysis, forged).ok).toBe(false);
    const wrong = audit(); wrong.findings.find((unit) => unit.id.startsWith("fit."))!.citations = [{ sourceId: "j", quote: "Software" }]; expect(judgeGrounding(analysis, wrong).ok).toBe(false);
  });
  it("accepts job evidence supplementing valid profile evidence for a match", () => {
    const supplemented = audit();
    supplemented.findings.find((unit) => unit.id.startsWith("fit."))!.citations.push({ sourceId: "j", quote: "Software" });
    expect(judgeGrounding(analysis, supplemented).ok).toBe(true);
    supplemented.findings.find((unit) => unit.id.startsWith("fit."))!.citations[0].quote = "Fabricated profile quote";
    expect(judgeGrounding(analysis, supplemented).ok).toBe(false);
  });
  it("cannot excuse company facts or candidate matches as non-factual", () => {
    const empty = audit(); empty.findings.forEach((finding) => { finding.status = "no_factual_claim"; finding.citations = []; });
    expect(judgeGrounding(analysis, empty).ok).toBe(false);
  });
});

describe("provider-compatible exhaustive grounding requests", () => {
  beforeEach(() => { vi.mocked(generateText).mockReset(); });

  function findingsFor(units: AnalysisUnit[]): GroundingFinding[] {
    return units.map((unit) => ({
      id: unit.id, status: "supported", reason: "Explicit evidence",
      citations: [{ sourceId: unit.id.startsWith("fit.strongestMatches.") ? "p" : "j", quote: unit.text }],
    }));
  }

  function mockCompleteBatches() {
    vi.mocked(generateText).mockImplementation(async (request) => {
      const { units } = JSON.parse(String(request.prompt)) as { units: AnalysisUnit[] };
      const output = { findings: findingsFor(units) };
      return { finishReason: "stop", output, text: JSON.stringify(output) } as never;
    });
  }

  const smallestModels = AI_MODELS.filter((model) =>
    model.provider !== Provider.Custom && model.maxOutputTokens <= 16_384,
  ).map((model) => model.id);

  it.each(smallestModels)("respects the catalog ceiling for %s", async (model) => {
    mockCompleteBatches();
    await auditGrounding(EVAL_FIXTURES[0], analysis, sources, { model, apiKey: "test-only" });
    expect(generateText).toHaveBeenCalled();
    for (const [request] of vi.mocked(generateText).mock.calls) {
      expect(request.maxOutputTokens).toBeLessThanOrEqual(resolveModel(model).maxOutputTokens);
      expect(request.maxOutputTokens).toBeLessThanOrEqual(resolveMaxOutputTokens(model));
    }
  });

  it.each(["gemini-3.7-flash", "custom:offline-judge"])("audits every unit in a full large 100-field output using bounded %s batches", async (model) => {
    mockCompleteBatches();
    const large = toSafeAnalysis(hundredFieldOutput);
    const expectedUnits = analysisUnits(large);
    const largeSources = [
      { id: "p", kind: "profile" as const, text: expectedUnits.map((unit) => unit.text).join("\n") },
      { id: "j", kind: "job" as const, text: expectedUnits.map((unit) => unit.text).join("\n") },
    ];
    const audited = await auditGrounding(EVAL_FIXTURES[0], large, largeSources, {
      model, apiKey: "test-only", customBaseUrl: "https://judge.example.test/v1",
    });
    expect(expectedUnits.length).toBeGreaterThan(300);
    expect(vi.mocked(generateText).mock.calls.length).toBeGreaterThan(1);
    const requestedUnits = vi.mocked(generateText).mock.calls.flatMap(([request]) => {
      expect(request.maxOutputTokens).toBeLessThanOrEqual(resolveMaxOutputTokens(model));
      if (model.startsWith("custom:")) expect(request.maxOutputTokens).toBeLessThanOrEqual(4096);
      const batch = JSON.parse(String(request.prompt)) as { units: AnalysisUnit[]; sources: GroundingAudit["sources"] };
      expect(batch.sources).toEqual(largeSources);
      expect(batch.units.length).toBeLessThan(expectedUnits.length);
      return batch.units;
    });
    expect(requestedUnits).toEqual(expectedUnits);
    expect(audited.findings.map((finding) => finding.id)).toEqual(expectedUnits.map((unit) => unit.id));
    expect(judgeGrounding(large, audited).ok).toBe(true);
  });

  it.each(["omitted", "duplicate", "unexpected"] as const)("rejects %s findings within a batch before requesting another", async (problem) => {
    vi.mocked(generateText).mockImplementation(async (request) => {
      const { units } = JSON.parse(String(request.prompt)) as { units: AnalysisUnit[] };
      const findings = findingsFor(units);
      if (problem === "omitted") findings.pop();
      if (problem === "duplicate") findings.push(findings[0]);
      if (problem === "unexpected") findings[0].id = "suggestions.999.value";
      return { finishReason: "stop", output: { findings } } as never;
    });
    await expect(auditGrounding(EVAL_FIXTURES[0], toSafeAnalysis(hundredFieldOutput), sources, {
      model: "gemini-3.7-flash", apiKey: "test-only",
    })).rejects.toThrow(/coverage|duplicate|unexpected|missing/i);
    expect(generateText).toHaveBeenCalledTimes(1);
  });

  it("rejects a finding replayed from a preceding batch", async () => {
    let firstFinding: GroundingFinding | undefined;
    vi.mocked(generateText).mockImplementation(async (request) => {
      const { units } = JSON.parse(String(request.prompt)) as { units: AnalysisUnit[] };
      const findings = findingsFor(units);
      if (firstFinding) findings[0] = firstFinding;
      else firstFinding = findings[0];
      return { finishReason: "stop", output: { findings } } as never;
    });
    await expect(auditGrounding(EVAL_FIXTURES[0], toSafeAnalysis(hundredFieldOutput), sources, {
      model: "gemini-3.7-flash", apiKey: "test-only",
    })).rejects.toThrow(/coverage|duplicate|unexpected/i);
    expect(generateText).toHaveBeenCalledTimes(2);
  });

  it("fails explicitly on truncated output before trying to parse it", async () => {
    vi.mocked(generateText).mockResolvedValue({ finishReason: "length", get output() { throw new Error("Must not parse truncated JSON"); } } as never);
    await expect(auditGrounding(EVAL_FIXTURES[0], analysis, sources, {
      model: "gemini-3.7-flash", apiKey: "test-only",
    })).rejects.toThrow(/truncated/i);
  });

  it("classifies SDK structured-output length failures as truncation", async () => {
    vi.mocked(generateText).mockRejectedValue(Object.assign(new Error("No object generated"), { finishReason: "length" }));
    await expect(auditGrounding(EVAL_FIXTURES[0], analysis, sources, {
      model: "gemini-3.7-flash", apiKey: "test-only",
    })).rejects.toThrow(/truncated/i);
  });
});
