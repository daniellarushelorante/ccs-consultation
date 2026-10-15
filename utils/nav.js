const studentNav = [
  { href: '/student/home', label: 'Home', key: 'home' },
  { href: '/student/find', label: 'Find Faculty', key: 'find' },
  { href: '/student/appointments', label: 'My appointments', key: 'appointments' },
];

const facultyNav = [
  { href: '/faculty/dashboard', label: 'Dashboard', key: 'dashboard' },
  { href: '/faculty/requests', label: 'Requests', key: 'requests' },
  { href: '/faculty/availability', label: 'My availability', key: 'availability' },
];

const adminNav = [
  { href: '/admin/dashboard', label: 'Dashboard', key: 'dashboard' },
  { href: '/admin/faculty', label: 'Professors', key: 'faculty' },
  { href: '/admin/students', label: 'Students', key: 'students' },
  { href: '/admin/appointments', label: 'Records', key: 'appointments' },
];

module.exports = { studentNav, facultyNav, adminNav };
