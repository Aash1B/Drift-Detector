import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import Alert, FindingRow, Scan
from app.db.session import Base, engine, get_db
from app.scheduler import start_scheduler, stop_scheduler
from app.services.scan_service import run_scan

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(engine)    # creates tables on first start
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(title="Drift Detector API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def finding_out(f: FindingRow) -> dict:
    return {
        "id": f.id, "scan_id": f.scan_id, "address": f.address,
        "resource_type": f.resource_type, "origin": f.origin,
        "severity": f.severity, "changes": f.changes,
        "detected_at": f.detected_at,
    }


def scan_out(s: Scan, with_findings: bool = False) -> dict:
    d = {
        "id": s.id, "started_at": s.started_at, "finished_at": s.finished_at,
        "commit_sha": s.commit_sha, "trigger": s.trigger, "status": s.status,
        "total_findings": s.total_findings, "highest_severity": s.highest_severity,
        "error": s.error,
    }
    if with_findings:
        d["findings"] = [finding_out(f) for f in s.findings]
    return d


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/scans")
def trigger_scan(db: Session = Depends(get_db)):
    """Runs a drift scan now (takes ~10-20 seconds) and stores the result."""
    return scan_out(run_scan(db, trigger="manual"), with_findings=True)


@app.get("/scans")
def list_scans(limit: int = 50, db: Session = Depends(get_db)):
    rows = db.scalars(select(Scan).order_by(Scan.id.desc()).limit(limit)).all()
    return [scan_out(s) for s in rows]


@app.get("/scans/{scan_id}")
def get_scan(scan_id: int, db: Session = Depends(get_db)):
    s = db.get(Scan, scan_id)
    if not s:
        raise HTTPException(404, "scan not found")
    return scan_out(s, with_findings=True)


@app.get("/findings")
def list_findings(severity: str | None = None, scan_id: int | None = None,
                  db: Session = Depends(get_db)):
    """Findings of one scan (default: the latest scan)."""
    if scan_id is None:
        scan_id = db.scalar(select(func.max(Scan.id)))
    q = select(FindingRow).where(FindingRow.scan_id == scan_id)
    if severity:
        q = q.where(FindingRow.severity == severity)
    return [finding_out(f) for f in db.scalars(q.order_by(FindingRow.id)).all()]


@app.get("/alerts")
def list_alerts(limit: int = 50, db: Session = Depends(get_db)):
    rows = db.scalars(select(Alert).order_by(Alert.id.desc()).limit(limit)).all()
    return [{"id": a.id, "scan_id": a.scan_id, "kind": a.kind, "severity": a.severity,
             "channel": a.channel, "status": a.status, "message": a.message,
             "sent_at": a.sent_at} for a in rows]


@app.get("/stats")
def stats(db: Session = Depends(get_db)):
    latest = db.scalars(select(Scan).order_by(Scan.id.desc()).limit(1)).first()
    by_severity = {}
    if latest:
        rows = db.execute(
            select(FindingRow.severity, func.count())
            .where(FindingRow.scan_id == latest.id)
            .group_by(FindingRow.severity)
        ).all()
        by_severity = {sev: n for sev, n in rows}
    recent = db.scalars(select(Scan).order_by(Scan.id.desc()).limit(20)).all()
    return {
        "total_scans": db.scalar(select(func.count()).select_from(Scan)),
        "latest_scan": scan_out(latest) if latest else None,
        "latest_by_severity": by_severity,
        "trend": [
            {"scan_id": s.id, "at": s.started_at, "findings": s.total_findings}
            for s in reversed(recent)
        ],
    }