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

## What's Built — Cumulative (through Iteration 6, Feb 2026)
- Iteration 3: Super Admin basics, Google OAuth, password reset
- Iteration 4: GST (GSTR-1/3B), POS, Multi-company switcher, PDF invoices (reportlab)
- Iteration 5: Accounting engine (double-entry, Ledgers, Trial Balance, P&L, Balance Sheet), Services, Tours, Transport modules, Razorpay webhooks
- Iteration 6: **Comprehensive Super Admin Console** (`/admin`) — Tenants list w/ view-as-user (read-only snapshot), Subscriptions, editable Plans, Global Settings, Feature Flags, Audit Logs, Webhook Events viewer, DB Backup, Maintenance Mode middleware

## Testing
- Iteration 1 (22/22), 2 (refactor), 3 (super-admin/google), 4 (GST/POS/PDF), 5 (accounting/services/tours/transport/webhooks), 6 (23/23 super-admin + maintenance) — ALL GREEN

## Backlog (Prioritized)

### P0 — Next iteration
- AMC Module (Contracts, Renewals, Reminder scheduler)
- File/Object storage integration (upload bills, vehicle docs, AMC agreements)

### P1
- AI: Receipt OCR, Bill OCR, Expense categorization, GST error detection, NL reports
- Bulk Excel import for products/customers
- Audit trail UI (data already captured)
- Stream-based Backup endpoint (current dumps all at once)

### P2
- E-way bill API integration
- Bank reconciliation
- Recurring invoices + payment reminders (SMS/WhatsApp via Twilio)
- Audit trail UI
- Role-based access UI (currently only business_owner)
- Mobile app

## Credentials
See `/app/memory/test_credentials.md`
