# Explainable Predictive Maintenance and Recommendation System (React + Node.js)

A full-stack rebuild of the predictive-maintenance dashboard: **React** frontend,
**Node.js/Express** API backend, **MySQL** storage, and a **Python/FastAPI**
microservice that serves the trained XGBoost + SHAP models (unchanged from the
original implementation — Node can't run scikit-learn/XGBoost/SHAP natively, so
those stay in Python behind a small internal API that only the Node backend calls).

All original features are preserved exactly: CSV upload with validation and
daily-snapshot replace mode, 6 ML models (overall failure + 5 failure modes),
SHAP explainability, the what-if simulator with lower-risk search, the
rule-based recommendation engine (with machine ID shown per recommendation),
human-approved simulated maintenance tasks, model monitoring, and role-based
login/signup. Nothing was removed or changed behaviorally — only the UI layer
and API transport changed.

**New in this version:** an interactive, animated SVG illustration of each
specific machine — gear rotation speed reflects that machine's actual
rotational speed, the wear bar reflects its tool wear, and color/pulsing
reflects its live risk status. See `frontend/src/components/MachineAvatar.jsx`.

> ⚠️ This system is a decision-support and simulation platform only. It never
> automatically controls or stops a real machine. Every maintenance task
> requires explicit human approval.

---

## 1. Architecture

```text
┌─────────────┐      REST/JWT      ┌──────────────┐     REST (internal)    ┌──────────────┐
│   React     │  ───────────────►  │  Node.js /   │  ──────────────────►   │  Python /    │
│  (Vite)     │  ◄───────────────  │  Express API │  ◄──────────────────   │  FastAPI     │
│  frontend/  │                    │  backend/    │                        │  ml-service/ │
└─────────────┘                    └──────┬───────┘                        └──────────────┘
                                           │                                  (XGBoost, SHAP,
                                           ▼                                   trained models)
                                     ┌──────────┐
                                     │  MySQL   │
                                     └──────────┘
```

- **`frontend/`** — React 19 + Vite, React Router, Recharts for charts, plain CSS (no UI
  framework) matching the original design language (gradient heroes, KPI tiles,
  glassmorphic cards). Talks only to the Node API, never to MySQL or the ML service directly.
- **`backend/`** — Express REST API. Owns MySQL (via `mysql2`), JWT auth (`bcryptjs` +
  `jsonwebtoken`), CSV ingestion/validation orchestration, and calls the ML service for
  anything that needs the trained models.
- **`ml-service/`** — FastAPI wrapper around the **exact same** `src/` Python modules from
  the original project (`prediction.py`, `explainability.py`, `recommendation_engine.py`,
  `what_if.py`, `validation.py`, `train_models.py`) — nothing in the ML logic was rewritten,
  only exposed over HTTP.

## 2. Why a Python microservice instead of pure Node?

XGBoost's trained booster and SHAP's `TreeExplainer` are Python-only. Reimplementing
gradient-boosted trees and SHAP value computation in JavaScript would risk silently
diverging from the original model's behavior. Keeping `ml-service` as a thin, internal-only
HTTP wrapper around the unmodified Python code guarantees predictions, SHAP values, and
recommendations are identical to the original system, while the entire user-facing surface
(UI + API + auth + business logic) is now React/Node as requested.

## 3. Setup

### Prerequisites
- Node.js 20+
- Python 3.11+
- MySQL 8+

### 3.1 Database

```bash
mysql -u root -p < backend/setup.sql      # creates DB + app user
cd backend
cp .env.example .env                      # edit with your MySQL credentials
npm install
npm run migrate                           # creates all tables (schema.sql)
```

### 3.2 ML service (Python)

```bash
cd ml-service
python3 -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Trained models + a simulated AI4I-2020-style dataset are already included in
# models/ and data/. To retrain: python -m src.train_models
uvicorn main:app --host 0.0.0.0 --port 8001
```

### 3.3 Backend (Node.js)

```bash
cd backend
# .env already configured in step 3.1
npm run dev        # or `npm start`
# Listens on http://localhost:4000, calls ml-service at http://127.0.0.1:8001
```

### 3.4 Frontend (React)

```bash
cd frontend
cp .env.example .env      # VITE_API_BASE_URL=http://localhost:4000/api
npm install
npm run dev                # http://localhost:5173
```

