# Emergent Google Auth — Testing Playbook for AITAX

## How AITAX uses Emergent Google Auth
- AITAX has **two parallel auth flows**:
  1. **Email + Password** (JWT, bcrypt) — used by Super Admin + tenants who want it
  2. **Google via Emergent** — for tenant users (NOT Super Admin)
- Both flows ultimately mint **the same custom JWT** (HS256, 24h, stored in `localStorage.aitax_token`). We do **not** use httpOnly session cookies — the Google flow only uses Emergent's session exchange to fetch profile, then we issue our own JWT.

## Flow
1. Frontend (`Login.jsx` / `Register.jsx`) → user clicks "Continue with Google"
2. Redirects to `https://auth.emergentagent.com/?redirect={origin}/auth/callback`
3. After Google login, user lands at `{origin}/auth/callback#session_id=xxx`
4. Frontend route `/auth/callback` (`GoogleCallback.jsx`) reads session_id from hash, POSTs to backend `/api/auth/google/exchange` with `{ session_id }`
5. Backend (`auth_router.py google_exchange`) calls `https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data` with header `X-Session-ID`, gets `{email, name, picture}`, upserts user in `db.users`, mints AITAX JWT, returns `{access_token, user}`
6. Frontend persists token in localStorage, redirects to `/onboarding` (if no company) or `/app/dashboard`

## Test cases
1. **Backend `/api/auth/google/exchange` with valid session_id** → returns JWT + user
2. **Backend `/api/auth/google/exchange` with invalid session_id** → 401
3. **Same Google email logging in twice** → does NOT create duplicate user; updates `last_login_at` only
4. **Super Admin email (`info@aitax.com`) attempting Google login** → backend rejects with 403 "Super admin must use password login"
5. **Frontend `/auth/callback#session_id=xxx`** → processes synchronously, hands JWT off, redirects to dashboard
6. **Tenant data isolation persists after Google login** (multi-tenant guarantees hold)

## Manual local test
```bash
# 1. Have a valid Emergent OAuth session_id from a browser run
SESSION_ID="<paste from URL hash>"
API=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d= -f2)
curl -X POST "$API/api/auth/google/exchange" -H "Content-Type: application/json" -d "{\"session_id\":\"$SESSION_ID\"}"
```

## Test identities
| Account | Type | Notes |
|---|---|---|
| `info@aitax.com` / `Ap@27021992` | Super Admin (password-only) | Seeded on startup from env |
| `demo@aitax.in` / `Demo@12345` | Tenant (password) | Demo seed, disable via `ENABLE_DEMO_SEED=false` in prod |
| Any Google account | Tenant (Google) | Created on first login |

## Notes for testing agent
- **Do NOT** seed httpOnly session cookies — AITAX uses JWT in `Authorization: Bearer` headers
- Use the existing JWT flow (`/api/auth/login`) for any Google-account-equivalent test by registering a normal user
- The Google flow itself depends on a live browser session with Emergent's OAuth which is hard to mock — the backend `google_exchange` endpoint can be tested with a fake session_id to verify the 401 path
