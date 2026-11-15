import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]      # drift-detector/
load_dotenv(ROOT / ".env")

DATABASE_URL = os.environ["DATABASE_URL"]
INFRA_PATH = str(ROOT / "infra-repo")
POLICY_PATH = str(ROOT / "policies" / "rules.yaml")

SCAN_INTERVAL_MINUTES = int(os.getenv("SCAN_INTERVAL_MINUTES", "15"))   # 0 = scheduler off
SLACK_WEBHOOK_URL = os.getenv("SLACK_WEBHOOK_URL", "").strip()
ALERT_MIN_SEVERITY = os.getenv("ALERT_MIN_SEVERITY", "high").lower()