import { describe, expect, it } from "vitest";
import {
  parseCustomHeaderLines,
  sanitizeCustomHeaders,
  serializeCustomHeaderLines,
} from "./custom-headers";

describe("custom header helpers", () => {
  describe("sanitizeCustomHeaders", () => {
    it("returns an empty object for non-object or array input", () => {
      expect(sanitizeCustomHeaders(undefined)).toEqual({});
      expect(sanitizeCustomHeaders(null)).toEqual({});
      expect(sanitizeCustomHeaders([])).toEqual({});
      expect(sanitizeCustomHeaders("foo")).toEqual({});
    });

    it("keeps valid RFC 7230 token names and trims values", () => {
      expect(
        sanitizeCustomHeaders({
          "X-Title": "  Fieldcraft  ",
          "HTTP-Referer": "https://fieldcraft.sh",
        }),
      ).toEqual({
        "X-Title": "Fieldcraft",
        "HTTP-Referer": "https://fieldcraft.sh",
      });
    });

    it("drops invalid names, non-string values, and empty values", () => {
      expect(
        sanitizeCustomHeaders({
          "Bad:Name": "value",
          "Good-Name": "  ",
          "Another": 123 as unknown as string,
          "": "value",
        }),
      ).toEqual({});
    });

    it("collapses newlines inside values to spaces", () => {
      expect(
        sanitizeCustomHeaders({
          "X-Context": "line1\nline2\r\nline3",
        }),
      ).toEqual({ "X-Context": "line1 line2 line3" });
    });

    it("collapses duplicate header names case-insensitively", () => {
      expect(
        sanitizeCustomHeaders({
          "X-Title": "First",
          "x-title": "Second",
          "HTTP-Referer": "https://fieldcraft.sh",
        }),
      ).toEqual({
        "x-title": "Second",
        "HTTP-Referer": "https://fieldcraft.sh",
      });
    });
  });

  describe("parseCustomHeaderLines", () => {
    it("parses colon and equals separated lines", () => {
      const input = `X-Title: Fieldcraft
HTTP-Referer=https://fieldcraft.sh
Empty: value`;
      expect(parseCustomHeaderLines(input)).toEqual({
        "X-Title": "Fieldcraft",
        "HTTP-Referer": "https://fieldcraft.sh",
        Empty: "value",
      });
    });

    it("parses a JSON object", () => {
      const input = '{"X-Title": "Fieldcraft", "HTTP-Referer": "https://fieldcraft.sh"}';
      expect(parseCustomHeaderLines(input)).toEqual({
        "X-Title": "Fieldcraft",
        "HTTP-Referer": "https://fieldcraft.sh",
      });
    });

    it("ignores blank lines and comments", () => {
      const input = `# header
X-Title: Fieldcraft

// ignored
HTTP-Referer: https://fieldcraft.sh`;
      expect(parseCustomHeaderLines(input)).toEqual({
        "X-Title": "Fieldcraft",
        "HTTP-Referer": "https://fieldcraft.sh",
      });
    });

    it("falls back to line parsing when JSON is malformed", () => {
      const input = `{"broken json
X-Title: Fieldcraft`;
      expect(parseCustomHeaderLines(input)).toEqual({
        "X-Title": "Fieldcraft",
      });
    });

    it("collapses duplicate header names case-insensitively", () => {
      const input = `X-Title: First
x-title: Second
HTTP-Referer: https://fieldcraft.sh`;
      expect(parseCustomHeaderLines(input)).toEqual({
        "x-title": "Second",
        "HTTP-Referer": "https://fieldcraft.sh",
      });
    });
  });

  describe("serializeCustomHeaderLines", () => {
    it("produces colon separated lines", () => {
      expect(
        serializeCustomHeaderLines({
          "X-Title": "Fieldcraft",
          "HTTP-Referer": "https://fieldcraft.sh",
        }),
      ).toBe("X-Title: Fieldcraft\nHTTP-Referer: https://fieldcraft.sh");
    });

    it("returns an empty string for empty headers", () => {
      expect(serializeCustomHeaderLines({})).toBe("");
    });
  });
});
