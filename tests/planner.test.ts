import { describe, expect, it } from "vitest";
import { buildStudyPlan, scoreAssignment } from "../lib/planner";
import type { Assignment } from "../lib/types";

const now = new Date(2026, 10, 21, 12);

function assignment(overrides: Partial<Assignment> = {}): Assignment {
  return {
    id: "a-1",
    title: "Research paper",
    course: "CSE 401",
    dueDate: "2026-11-23",
    estimatedMinutes: 240,
    completedMinutes: 0,
    priority: "High",
    status: "Not started",
    ...overrides,
  };
}

describe("scoreAssignment", () => {
  it("scores completed assignments at zero", () => {
    const result = scoreAssignment(
      assignment({ status: "Done", completedMinutes: 240 }),
      now,
    );

    expect(result.riskScore).toBe(0);
    expect(result.riskLevel).toBe("complete");
    expect(result.remainingMinutes).toBe(0);
  });

  it("raises risk as a deadline gets closer", () => {
    const tomorrow = scoreAssignment(assignment({ dueDate: "2026-11-22" }), now);
    const nextWeek = scoreAssignment(assignment({ dueDate: "2026-11-28" }), now);

    expect(tomorrow.riskScore).toBeGreaterThan(nextWeek.riskScore);
    expect(tomorrow.reasons).toContain("Due tomorrow");
  });

  it("keeps every score in the documented 0–100 range", () => {
    const overloaded = scoreAssignment(
      assignment({ dueDate: "2026-11-19", estimatedMinutes: 4_000 }),
      now,
    );

    expect(overloaded.riskScore).toBe(100);
  });
});

describe("buildStudyPlan", () => {
  it("never exceeds daily capacity", () => {
    const plan = buildStudyPlan(
      [assignment({ estimatedMinutes: 1_000 })],
      { now, days: 5, dailyCapacityMinutes: 180 },
    );

    for (const day of plan.days) {
      expect(day.plannedMinutes).toBeLessThanOrEqual(day.capacityMinutes);
    }
  });

  it("limits one assignment to two hours per day", () => {
    const plan = buildStudyPlan(
      [assignment({ estimatedMinutes: 600, dueDate: "2026-11-27" })],
      { now, days: 7, dailyCapacityMinutes: 300 },
    );

    for (const day of plan.days) {
      const minutesForAssignment = day.sessions
        .filter((session) => session.assignmentId === "a-1")
        .reduce((sum, session) => sum + session.durationMinutes, 0);
      expect(minutesForAssignment).toBeLessThanOrEqual(120);
    }
  });

  it("does not place work after its deadline", () => {
    const plan = buildStudyPlan(
      [assignment({ estimatedMinutes: 600, dueDate: "2026-11-22" })],
      { now, days: 7, dailyCapacityMinutes: 180 },
    );

    const sessions = plan.days.flatMap((day) => day.sessions);
    expect(sessions.every((session) => session.date <= "2026-11-22")).toBe(true);
    expect(plan.unscheduledMinutes["a-1"]).toBeGreaterThan(0);
  });

  it("adds one hour of weekend capacity", () => {
    const plan = buildStudyPlan([], {
      now,
      days: 2,
      dailyCapacityMinutes: 180,
    });

    expect(plan.days[0].capacityMinutes).toBe(240); // Saturday
    expect(plan.days[1].capacityMinutes).toBe(240); // Sunday
  });
});
