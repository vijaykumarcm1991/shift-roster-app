from sqlalchemy import Column, Integer, String, TIMESTAMP
from sqlalchemy.sql import func
from app.database.connection import Base

class AdminUser(Base):
    __tablename__ = "admin_users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True)
    password = Column(String)
    status = Column(String, default="active")
    created_at = Column(TIMESTAMP, server_default=func.now())