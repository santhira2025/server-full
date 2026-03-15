# AppSentinels-Style Dashboard - Complete Build Plan
# (Updated from actual AppSentinels screenshots)

## Overview

Build a **Full Life Cycle API Security Platform Dashboard** replicating AppSentinels' exact UI, with two portals:
1. **Customer Dashboard** — API security operations (Organization, Dashboard, Discovery, Testing, Protection, Reports)
2. **Admin Dashboard** — Platform administration (Operations Dashboard, Settings, System Health)

Built on top of the existing **Akto** open-source platform backend.

---

## Exact UI Structure (from Screenshots)

### Theme: Dark Mode (Primary)
- **Background**: `#0D0F12` (near black)
- **Surface/Cards**: `#1A1D23` (dark gray)
- **Sidebar**: `#111318` (dark, icon-based, narrow ~70px)
- **Accent/Brand**: `#E8732A` (orange — AppSentinels signature color)
- **Active Tab**: Orange underline + orange text
- **Text Primary**: `#FFFFFF`
- **Text Secondary**: `#9CA3AF` (gray)
- **Severity Colors**:
  - Critical: `#FF4D6A` (pink-red)
  - Major/High: `#FF8A4C` (orange)
  - Medium: `#FBBF24` (yellow)
  - Minor/Low: `#FFD700` (gold)
  - Info: `#22D3EE` (cyan/teal)
- **Status Colors**:
  - Open: `#FF4D6A` (pink)
  - False Positive: `#FF8A4C` (orange)
  - Analyzed: `#FBBF24` (yellow)
  - Risk Accepted: `#A855F7` (purple)
  - Resolved: `#22C55E` (green)
- **Donut Charts**: Gradient ring style with center number
- **Tables**: Dark rows with subtle borders, hover highlight

### Sidebar Navigation (Icon-based, narrow)
```
[Logo/Shield Icon]        — AppSentinels brand shield (top)
🏠 Organization           — Organization home / app selector
📊 Dashboard              — Main dashboard with metrics
🔍 Discovery              — API Discovery & inventory
🧪 Testing                — Vulnerability testing
🛡️ Protection             — Runtime protection & threat actors
📈 Reports                — Insights & report generation
⋯  More                   — Overflow menu
[User Avatar "RA"]        — User profile (bottom-left)
```

---

## PHASE 1: Foundation & Auth
**Week 1-2**

### 1.1 Project Setup
```
src/
├── customer/                  # Customer portal
│   ├── pages/
│   │   ├── organization/      # Organization home + app selector
│   │   ├── dashboard/         # Main dashboard
│   │   ├── discovery/         # API Discovery (5 tabs)
│   │   ├── testing/           # Vulnerability testing (4 tabs)
│   │   ├── protection/        # Runtime protection (5 tabs)
│   │   └── reports/           # Insights & reports
│   ├── layouts/
│   │   └── CustomerLayout.tsx # Dark sidebar + breadcrumb + content
│   └── routes.tsx
├── admin/                     # Admin portal
│   ├── pages/
│   │   ├── operations/        # Operations Dashboard (4 tabs)
│   │   ├── settings/          # Settings (3 sections)
│   │   └── system-health/     # System Health (3 tabs)
│   ├── layouts/
│   │   └── AdminLayout.tsx
│   └── routes.tsx
├── components/
│   ├── ui/                    # Base components
│   ├── charts/                # Donut, Line, Bar, Geo map
│   ├── tables/                # Paginated data tables
│   ├── summary/               # Summary card panels
│   └── shared/                # Shared across portals
├── hooks/
├── services/                  # API service layer
├── stores/                    # Zustand stores
├── types/                     # TypeScript interfaces
└── config/
```

### 1.2 Auth System
- Login page (email/password)
- SSO integration (SAML/OIDC)
- JWT token management with refresh tokens
- RBAC roles: `SUPER_ADMIN`, `ADMIN`, `ANALYST`, `VIEWER`
- Route guards per role
- Multi-tenant organization switching
- "Access Restricted" page with "Contact Sales" (seen in screenshot 1)
- "Log out" / "Sign in with different account" flow

### 1.3 Layout Shell (exact match)
- **Narrow icon sidebar** (~70px) — dark background, icon + label below
- Orange left-border on active item
- **Breadcrumb bar**: `finspot > Applications` style
- **Top-right controls**: Time filter toggle (`24 Hours` / `7 Days`), Download button
- **User avatar** bottom-left of sidebar with initials
- Content area with dark background

