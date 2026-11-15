import fnmatch
import json
from dataclasses import dataclass


@dataclass
class Change:
    path: str
    kind: str            # changed | extra_in_live | missing_in_live
    live: object         # value currently in AWS
    desired: object      # value in Git/Terraform code
    severity: str = "low"
    rule: str = ""


def _is_empty(v) -> bool:
    return v is None or v == "" or v == [] or v == {}


def normalize(v):
    """Drop empty values so ''/null/[]/{} all count as 'nothing'."""
    if isinstance(v, dict):
        out = {}
        for k, x in v.items():
            nx = normalize(x)
            if not _is_empty(nx):
                out[k] = nx
        return out
    if isinstance(v, list):
        return [nx for nx in (normalize(x) for x in v) if not _is_empty(nx)]
    return v


def _ignored(path: str, patterns: list) -> bool:
    return any(fnmatch.fnmatchcase(path, p) for p in patterns)


def _canon(x) -> str:
    return json.dumps(x, sort_keys=True)


def _dict_or_none(v) -> bool:
    return v is None or isinstance(v, dict)


def _list_or_none(v) -> bool:
    return v is None or isinstance(v, list)


def _walk(live, desired, path, ignore, out):
    if (isinstance(live, dict) or isinstance(desired, dict)) \
            and _dict_or_none(live) and _dict_or_none(desired):
        live, desired = live or {}, desired or {}
        for key in sorted(set(live) | set(desired)):
            sub = f"{path}.{key}" if path else key
            if _ignored(sub, ignore):
                continue
            _walk(live.get(key), desired.get(key), sub, ignore, out)
        return

    if (isinstance(live, list) or isinstance(desired, list)) \
            and _list_or_none(live) and _list_or_none(desired):
        lmap = {_canon(x): x for x in (live or [])}
        dmap = {_canon(x): x for x in (desired or [])}
        for k in sorted(set(lmap) - set(dmap)):
            out.append(Change(path, "extra_in_live", lmap[k], None))
        for k in sorted(set(dmap) - set(lmap)):
            out.append(Change(path, "missing_in_live", None, dmap[k]))
        return

    if live != desired:
        out.append(Change(path, "changed", live, desired))


def diff_resource(before, after, actions: list, ignore: list) -> list:
    """before = live state, after = desired state from code."""
    if "create" in actions and before is None:
        return [Change("(resource)", "missing_in_live", None,
                       "defined in code but does not exist in AWS")]
    if "delete" in actions and after is None:
        return [Change("(resource)", "extra_in_live",
                       "exists in AWS but is not in code", None)]
    out: list = []
    _walk(normalize(before), normalize(after), "", ignore, out)
    return out