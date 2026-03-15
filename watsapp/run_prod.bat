@echo off
echo Starting WhatsApp AI Sales Agent in Production Mode (Windows)...
echo Using Uvicorn with 4 worker processes.
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
