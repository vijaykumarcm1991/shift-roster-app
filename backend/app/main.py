from fastapi import FastAPI
from app.routes.employees import router as employee_router

app = FastAPI(title="Shift Roster API")

app.include_router(employee_router)

@app.get("/")
def root():
    return {"message": "Shift Roster API Running"}