"use client";

import {
  AlertCircle,
  ArrowRight,
  BrainCircuit,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Cloud,
  Download,
  ExternalLink,
  FileText,
  GraduationCap,
  Home,
  Info,
  Library,
  Link2,
  ListTodo,
  LoaderCircle,
  Menu,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  Unplug,
  X,
  Zap,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildStudyPlan,
  calendarDaysBetween,
  formatDuration,
} from "@/lib/planner";
import type {
  AssignmentRisk,
  AssignmentsResponse,
  StudySession,
} from "@/lib/types";

type View = "overview" | "plan" | "assignments" | "integration";
type RiskFilter = "all" | "needs-attention" | "on-track";

const COURSE_COLORS = ["#a75f3f", "#657f68", "#687b96", "#94748b", "#a98545", "#6e8584"];

const navItems: { id: View; label: string; icon: typeof Home }[] = [
  { id: "overview", label: "Dashboard", icon: Home },
  { id: "plan", label: "Study plan", icon: CalendarDays },
  { id: "assignments", label: "Assignments", icon: ListTodo },
  { id: "integration", label: "Notion setup", icon: Settings2 },
];

function hashCourse(course: string): number {
  return [...course].reduce((total, character) => total + character.charCodeAt(0), 0);
}

function courseColor(course: string): string {
  return COURSE_COLORS[hashCourse(course) % COURSE_COLORS.length];
}