---

## PHASE 2: Organization & Main Dashboard
**Week 2-3**

### 2.1 Organization Home Page
(Screenshot: Applications page)

**Top Summary Bar — Application-Level Metrics:**
- **APIs Discovered**: `1K+` with trend indicator
- **API Risk Distribution**: Donut chart (Low/Medium/High/Critical colored ring)
- **Sensitive Parameters**: Count with trend
- **Request/Response counts**: With trends
- **Vulnerability Engines**: Count
- **Security Events**: Count

**Sub-metrics row** (below APIs Discovered):
| Label | Count | Color |
|-------|-------|-------|
| Shadow | count | Pink |
| Sensitive | count ↕ | Green |
| New | count | Green |
| Public | count ↕ | Blue |
| Blocked | count | Red |
| Non Conforming | count | Orange |
| Privilege | count ↕ | Purple |
| Unused | count | Gray |
| UnAuth | count ↕ | Orange |

- **Shadow APIs** count
- **Passive Scan** / **Active Scan** / **Runtime Scan** status
- **Client Errors** / **Server Errors** link

### 2.2 Applications List
- Search bar with filter
- Application cards/rows showing:
  - App name + "Go to App Dashboard" button
  - Environment tabs: `Non-production`, `Controller Health`, `Policy Mode`, `Detection`
  - Per-app metrics (same as top summary bar but scoped)
- Last Updated timestamp

### 2.3 Main Dashboard Page
(Screenshot: Dashboard — below sidebar "Dashboard")

**Section 1: Monitored Users Summary** (Last 30 Days)
| Card | Content |
|------|---------|
| Total / Blocked / Whitelisted | Counts stacked |
| Threat-Level | Donut chart: High (pink), Medium (orange), Low (yellow) |
| Top Tactics | Carousel/paginated list (< > arrows) |
| Geolocation | World map with threat origin dots |

**Section 2: Security Events Summary** (Last 90 days)
| Card | Content |
|------|---------|
| Total Security Events | Count + breakdown: Blocked, Client Errors (4XX), Successful (200 Ok), Server Errors (5XX) — color coded |
| Timeline Chart | Bar/line chart with tabs: Total / Blocked/Client Errors / Successful/Server Errors — date axis (Mar 1–7) |
| Top APIs Targeted | Paginated list (< > arrows) |
| Severity | Donut: Critical (pink), Major (orange), Minor (yellow), Info (teal) |
| Status | Donut: Open (pink), False Positive (orange), Analyzed (yellow), Risk Accepted (purple), Resolved (green) |
| Age | Donut: < 1 Day (pink), 1-3 Days (orange), > 3 Days (yellow) |

---

## PHASE 3: API Discovery Module
**Week 3-5**

### 3.1 Discovery Page — 5 Tab Navigation
```
[API Catalogue] [Parameter Catalogue] [API Governance] [API Sequence Flow] [API Tree]
```

### 3.2 Tab 1: API Catalogue (Screenshot: Discovery page)

**Top Controls:**
- Refresh button
- Time filter: `24 Hours` / `7 Days` radio
- Download button

**Summary Panel** (collapsible with ▼):

| Card | Content |
|------|---------|
| APIs Discovered | **179** ↕ with breakdown: Shadow(0), Sensitive(14↕), New(1), Public(179↕), Blocked(0), Non Conforming(0), Privilege(17↕), Unused(0), UnAuth(56↕) |
| API Risk Distribution | Donut chart with center number (177). Legend: Low(0), Medium(0), High(52), Critical(125) |
| First Discovered | Donut chart: <6 Hours(0), 6-12 Hours(0), >12 Hours(179) |
| Last Observed | Donut chart: <6 Hours(0), 6-12 Hours(0), >12 Hours(179) |
| Method Distribution | Donut chart: GET(5, green), POST(174, orange), DELETE(0, pink), Others(0, gray) |
| APIs Inspected / Traffic | Line chart over time (Mar 1–4). Labels: APIs Inspected: 24.3K, Content: 3.x, Client Errors: 15K, Server Errors: 3 |

