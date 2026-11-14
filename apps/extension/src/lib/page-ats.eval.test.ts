import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { collectFields, collectPageSnapshot, extractRelevantPageText } from "./page";

const fixtures = [
  { file: "greenhouse-hosted", url: "https://boards.greenhouse.io/acme/jobs/417", ats: "Greenhouse", first: "First Name", name: "first_name", email: "Email" },
  { file: "lever-posting", url: "https://jobs.lever.co/acme/a1b2", ats: "Lever", first: "Full name (required)", name: "name", email: "Email" },
  { file: "lever-apply", url: "https://jobs.lever.co/acme/a1b2/apply", ats: "Lever", first: "Full name (required)", name: "name", email: "Email", noJD: true },
  { file: "ashby", url: "https://jobs.ashbyhq.com/acme/417", ats: "Ashby", first: "Full name", name: "name", email: "Email" },
  { file: "workday", url: "https://acme.wd5.myworkdayjobs.com/en-US/External/job/Platform_R417", ats: "Workday", first: "Given Name", name: "givenName", email: "Email Address" },
  { file: "smartrecruiters", url: "https://jobs.smartrecruiters.com/Acme/744417", ats: "SmartRecruiters", first: "First name", name: "firstName", email: "Email" },
  { file: "linkedin", url: "https://www.linkedin.com/jobs/view/417", ats: "LinkedIn", first: "First name", name: "firstName", email: "Email address" },
  { file: "generic-careers", url: "https://careers.acme.example/platform-engineer", ats: "Generic", first: "Full name", name: "full_name", email: "Email" },
];
const opening = "Our platform team builds reliable financial infrastructure for independent businesses.";
const expectedDescription = `About the role
Our platform team builds reliable financial infrastructure for independent businesses. You will own services that process payments, improve incident response, and help product teams ship safely across regions.

Responsibilities

Design APIs and operate distributed services with clear availability targets.

Partner with security and support teams to investigate production incidents.

Review architecture proposals and mentor engineers through delivery.

Requirements

Five years of professional engineering experience and strong production debugging skills.

Experience with TypeScript, PostgreSQL, observability, and cloud infrastructure.

Clear written communication and thoughtful technical tradeoffs.

Location and benefits
This is a full-time remote role in India with overlapping collaboration hours. We offer paid leave, equipment support, and a transparent interview process.`;

describe("deterministic authored ATS extraction evals", () => {
  it.each(fixtures)("captures exact fields and one JD for $file", (fixture) => {
    const html = readFileSync(`src/lib/__fixtures__/ats/${fixture.file}.html`, "utf8");
    const dom = new JSDOM(html, { url: fixture.url });
    try {
      const snapshot = collectPageSnapshot(dom.window.document);
      expect(snapshot.ats).toBe(fixture.ats);
      const expected = [
        { name: fixture.name, label: fixture.first, kind: "text", required: true, currentValue: "", options: [] },
        { name: "email", label: fixture.email, kind: "text", required: true, currentValue: "", options: [] },
        { name: "country", label: "Country", kind: "select", required: true, currentValue: "", options: [{ value: "in", label: "India" }, { value: "us", label: "United States" }] },
      ];
      const project = ({ name, label, kind, required, currentValue, options }: (typeof snapshot.fields)[number]) => ({ name, label, kind, required, currentValue, options });
      expect(snapshot.fields.map(project)).toEqual(expected);
      expect(collectFields(dom.window.document).map(project)).toEqual(expected);
      expect(snapshot.jobDescriptionDetected).toBe(!fixture.noJD);
      expect(snapshot.pageText.split(opening).length - 1).toBe(fixture.noJD ? 0 : 1);
      expect(snapshot.jobDescriptionText.includes(opening)).toBe(!fixture.noJD);
      expect(snapshot.jobDescriptionText).toBe(fixture.noJD ? "" : expectedDescription);
      expect(snapshot.pageText).not.toMatch(/Other open roles|Data Analyst|Privacy and terms|Website|Internal referral/);
      expect(snapshot.pageText).toContain("Country");
      expect(extractRelevantPageText(dom.window.document)).toBe(snapshot.pageText);
    } finally {
      dom.window.close();
    }
  });
});
