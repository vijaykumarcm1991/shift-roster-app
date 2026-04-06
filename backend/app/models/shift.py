from sqlalchemy import Column, Integer, String, Time
from app.database.connection import Base

class Shift(Base):
    __tablename__ = "shifts"

    id = Column(Integer, primary_key=True, index=True)
    shift_code = Column(String)
    shift_name = Column(String)
    start_time = Column(Time, nullable=True)
    end_time = Column(Time, nullable=True)
    color = Column(String, nullable=True)