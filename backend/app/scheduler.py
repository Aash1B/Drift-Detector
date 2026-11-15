import logging

from apscheduler.schedulers.background import BackgroundScheduler

from app.config import SCAN_INTERVAL_MINUTES
from app.db.session import SessionLocal
from app.services.scan_service import run_scan

log = logging.getLogger("drift.scheduler")
scheduler = BackgroundScheduler()


def _job():
    db = SessionLocal()
    try:
        scan = run_scan(db, trigger="scheduled")
        log.info("Scheduled scan #%s finished: %s (%s findings)",
                 scan.id, scan.status, scan.total_findings)
    except Exception:
        log.exception("Scheduled scan crashed")
    finally:
        db.close()


def start_scheduler():
    if SCAN_INTERVAL_MINUTES <= 0:
        log.info("Scheduler disabled (SCAN_INTERVAL_MINUTES=0)")
        return
    scheduler.add_job(_job, "interval", minutes=SCAN_INTERVAL_MINUTES,
                      id="drift-scan", max_instances=1, coalesce=True)
    scheduler.start()
    log.info("Scheduler started: scanning every %s minute(s)", SCAN_INTERVAL_MINUTES)


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown(wait=False)