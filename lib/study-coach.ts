import { scoreAssignment } from "./planner";
import type { Assignment } from "./types";

export const MAX_COACH_PROMPT_LENGTH = 400;
export const COACH_ACTIONS = ["daily-plan", "priorities", "get-started", "ask"] as const;
export type CoachAction = (typeof COACH_ACTIONS)[number];

export interface CoachInput {
  action: CoachAction;
  prompt: string;
}

export type CoachValidation =
  | { ok: true; value: CoachInput }
  | { ok: false; error: string };

export function validateCoachInput(input: unknown): CoachValidation {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "A request body is required." };
  }
  const candidate = input as { action?: unknown; prompt?: unknown };
  const action = typeof candidate.action === "string" ? candidate.action : "ask";
  if (!COACH_ACTIONS.includes(action as CoachAction)) {
    return { ok: false, error: "Unsupported coach action." };
  }
  if (candidate.prompt != null && typeof candidate.prompt !== "string") {
    return { ok: false, error: "The prompt must be text." };
  }
  const prompt = (candidate.prompt ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
  if (prompt.length > MAX_COACH_PROMPT_LENGTH) {
    return { ok: false, error: `The prompt must be ${MAX_COACH_PROMPT_LENGTH} characters or fewer.` };
  }
  if (action === "ask" && !prompt) {
    return { ok: false, error: "Ask the study coach a question." };
  }
  return { ok: true, value: { action: action as CoachAction, prompt } };
}

export function buildAssignmentDigest(assignments: Assignment[], now = new Date()) {
  return assignments
    .map((assignment) => scoreAssignment(assignment, now))
    .filter((assignment) => assignment.riskLevel !== "complete")
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 20)
    .map((assignment) => ({
      title: assignment.title.slice(0, 160),
      course: assignment.course.slice(0, 100),
      dueDate: assignment.dueDate,
      priority: assignment.priority,
      status: assignment.status,
      remainingMinutes: assignment.remainingMinutes,
      riskScore: assignment.riskScore,
    }));
}

export function createFallbackReply(
  action: CoachAction,
  assignments: Assignment[],
  now = new Date(),
): string {
  const items = buildAssignmentDigest(assignments, now);
  if (!items.length) {
    return "You have no unfinished assignments. Use the open time for review, rest, or preparing the next course topic.";
  }
  const first = items[0];
  const second = items[1];
  const firstBlock = Math.min(60, Math.max(25, first.remainingMinutes));
  const lines = [
    `Start with ${first.title} for ${firstBlock} minutes. It has the highest current risk score (${first.riskScore}) and is due ${first.dueDate}.`,
  ];
  if (second) {
    lines.push(`After a 15-minute break, spend ${Math.min(45, Math.max(25, second.remainingMinutes))} minutes on ${second.title}.`);
  }
  if (action === "get-started") {
    lines.push("First step: open the assignment, write a three-item checklist, and complete only item one before reassessing.");
  } else if (action === "priorities") {
    lines.push(`Protect the nearest deadline first. ${first.course} currently needs the most attention.`);
  } else {
    lines.push("Keep the first block small and specific. Rebuild the schedule after you record progress in Notion.");
  }
  return lines.join("\n\n");
}

export function buildCoachRequest(
  input: CoachInput,
  assignments: Assignment[],
  now = new Date(),
): string {
  return JSON.stringify({
    studentRequest: { action: input.action, question: input.prompt },
    currentDate: now.toISOString().slice(0, 10),
    assignments: buildAssignmentDigest(assignments, now),
  });
}
