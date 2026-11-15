import json
import shutil
import subprocess
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class DriftItem:
    address: str            # e.g. aws_security_group.web
    resource_type: str      # e.g. aws_security_group
    actions: list           # e.g. ["update"]
    before: dict | None
    after: dict | None
    source: str             # "drift" = changed outside Terraform, "config" = code differs from live


@dataclass
class ScanResult:
    status: str             # clean | drift_detected | error
    exit_code: int
    items: list = field(default_factory=list)
    error: str | None = None


def _run(cmd: list, cwd: Path) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)


def run_terraform_scan(repo_path: str) -> ScanResult:
    cwd = Path(repo_path).resolve()
    tf = shutil.which("terraform")
    if not tf:
        return ScanResult("error", -1, error="terraform not found on PATH")

    plan_file = "tfplan"
    plan = _run(
        [tf, "plan", "-detailed-exitcode", "-input=false", "-no-color", f"-out={plan_file}"],
        cwd,
    )

    # Terraform exit codes: 0 = no changes, 1 = error, 2 = changes (drift)
    if plan.returncode == 1:
        return ScanResult("error", 1, error=plan.stderr.strip() or plan.stdout.strip())
    if plan.returncode == 0:
        return ScanResult("clean", 0)

    show = _run([tf, "show", "-json", plan_file], cwd)
    if show.returncode != 0:
        return ScanResult("error", show.returncode, error=show.stderr.strip())

    data = json.loads(show.stdout)
    items: list[DriftItem] = []

    # 1) Changes made outside Terraform (manual edits)
    for rc in data.get("resource_drift", []):
        ch = rc["change"]
        items.append(DriftItem(
            address=rc["address"], resource_type=rc["type"],
            actions=ch["actions"], before=ch.get("before"), after=ch.get("after"),
            source="drift",
        ))

    # 2) What Terraform would change to match the code
    for rc in data.get("resource_changes", []):
        ch = rc["change"]
        if ch["actions"] in (["no-op"], ["read"]):
            continue
        items.append(DriftItem(
            address=rc["address"], resource_type=rc["type"],
            actions=ch["actions"], before=ch.get("before"), after=ch.get("after"),
            source="config",
        ))

    # clean up the saved plan file
    (cwd / plan_file).unlink(missing_ok=True)

    return ScanResult("drift_detected", 2, items=items)