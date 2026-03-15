# Santhira - DevOps Master Platform

Enterprise SaaS for Learning, Deployment, Troubleshooting, and Interview Mastery

## Installation

```bash
pip install -e .
```

## Running the Backend

```bash
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

## Running the Frontend

```bash
streamlit run dashboard/app.py --server.port 8501 --server.headless true
```

## Architecture

- **Backend**: FastAPI with async/await
- **Frontend**: Streamlit with Plotly visualizations
- **AI Engine**: LangChain/LangGraph for troubleshooting
- **Database**: PostgreSQL 16 + pgvector
- **Infrastructure**: Kubernetes 1.30+