# BillSplit

Mobile-first PWA for splitting restaurant bills in **Israeli shekels (₪)**. React (Vite) frontend + FastAPI backend.

## Development

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Optional: install [Tesseract](https://github.com/tesseract-ocr/tesseract) with `heb` + `eng` trained data for real OCR. Without it, `/api/bills/parse` returns demo line items.

### Frontend

```bash
cd frontend
npm install
# optional: echo 'VITE_API_URL=http://127.0.0.1:8000' > .env.development
npm run dev
```

Open the URL shown (usually `http://localhost:5173`). Set `VITE_API_URL` if the API is not on `127.0.0.1:8000`.

## Production build

```bash
cd frontend && npm run build
```

Serve the `frontend/dist` folder over HTTPS for PWA install.
