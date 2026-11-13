#!/usr/bin/env python3
"""Build the app's www/ folder from the website files (the same files you upload to dieto.health).

Usage:  python3 scripts/build-www.py /path/to/website-folder [https://dieto.health]

The app bundles the pages so they open instantly and work offline, and talks to the API on your server.
"""
import os, re, shutil, sys

SRC = sys.argv[1] if len(sys.argv) > 1 else '../pwa/public'
SITE = (sys.argv[2] if len(sys.argv) > 2 else 'https://dieto.health').rstrip('/')
HERE = os.path.dirname(os.path.abspath(__file__))
WWW = os.path.join(HERE, '..', 'www')

BASE_TAG = '<script>window.DIETO_BASE=%r;</script>' % SITE


def read(p):
    with open(os.path.join(SRC, p), encoding='utf-8') as f:
        return f.read()


def write(p, s):
    out = os.path.join(WWW, p)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', encoding='utf-8') as f:
        f.write(s)


def inject_base(html):
    # must run before any page script reads window.DIETO_BASE
    return re.sub(r'<head>', '<head>\n' + BASE_TAG, html, count=1)


def rep(s, a, b, name, count=None):
    n = s.count(a)
    if n == 0 or (count is not None and n != count):
        raise SystemExit('build-www: expected text not found in %s: %r (found %d)' % (name, a[:60], n))
    return s.replace(a, b)


shutil.rmtree(WWW, ignore_errors=True)
os.makedirs(WWW)

# start page: open the app
write('index.html', '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
      '<style>html,body{margin:0;background:#1d5a3a}</style><script>location.replace("/app/index.html" + location.hash);</script></head><body></body></html>')

# the app
write('app/index.html', inject_base(read('app/index.html')))

# the diet test (website home page) lives at /test/ inside the app
t = inject_base(read('index.html'))
t = rep(t, "leadWebhookUrl: '/api/dieto-lead.php'", "leadWebhookUrl: '%s/api/dieto-lead.php'" % SITE, 'test')
t = rep(t, "href: '/app/'", "href: '/app/index.html'", 'test')
t = rep(t, "navigator.serviceWorker.register('/sw.js')", "(window.DIETO_BASE ? Promise.reject() : navigator.serviceWorker.register('/sw.js'))", 'test')
t = rep(t, "  function appCard() {\n", "  function appCard() {\n    if (window.DIETO_BASE) return h('div', { class: 'card appcard' }, [h('a', { class: 'btn btn-lime btn-block', href: '/app/index.html', html: ic('smartphone') + 'Open my plan in the app' })]);\n", 'test', 1)
t = t.replace("'Content-Type': 'application/json'", "'Content-Type': 'text/plain;charset=UTF-8'")   # simple requests: no CORS pre-check from the app
write('test/index.html', t)

# dietician chat (client) and dietician dashboard
write('consult/index.html', inject_base(read('consult/index.html')))
write('consult/terms.html', read('consult/terms.html'))
write('dietician/index.html', inject_base(read('dietician/index.html')))

# shared script, logo, icons
shutil.copy(os.path.join(SRC, 'dieto-common.js'), os.path.join(WWW, 'dieto-common.js'))
for extra in ['Logo.png', 'Graphic.png']:
    if os.path.exists(os.path.join(SRC, extra)):
        shutil.copy(os.path.join(SRC, extra), os.path.join(WWW, extra))
shutil.copytree(os.path.join(SRC, 'icons'), os.path.join(WWW, 'icons'))
print('www/ built from', SRC, 'for', SITE)
