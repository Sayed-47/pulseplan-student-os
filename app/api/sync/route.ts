import { NextResponse } from "next/server";
import { hasNotionWriteConfig, syncSessionsToNotion } from "@/lib/notion";
import type { StudySession } from "@/lib/types";

function isSession(value: unknown): value is StudySession {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<StudySession>;
  return (
    typeof item.id === "string" &&
    typeof item.assignmentId === "string" &&
    typeof item.title === "string" &&
    typeof item.course === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(item.date ?? "") &&
    /^\d{2}:\d{2}$/.test(item.startTime ?? "") &&
    typeof item.durationMinutes === "number" &&
    item.durationMinutes >= 15 &&
    item.durationMinutes <= 480
  );
}

export async function POST(request: Request) {
  if (!hasNotionWriteConfig()) {
    return NextResponse.json(
      { error: "Notion write-back is not configured. Add NOTION_SESSIONS_DATA_SOURCE_ID." },
      { status: 409 },
    );
  }

  try {
    const body = (await request.json()) as { sessions?: unknown };
    if (!Array.isArray(body.sessions) || body.sessions.length === 0) {
      return NextResponse.json({ error: "At least one session is required." }, { status: 400 });
    }
    if (body.sessions.length > 100 || !body.sessions.every(isSession)) {
      return NextResponse.json({ error: "The study plan contains invalid sessions." }, { status: 400 });
    }
    const result = await syncSessionsToNotion(body.sessions);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not sync the study plan";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
