import { describe, expect, it } from "vitest";
import { extractOutputText } from "./openai";

describe("Responses API parser", () => {
  it("reads output text from raw message items", () => {
    expect(
      extractOutputText({
        output: [
          { type: "web_search_call" },
          {
            type: "message",
            content: [{ type: "output_text", text: '{"fit":{"score":91}}' }],
          },
        ],
      }),
    ).toBe('{"fit":{"score":91}}');
  });

  it("prefers the convenience output_text property when present", () => {
    expect(extractOutputText({ output_text: "structured" })).toBe("structured");
  });
});