**APIs List Table:**
| Column | Description |
|--------|-------------|
| ☐ | Checkbox for bulk select |
| Characteristics | Row of colored icons (shield, lock, alert, etc.) |
| Endpoint | Method + path, e.g., `POST /norenwclientweb/forgotpassword` with copy icon |
| Host | Domain, e.g., `fs-uat-asp-dx.finspot.in` |
| First Discovered | Datetime |
| ↕ | Sort indicator |
| Last Observed | Datetime |
| Auth | `Unauth` badge |
| Risk Score | `Critical` (red text) |
| Notes | Status notes, e.g., `504 gateway` |

**Table Controls:**
- Items per page dropdown (10)
- Pagination: `1 – 10 of 179` with nav arrows
- Filter button
- Grid/list toggle icon

### 3.3 Tab 2: Parameter Catalogue
- Parameter-level inventory across all APIs
- Data type classification per parameter
- Sensitive data tagging

### 3.4 Tab 3: API Governance (Screenshot: Governance page)

**Top Bar:**
- Severity filter pills: `Critical(4)`, `Major(1)`, `Move(1)`, `Info(—)`
- Status filter: `Open(7)`, `In Review(0)`, `Reviewed(0)`, `Ignored(0)`
- Toggle: "Show Closed Events" / "Show Aggregation"

**Governance List Table:**
| Column | Description |
|--------|-------------|
| ☐ | Checkbox |
| Severity | Colored badge icon |
| Endpoint | API path |
| Timestamp | Date/time |
| Event ID | Numeric ID |
| Sub Category | E.g., `Sensitive Info`, `New Parameters` |
| Summary | Description text |
| Status | Open/Reviewed/etc. |

### 3.5 Tab 4: API Sequence Flow
- Visual flow diagram showing API call sequences
- Request chain visualization

### 3.6 Tab 5: API Tree
- Hierarchical tree view of API endpoints
- Grouped by host/path segments

---

## PHASE 4: Security Testing Module
**Week 5-7**

### 4.1 Testing Page — 4 Tab Navigation
```
[Vulnerabilities] [Test Dashboard] [Configuration] [Test Inspector]
```

### 4.2 Tab 1: Vulnerabilities (Screenshot: Testing page)

**Top Controls:**
- Refresh button
- Toggle: "Show Resolved Events"
- Toggle: "Show Aggregation" (checked, green)
- Time filter: `24 Hours` / `7 Days`

**Summary Panel** (collapsible ▼):

| Card | Content |
|------|---------|
| Total | **131** ↕ — Open/Analyzed: **26** ↕ — Resolved: **14** ↕ |
| Timeline Chart | Tabs: Total:131 / Open/In Progress:26 / Resolved:14. Line chart (Feb 14 – Mar 7) |
| Severity | Donut: Critical(2, pink), Major(16, orange), Minor(8, yellow), Info(0, teal) |
| Status | Donut: Open(5, pink), False Positive(91, orange), Analyzed(21, yellow), Risk Accepted(0, purple), Resolved(14, green) |
| Vulnerability Engines | Passive Scan: 5, Active Scan: 21, Runtime Scan: 0 — carousel (< > arrows) |

**Vulnerability List Table:**
| Column | Description |
|--------|-------------|
| ☐ | Checkbox |
| Severity | Numbered colored badge (1 = Critical) |
| Endpoint | Method + path with copy icon |
| Timestamp | Date/time with sort ↕ |
| Event ID | Numeric |
| Category | `ActiveScan`, `PassiveScan`, `RuntimeScan` |
| Sub Category | `NoSQL Injection`, `Cross Site Scripting`, etc. |
| Summary | Description text |
| Status | `Analyzed`, `Open`, `Resolved`, etc. |
| Last Observed | Date |

**Table Controls:**
- Revalidate button
- Download dropdown
- Items: 10 dropdown
- Pagination: `1 – 10 of 26`
- Filter button

### 4.3 Tab 2: Test Dashboard
- Test execution overview
- Scan progress indicators
- Test history

### 4.4 Tab 3: Configuration
- Test configuration settings
- Scan scope selection
- Auth token setup
- Schedule management

### 4.5 Tab 4: Test Inspector
- Detailed test request/response viewer
- Proof of concept display
- Remediation guidance

---

## PHASE 5: Runtime Protection Module
**Week 7-9**

### 5.1 Protection Page — 5 Tab Navigation
```
[Security Events] [Threat Actors] [Enforcement History] [Policy Configuration] [Settings]
```

### 5.2 Tab 1: Security Events (Screenshot: Protection > Security Events)

