# ERD (ringkas)

## Entitas utama
- users (admin/owner/staff)
- stores (tenant root)
- storeMembers (membership toko x user)
- storeInvites
- products, productCategories, suppliers, productPrices, productMargins
- customers
- orders, orderItems
- datasets, datasetMappings, datasetIssues
- forecastResults
- mlJobs
- notifications
- auditLogs

## Aturan tenant
- Semua data bisnis memakai `storeId` atau melalui relation ke `stores`.
- `storeMembers` dan `storeInvites` ditempel permission tenant di backend.
- MCP tools menerima `storeId` dan memvalidasi keanggotaan sebelum query.

## Relasi penting
- stores 1..1..N storeMembers, products, customers, orders, mlJobs, notifications
- orders 1..N orderItems; orderItems N..1 products
- users 1..N membership, notifications, mlJobs (di level app)
