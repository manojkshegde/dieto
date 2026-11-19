/* dietO shared helpers: account sign-in (phone + OTP), API base for the app build, push notifications in the Android/iOS app.
   Used by /app/, /consult/ and /dietician/. On the website it simply runs without the native parts. */
(function () {
  'use strict';
  var BASE = window.DIETO_BASE || '';                       // '' on the website, 'https://dieto.health' inside the app
  try { var RF = (location.search.match(/[?&]ref=([A-Za-z0-9]{4,12})/) || [])[1]; if (RF) localStorage.setItem('dieto_ref', JSON.stringify(RF.toUpperCase())); } catch (e) {}
  var NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  var API = BASE + '/api/consult.php';
  var KEY = 'dieto_user';

  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } }
  function save(v) { try { if (v) localStorage.setItem(KEY, JSON.stringify(v)); else localStorage.removeItem(KEY); } catch (e) {} }

  /* MSG91 OTP widget (when the server uses it): loaded once, with our own sign-in screen (no MSG91 popup). */
  var M91 = null;
  function msg91(w) {
    if (M91) return M91;
    M91 = new Promise(function (resolve, reject) {
      window.initSendOTP = undefined;
      var cfg = { widgetId: w.id, tokenAuth: w.token, exposeMethods: true, success: function () {}, failure: function () {} };
      var urls = ['https://verify.msg91.com/otp-provider.js', 'https://verify.phone91.com/otp-provider.js'], i = 0;
      function attempt() {
        var sc = document.createElement('script'); sc.src = urls[i]; sc.async = true;
        sc.onload = function () {
          try { if (typeof window.initSendOTP === 'function') window.initSendOTP(cfg); } catch (e) {}
          var t = 0, iv = setInterval(function () { if (typeof window.sendOtp === 'function') { clearInterval(iv); resolve(); } else if (++t > 100) { clearInterval(iv); M91 = null; reject(new Error('Sign-in service didn’t load. Please try again.')); } }, 100);
        };
        sc.onerror = function () { if (++i < urls.length) attempt(); else { M91 = null; reject(new Error('Couldn’t reach the sign-in service. Check your internet.')); } };
        document.head.appendChild(sc);
      }
      attempt();
    });
    return M91;
  }
  function m91err(e) { return (e && (e.message || e.msg || (typeof e === 'string' ? e : ''))) || 'Something went wrong. Please try again.'; }
  function m91token(d) { if (!d) return ''; if (typeof d === 'string') return d; return d.message || d['access-token'] || d.accessToken || d.token || ''; }

  var Auth = {
    get: load,
    token: function () { var u = load(); return u && u.token || ''; },
    user: function () { var u = load(); return u && u.user || null; },
    headers: function () { return { 'Content-Type': 'text/plain;charset=UTF-8' }; },
    body: function (o) { var b = Object.assign({}, o || {}), t = Auth.token(); if (t) b._u = t; return JSON.stringify(b); },
    api: async function (route, body) {
      var ctl = window.AbortController ? new AbortController() : null, tm = ctl && setTimeout(function () { ctl.abort(); }, 20000), r;
      try { r = await fetch(API + '?route=' + route, { method: 'POST', headers: Auth.headers(), body: Auth.body(body), signal: ctl ? ctl.signal : undefined }); }
      catch (e) { throw new Error(navigator.onLine === false ? 'You’re offline. Check your internet and try again.' : 'Couldn’t reach dietO. Please try again in a moment.'); }
      finally { clearTimeout(tm); }
      var d = {}; try { d = await r.json(); } catch (e) {}
      if (r.status === 401 && d.error === 'signed out') save(null);
      if (!r.ok) { var e = new Error(d.error || 'Something went wrong. Please try again.'); e.status = r.status; e.data = d; throw e; }
      return d;
    },
    /* Signs out on the server (and stops this phone's notifications for the account), then clears everything this account left on the phone. */
    signOut: async function () {
      var dev = ''; try { dev = localStorage.getItem('dieto_push_token') || ''; } catch (e) {}
      try { await Promise.race([Auth.api('logout', { _dev: dev }), new Promise(function (r) { setTimeout(r, 5000); })]); } catch (e) {}
      save(null);
      try { Object.keys(localStorage).forEach(function (k) { if (/^dieto_/.test(k) && k !== 'dieto_push_token' && k !== 'dieto_seen') localStorage.removeItem(k); }); } catch (e) {}
      Auth._roles = {};
    },
    /* Renders a phone → OTP sign-in box into `box`. onDone({user, plan, code}) runs after a successful sign-in. */
    widget: function (box, opts) {
      opts = opts || {};
      var css = 'width:100%;box-sizing:border-box;padding:13px 14px;border-radius:12px;border:1.5px solid var(--line,#e3ebe5);background:#fff;font-size:17px;outline:0;font-family:inherit;margin:0';
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
      var ph = $('[data-ph]'), otp = $('[data-otp]'), msg = $('[data-msg]'), resend = $('[data-resend]'), timer = null, phone = '', widget = null;
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
          widget = d.widget || null;
          if (widget) {   // MSG91 sends the code (WhatsApp / SMS / email, as set in MSG91)
            await msg91(widget);
            await new Promise(function (ok, bad) { window.sendOtp('91' + phone, function (r) { ok(r); }, function (e) { bad(new Error(m91err(e))); }); });
          }
          $('[data-s1]').style.display = 'none'; $('[data-s2]').style.display = '';
          if (widget) {
            var who = widget.sender || 'Verify';
            $('[data-to]').innerHTML = 'Check <b>WhatsApp</b> on +91 ' + phone + ': we’ve sent your <b>dietO login code</b>' + (who.toLowerCase() === 'dieto' ? '.' : ' from “' + who.replace(/[<>&"]/g, '') + '”.');
          } else $('[data-to]').textContent = 'We sent a 6-digit code to +91 ' + phone + '.';
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
          var d;
          if (widget) {
            var res = await new Promise(function (ok, bad) { window.verifyOtp(c, function (r) { ok(r); }, function (e) { bad(new Error(m91err(e))); }); });
            d = await Auth.api('auth_widget', { access_token: m91token(res), phone: phone, name: opts.name || '' });
          } else d = await Auth.api('auth_verify', { phone: phone, code: c, name: opts.name || '' });
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
      // only when the app was built with Firebase (google-services.json); without it Android closes the app on register()
      if (!NATIVE || !window.DIETO_PUSH) return;
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
          Auth._listen();
          Auth._roles = Auth._roles || {}; Auth._roles[role] = dieticianToken || true;
          var known = localStorage.getItem('dieto_push_token'); if (known) Auth._sendToken(known);
          await PN.register();
        } catch (e) { /* push is optional */ }
      })();
    },
    /* Listeners go on at app start (before any permission prompt), so a tap on a notification that opened the app is never missed. */
    _listen: function () {
      if (Auth._listening || !NATIVE || !window.DIETO_PUSH) return;
      var PN = window.Capacitor.Plugins && window.Capacitor.Plugins.PushNotifications; if (!PN) return;
      Auth._listening = true;
      PN.addListener('registration', function (t) {
        try { localStorage.setItem('dieto_push_token', t.value); } catch (e) {}
        Auth._sendToken(t.value);
      });
      PN.addListener('pushNotificationActionPerformed', function (a) {
        var url = a && a.notification && a.notification.data && a.notification.data.url; if (url) Auth._go(url);
      });
      // app open (Android shows nothing on its own in the foreground; iOS shows its own banner)
      PN.addListener('pushNotificationReceived', function (n) {
        if (window.Capacitor.getPlatform() === 'ios') return;
        var url = (n && n.data && n.data.url) || '';
        if (url && Auth._here(url)) return;   // already looking at that chat
        Auth._banner(n.title || 'dietO', n.body || '', url);
      });
    },
    _here: function (url) {
      var path = url.split('#')[0], hash = url.indexOf('#') >= 0 ? url.slice(url.indexOf('#')) : '';
      if (location.pathname.indexOf(path.replace(/\/$/, '')) !== 0) return false;
      if (path.indexOf('/dietician') === 0) return true;   // the dashboard alerts for itself
      return !hash || location.hash === hash;
    },
    _go: function (url) {
      var target = Auth.href(url);
      if (Auth._here(url.split('#')[0]) && url.indexOf('#') >= 0) { location.hash = url.slice(url.indexOf('#')); return; }
      location.href = target;
    },
    _banner: function (title, body, url) {
      var old = document.getElementById('dieto-pushbar'); if (old) old.remove();
      var b = document.createElement('button'); b.id = 'dieto-pushbar'; b.type = 'button';
      b.style.cssText = 'position:fixed;left:10px;right:10px;top:calc(10px + env(safe-area-inset-top,0px));z-index:10000;border:0;text-align:left;background:#0B3B26;color:#fff;border-radius:18px;padding:12px 16px;box-shadow:0 10px 30px rgba(0,0,0,.25);font:inherit;cursor:pointer;max-width:520px;margin:0 auto';
      var t = document.createElement('b'); t.textContent = title; t.style.cssText = 'display:block;font-size:14.5px';
      var d = document.createElement('span'); d.textContent = body; d.style.cssText = 'display:block;font-size:13.5px;opacity:.85;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      b.appendChild(t); b.appendChild(d);
      b.addEventListener('click', function () { b.remove(); if (url) Auth._go(url); });
      document.body.appendChild(b);
      try { navigator.vibrate && navigator.vibrate(60); } catch (e) {}
      setTimeout(function () { b.remove(); }, 6000);
    },
    _sendToken: function (tok) {
      var platform = window.Capacitor.getPlatform();
      Object.keys(Auth._roles || {}).forEach(function (role) {
        var b = { token: tok, platform: platform, role: role };
        if (role === 'dietician') b._d = Auth._roles[role]; else { var t = Auth.token(); if (!t) return; b._u = t; }
        fetch(API + '?route=device', { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify(b) }).catch(function () {});
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

  /* Shared photos open in an in-app viewer; PDFs open in the in-app browser (app) or a new tab (web). Never leaves the app. */
  function viewer(src) {
    var ov = document.createElement('div');
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Photo');
    ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(5,15,10,.96);display:flex;align-items:center;justify-content:center;touch-action:pinch-zoom;overflow:auto';
    var img = document.createElement('img'); img.src = src; img.alt = 'Photo';
    img.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;display:block';
    var x = document.createElement('button'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.innerHTML = '&times;';
    x.style.cssText = 'position:fixed;top:calc(12px + env(safe-area-inset-top,0px));right:14px;width:44px;height:44px;border-radius:50%;border:0;background:rgba(255,255,255,.16);color:#fff;font-size:30px;line-height:40px;cursor:pointer';
    function close() { ov.remove(); document.removeEventListener('keydown', esc); }
    function esc(e) { if (e.key === 'Escape') close(); }
    ov.addEventListener('click', function (e) { if (e.target === ov || e.target === x) close(); });
    document.addEventListener('keydown', esc);
    ov.appendChild(img); ov.appendChild(x); document.body.appendChild(ov);
  }
  Auth.viewer = viewer;

  /* Read receipts on your own messages: ✓ sent · ✓✓ delivered · blue ✓✓ read. rc = { got, seen } from the server. */
  Auth.ticks = function (box, mine, rc) {
    if (!box || !rc) return;
    if (!document.getElementById('dieto-tk')) { var st = document.createElement('style'); st.id = 'dieto-tk'; st.textContent = '.tk{display:inline-block;vertical-align:-2px;margin-left:4px;width:17px;height:11px}.tk path{fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}.tk.seen{color:#34B7F1;opacity:1}.m.c .tk.seen{color:#9BE7FF}'; document.head.appendChild(st); }
    var S1 = '<svg class="tk" viewBox="0 0 17 11"><path d="M2 6l3 3 6-7"/></svg>', S2 = '<svg class="tk" viewBox="0 0 17 11"><path d="M1 6l3 3 6-7"/><path d="M7.5 8.5l.5.5 6-7"/></svg>';
    [].forEach.call(box.querySelectorAll('.m.' + mine + '[data-mid]'), function (n) {
      var id = +n.getAttribute('data-mid'), st = id <= (rc.seen || 0) ? 'seen' : id <= (rc.got || 0) ? 'got' : 'sent';
      if (n.getAttribute('data-tk') === st) return;
      var t = n.querySelector('time'); if (!t) return;
      var old = t.querySelector('.tk'); if (old) old.remove();
      t.insertAdjacentHTML('beforeend', st === 'sent' ? S1 : S2);
      var tk = t.querySelector('.tk'); if (st === 'seen') tk.classList.add('seen');
      tk.setAttribute('aria-label', st === 'seen' ? 'Read' : st === 'got' ? 'Delivered' : 'Sent');
      n.setAttribute('data-tk', st);
    });
  };
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[href*="route=file"]'); if (!a) return;
    var isImg = !!a.querySelector('img') || a.dataset.kind === 'image';
    if (isImg) { e.preventDefault(); viewer(a.querySelector('img') ? a.querySelector('img').src : a.href); return; }
    var B = NATIVE && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser;
    if (B) { e.preventDefault(); B.open({ url: a.href, presentationStyle: 'popover', toolbarColor: '#0B3B26' }).catch(function () { location.href = a.href; }); }
  }, true);

  /* Keep chat screens above the on-screen keyboard: --vvh follows the visible height. */
  if (window.visualViewport) {
    var setVH = function () { document.documentElement.style.setProperty('--vvh', Math.round(window.visualViewport.height) + 'px'); };
    window.visualViewport.addEventListener('resize', setVH); setVH();
  }
  // keep the push token registered for a signed-in user on every app start
  Auth._listen();
  if (NATIVE && Auth.token()) Auth.registerPush('user');
  try { var DT = localStorage.getItem('dieto_dtoken'); if (NATIVE && DT) Auth.registerPush('dietician', DT); } catch (e) {}
  // hide the launch splash as soon as the first screen has drawn (the config only keeps it as a fallback)
  if (NATIVE) {
    var hideSplash = function () { try { var sp = window.Capacitor.Plugins.SplashScreen; if (sp) sp.hide({ fadeOutDuration: 150 }); } catch (e) {} };
    var afterPaint = function () { requestAnimationFrame(function () { setTimeout(hideSplash, 30); }); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', afterPaint); else afterPaint();
  }
})();
