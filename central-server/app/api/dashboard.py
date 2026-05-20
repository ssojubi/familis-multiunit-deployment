from fastapi import APIRouter

router = APIRouter()

@router.get("/summary")
async def dashboard_summary():
    return {"message": "Dashboard API - to be implemented"}