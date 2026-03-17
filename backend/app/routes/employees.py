from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database.connection import SessionLocal
from app.models.employee import Employee

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("/employees")
def create_employee(name: str, team: str, db: Session = Depends(get_db)):
    employee = Employee(name=name, team=team, status="active")
    db.add(employee)
    db.commit()
    db.refresh(employee)
    return employee


@router.get("/employees")
def get_employees(db: Session = Depends(get_db)):
    return db.query(Employee).all()