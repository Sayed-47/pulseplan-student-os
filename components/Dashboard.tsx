"use client";

import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  BrainCircuit,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleGauge,
  Clock3,
  Cloud,
  Download,
  ExternalLink,
  FileText,
  Info,
  LayoutDashboard,
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

const COURSE_COLORS = ["#6d5dfc", "#e37047", "#168a72", "#ba4d78", "#2672c9", "#9a6a12"];

const navItems: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "plan", label: "Study plan", icon: CalendarDays },
  { id: "assignments", label: "Assignments", icon: BookOpen },
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

function Logo() {
  return (
    <div className="brand" aria-label="PulsePlan">
      <span className="brand-mark"><BrainCircuit size={21} /></span>
      <span className="brand-name">pulse<span>plan</span></span>
    </div>
  );
}

function RiskPill({ risk }: { risk: AssignmentRisk }) {
  if (risk.riskLevel === "complete") {
    return <span className="risk-pill complete"><CheckCircle2 size={13} /> Complete</span>;
  }
  const labels = { critical: "Act now", "at-risk": "At risk", steady: "On track" };
  return (
    <span className={`risk-pill ${scoreTone(risk.riskScore)}`}>
      <span className="risk-dot" /> {labels[risk.riskLevel]}
    </span>
  );
}

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="empty-state">
      <span><CheckCircle2 size={22} /></span>
      <strong>{title}</strong>
      <p>{copy}</p>
    </div>
  );
}

