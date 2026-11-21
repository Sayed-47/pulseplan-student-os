import { describe, expect, it } from "vitest";
import { createDemoAssignments } from "../lib/demo-data";
import {
  buildAssignmentDigest,
  buildCoachRequest,
  createFallbackReply,
  validateCoachInput,
} from "../lib/study-coach";

const now = new Date(2026, 10, 21, 12);

describe("study coach security boundary", () => {
  it("rejects unsupported actions and oversized prompts", () => {
    expect(validateCoachInput({ action: "delete-everything", prompt: "go" }).ok).toBe(false);
    expect(validateCoachInput({ action: "ask", prompt: "x".repeat(401) }).ok).toBe(false);
  });

  it("requires a question for free-form requests", () => {
    expect(validateCoachInput({ action: "ask", prompt: "  " }).ok).toBe(false);
    expect(validateCoachInput({ action: "daily-plan", prompt: "" }).ok).toBe(true);
  });

  it("removes page URLs and limits assignment context", () => {
    const assignments = Array.from({ length: 25 }, (_, index) =>
      createDemoAssignments(now)[0] && ({
        ...createDemoAssignments(now)[0],
        id: `assignment-${index}`,
        title: `Task ${index}`,
        url: `https://private.example/${index}`,
      }),
    );
    const digest = buildAssignmentDigest(assignments, now);
    expect(digest).toHaveLength(20);
    expect(JSON.stringify(digest)).not.toContain("private.example");
  });

  it("builds a constrained JSON request and deterministic fallback", () => {
    const assignments = createDemoAssignments(now);
    const request = buildCoachRequest({ action: "priorities", prompt: "What first?" }, assignments, now);
    const parsed = JSON.parse(request);
    expect(parsed.studentRequest.action).toBe("priorities");
    expect(parsed.assignments[0]).not.toHaveProperty("url");

    const reply = createFallbackReply("get-started", assignments, now);
    expect(reply).toContain("First step:");
    expect(reply.length).toBeGreaterThan(80);
  });
});
