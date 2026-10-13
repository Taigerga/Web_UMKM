# Phase 4: Integrasi ML + Dashboard — Design Specification

**Date:** Oct 14, 2026
**Version:** 1.0
**Status:** Specification (Implementation pending)

---

## Overview

Phase 4 mengintegrasikan hasil Machine Learning ke dashboard dengan sistem job management asynchronous, locking mechanism, idempotency, recovery, dan presentasi hasil yang mudah dipahami dalam bahasa awam.

**Prinsip Utama:**
- Semua proses ML berjalan asynchronous (return 202)
- Backend mengelola job queue dengan worker terpisah
- Locking mencegah duplikasi eksekusi (SELECT...FOR UPDATE)
- Idempotency key memastikan retry aman
- Recovery otomatis untuk job yang hang > 10 menit
- Frontend polling status, bukan blocking
- Hasil nyata dari Python, bukan mock
- Penjelasan hasil dalam bahasa yang mudah dimengerti

---

## Database Schema Extension

### `ml_jobs` table

```sql
CREATE TABLE ml_jobs (
  id CHAR(36) PRIMARY KEY,
  store_id CHAR(36) NOT NULL,
  job_type ENUM('forecast', 'segmentation', 'basket', 'churn', 'anomaly') NOT NULL,
  status ENUM('queued', 'running', 'completed', 'failed') DEFAULT 'queued',
  
  input_params JSON,  -- { period: '30d', productId?: 'uuid', ... }
  result JSON,        -- forecast results, segmentation, etc
  error_message VARCHAR(500),
  
  idempotency_key VARCHAR(255) UNIQUE,  -- prevent duplicate jobs
  worker_id VARCHAR(36),                 -- worker PID yang mengeksekusi
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  INDEX idx_store_status (store_id, status),
  INDEX idx_status_started (status, started_at)
);
```

### Extend `forecast_results`, `customer_segments`, dll

Tambah field `job_id CHAR(36)` untuk traceability ke job yang menghasilkannya.

---

## Backend API Specification

### Job Submission Endpoint

#### POST `/stores/:storeId/analytics/run`

**Request:**
```json
{
  "jobType": "forecast",  // atau segmentation, basket, churn, anomaly
  "parameters": {
    "period": "30d",
    "forecastDays": 30
  },
  "idempotencyKey": "uuid-atau-hash-request"  // optional, generated if not provided
}
```

**Response (202 Accepted):**
```json
{
  "data": {
    "jobId": "uuid",
    "status": "queued",
    "createdAt": "2026-10-14T23:00:00Z",
    "message": "Analisis sedang diproses. Periksa status menggunakan jobId ini."
  }
}
```

**Error (400, 403, 422, 500):**
```json
{
  "error": {
    "code": "INVALID_PARAMETERS",
    "message": "Parameter tidak valid"
  }
}
```

---

### Job Status Endpoint

#### GET `/stores/:storeId/analytics/jobs/:jobId`

**Response (200 - queued):**
```json
{
  "data": {
    "jobId": "uuid",
    "status": "queued",
    "position": 3,  // dalam queue
    "createdAt": "2026-10-14T23:00:00Z"
  }
}
```

**Response (200 - running):**
```json
{
  "data": {
    "jobId": "uuid",
    "status": "running",
    "startedAt": "2026-10-14T23:00:30Z",
    "progress": 45  // percent
  }
}
```

**Response (200 - completed):**
```json
{
  "data": {
    "jobId": "uuid",
    "status": "completed",
    "result": {
      "forecasts": [...],
      "metadata": {
        "model": "exponential_smoothing",
        "period": "30d",
        "computedAt": "2026-10-14T23:01:00Z"
      }
    },
    "explanation": "Penjualan diperkirakan meningkat 15% pada 30 hari ke depan berdasarkan pola historis."
  }
}
```

**Response (200 - failed):**
```json
{
  "data": {
    "jobId": "uuid",
    "status": "failed",
    "error": {
      "code": "INSUFFICIENT_DATA",
      "message": "Data historis < 90 hari. Forecast tidak dapat dihasilkan."
    },
    "completedAt": "2026-10-14T23:01:15Z"
  }
}
```

---

### Advanced Analytics Query Endpoints

#### GET `/stores/:storeId/analytics/profitability`

**Query Parameters:**
- `period`: "7d" | "30d" | "90d" (default: "30d")