**Top Controls:**
- Refresh button
- Toggle: "Show Resolved Events"
- Toggle: "Show Aggregation" (checked)
- Time filter: `24 Hours` / `7 Days`

**Summary Panel:**

| Card | Content |
|------|---------|
| Total Security Events | Count + breakdown: Blocked (pink), Client Errors 4XX (orange), Successful 200 Ok (green), Server Errors 5XX (red) |
| Timeline Chart | Tabs: Total / Blocked/Client Errors / Successful/Server Errors. Bar chart (Mar 1–7) |
| Severity | Donut: Critical, Major, Minor, Info |
| Status | Donut: Open, False Positive, Analyzed, Risk Accepted, Resolved |
| Age | Donut: < 1 Day (pink), 1-3 Days (orange), > 3 Days (yellow) |
| Top Event Categories | Carousel (< > arrows) |

**Events List Table:**
| Column | Description |
|--------|-------------|
| ☐ | Checkbox |
| Severity | Colored badge |
| Action | Action taken |
| Endpoint | API path |
| Timestamp | With sort ↕ |
| Event ID | Numeric |
| HTTP Response | Status code |
| Category | Attack category |
| Sub Category | Specific attack type |
| Summary | Description |

**Controls:** Last 90 days filter, "Show Successful Events Only" toggle, Download, Items dropdown, Pagination, Filter

### 5.3 Tab 2: Threat Actors (Screenshot: Protection > Threat Actors)

**Summary Panel:**

| Card | Content |
|------|---------|
| Total / Blocked / Whitelisted | Stacked counts |
| State | Donut: Block Threat Actor (pink), Timed Block (orange), Monitor (yellow), Whitelist (teal) |
| Threat-Level | Donut: High (pink), Medium (orange), Low (yellow) |
| Activity | Donut: < 6 Hours, 6-12 Hours, > 12 Hours |
| Last State Transition | Donut: < 6 Hours, 6-12 Hours, > 12 Hours |
| Top Attack Techniques | Carousel (< > arrows) |
| Geolocation | World map visualization |

**Threats Table** (Last 30 Days):
| Column | Description |
|--------|-------------|
| ☐ | Checkbox |
| Monitored User | User identifier |
| Risk | Risk level ↕ |
| Attempts | Attack attempt count |
| Tactics | Attack tactics used |
| Techniques Used | Specific techniques |
| Geolocation | Origin location |
| State | Block/Monitor/Whitelist |
| Last State Transition | Datetime |
| First Discovered | Datetime |

### 5.4 Tab 3: Enforcement History
- Log of all enforcement actions (blocks, rate limits)
- Timeline view of actions taken

### 5.5 Tab 4: Policy Configuration
- Security policy rules
- Block/allow rules
- Rate limiting configuration
- Schema enforcement rules

### 5.6 Tab 5: Settings
- Protection module settings
- Notification preferences
- Threshold configuration

---

## PHASE 6: Reports / Insights Module
**Week 9-10**

### 6.1 Reports Page (Screenshot: Reports/Insights)

**Top Bar:**
- "New Report" button (orange)
- Time filter

**Reports Table:**
| Column | Description |
|--------|-------------|
| Report Title | E.g., "DAST Coverage Summary Report", "Vulnerability Summary Report", "API Visibility Report", "Application Summary Report" |
| Report Type | `Test Vulnerability Coverage Report`, `Vulnerability Summary Report`, `Scheduled Report`, `Visibility Report`, `Application Summary Report` |
| Requested By | Email address |
| Requested Date | Datetime |
| Report Occurrence | Frequency |
| Duration From/To | Date range |
| Status | Generation status |
| Actions | View/Download |

**Report Types Available:**
1. Test Vulnerability Coverage Report (Weekly)
2. DAST Coverage Summary Report
3. Vulnerability Summary Report (Weekly/Monthly)
4. API Visibility Report (Weekly)
5. Application Summary Report (Weekly)
6. Monthly Report

---

## PHASE 7: Admin Dashboard — Settings
**Week 10-12**

### 7.1 Settings Page (Screenshot: Settings)

**Search Bar:** "Search settings..."

**Section 1: Access & Identity**
| Card | Icon | Title | Description |
|------|------|-------|-------------|
| 1 | Orange grid icon | **Manage Applications** | Add and register new applications, assign them to users or groups, and remove applications no longer in use |
| 2 | Orange people icon | **User & Role Administration** | Manage organizational users, update role assignments, and deactivate or delete accounts |
| 3 | Orange key icon | **API Keys Management** | Securely create, manage, and rotate API keys used across the organization |
| 4 | Orange IP icon | **Private/Internal IPs** | Define IP ranges owned by your organization |

