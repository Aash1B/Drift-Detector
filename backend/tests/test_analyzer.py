from pathlib import Path

from app.detectors.terraform import DriftItem, ScanResult
from app.engine.analyzer import analyze, load_policy, rate_change
from app.engine.diff import Change

POLICY = load_policy(str(Path(__file__).resolve().parents[2] / "policies" / "rules.yaml"))


def rule(port, desc=""):
    return {
        "from_port": port, "to_port": port, "protocol": "tcp",
        "cidr_blocks": ["0.0.0.0/0"], "description": desc, "ipv6_cidr_blocks": [],
        "prefix_list_ids": [], "security_groups": [], "self": False,
    }


def test_ssh_open_to_internet_is_critical():
    c = Change("ingress", "extra_in_live", rule(22), None)
    assert rate_change(c, "aws_security_group", POLICY) == (
        "critical", "Sensitive port opened to the internet")


def test_other_new_port_is_high():
    c = Change("ingress", "extra_in_live", rule(8080), None)
    assert rate_change(c, "aws_security_group", POLICY) == (
        "high", "New inbound rule added outside Git")


def test_removed_rule_is_medium():
    c = Change("ingress", "missing_in_live", None, rule(443))
    assert rate_change(c, "aws_security_group", POLICY) == (
        "medium", "Inbound rule removed outside Git")


def test_tag_change_is_low():
    c = Change("tags.Environment", "changed", "pod", "dev")
    assert rate_change(c, "aws_s3_bucket", POLICY) == ("low", "Tag changed")


def test_unknown_field_gets_default_severity():
    c = Change("some_setting", "changed", "a", "b")
    assert rate_change(c, "aws_s3_bucket", POLICY) == ("medium", "default")


def test_deleted_resource_is_high():
    c = Change("(resource)", "extra_in_live", "exists in AWS but is not in code", None)
    assert rate_change(c, "aws_s3_bucket", POLICY) == ("high", "Resource deleted or unmanaged")


def test_manual_ssh_drift_creates_one_critical_finding():
    live = {"name": "web", "ingress": [rule(22), rule(443)]}
    desired = {"name": "web", "ingress": [rule(443)]}
    items = [
        DriftItem("aws_security_group.web", "aws_security_group", ["update"], {}, {}, "drift"),
        DriftItem("aws_security_group.web", "aws_security_group", ["update"], live, desired, "config"),
    ]
    findings = analyze(ScanResult("drift_detected", 2, items=items), POLICY)
    assert len(findings) == 1
    assert findings[0].severity == "critical"
    assert findings[0].origin == "manual_change"


def test_code_change_without_manual_drift_is_labelled_code_change():
    live = {"tags": {"Environment": "dev"}}
    desired = {"tags": {"Environment": "prod"}}
    items = [DriftItem("aws_s3_bucket.demo", "aws_s3_bucket", ["update"], live, desired, "config")]
    findings = analyze(ScanResult("drift_detected", 2, items=items), POLICY)
    assert len(findings) == 1
    assert findings[0].origin == "code_change"
    assert findings[0].severity == "low"


def test_noise_only_plan_produces_no_findings():
    live = {"ingress": [rule(443, desc="")]}
    desired = {"ingress": [rule(443, desc=None)]}
    items = [DriftItem("aws_security_group.web", "aws_security_group", ["update"], live, desired, "config")]
    assert analyze(ScanResult("drift_detected", 2, items=items), POLICY) == []