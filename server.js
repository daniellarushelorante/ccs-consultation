require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path = require('path');

require('./db'); // creates tables and demo data on first run
const dates = require('./utils/dates');
const { housekeeping, homeFor } = require('./middleware/auth');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.locals.fmt = {
  time: dates.fmtTime,
  short: dates.fmtShort,
  withDay: dates.fmtWithDay,
  display: dates.facultyDisplay,
};

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-only-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 4 },
}));

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
});
app.use(housekeeping);

app.use('/', require('./routes/auth'));
app.use('/student', require('./routes/student'));
app.use('/faculty', require('./routes/faculty'));
app.use('/admin', require('./routes/admin'));

app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Page not found', code: 404, message: 'The page you are looking for does not exist.',
    home: req.session.user ? homeFor(req.session.user) : '/login', nav: [], active: '',
  });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', {
    title: 'Server error', code: 500, message: 'Something went wrong on our side. Please try again.',
    home: req.session.user ? homeFor(req.session.user) : '/login', nav: [], active: '',
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CCS Consultation running at http://localhost:${PORT}`));
