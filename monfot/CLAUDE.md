# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**BudgetProperty** — A real estate property listing platform with a React frontend and Node.js/Express backend. The platform supports property listings, OTP-based authentication, subscription plans with Razorpay payments, and an admin dashboard.

## Repository Structure

```
monfot/
├── projectecom-backend-main/    # Express.js REST API (port 5000)
└── projectecom-frontend-main/   # React 18 SPA (port 3000, proxied to backend)
```

## Common Commands

### Backend (`projectecom-backend-main/`)
```bash
npm install          # Install dependencies
npm run dev          # Start dev server with nodemon (port 5000)
npm start            # Start production server
```

### Frontend (`projectecom-frontend-main/`)
```bash
npm install          # Install dependencies
npm start            # Start dev server (port 3000)
npm run build        # Production build
npm test             # Run tests (react-scripts test)
```

### Database Setup (MySQL 8.0+)
```bash
mysql -u root -p < database/001-create-database.sql
mysql -u root -p < database/002-seed-data.sql
```
Migration scripts live in `sql/` (e.g., `20260303_add_subscription_payments.sql`).

## Backend Architecture

**Entry point:** `src/server.js` — Express app with middleware stack: trust proxy → helmet → compression → rate limiter (200 req/15min) → morgan → CORS → body parser (10MB limit) → static files.

**Routes** (all mounted at `/api/`):
| Mount Point | File | Purpose |
|---|---|---|
| `/api/auth` | `routes/auth.js` | Registration, login, OTP verification |
| `/api/properties` | `routes/properties.js` | Public property listing & search |
| `/api/user/properties` | `routes/user-properties.js` | User's own property CRUD |
| `/api/admin` | `routes/admin.js` | Dashboard stats, property/user management |
| `/api/payment` | `routes/paymentRoutes.js` | Razorpay payment orders & webhooks |
| `/api/subscription` | `routes/subscriptionRoutes.js` | Subscription management |
| `/api/plans` | `routes/planRoutes.js` | List subscription plans |
| `/api/inquiries` | `routes/inquiries.js` | Property inquiries |
| `/api/contact` | `routes/contact.js` | Contact form |
| `/api/upload` | `routes/upload.js` | Image upload to MinIO/S3 |

**Middleware** (`src/middleware/`):
- `auth.js` — `authenticateToken()`, `isAdmin()`, `optionalAuth()` (JWT-based, no session table)
- `roleMiddleware.js` — `authorizeRoles(...roles)` for flexible role checks
- `checkSubscription.js` — Validates active subscription from `user_subscriptions` table

**Config** (`src/config/`):
- `database.js` — MySQL connection pool (limit 10) with auto-retry for transient errors
- `minio.js` — S3/MinIO client for image storage
- `razorpay.js` — Razorpay payment gateway instance

**Database:** MySQL with 13 tables — `users`, `otp_verifications`, `sessions`, `property_types`, `properties` (with FULLTEXT search), `property_images`, `amenities`, `property_amenities`, `inquiries`, `favorites`, `subscription_plans`, `user_subscriptions`, `subscription_payments`. Schema files in `database/`.

## Frontend Architecture

**Stack:** React 18 + React Router 6 + Tailwind CSS 3.4 + Axios + Lucide icons

**Entry point:** `src/App.js` — Route definitions. Navbar/Footer hidden on admin routes.

**Auth:** `src/context/AuthContext.js` — Context-based auth state. Primary login is phone OTP (sendOtp → loginWithOtp). Token stored in `localStorage`, auto-attached via axios interceptor in `services/api.js`. The `ProtectedRoute` component guards authenticated routes (`adminOnly` flag for admin routes).

**API layer:** `src/services/api.js` — Axios instance pointing to `REACT_APP_API_URL` (defaults to `http://localhost:5000/api`). Request interceptor attaches Bearer token; 401 responses auto-clear the token.

**Key pages:**
- `HomePage.js` — Hero with search, featured properties, property types, popular cities
- `PropertiesPage.js` — Filterable property listing with pagination (12/page), URL param sync
- `PropertyDetailPage.js` — Property details with image gallery
- `UserPropertyForm.js` / `AdminPropertyForm.js` — Property creation/editing forms
- `SubscriptionPage.js` — Three-tier plans (standard/elite/super_elite)

**PropertyCard.js** uses tier-based styling: standard (white), elite (amber/gold), super_elite (yellow/premium).

**Tailwind theme:** Custom primary (blue) and secondary (slate) color scales. Font: Inter.

## Environment Variables

### Backend
```
PORT=5000, NODE_ENV, CLIENT_URL
DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
JWT_SECRET, JWT_EXPIRES_IN
MINIO_S3_ENDPOINT, MINIO_ENDPOINT, MINIO_PUBLIC_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_BUCKET, MINIO_REGION
RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_PLAN_ID_*
DVHOSTING_API_URL, DVHOSTING_API_KEY (SMS/OTP service)
```

### Frontend
```
REACT_APP_API_URL (defaults to http://localhost:5000/api)
REACT_APP_GOOGLE_MAPS_API_KEY
```

## Key Patterns

- All SQL queries use parameterized queries (`?` placeholders) to prevent injection
- Password hashing uses bcrypt (10 rounds)
- Image uploads go through multer (memory storage) → S3/MinIO with UUID filenames
- Properties support advanced filtering: city, type, listing_type, price range, bedrooms, FULLTEXT search
- Subscription tiers gate access to contact information; unsubscribed users are redirected to `/subscription`
- Mobile-first responsive design with bottom navigation bar on mobile
