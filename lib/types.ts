export type AssignmentStatus = "Not started" | "In progress" | "Done";
export type Priority = "High" | "Medium" | "Low";
export type RiskLevel = "critical" | "at-risk" | "steady" | "complete";

export interface Assignment {
  id: string;
  title: string;
  course: string;
  dueDate: string;
  estimatedMinutes: number;
  completedMinutes: number;
  priority: Priority;
  status: AssignmentStatus;
  url?: string;
}

export interface RiskBreakdown {
  urgency: number;
  workload: number;
  importance: number;
  inertia: number;
}

export interface AssignmentRisk extends Assignment {
  riskScore: number;
  riskLevel: RiskLevel;
  remainingMinutes: number;
  reasons: string[];
  breakdown: RiskBreakdown;
}

export interface StudySession {
  id: string;
  assignmentId: string;
  title: string;
  course: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  riskScore: number;
  sourceUrl?: string;
}

export interface PlanDay {
  date: string;
  capacityMinutes: number;
  plannedMinutes: number;
  sessions: StudySession[];
}

export interface StudyPlan {
  days: PlanDay[];
  risks: AssignmentRisk[];
  unscheduledMinutes: Record<string, number>;
  totalPlannedMinutes: number;
}

export interface ConnectionMeta {
  mode: "demo" | "notion";
  connected: boolean;
  writeEnabled: boolean;
  assignmentCount: number;
  lastSyncedAt: string;
}

export interface AssignmentsResponse {
  assignments: Assignment[];
  meta: ConnectionMeta;
  notice?: string;
}