**Section 2: Platform & Infrastructure**
| Card | Icon | Title | Description |
|------|------|-------|-------------|
| 1 | Orange antenna icon | **Controller & Sensor Configuration** | Configure and manage controller and sensor settings, define ingress filters, and monitor statistics |
| 2 | Orange license icon | **License Usage** | Monitor license consumption and track active usage |

**Section 3: Security & Governance**
- Additional security configuration cards (partially visible)

### 7.2 Manage Applications
- Application CRUD (create, assign, remove)
- Assign apps to users/groups
- App environment configuration

### 7.3 User & Role Administration
- User list with roles
- Role assignment (Admin, Analyst, Viewer)
- Invite users
- Deactivate/delete accounts

### 7.4 API Keys Management
- Create/rotate/revoke API keys
- Key usage tracking
- Permission scoping per key

### 7.5 Private/Internal IPs
- IP range definitions
- Internal vs external classification
- Used for shadow API detection

### 7.6 Controller & Sensor Configuration
- Sensor deployment settings
- Ingress filter definitions
- Traffic mirroring config
- Sensor statistics monitoring

### 7.7 License Usage
- License consumption dashboard
- Active usage metrics
- Usage quotas

---

## PHASE 8: Admin Dashboard — System Health
**Week 12-13**

### 8.1 System Health Page — 3 Tab Navigation
(Screenshot: System Health)
```
[Controller Health] [Sensor Health] [Enforcer Health]
```

### 8.2 Tab 1: Controller Health

**Table:**
| Column | Description |
|--------|-------------|
| Host Name | E.g., `fs-prod-asp-dx-appsentinels-ps` |
| App Domain | E.g., `FINSPOTNEWPROD`, `FINSPOTUAT` |
| Applications | E.g., `finspot_new_prod`, `finspot_kambala` |
| IP Address | Public IP |
| Internal IP Address | Private IP (e.g., `172.18.0.2`) |
| Status | **Up** (green) / **Down** (red) |
| Last Heartbeat | Datetime (e.g., `07/03/2026 14:09`) |
| OPC Policy Version | Version numbers (e.g., `353959/353959`) |
| Latest Policy Version | Version number |
| Policy Sync Time | Last sync datetime |

**Controls:** Refresh button, Items per page (10), Pagination (`1 – 5 of 5`)

### 8.3 Tab 2: Sensor Health
- Similar table structure for sensors
- Sensor status, connectivity, data throughput

### 8.4 Tab 3: Enforcer Health
- Enforcer nodes status
- Enforcement action statistics
- Policy sync status

---

## PHASE 9: Admin Dashboard — Operations Dashboard
**Week 13-14**

### 9.1 Operations Dashboard — 4 Tab Navigation
(Screenshot: Operations Dashboard)
```
[System] [Config] [Sec-Ops] [Global Training]
```

**Last Updated** timestamp top-right

### 9.2 Tab 1: System

**Table:**
| Column | Description |
|--------|-------------|
| Organization | Org name (e.g., `finspot`) |
| Application | App name |
| Controller ID | Unique ID |
| Controller Hostname | FQDN |
| Controller Version | Version string |
| Uptime | Duration |
| CPU Usage | Percentage + bar (e.g., `ControlPlane: XX%`, `Process Started: XX%`) |
| Storage | Disk usage breakdown |
| Health (Last 5m) | Health indicator |
| Policy Version/Sync | Version numbers |

### 9.3 Tab 2: Config
- Configuration management across tenants

### 9.4 Tab 3: Sec-Ops
- Security operations overview across all tenants

### 9.5 Tab 4: Global Training
- ML model training status
- Training data statistics

---

## PHASE 10: Shared UI Components
**Week 1-2 (parallel with Phase 1)**

### 10.1 Summary Panel Component
Reusable collapsible summary panel (▼ Summary) used across all pages:
- Grid of metric cards
- Each card: Title + value + optional trend arrow (↕)
- Donut chart cards with legend
- Line/bar chart cards
- Carousel cards with < > navigation
- Geolocation map card