Open `http://localhost:5173`, create an account (pick your role), log in, then go to
**CSV Upload** → upload `ml-service/data/ai4i2020.csv` → **Run Prediction**.

## 4. Project structure

```text
fullstack/
├── ml-service/            # FastAPI wrapper around the unmodified ML logic
│   ├── main.py
│   ├── src/                (prediction, explainability, recommendation_engine,
│   │                        what_if, validation, preprocessing, config, train_models)
│   ├── models/              trained XGBoost/SHAP artifacts (*.pkl)
│   ├── data/                 ai4i2020.csv (simulated) + generator
│   └── requirements.txt
│
├── backend/                # Express REST API
│   ├── src/
│   │   ├── server.js
│   │   ├── config/           env.js, db.js
│   │   ├── middleware/       auth.js (JWT)
│   │   ├── routes/           auth, upload, predictions, shap, whatif,
│   │   │                     recommendations, tasks, monitoring, fleet
│   │   ├── services/         ingestionService.js, mlClient.js
│   │   ├── utils/             machineId.js, readingMapper.js
│   │   └── scripts/           migrate.js
│   ├── schema.sql / setup.sql
│   └── package.json
│
└── frontend/                # React + Vite
    └── src/
        ├── api/               client.js (axios + JWT interceptor)
        ├── context/           AuthContext.jsx
        ├── components/        MachineAvatar.jsx, GaugeChart.jsx, Atoms.jsx,
        │                      Layout.jsx, ProtectedRoute.jsx
        ├── pages/              Login, Home, FleetOverview, CsvUpload,
        │                      MachinePrediction, ShapExplanation, WhatIfSimulator,
        │                      Recommendations, MaintenanceTasks, ModelMonitoring
        ├── App.jsx / main.jsx
        └── index.css           (shared design system)
```

## 5. Feature parity with the original Streamlit version

| Feature | Where it lives now |
|---|---|
| Login / signup, per-role accounts (bcrypt-hashed passwords) | `backend/src/routes/auth.js`, `app_users` table |
| CSV upload, validation, daily-snapshot replace mode, stable machine IDs | `backend/src/routes/upload.js`, `services/ingestionService.js`, `utils/machineId.js` |
| 6 ML models (overall + TWF/HDF/PWF/OSF/RNF), XGBoost + Logistic Regression | `ml-service/src/train_models.py` (unchanged) |
| SHAP global + local explanations, plain-language summary | `ml-service/src/explainability.py` (unchanged), `frontend/src/pages/ShapExplanation.jsx` |
| What-if simulator + "find lower-risk scenario" search | `ml-service/src/what_if.py` (unchanged), `frontend/src/pages/WhatIfSimulator.jsx` |
| Rule-based recommendation engine, ranked, **machine ID shown per card** | `ml-service/src/recommendation_engine.py` (unchanged), `frontend/src/pages/Recommendations.jsx` |
| Human-approved simulated maintenance tasks | `backend/src/routes/tasks.js`, `frontend/src/pages/MaintenanceTasks.jsx` |
| Model monitoring, prediction history, feedback loop | `backend/src/routes/monitoring.js`, `frontend/src/pages/ModelMonitoring.jsx` |
| Risk thresholds (Healthy/Warning/Critical) | `backend/src/config/env.js` + `ml-service/src/config.py` (keep both in sync) |

## 6. New: animated per-machine visuals

`frontend/src/components/MachineAvatar.jsx` renders a small industrial-machine SVG for
each specific machine:
- Gear rotation speed is computed from that machine's actual `Rotational speed [rpm]`.
- The wear bar fills according to its `Tool wear [min]`.
- Body color, glow, and the status light reflect its current Healthy/Warning/Critical status.
- Critical machines shake subtly to draw attention.
- Hovering lifts/scales the card and shows a tooltip with key readings; clicking a machine
  on Fleet Overview jumps straight to its detail page (Machine Prediction).

It's used as a compact grid on **Fleet Overview** (whole-fleet glance) and as a large,
detailed hero visual on **Machine Prediction** (single-machine focus).

## 7. Security

- Passwords hashed with `bcryptjs` (cost factor 12), never stored in plain text.
- JWT-based sessions (`backend/src/middleware/auth.js`); every API route except
  `/auth/signup` and `/auth/login` requires a valid bearer token.
- No hard-coded credentials — everything comes from `.env` files (`.env.example`
  provided for each service; `.env` is git-ignored).
