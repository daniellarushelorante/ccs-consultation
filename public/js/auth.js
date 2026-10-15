(function () {
  var buttons = document.querySelectorAll('.role-btn');
  var roleInput = document.getElementById('role-input');
  var label = document.getElementById('identifier-label');
  var field = document.getElementById('identifier');
  var registerLink = document.getElementById('register-link');
  var facultyNote = document.getElementById('faculty-note');

  function setRole(role) {
    roleInput.value = role;
    buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.role === role)); });
    var isFaculty = role === 'faculty';
    label.textContent = isFaculty ? 'User ID' : 'Student ID or email';
    field.placeholder = isFaculty ? 'FAC-001' : '2026-0001';
    registerLink.hidden = isFaculty;
    facultyNote.hidden = !isFaculty;
  }

  buttons.forEach(function (b) {
    b.addEventListener('click', function () { setRole(b.dataset.role); field.focus(); });
  });
})();
