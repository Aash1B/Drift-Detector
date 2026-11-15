from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


def utcnow():
    return datetime.now(timezone.utc)


class Scan(Base):
    __tablename__ = "scans"

    id: Mapped[int] = mapped_column(primary_key=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    commit_sha: Mapped[str | None] = mapped_column(String(40))
    trigger: Mapped[str] = mapped_column(String(20), default="manual")
    status: Mapped[str] = mapped_column(String(20))        # running | clean | drift_detected | error
    total_findings: Mapped[int] = mapped_column(Integer, default=0)
    highest_severity: Mapped[str | None] = mapped_column(String(10))
    error: Mapped[str | None] = mapped_column(Text)

    findings: Mapped[list["FindingRow"]] = relationship(
        back_populates="scan", cascade="all, delete-orphan", order_by="FindingRow.id"
    )


class FindingRow(Base):
    __tablename__ = "findings"

    id: Mapped[int] = mapped_column(primary_key=True)
    scan_id: Mapped[int] = mapped_column(ForeignKey("scans.id", ondelete="CASCADE"), index=True)
    address: Mapped[str] = mapped_column(String(255))
    resource_type: Mapped[str] = mapped_column(String(100))
    origin: Mapped[str] = mapped_column(String(20))        # manual_change | code_change
    severity: Mapped[str] = mapped_column(String(10), index=True)
    changes: Mapped[list] = mapped_column(JSONB)
    detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    scan: Mapped["Scan"] = relationship(back_populates="findings")