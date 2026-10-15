const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const d = require('../utils/dates');
const { requireRole } = require('../middleware/auth');
const { adminNav } = require('../utils/nav');

const router = express.Router();
router.use(requireRole('admin'));

const STATUSES = ['pending', 'approved', 'declined', 'completed', 'cancelled', 'expired'];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function log(req, action) {
  db.prepare('INSERT INTO activity_log (admin_name, action) VALUES (?, ?)').run(req.session.user.name, action);
}

function page(res, view, active, data) {
  res.render(`admin/${view}`, Object.assign({ nav: adminNav, active, scripts: [], cap }, data));
}

function flashTo(req, res, type, text, url) {
  req.session.flash = { type, text };
  res.redirect(url);
}

function idParam(req) {
  const id = Number(req.params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

router.get('/', (req, res) => res.redirect('/admin/dashboard'));

/* ------------------------------------------------------------------ */
/* Dashboard                                                          */
/* ------------------------------------------------------------------ */
router.get('/dashboard', (req, res) => {
  const one = (sql, ...a) => db.prepare(sql).get(...a).c;
  const stats = {
    faculty: one("SELECT COUNT(*) AS c FROM users WHERE role = 'faculty'"),
    students: one("SELECT COUNT(*) AS c FROM users WHERE role = 'student'"),
    appointments: one('SELECT COUNT(*) AS c FROM appointments'),
    pending: one("SELECT COUNT(*) AS c FROM appointments WHERE status = 'pending'"),
    today: one("SELECT COUNT(*) AS c FROM appointments WHERE appt_date = ? AND status IN ('pending','approved')", d.today()),
  };

  const byStatus = STATUSES.map((s) => ({
    status: s,
    count: one('SELECT COUNT(*) AS c FROM appointments WHERE status = ?', s),
  }));
  const maxStatus = Math.max(1, ...byStatus.map((s) => s.count));

  const busiest = db.prepare(`
    SELECT u.full_name, COUNT(a.id) AS total
    FROM users u LEFT JOIN appointments a ON a.faculty_id = u.id AND a.status IN ('approved','completed')
    WHERE u.role = 'faculty' GROUP BY u.id ORDER BY total DESC, u.full_name LIMIT 5
  `).all();

  const recent = db.prepare(`
    SELECT a.appt_date, a.slot_time, a.status, a.topic, s.full_name AS student, f.full_name AS faculty
    FROM appointments a JOIN users s ON s.id = a.student_id JOIN users f ON f.id = a.faculty_id
    ORDER BY a.created_at DESC, a.id DESC LIMIT 6
  `).all();

  const activity = db.prepare('SELECT admin_name, action, created_at FROM activity_log ORDER BY id DESC LIMIT 8').all();

  page(res, 'dashboard', 'dashboard', { title: 'Admin dashboard', stats, byStatus, maxStatus, busiest, recent, activity });
});

/* ------------------------------------------------------------------ */
/* Professors                                                         */
/* ------------------------------------------------------------------ */
const facultyListSql = `
  SELECT u.id, u.full_name, u.user_id, u.email, p.subject, p.room, p.on_leave_until,
    (SELECT COUNT(*) FROM appointments a WHERE a.faculty_id = u.id) AS total,
    (SELECT COUNT(*) FROM appointments a WHERE a.faculty_id = u.id AND a.status = 'pending') AS pending,
    (SELECT COUNT(*) FROM availability v WHERE v.faculty_id = u.id) AS slots
  FROM users u JOIN faculty_profiles p ON p.user_id = u.id
  WHERE u.role = 'faculty' AND (u.full_name LIKE ? OR u.user_id LIKE ? OR p.subject LIKE ? OR u.email LIKE ?)
  ORDER BY u.full_name
`;

router.get('/faculty', (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 50);
  const like = `%${q}%`;
  const rows = db.prepare(facultyListSql).all(like, like, like, like);
  page(res, 'faculty', 'faculty', { title: 'Professors', rows, q, today: d.today() });
});

const timeOptions = [];
for (let t = '07:00'; t <= '18:00'; t = d.addMinutes(t, 30)) timeOptions.push({ value: t, label: d.fmtTime(t) });

function facultyForm(res, mode, values, errors, status) {
  res.status(status || 200);
  page(res, 'faculty-form', 'faculty', {
    title: mode === 'new' ? 'Add professor' : 'Edit professor',
    mode, values, errors, weekdays: d.WEEKDAYS, timeOptions,
  });
}

// Validates the add/edit form. Returns cleaned values and a list of messages.
function readFacultyForm(body, mode, currentId) {
  const v = {
    full_name: String(body.full_name || '').trim().replace(/\s+/g, ' '),
    user_id: String(body.user_id || '').trim().toUpperCase(),
    email: String(body.email || '').trim().toLowerCase(),
    subject: String(body.subject || '').trim(),
    room: String(body.room || '').trim(),
    password: String(body.password || ''),
    days: [].concat(body.days || []).filter((x) => d.WEEKDAYS.includes(x)),
    from: String(body.from || '09:00'),
    to: String(body.to || '12:00'),
  };
  const errors = [];

  if (v.full_name.length < 2 || v.full_name.length > 100) errors.push('Full name must be 2 to 100 characters.');
  else if (!/^[\p{L}.\-' ]+$/u.test(v.full_name)) errors.push('Full name may only contain letters, spaces, periods, hyphens and apostrophes.');
  if (!/^[A-Za-z0-9-]{3,20}$/.test(v.user_id)) errors.push('User ID must be 3 to 20 letters, numbers or hyphens.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email) || v.email.length > 120) errors.push('Enter a valid email address.');
  if (v.subject.length < 2 || v.subject.length > 80) errors.push('Subject must be 2 to 80 characters.');
  if (v.room.length < 1 || v.room.length > 40) errors.push('Room must be 1 to 40 characters.');

  if (mode === 'new' || v.password) {
    if (v.password.length < 8 || v.password.length > 72) errors.push('Password must be 8 to 72 characters.');
    else if (!/[A-Za-z]/.test(v.password) || !/\d/.test(v.password)) errors.push('Password must include at least one letter and one number.');
  }

  if (mode === 'new' && v.days.length) {
    const ok = (t) => /^([01]\d|2[0-3]):(00|30)$/.test(t) && t >= '07:00' && t <= '18:00';
    if (!ok(v.from) || !ok(v.to)) errors.push('Consultation hours must be on the hour or half hour between 7:00 AM and 6:00 PM.');
    else if (v.from >= v.to) errors.push('The end time must be after the start time.');
  }

  if (!errors.length) {
    const idClash = db.prepare('SELECT id FROM users WHERE user_id = ? COLLATE NOCASE AND id <> ?').get(v.user_id, currentId || 0);
    if (idClash) errors.push('That User ID is already used.');
    const mailClash = db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE AND id <> ?').get(v.email, currentId || 0);
    if (mailClash) errors.push('That email is already used.');
  }
  return { v, errors };
}

router.get('/faculty/new', (req, res) => {
  facultyForm(res, 'new', { days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], from: '09:00', to: '12:00' }, []);
});

router.post('/faculty', (req, res) => {
  const { v, errors } = readFacultyForm(req.body, 'new', null);
  if (errors.length) return facultyForm(res, 'new', v, errors, 400);

  const create = db.transaction(() => {
    const id = db.prepare(`
      INSERT INTO users (role, full_name, email, user_id, password_hash) VALUES ('faculty', ?, ?, ?, ?)
    `).run(v.full_name, v.email, v.user_id, bcrypt.hashSync(v.password, 10)).lastInsertRowid;
    db.prepare('INSERT INTO faculty_profiles (user_id, subject, room) VALUES (?, ?, ?)').run(id, v.subject, v.room);
    const ins = db.prepare('INSERT INTO availability (faculty_id, day, slot_time) VALUES (?, ?, ?)');
    v.days.forEach((day) => {
      for (let t = v.from; t < v.to; t = d.addMinutes(t, 30)) ins.run(id, day, t);
    });
  });

  try {
    create();
  } catch (e) {
    return facultyForm(res, 'new', v, ['Could not save the professor. Please try again.'], 400);
  }
  log(req, `Added professor ${v.full_name} (${v.user_id})`);
  flashTo(req, res, 'success', `${v.full_name} was added.`, '/admin/faculty');
});

function loadFaculty(id) {
  return db.prepare(`
    SELECT u.id, u.full_name, u.user_id, u.email, p.subject, p.room
    FROM users u JOIN faculty_profiles p ON p.user_id = u.id WHERE u.id = ? AND u.role = 'faculty'
  `).get(id);
}

router.get('/faculty/:id/edit', (req, res) => {
  const id = idParam(req);
  const f = id && loadFaculty(id);
  if (!f) return flashTo(req, res, 'error', 'Professor not found.', '/admin/faculty');
  facultyForm(res, 'edit', f, []);
});

router.post('/faculty/:id', (req, res) => {
  const id = idParam(req);
  const f = id && loadFaculty(id);
  if (!f) return flashTo(req, res, 'error', 'Professor not found.', '/admin/faculty');

  const { v, errors } = readFacultyForm(req.body, 'edit', id);
  v.id = id;
  if (errors.length) return facultyForm(res, 'edit', v, errors, 400);

  const save = db.transaction(() => {
    db.prepare('UPDATE users SET full_name = ?, email = ?, user_id = ? WHERE id = ?').run(v.full_name, v.email, v.user_id, id);
    db.prepare('UPDATE faculty_profiles SET subject = ?, room = ? WHERE user_id = ?').run(v.subject, v.room, id);
    if (v.password) db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(v.password, 10), id);
  });
  try {
    save();
  } catch (e) {
    return facultyForm(res, 'edit', v, ['Could not save the changes. Please try again.'], 400);
  }
  log(req, `Edited professor ${v.full_name} (${v.user_id})${v.password ? ' and reset the password' : ''}`);
  flashTo(req, res, 'success', 'Changes saved.', '/admin/faculty');
});

router.post('/faculty/:id/delete', (req, res) => {
  const id = idParam(req);
  const f = id && loadFaculty(id);
  if (!f) return flashTo(req, res, 'error', 'Professor not found.', '/admin/faculty');
  const removed = db.prepare('SELECT COUNT(*) AS c FROM appointments WHERE faculty_id = ?').get(id).c;
  db.prepare("DELETE FROM users WHERE id = ? AND role = 'faculty'").run(id);
  log(req, `Deleted professor ${f.full_name} (${f.user_id}) and ${removed} appointment record(s)`);
  flashTo(req, res, 'success', `${f.full_name} was deleted.`, '/admin/faculty');
});

/* ------------------------------------------------------------------ */
/* Students                                                           */
/* ------------------------------------------------------------------ */
router.get('/students', (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 50);
  const like = `%${q}%`;
  const rows = db.prepare(`
    SELECT u.id, u.full_name, u.student_id, u.email, u.program, u.year_level, u.created_at,
      (SELECT COUNT(*) FROM appointments a WHERE a.student_id = u.id) AS total
    FROM users u
    WHERE u.role = 'student' AND (u.full_name LIKE ? OR u.student_id LIKE ? OR u.email LIKE ? OR u.program LIKE ?)
    ORDER BY u.full_name
  `).all(like, like, like, like);
  page(res, 'students', 'students', { title: 'Students', rows, q });
});

router.post('/students/:id/delete', (req, res) => {
  const id = idParam(req);
  const s = id && db.prepare("SELECT id, full_name, student_id FROM users WHERE id = ? AND role = 'student'").get(id);
  if (!s) return flashTo(req, res, 'error', 'Student not found.', '/admin/students');
  const removed = db.prepare('SELECT COUNT(*) AS c FROM appointments WHERE student_id = ?').get(id).c;
  db.prepare("DELETE FROM users WHERE id = ? AND role = 'student'").run(id);
  log(req, `Deleted student ${s.full_name} (${s.student_id}) and ${removed} appointment record(s)`);
  flashTo(req, res, 'success', `${s.full_name} was deleted.`, '/admin/students');
});

/* ------------------------------------------------------------------ */
/* Appointment records                                                */
/* ------------------------------------------------------------------ */
function filteredAppointments(query, limit) {
  const status = STATUSES.includes(query.status) ? query.status : '';
  const q = String(query.q || '').trim().slice(0, 50);
  const from = d.isValidYmd(String(query.from || '')) ? query.from : '';
  const to = d.isValidYmd(String(query.to || '')) ? query.to : '';

  const where = [];
  const args = [];
  if (status) { where.push('a.status = ?'); args.push(status); }
  if (from) { where.push('a.appt_date >= ?'); args.push(from); }
  if (to) { where.push('a.appt_date <= ?'); args.push(to); }
  if (q) {
    where.push('(s.full_name LIKE ? OR f.full_name LIKE ? OR a.topic LIKE ? OR s.student_id LIKE ?)');
    const like = `%${q}%`;
    args.push(like, like, like, like);
  }

  const rows = db.prepare(`
    SELECT a.id, a.appt_date, a.slot_time, a.topic, a.status, a.created_at,
           s.full_name AS student, s.student_id, f.full_name AS faculty, p.subject
    FROM appointments a
    JOIN users s ON s.id = a.student_id
    JOIN users f ON f.id = a.faculty_id
    JOIN faculty_profiles p ON p.user_id = a.faculty_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY a.appt_date DESC, a.slot_time DESC
    LIMIT ${limit}
  `).all(...args);
  return { rows, filters: { status, q, from, to } };
}

router.get('/appointments', (req, res) => {
  const { rows, filters } = filteredAppointments(req.query, 500);
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
  page(res, 'appointments', 'appointments', { title: 'Records', rows, filters, statuses: STATUSES, qs, shown: rows.length });
});

// Spreadsheet cells starting with = + - @ can run formulas, so neutralise them.
function csvCell(value) {
  let s = String(value == null ? '' : value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

router.get('/appointments.csv', (req, res) => {
  const { rows } = filteredAppointments(req.query, 100000);
  const head = ['Date', 'Time', 'Student', 'Student ID', 'Professor', 'Subject', 'Topic', 'Status', 'Booked on'];
  const lines = [head.map(csvCell).join(',')].concat(rows.map((r) =>
    [r.appt_date, d.fmtTime(r.slot_time), r.student, r.student_id, r.faculty, r.subject, r.topic, r.status, r.created_at]
      .map(csvCell).join(',')));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="consultations-${d.today()}.csv"`);
  res.send('﻿' + lines.join('\r\n') + '\r\n');
  log(req, `Exported ${rows.length} appointment record(s) to CSV`);
});

router.post('/appointments/:id/cancel', (req, res) => {
  const id = idParam(req);
  const result = id && db.prepare("UPDATE appointments SET status = 'cancelled' WHERE id = ? AND status IN ('pending','approved')").run(id);
  if (result && result.changes) log(req, `Cancelled appointment #${id}`);
  const back = String(req.body.back || '');
  flashTo(req, res, result && result.changes ? 'success' : 'error',
    result && result.changes ? 'Appointment cancelled.' : 'That appointment cannot be cancelled.',
    back.startsWith('/admin/appointments') ? back : '/admin/appointments');
});

module.exports = router;
