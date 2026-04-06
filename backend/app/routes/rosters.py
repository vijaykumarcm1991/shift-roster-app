from urllib import response
from app.models import roster
from app.models.admin_user import AdminUser
from fastapi import APIRouter, Depends, HTTPException
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
from fastapi.responses import StreamingResponse
from io import BytesIO
from openpyxl import Workbook
from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
from passlib.context import CryptContext
from sqlalchemy.exc import ProgrammingError
from sqlalchemy import text
from collections import defaultdict
from openpyxl.comments import Comment

router = APIRouter()

SECRET_KEY = "3d060a63c0cce15bd05d6d3c91b79867ee31caeaeba4b8abd3e4cb97d4eecd32"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

security = HTTPBearer()

class EmployeeCreate(BaseModel):
    name: str
    team: str

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

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

class LoginRequest(BaseModel):
    username: str
    password: str

@router.post("/login")
def login(data: LoginRequest, db: Session = Depends(get_db)):

    # 👉 1. Try DB login (safe)
    try:
        admin = db.query(AdminUser).filter(
            AdminUser.username == data.username,
            AdminUser.status == "active"
        ).first()

        if admin and admin.password and pwd_context.verify(data.password, admin.password):
            token = create_access_token({"sub": data.username})
            return {"access_token": token, "token_type": "bearer"}

    except ProgrammingError:
        db.rollback()  # 🔥 VERY IMPORTANT

    # 👉 2. Fallback (ALWAYS WORKS)
    if data.username == "admin" and data.password == "admin123":
        token = create_access_token({"sub": data.username})
        return {"access_token": token, "token_type": "bearer"}

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
                "shifts": {},
                "comments": {} 
            }

        # Get shift code
        shift_code = None
        if entry.shift_id:
            shift = db.query(Shift).filter_by(id=entry.shift_id).first()
            shift_code = shift.shift_code

        # IMPORTANT: add shift (DON’T overwrite)
        result[emp_id]["shifts"][str(entry.date)] = shift_code
        result[emp_id]["comments"][str(entry.date)] = entry.comment or ""
    
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

    # 👉 GET OLD SHIFT
    old_shift = None
    if entry.shift_id:
        old = db.query(Shift).filter_by(id=entry.shift_id).first()
        old_shift = old.shift_code if old else None

    # 👉 UPDATE SHIFT
    entry.shift_id = shift.id

    # 👉 INSERT AUDIT LOG
    db.execute(text("""
        INSERT INTO audit_logs (employee_id, date, old_shift, new_shift, changed_by)
        VALUES (:emp, :date, :old, :new, :user)
    """), {
        "emp": employee_id,
        "date": roster_date,
        "old": old_shift,
        "new": shift_code,
        "user": user.get("sub")
    })

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
            # old shift
            old_shift = None
            if entry.shift_id:
                old = db.query(Shift).filter_by(id=entry.shift_id).first()
                old_shift = old.shift_code if old else None

            entry.shift_id = shift.id

            # audit log
            db.execute(text("""
                INSERT INTO audit_logs (employee_id, date, old_shift, new_shift, changed_by)
                VALUES (:emp, :date, :old, :new, :user)
            """), {
                "emp": employee_id,
                "date": current,
                "old": old_shift,
                "new": shift_code,
                "user": user.get("sub")
            })

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