### 10.2 Data Table Component
Shared table with exact AppSentinels style:
- Checkbox column for bulk select
- Sortable columns (↕ icon)
- Color-coded severity badges
- Copy-to-clipboard on endpoint cells
- Characteristic icons row (security icons)
- Pagination: `Items [10 ▼] | 1 – 10 of N | < > arrows`
- Filter button (top-right)
- Download button with dropdown
- Grid/list view toggle

### 10.3 Donut Chart Component
- Ring-style donut (not filled pie)
- Center number (total count)
- Color-coded legend below with counts
- Severity palette: Critical(pink) → Major(orange) → Minor(yellow) → Info(teal)

### 10.4 Time Filter Component
- Radio toggle: `⦿ 24 Hours` / `○ 7 Days`
- Orange dot on selected option

### 10.5 Navigation Components
- Sidebar: Narrow icon-based, orange active border
- Tab bar: Horizontal tabs with orange underline on active
- Breadcrumb: `org > section > page` format

---

## Architecture Decision

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Frontend | React 18 + TypeScript + Vite | Modern, matches Akto ecosystem |
| Styling | Tailwind CSS 3 (dark theme) | Exact dark theme replication |
| Charts | Recharts (donuts, lines, bars) + react-simple-maps (geo) | All chart types needed |
| State | Zustand + React Query | Lightweight + server state caching |
| Routing | React Router v6 | Nested layouts for tabs |
| Tables | TanStack Table v8 | Sort, filter, pagination, selection |
| Forms | React Hook Form + Zod | Validation |
| Real-time | WebSocket | Live threat monitoring |
| Backend | Existing Akto Java APIs + Node.js BFF | Leverage existing services |
| Database | MongoDB 6.0 (existing) | Already in Akto stack |
| Auth | JWT + RBAC (existing Akto) | Already built |

---

## Database Schema (MongoDB Collections)

```
# Discovery
api_catalogue              - Discovered API endpoints with risk scores
parameter_catalogue        - Parameters across all APIs
api_governance             - Governance events/findings
api_sequences              - API call sequence flows
api_tree                   - Hierarchical API structure

# Testing
vulnerabilities            - Vulnerability findings (Active/Passive/Runtime scan)
test_runs                  - Test execution history
test_configurations        - Scan configuration per app
test_inspector_data        - Detailed test request/response data

# Protection
security_events            - Runtime security events
threat_actors              - Monitored threat actors with state
enforcement_history        - Block/allow enforcement log
policy_configurations      - Security policy rules
protection_settings        - Protection module settings

# Reports
report_definitions         - Report templates and schedules
report_instances           - Generated report instances
report_schedules           - Recurring report schedules

# Admin — Settings
applications               - Registered applications
user_roles                 - User-role mappings
api_keys                   - API key inventory
private_ips                - Internal IP ranges
controller_sensors         - Controller & sensor configs
license_usage              - License consumption tracking

# Admin — System Health
controller_health          - Controller heartbeats & status
sensor_health              - Sensor status & metrics
enforcer_health            - Enforcer node status

# Admin — Operations
operations_system          - System-level metrics per org
operations_config          - Configuration state
operations_secops          - Security operations data
global_training            - ML training status
```

---

## API Endpoints (BFF Layer)

### Auth
```
POST   /api/auth/login
POST   /api/auth/logout
POST   /api/auth/refresh
GET    /api/auth/me
```

### Organization / Applications
```
GET    /api/organizations
GET    /api/organizations/:id/applications
GET    /api/applications/:id/dashboard
GET    /api/applications/:id/summary
```

### Discovery
```
GET    /api/discovery/api-catalogue?app=X&timeRange=24h
GET    /api/discovery/api-catalogue/:id
GET    /api/discovery/parameter-catalogue?app=X
GET    /api/discovery/governance?app=X
GET    /api/discovery/sequence-flow?app=X
GET    /api/discovery/api-tree?app=X
GET    /api/discovery/summary?app=X
```

### Testing
```
GET    /api/testing/vulnerabilities?app=X&timeRange=24h
GET    /api/testing/vulnerabilities/:id
POST   /api/testing/vulnerabilities/revalidate
GET    /api/testing/dashboard?app=X
GET    /api/testing/configuration?app=X
PUT    /api/testing/configuration?app=X
GET    /api/testing/inspector/:eventId
```

### Protection
```
GET    /api/protection/security-events?app=X&days=90
GET    /api/protection/threat-actors?app=X&days=30
GET    /api/protection/enforcement-history?app=X
GET    /api/protection/policy-configuration?app=X
PUT    /api/protection/policy-configuration?app=X
GET    /api/protection/settings?app=X
PUT    /api/protection/settings?app=X
```