**Response:**
```json
{
  "data": {
    "byProduct": [
      {
        "productId": "uuid",
        "sku": "SKU-001",
        "name": "Produk A",
        "costPrice": 2000,
        "sellingPrice": 2500,
        "marginPercent": 20,
        "profitPerUnit": 500,
        "totalQtySold": 100,
        "totalProfit": 50000,
        "profitRank": 1
      }
    ],
    "byCategory": [
      {
        "category": "Minuman",
        "totalSales": 500000,
        "totalCost": 400000,
        "grossProfit": 100000,
        "marginPercent": 20,
        "profitRank": 1
      }
    ],
    "summary": {
      "totalSales": 5000000,
      "totalCost": 4000000,
      "grossProfit": 1000000,
      "marginPercent": 20
    }
  }
}
```

#### GET `/stores/:storeId/analytics/category-breakdown`

**Response:**
```json
{
  "data": [
    {
      "category": "Minuman",
      "sales": 1500000,
      "pct": 30,
      "orderCount": 150,
      "itemCount": 450
    },
    {
      "category": "Makanan",
      "sales": 2000000,
      "pct": 40,
      "orderCount": 200,
      "itemCount": 600
    }
  ]
}
```

---

### Admin Monitoring Endpoints

#### GET `/admin/ml-jobs`

**Query Parameters:**
- `status`: queued | running | completed | failed (optional)
- `limit`: 50 (default)
- `offset`: 0 (default)

**Response:**
```json
{
  "data": [
    {
      "jobId": "uuid",
      "storeId": "uuid",
      "storeName": "Toko Demo",
      "jobType": "forecast",
      "status": "running",
      "createdAt": "2026-10-14T23:00:00Z",
      "startedAt": "2026-10-14T23:00:30Z",
      "durationSeconds": 45,
      "workerId": "worker-1"
    }
  ],
  "pagination": {
    "total": 125,
    "limit": 50,
    "offset": 0
  }
}
```

#### GET `/admin/ml-models`

**Response:**
```json
{
  "data": {
    "forecast": {
      "version": "1.0.0",
      "lastTrained": "2026-10-10T10:00:00Z",
      "accuracy": 0.92,
      "algorithm": "exponential_smoothing",
      "status": "active"
    },
    "segmentation": {
      "version": "1.0.0",
      "lastTrained": "2026-10-10T12:00:00Z",
      "silhouetteScore": 0.68,
      "algorithm": "k_means",
      "status": "active"
    }
  }
}
```

---

## Frontend Specification

### Job Submission Flow

**Component:** `AnalyticsJobPanel`

```tsx
1. User selects analysis type (dropdown)
2. User sets parameters (date range, product, etc)
3. User clicks "Jalankan Analisis"
4. Submit POST /run → get jobId (202)
5. Display: "Analisis sedang diproses..." + jobId
6. Poll GET /jobs/:jobId every 2 seconds
7. Display status: queued → running (with progress %) → completed
8. On completed: display results + explanation
9. On failed: display error message + troubleshooting
```

**UI States:**
- **Idle:** Form dengan input parameters
- **Submitting:** Loading spinner
- **Queued:** "Antri di posisi X. Silakan tunggu..."
- **Running:** Progress bar (jika available)
- **Completed:** Results displayed dengan penjelasan
- **Failed:** Error message + link ke FAQ/support

---

### Results Display

**Forecast Results:**
```
📊 Hasil Forecast Penjualan

Periode: 30 hari ke depan (15 Okt 2026 - 14 Nov 2026)
Model: Exponential Smoothing
Confidence: 95%

📈 Prediksi Penjualan:
- Minggu 1: Rp 5.2M (±0.8M)
- Minggu 2: Rp 5.5M (±0.9M)
- Minggu 3: Rp 5.8M (±1.0M)
- Minggu 4: Rp 6.0M (±1.1M)

💡 Penjelasan:
Penjualan diperkirakan meningkat 15% berdasarkan pola historis 
yang menunjukkan tren positif di 90 hari terakhir. 
Angka dalam kurung menunjukkan ketidakpastian prediksi.

⚠️ Batasan:
Prediksi ini hanya valid jika pola belanja pelanggan 
tetap konsisten dan tidak ada faktor eksternal yang signifikan.

Diperbarui: 14 Okt 2026, 23:00
```