@router.get("/roster/export")
def export_roster(month: int, year: int, db: Session = Depends(get_db)):

    roster = db.query(Roster).filter(
        Roster.month == month,
        Roster.year == year
    ).order_by(Roster.id.desc()).first()

    if not roster:
        raise HTTPException(status_code=404, detail="Roster not found")

    entries = db.query(RosterEntry).filter_by(roster_id=roster.id).all()

    result = {}

    for entry in entries:
        emp_id = entry.employee_id

        if emp_id not in result:
            emp = db.query(Employee).filter_by(id=emp_id).first()
            result[emp_id] = {
                "name": emp.name,
                "team": emp.team,
                "shifts": {},
                "comments": {}
            }

        shift_code = None
        if entry.shift_id:
            shift = db.query(Shift).filter_by(id=entry.shift_id).first()
            shift_code = shift.shift_code

        result[emp_id]["shifts"][str(entry.date)] = shift_code
        result[emp_id]["comments"][str(entry.date)] = entry.comment or ""  # ✅ SAFE

    employees = list(result.values())
    dates = sorted(next(iter(result.values()))["shifts"].keys())

    wb = Workbook()
    ws = wb.active
    ws.title = "Roster"

    # Styles
    header_font = Font(bold=True)
    center_align = Alignment(horizontal="center", vertical="center", wrap_text=True)
    thin_border = Border(
        left=Side(style='thin'), right=Side(style='thin'),
        top=Side(style='thin'), bottom=Side(style='thin')
    )

    # Colors
    colors = {
        "S1": "ADD8E6", "S2": "FFDAB9", "S3": "DDA0DD",
        "G": "90EE90", "WO": "D3D3D3",
        "LV": "FFB6C1", "GH": "FFFFE0", "CO": "E0FFFF"
    }

    # =========================
    # HEADER
    # =========================
    headers = ["Employee"]
    weekend_cols = []

    for idx, d in enumerate(dates):
        dt = datetime.strptime(d, "%Y-%m-%d")
        headers.append(f"{dt.strftime('%a')}\n{dt.day}")

        if dt.weekday() >= 5:
            weekend_cols.append(idx + 2)

    headers += [""]
    headers += ["S1","S2","S3","G","WO","CO","GH","LV"]

    ws.append(headers)

    for col_idx, cell in enumerate(ws[1], start=1):
        cell.font = header_font
        cell.alignment = center_align
        cell.border = thin_border

        if col_idx in weekend_cols:
            cell.fill = PatternFill(start_color="FFECEC", end_color="FFECEC", fill_type="solid")

    current_row = 2

    # =========================
    # GROUP BY TEAM
    # =========================
    grouped = defaultdict(list)
    for emp in employees:
        grouped[emp["team"]].append(emp)

    for team, emps in grouped.items():

        ws.cell(row=current_row, column=1, value=team).font = Font(bold=True)
        current_row += 1

        # =========================
        # EMPLOYEE ROWS
        # =========================
        for emp in emps:

            counts = {k:0 for k in ["S1","S2","S3","G","WO","CO","GH","LV"]}
            row = [emp["name"]]

            for d in dates:
                shift = emp["shifts"][d] or "-"
                row.append(shift)

                if shift in counts:
                    counts[shift] += 1

            row += [""]
            row += list(counts.values())

            ws.append(row)

            for col_idx, cell in enumerate(ws[current_row], start=1):

                cell.alignment = center_align
                cell.border = thin_border

                # =========================
                # SHIFT CELLS
                # =========================
                if 1 < col_idx <= len(dates)+1:
                    val = cell.value
                    current_date = dates[col_idx-2]
                    dt = datetime.strptime(current_date, "%Y-%m-%d")

                    # ✅ ADD COMMENT
                    comment_text = emp["comments"].get(current_date)
                    if comment_text:
                        cell.comment = Comment(comment_text, "Admin")

                    # Weekend blank
                    if dt.weekday() >= 5 and val == "-":
                        cell.fill = PatternFill(start_color="FFF5F5", end_color="FFF5F5", fill_type="solid")

                    # Shift colors
                    elif val in colors:
                        cell.fill = PatternFill(start_color=colors[val], end_color=colors[val], fill_type="solid")

                # =========================
                # SUMMARY CELLS
                # =========================
                if col_idx > len(dates)+2:
                    val = cell.value

                    if val > 2:
                        cell.fill = PatternFill(start_color="28A745", end_color="28A745", fill_type="solid")
                        cell.font = Font(color="FFFFFF", bold=True)
                    elif val < 2:
                        cell.fill = PatternFill(start_color="DC3545", end_color="DC3545", fill_type="solid")
                        cell.font = Font(color="FFFFFF", bold=True)

            current_row += 1

        # =========================
        # SPACER + SUMMARY
        # =========================
        ws.append([""] * len(headers))
        current_row += 1

        ws.append(["Shift Summary"] + [""]*(len(headers)-1))
        current_row += 1

        pivot = {
            "S1":{}, "S2":{}, "S3":{}, "G":{},
            "WO":{}, "CO":{}, "GH":{}, "LV":{}
        }

        for d in dates:
            for shift in pivot:
                pivot[shift][d] = 0

        for emp in emps:
            for d in dates:
                shift = emp["shifts"][d]
                if shift in pivot:
                    pivot[shift][d] += 1

        for shift, values in pivot.items():

            row = [shift]
            for d in dates:
                row.append(values[d])

            row += [""] * 9
            ws.append(row)

            for col_idx, cell in enumerate(ws[current_row], start=1):

                cell.alignment = center_align
                cell.border = thin_border

                if 1 < col_idx <= len(dates)+1:
                    val = cell.value

                    if val > 2:
                        cell.fill = PatternFill(start_color="28A745", end_color="28A745", fill_type="solid")
                        cell.font = Font(color="FFFFFF", bold=True)
                    elif val < 2:
                        cell.fill = PatternFill(start_color="DC3545", end_color="DC3545", fill_type="solid")
                        cell.font = Font(color="FFFFFF", bold=True)

            current_row += 1

        current_row += 2

    # =========================
    # AUTO WIDTH
    # =========================
    for col in ws.columns:
        max_length = 0
        col_letter = col[0].column_letter

        for cell in col:
            if cell.value:
                max_length = max(max_length, len(str(cell.value)))

        ws.column_dimensions[col_letter].width = max_length + 2

    ws.freeze_panes = "B2"

    # =========================
    # SAVE
    # =========================
    file_stream = BytesIO()
    wb.save(file_stream)
    file_stream.seek(0)

    return StreamingResponse(
        file_stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=roster_{month}_{year}.xlsx"}
    )

