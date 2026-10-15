const db = require('../db');
const dates = require('../utils/dates');

function homeFor(user) {
  if (user.role === 'admin') return '/admin/dashboard';
  return user.role === 'faculty' ? '/faculty/dashboard' : '/student/home';
}

function requireRole(role) {
  return (req, res, next) => {
    const user = req.session.user;
    if (!user) {
      req.session.flash = { type: 'error', text: 'Please log in to continue.' };
      return res.redirect('/login');
    }
    if (user.role !== role) {
      return res.status(403).render('error', {
        title: 'Access denied',
        code: 403,
        message: 'You do not have permission to open this page.',
        home: homeFor(user),
        nav: [],
        active: '',
      });
    }
    next();
  };
}

// Marks past approved consultations as completed and past pending ones as expired.
function housekeeping(req, res, next) {
  if (req.session.user) {
    const t = dates.today();
    db.prepare("UPDATE appointments SET status = 'completed' WHERE status = 'approved' AND appt_date < ?").run(t);
    db.prepare("UPDATE appointments SET status = 'expired' WHERE status = 'pending' AND appt_date < ?").run(t);
  }
  next();
}

module.exports = { requireRole, housekeeping, homeFor };