function dayDate(value: string): Date {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function formatDate(value: string, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en", options ?? { month: "short", day: "numeric" }).format(dayDate(value));
}

function dueText(date: string, now = new Date()): string {
  const days = calendarDaysBetween(now, date);
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 7) return `In ${days} days`;
  return formatDate(date);
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function scoreTone(score: number): string {
  if (score >= 70) return "danger";
  if (score >= 45) return "warning";
  return "safe";
}

function csvCell(value: string | number): string {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function exportSessions(sessions: StudySession[]) {
  const rows = [
    ["Date", "Start", "Duration (minutes)", "Course", "Assignment"],
    ...sessions.map((session) => [
      session.date,
      session.startTime,
      session.durationMinutes,
      session.course,
      session.title,
    ]),
  ];
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "pulseplan-week.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function Brand() {
  return (
    <div className="brand" aria-label="PulsePlan">
      <span className="brand-mark"><BrainCircuit size={18} /></span>
      <strong>PulsePlan</strong>
    </div>
  );
}

function SectionTitle({ label, title, action }: { label: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="section-title">
      <div><p>{label}</p><h2>{title}</h2></div>
      {action}
    </div>
  );
}

function RiskPill({ risk }: { risk: AssignmentRisk }) {
  if (risk.riskLevel === "complete") {
    return <span className="risk-pill complete"><CheckCircle2 size={12} /> Complete</span>;
  }
  const labels = { critical: "Act now", "at-risk": "At risk", steady: "On track" };
  return <span className={`risk-pill ${scoreTone(risk.riskScore)}`}><i />{labels[risk.riskLevel]}</span>;
}

function LoadingScreen() {
  return (
    <main className="loading-screen">
      <Brand />
      <div className="loading-icon"><GraduationCap size={28} /></div>
      <p>Opening your university dashboard…</p>
    </main>
  );
}

export function Dashboard() {
  const [activeView, setActiveView] = useState<View>("overview");
  const [data, setData] = useState<AssignmentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dailyHours, setDailyHours] = useState(3);
  const [completedSessions, setCompletedSessions] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<RiskFilter>("all");
  const [menuOpen, setMenuOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const loadAssignments = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    try {
      const response = await fetch("/api/assignments", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load assignment data");
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
        if (!response.ok) throw new Error("Could not load assignment data");
        return response.json() as Promise<AssignmentsResponse>;
      })
      .then((payload) => { if (!cancelled) setData(payload); })
      .catch((error: unknown) => {
        if (!cancelled) setToast(error instanceof Error ? error.message : "Could not load PulsePlan");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const plan = useMemo(
    () => buildStudyPlan(data?.assignments ?? [], { dailyCapacityMinutes: dailyHours * 60 }),
    [data?.assignments, dailyHours],
  );
  const allSessions = useMemo(() => plan.days.flatMap((day) => day.sessions), [plan.days]);
  const openRisks = plan.risks.filter((risk) => risk.riskLevel !== "complete");
  const urgentRisks = openRisks.filter((risk) => risk.riskScore >= 70);
  const topRisk = openRisks[0];
  const dueThisWeek = openRisks.filter((risk) => {
    const days = calendarDaysBetween(new Date(), risk.dueDate);
    return days >= 0 && days <= 7;
  });
  const unscheduledTotal = Object.values(plan.unscheduledMinutes).reduce((sum, minutes) => sum + minutes, 0);
  const courseSummaries = useMemo(() => {
    const grouped = new Map<string, { assignments: number; nextDue?: string }>();
    for (const item of data?.assignments ?? []) {
      const current = grouped.get(item.course) ?? { assignments: 0 };
      current.assignments += item.status === "Done" ? 0 : 1;
      if (item.status !== "Done" && (!current.nextDue || item.dueDate < current.nextDue)) current.nextDue = item.dueDate;
      grouped.set(item.course, current);
    }
    return [...grouped.entries()].map(([course, value]) => ({ course, ...value }));
  }, [data?.assignments]);

  const filteredRisks = plan.risks.filter((risk) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || risk.title.toLowerCase().includes(query) || risk.course.toLowerCase().includes(query);
    const matchesFilter = filter === "all" ||
      (filter === "needs-attention" && risk.riskScore >= 45 && risk.riskLevel !== "complete") ||
      (filter === "on-track" && (risk.riskScore < 45 || risk.riskLevel === "complete"));
    return matchesSearch && matchesFilter;
  });

  function navigate(view: View) {
    setActiveView(view);
    setMenuOpen(false);
    window.scrollTo({ top: 250, behavior: "smooth" });
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
      navigate("integration");
      setToast("Complete the Notion write-back setup first.");
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
      setToast(`${result.created ?? sessions.length} focus blocks added to Notion.`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Notion sync failed");
    } finally {
      setSyncing(false);
    }
  }

  if (loading && !data) return <LoadingScreen />;
  if (!data) {
    return <main className="fatal-state"><AlertCircle /><h1>PulsePlan could not start</h1><button onClick={() => void loadAssignments()}>Try again</button></main>;
  }

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <button className="menu-button" onClick={() => setMenuOpen(true)} aria-label="Open navigation"><Menu size={19} /></button>
        <Brand />
        <div className="breadcrumbs"><span>Student OS</span><ChevronRight size={13} /><strong>{navItems.find((item) => item.id === activeView)?.label}</strong></div>
        <div className="top-actions">
          <span className={`source-badge ${data.meta.connected ? "live" : ""}`}><i />{data.meta.connected ? "Notion live" : "Demo data"}</span>
          <button className="icon-button" onClick={() => void loadAssignments(true)} disabled={refreshing} aria-label="Refresh data"><RefreshCw size={16} className={refreshing ? "spin" : ""} /></button>
          <span className="avatar">AS</span>
        </div>
      </header>

      <section className="page-cover" aria-label="University students studying together">
        <Image src="/campus-cover.webp" alt="University students studying together" fill priority sizes="(max-width: 760px) 100vw, 1240px" />
        <span className="cover-overlay" />
        <blockquote>“A calm semester is built one focused block at a time.”</blockquote>
      </section>

      <section className="notion-page">
        <header className="page-identity">
          <span className="page-icon"><GraduationCap size={37} /></span>
          <p className="kicker">Your connected academic home</p>
          <h1>University Dashboard</h1>
          <p>Courses, deadlines, and a plan you can actually finish.</p>
        </header>

        {data.notice ? <div className="notice"><Info size={16} /><span>{data.notice}</span><button onClick={() => navigate("integration")}>Setup <ArrowRight size={13} /></button></div> : null}

        <div className="dashboard-layout">
          <aside className={`quick-rail ${menuOpen ? "open" : ""}`}>
            <button className="close-rail" onClick={() => setMenuOpen(false)} aria-label="Close navigation"><X size={18} /></button>
            <section className="rail-section">
              <h3>Quick access</h3><div className="thin-rule" />
              <button className="quick-link rust" onClick={() => navigate("assignments")}><span><Zap size={17} /></span><div><strong>{urgentRisks.length}</strong><small>Need attention</small></div><ChevronRight size={14} /></button>
              <button className="quick-link sage" onClick={() => navigate("plan")}><span><Clock3 size={17} /></span><div><strong>{formatDuration(plan.totalPlannedMinutes)}</strong><small>Focus planned</small></div><ChevronRight size={14} /></button>
              <button className="quick-link gold" onClick={() => navigate("assignments")}><span><Target size={17} /></span><div><strong>{dueThisWeek.length}</strong><small>Due this week</small></div><ChevronRight size={14} /></button>
            </section>

            <section className="rail-section navigation-section">
              <h3>Navigation</h3><div className="thin-rule" />
              {navItems.map((item) => {
                const Icon = item.icon;
                return <button key={item.id} className={activeView === item.id ? "active" : ""} onClick={() => navigate(item.id)}><Icon size={16} /><span>{item.label}</span><ChevronRight size={13} /></button>;
              })}
            </section>

            <section className="rail-section">
              <h3>Study tools</h3><div className="thin-rule" />
              <a href="https://classroom.google.com" target="_blank" rel="noreferrer"><Link2 size={14} />Google Classroom<ExternalLink size={12} /></a>
              <a href="https://www.notion.so" target="_blank" rel="noreferrer"><Link2 size={14} />Open Notion<ExternalLink size={12} /></a>
            </section>

            <div className="rail-quote"><Sparkles size={17} /><p>Do the next clear thing. Let the system hold the rest.</p></div>
            <div className="rail-status">{data.meta.connected ? <Cloud size={16} /> : <Unplug size={16} />}<div><strong>{data.meta.connected ? "Notion connected" : "Demo workspace"}</strong><small>{data.meta.assignmentCount} assignments available</small></div><i className={data.meta.connected ? "online" : ""} /></div>
          </aside>
          {menuOpen ? <button className="rail-scrim" onClick={() => setMenuOpen(false)} aria-label="Close navigation" /> : null}

          <main className="workspace-main">
            {activeView === "overview" ? (
              <>
                <div className="view-heading"><div><p>Today</p><h2>{greeting()}, Abu Sayed.</h2><span>Here is the clearest path through your academic week.</span></div><button className="primary-button" onClick={() => navigate("plan")}><CalendarDays size={15} />Open study plan</button></div>

                {topRisk ? <div className="smart-callout"><span><BrainCircuit size={20} /></span><div><p>PulsePlan suggests</p><h3>Start with {topRisk.title}.</h3><small>{topRisk.reasons.join(" · ")}. Your first focus block is already reserved.</small></div><div className={`callout-score ${scoreTone(topRisk.riskScore)}`}><strong>{topRisk.riskScore}</strong><small>risk</small></div></div> : null}

                <section className="notion-section">
                  <SectionTitle label="Classes" title="Current courses" action={<button className="text-button" onClick={() => navigate("assignments")}>View work <ArrowRight size={13} /></button>} />
                  <div className="course-gallery">
                    {courseSummaries.map(({ course, assignments, nextDue }) => <article className="course-card" key={course} style={{ "--course": courseColor(course) } as React.CSSProperties}><div className="course-cover"><Library size={22} /><span>{course.split("·")[0].trim()}</span></div><div><h3>{course.split("·")[1]?.trim() || course}</h3><p>{assignments} active {assignments === 1 ? "assignment" : "assignments"}</p><small>{nextDue ? `Next due ${dueText(nextDue).toLowerCase()}` : "No open deadlines"}</small></div></article>)}
                  </div>
                </section>

                <section className="notion-section">
                  <SectionTitle label="Class schedule" title="This week’s focus timetable" action={<span className="subtle-label"><i />Focus block</span>} />
                  <div className="week-timetable">
                    {plan.days.map((day, index) => { const date = dayDate(day.date); return <article key={day.date} className={index === 0 ? "today" : ""}><header><strong>{new Intl.DateTimeFormat("en", { weekday: "short" }).format(date)}</strong><span>{date.getDate()}</span></header><div>{day.sessions.slice(0, 3).map((session) => <button key={session.id} onClick={() => toggleSession(session.id)} className={completedSessions.has(session.id) ? "complete" : ""} style={{ borderLeftColor: courseColor(session.course) }}><time>{session.startTime}</time><strong>{session.title}</strong><small>{formatDuration(session.durationMinutes)}</small></button>)}{!day.sessions.length ? <p className="open-day">Open<br />capacity</p> : null}</div></article>; })}
                  </div>
                </section>

                <section className="notion-section">
                  <SectionTitle label="Assignment calendar" title="Upcoming deadlines" action={<button className="text-button" onClick={() => navigate("assignments")}>Full tracker <ArrowRight size={13} /></button>} />
                  <div className="deadline-list">
                    {openRisks.slice(0, 5).map((risk) => <article key={risk.id}><div className="date-tile"><strong>{dayDate(risk.dueDate).getDate()}</strong><span>{formatDate(risk.dueDate, { month: "short" })}</span></div><span className="course-pin" style={{ background: courseColor(risk.course) }} /><div className="deadline-main"><h3>{risk.title}</h3><p>{risk.course} · {formatDuration(risk.remainingMinutes)} left</p></div><div className={`risk-number ${scoreTone(risk.riskScore)}`}><strong>{risk.riskScore}</strong><span>risk</span></div><RiskPill risk={risk} /></article>)}
                  </div>
                </section>
              </>
            ) : null}

            {activeView === "plan" ? (
              <>
                <div className="view-heading"><div><p>Study plan</p><h2>A realistic path through the week.</h2><span>Focus blocks stop at your capacity and never move past a deadline.</span></div><div className="view-actions"><button className="secondary-button" onClick={() => exportSessions(allSessions)}><Download size={14} />CSV</button><button className="primary-button" onClick={() => void syncPlan()} disabled={syncing}>{syncing ? <LoaderCircle className="spin" size={14} /> : <Cloud size={14} />}{data.meta.writeEnabled ? "Sync to Notion" : "Connect Notion"}</button></div></div>

                <div className="capacity-callout"><span><Clock3 size={18} /></span><div><strong>Daily focus capacity</strong><small>Weekends automatically include one extra hour.</small></div><div className="capacity-picker">{[2, 3, 4, 5].map((hours) => <button key={hours} className={dailyHours === hours ? "active" : ""} onClick={() => setDailyHours(hours)}>{hours}h</button>)}</div></div>

                {unscheduledTotal ? <div className="alert-callout"><AlertCircle size={18} /><div><strong>{formatDuration(unscheduledTotal)} cannot fit before its deadline.</strong><small>Add capacity or renegotiate a lower-priority item.</small></div><button onClick={() => setDailyHours((hours) => Math.min(5, hours + 1))}>Add an hour</button></div> : <div className="success-callout"><CheckCircle2 size={18} /><div><strong>Every deadline fits.</strong><small>Your week has enough protected focus time.</small></div></div>}

                <section className="notion-section plan-section"><SectionTitle label="Weekly agenda" title="Scheduled focus blocks" />
                  <div className="plan-board">{plan.days.map((day, index) => { const date = dayDate(day.date); return <article className={index === 0 ? "today" : ""} key={day.date}><header><div><strong>{new Intl.DateTimeFormat("en", { weekday: "long" }).format(date)}</strong>{index === 0 ? <em>Today</em> : null}</div><span>{formatDate(day.date)}</span><small>{formatDuration(day.plannedMinutes)} / {formatDuration(day.capacityMinutes)}</small></header><div className="day-meter"><i style={{ width: `${Math.min(100, day.plannedMinutes / day.capacityMinutes * 100)}%` }} /></div><div className="plan-stack">{day.sessions.map((session) => <button key={session.id} className={completedSessions.has(session.id) ? "done" : ""} onClick={() => toggleSession(session.id)} style={{ "--course": courseColor(session.course) } as React.CSSProperties}><time>{session.startTime}</time><strong>{session.title}</strong><span>{session.course}</span><small><Clock3 size={11} />{formatDuration(session.durationMinutes)}<i>{completedSessions.has(session.id) ? <Check size={10} /> : null}</i></small></button>)}{!day.sessions.length ? <div className="empty-day"><Sparkles size={17} /><span>Open capacity</span></div> : null}</div></article>; })}</div>
                </section>
              </>
            ) : null}

            {activeView === "assignments" ? (
              <>
                <div className="view-heading"><div><p>Assignment tracker</p><h2>See pressure before it becomes panic.</h2><span>Scores combine deadline, workload, priority, and momentum.</span></div></div>
                <div className="assignment-toolbar"><label><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search assignments or courses" /></label><div>{(["all", "needs-attention", "on-track"] as RiskFilter[]).map((value) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{value === "all" ? "All" : value === "needs-attention" ? "Needs attention" : "On track"}</button>)}</div></div>
                <section className="notion-section"><SectionTitle label="Database" title={`${filteredRisks.length} assignments`} />
                  <div className="assignment-table"><div className="table-head"><span>Assignment</span><span>Due</span><span>Work left</span><span>Risk</span><span>Status</span></div>{filteredRisks.map((risk) => <article key={risk.id}><div className="assignment-name"><span style={{ color: courseColor(risk.course), background: `${courseColor(risk.course)}18` }}><FileText size={16} /></span><div><strong>{risk.title}</strong><small>{risk.course} · {risk.priority}</small></div></div><div className="due-cell"><strong>{dueText(risk.dueDate)}</strong><small>{formatDate(risk.dueDate, { month: "short", day: "numeric", year: "numeric" })}</small></div><div className="work-cell"><strong>{formatDuration(risk.remainingMinutes)}</strong><span><i style={{ width: `${risk.estimatedMinutes ? risk.completedMinutes / risk.estimatedMinutes * 100 : 0}%` }} /></span></div><div className={`risk-number ${scoreTone(risk.riskScore)}`}><strong>{risk.riskScore}</strong><span>/100</span></div><RiskPill risk={risk} /><details><summary><ChevronRight size={14} />Why this score?</summary><div><span><b>{risk.breakdown.urgency}</b> Deadline</span><span><b>{risk.breakdown.workload}</b> Workload</span><span><b>{risk.breakdown.importance}</b> Priority</span><span><b>{risk.breakdown.inertia}</b> Momentum</span></div></details></article>)}</div>
                </section>
                <div className="method-note"><BrainCircuit size={20} /><div><strong>Transparent by design</strong><p>Deadline contributes up to 48 points, workload 26, priority 22, and starting inertia 8. Completed work always scores zero.</p></div></div>
              </>
            ) : null}

            {activeView === "integration" ? (
              <>
                <div className="view-heading"><div><p>Notion setup</p><h2>Your Student OS is the source of truth.</h2><span>PulsePlan adds decisions and planning without replacing your workspace.</span></div><span className={`large-status ${data.meta.connected ? "connected" : ""}`}>{data.meta.connected ? <Cloud size={16} /> : <Unplug size={16} />}{data.meta.connected ? "Connected" : "Demo mode"}</span></div>
                <div className="security-callout"><ShieldCheck size={19} /><div><strong>Your token stays server-side.</strong><small>The browser only receives normalized assignment fields.</small></div></div>
                <section className="setup-layout">
                  <article className="setup-steps"><SectionTitle label="Connection guide" title="Four small steps" /><ol><li><span>1</span><div><strong>Create a Notion integration</strong><p>Enable Read content and, for write-back, Insert content.</p><a href="https://www.notion.so/profile/integrations" target="_blank" rel="noreferrer">Open integrations <ExternalLink size={12} /></a></div></li><li><span>2</span><div><strong>Share both databases</strong><p>Add the integration to Assignments and Study Sessions through Connections.</p></div></li><li><span>3</span><div><strong>Add local secrets</strong><p>Copy <code>.env.example</code> to <code>.env.local</code>.</p><pre>NOTION_API_KEY=ntn_••••••\nNOTION_ASSIGNMENTS_DATA_SOURCE_ID=••••\nNOTION_SESSIONS_DATA_SOURCE_ID=••••</pre></div></li><li><span>4</span><div><strong>Restart PulsePlan</strong><p>The source badge changes to Notion live.</p></div></li></ol></article>
                  <aside><article className="schema-card"><SectionTitle label="Read from" title="Assignments" /><dl><div><dt>Name</dt><dd>Title · required</dd></div><div><dt>Due</dt><dd>Date · required</dd></div><div><dt>Course</dt><dd>Relation or text</dd></div><div><dt>Status</dt><dd>Status or select</dd></div><div><dt>Estimated hours</dt><dd>Number</dd></div><div><dt>Priority</dt><dd>Select</dd></div></dl></article><article className="schema-card"><SectionTitle label="Write to" title="Study Sessions" /><dl><div><dt>Name</dt><dd>Title · required</dd></div><div><dt>Date</dt><dd>Date · required</dd></div><div><dt>Course</dt><dd>Select or text</dd></div><div><dt>Duration</dt><dd>Number</dd></div><div><dt>Status</dt><dd>Status or select</dd></div></dl></article></aside>
                </section>
              </>
            ) : null}
          </main>
        </div>
      </section>

      <nav className="mobile-nav">{navItems.map((item) => { const Icon = item.icon; return <button key={item.id} className={activeView === item.id ? "active" : ""} onClick={() => navigate(item.id)}><Icon size={18} /><span>{item.label.split(" ")[0]}</span></button>; })}</nav>
      {toast ? <div className="toast"><CheckCircle2 size={16} /><span>{toast}</span><button onClick={() => setToast(null)}><X size={13} /></button></div> : null}
    </div>
  );
}
