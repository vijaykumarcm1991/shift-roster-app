from sqlalchemy import String
from sqlalchemy import Column, Integer, Date, ForeignKey, TIMESTAMP
from sqlalchemy.sql import func
from app.database.connection import Base

class Roster(Base):
    __tablename__ = "rosters"

    id = Column(Integer, primary_key=True, index=True)
    month = Column(Integer)
    year = Column(Integer)
    status = Column(String(10), default="DRAFT")
    created_at = Column(TIMESTAMP, server_default=func.now())