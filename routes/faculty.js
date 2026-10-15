const express = require('express');
const db = require('../db');
const d = require('../utils/dates');
const { requireRole } = require('../middleware/auth');
const { facultyNav } = require('../utils/nav');

const router = express.Router();
router.use(requireRole('faculty'));

router.get('/', (req, res) => res.redirect('/faculty/dashboard'));

const pendingQuery = `
  SELECT a.id, a.appt_date, a.slot_time, a.topic, s.full_name, s.program, s.year_level
  FROM appointments a JOIN users s ON s.id = a.student_id
  WHERE a.faculty_id = ? AND a.status = 'pending'
  ORDER BY a.appt_date, a.slot_time
`;

router.get('/dashboard', (req, res) => {
  const me = req.session.user;
  const t = d.today();
  const { end } = d.weekRange();
  const count = (sql, ...args) => db.prepare(sql).get(...args).c;

  const stats = {
    pending: count("SELECT COUNT(*) AS c FROM appointments WHERE faculty_id = ? AND status = 'pending'", me.id),
    today: count("SELECT COUNT(*) AS c FROM appointments WHERE faculty_id = ? AND status = 'approved' AND appt_date = ?", me.id, t),
    week: count("SELECT COUNT(*) AS c FROM appointments WHERE faculty_id = ? AND status = 'approved' AND appt_date > ? AND appt_date <= ?", me.id, t, end),
    completed: count("SELECT COUNT(*) AS c FROM appointments WHERE faculty_id = ? AND status = 'completed'", me.id),
  };

  const pending = db.prepare(pendingQuery).all(me.id);

  const dayName = d.DAYS[new Date().getDay()];
  const avail = db.prepare('SELECT slot_time FROM availability WHERE faculty_id = ? AND day = ?').all(me.id, dayName).map((r) => r.slot_time);
  const booked = db.prepare(`
    SELECT a.slot_time, a.topic, s.full_name FROM appointments a JOIN users s ON s.id = a.student_id
    WHERE a.faculty_id = ? AND a.appt_date = ? AND a.status = 'approved'
  `).all(me.id, t);

  const times = [...new Set([...avail, ...booked.map((b) => b.slot_time)])].sort();
  let n = 0;
  const schedule = times.map((time) => {
    const b = booked.find((x) => x.slot_time === time);
    return {
      time: d.fmtTime(time),
      student: b ? b.full_name : null,
      topic: b ? b.topic : null,
      color: b ? (n++ % 2 === 0 ? 'green' : 'blue') : 'open',
    };
  });

  res.render('faculty/dashboard', {
    title: 'Dashboard', nav: facultyNav, active: 'dashboard',
    greeting: d.greeting(), name: d.facultyLastName(me.name),
    subtitle: `${d.fmtLong(t)}. You have ${stats.today} consultation${stats.today === 1 ? '' : 's'} today.`,
    stats, pending, schedule, scripts: [],
  });
});

router.get('/requests', (req, res) => {
  const me = req.session.user;
  const history = db.prepare(`
    SELECT a.appt_date, a.slot_time, a.topic, a.status, s.full_name, s.program, s.year_level
    FROM appointments a JOIN users s ON s.id = a.student_id
    WHERE a.faculty_id = ? AND a.status <> 'pending'
    ORDER BY a.appt_date DESC, a.slot_time DESC LIMIT 30
  `).all(me.id);

  res.render('faculty/requests', {
    title: 'Requests', nav: facultyNav, active: 'requests',
    pending: db.prepare(pendingQuery).all(me.id), history, scripts: [],
  });
});

function decide(status) {
  return (req, res) => {
    const result = db.prepare("UPDATE appointments SET status = ? WHERE id = ? AND faculty_id = ? AND status = 'pending'")
      .run(status, Number(req.params.id), req.session.user.id);
    req.session.flash = result.changes
      ? { type: 'success', text: status === 'approved' ? 'Request approved.' : 'Request declined.' }
      : { type: 'error', text: 'That request is no longer pending.' };
    res.redirect(req.get('referer') && req.get('referer').includes('/faculty/requests') ? '/faculty/requests' : '/faculty/dashboard');
  };
}
router.post('/requests/:id/approve', decide('approved'));
router.post('/requests/:id/decline', decide('declined'));

