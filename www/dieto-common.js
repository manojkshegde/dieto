/* dietO shared helpers: account sign-in (phone + OTP), API base for the app build, push notifications in the Android/iOS app.
   Used by /app/, /consult/ and /dietician/. On the website it simply runs without the native parts. */
(function () {
  'use strict';
  var BASE = window.DIETO_BASE || '';                       // '' on the website, 'https://dieto.health' inside the app
  var NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  var API = BASE + '/api/consult.php';
  var KEY = 'dieto_user';

  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } }
  function save(v) { try { if (v) localStorage.setItem(KEY, JSON.stringify(v)); else localStorage.removeItem(KEY); } catch (e) {} }

  var Auth = {
    get: load,
    token: function () { var u = load(); return u && u.token || ''; },
    user: function () { var u = load(); return u && u.user || null; },
    headers: function () { var h = { 'Content-Type': 'application/json' }, t = Auth.token(); if (t) h['X-Dieto-User'] = t; return h; },
    api: async function (route, body) {
      var ctl = window.AbortController ? new AbortController() : null, tm = ctl && setTimeout(function () { ctl.abort(); }, 20000), r;
      try { r = await fetch(API + '?route=' + route, { method: 'POST', headers: Auth.headers(), body: JSON.stringify(body || {}), signal: ctl ? ctl.signal : undefined }); }
      catch (e) { throw new Error(navigator.onLine === false ? 'You’re offline. Check your internet and try again.' : 'Couldn’t reach dietO. Please try again in a moment.'); }
      finally { clearTimeout(tm); }
      var d = {}; try { d = await r.json(); } catch (e) {}
      if (r.status === 401 && d.error === 'signed out') save(null);
      if (!r.ok) { var e = new Error(d.error || 'Something went wrong. Please try again.'); e.status = r.status; e.data = d; throw e; }
      return d;
    },
    signOut: async function () { try { await Auth.api('logout'); } catch (e) {} save(null); },
    /* Renders a phone → OTP sign-in box into `box`. onDone({user, plan, code}) runs after a successful sign-in. */
    widget: function (box, opts) {
      opts = opts || {};
      var css = 'width:100%;padding:13px 14px;border-radius:12px;border:1.5px solid var(--line,#e3ebe5);background:#fff;font-size:17px;outline:0;font-family:inherit;margin:0';
      var btnCss = 'width:100%;margin-top:10px;border:0;border-radius:14px;padding:14px;font-weight:800;font-size:15.5px;background:var(--g700,#22704a);color:#fff;cursor:pointer;font-family:inherit';
      box.innerHTML = '';
      var wrap = document.createElement('div');
      wrap.innerHTML = (opts.title ? '<b style="display:block;font-size:17px;margin-bottom:4px">' + opts.title + '</b>' : '') +
        (opts.sub ? '<p style="margin:0 0 12px;color:var(--mute,#6f8077);font-size:14px;line-height:1.5">' + opts.sub + '</p>' : '') +
        '<div data-s1><div style="display:flex;gap:8px;align-items:center"><span style="font-weight:800;color:var(--ink2,#3d4f45)">+91</span><input data-ph type="tel" inputmode="numeric" maxlength="10" autocomplete="tel-national" placeholder="10-digit mobile number" style="' + css + '"></div>' +
        '<button data-send style="' + btnCss + '">Send code</button></div>' +
        '<div data-s2 style="display:none"><p data-to style="margin:0 0 8px;font-size:14px;color:var(--ink2,#3d4f45)"></p>' +
        '<input data-otp type="tel" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="6-digit code" style="' + css + ';text-align:center;letter-spacing:.4em;font-weight:800">' +
        '<button data-verify style="' + btnCss + '">Verify &amp; sign in</button>' +
        '<div style="display:flex;justify-content:space-between;margin-top:10px;font-size:13.5px"><a href="#" data-change style="color:var(--g700,#22704a);font-weight:700">Change number</a><a href="#" data-resend style="color:var(--g700,#22704a);font-weight:700"></a></div></div>' +
        '<p data-msg role="alert" style="margin:10px 0 0;font-size:14px;font-weight:600;min-height:1em"></p>';
      box.appendChild(wrap);
      var $ = function (s) { return wrap.querySelector(s); };
      var ph = $('[data-ph]'), otp = $('[data-otp]'), msg = $('[data-msg]'), resend = $('[data-resend]'), timer = null, phone = '';
      if (opts.phone) ph.value = String(opts.phone).replace(/\D/g, '').slice(-10);
      function say(t, ok) { msg.textContent = t || ''; msg.style.color = ok ? 'var(--g700,#22704a)' : 'var(--red,#d64545)'; }
      function countdown(s) {
        clearInterval(timer); resend.style.pointerEvents = 'none'; resend.style.opacity = '.5';
        var left = s; resend.textContent = 'Resend in ' + left + 's';
        timer = setInterval(function () { left--; if (left <= 0) { clearInterval(timer); resend.textContent = 'Resend code'; resend.style.pointerEvents = ''; resend.style.opacity = ''; } else resend.textContent = 'Resend in ' + left + 's'; }, 1000);
      }
      async function send() {
        phone = ph.value.replace(/\D/g, '').slice(-10);
        if (!/^[6-9]\d{9}$/.test(phone)) return say('Enter a valid 10-digit mobile number.');
        say(''); $('[data-send]').disabled = true; $('[data-send]').textContent = 'Sending…';
        try {
          var d = await Auth.api('auth_start', { phone: phone });
          $('[data-s1]').style.display = 'none'; $('[data-s2]').style.display = '';
          $('[data-to]').textContent = 'We sent a 6-digit code to +91 ' + phone + '.';
          if (d.test_code) say('Test mode: your code is ' + d.test_code, true);
          countdown(d.resend_in || 30); setTimeout(function () { otp.focus(); }, 50);
          // Android: read the SMS code automatically where supported
          if ('OTPCredential' in window) { try { navigator.credentials.get({ otp: { transport: ['sms'] } }).then(function (c) { if (c && c.code) { otp.value = c.code; verify(); } }).catch(function () {}); } catch (e) {} }
        } catch (e) { say(e.message); }
        $('[data-send]').disabled = false; $('[data-send]').textContent = 'Send code';
      }
      async function verify() {
        var c = otp.value.replace(/\D/g, '');
        if (c.length !== 6) return say('Enter the 6-digit code.');
        $('[data-verify]').disabled = true; $('[data-verify]').textContent = 'Checking…'; say('');
        try {
          var d = await Auth.api('auth_verify', { phone: phone, code: c, name: opts.name || '' });
          save({ token: d.token, user: d.user });
          Auth.registerPush('user');
          if (opts.onDone) opts.onDone(d);
        } catch (e) { say(e.message); $('[data-verify]').disabled = false; $('[data-verify]').innerHTML = 'Verify &amp; sign in'; }
      }
      $('[data-send]').addEventListener('click', send);
      ph.addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });
      $('[data-verify]').addEventListener('click', verify);
      otp.addEventListener('input', function () { if (otp.value.replace(/\D/g, '').length === 6) verify(); });
      $('[data-change]').addEventListener('click', function (e) { e.preventDefault(); clearInterval(timer); $('[data-s2]').style.display = 'none'; $('[data-s1]').style.display = ''; otp.value = ''; say(''); ph.focus(); });
      resend.addEventListener('click', function (e) { e.preventDefault(); send(); });
    },

    /* ---------- push notifications (Android/iOS app only) ---------- */
    registerPush: function (role, dieticianToken) {
      if (!NATIVE) return;
      var PN = window.Capacitor.Plugins && window.Capacitor.Plugins.PushNotifications; if (!PN) return;
      (async function () {
        try {
          if (window.Capacitor.getPlatform() === 'android') {
            await PN.createChannel({ id: 'chat', name: 'Dietician chat', description: 'Messages from your dietician', importance: 5, visibility: 1, sound: 'default' }).catch(function () {});
            await PN.createChannel({ id: 'clients', name: 'Clients waiting', description: 'New clients and bookings (dieticians)', importance: 5, visibility: 1, sound: 'default' }).catch(function () {});
          }
          var p = await PN.checkPermissions();
          if (p.receive !== 'granted') p = await PN.requestPermissions();
          if (p.receive !== 'granted') return;
          if (!Auth._listening) {
            Auth._listening = true;
            PN.addListener('registration', function (t) {
              try { localStorage.setItem('dieto_push_token', t.value); } catch (e) {}
              Auth._sendToken(t.value);
            });
            PN.addListener('pushNotificationActionPerformed', function (a) {
              var url = a && a.notification && a.notification.data && a.notification.data.url; if (url) location.href = Auth.href(url);
            });
          }
          Auth._roles = Auth._roles || {}; Auth._roles[role] = dieticianToken || true;
          var known = localStorage.getItem('dieto_push_token'); if (known) Auth._sendToken(known);
          await PN.register();
        } catch (e) { /* push is optional */ }
      })();
    },
    _sendToken: function (tok) {
      var platform = window.Capacitor.getPlatform();
      Object.keys(Auth._roles || {}).forEach(function (role) {
        var h = { 'Content-Type': 'application/json' };
        if (role === 'dietician') h['X-Dieto-Token'] = Auth._roles[role]; else { var t = Auth.token(); if (!t) return; h['X-Dieto-User'] = t; }
        fetch(API + '?route=device', { method: 'POST', headers: h, body: JSON.stringify({ token: tok, platform: platform, role: role }) }).catch(function () {});
      });
    },
    /* Page links: '/consult/#s=3' → '/consult/index.html#s=3' inside the app (no folder index there). */
    href: function (path) {
      if (!NATIVE) return path;
      return path.replace(/^(\/[a-z]+\/)(#|\?|$)/, '$1index.html$2').replace(/^\/(#|\?|$)/, '/test/index.html$1');   // the diet test lives at /test/ in the app
    },
    native: NATIVE,
    base: BASE
  };
  window.DietoAuth = Auth;
  // keep the push token registered for a signed-in user on every app start
  if (NATIVE && Auth.token()) Auth.registerPush('user');
})();
