const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { homeFor } = require('../middleware/auth');

const router = express.Router();

router.get('/', (req, res) => {
  if (req.session.user) return res.redirect(homeFor(req.session.user));
  res.redirect('/login');
});

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect(homeFor(req.session.user));
  const role = ['faculty', 'admin'].includes(req.query.role) ? req.query.role : 'student';
  res.render('login', { title: 'Login', nav: [], active: '', role, identifier: '', error: null, scripts: ['/js/auth.js'] });
});

router.post('/login', (req, res) => {
  const role = ['faculty', 'admin'].includes(req.body.role) ? req.body.role : 'student';
  const identifier = String(req.body.identifier || '').trim();
  const password = String(req.body.password || '');

  const fail = (error) =>
    res.status(401).render('login', { title: 'Login', nav: [], active: '', role, identifier, error, scripts: ['/js/auth.js'] });

  if (!identifier || !password) {
    return fail(role === 'student' ? 'Enter your Student ID or email and password.' : 'Enter your User ID and password.');
  }
  if (identifier.length > 120 || password.length > 72) return fail('Invalid login details.');

  const user = role === 'student'
    ? db.prepare("SELECT * FROM users WHERE role = 'student' AND (student_id = ? COLLATE NOCASE OR email = ? COLLATE NOCASE)").get(identifier, identifier)
    : db.prepare('SELECT * FROM users WHERE role = ? AND (user_id = ? COLLATE NOCASE OR email = ? COLLATE NOCASE)').get(role, identifier, identifier);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return fail('Incorrect ID/email or password. Please try again.');
  }

  req.session.regenerate((err) => {
    if (err) return fail('Something went wrong. Please try again.');
    req.session.user = { id: user.id, role: user.role, name: user.full_name };
    req.session.save(() => res.redirect(homeFor(req.session.user)));
  });
});

router.get('/register', (req, res) => {
  if (req.session.user) return res.redirect(homeFor(req.session.user));
  res.render('register', { title: 'Create account', nav: [], active: '', errors: [], values: {}, scripts: [] });
});

router.post('/register', (req, res) => {
  const v = {
    full_name: String(req.body.full_name || '').trim().replace(/\s+/g, ' '),
    student_id: String(req.body.student_id || '').trim(),
    year_level: String(req.body.year_level || '').trim(),
    program: String(req.body.program || '').trim(),
    email: String(req.body.email || '').trim().toLowerCase(),
  };
  const password = String(req.body.password || '');
  const errors = [];

  if (v.full_name.length < 2 || v.full_name.length > 100) errors.push('Full name must be 2 to 100 characters.');
  else if (!/^[\p{L}.\-' ]+$/u.test(v.full_name)) errors.push('Full name may only contain letters, spaces, periods, hyphens and apostrophes.');

  if (!/^[A-Za-z0-9-]{4,20}$/.test(v.student_id)) errors.push('Student ID must be 4 to 20 letters, numbers or hyphens.');
  if (!['1', '2', '3', '4', '5'].includes(v.year_level)) errors.push('Year level must be a number from 1 to 5.');
  if (v.program.length < 2 || v.program.length > 60) errors.push('Program must be 2 to 60 characters.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email) || v.email.length > 120) errors.push('Enter a valid school email address.');
  if (password.length < 8 || password.length > 72) errors.push('Password must be 8 to 72 characters.');
  else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) errors.push('Password must include at least one letter and one number.');

  if (!errors.length) {
    if (db.prepare('SELECT 1 FROM users WHERE student_id = ? COLLATE NOCASE').get(v.student_id)) errors.push('That Student ID is already registered.');
    if (db.prepare('SELECT 1 FROM users WHERE email = ? COLLATE NOCASE').get(v.email)) errors.push('That email is already registered.');
  }

  if (errors.length) {
    return res.status(400).render('register', { title: 'Create account', nav: [], active: '', errors, values: v, scripts: [] });
  }

  try {
    db.prepare(`
      INSERT INTO users (role, full_name, student_id, year_level, program, email, password_hash)
      VALUES ('student', ?, ?, ?, ?, ?, ?)
    `).run(v.full_name, v.student_id, Number(v.year_level), v.program, v.email, bcrypt.hashSync(password, 10));
  } catch (e) {
    return res.status(400).render('register', {
      title: 'Create account', nav: [], active: '', errors: ['Could not create the account. Please try again.'], values: v, scripts: [],
    });
  }

  req.session.flash = { type: 'success', text: 'Account created! You can log in now.' };
  res.redirect('/login');
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.redirect('/login');
  });
});

module.exports = router;
