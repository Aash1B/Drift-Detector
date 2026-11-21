from app.engine.diff import diff_resource, normalize


def rule(port, cidr="0.0.0.0/0", desc=""):
    return {
        "from_port": port, "to_port": port, "protocol": "tcp",
        "cidr_blocks": [cidr], "description": desc, "ipv6_cidr_blocks": [],
        "prefix_list_ids": [], "security_groups": [], "self": False,
    }


def test_normalize_treats_empty_values_as_nothing():
    assert normalize({"a": None, "b": "", "c": [], "d": {}, "e": 1}) == {"e": 1}


def test_tag_change_is_one_changed_item():
    live = {"tags": {"Environment": "pod", "Owner": "x"}}
    desired = {"tags": {"Environment": "dev", "Owner": "x"}}
    changes = diff_resource(live, desired, ["update"], [])
    assert len(changes) == 1
    c = changes[0]
    assert (c.path, c.kind, c.live, c.desired) == ("tags.Environment", "changed", "pod", "dev")


def test_extra_rule_in_live_is_reported():
    live = {"ingress": [rule(22), rule(443)]}
    desired = {"ingress": [rule(443)]}
    changes = diff_resource(live, desired, ["update"], [])
    assert len(changes) == 1
    assert changes[0].kind == "extra_in_live"
    assert changes[0].live["from_port"] == 22


def test_rule_missing_in_live_is_reported():
    live = {"ingress": [rule(443)]}
    desired = {"ingress": [rule(443), rule(8080)]}
    changes = diff_resource(live, desired, ["update"], [])
    assert len(changes) == 1
    assert changes[0].kind == "missing_in_live"
    assert changes[0].desired["from_port"] == 8080


def test_reordered_rules_are_not_drift():
    live = {"ingress": [rule(22), rule(443)]}
    desired = {"ingress": [rule(443), rule(22)]}
    assert diff_resource(live, desired, ["update"], []) == []


def test_empty_description_versus_null_is_not_drift():
    live = {"ingress": [rule(443, desc="")]}
    desired = {"ingress": [rule(443, desc=None)]}
    assert diff_resource(live, desired, ["update"], []) == []


def test_ignored_paths_are_skipped():
    live = {"tags_all": {"a": "1"}, "x": 1}
    desired = {"tags_all": {"a": "2"}, "x": 1}
    assert diff_resource(live, desired, ["update"], ["tags_all*"]) == []


def test_resource_missing_in_aws():
    changes = diff_resource(None, {"x": 1}, ["create"], [])
    assert len(changes) == 1
    assert (changes[0].path, changes[0].kind) == ("(resource)", "missing_in_live")


def test_resource_not_in_code():
    changes = diff_resource({"x": 1}, None, ["delete"], [])
    assert len(changes) == 1
    assert (changes[0].path, changes[0].kind) == ("(resource)", "extra_in_live")