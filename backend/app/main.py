from fastapi import FastAPI
from app.routes.employees import router as employee_router
from app.routes.rosters import router as roster_router
from fastapi.staticfiles import StaticFiles

# IMPORT ALL MODELS (IMPORTANT)
from app.models import employee, roster, roster_entry, shift

app = FastAPI(title="Shift Roster API")
app.mount("/static", StaticFiles(directory="app/static"), name="static")

app.include_router(employee_router)
app.include_router(roster_router)

@app.get("/")
def root():
    return {"message": "Shift Roster API Running"}