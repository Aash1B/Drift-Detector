import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]      # drift-detector/
load_dotenv(ROOT / ".env")

DATABASE_URL = os.environ["DATABASE_URL"]
INFRA_PATH = str(ROOT / "infra-repo")
POLICY_PATH = str(ROOT / "policies" / "rules.yaml")