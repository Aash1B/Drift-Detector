import subprocess
import threading
from dataclasses import asdict

from sqlalchemy.orm import Session

from app.config import INFRA_PATH, POLICY_PATH, ROOT
from app.db.models import FindingRow, Scan, utcnow
from app.detectors.terraform import run_terraform_scan
from app.engine.analyzer import ORDER, analyze, describe, load_policy

_lock = threading.Lock()   # only one terraform scan at a time (state lock + plan file)


def _git_sha() -> str | None:
    try:
        out = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT,
                             capture_output=True, text=True)
        return out.stdout.strip() or None
    except Exception:
        return None


def run_scan(db: Session, trigger: str = "manual") -> Scan:
    scan = Scan(status="running", trigger=trigger, commit_sha=_git_sha())
    db.add(scan)
    db.commit()

    with _lock:
        try:
            result = run_terraform_scan(INFRA_PATH)
            if result.status == "error":
                scan.status = "error"
                scan.error = result.error
            else:
                findings = analyze(result, load_policy(POLICY_PATH))
                for f in findings:
                    changes = []
                    for c in f.changes:
                        d = asdict(c)
                        d["description"] = describe(c)
                        changes.append(d)
                    scan.findings.append(FindingRow(
                        address=f.address, resource_type=f.resource_type,
                        origin=f.origin, severity=f.severity, changes=changes,
                    ))
                scan.total_findings = len(findings)
                scan.status = "drift_detected" if findings else "clean"
                if findings:
                    scan.highest_severity = max(
                        (f.severity for f in findings), key=lambda s: ORDER[s]
                    )
        except Exception as e:          # never leave a scan stuck in "running"
            scan.status = "error"
            scan.error = str(e)

    scan.finished_at = utcnow()
    db.commit()
    db.refresh(scan)
    return scan