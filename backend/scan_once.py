from app.detectors.terraform import run_terraform_scan
from app.engine.analyzer import analyze, describe, load_policy

scan = run_terraform_scan(r"..\infra-repo")
print("Scan status:", scan.status)

if scan.status == "error":
    print(scan.error)
    raise SystemExit(1)

policy = load_policy(r"..\policies\rules.yaml")
findings = analyze(scan, policy)

if not findings:
    print("No drift found.")

for f in findings:
    print(f"\n[{f.severity.upper()}] {f.address}  ({f.origin})")
    for c in f.changes:
        print(f"   - [{c.severity}] {describe(c)}")
        print(f"       rule: {c.rule}")