# Second Brain App (`second_brain_app`)

Full-stack interactive web application for chatting with an AI Second Brain grounded in creator knowledge and personal persona.

---

## Architecture

- **Backend** (`backend/`):
  - **Framework**: FastAPI (Python 3.10+)
  - **Vector Search**: Qdrant client
  - **LLM Grounding & Streaming**: Google Gemini API
  - **Database**: PostgreSQL (SQLAlchemy) for user management & conversation history
- **Frontend** (`frontend/`):
  - **Framework**: React 18 + TypeScript + Vite
  - **Styling**: Tailwind CSS + Framer Motion
  - **UI Features**: Streaming responses, source citations, topic exploration, and responsive sidebar

---

## Prerequisites

- **Python 3.10+**
- **Node.js 18+** and **npm**
- **Qdrant Vector Database** (Local Docker instance on port 6333 or Qdrant Cloud)
- **Gemini API Key**

---

## 1. Backend Setup

### A. Create Virtual Environment & Install Dependencies

From the repository root:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### B. Configure Backend Environment (`.env`)

Copy or create `backend/.env` with your credentials:

```dotenv
# Gemini API
GEMINI_API_KEY=AIzaSy...

# Qdrant Vector DB
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=
QDRANT_COLLECTION=second_brain

# Application Database & Security
DATABASE_URL=postgresql://user:password@localhost:5432/second_brain
SECRET_KEY=your-super-secret-jwt-key
CORS_ORIGINS=http://localhost:5173
```

### C. Run Backend Server

```bash
# Using helper script
./run-dev.sh

# Or directly with uvicorn
uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload
```

The API will be available at `http://localhost:8000` with interactive docs at `http://localhost:8000/docs`.

---

## 2. Frontend Setup

### A. Install Node Dependencies

Open a new terminal tab and navigate to `frontend/`:

```bash
cd frontend
npm install
```

### B. Configure Frontend Environment (`.env`)

Create or verify `frontend/.env`:

```dotenv
VITE_API_URL=http://localhost:8000
```

### C. Run Frontend Dev Server

```bash
# Using helper script
./run-dev.sh

# Or directly with npm
npm run dev
```

The web UI will be live at `http://localhost:5173`.

---

## Project Structure

```
second_brain_app/
├── backend/
│   ├── src/                 # FastAPI routes, services, schemas, and prompts
│   ├── api/                 # Vercel serverless entry points
│   ├── requirements.txt     # Python dependencies
│   ├── run-dev.sh           # Backend start script
│   └── .env                 # Backend environment secrets
└── frontend/
    ├── src/                 # React components, hooks, styles
    ├── package.json         # Node dependencies
    ├── run-dev.sh           # Frontend start script
    └── .env                 # Frontend environment configuration
```
