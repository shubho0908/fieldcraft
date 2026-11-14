import { describe, expect, it } from "vitest";
import { analysisUnits, judgeGrounding } from "./grounding";
import { toSafeAnalysis } from "../analysis";
import type { GroundingAudit } from "./types";

const analysis = toSafeAnalysis({ company: { summary: "Acme builds software", product: "Software", stage: "Unknown", size: "Unknown", funding: "Unknown", engineeringSignals: [], risks: [], sources: [] }, fit: { score: 80, verdict: "strong", strongestMatches: ["Built React interfaces"], gaps: [], hardBlockers: [], recommendation: "" } });
const sources: GroundingAudit["sources"] = [{ id: "p", kind: "profile", text: "Built React interfaces" }, { id: "j", kind: "job", text: "Acme builds software. Software" }];
function audit(): GroundingAudit {
  return { sources, findings: analysisUnits(analysis).map((unit) => ({ id: unit.id, status: "supported", reason: "Explicit evidence", citations: [{ sourceId: unit.id.startsWith("fit.") ? "p" : "j", quote: unit.text }] })) };
}
describe("independent grounding audit validation", () => {
  it("accepts complete audits with exact evidence in allowed sources", () => { expect(judgeGrounding(analysis, audit()).ok).toBe(true); });
  it("rejects omitted units and duplicate findings", () => {
    const missing = audit(); missing.findings.pop(); expect(judgeGrounding(analysis, missing).ok).toBe(false);
    const duplicate = audit(); duplicate.findings.push(duplicate.findings[0]); expect(judgeGrounding(analysis, duplicate).ok).toBe(false);
  });
  it("rejects invented quotes and job-only evidence for a candidate match", () => {
    const forged = audit(); forged.findings[0].citations[0].quote = "Invented quote"; expect(judgeGrounding(analysis, forged).ok).toBe(false);
    const wrong = audit(); wrong.findings.find((unit) => unit.id.startsWith("fit."))!.citations = [{ sourceId: "j", quote: "Software" }]; expect(judgeGrounding(analysis, wrong).ok).toBe(false);
  });
  it("cannot excuse company facts or candidate matches as non-factual", () => {
    const empty = audit(); empty.findings.forEach((finding) => { finding.status = "no_factual_claim"; finding.citations = []; });
    expect(judgeGrounding(analysis, empty).ok).toBe(false);
  });
});
