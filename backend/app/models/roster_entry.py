from sqlalchemy import Column, Integer, Date, ForeignKey, TIMESTAMP
from sqlalchemy.sql import func
from app.database.connection import Base

class RosterEntry(Base):
    __tablename__ = "roster_entries"

    id = Column(Integer, primary_key=True, index=True)
    roster_id = Column(Integer, ForeignKey("rosters.id"))
    employee_id = Column(Integer, ForeignKey("employees.id"))
    date = Column(Date)
    shift_id = Column(Integer, ForeignKey("shifts.id"), nullable=True)
    updated_at = Column(TIMESTAMP, server_default=func.now())