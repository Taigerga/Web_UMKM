# Matrix Otorisasi

| Role Platform | Area | Akses |
|---|---|---|
| ADMIN | `/admin/*` | baca lintas tenant (directory) |
| OWNER/STAFF | `/stores/:storeId/*` | hanya store membership |
| OWNER | ingest, recompute | ya |
| STAFF | ingest, read analytics/reports | baca; write sesuai policy |

Guard chain: JwtAuthGuard -> RolesGuard -> StoreScopeGuard.
Tenant scope middleware hanya `storeMembers`, `storeInvites`.
MCP tools selalu memerlukan `accessToken` + `storeId`.
