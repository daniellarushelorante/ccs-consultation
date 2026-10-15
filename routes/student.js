const express = require('express');
const db = require('../db');
const d = require('../utils/dates');
const fac = require('../utils/faculty');
const { requireRole } = require('../middleware/auth');
const { studentNav } = require('../utils/nav');

const router = express.Router();
router.use(requireRole('student'));

router.get('/', (req, res) => res.redirect('/student/home'));

router.get('/home', (req, res) => {
  res.render('student/home', {
    title: 'Home', nav: studentNav, active: 'home',
    facultyList: fac.listFaculty(''), search: '', notices: fac.collectNotices(req.session.user.id),
    scripts: ['/js/booking.js'],
  });
});

router.get('/find', (req, res) => {
  const search = String(req.query.q || '').trim().slice(0, 50);
  res.render('student/find', {
    title: 'Find Faculty', nav: studentNav, active: 'find',
    facultyList: fac.listFaculty(search), search, notices: [],
    scripts: ['/js/booking.js'],
  });
});

// Open slots for a faculty member on a weekday (JSON)
router.get('/api/slots', (req, res) => {
  const facultyId = Number(req.query.faculty);
  const day = String(req.query.day || '');
  if (!Number.isInteger(facultyId) || !d.WEEKDAYS.includes(day)) return res.status(400).json({ error: 'Invalid request.' });
  if (!fac.isFaculty(facultyId)) return res.status(404).json({ error: 'Faculty not found.' });

  const r = fac.openSlots(facultyId, day);
  res.json({
    date: r.date,
    dateLabel: d.fmtWithDay(r.date),
    slots: r.slots.map((t) => ({ time: t, label: d.fmtTime(t) })),
  });
});

// Create a booking request (JSON)
router.post('/book', (req, res) => {
  const facultyId = Number(req.body.facultyId);
  const date = String(req.body.date || '');
  const time = String(req.body.time || '');
  let topic = String(req.body.topic || '').trim().replace(/\s+/g, ' ');

  if (!Number.isInteger(facultyId) || !fac.isFaculty(facultyId)) return res.status(400).json({ error: 'Choose a valid faculty member.' });
  if (!d.isValidYmd(date)) return res.status(400).json({ error: 'Choose a day.' });
  if (!/^\d{2}:\d{2}$/.test(time)) return res.status(400).json({ error: 'Choose a time.' });
  if (topic.length > 120) return res.status(400).json({ error: 'Topic must be 120 characters or fewer.' });
  if (!topic) topic = 'Consultation';

  const maxDate = d.addDays(d.today(), 28);
  if (date < d.today() || date > maxDate) return res.status(400).json({ error: 'That date cannot be booked.' });
  if (!fac.slotsForDate(facultyId, date).includes(time)) {
    return res.status(409).json({ error: 'That time slot is no longer available. Please pick another.' });
  }

  const studentId = req.session.user.id;
  const clash = db.prepare("SELECT 1 FROM appointments WHERE student_id = ? AND appt_date = ? AND slot_time = ? AND status IN ('pending','approved')")
    .get(studentId, date, time);
  if (clash) return res.status(409).json({ error: 'You already have a consultation at that time.' });

  try {
    db.prepare("INSERT INTO appointments (student_id, faculty_id, appt_date, slot_time, topic, status) VALUES (?, ?, ?, ?, ?, 'pending')")
      .run(studentId, facultyId, date, time, topic);
  } catch (e) {
    return res.status(409).json({ error: 'That time slot was just taken. Please pick another.' });
  }
  res.json({ ok: true });
});

router.post('/notify/:id', (req, res) => {
  const facultyId = Number(req.params.id);
  if (!Number.isInteger(facultyId) || !fac.isFaculty(facultyId)) return res.status(404).json({ error: 'Faculty not found.' });
  db.prepare('INSERT OR IGNORE INTO notify_requests (student_id, faculty_id) VALUES (?, ?)').run(req.session.user.id, facultyId);
  res.json({ ok: true });
});

router.get('/appointments', (req, res) => {
  const appointments = db.prepare(`
    SELECT a.id, a.appt_date, a.slot_time, a.topic, a.status, u.full_name AS faculty_name, p.subject, p.room
    FROM appointments a
    JOIN users u ON u.id = a.faculty_id
    JOIN faculty_profiles p ON p.user_id = a.faculty_id
    WHERE a.student_id = ?
    ORDER BY a.appt_date DESC, a.slot_time DESC
  `).all(req.session.user.id);

  res.render('student/appointments', {
    title: 'My appointments', nav: studentNav, active: 'appointments', appointments, scripts: [],
  });
});

router.post('/appointments/:id/cancel', (req, res) => {
  const result = db.prepare("UPDATE appointments SET status = 'cancelled' WHERE id = ? AND student_id = ? AND status IN ('pending','approved')")
    .run(Number(req.params.id), req.session.user.id);
  req.session.flash = result.changes
    ? { type: 'success', text: 'Appointment cancelled.' }
    : { type: 'error', text: 'That appointment cannot be cancelled.' };
  res.redirect('/student/appointments');
});

module.exports = router;
