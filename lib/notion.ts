import type { Assignment, Priority, StudySession } from "./types";

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2026-03-11";

type JsonRecord = Record<string, unknown>;

interface RichTextItem {
  plain_text?: string;
  text?: { content?: string };
}

interface RawProperty extends JsonRecord {
  type?: string;
  title?: RichTextItem[];
  rich_text?: RichTextItem[];
  select?: { name?: string } | null;
  multi_select?: { name?: string }[];
  status?: { name?: string } | null;
  date?: { start?: string } | null;
  number?: number | null;
  checkbox?: boolean;
  url?: string | null;
  relation?: { id?: string }[];
  formula?: {
    type?: string;
    string?: string | null;
    number?: number | null;
    boolean?: boolean | null;
    date?: { start?: string } | null;
  };
}

interface PropertySchema extends JsonRecord {
  id?: string;
  name?: string;
  type?: string;
  status?: { options?: { name?: string }[] };
  select?: { options?: { name?: string }[] };
}

interface DataSourceResponse extends JsonRecord {
  properties?: Record<string, PropertySchema>;
}

interface PageResponse extends JsonRecord {
  object?: string;
  id?: string;
  url?: string;
  archived?: boolean;
  in_trash?: boolean;
  properties?: Record<string, RawProperty>;
}

interface QueryResponse extends JsonRecord {
  results?: PageResponse[];
  has_more?: boolean;
  next_cursor?: string | null;
}

function token(): string | undefined {
  return process.env.NOTION_API_KEY?.trim() || undefined;
}

export function hasNotionReadConfig(): boolean {
  return Boolean(token() && process.env.NOTION_ASSIGNMENTS_DATA_SOURCE_ID?.trim());
}

export function hasNotionWriteConfig(): boolean {
  return Boolean(token() && process.env.NOTION_SESSIONS_DATA_SOURCE_ID?.trim());
}