### Reports
```
GET    /api/reports?app=X
POST   /api/reports/generate
GET    /api/reports/:id/download
GET    /api/reports/types
POST   /api/reports/schedule
```

### Admin — Settings
```
GET    /api/admin/applications
POST   /api/admin/applications
PUT    /api/admin/applications/:id
DELETE /api/admin/applications/:id
GET    /api/admin/users
POST   /api/admin/users/invite
PUT    /api/admin/users/:id/role
DELETE /api/admin/users/:id
GET    /api/admin/api-keys
POST   /api/admin/api-keys
DELETE /api/admin/api-keys/:id
GET    /api/admin/private-ips
POST   /api/admin/private-ips
GET    /api/admin/controllers
PUT    /api/admin/controllers/:id/config
GET    /api/admin/license-usage
```

### Admin — System Health
```
GET    /api/admin/health/controllers
GET    /api/admin/health/sensors
GET    /api/admin/health/enforcers
```

### Admin — Operations
```
GET    /api/admin/operations/system
GET    /api/admin/operations/config
GET    /api/admin/operations/secops
GET    /api/admin/operations/training
```

---

## Implementation Priority

| Priority | Phase | What | Pages |
|----------|-------|------|-------|
| **P0** | 1 | Foundation + Auth + Layout Shell | 3 |
| **P0** | 2 | Organization Home + Main Dashboard | 2 |
| **P0** | 3 | Discovery (5 tabs) | 5 |
| **P0** | 10 | Shared UI Components (parallel) | — |
| **P1** | 4 | Testing (4 tabs) | 4 |
| **P1** | 5 | Protection (5 tabs) | 5 |
| **P1** | 6 | Reports | 1 |
| **P2** | 7 | Admin Settings (6 sub-pages) | 7 |
| **P2** | 8 | Admin System Health (3 tabs) | 3 |
| **P2** | 9 | Admin Operations (4 tabs) | 4 |
| | | **TOTAL** | **~34 pages** |

---

## Exact Page-by-Page Build Checklist

### Customer Portal (22 pages)
```
[ ] Login / Auth page
[ ] Access Restricted page
[ ] Organization Home (Applications list + summary)
[ ] Dashboard — Monitored Users Summary + Security Events Summary
[ ] Discovery > API Catalogue (summary + APIs list table)
[ ] Discovery > Parameter Catalogue
[ ] Discovery > API Governance (governance list table)
[ ] Discovery > API Sequence Flow
[ ] Discovery > API Tree
[ ] Testing > Vulnerabilities (summary + vulnerability list table)
[ ] Testing > Test Dashboard
[ ] Testing > Configuration
[ ] Testing > Test Inspector
[ ] Protection > Security Events (summary + events list table)
[ ] Protection > Threat Actors (summary + threats table + geo map)
[ ] Protection > Enforcement History
[ ] Protection > Policy Configuration
[ ] Protection > Settings
[ ] Reports > Insights (reports list table + new report)
```

### Admin Portal (12 pages)
```
[ ] Settings > Manage Applications
[ ] Settings > User & Role Administration
[ ] Settings > API Keys Management
[ ] Settings > Private/Internal IPs
[ ] Settings > Controller & Sensor Configuration
[ ] Settings > License Usage
[ ] Settings > Security & Governance
[ ] System Health > Controller Health (table)
[ ] System Health > Sensor Health (table)
[ ] System Health > Enforcer Health (table)
[ ] Operations > System (table)
[ ] Operations > Config
[ ] Operations > Sec-Ops
[ ] Operations > Global Training
```

---

## Tech Stack

```
Frontend:    React 18 + TypeScript + Vite
Styling:     Tailwind CSS 3 (custom dark theme)
Charts:      Recharts + react-simple-maps
State:       Zustand + TanStack React Query
Routing:     React Router v6 (nested)
Tables:      TanStack Table v8
Forms:       React Hook Form + Zod
Icons:       Lucide React
Real-time:   WebSocket (native)
Backend:     Existing Akto Java + Node.js BFF (Fastify)
Database:    MongoDB 6.0
Auth:        JWT + RBAC
Testing:     Vitest + React Testing Library
Build:       Vite + Docker
Deploy:      Docker Compose
```
