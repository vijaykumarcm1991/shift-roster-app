from sqlalchemy import Column, Integer, String
from app.database.connection import Base

class Employee(Base):
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    team = Column(String)
    status = Column(String)