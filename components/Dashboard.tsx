"use client";

import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Atom,
  BarChart3,
  Bell,
  Bot,
  BookMarked,
  BrainCircuit,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Cloud,
  Download,
  ExternalLink,
  FileText,
  Filter,
  Globe2,
  Home,
  Info,
  LoaderCircle,
  MapPin,
  MoreVertical,
  Newspaper,
  Play,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sigma,
  Sparkles,
  UsersRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildStudyPlan,
  calendarDaysBetween,
  dateKey,
  formatDuration,
} from "@/lib/planner";
import type {
  AssignmentsResponse,
  StudySession,
} from "@/lib/types";

type View = "timeline" | "assignments" | "courses" | "planner" | "coach" | "settings";
type CalendarMode = "Month View" | "Week View";
type EventTab = "Activities" | "Reminders";
type CoachAction = "daily-plan" | "priorities" | "get-started" | "ask";
type CoachMessage = { id: number; role: "assistant" | "user"; text: string; meta?: string };

const SUBJECT_ICONS = [Sigma, Globe2, BookMarked, Atom];
const COURSE_COLORS = ["#149ed5", "#ffb757", "#59cda4", "#9497f5", "#ed83d8", "#ff8c8f"];
const EVENT_THEMES = ["mint", "violet", "orange", "blue"];

const navItems: { id: View; label: string; icon: typeof Home }[] = [
  { id: "timeline", label: "Timeline", icon: Home },
  { id: "assignments", label: "Assignments", icon: Newspaper },
  { id: "courses", label: "Courses", icon: UsersRound },
  { id: "planner", label: "Study plan", icon: Play },
  { id: "coach", label: "Study bot", icon: Bot },
  { id: "settings", label: "Notion setup", icon: Settings },
];

