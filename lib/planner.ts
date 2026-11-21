import type {
  Assignment,
  AssignmentRisk,
  PlanDay,
  RiskBreakdown,
  RiskLevel,
  StudyPlan,
  StudySession,
} from "./types";

const DAY_MS = 86_400_000;
const MIN_SESSION = 15;
const MAX_SESSION = 60;
const MAX_ASSIGNMENT_PER_DAY = 120;

function localDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(value: string): Date {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date: Date, amount: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

export function calendarDaysBetween(from: Date, toDate: string): number {
  const start = localDay(from);
  const end = parseDateKey(toDate);
  const utcStart = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const utcEnd = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((utcEnd - utcStart) / DAY_MS);
}

function riskLevel(score: number, isDone: boolean): RiskLevel {
  if (isDone) return "complete";
  if (score >= 70) return "critical";
  if (score >= 45) return "at-risk";
  return "steady";
}

export function scoreAssignment(
  assignment: Assignment,
  now = new Date(),
): AssignmentRisk {
  const remainingMinutes = Math.max(
    0,
    assignment.estimatedMinutes - assignment.completedMinutes,
  );
  const done = assignment.status === "Done" || remainingMinutes === 0;
  const daysLeft = calendarDaysBetween(now, assignment.dueDate);

  if (done) {
    return {
      ...assignment,
      riskScore: 0,
      riskLevel: "complete",
      remainingMinutes: 0,
      reasons: ["Completed"],
      breakdown: { urgency: 0, workload: 0, importance: 0, inertia: 0 },
    };
  }

  const urgency = daysLeft < 0 ? 48 : Math.max(4, 44 - daysLeft * 6);
  const availableDays = Math.max(1, daysLeft + 1);
  const hoursPerDay = remainingMinutes / 60 / availableDays;
  const workload = Math.min(26, Math.round(hoursPerDay * 8));
  const importance = { High: 22, Medium: 13, Low: 6 }[assignment.priority];
  const inertia =
    assignment.status === "Not started" ? (daysLeft <= 3 ? 8 : 4) : 1;

  const breakdown: RiskBreakdown = { urgency, workload, importance, inertia };
  const riskScore = Math.min(
    100,
    urgency + workload + importance + inertia,
  );

  const reasons: string[] = [];
  if (daysLeft < 0) reasons.push(`${Math.abs(daysLeft)}d overdue`);
  else if (daysLeft === 0) reasons.push("Due today");
  else if (daysLeft === 1) reasons.push("Due tomorrow");
  else reasons.push(`${daysLeft} days left`);
  reasons.push(`${formatDuration(remainingMinutes)} remaining`);
  if (assignment.priority === "High") reasons.push("High priority");
  if (assignment.status === "Not started" && daysLeft <= 3) {
    reasons.push("Not started");
  }

  return {
    ...assignment,
    riskScore,
    riskLevel: riskLevel(riskScore, false),
    remainingMinutes,
    reasons,
    breakdown,
  };
}

function minutesToTime(totalMinutes: number): string {
  const hour = Math.floor(totalMinutes / 60) % 24;
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

interface PlanOptions {
  now?: Date;
  days?: number;
  dailyCapacityMinutes?: number;
}

export function buildStudyPlan(
  assignments: Assignment[],
  options: PlanOptions = {},
): StudyPlan {
  const now = options.now ?? new Date();
  const days = Math.max(1, Math.min(options.days ?? 7, 14));
  const baseCapacity = Math.max(
    60,
    Math.min(options.dailyCapacityMinutes ?? 180, 480),
  );
  const risks = assignments
    .map((assignment) => scoreAssignment(assignment, now))
    .sort((a, b) => b.riskScore - a.riskScore || a.dueDate.localeCompare(b.dueDate));

  const remaining = new Map(
    risks
      .filter((item) => item.remainingMinutes > 0)
      .map((item) => [item.id, item.remainingMinutes]),
  );
  const planDays: PlanDay[] = [];

  for (let dayIndex = 0; dayIndex < days; dayIndex += 1) {
    const date = addDays(localDay(now), dayIndex);
    const key = dateKey(date);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const capacityMinutes = Math.min(480, baseCapacity + (isWeekend ? 60 : 0));
    const sessions: StudySession[] = [];
    const allocatedToday = new Map<string, number>();
    let freeMinutes = capacityMinutes;
    let madeProgress = true;

    while (freeMinutes >= MIN_SESSION && madeProgress) {
      madeProgress = false;
      const candidates = risks
        .filter((item) => {
          const minutesLeft = remaining.get(item.id) ?? 0;
          const allocated = allocatedToday.get(item.id) ?? 0;
          const dueIn = calendarDaysBetween(date, item.dueDate);
          const canUseToday = dueIn >= 0 || dayIndex === 0;
          return (
            minutesLeft > 0 &&
            allocated < MAX_ASSIGNMENT_PER_DAY &&
            canUseToday
          );
        })
        .sort((a, b) => {
          const dueDifference = a.dueDate.localeCompare(b.dueDate);
          if (dueDifference !== 0) return dueDifference;
          return b.riskScore - a.riskScore;
        });

      for (const item of candidates) {
        if (freeMinutes < MIN_SESSION) break;
        const minutesLeft = remaining.get(item.id) ?? 0;
        const alreadyAllocated = allocatedToday.get(item.id) ?? 0;
        const assignmentRoom = MAX_ASSIGNMENT_PER_DAY - alreadyAllocated;
        let durationMinutes = Math.min(
          MAX_SESSION,
          minutesLeft,
          assignmentRoom,
          freeMinutes,
        );
        const remainder = minutesLeft - durationMinutes;
        const adjustment = MIN_SESSION - remainder;
        if (
          remainder > 0 &&
          remainder < MIN_SESSION &&
          durationMinutes - adjustment >= MIN_SESSION
        ) {
          durationMinutes -= adjustment;
        }
        if (durationMinutes < MIN_SESSION) continue;

        const startBase = isWeekend ? 10 * 60 : 17 * 60 + 30;
        const breakMinutes = sessions.length * 15;
        const elapsedStudy = sessions.reduce(
          (total, session) => total + session.durationMinutes,
          0,
        );
        sessions.push({
          id: `${key}-${item.id}-${sessions.length + 1}`,
          assignmentId: item.id,
          title: item.title,
          course: item.course,
          date: key,
          startTime: minutesToTime(startBase + breakMinutes + elapsedStudy),
          durationMinutes,
          riskScore: item.riskScore,
          sourceUrl: item.url,
        });
        remaining.set(item.id, minutesLeft - durationMinutes);
        allocatedToday.set(item.id, alreadyAllocated + durationMinutes);
        freeMinutes -= durationMinutes;
        madeProgress = true;
      }
    }

    const plannedMinutes = sessions.reduce(
      (total, session) => total + session.durationMinutes,
      0,
    );
    planDays.push({ date: key, capacityMinutes, plannedMinutes, sessions });
  }

  const unscheduledMinutes = Object.fromEntries(
    [...remaining.entries()].filter(([, minutes]) => minutes > 0),
  );

  return {
    days: planDays,
    risks,
    unscheduledMinutes,
    totalPlannedMinutes: planDays.reduce(
      (total, day) => total + day.plannedMinutes,
      0,
    ),
  };
}