async function notionRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const apiKey = token();
  if (!apiKey) throw new Error("NOTION_API_KEY is not configured");

  const response = await fetch(`${NOTION_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as JsonRecord;
  if (!response.ok) {
    const detail = typeof payload.message === "string" ? payload.message : response.statusText;
    throw new Error(`Notion API ${response.status}: ${detail}`);
  }
  return payload as T;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function resolveSchemaName(
  properties: Record<string, PropertySchema>,
  configured: string | undefined,
  candidates: string[],
  acceptedTypes?: string[],
): string | undefined {
  if (configured && properties[configured]) return configured;
  const entries = Object.entries(properties);
  const names = [configured, ...candidates].filter(Boolean) as string[];
  for (const wanted of names) {
    const match = entries.find(([name]) => normalize(name) === normalize(wanted));
    if (match) return match[0];
  }
  if (acceptedTypes) {
    return entries.find(([, schema]) =>
      acceptedTypes.includes(schema.type ?? ""),
    )?.[0];
  }
  return undefined;
}

function richText(items: RichTextItem[] | undefined): string {
  return (items ?? [])
    .map((item) => item.plain_text ?? item.text?.content ?? "")
    .join("")
    .trim();
}

function readText(property: RawProperty | undefined): string {
  if (!property) return "";
  switch (property.type) {
    case "title":
      return richText(property.title);
    case "rich_text":
      return richText(property.rich_text);
    case "select":
      return property.select?.name ?? "";
    case "multi_select":
      return (property.multi_select ?? []).map((item) => item.name ?? "").filter(Boolean).join(", ");
    case "status":
      return property.status?.name ?? "";
    case "url":
      return property.url ?? "";
    case "number":
      return property.number == null ? "" : String(property.number);
    case "formula":
      return property.formula?.string ??
        (property.formula?.number == null ? "" : String(property.formula.number));
    case "relation":
      return property.relation?.length ? "Linked course" : "";
    default:
      return "";
  }
}

function readPageTitle(page: PageResponse): string {
  const titleProperty = Object.values(page.properties ?? {}).find(
    (property) => property.type === "title",
  );
  return readText(titleProperty);
}

function relationIds(property: RawProperty | undefined): string[] {
  if (property?.type !== "relation") return [];
  return (property.relation ?? [])
    .map((relation) => relation.id)
    .filter((id): id is string => Boolean(id));
}

function readNumber(property: RawProperty | undefined): number | undefined {
  if (!property) return undefined;
  if (property.type === "number" && typeof property.number === "number") {
    return property.number;
  }
  if (property.type === "formula" && typeof property.formula?.number === "number") {
    return property.formula.number;
  }
  const parsed = Number(readText(property));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readDate(property: RawProperty | undefined): string | undefined {
  const value = property?.type === "formula"
    ? property.formula?.date?.start
    : property?.date?.start;
  return value?.slice(0, 10);
}

export function normalizeStatusName(value: string): Assignment["status"] {
  const status = value.toLowerCase();
  if (["done", "complete", "completed", "submitted", "finished"].some((word) => status.includes(word))) {
    return "Done";
  }
  if (["not started", "not begun", "to do", "todo", "backlog"].some((word) => status.includes(word))) {
    return "Not started";
  }
  if (["progress", "doing", "started", "review"].some((word) => status.includes(word))) {
    return "In progress";
  }
  return "Not started";
}

function toStatus(property: RawProperty | undefined): Assignment["status"] {
  if (property?.type === "checkbox") {
    return property.checkbox ? "Done" : "Not started";
  }
  return normalizeStatusName(readText(property));
}

function toPriority(property: RawProperty | undefined): Priority {
  const priority = readText(property).toLowerCase();
  if (["high", "urgent", "critical", "p1"].some((word) => priority.includes(word))) return "High";
  if (["low", "later", "p3"].some((word) => priority.includes(word))) return "Low";
  return "Medium";
}

async function queryAllPages(dataSourceId: string): Promise<PageResponse[]> {
  const pages: PageResponse[] = [];
  let cursor: string | undefined;

  do {
    const result = await notionRequest<QueryResponse>(
      `/data_sources/${encodeURIComponent(dataSourceId)}/query`,
      {
        method: "POST",
        body: JSON.stringify({
          result_type: "page",
          page_size: 100,
          ...(cursor ? { start_cursor: cursor } : {}),
        }),
      },
    );
    pages.push(...(result.results ?? []).filter((item) => item.object === "page"));
    cursor = result.has_more && result.next_cursor ? result.next_cursor : undefined;
  } while (cursor && pages.length < 500);

  return pages;
}

export async function fetchNotionAssignments(): Promise<Assignment[]> {
  const dataSourceId = process.env.NOTION_ASSIGNMENTS_DATA_SOURCE_ID?.trim();
  if (!dataSourceId) throw new Error("NOTION_ASSIGNMENTS_DATA_SOURCE_ID is not configured");

  const source = await notionRequest<DataSourceResponse>(
    `/data_sources/${encodeURIComponent(dataSourceId)}`,
  );
  const schema = source.properties ?? {};
  const names = {
    title: resolveSchemaName(schema, process.env.NOTION_PROP_TITLE, ["Name", "Assignment", "Task", "Title"], ["title"]),
    due: resolveSchemaName(schema, process.env.NOTION_PROP_DUE, ["Due", "Due date", "Deadline", "Date"], ["date"]),
    status: resolveSchemaName(schema, process.env.NOTION_PROP_STATUS, ["Status", "Progress state", "Completed"], ["status", "checkbox"]),
    course: resolveSchemaName(schema, process.env.NOTION_PROP_COURSE, ["Course", "Class", "Module", "Subject"]),
    effort: resolveSchemaName(schema, process.env.NOTION_PROP_EFFORT, ["Estimated hours", "Estimate", "Effort", "Hours"]),
    priority: resolveSchemaName(schema, process.env.NOTION_PROP_PRIORITY, ["Priority", "Importance"]),
    progress: resolveSchemaName(schema, process.env.NOTION_PROP_PROGRESS, ["Progress", "Percent complete", "Completion"]),
  };

  if (!names.title || !names.due) {
    throw new Error("Could not identify title and due-date properties. Set NOTION_PROP_TITLE and NOTION_PROP_DUE.");
  }

  const pages = await queryAllPages(dataSourceId);
  const relatedTitles = new Map<string, string>();
  if (names.course && schema[names.course]?.type === "relation") {
    const relatedIds = new Set(
      pages.flatMap((page) =>
        relationIds(page.properties?.[names.course!]),
      ),
    );
    for (const relatedId of relatedIds) {
      const relatedPage = await notionRequest<PageResponse>(
        `/pages/${encodeURIComponent(relatedId)}`,
      );
      const relatedTitle = readPageTitle(relatedPage);
      if (relatedTitle) relatedTitles.set(relatedId, relatedTitle);
    }
  }

  return pages.flatMap((page): Assignment[] => {
    if (page.archived || page.in_trash || !page.id || !page.properties) return [];
    const properties = page.properties;
    const dueDate = readDate(properties[names.due!]);
    const title = readText(properties[names.title!]);
    if (!dueDate || !title) return [];

    const status = toStatus(names.status ? properties[names.status] : undefined);
    const priority = toPriority(names.priority ? properties[names.priority] : undefined);
    const effortHours = names.effort ? readNumber(properties[names.effort]) : undefined;
    const estimatedMinutes = Math.max(30, Math.round((effortHours ?? (priority === "High" ? 3 : 2)) * 60));
    const progressRaw = names.progress ? readNumber(properties[names.progress]) : undefined;
    const progressRatio = status === "Done"
      ? 1
      : progressRaw == null
        ? status === "In progress" ? 0.25 : 0
        : Math.max(0, Math.min(1, progressRaw > 1 ? progressRaw / 100 : progressRaw));
    const courseProperty = names.course ? properties[names.course] : undefined;
    const relatedCourseNames = relationIds(courseProperty)
      .map((id) => relatedTitles.get(id))
      .filter((value): value is string => Boolean(value));

    return [{
      id: page.id,
      title,
      course: relatedCourseNames.join(", ") || readText(courseProperty) || "General",
      dueDate,
      estimatedMinutes,
      completedMinutes: Math.round(estimatedMinutes * progressRatio),
      priority,
      status,
      url: page.url,
    }];
  });
}

function textValue(schema: PropertySchema, value: string): JsonRecord | undefined {
  const text = [{ type: "text", text: { content: value.slice(0, 2000) } }];
  if (schema.type === "title") return { title: text };
  if (schema.type === "rich_text") return { rich_text: text };
  if (schema.type === "select") return { select: { name: value.slice(0, 100) } };
  if (schema.type === "multi_select") return { multi_select: [{ name: value.slice(0, 100) }] };
  if (schema.type === "url") return { url: value };
  return undefined;
}

function statusValue(schema: PropertySchema): JsonRecord | undefined {
  if (schema.type === "checkbox") return { checkbox: false };
  const options = schema.type === "status" ? schema.status?.options : schema.select?.options;
  const preferred = ["Planned", "Not started", "To do", "Upcoming"];
  const available = (options ?? []).map((option) => option.name).filter(Boolean) as string[];
  const selected = preferred.find((name) =>
    available.some((option) => normalize(option) === normalize(name)),
  );
  if (!selected) return undefined;
  const actual = available.find((option) => normalize(option) === normalize(selected))!;
  return schema.type === "status" ? { status: { name: actual } } : { select: { name: actual } };
}

export async function syncSessionsToNotion(
  sessions: StudySession[],
): Promise<{ created: number }> {
  const dataSourceId = process.env.NOTION_SESSIONS_DATA_SOURCE_ID?.trim();
  if (!dataSourceId) throw new Error("NOTION_SESSIONS_DATA_SOURCE_ID is not configured");

  const source = await notionRequest<DataSourceResponse>(
    `/data_sources/${encodeURIComponent(dataSourceId)}`,
  );
  const schema = source.properties ?? {};
  const names = {
    title: resolveSchemaName(schema, process.env.NOTION_SESSION_TITLE, ["Name", "Session", "Task"], ["title"]),
    date: resolveSchemaName(schema, process.env.NOTION_SESSION_DATE, ["Date", "When", "Start"], ["date"]),
    course: resolveSchemaName(schema, process.env.NOTION_SESSION_COURSE, ["Course", "Class", "Module"]),
    duration: resolveSchemaName(schema, process.env.NOTION_SESSION_DURATION, ["Duration", "Minutes", "Length"]),
    status: resolveSchemaName(schema, process.env.NOTION_SESSION_STATUS, ["Status", "State"]),
    sourceUrl: resolveSchemaName(schema, process.env.NOTION_SESSION_SOURCE_URL, ["Source", "Assignment URL", "Notion page"]),
  };
  if (!names.title || !names.date) {
    throw new Error("Study Sessions needs title and date properties. Check NOTION_SESSION_TITLE and NOTION_SESSION_DATE.");
  }

  let created = 0;
  for (const session of sessions.slice(0, 100)) {
    const properties: Record<string, JsonRecord> = {};
    const title = textValue(schema[names.title], `Study: ${session.title}`);
    if (title) properties[names.title] = title;
    properties[names.date] = {
      date: { start: `${session.date}T${session.startTime}:00` },
    };
    if (names.course) {
      const course = textValue(schema[names.course], session.course);
      if (course) properties[names.course] = course;
    }
    if (names.duration && schema[names.duration]?.type === "number") {
      properties[names.duration] = { number: session.durationMinutes };
    }
    if (names.status) {
      const status = statusValue(schema[names.status]);
      if (status) properties[names.status] = status;
    }
    if (names.sourceUrl && session.sourceUrl) {
      const sourceValue = textValue(schema[names.sourceUrl], session.sourceUrl);
      if (sourceValue) properties[names.sourceUrl] = sourceValue;
    }

    await notionRequest<JsonRecord>("/pages", {
      method: "POST",
      body: JSON.stringify({
        parent: { type: "data_source_id", data_source_id: dataSourceId },
        properties,
        icon: { type: "emoji", emoji: "🧠" },
        notifications: { mode: "silent" },
      }),
    });
    created += 1;
  }
  return { created };
}