function localDate(value: string): Date {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function addMonths(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(1);
  next.setMonth(next.getMonth() + amount);
  return next;
}

function startOfWeek(date: Date): Date {
  return addDays(date, -date.getDay());
}

function calendarDates(selected: Date, mode: CalendarMode): Date[] {
  if (mode === "Week View") {
    const start = startOfWeek(selected);
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }
  const monthStart = new Date(selected.getFullYear(), selected.getMonth(), 1, 12);
  const gridStart = startOfWeek(monthStart);
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
}

function formatDate(value: string | Date, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en", options).format(typeof value === "string" ? localDate(value) : value);
}

function dueLabel(value: string): string {
  const days = calendarDaysBetween(new Date(), value);
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days} days`;
}

function hash(value: string): number {
  return [...value].reduce((sum, character) => sum + character.charCodeAt(0), 0);
}

function courseColor(course: string): string {
  return COURSE_COLORS[hash(course) % COURSE_COLORS.length];
}

function courseCode(course: string): string {
  return course.split("·")[0]?.trim() || course;
}

function courseTitle(course: string): string {
  return course.split("·")[1]?.trim() || course;
}

function riskTone(score: number): string {
  if (score >= 70) return "critical";
  if (score >= 45) return "watch";
  return "steady";
}

function csvCell(value: string | number): string {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function exportSessions(sessions: StudySession[]) {
  const rows = [
    ["Date", "Start", "Duration", "Course", "Assignment"],
    ...sessions.map((session) => [session.date, session.startTime, session.durationMinutes, session.course, session.title]),
  ];
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "pulseplan-study-plan.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function Logo() {
  return <span className="pulse-logo" aria-label="PulsePlan"><Sparkles size={25} strokeWidth={2.4} /></span>;
}

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return <div className="empty-state"><CheckCircle2 size={24} /><strong>{title}</strong><p>{copy}</p></div>;
}

export function Dashboard() {
  const [data, setData] = useState<AssignmentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeView, setActiveView] = useState<View>("timeline");
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [courseFilter, setCourseFilter] = useState("All courses");
  const [calendarMode, setCalendarMode] = useState<CalendarMode>("Month View");
  const [eventTab, setEventTab] = useState<EventTab>("Activities");
  const [search, setSearch] = useState("");
  const [dailyHours, setDailyHours] = useState(3);
  const [completedSessions, setCompletedSessions] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [coachPrompt, setCoachPrompt] = useState("");
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachMessages, setCoachMessages] = useState<CoachMessage[]>([
    {
      id: 1,
      role: "assistant",
      text: "I’m Pulse, your assignment-aware study coach. I can turn the current workload into a focused plan or help you choose what to start next.",
      meta: "Local planner ready",
    },
  ]);

  const loadAssignments = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    try {
      const response = await fetch("/api/assignments", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load assignments");
      setData((await response.json()) as AssignmentsResponse);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Could not load PulsePlan");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/assignments", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Could not load assignments");
        return response.json() as Promise<AssignmentsResponse>;
      })
      .then((payload) => { if (!cancelled) setData(payload); })
      .catch((error: unknown) => { if (!cancelled) setToast(error instanceof Error ? error.message : "Could not load PulsePlan"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const assignments = useMemo(() => data?.assignments ?? [], [data?.assignments]);
  const plan = useMemo(() => buildStudyPlan(assignments, { dailyCapacityMinutes: dailyHours * 60 }), [assignments, dailyHours]);
  const risks = plan.risks;
  const openRisks = risks.filter((risk) => risk.riskLevel !== "complete");
  const allSessions = useMemo(() => plan.days.flatMap((day) => day.sessions), [plan.days]);
  const courses = useMemo(() => [...new Set(assignments.map((item) => item.course))], [assignments]);
  const selectedKey = dateKey(selectedDate);
  const visibleAssignments = openRisks.filter((item) => {
    const query = search.trim().toLowerCase();
    return (courseFilter === "All courses" || item.course === courseFilter) &&
      (!query || item.title.toLowerCase().includes(query) || item.course.toLowerCase().includes(query));
  });
  const selectedAssignments = visibleAssignments.filter((item) => item.dueDate === selectedKey);
  const selectedSessions = allSessions.filter((session) => session.date === selectedKey);
  const dates = calendarDates(selectedDate, calendarMode);
  const courseSummaries = courses.map((course) => {
    const items = openRisks.filter((item) => item.course === course);
    return { course, count: items.length, next: [...items].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] };
  });
  const eventItems = eventTab === "Activities"
    ? visibleAssignments.slice(0, 4)
    : visibleAssignments.filter((item) => calendarDaysBetween(new Date(), item.dueDate) <= 2 || item.riskScore >= 70).slice(0, 4);

  function changeDate(direction: number) {
    setSelectedDate((current) => calendarMode === "Month View" ? addMonths(current, direction) : addDays(current, direction * 7));
  }

  function selectCourse(course: string) {
    setCourseFilter(course);
    setActiveView("timeline");
  }

  function toggleSession(id: string) {
    setCompletedSessions((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function syncPlan() {
    if (!data?.meta.writeEnabled) {
      setActiveView("settings");
      setToast("Configure Notion write-back first.");
      return;
    }
    setSyncing(true);
    try {
      const sessions = allSessions.filter((session) => !completedSessions.has(session.id));
      const response = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessions }),
      });
      const result = (await response.json()) as { created?: number; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Notion sync failed");
      setToast(`${result.created ?? sessions.length} sessions added to Notion.`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Notion sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function askCoach(action: CoachAction, suggestedPrompt?: string) {
    if (coachLoading) return;
    const prompt = (suggestedPrompt ?? coachPrompt).trim();
    if (action === "ask" && !prompt) {
      setToast("Ask the study bot a question first.");
      return;
    }
    const labels: Record<CoachAction, string> = {
      "daily-plan": "Build my plan for today",
      priorities: "What should I prioritize?",
      "get-started": "Help me get started",
      ask: prompt,
    };
    const sentAt = Date.now();
    setCoachMessages((messages) => [...messages, { id: sentAt, role: "user", text: labels[action] }]);
    setCoachPrompt("");
    setCoachLoading(true);
    try {
      const coachResponse = await fetch("/api/study-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, prompt }),
      });
      const payload = (await coachResponse.json()) as {
        reply?: string;
        error?: string;
        mode?: "ai" | "planner";
        model?: string;
        notice?: string;
      };
      if (!coachResponse.ok || !payload.reply) {
        throw new Error(payload.error ?? "The study bot could not respond.");
      }
      setCoachMessages((messages) => [
        ...messages,
        {
          id: sentAt + 1,
          role: "assistant",
          text: payload.reply!,
          meta: payload.mode === "ai" ? `AI · ${payload.model}` : "Local risk engine · no API credits used",
        },
      ]);
      if (payload.notice) setToast(payload.notice);
    } catch (error) {
      setCoachMessages((messages) => [
        ...messages,
        {
          id: sentAt + 1,
          role: "assistant",
          text: error instanceof Error ? error.message : "The study bot is temporarily unavailable.",
          meta: "Request failed safely",
        },
      ]);
    } finally {
      setCoachLoading(false);
    }
  }

  if (loading && !data) {
    return <main className="loading-screen"><Logo /><LoaderCircle className="spin" size={28} /><p>Syncing your Student OS…</p></main>;
  }
  if (!data) {
    return <main className="fatal-state"><AlertCircle size={30} /><h1>PulsePlan could not start</h1><button onClick={() => void loadAssignments()}>Try again</button></main>;
  }

  return (
    <div className="timeline-shell">
      <aside className="icon-rail">
        <div className="logo-cell"><Logo /></div>
        <div className="profile-cell"><span>AS</span><strong>Abu Sayed</strong></div>
        <nav aria-label="Primary navigation">
          {navItems.filter((item) => item.id !== "settings").map((item) => {
            const Icon = item.icon;
            return <button key={item.id} className={activeView === item.id ? "active" : ""} onClick={() => setActiveView(item.id)} aria-label={item.label} title={item.label}><Icon size={23} /></button>;
          })}
          <button aria-label="Insights" title="Insights" onClick={() => setActiveView("assignments")}><BarChart3 size={22} /></button>
        </nav>
        <button className={`settings-link ${activeView === "settings" ? "active" : ""}`} onClick={() => setActiveView("settings")} aria-label="Notion setup" title="Notion setup"><Settings size={23} /></button>
      </aside>

      <section className="center-column">
        <header className="timeline-header">
          <h1>{navItems.find((item) => item.id === activeView)?.label}</h1>
          <div className="date-switcher"><button onClick={() => changeDate(-1)} aria-label="Previous period"><ArrowLeft size={17} /></button><strong>{formatDate(selectedDate, { month: "short", day: "2-digit" })}</strong><button onClick={() => changeDate(1)} aria-label="Next period"><ArrowRight size={17} /></button></div>
          <label className="select-control"><select value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)}><option>All courses</option>{courses.map((course) => <option key={course} value={course}>{courseCode(course)}</option>)}</select><ChevronDown size={17} /></label>
          <label className="select-control view-control"><select value={calendarMode} onChange={(event) => setCalendarMode(event.target.value as CalendarMode)}><option>Month View</option><option>Week View</option></select><ChevronDown size={17} /></label>
          <label className="header-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" /></label>
          <button className="notification-button" onClick={() => { setActiveView("timeline"); setEventTab("Reminders"); }} aria-label="Open reminders"><Bell size={19} /><i /></button>
          <button className="refresh-button" onClick={() => void loadAssignments(true)} disabled={refreshing} aria-label="Refresh Notion"><RefreshCw size={17} className={refreshing ? "spin" : ""} /></button>
        </header>

        {data.notice ? <div className="data-notice"><Info size={15} />{data.notice}<button onClick={() => setActiveView("settings")}>Setup</button></div> : null}

        {activeView === "timeline" ? (
          <main className="timeline-content">
            <section className="subjects-section">
              <div className="section-heading"><div><h2>Subjects</h2><p>Upcoming classes and deadlines</p></div><Filter size={17} /></div>
              <div className="subject-row">
                {courseSummaries.map(({ course, count }, index) => { const Icon = SUBJECT_ICONS[index % SUBJECT_ICONS.length]; return <button className="subject-card" key={course} onClick={() => selectCourse(course)}><span className="subject-shape" style={{ background: `linear-gradient(135deg, ${courseColor(course)}, #ffffff)` }} /><Icon size={25} /><MoreVertical size={18} className="subject-more" /><strong>{courseTitle(course)}</strong><small>{count} open {count === 1 ? "item" : "items"}</small></button>; })}
                <button className="see-all-subjects" onClick={() => setActiveView("courses")}>See all <ArrowRight size={19} /></button>
              </div>
            </section>

            <section className="calendar-composite">
              <aside className="day-agenda">
                <div className="agenda-date"><strong>{String(selectedDate.getDate()).padStart(2, "0")}</strong><span>{formatDate(selectedDate, { month: "short" })}<small>{selectedDate.getFullYear()}</small></span></div>
                <h3>To do list</h3>
                <div className="agenda-tasks">
                  {selectedAssignments.length ? selectedAssignments.slice(0, 3).map((item) => <button key={item.id} onClick={() => setActiveView("assignments")}><span>{item.title}</span><i>{item.riskScore}</i></button>) : <p>No deadlines selected</p>}
                </div>
                <h3>Schedule</h3>
                <div className="agenda-schedule">
                  {selectedSessions.length ? selectedSessions.slice(0, 5).map((session) => <button key={session.id} onClick={() => toggleSession(session.id)} className={completedSessions.has(session.id) ? "done" : ""}><time>{session.startTime}</time><span>{session.title}</span>{completedSessions.has(session.id) ? <Check size={13} /> : null}</button>) : <p>Open focus capacity</p>}
                </div>
              </aside>

              <div className="calendar-main">
                <div className="calendar-caption"><span>Calendar</span><div><button onClick={() => changeDate(-1)}>{formatDate(addMonths(selectedDate, -1), { month: "short" })}<small>{addMonths(selectedDate, -1).getFullYear()}</small></button><strong>{formatDate(selectedDate, { month: "short" })}<small>{selectedDate.getFullYear()}</small></strong><button onClick={() => changeDate(1)}>{formatDate(addMonths(selectedDate, 1), { month: "short" })}<small>{addMonths(selectedDate, 1).getFullYear()}</small></button></div></div>
                <div className={`month-grid ${calendarMode === "Week View" ? "week" : ""}`}>
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <b key={day}>{day}</b>)}
                  {dates.map((date) => {
                    const key = dateKey(date);
                    const events = visibleAssignments.filter((item) => item.dueDate === key);
                    const active = key === selectedKey;
                    const currentMonth = date.getMonth() === selectedDate.getMonth();
                    return <button key={key} className={`${active ? "selected" : ""} ${events.length ? "has-event" : ""} ${currentMonth ? "" : "outside"}`} onClick={() => setSelectedDate(date)}><span>{date.getDate()}</span>{events.length ? <i>{events.length > 1 ? events.length : ""}</i> : null}</button>;
                  })}
                </div>
              </div>
            </section>
          </main>
        ) : null}

        {activeView === "assignments" ? (
          <main className="workspace-view">
            <div className="view-heading"><div><h2>Assignment tracker</h2><p>Risk-ranked work from your Notion Student OS.</p></div><span>{visibleAssignments.length} active</span></div>
            <div className="assignment-grid">
              {visibleAssignments.map((item) => <article key={item.id}><span className="assignment-accent" style={{ background: courseColor(item.course) }} /><div className="assignment-icon"><FileText size={20} /></div><div className="assignment-copy"><small>{courseCode(item.course)}</small><h3>{item.title}</h3><p>{formatDuration(item.remainingMinutes)} remaining · {dueLabel(item.dueDate)}</p><div className="progress-track"><i style={{ width: `${item.estimatedMinutes ? item.completedMinutes / item.estimatedMinutes * 100 : 0}%` }} /></div></div><div className={`risk-badge ${riskTone(item.riskScore)}`}><strong>{item.riskScore}</strong><span>risk</span></div><a href={item.url} target="_blank" rel="noreferrer" aria-label="Open in Notion"><ExternalLink size={15} /></a></article>)}
              {!visibleAssignments.length ? <EmptyState title="Nothing found" copy="Try a different course or search." /> : null}
            </div>
          </main>
        ) : null}

        {activeView === "courses" ? (
          <main className="workspace-view">
            <div className="view-heading"><div><h2>Your subjects</h2><p>Every connected course and its current workload.</p></div><span>{courses.length} courses</span></div>
            <div className="course-grid">{courseSummaries.map(({ course, count, next }, index) => { const Icon = SUBJECT_ICONS[index % SUBJECT_ICONS.length]; return <button key={course} onClick={() => selectCourse(course)} style={{ "--course": courseColor(course) } as React.CSSProperties}><span><Icon size={28} /></span><small>{courseCode(course)}</small><h3>{courseTitle(course)}</h3><p>{count} active assignments</p><div>{next ? <><b>{dueLabel(next.dueDate)}</b><em>{next.title}</em></> : <b>All clear</b>}</div></button>; })}</div>
          </main>
        ) : null}

        {activeView === "planner" ? (
          <main className="workspace-view">
            <div className="view-heading planner-heading"><div><h2>Adaptive study plan</h2><p>Capacity-aware focus blocks generated from assignment risk.</p></div><div><button className="outline-button" onClick={() => exportSessions(allSessions)}><Download size={15} />Export</button><button className="blue-button" onClick={() => void syncPlan()} disabled={syncing}>{syncing ? <LoaderCircle size={15} className="spin" /> : <Cloud size={15} />}Sync to Notion</button></div></div>
            <section className="capacity-panel"><div><Clock3 size={20} /><span><strong>Daily capacity</strong><small>Weekends receive one extra hour</small></span></div><div>{[2, 3, 4, 5].map((hours) => <button key={hours} className={dailyHours === hours ? "active" : ""} onClick={() => setDailyHours(hours)}>{hours}h</button>)}</div></section>
            <div className="week-plan">{plan.days.map((day, index) => <article key={day.date}><header><div><strong>{formatDate(day.date, { weekday: "short" })}</strong>{index === 0 ? <em>Today</em> : null}</div><span>{formatDate(day.date, { month: "short", day: "numeric" })}</span><small>{formatDuration(day.plannedMinutes)} planned</small></header><div>{day.sessions.map((session) => <button key={session.id} className={completedSessions.has(session.id) ? "done" : ""} onClick={() => toggleSession(session.id)} style={{ borderTopColor: courseColor(session.course) }}><time>{session.startTime}</time><strong>{session.title}</strong><span>{courseCode(session.course)}</span><small>{formatDuration(session.durationMinutes)}{completedSessions.has(session.id) ? <Check size={11} /> : null}</small></button>)}{!day.sessions.length ? <p>Open capacity</p> : null}</div></article>)}</div>
          </main>
        ) : null}

        {activeView === "coach" ? (
          <main className="workspace-view coach-view">
            <div className="view-heading"><div><h2>Pulse Study Bot</h2><p>Assignment-aware guidance with a low-cost AI model and a local fallback.</p></div><span><ShieldCheck size={13} />Secure mode</span></div>
            <div className="coach-layout">
              <section className="coach-chat">
                <header><span><Bot size={22} /></span><div><strong>Pulse coach</strong><small>Reads normalized assignments, never page content</small></div><i className={coachLoading ? "thinking" : ""} /></header>
                <div className="coach-messages" aria-live="polite">
                  {coachMessages.map((message) => <article key={message.id} className={message.role}><span>{message.role === "assistant" ? <Bot size={16} /> : "AS"}</span><div><p>{message.text}</p>{message.meta ? <small>{message.meta}</small> : null}</div></article>)}
                  {coachLoading ? <article className="assistant typing"><span><Bot size={16} /></span><div><i /><i /><i /></div></article> : null}
                </div>
                <div className="coach-actions"><button onClick={() => void askCoach("daily-plan")}><CalendarDays size={14} />Plan my day</button><button onClick={() => void askCoach("priorities")}><BarChart3 size={14} />Set priorities</button><button onClick={() => void askCoach("get-started")}><Play size={14} />Help me start</button></div>
                <form className="coach-input" onSubmit={(event) => { event.preventDefault(); void askCoach("ask"); }}><textarea value={coachPrompt} onChange={(event) => setCoachPrompt(event.target.value)} maxLength={400} rows={2} placeholder="Ask about your workload, deadlines, or study plan…" /><span>{coachPrompt.length}/400</span><button type="submit" disabled={coachLoading || !coachPrompt.trim()} aria-label="Send question"><Send size={17} /></button></form>
              </section>
              <aside className="coach-context">
                <div className="coach-context-head"><BrainCircuit size={19} /><div><strong>What Pulse sees</strong><small>Only the fields needed to plan</small></div></div>
                <dl><div><dt>Active assignments</dt><dd>{openRisks.length}</dd></div><div><dt>Critical items</dt><dd>{openRisks.filter((item) => item.riskScore >= 70).length}</dd></div><div><dt>Focus scheduled</dt><dd>{formatDuration(plan.totalPlannedMinutes)}</dd></div></dl>
                <h3>Highest priorities</h3>
                <ol>{openRisks.slice(0, 3).map((item) => <li key={item.id}><span style={{ background: courseColor(item.course) }}>{courseCode(item.course).slice(0, 2)}</span><div><strong>{item.title}</strong><small>{dueLabel(item.dueDate)} · risk {item.riskScore}</small></div></li>)}</ol>
                <div className="coach-security"><ShieldCheck size={16} /><p>Prompts are limited, rate-limited, and processed server-side. Assignment URLs and Notion credentials are never sent to the model.</p></div>
              </aside>
            </div>
          </main>
        ) : null}

        {activeView === "settings" ? (
          <main className="workspace-view">
            <div className="view-heading"><div><h2>Notion integration</h2><p>PulsePlan reads assignments and writes generated study sessions.</p></div><span className={data.meta.connected ? "connected" : ""}>{data.meta.connected ? "Connected" : "Demo mode"}</span></div>
            <div className="integration-layout"><section><div className="security-note"><ShieldCheck size={23} /><div><strong>Server-side credentials</strong><p>Your Notion token is never sent to the browser.</p></div></div><ol><li><span>1</span><div><strong>Create an integration</strong><p>Enable Read content and Insert content capabilities.</p></div></li><li><span>2</span><div><strong>Share your databases</strong><p>Connect Assignments and Study Sessions to the integration.</p></div></li><li><span>3</span><div><strong>Add environment variables</strong><pre>NOTION_API_KEY=ntn_••••\nNOTION_ASSIGNMENTS_DATA_SOURCE_ID=••••\nNOTION_SESSIONS_DATA_SOURCE_ID=••••</pre></div></li></ol></section><aside><h3>Connection status</h3><dl><div><dt>Source</dt><dd>{data.meta.mode === "notion" ? "Notion API" : "Demo dataset"}</dd></div><div><dt>Assignments</dt><dd>{data.meta.assignmentCount}</dd></div><div><dt>Read access</dt><dd>{data.meta.connected ? "Ready" : "Not configured"}</dd></div><div><dt>Write-back</dt><dd>{data.meta.writeEnabled ? "Ready" : "Not configured"}</dd></div></dl><a href="https://www.notion.so/profile/integrations" target="_blank" rel="noreferrer">Open Notion integrations <ExternalLink size={14} /></a></aside></div>
          </main>
        ) : null}
      </section>

      <aside className="events-panel">
        <header><h2>Events</h2><button onClick={() => setActiveView("assignments")}><Filter size={14} />View all</button></header>
        <div className="event-tabs"><button className={eventTab === "Activities" ? "active" : ""} onClick={() => setEventTab("Activities")}>Activities</button><button className={eventTab === "Reminders" ? "active" : ""} onClick={() => setEventTab("Reminders")}>Reminders</button></div>
        <div className="event-list">
          {eventItems.map((item, index) => <article key={item.id} className={EVENT_THEMES[index % EVENT_THEMES.length]}><span className="event-blob" /><MoreVertical size={18} /><h3>{courseTitle(item.course)}</h3><strong>{item.title}</strong><p><Clock3 size={13} />{dueLabel(item.dueDate)}</p><p><MapPin size={13} />{formatDuration(item.remainingMinutes)} work left</p><div><span style={{ background: courseColor(item.course) }}>{courseCode(item.course).slice(0, 2)}</span><small>Risk score {item.riskScore}</small></div></article>)}
          {!eventItems.length ? <EmptyState title="No events" copy="Your current filters are clear." /> : null}
        </div>
        <footer><span className={`connection-dot ${data.meta.connected ? "live" : ""}`} /><strong>{data.meta.connected ? "Live from Notion" : "Demo workspace"}</strong><button onClick={() => setActiveView("settings")}>Manage</button></footer>
      </aside>

      <nav className="mobile-nav">{navItems.map((item) => { const Icon = item.icon; const mobileLabel = item.id === "planner" ? "Plan" : item.id === "coach" ? "Coach" : item.label.split(" ")[0]; return <button key={item.id} aria-label={item.label} className={activeView === item.id ? "active" : ""} onClick={() => setActiveView(item.id)}><Icon size={18} /><span>{mobileLabel}</span></button>; })}</nav>
      {toast ? <div className="toast"><CheckCircle2 size={16} /><span>{toast}</span><button onClick={() => setToast(null)}><X size={14} /></button></div> : null}
    </div>
  );
}
