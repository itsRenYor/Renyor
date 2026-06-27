# AITAX — Product Requirements & Status

## Original Problem Statement
AI-powered cloud accounting, invoicing, inventory, taxation, and business management SaaS for Indian MSMEs (small traders, retailers, service providers, tour operators, transporters, CAs). Multi-tenant, multi-company, multi-user, subscription-based. Replaces handwritten registers, manual invoices, stock books, Excel sheets with one integrated platform.

## User Choices (Feb 2026)
- Tech stack: **React + FastAPI + MongoDB** (platform constraint)
- Scope first iteration: **Phase 1 + Phase 2**
- Auth: **JWT custom (email/password)**
- AI: **Skipped for MVP**
- Payments: **Razorpay (live keys provided)**

## User Personas
Kirana, hardware, medical & textile shop owners · wholesalers · distributors · service & AMC providers · tour operators · transporters · Chartered Accountants · freelance consultants.

## Architecture
- Backend: FastAPI, Motor (MongoDB), JWT (PyJWT) + bcrypt, Razorpay SDK
- Frontend: React 19 + react-router 7 + Tailwind + shadcn/ui + Recharts + sonner toasts
- Multi-tenancy: every document scoped by `company_id`; user has `active_company_id`
- Fonts: Outfit (display), IBM Plex Sans (body), JetBrains Mono (data) — per design guidelines

## What's Built (Feb 27 2026 — First Finish)
### Backend (all under `/api`)
- Auth: register, login, me, switch-company
- Companies: full CRUD + onboarding
- Masters: parties (customer/supplier), products with HSN/GST/stock, stock movements, low-stock
- Sales: tax_invoice, retail_invoice, quotation, POS, credit_note — auto invoice numbers, GST calc, stock deduction, party balance update, record-payment
- Purchases: PO, purchase_invoice, return — auto voucher, stock increment
- Dashboard: KPIs (sales today, receipts, receivables, payables, inventory value, profit, low stock), 30-day revenue trend, top customers
- Subscription: 3 plans (Starter ₹499, Pro ₹1499, Enterprise ₹4999), Razorpay create-order + verify-payment (HMAC signature)
- Demo seed: `demo@aitax.in / Demo@12345` with 5 products + 5 parties + 1 company

### Frontend
- Landing page (hero, features, personas, testimonials, CTAs)
- Login + Register with form validation
- Onboarding (company profile)
- Authenticated app shell (sidebar nav + topbar with theme toggle, user dropdown)
- Dashboard with KPI cards + Recharts area chart + top customers
- Customers/Suppliers/Products with dialog-based CRUD, search, low-stock highlighting
- Sales with multi-line invoice form, live total calculation, status badges
- Purchases with similar form
- Inventory with tabs (Stock, Low Stock, Movements)
- Pricing & Billing pages with Razorpay checkout flow
- Light + Dark mode with localStorage persistence

## Testing
- Iteration 1 (Feb 27): 22/22 critical tests passed. 1 LOW issue (testid naming) — fixed.

## Backlog (Prioritized)

### P0 — Next iteration
- GST reports (GSTR-1, GSTR-3B export to JSON/Excel)
- PDF invoice generation & WhatsApp/Email share
- Multi-company switcher in topbar
- POS billing screen (touch-optimized for shops)

### P1
- Service Management (AMC, Job Cards, Technician assignment)
- Tour Operator module (Packages, Bookings, Vendor payments)
- Transport module (Trip sheet, LR, Diesel, Freight)
- Accounting engine (double-entry, ledgers, Trial Balance, P&L, Balance Sheet)
- AI: Receipt OCR, expense categorization, NL reports
- Bulk import (Excel) for products/customers
- Razorpay webhook handler for failed/refunded payments

### P2
- E-way bill API integration
- Bank reconciliation
- Recurring invoices + payment reminders (SMS/WhatsApp via Twilio)
- Audit trail UI
- Role-based access UI (currently only business_owner)
- Mobile app

## Credentials
See `/app/memory/test_credentials.md`
