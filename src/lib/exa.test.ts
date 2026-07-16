import { afterEach, describe, expect, it, vi } from "vitest";
import { EXA_SEARCH_URL, testExaConnection } from "./exa";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Exa connection probe", () => {
  it("uses the minimal documented Search request and accepts a valid response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ requestId: "exa-test-1", results: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(testExaConnection("exa-key")).resolves.toEqual({
      requestId: "exa-test-1",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      EXA_SEARCH_URL,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-api-key": "exa-key" }),
        body: JSON.stringify({
          query: "Fieldcraft connection test",
          type: "instant",
          numResults: 1,
        }),
      }),
    );
  });

  it("surfaces an Exa API failure instead of reporting a false success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("Invalid API key", { status: 401 })),
    );

    await expect(testExaConnection("invalid-key")).rejects.toThrow(
      /Exa connection failed \(401\): Invalid API key/,
    );
  });
});
