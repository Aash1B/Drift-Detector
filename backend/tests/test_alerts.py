from types import SimpleNamespace

from app.services.alert_service import _collect


def change(path="ingress", kind="extra_in_live", live=None, desired=None):
    return {"path": path, "kind": kind, "live": live, "desired": desired,
            "severity": "critical", "description": "x"}


def make_scan(*changes):
    finding = SimpleNamespace(address="aws_security_group.web", changes=list(changes))
    return SimpleNamespace(findings=[finding])


def test_same_change_has_same_fingerprint():
    a = _collect(make_scan(change(live={"from_port": 22})))
    b = _collect(make_scan(change(live={"from_port": 22})))
    assert set(a) == set(b)


def test_changed_value_has_different_fingerprint():
    a = _collect(make_scan(change(live={"from_port": 22})))
    b = _collect(make_scan(change(live={"from_port": 23})))
    assert set(a) != set(b)


def test_new_and_resolved_are_found_by_set_difference():
    c1 = change(live={"from_port": 22})
    c2 = change(live={"from_port": 3389})
    before = _collect(make_scan(c1))
    after = _collect(make_scan(c1, c2))
    assert len(set(after) - set(before)) == 1      # new drift
    assert set(before) - set(after) == set()       # nothing resolved
    assert len(set(before) - set(_collect(make_scan()))) == 1   # c1 disappears -> resolved