**Segmentation Results:**
```
👥 Hasil Segmentasi Pelanggan

Analisis: RFM + K-Means Clustering

Segmen yang Ditemukan (4):

1. 🌟 Pelanggan Setia (VIP)
   Jumlah: 45 pelanggan (15%)
   Kontribusi: Rp 2.4M (48%)
   Ciri: Belanja rutin, nilai tinggi, aktif belanja minggu ini
   
2. ⏳ Pelanggan Potensial
   Jumlah: 80 pelanggan (27%)
   Kontribusi: Rp 1.2M (24%)
   Ciri: Belanja konsisten, nilai sedang, belanja 2-4 minggu lalu
   
3. 📉 Pelanggan Berisiko
   Jumlah: 120 pelanggan (40%)
   Kontribusi: Rp 0.9M (18%)
   Ciri: Jarang belanja, nilai rendah, belanja > 1 bulan lalu
   
4. 🆕 Pelanggan Baru
   Jumlah: 55 pelanggan (18%)
   Kontribusi: Rp 0.5M (10%)
   Ciri: Belanja pertama atau kedua, belanja minggu ini/lalu

💡 Rekomendasi:
- VIP: Pertahankan dengan program loyalitas khusus
- Potensial: Ajak dengan penawaran spesial
- Berisiko: Hubungi dengan promosi retensi
- Baru: Dampingi dengan onboarding + diskon trial

Periode Analisis: 90 hari terakhir (15 Jul - 14 Okt 2026)
Diperbarui: 14 Okt 2026, 23:01
```

---

## Backend Worker Implementation

### MlJobWorker Service

```typescript
// Pseudocode untuk worker logic

class MlJobWorker {
  async processJob(jobId: string) {
    // 1. Acquire lock
    const job = await this.prisma.mlJobs.findUnique({
      where: { id: jobId },
    });
    
    // 2. SELECT...FOR UPDATE untuk prevent duplicate processing
    const locked = await this.prisma.$queryRaw`
      SELECT * FROM ml_jobs 
      WHERE id = ${jobId} AND status = 'queued'
      FOR UPDATE SKIP LOCKED
    `;
    
    if (!locked) return; // Already being processed
    
    try {
      // 3. Update status to running
      await this.prisma.mlJobs.update({
        where: { id: jobId },
        data: { 
          status: 'running',
          workerId: process.pid.toString(),
          startedAt: new Date()
        },
      });
      
      // 4. Call Python service
      const result = await this.pythonClient.runAnalysis(job.jobType, job.inputParams);
      
      // 5. Generate explanation
      const explanation = this.explanationService.generate(job.jobType, result);
      
      // 6. Store result
      await this.prisma.mlJobs.update({
        where: { id: jobId },
        data: {
          status: 'completed',
          result: JSON.stringify(result),
          explanation,
          completedAt: new Date(),
        },
      });
      
      // 7. Invalidate cache
      await this.redis.invalidateStoreMetrics(job.storeId);
      
    } catch (error) {
      await this.prisma.mlJobs.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          errorMessage: error.message,
          completedAt: new Date(),
        },
      });
    }
  }
  
  // Recovery: find jobs running > 10 minutes
  async recoverStuckJobs() {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    
    await this.prisma.mlJobs.updateMany({
      where: {
        status: 'running',
        startedAt: { lt: tenMinutesAgo },
      },
      data: {
        status: 'failed',
        errorMessage: 'Job timeout (> 10 minutes)',
      },
    });
  }
}
```

---

## Python Service Integration

### Circuit Breaker Pattern

```python
class MlClient:
    def __init__(self):
        self.failures = 0
        self.state = 'closed'  # closed, open, half_open
        
    async def run_analysis(self, job_type, params):
        if self.state == 'open':
            if time.time() - self.last_failure > 60:  # retry after 1 min
                self.state = 'half_open'
            else:
                raise Exception("ML service unavailable")
        
        try:
            result = await self._call_python_with_timeout(job_type, params, timeout=300)
            if self.state == 'half_open':
                self.state = 'closed'
                self.failures = 0
            return result
        except Exception as e:
            self.failures += 1
            if self.failures > 3:
                self.state = 'open'
                self.last_failure = time.time()
            raise
```

---

## Explanation Template System

### ExplanationService