router.get('/availability', (req, res) => {
  const me = req.session.user;
  const rows = db.prepare('SELECT id, day, slot_time FROM availability WHERE faculty_id = ? ORDER BY slot_time').all(me.id);
  const byDay = d.WEEKDAYS.map((day) => ({
    day,
    slots: rows.filter((r) => r.day === day).map((r) => ({ id: r.id, label: d.fmtTime(r.slot_time) })),
  }));
  const profile = db.prepare('SELECT on_leave_until FROM faculty_profiles WHERE user_id = ?').get(me.id);

  const timeOptions = [];
  for (let t = '07:00'; t <= '18:00'; t = d.addMinutes(t, 30)) timeOptions.push({ value: t, label: d.fmtTime(t) });

  res.render('faculty/availability', {
    title: 'My availability', nav: facultyNav, active: 'availability',
    byDay, weekdays: d.WEEKDAYS, timeOptions,
    leaveUntil: profile && profile.on_leave_until && profile.on_leave_until > d.today() ? profile.on_leave_until : '',
    minLeave: d.addDays(d.today(), 1), scripts: [],
  });
});

router.post('/availability/add', (req, res) => {
  const day = String(req.body.day || '');
  const time = String(req.body.time || '');
  const valid = /^([01]\d|2[0-3]):(00|30)$/.test(time) && time >= '07:00' && time <= '18:00';
  if (!d.WEEKDAYS.includes(day) || !valid) {
    req.session.flash = { type: 'error', text: 'Choose a valid day and a time on the hour or half hour (7:00 AM - 6:00 PM).' };
    return res.redirect('/faculty/availability');
  }
  const result = db.prepare('INSERT OR IGNORE INTO availability (faculty_id, day, slot_time) VALUES (?, ?, ?)').run(req.session.user.id, day, time);
  req.session.flash = result.changes
    ? { type: 'success', text: `Added ${day} ${d.fmtTime(time)}.` }
    : { type: 'error', text: 'That slot already exists.' };
  res.redirect('/faculty/availability');
});

router.post('/availability/:id/delete', (req, res) => {
  const me = req.session.user;
  const slot = db.prepare('SELECT * FROM availability WHERE id = ? AND faculty_id = ?').get(Number(req.params.id), me.id);
  if (!slot) {
    req.session.flash = { type: 'error', text: 'Slot not found.' };
    return res.redirect('/faculty/availability');
  }
  const upcoming = db.prepare(`
    SELECT appt_date FROM appointments
    WHERE faculty_id = ? AND slot_time = ? AND appt_date >= ? AND status IN ('pending','approved')
  `).all(me.id, slot.slot_time, d.today());
  if (upcoming.some((a) => d.dayOfDate(a.appt_date) === slot.day)) {
    req.session.flash = { type: 'error', text: 'That slot has an upcoming booking. Decline or finish it first.' };
    return res.redirect('/faculty/availability');
  }
  db.prepare('DELETE FROM availability WHERE id = ?').run(slot.id);
  req.session.flash = { type: 'success', text: 'Slot removed.' };
  res.redirect('/faculty/availability');
});

router.post('/availability/leave', (req, res) => {
  const value = String(req.body.return_date || '').trim();
  if (value && (!d.isValidYmd(value) || value <= d.today())) {
    req.session.flash = { type: 'error', text: 'Return date must be a valid date after today.' };
    return res.redirect('/faculty/availability');
  }
  db.prepare('UPDATE faculty_profiles SET on_leave_until = ? WHERE user_id = ?').run(value || null, req.session.user.id);
  req.session.flash = { type: 'success', text: value ? `You are marked on leave until ${d.fmtShort(value)}.` : 'Leave cleared. Students can book you again.' };
  res.redirect('/faculty/availability');
});

module.exports = router;
