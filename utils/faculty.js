const db = require('../db');
const d = require('./dates');

const SLOT_MINUTES = 30;

function isFaculty(id) {
  return !!db.prepare("SELECT 1 FROM users WHERE id = ? AND role = 'faculty'").get(id);
}

function onLeave(profile, dateStr) {
  return !!(profile && profile.on_leave_until && dateStr < profile.on_leave_until);
}

// Open (bookable) slot times for one faculty member on one calendar date.
function slotsForDate(facultyId, dateStr) {
  const profile = db.prepare('SELECT on_leave_until FROM faculty_profiles WHERE user_id = ?').get(facultyId);
  if (!profile || onLeave(profile, dateStr)) return [];

  const day = d.dayOfDate(dateStr);
  const all = db.prepare('SELECT slot_time FROM availability WHERE faculty_id = ? AND day = ? ORDER BY slot_time')
    .all(facultyId, day).map((r) => r.slot_time);

  const taken = new Set(
    db.prepare("SELECT slot_time FROM appointments WHERE faculty_id = ? AND appt_date = ? AND status IN ('pending','approved')")
      .all(facultyId, dateStr).map((r) => r.slot_time)
  );

  const isToday = dateStr === d.today();
  const now = d.nowHM();
  return all.filter((t) => !taken.has(t) && (!isToday || t > now));
}

// First upcoming date (within 4 weeks) for the weekday that still has open slots.
function openSlots(facultyId, day) {
  let date = d.nextDateForDay(day);
  for (let i = 0; i < 4; i++) {
    const slots = slotsForDate(facultyId, date);
    if (slots.length || i === 3) return { date, slots };
    date = d.addDays(date, 7);
  }
}

function summary(facultyId) {
  const rows = db.prepare('SELECT day, slot_time FROM availability WHERE faculty_id = ? ORDER BY slot_time').all(facultyId);
  if (!rows.length) return { days: [], timeText: 'No schedule yet' };

  const days = d.WEEKDAYS.filter((x) => rows.some((r) => r.day === x));
  const idx = days.map((x) => d.WEEKDAYS.indexOf(x));
  const contiguous = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  let dayText;
  if (days.length === 1) dayText = days[0];
  else if (contiguous) dayText = `${days[0]}-${days[days.length - 1]}`;
  else dayText = days.join(', ');

  const first = rows[0].slot_time;
  const last = d.addMinutes(rows[rows.length - 1].slot_time, SLOT_MINUTES);
  return { days, timeText: `${dayText}, ${d.fmtRange(first, last)}` };
}

function listFaculty(search) {
  const q = `%${search || ''}%`;
  const rows = db.prepare(`
    SELECT u.id, u.full_name, p.subject, p.room, p.on_leave_until
    FROM users u JOIN faculty_profiles p ON p.user_id = u.id
    WHERE u.role = 'faculty' AND (u.full_name LIKE ? OR p.subject LIKE ?)
    ORDER BY u.full_name
  `).all(q, q);

  const todayStr = d.today();
  return rows.map((f) => {
    const sum = summary(f.id);
    const leave = f.on_leave_until && f.on_leave_until > todayStr;

    let total = 0;
    for (let i = 0; i < 7; i++) total += slotsForDate(f.id, d.addDays(todayStr, i)).length;
    const availableToday = slotsForDate(f.id, todayStr).length > 0;

    let badge;
    if (leave) badge = { text: 'On leave', cls: 'red' };
    else if (!sum.days.length) badge = { text: 'No schedule', cls: 'red' };
    else if (total === 0) badge = { text: 'Fully booked', cls: 'red' };
    else if (total <= 3) badge = { text: 'Few slots left', cls: 'yellow' };
    else if (availableToday) badge = { text: 'Available today', cls: 'green' };
    else badge = { text: 'Available', cls: 'green' };

    return {
      id: f.id,
      display: d.facultyDisplay(f.full_name),
      subject: f.subject,
      room: f.room,
      onLeave: !!leave,
      timeText: leave ? `Returns ${d.fmtShort(f.on_leave_until)}` : sum.timeText,
      days: sum.days,
      badge,
    };
  });
}

// Tells a student when a faculty member they asked to be notified about is back.
function collectNotices(studentId) {
  const todayStr = d.today();
  const rows = db.prepare(`
    SELECT n.faculty_id, u.full_name, p.on_leave_until
    FROM notify_requests n
    JOIN users u ON u.id = n.faculty_id
    JOIN faculty_profiles p ON p.user_id = n.faculty_id
    WHERE n.student_id = ?
  `).all(studentId);

  const notices = [];
  rows.forEach((r) => {
    if (!r.on_leave_until || r.on_leave_until <= todayStr) {
      notices.push(`${d.facultyDisplay(r.full_name)} is back and now open for consultations.`);
      db.prepare('DELETE FROM notify_requests WHERE student_id = ? AND faculty_id = ?').run(studentId, r.faculty_id);
    }
  });
  return notices;
}

module.exports = { isFaculty, slotsForDate, openSlots, listFaculty, collectNotices, SLOT_MINUTES };
