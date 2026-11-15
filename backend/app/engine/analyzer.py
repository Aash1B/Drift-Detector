import fnmatch
import json
from dataclasses import dataclass, field

import yaml

from app.engine.diff import Change, diff_resource

ORDER = {"low": 1, "medium": 2, "high": 3, "critical": 4}


@dataclass
class Finding:
    address: str
    resource_type: str
    origin: str                  # manual_change | code_change
    severity: str
    changes: list = field(default_factory=list)


def load_policy(path: str) -> dict:
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def _item_matches(item, spec: dict) -> bool:
    if not isinstance(item, dict):
        return False
    for key, expected in spec.items():
        if key.endswith("_contains"):
            if expected not in (item.get(key[: -len("_contains")]) or []):
                return False
        else:
            allowed = expected if isinstance(expected, list) else [expected]
            if item.get(key) not in allowed:
                return False
    return True


def _rule_matches(rule: dict, rtype: str, change: Change) -> bool:
    if not fnmatch.fnmatchcase(rtype, rule.get("resource_type", "*")):
        return False
    paths = rule.get("path", "*")
    paths = paths if isinstance(paths, list) else [paths]
    if not any(fnmatch.fnmatchcase(change.path, p) for p in paths):
        return False
    if "kind" in rule and rule["kind"] != change.kind:
        return False
    if "item_match" in rule:
        item = change.live if change.kind == "extra_in_live" else change.desired
        if not _item_matches(item, rule["item_match"]):
            return False
    return True


def rate_change(change: Change, rtype: str, policy: dict):
    matches = [r for r in policy.get("rules", []) if _rule_matches(r, rtype, change)]
    if not matches:
        return policy.get("default_severity", "medium"), "default"
    best = max(matches, key=lambda r: ORDER[r["severity"]])
    return best["severity"], best["name"]


def analyze(scan, policy: dict) -> list:
    manual = {i.address for i in scan.items if i.source == "drift"}
    findings = []
    for it in scan.items:
        if it.source != "config":
            continue
        changes = diff_resource(it.before, it.after, it.actions,
                                policy.get("ignore_paths", []))
        if not changes:
            continue
        for c in changes:
            c.severity, c.rule = rate_change(c, it.resource_type, policy)
        top = max(changes, key=lambda c: ORDER[c.severity]).severity
        origin = "manual_change" if it.address in manual else "code_change"
        findings.append(Finding(it.address, it.resource_type, origin, top, changes))
    return sorted(findings, key=lambda f: -ORDER[f.severity])


def _short(v) -> str:
    if isinstance(v, dict) and "from_port" in v:
        return (f"{v.get('protocol')} {v.get('from_port')}-{v.get('to_port')} "
                f"from {', '.join(v.get('cidr_blocks', []))}")
    return v if isinstance(v, str) else json.dumps(v, sort_keys=True)


def describe(c: Change) -> str:
    if c.kind == "changed":
        return f"{c.path}: code says {c.desired!r}, AWS has {c.live!r}"
    if c.kind == "extra_in_live":
        return f"{c.path}: in AWS but not in code -> {_short(c.live)}"
    return f"{c.path}: in code but missing in AWS -> {_short(c.desired)}"