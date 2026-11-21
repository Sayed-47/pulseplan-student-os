import { describe, expect, it } from "vitest";
import { normalizeStatusName } from "../lib/notion";

describe("normalizeStatusName", () => {
  it("does not confuse Not started with In progress", () => {
    expect(normalizeStatusName("Not started")).toBe("Not started");
    expect(normalizeStatusName("In progress")).toBe("In progress");
  });

  it("understands common Student OS status labels", () => {
    expect(normalizeStatusName("Submitted")).toBe("Done");
    expect(normalizeStatusName("Backlog")).toBe("Not started");
    expect(normalizeStatusName("Under review")).toBe("In progress");
  });
});
