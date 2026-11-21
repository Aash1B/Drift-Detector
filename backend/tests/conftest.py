import os

# The app reads DATABASE_URL at import time. Tests never connect to the database.
os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://ci:ci@localhost:5432/ci")