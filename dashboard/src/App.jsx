import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { getAlerts, getFindings, getScans, getStats, runScan } from "./api";

const SEVERITIES = ["critical", "high", "medium", "low"];

const SEVERITY_META = {
  critical: { label: "Critical", tone: "red", dot: "#fb7185" },
  high: { label: "High", tone: "orange", dot: "#fb923c" },
  medium: { label: "Medium", tone: "amber", dot: "#fbbf24" },
  low: { label: "Low", tone: "cyan", dot: "#38bdf8" },
};

const STATUS_META = {
  clean: { label: "Clean", tone: "green" },
  drift_detected: { label: "Drift detected", tone: "amber" },
  error: { label: "Error", tone: "red" },
  running: { label: "Running", tone: "blue" },
};

const fmt = (value) => value ? new Date(value).toLocaleString() : "—";
const shortTime = (value) => value ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";
const pretty = (value) => value == null ? "—" : typeof value === "string" ? value : JSON.stringify(value, null, 2);

function Icon({ name, size = 18, strokeWidth = 1.8 }) {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/></>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
    server: <><rect x="3" y="3" width="18" height="8" rx="2"/><rect x="3" y="13" width="18" height="8" rx="2"/><path d="M7 7h.01M7 17h.01M11 7h6M11 17h6"/></>,
    scan: <><path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2"/><path d="M4 12h16"/></>,
    refresh: <><path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M5.6 9a7 7 0 0 1 11.6-2L20 12M4 12l2.8 5a7 7 0 0 0 11.6-2"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    arrow: <><path d="M7 17 17 7M7 7h10v10"/></>,
    cloud: <><path d="M20 16.2A4.5 4.5 0 0 0 18 7.5a6 6 0 0 0-11.6 1.7A4 4 0 0 0 7 17h12"/></>,
    alert: <><path d="m10.3 3.9-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.1l-8-14a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.grid}</svg>;
}

function Pill({ tone = "slate", children, dot = false }) {
  return <span className={`pill pill-${tone}`}>{dot && <i />} {children}</span>;
}

function SectionHeading({ eyebrow, title, description, action }) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}

function StatCard({ label, value, tone, icon, note }) {
  return (
    <article className={`stat-card stat-${tone}`}>
      <div className="stat-top">
        <span>{label}</span>
        <span className="stat-icon"><Icon name={icon} size={17} /></span>
      </div>
      <div className="stat-value">{value ?? 0}</div>
      <div className="stat-note">{note}</div>
      <span className="stat-glow" />
    </article>
  );
}

