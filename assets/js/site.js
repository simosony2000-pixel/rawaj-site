/* RAWÂJ — site behaviour.
 *
 * Progressive enhancement on purpose: index.html ships the Arabic already in
 * the markup, so this file only *replaces* text. If JS fails, the visitor
 * still gets a complete Arabic page rather than a page of empty <span>s.
 */
(function () {
  'use strict';

  var DICT = window.RAWAJ_I18N || {};
  var LS_KEY = 'rawaj-lang';
  var DEFAULT_LANG = 'ar';
  // wa.me wants digits only, no +, no spaces, no dashes.
  var WA_NUMBER = '212694179018';

  // The API lives on the same origin when served locally or through the
  // tunnel. On GitHub Pages the HTML sets RAWAJ_API_BASE to the tunnel so the
  // contact form still lands in the owner's Gmail; empty stays same-origin.
  var API_BASE = (window.RAWAJ_API_BASE || '').replace(/\/+$/, '');

  function getLang() {
    try {
      var saved = localStorage.getItem(LS_KEY);
      if (saved && DICT[saved]) return saved;
    } catch (e) { /* private mode: fall through to the default */ }
    // A visitor whose browser is set to French or English is far more likely
    // to want the English page than the Arabic one.
    var nav = (navigator.language || '').slice(0, 2).toLowerCase();
    return DICT[nav] ? nav : DEFAULT_LANG;
  }

  function t(key) {
    var lang = document.documentElement.lang;
    return (DICT[lang] && DICT[lang][key]) || DICT[DEFAULT_LANG][key] || key;
  }

  /* Highlight marker.
   *
   * A dictionary value like "أنا [[Amine]]، وكنخدم..." has to become real
   * <span class="hl"> nodes. Setting textContent - the obvious way - throws
   * that markup away, so every highlighted word in the message mock-up went
   * flat the moment the language was switched.
   *
   * [[ ]] is used rather than the guillemets « » because the Arabic copy
   * already quotes things («لا», «توقف») and those must stay literal quotes.
   */
  var HL = /\[\[(.+?)\]\]/g;

  function setText(el, value) {
    if (value.indexOf('[[') === -1) { el.textContent = value; return; }
    el.textContent = '';
    var last = 0, m;
    HL.lastIndex = 0;
    while ((m = HL.exec(value)) !== null) {
      if (m.index > last) {
        el.appendChild(document.createTextNode(value.slice(last, m.index)));
      }
      var span = document.createElement('span');
      span.className = 'hl';
      span.textContent = m[1];
      el.appendChild(span);
      last = m.index + m[0].length;
    }
    if (last < value.length) {
      el.appendChild(document.createTextNode(value.slice(last)));
    }
  }

  function applyLang(lang) {
    if (!DICT[lang]) return;
    document.documentElement.lang = lang;
    document.documentElement.dir = (lang === 'ar') ? 'rtl' : 'ltr';

    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      setText(el, t(el.getAttribute('data-i18n')));
    });
    // Inner-HTML variant, for the two <title>-ish/meta strings that need it.
    document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      el.innerHTML = t(el.getAttribute('data-i18n-html'));
    });
    // aria-label carries a key too: the promo player and the message preview
    // are both read out by a screen reader, and a French visitor should not be
    // read an Arabic label.
    document.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
    });

    document.title = t('meta.title');
    var md = document.querySelector('meta[name="description"]');
    if (md) md.setAttribute('content', t('meta.desc'));
    var ogd = document.querySelector('meta[property="og:description"]');
    if (ogd) ogd.setAttribute('content', t('meta.desc'));

    var label = document.getElementById('langLabel');
    if (label) label.textContent = (lang === 'ar') ? 'EN' : 'ع';

    // The WhatsApp link carries the visitor's first message, so it has to be
    // rewritten per language. A French or English speaker who clicks through
    // to WhatsApp and finds an Arabic question has to retype the whole thing.
    var waText = t('cta.waText');
    document.querySelectorAll('[data-wa]').forEach(function (a) {
      a.setAttribute('href', 'https://wa.me/' + WA_NUMBER + '?text=' +
        encodeURIComponent(waText));
    });

    // Placeholders are translated too, otherwise a French visitor sees an
    // Arabic placeholder inside a French form.
    document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph')));
    });

    try { localStorage.setItem(LS_KEY, lang); } catch (e) { /* ignore */ }
    document.dispatchEvent(new CustomEvent('rawaj:lang', { detail: { lang: lang } }));
  }

  // ------------------------------------------------------------- language
  var langBtn = document.getElementById('langBtn');
  if (langBtn) {
    langBtn.addEventListener('click', function () {
      applyLang(document.documentElement.lang === 'ar' ? 'en' : 'ar');
    });
  }

  // ----------------------------------------------------------------- menu
  var menuBtn = document.getElementById('menuBtn');
  var drawer = document.getElementById('navDrawer');
  if (menuBtn && drawer) {
    var closeDrawer = function () {
      drawer.classList.remove('open');
      menuBtn.setAttribute('aria-expanded', 'false');
      menuBtn.querySelector('use').setAttribute('href', '#i-menu');
    };
    menuBtn.addEventListener('click', function () {
      var open = drawer.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', String(open));
      menuBtn.querySelector('use').setAttribute('href', open ? '#i-x' : '#i-menu');
    });
    // Any nav tap closes the drawer - otherwise it stays open over the
    // section the visitor just jumped to.
    drawer.addEventListener('click', function (e) {
      if (e.target.closest('a')) closeDrawer();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeDrawer();
    });
  }

  // ------------------------------------------------------- contact form
  // Posts to the server we are served from, so the same origin works on
  // localhost, on the LAN and through the tunnel with no config anywhere.
  var form = document.getElementById('contact-form');
  if (form) {
    var status = document.getElementById('cform-status');
    var sendBtn = form.querySelector('.cform-btn');

    var say = function (key, isError) {
      if (!status) return;
      status.textContent = t(key);
      status.className = 'cform-status' + (isError ? ' is-error' : ' is-ok');
    };

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var data = new FormData(form);
      var email = (data.get('email') || '').toString().trim();
      var message = (data.get('message') || '').toString().trim();

      // Check here so the visitor gets an instant answer instead of a round
      // trip; the server re-checks both because clients lie.
      if (!message) return say('form.needMsg', true);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return say('form.needEmail', true);

      if (sendBtn) {
        sendBtn.disabled = true;
        var label = sendBtn.querySelector('span');
        if (label) label.textContent = t('form.sending');
      }
      say('form.sending', false);

      fetch(API_BASE + '/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: (data.get('name') || '').toString().trim(),
          business: (data.get('business') || '').toString().trim(),
          email: email,
          message: message,
          website: (data.get('website') || '').toString(),
          page: location.pathname + location.search
        })
      }).then(function (r) {
        return r.json().then(function (j) { return { ok: r.ok, body: j }; });
      }).then(function (res) {
        if (res.ok && res.body && res.body.ok) {
          form.reset();
          say('form.ok', false);
        } else {
          say('form.err', true);
        }
      }).catch(function () {
        say('form.err', true);
      }).then(function () {
        if (sendBtn) {
          sendBtn.disabled = false;
          var l = sendBtn.querySelector('span');
          if (l) l.textContent = t('form.send');
        }
      });
    });
  }

  // ------------------------------------------------------------------ faq
  // One open at a time: two open answers make the page look broken on mobile.
  document.querySelectorAll('.faq-item').forEach(function (item) {
    var q = item.querySelector('.faq-q');
    if (!q) return;
    q.addEventListener('click', function () {
      var wasOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item.open').forEach(function (o) {
        o.classList.remove('open');
      });
      item.classList.toggle('open', !wasOpen);
    });
  });

  // ---------------------------------------------------------------- video
  // Two films, one per language. <source> cannot be re-evaluated once the
  // browser has picked one, so switching means rewriting the child's src and
  // calling load() - which is why this is not just an attribute swap.
  var video = document.getElementById('promoVideo');
  if (video) {
    var dl = document.getElementById('promoDownload');

    var setVideoLang = function (lang) {
      var key = (lang === 'en') ? 'en' : 'ar';
      var src = video.getAttribute('data-' + key + '-src');
      var poster = video.getAttribute('data-' + key + '-poster');
      if (poster) video.setAttribute('poster', poster);
      if (dl && src) dl.setAttribute('href', src);
      if (!src) return;

      var current = video.querySelector('source');
      if (current && current.getAttribute('src') !== src) {
        var wasPlaying = !video.paused && !video.ended;
        current.setAttribute('src', src);
        video.load();
        if (wasPlaying) {
          var resume = function () {
            video.removeEventListener('canplay', resume);
            var p = video.play();
            if (p && p.catch) p.catch(function () { /* autoplay refused: leave it paused */ });
          };
          video.addEventListener('canplay', resume);
        }
      }
    };

    document.addEventListener('rawaj:lang', function (e) {
      setVideoLang(e.detail && e.detail.lang);
    });
    setVideoLang(document.documentElement.lang);
  }

  // --------------------------------------------------------- visit counter
  //
  // Real numbers, counted by our own server. Everything here is written so
  // that a failure produces NO number rather than a wrong one: the section
  // ships hidden and is only revealed once the server has answered.
  //
  // Privacy: the id is a random value minted in localStorage. No IP, no user
  // agent, no canvas, no third party. And if the browser sends Do Not Track we
  // do not send anything at all, because a visitor who says "do not track me"
  // is not to be quietly counted anyway.
  var VID_KEY = 'rawaj-vid';
  var visitsSent = false;

  function dnt() {
    return navigator.doNotTrack === '1' || window.doNotTrack === '1' ||
           navigator.msDoNotTrack === '1';
  }

  function randomId() {
    var bytes = new Uint8Array(16);
    var crypto = window.crypto || window.msCrypto;
    if (!crypto || !crypto.getRandomValues) return null;
    crypto.getRandomValues(bytes);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    // base64url: the server's id pattern is [A-Za-z0-9_-], so + / = would be
    // rejected and the visit would be silently dropped.
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function visitorId() {
    try {
      var saved = localStorage.getItem(VID_KEY);
      if (saved && /^[A-Za-z0-9_-]{16,64}$/.test(saved)) return saved;
      var fresh = randomId();
      if (!fresh) return null;
      localStorage.setItem(VID_KEY, fresh);
      return fresh;
    } catch (e) {
      return null;   // private mode: no id, no count, no complaint
    }
  }

  function group(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  function paintVisits(stats) {
    var box = document.querySelector('[data-visits]');
    if (!box || !stats) return;
    ['today_visitors', 'active_now', 'today_views', 'total_visitors'].forEach(function (k) {
      var el = box.querySelector('[data-visit="' + k + '"]');
      if (el && typeof stats[k] === 'number') el.textContent = group(stats[k]);
    });
    box.removeAttribute('hidden');
  }

  function refreshVisits() {
    return fetch(API_BASE + '/api/visits', { headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (j && j.ok) paintVisits(j); });
  }

  function initVisits() {
    var box = document.querySelector('[data-visits]');
    if (!box || visitsSent || dnt()) return;
    var vid = visitorId();
    if (!vid) return;
    visitsSent = true;

    var ctrl = ('AbortController' in window) ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 8000) : null;

    fetch(API_BASE + '/api/visits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vid: vid, path: location.pathname }),
      keepalive: true,
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (j && j.ok) paintVisits(j); })
      .catch(function () { /* no number beats a wrong number */ })
      .then(function () { if (timer) clearTimeout(timer); });

    // "On the site now" is a moving figure, so re-read it - by GET, which
    // counts nothing. Paused while the tab is hidden so a forgotten tab does
    // not keep talking to the server.
    var poll = function () {
      if (document.hidden) return;
      refreshVisits().catch(function () { /* transient: next tick retries */ });
    };
    setInterval(poll, 90000);
    document.addEventListener('visibilitychange', poll);
  }

  // ---------------------------------------------------------------- year
  var y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();

  // --------------------------------------------------------------- reveal
  // Only arm the animation once we know IntersectionObserver exists; a
  // browser without it must not be left with opacity:0 content.
  if ('IntersectionObserver' in window &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var targets = document.querySelectorAll('.how-card, .feat-card, .why-card, .price-card, .problem-card');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    targets.forEach(function (el) { el.classList.add('can-reveal'); io.observe(el); });
  }

  // ------------------------------------------------------------- go now
  applyLang(getLang());
  initVisits();
})();
