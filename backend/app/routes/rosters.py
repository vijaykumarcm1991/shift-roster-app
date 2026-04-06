from urllib import response
from app.models import roster
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from datetime import date, timedelta
import calendar
from app.database.connection import SessionLocal
from app.models.roster import Roster
from app.models.roster_entry import RosterEntry
from app.models.employee import Employee
from app.models.shift import Shift
from jose import JWTError, jwt
from datetime import datetime, timedelta
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel

router = APIRouter()

SECRET_KEY = "3d060a63c0cce15bd05d6d3c91b79867ee31caeaeba4b8abd3e4cb97d4eecd32"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

security = HTTPBearer()

class EmployeeCreate(BaseModel):
    name: str
    team: str

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"exp": expire})

    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

from pydantic import BaseModel

class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
def login(data: LoginRequest):

    if data.username == "admin" and data.password == "admin123":

        token = create_access_token({"sub": data.username})

        return {
            "access_token": token,
            "token_type": "bearer"
        }

    raise HTTPException(status_code=401, detail="Invalid credentials")

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):

    token = credentials.credentials

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload

    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

@router.post("/rosters")
def create_roster(month: int, year: int, db: Session = Depends(get_db), user=Depends(verify_token)):

    # ❌ prevent duplicate roster
    existing = db.query(Roster).filter(
        Roster.month == month,
        Roster.year == year
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail="Roster already exists")

    # create roster record
    roster = Roster(month=month, year=year)
    db.add(roster)
    db.commit()
    db.refresh(roster)

    employees = db.query(Employee).filter(Employee.status == "active").all()

    days_in_month = calendar.monthrange(year, month)[1]

    start_date = date(year, month, 1)

    entries = []

    for emp in employees:
        for i in range(days_in_month):
            roster_date = start_date + timedelta(days=i)

            entry = RosterEntry(
                roster_id=roster.id,
                employee_id=emp.id,
                date=roster_date,
                shift_id=None
            )

            entries.append(entry)

    db.bulk_save_objects(entries)
    db.commit()

    return {
        "message": "Roster created successfully",
        "roster_id": roster.id,
        "total_entries": len(entries)
    }

@router.get("/roster")
def get_roster(month: int, year: int, db: Session = Depends(get_db)):

    roster = db.query(Roster).filter(
        Roster.month == int(month),
        Roster.year == int(year)
    ).order_by(Roster.id.desc()).first()

    if not roster:
        return {"message": "Roster not found"}

    entries = db.query(RosterEntry).filter_by(roster_id=roster.id).all()

    result = {}

    for entry in entries:
        emp_id = entry.employee_id

        # Initialize employee
        if emp_id not in result:
            employee = db.query(Employee).filter_by(id=emp_id).first()
            result[emp_id] = {
                "employee_id": emp_id,
                "employee_name": employee.name,
                "team": employee.team,
                "shifts": {}
            }

        # Get shift code
        shift_code = None
        if entry.shift_id:
            shift = db.query(Shift).filter_by(id=entry.shift_id).first()
            shift_code = shift.shift_code

        # IMPORTANT: add shift (DON’T overwrite)
        result[emp_id]["shifts"][str(entry.date)] = shift_code
    
    response = list(result.values())

    for item in response:
        item["status"] = roster.status  # ✅ ADD

    return response

@router.put("/roster-entry")
def update_roster_entry(
    employee_id: int,
    date: str,
    shift_code: str,
    db: Session = Depends(get_db),
    user=Depends(verify_token)
):
    from app.models.shift import Shift
    from datetime import datetime

    # Convert date string to date object
    roster_date = datetime.strptime(date, "%Y-%m-%d").date()

    # Get shift
    shift = db.query(Shift).filter_by(shift_code=shift_code).first()

    if not shift:
        return {"error": "Invalid shift code"}

    # Find roster entry
    entry = db.query(RosterEntry).filter_by(
        employee_id=employee_id,
        date=roster_date
    ).first()

    if not entry:
        return {"error": "Roster entry not found"}

    # Update shift
    entry.shift_id = shift.id

    db.commit()

    return {"message": "Shift updated successfully"}

