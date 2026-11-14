import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { collectPageSnapshot } from "./page";
import sources from "./__fixtures__/ats/public-sources.json";

const expected: Record<string, { count: number; jd: boolean; first?: string; source?: string }> = {
  greenhouse: { count: 25, jd: true, first: "First Name", source: "selector:.job__description" },
  "lever-posting": { count: 0, jd: true }, "lever-apply": { count: 21, jd: false, first: "Full name✱" },
  ashby: { count: 0, jd: true, source: "selector:.ashby-job-posting-description" },
  "ashby-apply": { count: 9, jd: false, first: "Name" },
  smartrecruiters: { count: 0, jd: true }, generic: { count: 6, jd: false, first: "Search roles..." },
  linkedin: { count: 0, jd: true, source: "selector:.show-more-less-html__markup" },
};
describe("public-source ATS extraction", () => {
  it.each(sources)("captures $name without guessing page type or repeating the description", (source) => {
    const dom = new JSDOM(readFileSync(`src/lib/__fixtures__/ats/public-${source.name}.html`, "utf8"), { url: source.url });
    try {
      const snapshot = collectPageSnapshot(dom.window.document);
      const target = expected[source.name];
      expect(source.status).toBe(200);
      expect(snapshot.fields).toHaveLength(target.count);
      if (target.first) expect(snapshot.fields[0].label).toBe(target.first);
      expect(snapshot.jobDescriptionDetected).toBe(target.jd);
      if (target.source) expect(snapshot.jobDescriptionSource).toBe(target.source);
      if (target.jd) {
        const opening = snapshot.jobDescriptionText.slice(0, 100);
        expect(opening.length).toBe(100);
        expect(snapshot.pageText.split(opening).length - 1).toBe(1);
      } else expect(snapshot.jobDescriptionText).toBe("");
    } finally { dom.window.close(); }
  });
});
