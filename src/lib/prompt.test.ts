import { describe, expect, it } from "vitest";
import { DEFAULT_PROFILE, DEFAULT_SETTINGS } from "./defaults";
import { buildAnalysisInput } from "./prompt";
import type { PageSnapshot } from "../types";

describe("analysis input", () => {
  it("includes candidate truth while excluding resume attachment bytes", () => {
    const profile = structuredClone(DEFAULT_PROFILE);
    profile.identity.fullName = "Candidate Name";
    profile.resumeText = "A".repeat(180);
    profile.resumeAttachment = {
      name: "resume.pdf",
      mimeType: "application/pdf",
      size: 42,
      dataUrl: "data:application/pdf;base64,SECRET_FILE_BYTES",
    };
    const snapshot: PageSnapshot = {
      title: "Engineer",
      url: "https://jobs.example.com/1",
      hostname: "jobs.example.com",
      ats: "Generic",
      headings: ["Engineer"],
      pageText: "A real job description",
      fields: [],
      capturedAt: new Date().toISOString(),
    };

    const input = buildAnalysisInput(snapshot, profile, DEFAULT_SETTINGS);
    expect(input).toContain("Candidate Name");
    expect(input).toContain("resume.pdf");
    expect(input).toContain('"hasResumeAttachment": true');
    expect(input).not.toContain("SECRET_FILE_BYTES");
    expect(input).not.toContain("data:application/pdf");
  });
});
