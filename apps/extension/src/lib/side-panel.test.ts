import { describe, expect, it } from "vitest";
import { SIDE_PANEL_PORT, SIDE_PANEL_TOGGLE_COMMAND } from "./side-panel";

describe("side panel toggle constants", () => {
  it("uses a stable command id for the manifest shortcut", () => {
    expect(SIDE_PANEL_TOGGLE_COMMAND).toBe("toggle-side-panel");
  });

  it("uses a stable port name for open-state tracking", () => {
    expect(SIDE_PANEL_PORT).toBe("fieldcraft-sidepanel");
  });
});
