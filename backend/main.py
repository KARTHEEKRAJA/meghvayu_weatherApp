"""
MeghVayu backend - FastAPI.
Run: uvicorn main:app --reload --port 4000
"""
import os
from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from errors import ApiError
from routes import weather, records, export, extras

app = FastAPI(title="MeghVayu Weather API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "weather-app-backend", "time": datetime.now(timezone.utc).isoformat()}


app.include_router(weather.router)
app.include_router(records.router)
app.include_router(export.router)
app.include_router(extras.router)


# ---- central error handling: every failure is a clean JSON {"error": ...} ----

@app.exception_handler(ApiError)
async def api_error_handler(_: Request, exc: ApiError):
    return JSONResponse(status_code=exc.status, content={"error": exc.message})


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_: Request, exc: RequestValidationError):
    first = exc.errors()[0] if exc.errors() else {}
    loc = ".".join(str(p) for p in first.get("loc", []) if p not in ("query", "body", "path"))
    return JSONResponse(status_code=400, content={"error": f"Invalid value for '{loc}': {first.get('msg', 'invalid input')}"})


@app.exception_handler(404)
async def not_found_handler(request: Request, _):
    return JSONResponse(status_code=404, content={"error": f"Not found: {request.method} {request.url.path}"})


@app.exception_handler(Exception)
async def unhandled_handler(_: Request, exc: Exception):
    print("Unhandled error:", repr(exc))
    return JSONResponse(status_code=500, content={"error": "Internal server error. Please try again."})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.environ.get("PORT", 4000)), reload=True)
