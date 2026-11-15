import hashlib
import json
import logging
import urllib.request

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import ALERT_MIN_SEVERITY, SLACK_WEBHOOK_URL
from app.db.models import Alert, Scan
from app.engine.analyzer import ORDER

log = logging.getLogger("drift.alerts")

ICON = {"critical": ":red_circle:", "high": ":large_orange_circle:",
        "medium": ":large_yellow_circle:", "low": ":large_blue_circle:"}


def _collect(scan) -> dict:
    """fingerprint -> (finding, change) for every change in a scan."""
    out = {}
    for f in scan.findings:
        for c in f.changes:
            raw = json.dumps([f.address, c["path"], c["kind"], c.get("live"), c.get("desired")],
                             sort_keys=True, default=str)
            out[hashlib.sha256(raw.encode()).hexdigest()[:16]] = (f, c)
    return out


def _send(db: Session, scan, kind: str, severity: str | None, message: str):
    log.warning("ALERT [%s] %s", kind, message.replace("\n", " | "))
    channel, status = "log", "logged"
    if SLACK_WEBHOOK_URL:
        channel = "slack"
        try:
            req = urllib.request.Request(
                SLACK_WEBHOOK_URL,
                data=json.dumps({"text": message}).encode(),
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                status = "sent" if resp.status == 200 else "failed"
        except Exception as e:
            status = "failed"
            log.error("Slack send failed: %s", e)
    db.add(Alert(scan_id=scan.id, kind=kind, severity=severity,
                 channel=channel, message=message, status=status))
    db.commit()


def process_alerts(db: Session, scan: Scan):
    if scan.status == "error":
        _send(db, scan, "scan_error", None,
              f":x: *Drift scan #{scan.id} failed*\n{(scan.error or 'unknown error')[:300]}")
        return

    prev = db.scalars(
        select(Scan)
        .where(Scan.id < scan.id, Scan.status.in_(["clean", "drift_detected"]))
        .order_by(Scan.id.desc()).limit(1)
    ).first()

    current = _collect(scan)
    previous = _collect(prev) if prev else {}
    min_rank = ORDER.get(ALERT_MIN_SEVERITY, 3)

    new = [(f, c) for fp, (f, c) in current.items()
           if fp not in previous and ORDER[c["severity"]] >= min_rank]
    resolved = [(f, c) for fp, (f, c) in previous.items()
                if fp not in current and ORDER[c["severity"]] >= min_rank]

    if new:
        new.sort(key=lambda fc: -ORDER[fc[1]["severity"]])
        lines = [f"{ICON[c['severity']]} *{c['severity'].upper()}* `{f.address}` - {c['description']}"
                 for f, c in new]
        _send(db, scan, "new_drift", new[0][1]["severity"],
              f":rotating_light: *Infrastructure drift detected* (scan #{scan.id})\n" + "\n".join(lines))

    if resolved:
        _send(db, scan, "resolved", None,
              f":white_check_mark: *{len(resolved)} drift item(s) resolved* (scan #{scan.id})")