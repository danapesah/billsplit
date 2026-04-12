import logging
import sys
from decimal import Decimal
from pathlib import Path

from dotenv import load_dotenv

# Root defaults to WARNING, so INFO from `app.*` is dropped after propagation. Uvicorn's own
# INFO lines use separate loggers/handlers—that's why those show up but app logs did not.
_app_log = logging.getLogger("app")
_app_log.setLevel(logging.INFO)
if not _app_log.handlers:
    _h = logging.StreamHandler(sys.stderr)
    _h.setLevel(logging.INFO)
    _h.setFormatter(logging.Formatter("%(levelname)s %(name)s: %(message)s"))
    _app_log.addHandler(_h)
_app_log.propagate = False
from fastapi import FastAPI, File, HTTPException, UploadFile

load_dotenv(Path(__file__).resolve().parent.parent / ".env")
from fastapi.middleware.cors import CORSMiddleware

from .gemini_parse import GeminiAPIError
from .models import CalculateRequest, CalculateResponse, ParseResponse
from .ocr_stub import parse_bill_image
from .split_logic import calculate_split

app = FastAPI(title="BillSplit API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/bills/parse", response_model=ParseResponse)
async def parse_bill(file: UploadFile = File(...)):
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")
    try:
        return parse_bill_image(content, file.content_type)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except GeminiAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e)) from e


@app.post("/api/splits/calculate", response_model=CalculateResponse)
def split_calculate(body: CalculateRequest):
    try:
        tip_pct = Decimal(str(body.tip_percent))
        per_person, totals = calculate_split(
            body.line_items,
            body.assignments,
            tip_pct,
            body.people,
        )
        return CalculateResponse(per_person=per_person, totals=totals)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