```typescript
class ExplanationService {
  generate(jobType: string, result: any): string {
    switch (jobType) {
      case 'forecast':
        return this.generateForecastExplanation(result);
      case 'segmentation':
        return this.generateSegmentationExplanation(result);
      // ... other types
    }
  }
  
  private generateForecastExplanation(result: any): string {
    const trend = result.trend > 0 ? 'meningkat' : 'menurun';
    const pct = Math.abs(result.trend);
    const period = result.period;
    
    return `Penjualan diperkirakan ${trend} ${pct}% pada ${period} hari ke depan berdasarkan pola historis. Angka dalam kurung menunjukkan ketidakpastian prediksi (confidence interval).`;
  }
  
  private generateSegmentationExplanation(result: any): string {
    // Build explanation dari cluster characteristics
    const segments = result.clusters.map(c => `${c.label}: ${c.count} pelanggan (${c.pct}%), kontribusi ${c.revenue}`);
    return `Analisis menemukan ${result.clusters.length} segmen pelanggan. ${segments.join('. ')}. Rekomendasi: [aksi per segmen].`;
  }
}
```

---

## Frontend Polling Logic

### useJobStatus Hook

```typescript
function useJobStatus(jobId: string, storeId: string) {
  const [status, setStatus] = useState('queued');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`/api/v1/stores/${storeId}/analytics/jobs/${jobId}`);
        const { data } = await res.json();
        
        setStatus(data.status);
        
        if (data.status === 'completed') {
          setResult(data.result);
          clearInterval(interval);
        } else if (data.status === 'failed') {
          setError(data.error);
          clearInterval(interval);
        }
      } catch (e) {
        setError(e.message);
      }
    };
    
    const interval = setInterval(poll, 2000);
    poll(); // Initial call
    
    return () => clearInterval(interval);
  }, [jobId, storeId]);
  
  return { status, result, error };
}
```

---

## Admin ML Monitoring Dashboard

**Component:** `AdminMlStatusPage`

Displays:
- Job queue status (queued, running, completed, failed counts)
- Recent jobs table (store, type, status, duration, worker ID)
- Model health (version, last trained, metrics, status)
- Performance stats (avg processing time, success rate)
- Logs for failed jobs

---

## Security & Compliance

### Tenant Isolation
- Semua query job filter by `storeId`
- Admin hanya dapat melihat job metadata (bukan data pelanggan)
- User tidak dapat melihat job toko lain

### Data Privacy
- Result disimpan di DB (encrypted at rest jika production)
- File artifacts disimpan terpisah, tidak di-expose ke frontend
- Export penjelasan saja, bukan raw model output

### Audit
- Log setiap job creation (who, when, parameters)
- Log setiap job completion (result hash, duration)
- Log setiap admin access ke monitoring

---

## Error Handling

| Error | Status | Message | Action |
|---|---|---|---|
| Invalid parameters | 422 | "Parameter tidak valid: {field}" | Show form error |
| Insufficient data | 400 | "Data < 90 hari, forecast tidak tersedia" | Show requirement |
| ML service down | 503 | "ML service sedang maintenance" | Retry later |
| Timeout (> 10min) | 200 + failed | "Analisis timeout, coba ulangi" | Allow retry |
| Duplicate job (same key) | 202 | Same jobId as previous | Reuse existing |

---

## Performance Targets

- **Job submission:** < 500ms (202 response)
- **Job polling:** < 200ms per request
- **Job processing:** 
  - Forecast: < 5 min
  - Segmentation: < 3 min
  - Basket: < 2 min
  - Churn: < 3 min
  - Anomaly: < 2 min
- **Admin monitoring query:** < 1s
- **Cache hit rate:** > 80% untuk analytics

---

## Rollout & Testing

### MVP Gate (15 steps)
1. Admin login → 2. ML monitoring page → 3. Verify models
4. Owner login → 5. Analytics page → 6. Select analysis
7. Set params → 8. Click run → 9. Receive 202
10. Poll → 11. Status queued → 12. Status running
13. Status completed → 14. Fetch results → 15. Verify penjelasan

### Success Criteria
- ✓ No mock data in final results
- ✓ All steps complete without error
- ✓ Results match expected format
- ✓ Penjelasan dalam bahasa awam (bukan raw JSON)
- ✓ Tenant isolation verified
- ✓ Admin can monitor jobs

---

## Constraints & Assumptions

- Python service reliability: 95%+
- MySQL performance: queries < 1s
- Frontend polling: max 2s interval (battery friendly)
- Job retention: 30 hari (then auto-delete)
- Concurrent jobs per store: max 5 (prevent overload)
- Single worker process (multi-worker in Phase 5+)
