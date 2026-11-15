import json
from dataclasses import asdict

from app.detectors.terraform import run_terraform_scan

result = run_terraform_scan(r"..\infra-repo")
print(json.dumps(asdict(result), indent=2, default=str))