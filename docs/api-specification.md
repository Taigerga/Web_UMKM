# API Specification (ringkas)

Base path: `/api/v1`. Swagger: `/api/v1/docs` (non-production).

## Envelope
- Sukses: `{ "data": ..., "meta"?: ... }`
- Error: `{ "error": { "code": "...", "message": "..." } }`
- Error kode stabil: `VALIDATION_ERROR`, `NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`, `CONFLICT`.

## Auth
| Method | Path | Akses |
|---|---|---|
| POST | `/auth/register` | publik |
| POST | `/auth/login` | publik |
| POST | `/auth/refresh` | cookie |
| POST | `/auth/logout` | auth |
| GET | `/auth/me` | auth |
| GET/PATCH | `/users/me`, `/users/me/password` | auth |

## Store & membership
| Method | Path | Akses |
|---|---|---|
| POST/GET | `/stores` | auth |
| GET/PATCH | `/stores/:storeId` | membership |
| GET/DELETE/PATCH | `/stores/:storeId/members`, `/members/:userId` | OWNER |
| POST | `/stores/:storeId/invitations` | OWNER |
| GET | `/invitations/:token` | publik |
| POST | `/invitations/:token/accept` | auth |

## Data bisnis
| Method | Path | Akses |
|---|---|---|
| GET/POST | `/stores/:storeId/products` | membership / OWNER |
| GET/PATCH/DELETE | `/stores/:storeId/products/:id` | membership / OWNER |
| GET/POST | `/stores/:storeId/customers` | membership / OWNER |
| GET | `/stores/:storeId/customers/export?segment=` | OWNER (diaudit) |
| GET/POST | `/stores/:storeId/orders`, `/orders/manual` | membership |
| GET/POST | `/stores/:storeId/suppliers`, `/categories` | membership / OWNER |
| GET/PATCH | `/stores/:storeId/margins` | OWNER |

## Dataset
| Method | Path |
|---|---|
| POST/GET | `/stores/:storeId/datasets` |
| GET | `/stores/:storeId/datasets/template.csv` |
| GET | `/stores/:storeId/datasets/:datasetId`, `/issues` |
| POST | `/:datasetId/mapping`, `/validate`, `/commit`, `/rollback` |

## Analytics
| Method | Path |
|---|---|
| GET | `/stores/:storeId/analytics/summary`, `/trend`, `/top-products`, `/customer-segments`, `/inventory` |
| GET | `/profitability`, `/category-breakdown`, `/product-performance`, `/customer-value` |
| POST | `/analytics/run` → `202 { jobId }` |
| GET | `/analytics/jobs`, `/analytics/jobs/:jobId` |

## Forecast
| Method | Path |
|---|---|
| POST | `/stores/:storeId/forecast/compute` |
| GET | `/stores/:storeId/forecast/:productId` |

## Reports
| Method | Path | Format |
|---|---|---|
| GET | `/stores/:storeId/reports/sales-summary` | HTML |
| GET | `/stores/:storeId/reports/detailed` | CSV |
| GET | `/stores/:storeId/reports/forecast/:productId` | HTML |
| GET | `/stores/:storeId/reports/sales-summary/xlsx` | XLSX |
| GET | `/stores/:storeId/reports/sales-summary/pdf` | PDF |
| GET | `/stores/:storeId/reports/detailed/xlsx` | XLSX |
| GET | `/stores/:storeId/reports/forecast/:productId/pdf` | PDF |

## Notifications
| Method | Path |
|---|---|
| GET | `/notifications`, `/notifications/unread-count` |
| PATCH | `/notifications/:id/read` |
| POST | `/notifications/read-all` |

## Admin (role ADMIN)
| Method | Path |
|---|---|
| GET | `/admin/users`, `/admin/stores` |
| PATCH | `/admin/users/:userId/status` |
| GET | `/admin/ml-jobs`, `/admin/ml-models` |

## Health
`GET /api/v1/health`, `GET /api/v1/health/details`.
