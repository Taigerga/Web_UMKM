# Troubleshooting

- MySQL connection refused: cek Laragon MySQL, `DATABASE_URL`.
- test DB migration missing: jalankan `npm run migrate:test`.
- FastAPI model artifact missing: jalankan `python services/ml/training/train_all.py` atau `POST /train`.
- Job tetap queued: backend worker interval 5s, pastikan FastAPI healthy.
- MCP hang stdio: pastikan tidak ada console.log di stdout selain MCP.
- Redis: fallback in-memory jika tanpa Redis; warning normal.