function LoadingScreen() {
  return (
    <main className="loading-screen">
      <Logo />
      <div className="loading-orbit"><BrainCircuit size={28} /></div>
      <p>Turning deadlines into a workable week…</p>
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
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setToast(error instanceof Error ? error.message : "Could not load PulsePlan");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
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

  const allSessions = useMemo(
    () => plan.days.flatMap((day) => day.sessions),
    [plan.days],
  );
  const openRisks = plan.risks.filter((risk) => risk.riskLevel !== "complete");
  const urgentRisks = openRisks.filter((risk) => risk.riskScore >= 70);
  const dueThisWeek = openRisks.filter((risk) => {
    const days = calendarDaysBetween(new Date(), risk.dueDate);
    return days >= 0 && days <= 7;
  });
  const topRisk = openRisks[0];
  const totalEstimate = data?.assignments.reduce((sum, item) => sum + item.estimatedMinutes, 0) ?? 0;
  const totalCompleted = data?.assignments.reduce((sum, item) => sum + item.completedMinutes, 0) ?? 0;
  const completion = totalEstimate ? Math.round((totalCompleted / totalEstimate) * 100) : 0;
  const unscheduledTotal = Object.values(plan.unscheduledMinutes).reduce((sum, minutes) => sum + minutes, 0);

  const filteredRisks = plan.risks.filter((risk) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || risk.title.toLowerCase().includes(query) || risk.course.toLowerCase().includes(query);
    const matchesFilter =
      filter === "all" ||
      (filter === "needs-attention" && risk.riskScore >= 45 && risk.riskLevel !== "complete") ||
      (filter === "on-track" && (risk.riskScore < 45 || risk.riskLevel === "complete"));
    return matchesSearch && matchesFilter;
  });

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
      setActiveView("integration");
      setToast("Complete the Notion write-back setup first.");
      return;
    }
    const sessions = allSessions.filter((session) => !completedSessions.has(session.id));
    setSyncing(true);
    try {
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

  function navigate(view: View) {
    setActiveView(view);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (loading && !data) return <LoadingScreen />;
  if (!data) {
    return (
      <main className="fatal-state">
        <AlertCircle size={28} />
        <h1>PulsePlan could not start</h1>
        <button className="primary-button" onClick={() => void loadAssignments()}>Try again</button>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <div className="sidebar-head">
          <Logo />
          <button className="icon-button close-menu" onClick={() => setMenuOpen(false)} aria-label="Close menu"><X size={19} /></button>
        </div>
        <div className="workspace-pill">
          <span className="workspace-avatar">S</span>
          <span><small>Workspace</small><strong>Student OS</strong></span>
          <ChevronRight size={16} />
        </div>
        <nav className="side-nav" aria-label="Main navigation">
          <p>Workspace</p>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={activeView === item.id ? "active" : ""} onClick={() => navigate(item.id)}>
                <Icon size={18} />
                <span>{item.label}</span>
                {item.id === "assignments" && urgentRisks.length > 0 ? <em>{urgentRisks.length}</em> : null}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-tip">
          <span><Sparkles size={16} /></span>
          <div><strong>Planning insight</strong><p>{formatDuration(plan.totalPlannedMinutes)} of focused work mapped this week.</p></div>
        </div>
        <div className="connection-card">
          <span className={`connection-icon ${data.meta.connected ? "connected" : ""}`}>
            {data.meta.connected ? <Cloud size={17} /> : <Unplug size={17} />}
          </span>
          <div><strong>{data.meta.connected ? "Notion connected" : "Demo workspace"}</strong><small>{data.meta.connected ? `${data.meta.assignmentCount} assignments synced` : "Safe sample data"}</small></div>
          <span className={`live-dot ${data.meta.connected ? "online" : ""}`} />
        </div>
      </aside>

      {menuOpen ? <button className="menu-scrim" onClick={() => setMenuOpen(false)} aria-label="Close menu" /> : null}

      <section className="main-column">
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
          <div className="topbar-context"><span>Student OS</span><ChevronRight size={14} /><strong>{navItems.find((item) => item.id === activeView)?.label}</strong></div>
          <div className="topbar-actions">
            <span className={`source-badge ${data.meta.connected ? "live" : ""}`}><span />{data.meta.connected ? "Live data" : "Demo mode"}</span>
            <button className="icon-button" onClick={() => void loadAssignments(true)} disabled={refreshing} aria-label="Refresh assignments">
              <RefreshCw size={18} className={refreshing ? "spin" : ""} />
            </button>
            <span className="user-avatar">SM</span>
          </div>
        </header>

        <main className="content">
          {data.notice ? (
            <div className="notice-banner"><Info size={17} /><span>{data.notice}</span><button onClick={() => navigate("integration")}>Setup guide <ArrowRight size={14} /></button></div>
          ) : null}

          {activeView === "overview" ? (
            <>
              <section className="page-heading">
                <div><p className="eyebrow">{greeting()}</p><h1>Your week, under control.</h1><p>PulsePlan translated {openRisks.length} active assignments into the next best actions.</p></div>
                <button className="primary-button" onClick={() => navigate("plan")}><CalendarDays size={17} /> Open study plan</button>
              </section>

              {topRisk ? (
                <section className="briefing-card">
                  <div className="briefing-copy">
                    <p className="briefing-label"><Sparkles size={14} /> Smart briefing</p>
                    <h2>{topRisk.riskScore >= 70 ? "Start here to protect your week." : "Your workload is in a healthy range."}</h2>
                    <p><strong>{topRisk.title}</strong> has {formatDuration(topRisk.remainingMinutes)} left and is {dueText(topRisk.dueDate).toLowerCase()}. PulsePlan reserved its first focus block in your schedule.</p>
                    <div className="briefing-actions">
                      <button onClick={() => navigate("plan")}>See the focus block <ArrowRight size={15} /></button>
                      {topRisk.url ? <a href={topRisk.url} target="_blank" rel="noreferrer">Open source <ExternalLink size={14} /></a> : null}
                    </div>
                  </div>
                  <div className="risk-orbit" style={{ "--score": topRisk.riskScore } as React.CSSProperties}>
                    <div><strong>{topRisk.riskScore}</strong><span>risk score</span></div>
                    <svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52" /><circle className="score-ring" cx="60" cy="60" r="52" pathLength="100" /></svg>
                  </div>
                </section>
              ) : <EmptyState title="Everything is complete" copy="Your Student OS has no unfinished assignments." />}

              <section className="metric-grid" aria-label="Weekly summary">
                <article className="metric-card"><span className="metric-icon purple"><Zap size={19} /></span><div><p>Needs attention</p><strong>{urgentRisks.length}</strong><small>{urgentRisks.length ? "Prioritized by urgency and effort" : "No critical work"}</small></div></article>
                <article className="metric-card"><span className="metric-icon orange"><Clock3 size={19} /></span><div><p>Focus scheduled</p><strong>{formatDuration(plan.totalPlannedMinutes)}</strong><small>Across {plan.days.filter((day) => day.sessions.length).length} active days</small></div></article>
                <article className="metric-card"><span className="metric-icon green"><Target size={19} /></span><div><p>Due this week</p><strong>{dueThisWeek.length}</strong><small>{unscheduledTotal ? `${formatDuration(unscheduledTotal)} needs capacity` : "All work has capacity"}</small></div></article>
                <article className="metric-card"><span className="metric-icon blue"><CircleGauge size={19} /></span><div><p>Overall progress</p><strong>{completion}%</strong><small>Across tracked workload</small></div></article>
              </section>

              <section className="overview-grid">
                <article className="panel workload-panel">
                  <div className="panel-heading"><div><p className="eyebrow">Capacity map</p><h2>Your next 7 days</h2></div><span className="legend"><i /> Planned work</span></div>
                  <div className="week-bars">
                    {plan.days.map((day) => {
                      const percent = Math.round((day.plannedMinutes / day.capacityMinutes) * 100);
                      const date = dayDate(day.date);
                      return (
                        <div className="bar-column" key={day.date}>
                          <div className="bar-value">{day.plannedMinutes ? formatDuration(day.plannedMinutes) : "Free"}</div>
                          <div className="bar-track"><span style={{ height: `${Math.max(4, percent)}%` }} className={percent >= 95 ? "full" : ""} /></div>
                          <strong>{new Intl.DateTimeFormat("en", { weekday: "short" }).format(date).slice(0, 2)}</strong>
                          <small>{date.getDate()}</small>
                        </div>
                      );
                    })}
                  </div>
                  <div className="capacity-note"><ShieldCheck size={16} /><span>The plan protects breaks and limits each assignment to two hours per day.</span></div>
                </article>

                <article className="panel focus-panel">
                  <div className="panel-heading"><div><p className="eyebrow">Priority queue</p><h2>What deserves focus</h2></div><button className="text-button" onClick={() => navigate("assignments")}>View all <ArrowRight size={14} /></button></div>
                  <div className="focus-list">
                    {openRisks.slice(0, 4).map((risk, index) => (
                      <div className="focus-item" key={risk.id}>
                        <span className="focus-number">{String(index + 1).padStart(2, "0")}</span>
                        <span className="course-line" style={{ background: courseColor(risk.course) }} />
                        <div className="focus-main"><strong>{risk.title}</strong><p>{risk.course} · {risk.reasons.slice(0, 2).join(" · ")}</p></div>
                        <div className={`mini-score ${scoreTone(risk.riskScore)}`}><strong>{risk.riskScore}</strong><span>risk</span></div>
                      </div>
                    ))}
                  </div>
                </article>
              </section>
            </>
          ) : null}

          {activeView === "plan" ? (
            <>
              <section className="page-heading plan-heading">
                <div><p className="eyebrow">Adaptive study plan</p><h1>A realistic path through the week.</h1><p>Focus blocks stop at your daily capacity and move urgent work forward.</p></div>
                <div className="heading-actions">
                  <button className="secondary-button" onClick={() => exportSessions(allSessions)}><Download size={16} /> Export CSV</button>
                  <button className="primary-button" onClick={() => void syncPlan()} disabled={syncing}>
                    {syncing ? <LoaderCircle className="spin" size={16} /> : <Cloud size={16} />} {data.meta.writeEnabled ? "Sync to Notion" : "Connect Notion"}
                  </button>
                </div>
              </section>

              <section className="plan-control panel">
                <div><span className="metric-icon purple"><Clock3 size={18} /></span><div><strong>Daily focus capacity</strong><p>Weekends automatically get one extra hour.</p></div></div>
                <div className="capacity-picker" role="group" aria-label="Daily focus capacity">
                  {[2, 3, 4, 5].map((hours) => <button key={hours} className={dailyHours === hours ? "active" : ""} onClick={() => setDailyHours(hours)}>{hours}h</button>)}
                </div>
              </section>

              {unscheduledTotal > 0 ? (
                <div className="overload-banner"><AlertCircle size={19} /><div><strong>This week needs {formatDuration(unscheduledTotal)} more capacity.</strong><p>Increase daily focus time or renegotiate the lowest-priority deadline.</p></div><button onClick={() => setDailyHours((hours) => Math.min(5, hours + 1))}>Add capacity</button></div>
              ) : (
                <div className="healthy-banner"><CheckCircle2 size={19} /><div><strong>Every deadline fits.</strong><p>The plan has enough room for all tracked work due in this window.</p></div></div>
              )}

              <section className="calendar-board">
                {plan.days.map((day, index) => {
                  const date = dayDate(day.date);
                  const dayName = new Intl.DateTimeFormat("en", { weekday: "short" }).format(date);
                  const isToday = index === 0;
                  return (
                    <article className={`day-column ${isToday ? "today" : ""}`} key={day.date}>
                      <header><div><span>{dayName}</span>{isToday ? <em>Today</em> : null}</div><strong>{date.getDate()}</strong><small>{formatDuration(day.plannedMinutes)} / {formatDuration(day.capacityMinutes)}</small></header>
                      <div className="day-progress"><span style={{ width: `${Math.min(100, (day.plannedMinutes / day.capacityMinutes) * 100)}%` }} /></div>
                      <div className="session-stack">
                        {day.sessions.length ? day.sessions.map((session) => {
                          const complete = completedSessions.has(session.id);
                          return (
                            <button className={`session-card ${complete ? "done" : ""}`} key={session.id} onClick={() => toggleSession(session.id)} style={{ borderLeftColor: courseColor(session.course) }}>
                              <span className="session-time">{session.startTime}</span>
                              <strong>{session.title}</strong>
                              <small>{session.course}</small>
                              <span className="session-meta"><Clock3 size={12} /> {formatDuration(session.durationMinutes)}<i>{complete ? <Check size={11} /> : null}</i></span>
                            </button>
                          );
                        }) : <div className="rest-day"><Sparkles size={17} /><span>Open capacity</span><small>Room for rest or review</small></div>}
                      </div>
                    </article>
                  );
                })}
              </section>
              <p className="calendar-hint"><Info size={14} /> Select a focus block to mark it complete locally. Changes reset when the page reloads.</p>
            </>
          ) : null}

          {activeView === "assignments" ? (
            <>
              <section className="page-heading">
                <div><p className="eyebrow">Risk-ranked assignments</p><h1>See pressure before it becomes panic.</h1><p>Every score is calculated from deadline, remaining effort, priority, and momentum.</p></div>
              </section>
              <section className="assignment-tools panel">
                <label className="search-box"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search assignment or course" /></label>
                <div className="filter-tabs">
                  {(["all", "needs-attention", "on-track"] as RiskFilter[]).map((value) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{value === "all" ? "All" : value === "needs-attention" ? "Needs attention" : "On track"}</button>)}
                </div>
              </section>
              <section className="assignment-list panel">
                <div className="assignment-list-head"><span>Assignment</span><span>Due</span><span>Work left</span><span>Risk</span><span>Status</span></div>
                {filteredRisks.length ? filteredRisks.map((risk) => (
                  <article className="assignment-row" key={risk.id}>
                    <div className="assignment-name"><span className="course-icon" style={{ background: `${courseColor(risk.course)}18`, color: courseColor(risk.course) }}><FileText size={17} /></span><div><strong>{risk.title}</strong><small><i style={{ background: courseColor(risk.course) }} />{risk.course} · {risk.priority} priority</small></div></div>
                    <div className={`due-cell ${calendarDaysBetween(new Date(), risk.dueDate) <= 1 && risk.riskLevel !== "complete" ? "urgent" : ""}`}><strong>{dueText(risk.dueDate)}</strong><small>{formatDate(risk.dueDate, { month: "short", day: "numeric", year: "numeric" })}</small></div>
                    <div className="effort-cell"><strong>{formatDuration(risk.remainingMinutes)}</strong><span><i style={{ width: `${Math.min(100, risk.estimatedMinutes ? (risk.completedMinutes / risk.estimatedMinutes) * 100 : 0)}%` }} /></span></div>
                    <div className={`score-cell ${scoreTone(risk.riskScore)}`}><strong>{risk.riskScore}</strong><span>/{100}</span></div>
                    <div><RiskPill risk={risk} /></div>
                    <details className="risk-details"><summary><ChevronRight size={16} /> Why this score?</summary><div><span><b>{risk.breakdown.urgency}</b> Deadline</span><span><b>{risk.breakdown.workload}</b> Workload</span><span><b>{risk.breakdown.importance}</b> Priority</span><span><b>{risk.breakdown.inertia}</b> Momentum</span></div></details>
                  </article>
                )) : <EmptyState title="No assignments found" copy="Try another search or filter." />}
              </section>
              <section className="explain-panel panel"><span><BrainCircuit size={22} /></span><div><p className="eyebrow">Transparent by design</p><h2>No black-box recommendations</h2><p>PulsePlan uses a deterministic 100-point score. Deadline contributes up to 48 points, workload pressure up to 26, priority up to 22, and starting inertia up to 8. Completed work always scores zero.</p></div></section>
            </>
          ) : null}

          {activeView === "integration" ? (
            <>
              <section className="page-heading">
                <div><p className="eyebrow">Notion integration</p><h1>Connect your Student OS in minutes.</h1><p>Your API key stays on the server and is never exposed to the browser.</p></div>
                <span className={`large-status ${data.meta.connected ? "connected" : ""}`}>{data.meta.connected ? <Cloud size={18} /> : <Unplug size={18} />}{data.meta.connected ? "Connected" : "Demo mode"}</span>
              </section>
              <section className="setup-grid">
                <article className="panel setup-steps">
                  <div className="panel-heading"><div><p className="eyebrow">Setup</p><h2>Bring your assignments to life</h2></div></div>
                  <ol>
                    <li><span>1</span><div><strong>Create a Notion integration</strong><p>Give it Read content access. Add Insert content access if you want study-plan write-back.</p><a href="https://www.notion.so/profile/integrations" target="_blank" rel="noreferrer">Open integrations <ExternalLink size={13} /></a></div></li>
                    <li><span>2</span><div><strong>Share both data sources</strong><p>Open each Notion database, select Connections, and add your integration.</p></div></li>
                    <li><span>3</span><div><strong>Configure local secrets</strong><p>Copy <code>.env.example</code> to <code>.env.local</code> and add the token and data-source IDs.</p><pre>NOTION_API_KEY=ntn_••••••••\nNOTION_ASSIGNMENTS_DATA_SOURCE_ID=••••\nNOTION_SESSIONS_DATA_SOURCE_ID=••••</pre></div></li>
                    <li><span>4</span><div><strong>Restart PulsePlan</strong><p>The source badge will change to Live data. Common property names are detected automatically.</p></div></li>
                  </ol>
                </article>
                <div className="setup-side">
                  <article className="panel schema-card">
                    <div className="panel-heading"><div><p className="eyebrow">Recommended schema</p><h2>Assignments</h2></div><BookOpen size={20} /></div>
                    <dl><div><dt>Name</dt><dd>Title · required</dd></div><div><dt>Due</dt><dd>Date · required</dd></div><div><dt>Status</dt><dd>Status or checkbox</dd></div><div><dt>Course</dt><dd>Select or text</dd></div><div><dt>Estimated hours</dt><dd>Number</dd></div><div><dt>Priority</dt><dd>Select</dd></div><div><dt>Progress</dt><dd>Number, 0–100</dd></div></dl>
                  </article>
                  <article className="panel schema-card">
                    <div className="panel-heading"><div><p className="eyebrow">For write-back</p><h2>Study Sessions</h2></div><CalendarDays size={20} /></div>
                    <dl><div><dt>Name</dt><dd>Title · required</dd></div><div><dt>Date</dt><dd>Date · required</dd></div><div><dt>Course</dt><dd>Select or text</dd></div><div><dt>Duration</dt><dd>Number, minutes</dd></div><div><dt>Status</dt><dd>Status</dd></div><div><dt>Source</dt><dd>URL</dd></div></dl>
                  </article>
                  <article className="security-card"><ShieldCheck size={21} /><div><strong>Server-side by default</strong><p>The browser only receives normalized assignment fields. PulsePlan never returns your Notion token.</p></div></article>
                </div>
              </section>
            </>
          ) : null}
        </main>
      </section>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {navItems.map((item) => { const Icon = item.icon; return <button key={item.id} className={activeView === item.id ? "active" : ""} onClick={() => navigate(item.id)}><Icon size={19} /><span>{item.label.split(" ")[0]}</span></button>; })}
      </nav>
      {toast ? <div className="toast"><CheckCircle2 size={17} />{toast}<button onClick={() => setToast(null)}><X size={14} /></button></div> : null}
    </div>
  );
}