@router.post("/admin-users")
def add_admin(
    data: dict,
    db: Session = Depends(get_db),
    user=Depends(verify_token)
):
    username = data.get("username")
    password = data.get("password")

    if not username or not password:
        raise HTTPException(status_code=400, detail="Username & password required")

    password = password[:72]  # 🔥 FIX bcrypt limit
    if len(password) > 72:
        raise HTTPException(status_code=400, detail="Password too long (max 72 chars)")

    hashed = pwd_context.hash(password)

    admin = AdminUser(
        username=username,
        password=hashed
    )

    db.add(admin)
    db.commit()

    return {"message": "Admin created"}

@router.get("/admin-users")
def list_admins(db: Session = Depends(get_db), user=Depends(verify_token)):

    admins = db.query(AdminUser).filter(AdminUser.status == "active").all()

    return [{"id": a.id, "username": a.username} for a in admins]

@router.delete("/admin-users/{admin_id}")
def delete_admin(
    admin_id: int,
    db: Session = Depends(get_db),
    user=Depends(verify_token)
):
    admin = db.query(AdminUser).filter(AdminUser.id == admin_id).first()

    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")

    admin.status = "inactive"
    db.commit()

    return {"message": "Admin removed"}

@router.put("/roster-entry/comment")
def add_comment(
    employee_id: int,
    date: str,
    comment: str,
    db: Session = Depends(get_db),
    user=Depends(verify_token)
):

    roster_date = datetime.strptime(date, "%Y-%m-%d").date()

    entry = db.query(RosterEntry).filter_by(
        employee_id=employee_id,
        date=roster_date
    ).first()

    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    entry.comment = comment

    db.execute(text("""
        INSERT INTO audit_logs (employee_id, date, old_shift, new_shift, changed_by)
        VALUES (:emp, :date, :old, :new, :user)
    """), {
        "emp": employee_id,
        "date": roster_date,
        "old": "COMMENT",
        "new": comment,
        "user": user.get("sub")
    })

    db.commit()

    return {"message": "Comment added"}

@router.get("/audit-logs")
def get_audit_logs(month: int, year: int, db: Session = Depends(get_db)):

    roster = db.query(Roster).filter(
        Roster.month == month,
        Roster.year == year
    ).order_by(Roster.id.desc()).first()

    if not roster:
        return []

    logs = db.execute(text("""
        SELECT 
            a.employee_id,
            e.name,
            a.date,
            a.old_shift,
            a.new_shift,
            a.changed_by,
            a.changed_at
        FROM audit_logs a
        JOIN employees e ON e.id = a.employee_id
        ORDER BY a.changed_at DESC
        LIMIT 200
    """)).fetchall()

    result = []

    for row in logs:
        result.append({
            "employee": row.name,
            "date": str(row.date),
            "old": row.old_shift,
            "new": row.new_shift,
            "user": row.changed_by,
            "time": row.changed_at.strftime("%Y-%m-%d %H:%M")
        })

    return result