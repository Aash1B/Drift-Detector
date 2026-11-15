import { useCallback, useEffect, useState } from "react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { getAlerts, getFindings, getScans, getStats, runScan } from "./api";

const SEVERITIES = ["critical", "high", "medium", "low"];

const STYLE = {
  critical: { card: "border-red-500/40 bg-red-500/10 text-red-300", badge: "bg-red-500/15 text-red-300 ring-red-500/40" },
  high: { card: "border-orange-500/40 bg-orange-500/10 text-orange-300", badge: "bg-orange-500/15 text-orange-300 ring-orange-500/40" },
  medium: { card: "border-yellow-500/40 bg-yellow-500/10 text-yellow-300", badge: "bg-yellow-500/15 text-yellow-300 ring-yellow-500/40" },
  low: { card: "border-sky-500/40 bg-sky-500/10 text-sky-300", badge: "bg-sky-500/15 text-sky-300 ring-sky-500/40" },
};

const STATUS_STYLE = {
  clean: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/40",
  drift_detected: "bg-amber-500/15 text-amber-300 ring-amber-500/40",
  error: "bg-red-500/15 text-red-300 ring-red-500/40",
  running: "bg-slate-500/15 text-slate-300 ring-slate-500/40",
};

const fmt = (iso) => (iso ? new Date(iso).toLocaleString() : "-");
const pretty = (v) =>
  v === null || v === undefined ? "-" : typeof v === "string" ? v : JSON.stringify(v, null, 2);

function Pill({ className, children }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${className}`}>
      {children}
    </span>
  );
}

function Section({ title, children, right }) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function Finding({ f }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
      >
        <div className="min-w-0">
          <p className="truncate font-mono text-sm text-slate-100">{f.address}</p>
          <p className="truncate text-xs text-slate-400">
            {f.changes[0]?.description}
            {f.changes.length > 1 ? ` (+${f.changes.length - 1} more)` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Pill className="bg-slate-700/40 text-slate-300 ring-slate-600/60">
            {f.origin === "manual_change" ? "manual change" : "code change"}
          </Pill>
          <Pill className={STYLE[f.severity].badge}>{f.severity}</Pill>
          <span className="text-slate-500">{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {open && (
        <div className="space-y-4 border-t border-slate-800 px-4 py-4">
          {f.changes.map((c, i) => (
            <div key={i} className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Pill className={STYLE[c.severity].badge}>{c.severity}</Pill>
                <span className="text-sm text-slate-200">{c.description}</span>
              </div>
              <p className="text-xs text-slate-500">Rule: {c.rule}</p>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs font-medium text-red-300">Live in AWS</p>
                  <pre className="overflow-x-auto rounded-md bg-slate-950 p-3 text-xs text-slate-300">{pretty(c.live)}</pre>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-emerald-300">Desired (Git)</p>
                  <pre className="overflow-x-auto rounded-md bg-slate-950 p-3 text-xs text-slate-300">{pretty(c.desired)}</pre>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [stats, setStats] = useState(null);
  const [scans, setScans] = useState([]);
  const [findings, setFindings] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [error, setError] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = useCallback(async () => {
    try {
      const [s, sc, f, a] = await Promise.all([getStats(), getScans(), getFindings(), getAlerts()]);
      setStats(s);
      setScans(sc);
      setFindings(f);
      setAlerts(a);
      setError(null);
      setUpdatedAt(new Date());
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  async function handleScan() {
    setScanning(true);
    try {
      await runScan();
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setScanning(false);
    }
  }

  const latest = stats?.latest_scan;
  const bySeverity = stats?.latest_by_severity ?? {};
  const trend = (stats?.trend ?? []).map((t) => ({ name: `#${t.scan_id}`, findings: t.findings }));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Infrastructure Drift Detector</h1>
            <p className="text-sm text-slate-400">
              Git (desired) vs live AWS
              {updatedAt ? ` · updated ${updatedAt.toLocaleTimeString()}` : ""}
            </p>
          </div>
          <button
            onClick={handleScan}
            disabled={scanning}
            className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:opacity-50"
          >
            {scanning ? "Scanning… (10-20s)" : "Run scan now"}
          </button>
        </header>

        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            Cannot reach the API ({error}). Is <code>uvicorn</code> running on port 8000?
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          {SEVERITIES.map((sev) => (
            <div key={sev} className={`rounded-xl border p-4 ${STYLE[sev].card}`}>
              <p className="text-xs font-medium uppercase tracking-wide">{sev}</p>
              <p className="mt-1 text-3xl font-bold">{bySeverity[sev] ?? 0}</p>
            </div>
          ))}
          <div className="col-span-2 rounded-xl border border-slate-800 bg-slate-900/40 p-4 md:col-span-1">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Last scan</p>
            {latest ? (
              <>
                <div className="mt-2">
                  <Pill className={STATUS_STYLE[latest.status] ?? STATUS_STYLE.running}>
                    {latest.status.replace("_", " ")}
                  </Pill>
                </div>
                <p className="mt-2 text-xs text-slate-400">{fmt(latest.finished_at ?? latest.started_at)}</p>
                <p className="text-xs text-slate-500">{stats.total_scans} scans total</p>
              </>
            ) : (
              <p className="mt-2 text-sm text-slate-500">No scans yet</p>
            )}
          </div>
        </div>

        <Section title="Current drift (latest scan)">
          {findings.length === 0 ? (
            <p className="text-sm text-emerald-300">No drift. Live infrastructure matches Git.</p>
          ) : (
            <div className="space-y-3">
              {findings.map((f) => (
                <Finding key={f.id} f={f} />
              ))}
            </div>
          )}
        </Section>

        <Section title="Findings per scan">
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                <XAxis dataKey="name" stroke="#64748b" fontSize={12} />
                <YAxis allowDecimals={false} stroke="#64748b" fontSize={12} />
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155" }} />
                <Area type="monotone" dataKey="findings" stroke="#818cf8" fill="#6366f1" fillOpacity={0.3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Section>

        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Scan history">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-slate-500">
                  <tr>
                    <th className="pb-2">#</th>
                    <th className="pb-2">When</th>
                    <th className="pb-2">Trigger</th>
                    <th className="pb-2">Status</th>
                    <th className="pb-2">Findings</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {scans.map((s) => (
                    <tr key={s.id}>
                      <td className="py-2 text-slate-400">{s.id}</td>
                      <td className="py-2 text-slate-300">{fmt(s.started_at)}</td>
                      <td className="py-2 text-slate-400">{s.trigger}</td>
                      <td className="py-2">
                        <Pill className={STATUS_STYLE[s.status] ?? STATUS_STYLE.running}>
                          {s.status.replace("_", " ")}
                        </Pill>
                      </td>
                      <td className="py-2 text-slate-300">{s.total_findings}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Recent alerts">
            {alerts.length === 0 ? (
              <p className="text-sm text-slate-500">No alerts yet.</p>
            ) : (
              <ul className="space-y-3">
                {alerts.map((a) => (
                  <li key={a.id} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Pill className="bg-slate-700/40 text-slate-300 ring-slate-600/60">
                          {a.kind.replace("_", " ")}
                        </Pill>
                        {a.severity && <Pill className={STYLE[a.severity].badge}>{a.severity}</Pill>}
                      </div>
                      <span className="text-xs text-slate-500">
                        {a.channel} · {a.status}
                      </span>
                    </div>
                    <p className="mt-2 whitespace-pre-line text-xs text-slate-400">
                      {a.message.replace(/:[a-z_]+:/g, "").replace(/[*`]/g, "").trim()}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">{fmt(a.sent_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}