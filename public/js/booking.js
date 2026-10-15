(function () {
  var list = document.getElementById('faculty-list');
  if (!list) return;
  var dialog = document.getElementById('confirmed');

  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text) n.textContent = text;
    return n;
  }

  function post(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, data: j }; }); });
  }

  function showSlots(card, day) {
    var area = card.querySelector('.js-slot-area');
    var id = card.dataset.faculty;
    area.replaceChildren(el('p', { class: 'slot-note' }, 'Loading times...'));

    fetch('/student/api/slots?faculty=' + encodeURIComponent(id) + '&day=' + encodeURIComponent(day))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        area.replaceChildren();
        if (!data.slots || !data.slots.length) {
          area.appendChild(el('p', { class: 'slot-note' }, 'No open times on ' + day + ' in the next 4 weeks. Try another day.'));
          return;
        }
        area.appendChild(el('h4', {}, data.dateLabel + ' - pick a time'));
        var grid = el('div', { class: 'slots' });
        var selected = null;
        var confirm = el('div', { class: 'confirm-row' });
        var topicWrap = el('div');
        var topicLabel = el('label', { for: 'topic-' + id }, 'What is it about? (optional)');
        var topic = el('input', { id: 'topic-' + id, maxlength: '120', placeholder: 'Capstone advising' });
        topicWrap.append(topicLabel, topic);
        var btn = el('button', { class: 'btn mark', type: 'button', disabled: 'disabled' }, 'Confirm booking');
        var msg = el('p', { class: 'hint', role: 'alert' });
        confirm.append(topicWrap, btn);

        data.slots.forEach(function (s) {
          var b = el('button', { type: 'button', class: 'chip', 'aria-pressed': 'false' }, s.label);
          b.addEventListener('click', function () {
            grid.querySelectorAll('.chip').forEach(function (c) { c.setAttribute('aria-pressed', 'false'); });
            b.setAttribute('aria-pressed', 'true');
            selected = s.time;
            btn.disabled = false;
            msg.textContent = '';
          });
          grid.appendChild(b);
        });

        btn.addEventListener('click', function () {
          if (!selected) return;
          btn.disabled = true;
          post('/student/book', { facultyId: id, date: data.date, time: selected, topic: topic.value })
            .then(function (res) {
              if (res.ok) {
                if (dialog && dialog.showModal) dialog.showModal();
                else { alert('BOOKING CONFIRMED'); window.location = '/student/appointments'; }
              } else {
                msg.textContent = res.data.error || 'Could not book that slot.';
                btn.disabled = false;
                if (res.data.error && /no longer|just taken/.test(res.data.error)) showSlots(card, day);
              }
            })
            .catch(function () { msg.textContent = 'Network problem. Please try again.'; btn.disabled = false; });
        });

        area.append(grid, confirm, msg);
      })
      .catch(function () { area.replaceChildren(el('p', { class: 'slot-note' }, 'Could not load times. Please try again.')); });
  }

  list.addEventListener('click', function (e) {
    var view = e.target.closest('.js-view');
    var day = e.target.closest('.js-day');
    var notify = e.target.closest('.js-notify');

    if (view) {
      var card = view.closest('.fcard');
      var panel = card.querySelector('.schedule');
      var open = panel.hidden;
      panel.hidden = !open;
      view.setAttribute('aria-expanded', String(open));
      view.textContent = open ? 'Hide schedule' : 'View schedule';
    } else if (day) {
      var c = day.closest('.fcard');
      c.querySelectorAll('.js-day').forEach(function (d) { d.setAttribute('aria-pressed', 'false'); });
      day.setAttribute('aria-pressed', 'true');
      showSlots(c, day.dataset.day);
    } else if (notify) {
      post('/student/notify/' + notify.dataset.faculty).then(function (res) {
        if (res.ok) { notify.textContent = "We'll tell you"; notify.disabled = true; }
      });
    }
  });
})();