function Finding({ finding }) {
  const [open, setOpen] = useState(false);
  const severity = SEVERITY_META[finding.severity] || SEVERITY_META.low;
  const changes = finding.changes || [];
  return (
    <article className={`finding-card ${open ? "finding-open" : ""}`}>
      <button className="finding-trigger" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span className={`finding-mark mark-${severity.tone}`}><Icon name="alert" size={17} /></span>
        <span className="finding-main">
          <strong>{finding.address || "Unknown resource"}</strong>
          <small>{changes[0]?.description || "Configuration differs from desired state"}{changes.length > 1 ? ` · +${changes.length - 1} additional changes` : ""}</small>
        </span>
        <span className="finding-tags">
          <Pill tone="slate">{finding.origin === "manual_change" ? "Manual change" : "Code change"}</Pill>
          <Pill tone={severity.tone} dot>{severity.label}</Pill>
          <span className={`expand-chevron ${open ? "rotated" : ""}`}><Icon name="chevron" size={17} /></span>
        </span>
      </button>
      {open && (
        <div className="finding-details">
          {changes.map((change, index) => {
            const changeSeverity = SEVERITY_META[change.severity] || severity;
            return (
              <div className="change-block" key={`${change.rule || "rule"}-${index}`}>
                <div className="change-title">
                  <Pill tone={changeSeverity.tone}>{changeSeverity.label}</Pill>
                  <strong>{change.description || "Configuration change"}</strong>
                </div>
                <p className="rule-line">Detection rule: <code>{change.rule || "—"}</code></p>
                <div className="comparison-grid">
                  <div className="code-panel live-panel">
                    <div className="code-panel-head"><span className="code-dot red" /> Live in AWS <span className="code-label">ACTUAL</span></div>
                    <pre>{pretty(change.live)}</pre>
                  </div>
                  <div className="code-panel desired-panel">
                    <div className="code-panel-head"><span className="code-dot green" /> Desired in Git <span className="code-label">EXPECTED</span></div>
                    <pre>{pretty(change.desired)}</pre>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}

function EmptyState({ icon = "check", title, text }) {
  return <div className="empty-state"><span className="empty-icon"><Icon name={icon} size={22} /></span><strong>{title}</strong><p>{text}</p></div>;
}

export default function App() {
  const [stats, setStats] = useState(null);
  const [scans, setScans] = useState([]);
  const [findings, setFindings] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [error, setError] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [activeView, setActiveView] = useState("overview");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [nextStats, nextScans, nextFindings, nextAlerts] = await Promise.all([
        getStats(), getScans(), getFindings(), getAlerts(),
      ]);
      setStats(nextStats);
      setScans(nextScans);
      setFindings(nextFindings);
      setAlerts(nextAlerts);
      setError(null);
      setUpdatedAt(new Date());
    } catch (requestError) {
      setError(requestError.message || "Unable to connect to the API");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 10000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function handleScan() {
    if (scanning) return;
    setScanning(true);
    try {
      await runScan();
      await load();
    } catch (scanError) {
      setError(scanError.message || "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  const latest = stats?.latest_scan;
  const bySeverity = stats?.latest_by_severity ?? {};
  const trend = useMemo(() => (stats?.trend ?? []).map((item) => ({
    name: `#${item.scan_id}`,
    findings: item.findings,
  })), [stats]);
  const filteredFindings = useMemo(() => findings.filter((finding) => {
    const matchesSeverity = filter === "all" || finding.severity === filter;
    const term = query.trim().toLowerCase();
    const matchesQuery = !term || `${finding.address || ""} ${finding.origin || ""} ${(finding.changes || []).map((change) => `${change.description || ""} ${change.rule || ""}`).join(" ")}`.toLowerCase().includes(term);
    return matchesSeverity && matchesQuery;
  }), [findings, filter, query]);

  const navItems = [
    { id: "overview", label: "Overview", icon: "grid" },
    { id: "findings", label: "Drift findings", icon: "shield", count: findings.length },
    { id: "history", label: "Scan history", icon: "history" },
    { id: "alerts", label: "Alerts", icon: "bell", count: alerts.length },
  ];

  function navigate(view) {
    setActiveView(view);
    setMobileNavOpen(false);
    const target = document.getElementById(view);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const status = latest?.status || "running";
  const statusMeta = STATUS_META[status] || STATUS_META.running;
  const totalFindings = Object.values(bySeverity).reduce((sum, value) => sum + (Number(value) || 0), 0);

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-symbol"><Icon name="scan" size={21} /></div>
          <div className="brand-copy"><strong>drift<span>guard</span></strong><small>INFRASTRUCTURE SECURITY</small></div>
          <button className="mobile-close" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation">×</button>
        </div>

        <div className="workspace-switcher">
          <div className="workspace-icon"><Icon name="cloud" size={18} /></div>
          <div><strong>Cloud environment</strong><small>AWS · Production</small></div>
          <span className="workspace-chevron"><Icon name="chevron" size={15} /></span>
        </div>

        <div className="nav-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          {navItems.map((item) => (
            <button key={item.id} className={`nav-item ${activeView === item.id ? "nav-active" : ""}`} onClick={() => navigate(item.id)}>
              <Icon name={item.icon} size={18} />
              <span>{item.label}</span>
              {item.count > 0 && <small>{item.count}</small>}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-status"><span className="status-pulse" /><div><strong>Monitoring active</strong><small>Auto-refresh every 10 seconds</small></div></div>
          <div className="profile-row"><div className="profile-avatar">DG</div><div><strong>DriftGuard</strong><small>Infrastructure monitor</small></div><span className="profile-menu">•••</span></div>
        </div>
      </aside>

      {mobileNavOpen && <button className="mobile-scrim" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation overlay" />}

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-menu" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation"><Icon name="menu" /></button>
            <div className="breadcrumb"><span>Workspace</span><Icon name="chevron" size={14} /><strong>{navItems.find((item) => item.id === activeView)?.label || "Overview"}</strong></div>
          </div>
          <div className="topbar-right">
            <div className="live-indicator"><span className="status-pulse" /> Live monitoring</div>
            <span className="topbar-divider" />
            <button className="icon-button" onClick={load} title="Refresh dashboard" aria-label="Refresh dashboard"><Icon name="refresh" size={17} /></button>
            <div className="user-chip"><div className="user-avatar">A</div><span>Admin</span></div>
          </div>
        </header>

        <div className="page-wrap">
          <section className="page-intro" id="overview">
            <div>
              <div className="eyebrow"><span className="eyebrow-line" /> CLOUD POSTURE OVERVIEW</div>
              <h1>Infrastructure <span>overview</span></h1>
              <p>Detect configuration drift between your Git-defined infrastructure and live AWS resources.</p>
            </div>
            <div className="intro-actions">
              <div className="last-updated"><span>LAST UPDATED</span><strong>{updatedAt ? shortTime(updatedAt) : "Waiting for data"}</strong></div>
              <button className="primary-button" onClick={handleScan} disabled={scanning}>
                {scanning ? <span className="button-spinner" /> : <Icon name="scan" size={17} />}
                {scanning ? "Scanning infrastructure…" : "Run infrastructure scan"}
              </button>
            </div>
          </section>

          {error && (
            <div className="error-banner">
              <span className="error-icon"><Icon name="alert" size={18} /></span>
              <div><strong>Backend connection issue</strong><p>{error}. Make sure the API server is running on port 8000.</p></div>
              <button onClick={load}>Retry</button>
            </div>
          )}

          <section className="stats-grid" aria-label="Drift severity summary">
            <StatCard label="Critical issues" value={bySeverity.critical} tone="critical" icon="alert" note="Immediate attention required" />
            <StatCard label="High severity" value={bySeverity.high} tone="high" icon="alert" note="Review as soon as possible" />
            <StatCard label="Medium severity" value={bySeverity.medium} tone="medium" icon="shield" note="Review configuration changes" />
            <StatCard label="Low severity" value={bySeverity.low} tone="low" icon="check" note="Informational changes" />
            <article className="scan-summary-card">
              <div className="summary-head"><span>Latest scan</span><span className="summary-icon"><Icon name="clock" size={17} /></span></div>
              <div className="summary-status"><Pill tone={statusMeta.tone} dot>{statusMeta.label}</Pill></div>
              <strong className="summary-time">{latest ? fmt(latest.finished_at ?? latest.started_at) : "No scan recorded"}</strong>
              <span className="summary-foot">{stats?.total_scans ?? 0} total scans completed</span>
            </article>
          </section>

          <section className="content-grid">
            <div className="panel chart-panel">
              <SectionHeading eyebrow="ACTIVITY" title="Drift activity" description="Configuration differences detected across recent scans." action={<span className="chart-legend"><i /> Findings per scan</span>} />
              {trend.length ? (
                <div className="chart-wrap">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trend} margin={{ top: 12, right: 8, left: -18, bottom: 0 }}>
                      <defs><linearGradient id="findingsGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8b83ff" stopOpacity={0.28}/><stop offset="100%" stopColor="#8b83ff" stopOpacity={0.015}/></linearGradient></defs>
                      <CartesianGrid stroke="#222b3b" strokeDasharray="3 5" vertical={false} />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#78849a", fontSize: 11 }} dy={10} />
                      <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "#78849a", fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: "#111827", border: "1px solid #303b50", borderRadius: 10, color: "#e5e7eb", fontSize: 12 }} labelStyle={{ color: "#a5b4fc" }} />
                      <Area type="monotone" dataKey="findings" name="Findings" stroke="#9189ff" strokeWidth={2.4} fill="url(#findingsGradient)" activeDot={{ r: 5, fill: "#aaa4ff", stroke: "#17172d", strokeWidth: 3 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : <EmptyState icon="history" title="No scan activity yet" text="Run your first infrastructure scan to populate this chart." />}
              <div className="chart-footer"><span><i className="footer-dot" /> {trend.length} scans represented</span><span>{totalFindings} findings in latest scan</span></div>
            </div>

            <div className="panel posture-panel">
              <SectionHeading eyebrow="SECURITY POSTURE" title="Current exposure" description="Latest scan findings by severity." />
              <div className="posture-total"><strong>{totalFindings}</strong><span>total findings</span></div>
              <div className="severity-stack">
                {SEVERITIES.map((severity) => {
                  const amount = Number(bySeverity[severity] || 0);
                  const width = totalFindings ? `${(amount / totalFindings) * 100}%` : "0%";
                  return <span key={severity} className={`stack-${severity}`} style={{ width }} />;
                })}
              </div>
              <div className="posture-list">
                {SEVERITIES.map((severity) => (
                  <div className="posture-row" key={severity}>
                    <span className={`legend-dot dot-${severity}`} />
                    <span>{SEVERITY_META[severity].label}</span>
                    <strong>{bySeverity[severity] ?? 0}</strong>
                  </div>
                ))}
              </div>
              <div className="posture-note"><Icon name="shield" size={16} /><span>Findings are evaluated against your Git-defined desired state.</span></div>
            </div>
          </section>

          <section className="panel findings-panel" id="findings">
            <SectionHeading eyebrow="DETECTED CHANGES" title="Current drift findings" description="Resources where live AWS configuration differs from the desired state in Git." action={<span className="section-count">{findings.length} resources</span>} />
            <div className="table-toolbar">
              <div className="search-field"><Icon name="search" size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search resources or rules…" aria-label="Search findings" /></div>
              <div className="filter-group" aria-label="Filter findings by severity">
                <button className={filter === "all" ? "filter-active" : ""} onClick={() => setFilter("all")}>All</button>
                {SEVERITIES.map((severity) => <button key={severity} className={filter === severity ? "filter-active" : ""} onClick={() => setFilter(severity)}>{SEVERITY_META[severity].label}</button>)}
              </div>
            </div>
            {loading ? <EmptyState icon="refresh" title="Loading findings" text="Connecting to your infrastructure monitor…" /> :
              filteredFindings.length ? <div className="finding-list">{filteredFindings.map((finding) => <Finding key={finding.id} finding={finding} />)}</div> :
              <EmptyState icon={findings.length ? "search" : "check"} title={findings.length ? "No matching findings" : "No drift detected"} text={findings.length ? "Try another search term or severity filter." : "Your live infrastructure currently matches the desired Git configuration."} />}
          </section>

          <section className="bottom-grid">
            <div className="panel history-panel" id="history">
              <SectionHeading eyebrow="AUDIT TRAIL" title="Scan history" description="A record of recent infrastructure scans." action={<span className="section-count">{scans.length} recent</span>} />
              {scans.length ? <div className="table-scroll"><table className="data-table">
                <thead><tr><th>SCAN</th><th>DATE & TIME</th><th>TRIGGER</th><th>STATUS</th><th className="align-right">FINDINGS</th></tr></thead>
                <tbody>{scans.map((scan) => {
                  const scanStatus = STATUS_META[scan.status] || STATUS_META.running;
                  return <tr key={scan.id}><td><span className="scan-id">#{scan.id}</span></td><td>{fmt(scan.started_at)}</td><td>{scan.trigger || "—"}</td><td><Pill tone={scanStatus.tone} dot>{scanStatus.label}</Pill></td><td className="align-right">{scan.total_findings ?? 0}</td></tr>;
                })}</tbody>
              </table></div> : <EmptyState icon="history" title="No scan history" text="Completed scans will appear here." />}
            </div>

            <div className="panel alerts-panel" id="alerts">
              <SectionHeading eyebrow="NOTIFICATIONS" title="Recent alerts" description="Latest notifications generated by the detector." action={<span className="section-count">{alerts.length} alerts</span>} />
              {alerts.length ? <div className="alerts-list">{alerts.map((alert) => {
                const alertSeverity = SEVERITY_META[alert.severity] || null;
                return <article className="alert-item" key={alert.id}>
                  <span className={`alert-symbol ${alertSeverity ? `alert-${alertSeverity.tone}` : ""}`}><Icon name="bell" size={16} /></span>
                  <div className="alert-content">
                    <div className="alert-title-row"><strong>{(alert.kind || "Notification").replaceAll("_", " ")}</strong>{alert.severity && <Pill tone={alertSeverity?.tone || "slate"}>{alert.severity}</Pill>}</div>
                    <p>{(alert.message || "").replace(/:[a-z_]+:/g, "").replace(/[*`]/g, "").trim()}</p>
                    <small>{alert.channel || "System"} · {alert.status || "—"} · {fmt(alert.sent_at)}</small>
                  </div>
                </article>;
              })}</div> : <EmptyState icon="bell" title="All quiet" text="New detector alerts will appear here." />}
            </div>
          </section>

          <footer className="page-footer"><span>DRIFTGUARD <b>·</b> INFRASTRUCTURE DRIFT DETECTOR</span><span>Git desired state <b>↔</b> Live AWS configuration</span></footer>
        </div>
      </main>
    </div>
  );
}