@router.post("/roster/bulk-update")
def bulk_update_roster(
    employee_id: int,
    start_date: str,
    end_date: str,
    shift_code: str,
    db: Session = Depends(get_db),
    user=Depends(verify_token)
):
    from app.models.shift import Shift
    from datetime import datetime, timedelta

    start = datetime.strptime(start_date, "%Y-%m-%d").date()
    end = datetime.strptime(end_date, "%Y-%m-%d").date()

    shift = db.query(Shift).filter_by(shift_code=shift_code).first()

    if not shift:
        return {"error": "Invalid shift code"}

    updated_count = 0

    current = start
    while current <= end:

        entry = db.query(RosterEntry).filter_by(
            employee_id=employee_id,
            date=current
        ).first()

        if entry:
            entry.shift_id = shift.id
            updated_count += 1

        current += timedelta(days=1)

    db.commit()

    return {
        "message": "Bulk update successful",
        "updated_records": updated_count
    }

@router.post("/roster/copy-week")
def copy_week(
    employee_id: int,
    source_start_date: str,
    target_start_date: str,
    db: Session = Depends(get_db)
):
    from datetime import datetime, timedelta

    source_start = datetime.strptime(source_start_date, "%Y-%m-%d").date()
    target_start = datetime.strptime(target_start_date, "%Y-%m-%d").date()

    for i in range(7):
        source_date = source_start + timedelta(days=i)
        target_date = target_start + timedelta(days=i)

        source_entry = db.query(RosterEntry).filter_by(
            employee_id=employee_id,
            date=source_date
        ).first()

        target_entry = db.query(RosterEntry).filter_by(
            employee_id=employee_id,
            date=target_date
        ).first()

        if source_entry and target_entry:
            target_entry.shift_id = source_entry.shift_id

    db.commit()

    return {"message": "Week copied successfully"}

@router.get("/roster/summary")
def roster_summary(date: str, db: Session = Depends(get_db)):
    from datetime import datetime
    from app.models.shift import Shift

    target_date = datetime.strptime(date, "%Y-%m-%d").date()

    entries = db.query(RosterEntry).filter_by(date=target_date).all()

    summary = {}

    for entry in entries:
        if entry.shift_id:
            shift = db.query(Shift).filter_by(id=entry.shift_id).first()
            shift_code = shift.shift_code
        else:
            shift_code = "UNASSIGNED"

        if shift_code not in summary:
            summary[shift_code] = 0

        summary[shift_code] += 1

    return {
        "date": date,
        "summary": sorted(summary.items())
    }

@router.put("/roster/finalize")
def finalize_roster(month: int, year: int, db: Session = Depends(get_db), user=Depends(verify_token)):

    roster = db.query(Roster).filter(
        Roster.month == month,
        Roster.year == year
    ).order_by(Roster.id.desc()).first()

    if not roster:
        return {"error": "Roster not found"}

    roster.status = "FINAL"

    db.commit()

    return {"message": "Roster finalized"}

@router.post("/employees")
def add_employee(
    data: dict,
    db: Session = Depends(get_db),
    user=Depends(verify_token)
):
    name = data.get("name")
    team = data.get("team")

    if not name or not team:
        raise HTTPException(status_code=400, detail="Name and team required")

    emp = Employee(
        name=name,
        team=team,
        status="active"
    )

    db.add(emp)
    db.commit()
    db.refresh(emp)

    # 👉 ADD THIS BLOCK

    # get latest roster
    latest_roster = db.query(Roster).order_by(Roster.id.desc()).first()

    if latest_roster:
        import calendar
        from datetime import date, timedelta

        days_in_month = calendar.monthrange(latest_roster.year, latest_roster.month)[1]
        start_date = date(latest_roster.year, latest_roster.month, 1)

        entries = []

        for i in range(days_in_month):
            roster_date = start_date + timedelta(days=i)

            entry = RosterEntry(
                roster_id=latest_roster.id,
                employee_id=emp.id,
                date=roster_date,
                shift_id=None
            )
            entries.append(entry)

        db.bulk_save_objects(entries)
        db.commit()

    return {"message": "Employee added", "id": emp.id}

@router.delete("/employees/{emp_id}")
def delete_employee(
    emp_id: int,
    db: Session = Depends(get_db),
    user=Depends(verify_token)
):
    emp = db.query(Employee).filter(Employee.id == emp_id).first()

    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    emp.status = "inactive"  # ✅ soft delete
    db.commit()

    return {"message": "Employee removed"}

@router.get("/employees")
def get_employees(db: Session = Depends(get_db)):

    employees = db.query(Employee).filter(Employee.status == "active").all()

    return [
        {
            "id": emp.id,
            "name": emp.name,
            "team": emp.team
        }
        for emp in employees
    ]