- All SQL goes through parameterized `mysql2` queries — no string-built SQL.
- CSV validation happens before any DB write, via the single source of truth in
  `ml-service` (`src/validation.py`), reused unchanged from the original project.
- CORS is restricted to `CORS_ORIGIN` (defaults to the Vite dev server origin).

## 8. Testing this build

This build was verified end-to-end in a live environment: MySQL was started, all three
services were run together, and the full flow was exercised via HTTP — signup, login,
CSV upload (validation → MySQL), running predictions (XGBoost → SHAP → recommendations,
all persisted), fetching the fleet summary, recommendations (with machine IDs), a
what-if comparison, and a SHAP explanation — all returned correct results matching the
original Python/Streamlit implementation's behavior.

## 9. Notes

- The included dataset (`ml-service/data/ai4i2020.csv`) is **simulated** (UCI's servers
  aren't reachable from this environment) but matches the real AI4I 2020 schema. Swap in
  the real dataset and retrain for production use — see the original project's dataset
  section for details.
- `ML_SERVICE_URL` in `backend/.env` must point at wherever `ml-service` is running; in
  production, run it as an internal-only service (not exposed publicly) since it has no
  auth of its own — the Node backend is its only intended caller.

---

## 10. Troubleshooting & fixes applied

### `Prediction run failed: ML service error (500): Internal Server Error`

This was caused by three distinct crashes in the ML service, all now fixed.
Bad input returns an actionable **400** instead of an opaque 500, and unhandled
errors now return their real message (`{"detail": "TypeError: ..."}`) so the
Node logs tell you what actually went wrong.

| Root cause | Symptom | Fix |
|---|---|---|
| NaN / Infinity in a response body | `ValueError: Out of range float values are not JSON compliant: nan` | All responses go through `sanitize_json` (`src/io_utils.py`), which converts NaN/Inf to `null` and NumPy scalars to native Python types |
| String-typed numbers from a CSV parser (`"60.0"`) | `TypeError: can't multiply sequence by non-int of type 'float'` (feature engineering multiplied a *string*) | `coerce_reading` casts every sensor feature to `float` before it reaches pandas/NumPy |
| Missing or misnamed column | `KeyError: "['Tool wear [min]'] not in index"` | `coerce_reading` returns `400 Missing required column(s): Tool wear [min]` naming the exact column (and row index in a batch) |
| Lowercase `Type` (`l/m/h`) | *No error* — but produced an all-zero one-hot, i.e. a silently **wrong** prediction | `Type` is normalized to uppercase and validated against `L/M/H`; unknown values now return 400 |

### Performance: large uploads

The prediction run previously issued **two HTTP calls per reading** (one
`/explain`, one `/recommendations`), so a 10,000-row upload meant ~20,000
sequential round-trips. It now uses batch endpoints (`/explain/batch`,
`/recommendations/batch`) and bulk `INSERT`s, processing readings in chunks of
`PREDICTION_CHUNK_SIZE` (default 250).

Measured on the included 10,000-row dataset: **10,000 readings scored in ~74s**
(1,000 rows in ~8s), producing 10,000 predictions, 50,000 failure-mode rows,
100,000 SHAP rows, and the corresponding recommendations.

Timeouts were raised to match: `ML_SERVICE_TIMEOUT_MS` (backend, default
600000) and `VITE_API_TIMEOUT_MS` (frontend, default 900000).

### Running the ML-service regression tests

```bash
cd ml-service
pytest          # 23 tests covering every failure mode listed above
```

### Other things to check if a run fails

- **`503` from the ML service** — models aren't present. Run
  `python -m src.train_models` inside `ml-service/`.
- **`Could not reach ML service`** — `ML_SERVICE_URL` in `backend/.env` doesn't
  match where uvicorn is listening (default `http://127.0.0.1:8001`).
- **Reading not found (404)** on SHAP/what-if — reading IDs change after a
  replace-mode upload, since old rows are deleted and IDs auto-increment.
  Reload the page to pick up current IDs.

---

## 11. Antivirus warning on `.pkl` files (false positive)

If your scanner flagged this project, it was almost certainly the six
`models/*.pkl` files in an earlier build. **This package now contains no
binary files at all** — every file is plain-text source.

### Why pickles get flagged

`joblib` (used to save scikit-learn/XGBoost models) writes Python `pickle`
files. `pickle.load()` can execute arbitrary code during deserialization, so
scanners — Windows Defender, ClamAV, `picklescan`, ProtectAI `modelscan` —
flag the format heuristically, independent of what a given file contains.
It's a property of the file type, not evidence of infection.

### How this build avoids it

The models are no longer shipped. You generate them locally in one command:

```bash
cd ml-service
python -m src.train_models     # ~5-10 seconds
```

The models are then built on your machine by `src/train_models.py`, which you
can read. See `ml-service/models/README.md`.

### Verifying the package yourself

Everything in the zip is human-readable. To confirm there are no binaries:

```bash
# Linux/macOS - should print nothing
find . -type f ! -path "*/node_modules/*" \
  \( -name "*.pkl" -o -name "*.pyc" -o -name "*.exe" -o -name "*.dll" \
     -o -name "*.so" -o -name "*.bin" \)
```

```powershell
# Windows PowerShell - should return nothing
Get-ChildItem -Recurse -Include *.pkl,*.pyc,*.exe,*.dll,*.so,*.bin |
  Where-Object { $_.FullName -notmatch 'node_modules' }
```

A `SHA256SUMS.txt` manifest is included at the project root. Verify with:

```bash
sha256sum -c SHA256SUMS.txt      # Linux/macOS
```
```powershell
Get-FileHash .\backend\src\server.js -Algorithm SHA256   # Windows, spot-check
```

### A note on `npm install`

`node_modules/` is excluded from the package (standard practice), so
dependencies come from the public npm registry when you run `npm install`.
That's normal, but it does mean you're trusting npm's registry as usual — run
`npm audit` if you want a vulnerability report for the dependency tree.

---

## 12. Three-role maintenance workflow (Engineer → Technician → Manager)

The maintenance task lifecycle now enforces a strict three-role hand-off,
checked server-side on every write (not just hidden in the UI):

| Role | Can do | Cannot do |
|---|---|---|
| **Maintenance Engineer** | Approve/reject a recommendation (`PATCH /api/recommendations/:id/status`); create a task and assign it to a *registered, active* Maintenance Technician (`POST /api/tasks`) | Update a task's status afterward |
| **Maintenance Technician** | Move their own assigned tasks through **Open → In Progress → Completed** (`PATCH /api/tasks/:id`) | Touch another technician's task; set status to Verified; reassign a task |
| **Maintenance Manager** | Move a task from **Completed → Verified only** (`PATCH /api/tasks/:id`); view the dedicated "Completed — awaiting verification" list (`GET /api/tasks/awaiting-verification`) | Approve recommendations; create tasks; touch any other status transition |

Every rule above is enforced in `backend/src/routes/tasks.js` and
`backend/src/routes/recommendations.js` via `requireRole(...)`
(`backend/src/middleware/auth.js`) - a request from the wrong role gets a
`403` with a specific message, not just a hidden button.

### The assignee dropdown is real, not free text

`GET /api/users/technicians` (`backend/src/routes/users.js`) returns every
account that actually signed up with the Maintenance Technician role. An
Engineer can only pick from that list - `POST /api/tasks` independently
re-validates server-side that `assigned_to` is a registered, active
technician, so a bad or stale value can never slip through even if the UI is
bypassed.

### Verified live, three real accounts, every rule

This was tested end-to-end with three signed-up accounts (one per role)
against real MySQL - not just read through:

- Technician/Manager/Engineer each correctly **403'd** when attempting an
  action outside their role (approving, creating a task, skipping straight
  to Verified, etc.), with the exact messages shown above.
- Engineer creating a task with a non-existent username got `400 '...' is
  not a registered, active Maintenance Technician.`; assigning to the real
  `tech1` succeeded and the task carried `approved_by` set automatically
  from the engineer's own account (not a free-text field).
- `tech2` attempting to touch a task assigned to `tech1` got `403 You can
  only update tasks assigned to you.`
- The full chain **Open → In Progress → Completed → Verified** was driven
  end-to-end by the correct role at each step and the final row confirmed
  in MySQL.

### Frontend behavior per role (`frontend/src/pages/MaintenanceTasks.jsx`)

- **Engineer** sees "Approve & assign a recommendation" with a technician
  dropdown (sourced from `/api/users/technicians`) - never a text box.
- **Technician** sees "My assigned tasks" (auto-filtered to their own
  username) with one-click buttons to move between Open / In Progress /
  Completed.
- **Manager** sees a dedicated "Completed — awaiting verification" table
  with a Verify button, separate from the general task list.
- A shared, read-only "All tasks" / "Fleet work orders" table is visible to
  everyone underneath.

`frontend/src/pages/Recommendations.jsx` also hides the Approve/Reject
buttons for anyone who isn't a Maintenance Engineer, so the UI matches what
the API will actually allow.

## 13. SLA alerts, maintenance analytics, and upload lock-down

Three more rules on top of the three-role workflow above:

### 13.1 Engineer-set deadline → Technician overdue alert

When an Engineer creates a task (`POST /api/tasks`), they can set
`deadline_hours` (a plain number of hours, optional). The backend stores it
as `due_at = NOW() + deadline_hours` on the row. Every task list response
carries a computed `is_overdue` flag (`backend/src/routes/tasks.js`,
`OVERDUE_CASE_SQL`), and `GET /api/tasks/alerts` returns just the Technician's
own overdue tasks. `frontend/src/pages/MaintenanceTasks.jsx` polls that
endpoint and shows a red "⏰ N task(s) overdue" banner plus a per-row
"Overdue" badge on the Technician's own dashboard.

### 13.2 Fixed 24h manager-verification SLA

The moment a Technician moves a task to **Completed**, the backend stamps
`verification_due_at = NOW() + 24h` (`VERIFICATION_SLA_HOURS` in
`tasks.js`) in the same `PATCH /api/tasks/:id` call - no extra step needed.
`GET /api/tasks/alerts` returns, for a Manager, every Completed task whose
24h window has lapsed, and the Manager dashboard shows the matching overdue
banner/badge on its "Completed — awaiting verification" table.

### 13.3 Maintenance analytics dashboard

A new page, `frontend/src/pages/MaintenanceAnalytics.jsx` (route
`/analytics`, linked in the sidebar), calls `GET /api/tasks/analytics` and
shows:

- **Current vs. historical** task counts/status breakdown - tasks are
  tagged with the `uploaded_files.id` that was the active fleet batch when
  they were created (`upload_batch_id`), so this splits "currently done"
  (the latest uploaded fleet) from "previously done" (every earlier batch)
  without needing a second table - maintenance tasks already survive a
  fleet-replace CSV upload (see section 10), so the full history was always
  there to query.
- Average time-to-complete and time-to-verify, overdue counts, a breakdown
  by priority and by failure mode, and a daily created-vs-verified trend
  (last 90 days).

This is available to every role (read-only); only the Manager's own
"awaiting verification" list is role-restricted.

### 13.4 Upload is Manager/Engineer only

`POST /api/upload` now requires `requireRole("Maintenance Engineer",
"Maintenance Manager")` (`backend/src/routes/upload.js`). A Technician gets
a clean `403 This action is only available to: Maintenance Engineer,
Maintenance Manager.` `GET /api/upload/history` stays open to every role, so
a Technician can still see what's been uploaded and run/view predictions -
just not trigger a new ingest. `frontend/src/pages/CsvUpload.jsx` shows a
locked, read-only message instead of the upload form for a Technician.

### Verified live

All four pieces above were re-run end-to-end against a fresh MySQL schema
(`schema.sql`, including the new `deadline_hours` / `due_at` /
`verification_due_at` / `verified_at` / `upload_batch_id` columns) with real
accounts for each role:

- A Technician's `POST /api/upload` → `403`; a Manager's upload of a real
  AI4I-2020 CSV slice → `201`, scored by the ML service.
- An Engineer-created task with a ~1-second deadline showed up in the
  Technician's `GET /api/tasks/alerts` as `is_overdue: 1` once the deadline
  passed.
- Marking that task **Completed** stamped `verification_due_at` exactly 24h
  out, and it appeared in the Manager's `GET /api/tasks/awaiting-verification`.
- `GET /api/tasks/analytics` correctly grouped the task under `"current"`
  (today's upload batch) with the right priority/failure-mode/trend
  breakdown, after fixing a double-aliasing SQL bug (`AS is_overdue` nested
  inside another `AS is_overdue_flag`) that the live test caught.
- A Technician's `POST /api/tasks` → `403`, confirming they still cannot
  create/reassign tasks, matching the original three-role rules.
