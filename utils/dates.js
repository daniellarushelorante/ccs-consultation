const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const pad = (n) => String(n).padStart(2, '0');

function ymd(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseYmd(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function isValidYmd(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return ymd(parseYmd(s)) === s;
}

function today() {
  return ymd(new Date());
}

function nowHM() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function addDays(s, n) {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

function dayOfDate(s) {
  return DAYS[parseYmd(s).getDay()];
}

// Next calendar date (today included) that falls on the given weekday abbreviation.
function nextDateForDay(day) {
  const target = DAYS.indexOf(day);
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  while (d.getDay() !== target) d.setDate(d.getDate() + 1);
  return ymd(d);
}

// Monday..Sunday of the current week.
function weekRange() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const diffToMonday = (d.getDay() + 6) % 7;
  const start = new Date(d);
  start.setDate(d.getDate() - diffToMonday);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: ymd(start), end: ymd(end) };
}

function addMinutes(hm, mins) {
  const [h, m] = hm.split(':').map(Number);
  const total = h * 60 + m + mins;
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

function fmtTime(hm) {
  const [h, m] = hm.split(':').map(Number);
  return `${h % 12 || 12}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`;
}

function fmtRange(first, last) {
  const a = fmtTime(first);
  const b = fmtTime(last);
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)}-${b}` : `${a}-${b}`;
}

function fmtShort(s) {
  const d = parseYmd(s);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function fmtWithDay(s) {
  const d = parseYmd(s);
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function fmtLong(s) {
  const d = parseYmd(s);
  return `${DAYS_FULL[d.getDay()]}, ${MONTHS_FULL[d.getMonth()]} ${d.getDate()}`;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

// "Maria Reyes" -> "Prof. M Reyes"
function facultyDisplay(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/);
  if (parts.length < 2) return `Prof. ${parts[0] || ''}`.trim();
  return `Prof. ${parts[0][0].toUpperCase()} ${parts[parts.length - 1]}`;
}

// "Maria Reyes" -> "Prof. Reyes"
function facultyLastName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/);
  return `Prof. ${parts[parts.length - 1]}`;
}

module.exports = {
  DAYS, WEEKDAYS, ymd, parseYmd, isValidYmd, today, nowHM, addDays, dayOfDate,
  nextDateForDay, weekRange, addMinutes, fmtTime, fmtRange, fmtShort, fmtWithDay,
  fmtLong, greeting, facultyDisplay, facultyLastName,
};
