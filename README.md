# CCS Consultation Booking System

Students book consultations with faculty; faculty approve or decline and see their daily schedule.

**Stack:** Node.js, Express, EJS, SQLite (better-sqlite3), express-session, bcryptjs, dotenv.

## Run it

```bash
npm install
cp .env.example .env     # then set SESSION_SECRET
npm start                # http://localhost:3000
```

The database file is created in `data/` on first run, with demo data.

## Demo logins

| Role    | ID         | Password     |
|---------|------------|--------------|
| Student | 2026-0001  | student123   |
| Faculty | FAC-001    | faculty123   |
| Admin   | ADMIN      | admin123     |

The admin logs in from the **Administrator login** link under the login form. Change the demo passwords before any real use.

Databases created before the admin role existed are upgraded automatically on start (existing data is kept and the admin account is added).
Other students: 2026-0002, 2026-0003. Other faculty: FAC-002, FAC-003 (on leave).
To start clean, delete the `data/` folder and remove the `seed()` call in `db.js`.

## Flow

1. Login page: choose **Student** or **Faculty**, the matching form appears. Students without an account use **Create an account**.
2. Student Home lists professors. **View schedule** opens a panel: pick day, pick time, **Confirm booking**. A **BOOKING CONFIRMED** dialog appears and the request is stored as *pending* for the professor.
3. **Find Faculty** searches by name or subject. **My appointments** lists bookings and lets students cancel.
4. **Admin** (Administrator login link): the dashboard shows totals, bookings by status, the busiest professors, the latest bookings and a log of admin actions. **Professors** adds, edits (including password reset) and deletes faculty accounts and can create their first consultation slots. **Students** lists and deletes student accounts. **Records** lists every booking, with search, status and date filters, cancel, and CSV export.
5. Faculty Dashboard shows Pending requests, Today, Later this week, Completed, the pending request cards (Approve / Decline) and today's schedule with student and topic. **My availability** manages slots and leave.

## Access control

- Sessions via express-session (httpOnly cookie, regenerated on login, destroyed on logout).
- `/student/*` is student-only, `/faculty/*` is faculty-only and `/admin/*` is admin-only; the wrong role gets a 403 page, no session redirects to login.
- Passwords are hashed with bcryptjs. All queries are parameterized.
- A partial unique index in SQLite prevents two active bookings of the same slot.

## Files

```
server.js            app setup, sessions
db.js                schema + demo data
routes/              auth, student, faculty, admin
middleware/auth.js   role guard, status housekeeping
utils/               dates, faculty/slot logic, nav
views/               EJS pages and partials
public/              css, client JS
docs/requirements.md Requirements Document
```
