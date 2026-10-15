const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const dates = require('./utils/dates');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'consultation.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const usersTable = (name) => `
CREATE TABLE ${name} (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  role          TEXT NOT NULL CHECK (role IN ('student', 'faculty', 'admin')),
  full_name     TEXT NOT NULL,
  student_id    TEXT UNIQUE,
  year_level    INTEGER,
  program       TEXT,
  email         TEXT NOT NULL UNIQUE,
  user_id       TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
)`;

// Databases created before the admin role existed have a CHECK constraint that
// rejects 'admin'. SQLite cannot alter a CHECK, so rebuild the table once
// (the documented create-copy-drop-rename procedure, keeping all existing rows).
function migrateUsersTable() {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
  if (!row || row.sql.includes("'admin'")) return;

  db.pragma('foreign_keys = OFF');
  try {
    db.exec('BEGIN');
    db.exec(usersTable('users_new'));
    db.exec(`INSERT INTO users_new (id, role, full_name, student_id, year_level, program, email, user_id, password_hash, created_at)
             SELECT id, role, full_name, student_id, year_level, program, email, user_id, password_hash, created_at FROM users`);
    db.exec('DROP TABLE users');
    db.exec('ALTER TABLE users_new RENAME TO users');
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

db.exec(`${usersTable('IF NOT EXISTS users')};

CREATE TABLE IF NOT EXISTS faculty_profiles (
  user_id        INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  subject        TEXT NOT NULL,
  room           TEXT NOT NULL,
  on_leave_until TEXT
);

CREATE TABLE IF NOT EXISTS availability (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  faculty_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day        TEXT NOT NULL CHECK (day IN ('Mon','Tue','Wed','Thu','Fri')),
  slot_time  TEXT NOT NULL,
  UNIQUE (faculty_id, day, slot_time)
);

CREATE TABLE IF NOT EXISTS appointments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  faculty_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  appt_date  TEXT NOT NULL,
  slot_time  TEXT NOT NULL,
  topic      TEXT NOT NULL DEFAULT 'Consultation',
  status     TEXT NOT NULL DEFAULT 'pending'
             CHECK (status IN ('pending','approved','declined','completed','cancelled','expired')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A faculty slot can only be held by one active (pending/approved) booking.
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_slot
  ON appointments (faculty_id, appt_date, slot_time)
  WHERE status IN ('pending', 'approved');

CREATE TABLE IF NOT EXISTS notify_requests (
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  faculty_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (student_id, faculty_id)
);

CREATE TABLE IF NOT EXISTS activity_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_name TEXT NOT NULL,
  action     TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
`);

migrateUsersTable();

// There must always be one administrator account.
function ensureAdmin() {
  if (db.prepare("SELECT 1 FROM users WHERE role = 'admin'").get()) return;
  db.prepare(`
    INSERT INTO users (role, full_name, email, user_id, password_hash)
    VALUES ('admin', 'System Administrator', 'admin@cspc.example.edu', 'ADMIN', ?)
  `).run(bcrypt.hashSync('admin123', 10));
}

// ---------------------------------------------------------------------------
// Demo data (only inserted when the database is empty). Delete this block if
// you want to start with a clean system.
// ---------------------------------------------------------------------------
function seed() {
  if (db.prepare('SELECT COUNT(*) AS c FROM users').get().c > 0) return;

  const insertUser = db.prepare(`
    INSERT INTO users (role, full_name, student_id, year_level, program, email, user_id, password_hash)
    VALUES (@role, @full_name, @student_id, @year_level, @program, @email, @user_id, @password_hash)
  `);
  const insertProfile = db.prepare('INSERT INTO faculty_profiles (user_id, subject, room, on_leave_until) VALUES (?, ?, ?, ?)');
  const insertSlot = db.prepare('INSERT INTO availability (faculty_id, day, slot_time) VALUES (?, ?, ?)');
  const insertAppt = db.prepare('INSERT INTO appointments (student_id, faculty_id, appt_date, slot_time, topic, status) VALUES (?, ?, ?, ?, ?, ?)');

  const facultyPw = bcrypt.hashSync('faculty123', 10);
  const studentPw = bcrypt.hashSync('student123', 10);

  const addFaculty = (full_name, user_id, email, subject, room, leave, days, times) => {
    const id = insertUser.run({
      role: 'faculty', full_name, student_id: null, year_level: null, program: null,
      email, user_id, password_hash: facultyPw,
    }).lastInsertRowid;
    insertProfile.run(id, subject, room, leave);
    days.forEach((day) => times.forEach((t) => insertSlot.run(id, day, t)));
    return Number(id);
  };

  const addStudent = (full_name, student_id, year, program, email) =>
    Number(insertUser.run({
      role: 'student', full_name, student_id, year_level: year, program,
      email, user_id: null, password_hash: studentPw,
    }).lastInsertRowid);

  const t = dates.today();
  const reyes = addFaculty('Maria Reyes', 'FAC-001', 'reyes@cspc.example.edu', 'Web Development', 'Room CCS - 204', null,
    ['Mon', 'Tue', 'Wed'], ['13:00', '13:30', '14:00', '14:30', '15:00', '15:30']);
  addFaculty('Jose Santos', 'FAC-002', 'santos@cspc.example.edu', 'Database Systems', 'Room CCS - 105', null,
    ['Tue', 'Wed', 'Thu'], ['09:00', '09:30', '10:00', '10:30']);
  addFaculty('Ana Cruz', 'FAC-003', 'cruz@cspc.example.edu', 'Computer Networks', 'Room CCS - 301', dates.addDays(t, 6),
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], ['14:00', '14:30', '15:00', '15:30']);

  const juan = addStudent('Juan Dela Cruz', '2026-0001', 3, 'BSIT', 'juan@student.cspc.example.edu');
  const pedro = addStudent('Pedro Ramos', '2026-0002', 3, 'BSIT', 'pedro@student.cspc.example.edu');
  const ana = addStudent('Ana Reyes', '2026-0003', 2, 'BSCS', 'ana@student.cspc.example.edu');

  // Pending requests for Prof. Reyes
  insertAppt.run(juan, reyes, dates.nextDateForDay('Wed'), '13:30', 'Capstone advising', 'pending');
  insertAppt.run(juan, reyes, dates.nextDateForDay('Tue'), '14:30', 'Capstone advising', 'pending');
  // Today's approved consultations and one later this week
  insertAppt.run(pedro, reyes, t, '13:00', 'Thesis consultation - CCS-204', 'approved');
  insertAppt.run(ana, reyes, t, '14:00', 'Advising', 'approved');
  insertAppt.run(ana, reyes, dates.addDays(t, 1), '15:00', 'Advising', 'approved');
  // Completed history (28)
  const people = [juan, pedro, ana];
  for (let i = 1; i <= 28; i++) {
    insertAppt.run(people[i % 3], reyes, dates.addDays(t, -i), '13:00', 'Consultation', 'completed');
  }
}

seed();
ensureAdmin();

module.exports = db;
