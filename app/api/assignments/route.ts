import { NextResponse } from "next/server";
import { createDemoAssignments } from "@/lib/demo-data";
import {
  fetchNotionAssignments,
  hasNotionReadConfig,
  hasNotionWriteConfig,
} from "@/lib/notion";
import type { AssignmentsResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const now = new Date();

  if (hasNotionReadConfig()) {
    try {
      const assignments = await fetchNotionAssignments();
      const response: AssignmentsResponse = {
        assignments,
        meta: {
          mode: "notion",
          connected: true,
          writeEnabled: hasNotionWriteConfig(),
          assignmentCount: assignments.length,
          lastSyncedAt: now.toISOString(),
        },
      };
      return NextResponse.json(response, {
        headers: { "Cache-Control": "no-store" },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Notion error";
      const assignments = createDemoAssignments(now);
      const response: AssignmentsResponse = {
        assignments,
        meta: {
          mode: "demo",
          connected: false,
          writeEnabled: false,
          assignmentCount: assignments.length,
          lastSyncedAt: now.toISOString(),
        },
        notice: `Notion connection failed, so demo data is shown. ${message}`,
      };
      return NextResponse.json(response, {
        headers: { "Cache-Control": "no-store" },
      });
    }
  }

  const assignments = createDemoAssignments(now);
  const response: AssignmentsResponse = {
    assignments,
    meta: {
      mode: "demo",
      connected: false,
      writeEnabled: false,
      assignmentCount: assignments.length,
      lastSyncedAt: now.toISOString(),
    },
    notice: "Demo workspace active. Add Notion environment variables to use your Student OS data.",
  };
  return NextResponse.json(response, {
    headers: { "Cache-Control": "no-store" },
  });
}
