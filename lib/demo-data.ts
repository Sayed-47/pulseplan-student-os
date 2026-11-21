import type { Assignment } from "./types";

function isoDay(offset: number, from = new Date()): string {
  const day = new Date(from);
  day.setHours(12, 0, 0, 0);
  day.setDate(day.getDate() + offset);
  return day.toISOString().slice(0, 10);
}

export function createDemoAssignments(now = new Date()): Assignment[] {
  return [
    {
      id: "demo-algorithms",
      title: "Dynamic programming problem set",
      course: "CSE 221",
      dueDate: isoDay(1, now),
      estimatedMinutes: 300,
      completedMinutes: 75,
      priority: "High",
      status: "In progress",
      url: "https://www.notion.so/templates/student-os-all-in-one-academic-record",
    },
    {
      id: "demo-economics",
      title: "Behavioral economics essay",
      course: "ECO 204",
      dueDate: isoDay(3, now),
      estimatedMinutes: 240,
      completedMinutes: 30,
      priority: "High",
      status: "In progress",
    },
    {
      id: "demo-physics",
      title: "Electric fields lab report",
      course: "PHY 112",
      dueDate: isoDay(0, now),
      estimatedMinutes: 150,
      completedMinutes: 90,
      priority: "High",
      status: "In progress",
    },
    {
      id: "demo-reading",
      title: "Read chapters 7–8",
      course: "ECO 204",
      dueDate: isoDay(2, now),
      estimatedMinutes: 120,
      completedMinutes: 0,
      priority: "Medium",
      status: "Not started",
    },
    {
      id: "demo-presentation",
      title: "Design club pitch deck",
      course: "Campus Club",
      dueDate: isoDay(5, now),
      estimatedMinutes: 210,
      completedMinutes: 45,
      priority: "Medium",
      status: "In progress",
    },
    {
      id: "demo-calculus",
      title: "Calculus practice quiz",
      course: "MAT 120",
      dueDate: isoDay(6, now),
      estimatedMinutes: 100,
      completedMinutes: 0,
      priority: "Medium",
      status: "Not started",
    },
    {
      id: "demo-career",
      title: "Update internship portfolio",
      course: "Career",
      dueDate: isoDay(9, now),
      estimatedMinutes: 180,
      completedMinutes: 0,
      priority: "Low",
      status: "Not started",
    },
    {
      id: "demo-history",
      title: "Primary source reflection",
      course: "HIS 105",
      dueDate: isoDay(-1, now),
      estimatedMinutes: 90,
      completedMinutes: 90,
      priority: "Medium",
      status: "Done",
    },
  ];
}
