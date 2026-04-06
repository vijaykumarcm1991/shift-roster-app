from sqlalchemy import Column, Integer, Date, ForeignKey, DateTime, String
from datetime import datetime
from app.database.connection import Base

class RosterEntry(Base):
    __tablename__ = "roster_entries"

    id = Column(Integer, primary_key=True, index=True)
    roster_id = Column(Integer, ForeignKey("rosters.id"))
    employee_id = Column(Integer, ForeignKey("employees.id"))
    date = Column(Date)
    shift_id = Column(Integer, ForeignKey("shifts.id"), nullable=True)

    updated_at = Column(DateTime, default=datetime.utcnow)

    # ✅ CLEAN COMMENT COLUMN
    comment = Column(String, nullable=True)