(() => {
  'use strict';

  // ------------------------------------------------------------------ helpers
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function showToast(msg, ms = 1500) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { t.hidden = true; }, ms);
  }

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      ...opts,
    });
    let body = null;
    try { body = await res.json(); } catch { /* no-op */ }
    const ok = res.ok || res.status === 304;
    if (!ok) {
      const err = new Error(body?.error || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return body;
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function debounce(fn, ms) {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  // ------------------------------------------------------------------- state
  const defaultState = () => ({
    known: {},                // "level|de"  -> true
    struggled: {},            // aynı format — zorlanılan kelimeler
    lastLevel: 'a1',
    lastGroup: null,          // null = tüm gruplar
    lastIdx: 0,
    lastMode: 'cards',        // cards | quiz | artikel | stats
    hideKnown: false,
    quizDir: 'de-tr',
    quizInputMode: 'choice',  // 'choice' | 'type'
    dailyGoal: 10,
    lastStudyDate: null,      // 'YYYY-MM-DD'
    streakDays: 0,
    todayCount: 0,
    bestStreak: 0,
  });

  // ------------------------------------------------------------------ helpers (domain)
  function todayKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function isYesterday(prev, today) {
    if (!prev) return false;
    const t = new Date(today + 'T00:00:00');
    const p = new Date(prev + 'T00:00:00');
    const diff = (t - p) / 86400000;
    return diff === 1;
  }

  // "der Mann" -> { artikel: 'der', rest: ' Mann' }
  function splitArtikel(de) {
    if (!de) return { artikel: null, rest: '' };
    const m = de.match(/^(der|die|das)\s+(.+)$/i);
    if (!m) return { artikel: null, rest: de };
    return { artikel: m[1].toLowerCase(), rest: ' ' + m[2] };
  }

  // Almanca kelimeyi HTML olarak render et — artikel renkli span ile
  function renderWord(de) {
    const { artikel, rest } = splitArtikel(de);
    if (!artikel) return escapeHtml(de);
    return `<span class="art art-${artikel}">${artikel}</span>${escapeHtml(rest)}`;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  const app = {
    username: null,
    state: defaultState(),
    vocabCache: {},     // level -> array
    activeVocab: [],    // filtered & ordered
    activeLevel: 'a1',
    activeGroup: null,
    mode: 'cards',
    cardFlipped: false,
    quiz: { question: null, options: [], correctIdx: -1, score: 0, streak: 0, awaiting: false, currentCorrect: null },
    localCacheKey: 'deutsch.state.cache',
  };

  // ─── source / EG / verb state ──────────────────────────────────────────────
  const SRC_TO_PATH = { goethe: '/', einfach: '/telc', verb: '/fiil', studystats: '/istatistik', grammar: '/grammatik' };
  const PATH_TO_SRC = { '/telc': 'einfach', '/fiil': 'verb', '/istatistik': 'studystats', '/grammatik': 'grammar' };

  function srcFromPath(p) { return PATH_TO_SRC[p] || 'goethe'; }

  let activeSource = srcFromPath(window.location.pathname);
  const egState = {
    meta: null,
    sublevel: localStorage.getItem('egSublevel') || 'b1_1',
    known: new Set(),
    struggled: new Set(),
    inLektion: false,
  };
  const vbState = {
    recent: (() => { try { return JSON.parse(localStorage.getItem('recentVerbs') || '[]'); } catch { return []; } })(),
  };
  let lastVerbQuery = '';

  function keyOf(level, de) { return `${level}|${de}`; }

  // ----------------------------------------------------- persistence (server)
  const saveStateRemote = debounce(async () => {
    try {
      await api('/api/state', { method: 'PUT', body: JSON.stringify({ data: app.state }) });
    } catch (err) {
      console.warn('state save failed:', err.message);
      if (err.status === 401) { return logoutLocal(); }
      showToast('Senkron başarısız, tekrar denenecek.');
    }
  }, 800);

  function persistState() {
    try { localStorage.setItem(app.localCacheKey, JSON.stringify(app.state)); } catch {}
    saveStateRemote();
  }

  // --------------------------------------------------------------- auth flow
  const authForm = $('#auth-form');
  const authError = $('#auth-error');
  const authSubmit = $('#auth-submit');
  let authMode = 'login';

  $$('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      authMode = btn.dataset.tab;
      $$('.tab').forEach(b => b.classList.toggle('active', b === btn));
      authSubmit.textContent = authMode === 'login' ? 'Giriş yap' : 'Kayıt ol';
      authError.hidden = true;
    });
  });

  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    console.log('[auth] submit başladı, mode =', authMode);
    authError.hidden = true;
    authSubmit.disabled = true;
    const username = $('#username').value.trim();
    const password = $('#password').value;
    try {
      const path = authMode === 'login' ? '/api/login' : '/api/register';
      console.log('[auth] istek:', path, 'user:', username);
      const out = await api(path, { method: 'POST', body: JSON.stringify({ username, password }) });
      console.log('[auth] sunucu cevabı OK, username:', out?.username);
      app.username = out.username;
      const meOk = await loadMe(true);
      console.log('[auth] loadMe sonuç:', meOk, 'state:', app.state);
      try {
        await enterApp();
        console.log('[auth] enterApp tamamlandı, app ekranı açık olmalı');
      } catch (err) {
        console.error('[auth] enterApp hatası:', err);
        authError.textContent = 'Giriş başarılı ama uygulama açılamadı: ' + (err?.message || err);
        authError.hidden = false;
      }
    } catch (err) {
      console.error('[auth] istek hatası:', err);
      authError.textContent = err.message || 'Bir hata oluştu.';
      authError.hidden = false;
    } finally {
      authSubmit.disabled = false;
    }
  });

  async function loadMe(isFresh = false) {
    try {
      const me = await api('/api/me');
      app.username = me.username;
      const incoming = me.state && typeof me.state === 'object' ? me.state : {};
      app.state = { ...defaultState(), ...incoming, known: incoming.known || {} };
      return true;
    } catch (err) {
      if (isFresh && err.status === 401) return false;
      return false;
    }
  }

  function showAuth() {
    const auth = $('#auth-screen');
    const appS = $('#app-screen');
    auth.hidden = false;
    auth.style.display = '';
    appS.hidden = true;
    appS.style.display = 'none';
  }

  function showApp() {
    const auth = $('#auth-screen');
    const appS = $('#app-screen');
    auth.hidden = true;
    auth.style.display = 'none';
    appS.hidden = false;
    appS.style.display = '';
  }

  function logoutLocal() {
    app.username = null;
    app.state = defaultState();
    showAuth();
  }

  $('#logout-btn').addEventListener('click', async () => {
    try { await api('/api/logout', { method: 'POST' }); } catch {}
    try { localStorage.removeItem(app.localCacheKey); } catch {}
    logoutLocal();
  });

  // --------------------------------------------------------------- app boot
  async function enterApp() {
    showApp();
    $('#hello').textContent = `Merhaba, ${app.username}`;
    initSourceTabs();
    initStudyTimer();
    const allowedModes = new Set(['cards', 'quiz', 'artikel', 'known', 'struggled', 'stats']);
    app.mode = allowedModes.has(app.state.lastMode) ? app.state.lastMode : 'cards';
    setMode(app.mode, /*persist*/ false);
    $('#hide-known').checked = !!app.state.hideKnown;
    setLevel(app.state.lastLevel || 'a1', /*persist*/ false);
    await ensureVocab(app.activeLevel);
    rebuildActiveVocab(/*resetIdx*/ false);
    updateDailyBar();
    render();
  }

  // ------------------------------------------------------------ vocab loading
  async function ensureVocab(level) {
    if (app.vocabCache[level]) return app.vocabCache[level];
    const data = await api(`/api/vocab/${level}`);
    app.vocabCache[level] = Array.isArray(data) ? data : [];
    return app.vocabCache[level];
  }

  function setLevel(level, persist = true) {
    app.activeLevel = level;
    $$('.level-btn').forEach(b => b.classList.toggle('active', b.dataset.level === level));
    app.activeGroup = (app.state.lastLevel === level) ? app.state.lastGroup : null;
    app.state.lastLevel = level;
    document.title = `Deutsch ${level.toUpperCase()} · Almanca Öğrenme`;
    if (persist) {
      app.state.lastIdx = 0;
      app.state.lastGroup = null;
      persistState();
    }
  }

  $$('.level-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const lvl = btn.dataset.level;
      if (lvl === app.activeLevel) return;
      setLevel(lvl);
      await ensureVocab(lvl);
      // Başka bir seviyeye geçildiyse bu sonucu iptal et
      if (app.activeLevel !== lvl) return;
      rebuildActiveVocab(true);
      render();
    });
  });

  // -------------------------------------------------------- mode switching
  $$('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
  });

  function setMode(mode, persist = true) {
    app.mode = mode;
    $$('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    applyVisibility();
    app.state.lastMode = mode;
    if (persist) persistState();
    if (mode === 'quiz') startQuiz();
    if (mode === 'artikel') startArtikelQuiz();
    if (mode === 'stats') renderStats();
    if (mode === 'known') startKnownView();
    if (mode === 'struggled') startStruggled();
  }

  // -------------------------------------------------------- group filtering
  function rebuildActiveVocab(resetIdx) {
    const all = app.vocabCache[app.activeLevel] || [];
    const groups = Array.from(new Set(all.map(w => w.group))).filter(Boolean);
    renderGroupChips(groups);

    let filtered = all;
    if (app.activeGroup) filtered = filtered.filter(w => w.group === app.activeGroup);
    if (app.state.hideKnown) filtered = filtered.filter(w => !isWordKnown(w));

    app.activeVocab = filtered;
    if (resetIdx || app.state.lastIdx >= app.activeVocab.length) app.state.lastIdx = 0;
    app.cardFlipped = false;
  }

  function renderGroupChips(groups) {
    const wrap = $('#group-chips');
    wrap.innerHTML = '';
    const mkChip = (label, value) => {
      const b = document.createElement('button');
      b.className = 'chip' + ((value === app.activeGroup) ? ' active' : '');
      b.textContent = label;
      b.addEventListener('click', () => selectGroup(value));
      return b;
    };
    wrap.appendChild(mkChip('Tümü', null));
    groups.forEach(g => wrap.appendChild(mkChip(g, g)));

    // Açılır liste
    const sel = $('#group-select');
    sel.innerHTML = '';
    const allOpt = document.createElement('option');
    allOpt.value = '__all__';
    allOpt.textContent = `Tümü (${app.vocabCache[app.activeLevel]?.length || 0} kelime)`;
    sel.appendChild(allOpt);
    groups.forEach(g => {
      const opt = document.createElement('option');
      opt.value = g;
      const count = (app.vocabCache[app.activeLevel] || []).filter(w => w.group === g).length;
      opt.textContent = `${g} (${count})`;
      sel.appendChild(opt);
    });
    sel.value = app.activeGroup || '__all__';

    // 6'dan fazla grup varsa çipleri gizle (sadece select kalsın)
    $('#filters').classList.toggle('many-groups', groups.length > 6);
  }

  function selectGroup(value) {
    app.activeGroup = value;
    app.state.lastGroup = value;
    rebuildActiveVocab(true);
    persistState();
    render();
  }

  $('#group-select').addEventListener('change', (e) => {
    const v = e.target.value;
    selectGroup(v === '__all__' ? null : v);
  });

  $('#hide-known').addEventListener('change', (e) => {
    app.state.hideKnown = e.target.checked;
    rebuildActiveVocab(true);
    persistState();
    render();
  });

  $('#shuffle-btn').addEventListener('click', () => {
    app.activeVocab = shuffle(app.activeVocab);
    app.state.lastIdx = 0;
    app.cardFlipped = false;
    render();
  });

  // -------------------------------------------------------- card rendering
  const card = $('#card');
  const cardGroup = $('#card-group');
  const cardWord = $('#card-word');
  const cardTr = $('#card-tr');
  const cardEx = $('#card-ex');

  card.addEventListener('click', flipCard);
  card.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flipCard(); }
    else if (e.key === 'ArrowRight') next();
    else if (e.key === 'ArrowLeft')  prev();
    else if (e.key.toLowerCase() === 'k') markKnown(true);
    else if (e.key.toLowerCase() === 'r') markKnown(false);
  });

  function flipCard() {
    app.cardFlipped = !app.cardFlipped;
    card.classList.toggle('flipped', app.cardFlipped);
  }

  function currentWord() { return app.activeVocab[app.state.lastIdx] || null; }

  function render() {
    renderCard();
    renderProgress();
  }

  function renderCard() {
    const w = currentWord();
    const pluralEl = $('#card-plural');
    if (!w) {
      cardGroup.textContent = '';
      cardWord.textContent = 'Bu filtreyle gösterilecek kelime kalmadı 🎉';
      cardTr.textContent = '';
      cardEx.innerHTML = '';
      if (pluralEl) pluralEl.textContent = '';
      $('#card-counter').textContent = '0 / 0';
      return;
    }
    cardGroup.textContent = w.group || '';
    const frontSpeak = $('#card-speak-front');
    if (activeSource === 'einfach') {
      cardWord.textContent = w.tr;
      const plPart = w.plural ? ` (Çoğul: ${w.plural})` : '';
      if (pluralEl) pluralEl.innerHTML = `<b>${escapeHtml(w.de)}${escapeHtml(plPart)}</b>`;
      cardTr.textContent = '';
      const exTr = w.ex_tr ? `<div class="card-ex-tr">${escapeHtml(w.ex_tr)}</div>` : '';
      cardEx.innerHTML = (w.ex ? escapeHtml(w.ex) : '') + exTr;
      if (frontSpeak) frontSpeak.hidden = false;
    } else {
      if (pluralEl) pluralEl.textContent = '';
      cardWord.innerHTML = renderWord(w.de);
      cardTr.textContent = w.tr;
      const exTr = w.ex_tr ? `<div class="card-ex-tr">${escapeHtml(w.ex_tr)}</div>` : '';
      cardEx.innerHTML = (w.ex ? escapeHtml(w.ex) : '') + exTr;
      if (frontSpeak) frontSpeak.hidden = true;
    }
    card.classList.toggle('flipped', app.cardFlipped);
    $('#card-counter').textContent = `${app.state.lastIdx + 1} / ${app.activeVocab.length}`;
  }

  function renderProgress() {
    if (activeSource === 'einfach') {
      const all = app.vocabCache['eg'] || [];
      const sl = egState.sublevel;
      const knownCount = all.filter(w => egState.known.has(`${sl}|${w.group}|${w.de}`)).length;
      const total = all.length || 1;
      const pct = Math.round((knownCount / total) * 100);
      $('#progress-bar').style.width = pct + '%';
      $('#progress-text').textContent = `${knownCount} / ${all.length}`;
      return;
    }
    const all = app.vocabCache[app.activeLevel] || [];
    const knownCount = all.filter(w => app.state.known[keyOf(app.activeLevel, w.de)]).length;
    const total = all.length || 1;
    const pct = Math.round((knownCount / total) * 100);
    $('#progress-bar').style.width = pct + '%';
    $('#progress-text').textContent = `${knownCount} / ${all.length}`;
  }

  function next() {
    if (!app.activeVocab.length) return;
    app.state.lastIdx = (app.state.lastIdx + 1) % app.activeVocab.length;
    app.cardFlipped = false;
    persistState();
    render();
  }
  function prev() {
    if (!app.activeVocab.length) return;
    app.state.lastIdx = (app.state.lastIdx - 1 + app.activeVocab.length) % app.activeVocab.length;
    app.cardFlipped = false;
    persistState();
    render();
  }

  function markKnown(isKnown) {
    const w = currentWord();
    if (!w) return;
    if (activeSource === 'einfach') {
      const wk = `${egState.sublevel}|${w.group}|${w.de}`;
      if (isKnown) {
        egState.known.add(wk);
        egState.struggled.delete(wk);
        registerStudyAction();
        studyTimer.sessionWords++;
        animateSwipe('right');
      } else {
        egState.known.delete(wk);
        egState.struggled.add(wk);
        animateSwipe('left');
      }
      api('/api/eg/progress', {
        method: 'POST',
        body: JSON.stringify({ sublevel: egState.sublevel, word_key: wk, known: isKnown }),
      }).catch(() => {});
      setTimeout(() => {
        if (app.state.hideKnown) {
          rebuildActiveVocab(false);
          if (app.state.lastIdx >= app.activeVocab.length) app.state.lastIdx = 0;
        } else {
          if (app.activeVocab.length) app.state.lastIdx = (app.state.lastIdx + 1) % app.activeVocab.length;
        }
        app.cardFlipped = false;
        card.classList.remove('swipe-left', 'swipe-right');
        updateDailyBar();
        render();
      }, 220);
      return;
    }
    const k = keyOf(app.activeLevel, w.de);
    const wasKnown = !!app.state.known[k];
    if (isKnown) {
      app.state.known[k] = true;
      delete app.state.struggled[k];
      if (!wasKnown) { registerStudyAction(); studyTimer.sessionWords++; }
      animateSwipe('right');
    } else {
      delete app.state.known[k];
      app.state.struggled[k] = true;
      animateSwipe('left');
    }
    setTimeout(() => {
      if (app.state.hideKnown) {
        rebuildActiveVocab(false);
        if (app.state.lastIdx >= app.activeVocab.length) app.state.lastIdx = 0;
      } else {
        if (app.activeVocab.length) {
          app.state.lastIdx = (app.state.lastIdx + 1) % app.activeVocab.length;
        }
      }
      app.cardFlipped = false;
      card.classList.remove('swipe-left', 'swipe-right');
      persistState();
      updateDailyBar();
      render();
    }, 220);
  }

  // ----------------------------- streak + daily goal --------------------------
  function registerStudyAction() {
    const today = todayKey();
    const last = app.state.lastStudyDate;

    if (last !== today) {
      // yeni güne geçildi
      if (isYesterday(last, today)) {
        app.state.streakDays = (app.state.streakDays || 0) + 1;
      } else {
        app.state.streakDays = 1;
      }
      app.state.lastStudyDate = today;
      app.state.todayCount = 1;
    } else {
      app.state.todayCount = (app.state.todayCount || 0) + 1;
    }
    if (app.state.streakDays > (app.state.bestStreak || 0)) {
      app.state.bestStreak = app.state.streakDays;
    }
    // hedef tamamlandı mı?
    const goal = app.state.dailyGoal || 10;
    if (app.state.todayCount === goal) {
      showToast(`🎯 Günlük hedef tamam! ${goal} kelime — harika!`, 2400);
    }
  }

  function updateDailyBar() {
    const goal = app.state.dailyGoal || 10;
    // Yeni gün başladıysa todayCount sıfırla (görüntü için)
    const today = todayKey();
    let count = app.state.todayCount || 0;
    if (app.state.lastStudyDate !== today) count = 0;
    const pct = Math.min(100, Math.round((count / goal) * 100));
    $('#daily-fill').style.width = pct + '%';
    $('#daily-count').textContent = `${count}/${goal}`;
    $('#streak-days').textContent = app.state.streakDays || 0;
  }

  function animateSwipe(dir) {
    card.classList.add(dir === 'right' ? 'swipe-right' : 'swipe-left');
  }

  $('#next-btn').addEventListener('click', next);
  $('#prev-btn').addEventListener('click', prev);
  $('#known-btn').addEventListener('click', () => markKnown(true));
  $('#unknown-btn').addEventListener('click', () => markKnown(false));

  // ---------------------------------------------------- touch swipe support
  let touchStartX = null, touchStartY = null;
  card.addEventListener('touchstart', (e) => {
    if (!e.touches[0]) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });
  card.addEventListener('touchend', (e) => {
    if (touchStartX == null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
    touchStartX = touchStartY = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0) markKnown(true);
      else        markKnown(false);
    }
  });

  // ---------------------------------------------------------------- QUIZ
  function startQuiz() {
    app.quiz.score = 0;
    app.quiz.streak = 0;
    $$('.qdir-btn').forEach(b => b.classList.toggle('active', b.dataset.dir === app.state.quizDir));
    $$('.qmode-btn').forEach(b => b.classList.toggle('active', b.dataset.qmode === app.state.quizInputMode));
    applyQuizInputModeUI();
    updateQuizStats();
    nextQuizQuestion();
  }

  $$('.qdir-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      app.state.quizDir = btn.dataset.dir;
      $$('.qdir-btn').forEach(b => b.classList.toggle('active', b === btn));
      persistState();
      nextQuizQuestion();
    });
  });

  $$('.qmode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      app.state.quizInputMode = btn.dataset.qmode;
      $$('.qmode-btn').forEach(b => b.classList.toggle('active', b === btn));
      applyQuizInputModeUI();
      persistState();
      nextQuizQuestion();
    });
  });

  $('#quiz-next').addEventListener('click', nextQuizQuestion);

  function applyQuizInputModeUI() {
    const isType = app.state.quizInputMode === 'type';
    $('#quiz-options').hidden = isType;
    $('#quiz-write').hidden = !isType;
    // Yazma modunda yön her zaman TR→DE; dir-switch'i gizle
    $('#quiz-dir-switch').hidden = isType;
  }

  function updateQuizStats() {
    $('#quiz-score').textContent = app.quiz.score;
    $('#quiz-streak').textContent = app.quiz.streak;
  }

  // Yazma modu için: tr alanı gerçekten Türkçe çeviri mi?
  // (Tip B kalıntılarını eler — tr içinde Almanca cümle parçası vs.)
  function looksLikeValidTurkishTr(tr) {
    if (!tr) return false;
    const s = String(tr).trim();
    if (!s || s.length > 80) return false;
    // Türkçe'ye özgü karakter varsa kesin kabul
    if (/[çğıİöşüÇĞÖŞÜ]/.test(s)) return true;
    // Almanca'ya özgü karakter varsa kesin red
    if (/[äöüÄÖÜß]/.test(s)) return false;
    // Tanınan Almanca kelimeler tr'de olmamalı
    if (/\b(ist|sind|war|haben|hat|nicht|kein|eine|ein|der|die|das|den|dem|des|von|für|mit|sich|auf|aus|nach|über|wenn|dass|aber|oder|hier|dort|sein|werden|wollen|können|müssen)\b/i.test(s)) return false;
    // İngilizce sızıntı
    if (/^(to |the |a |of |here:|note:)/i.test(s)) return false;
    if (/\b(ing|tion|sion|ment|ness|ity|ous|ly|able|ible)\b/i.test(s)) return false;
    return true;
  }

  function nextQuizQuestion() {
    const isType = app.state.quizInputMode === 'type';
    let pool = (app.vocabCache[app.activeLevel] || []).filter(Boolean);
    // Yazma modunda sadece geçerli Türkçe çevirisi olanları kullan
    if (isType) pool = pool.filter(w => looksLikeValidTurkishTr(w.tr));

    if (pool.length < (isType ? 1 : 4)) {
      $('#quiz-question').textContent = isType
        ? 'Quiz için en az 1 kelime gerekli.'
        : 'Quiz için en az 4 kelime gerekli.';
      $('#quiz-options').innerHTML = '';
      $('#quiz-feedback').textContent = '';
      $('#quiz-next').hidden = true;
      return;
    }

    const idx = Math.floor(Math.random() * pool.length);
    const correct = pool[idx];
    app.quiz.currentCorrect = correct;

    if (isType) {
      renderTypeQuestion(correct);
    } else {
      renderChoiceQuestion(correct, pool);
    }

    $('#quiz-feedback').textContent = '';
    $('#quiz-feedback').className = 'quiz-feedback';
    $('#quiz-next').hidden = true;
    app.quiz.awaiting = true;
  }

  function renderChoiceQuestion(correct, pool) {
    const distractorSet = new Set([pool.indexOf(correct)]);
    const distractors = [];
    while (distractors.length < 3) {
      const j = Math.floor(Math.random() * pool.length);
      if (distractorSet.has(j)) continue;
      distractorSet.add(j);
      distractors.push(pool[j]);
    }
    const options = shuffle([correct, ...distractors]);
    const dir = app.state.quizDir;
    const qText = dir === 'de-tr' ? correct.de : correct.tr;
    const labelOf = (w) => dir === 'de-tr' ? w.tr : w.de;

    if (dir === 'de-tr') $('#quiz-question').innerHTML = renderWord(qText);
    else $('#quiz-question').textContent = qText;

    const wrap = $('#quiz-options');
    wrap.innerHTML = '';
    options.forEach((w) => {
      const b = document.createElement('button');
      b.className = 'quiz-opt';
      const lbl = labelOf(w);
      if (dir === 'tr-de') b.innerHTML = renderWord(lbl);
      else b.textContent = lbl;
      b.dataset.value = lbl;
      b.addEventListener('click', () => onQuizAnswer(b, w === correct, correct));
      wrap.appendChild(b);
    });
  }

  function renderTypeQuestion(correct) {
    // Yazma modunda yön TR → DE
    $('#quiz-question').textContent = correct.tr;
    const input = $('#qw-input');
    input.value = '';
    input.disabled = false;
    input.classList.remove('correct', 'wrong');
    $('#qw-check').disabled = false;
    $('#qw-check').textContent = 'Kontrol';
    $('#qw-reveal').hidden = false;
    // focus, ama mobilde klavye açılmasın diye küçük gecikme
    setTimeout(() => { try { input.focus(); } catch {} }, 30);
  }

  function onQuizAnswer(btn, isCorrect, correct) {
    if (!app.quiz.awaiting) return;
    app.quiz.awaiting = false;
    $$('#quiz-options .quiz-opt').forEach(b => b.disabled = true);
    if (isCorrect) {
      btn.classList.add('correct');
      app.quiz.score += 1;
      app.quiz.streak += 1;
      $('#quiz-feedback').textContent = `Doğru! ${correct.ex || ''}`;
    } else {
      btn.classList.add('wrong');
      app.quiz.streak = 0;
      const dir = app.state.quizDir;
      const correctLbl = dir === 'de-tr' ? correct.tr : correct.de;
      $$('#quiz-options .quiz-opt').forEach(b => {
        if (b.dataset.value === correctLbl) b.classList.add('correct');
      });
      $('#quiz-feedback').textContent = `Doğru cevap: ${correctLbl}`;
    }
    updateQuizStats();
    $('#quiz-next').hidden = false;
  }

  // -------- Yazma modu: normalize + cevap kontrolü
  function asciizeUmlaut(s) {
    return s
      .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue')
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss');
  }

  function normalizeAnswer(s) {
    if (!s) return '';
    let v = String(s).trim();
    // Parantez içini at: "Organisation (Singular)" -> "Organisation"
    v = v.replace(/\s*\([^)]*\)/g, '');
    // İlk virgülden sonrasını at: "die Ruine, -n" -> "die Ruine"
    v = v.replace(/,.*$/, '');
    v = v.trim().toLowerCase();
    // Umlaut'ları ASCII'leştir (her iki tarafa da uygulanırsa idempotent)
    v = asciizeUmlaut(v);
    v = v.replace(/\s+/g, ' ');
    return v;
  }

  // Returns: 'correct' | 'art_missing' | 'art_wrong' | 'wrong'
  function checkWriteAnswer(userInput, correctDe) {
    const ART_RE = /^(der|die|das)\s+/i;
    const norm = (s) => {
      let v = String(s || '').trim().replace(/\s*\([^)]*\)/g, '').replace(/,.*$/, '').trim().toLowerCase();
      return asciizeUmlaut(v).replace(/\s+/g, ' ');
    };
    const u = norm(userInput);
    if (!u) return 'wrong';
    const c = norm(correctDe);
    const correctHasArt = ART_RE.test(c);

    if (!correctHasArt) {
      // Artikelsiz kelime — eski fuzzy mantığı
      if (u === c) return 'correct';
      const cBase = c.replace(ART_RE, '');
      const uBase = u.replace(ART_RE, '');
      return (uBase === cBase || u === cBase || uBase === c) ? 'correct' : 'wrong';
    }

    // Artikelli isim
    const correctArt  = c.match(ART_RE)[1].toLowerCase();
    const correctWord = c.replace(ART_RE, '');
    const userHasArt  = ART_RE.test(u);
    const userArt     = userHasArt ? u.match(ART_RE)[1].toLowerCase() : null;
    const userWord    = userHasArt ? u.replace(ART_RE, '') : u;

    if (u === c) return 'correct';                                 // tam doğru
    if (!userHasArt && userWord === correctWord) return 'art_missing'; // kelime doğru, artikel yok
    if (userHasArt && userArt !== correctArt && userWord === correctWord) return 'art_wrong'; // yanlış artikel
    return 'wrong';
  }

  // -------- Yazma modu: input & butonlar
  const qwInput = $('#qw-input');

  $$('.qw-um').forEach(b => {
    // mousedown ile çalıştırıp default'u engelle: input focus kaybetmesin
    b.addEventListener('mousedown', (e) => {
      e.preventDefault();
      insertAtCursor(qwInput, b.dataset.ch);
    });
    b.addEventListener('touchstart', (e) => {
      e.preventDefault();
      insertAtCursor(qwInput, b.dataset.ch);
    }, { passive: false });
  });

  function insertAtCursor(input, ch) {
    if (input.disabled) return;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const before = input.value.slice(0, start);
    const after = input.value.slice(end);
    input.value = before + ch + after;
    const pos = start + ch.length;
    input.setSelectionRange(pos, pos);
    input.focus();
  }

  $('#qw-check').addEventListener('click', onWriteCheck);
  $('#qw-reveal').addEventListener('click', onWriteReveal);

  qwInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (app.quiz.awaiting) onWriteCheck();
    else nextQuizQuestion();
  });

  function onWriteCheck() {
    if (!app.quiz.awaiting) return;
    const correct = app.quiz.currentCorrect;
    if (!correct) return;
    const userVal = qwInput.value;
    if (!userVal.trim()) { qwInput.focus(); return; }
    finalizeWriteAnswer(checkWriteAnswer(userVal, correct.de), correct);
  }

  function onWriteReveal() {
    if (!app.quiz.awaiting) return;
    const correct = app.quiz.currentCorrect;
    if (!correct) return;
    finalizeWriteAnswer('wrong', correct, /*revealed*/ true);
  }

  function finalizeWriteAnswer(result, correct, revealed = false) {
    app.quiz.awaiting = false;
    qwInput.disabled = true;
    $('#qw-check').disabled = true;
    $('#qw-reveal').hidden = true;
    const fb = $('#quiz-feedback');
    const cleanDe = correct.de.replace(/,.*$/, '').trim();

    if (result === 'correct') {
      qwInput.classList.add('correct');
      app.quiz.score += 1;
      app.quiz.streak += 1;
      fb.className = 'quiz-feedback ok';
      fb.innerHTML = `Richtig! ✓ <span class="qw-fb-ex">${escapeHtml(correct.ex || '')}</span>`;
    } else if (result === 'art_missing') {
      qwInput.classList.add('warn');
      app.quiz.streak = 0;
      fb.className = 'quiz-feedback warn';
      fb.innerHTML = `Artikel eksik! Doğrusu: <b>${renderWord(cleanDe)}</b>`;
    } else if (result === 'art_wrong') {
      qwInput.classList.add('wrong');
      app.quiz.streak = 0;
      fb.className = 'quiz-feedback bad';
      fb.innerHTML = `Artikel yanlış! Doğrusu: <b>${renderWord(cleanDe)}</b>`;
    } else {
      qwInput.classList.add('wrong');
      app.quiz.streak = 0;
      fb.className = 'quiz-feedback bad';
      const prefix = revealed ? 'Cevap' : 'Doğrusu';
      fb.innerHTML = `${prefix}: <b>${renderWord(correct.de)}</b>`;
    }
    updateQuizStats();
    $('#quiz-next').hidden = false;
    // Sonraki için Enter dinleyebilelim: focus input
    setTimeout(() => { try { qwInput.focus(); } catch {} }, 30);
  }

  // ---------------------------------------------------------------- ARTIKEL QUIZ
  const artState = { score: 0, streak: 0, awaiting: false, autoTimer: null };

  function startArtikelQuiz() {
    artState.score = 0; artState.streak = 0;
    updateArtStats();
    nextArtikelQuestion();
  }

  function updateArtStats() {
    $('#art-score').textContent = artState.score;
    $('#art-streak').textContent = artState.streak;
  }

  function nextArtikelQuestion() {
    if (artState.autoTimer) { clearTimeout(artState.autoTimer); artState.autoTimer = null; }
    const pool = (app.vocabCache[app.activeLevel] || []).filter(w => /^(der|die|das)\s+/i.test(w.de || ''));
    if (pool.length < 1) {
      $('#art-question').textContent = 'Bu seviyede artikel quiz için isim bulunamadı.';
      $('#art-feedback').textContent = '';
      return;
    }
    const w = pool[Math.floor(Math.random() * pool.length)];
    const m = w.de.match(/^(der|die|das)\s+(.+)$/i);
    const correct = m[1].toLowerCase();
    const noun = m[2];
    artState.current = { correct, noun, word: w };
    $('#art-question').textContent = noun;
    $('#art-feedback').textContent = '';
    $$('.art-opt').forEach(b => {
      b.disabled = false;
      b.classList.remove('correct', 'wrong');
    });
    artState.awaiting = true;
  }

  $$('.art-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!artState.awaiting) return;
      artState.awaiting = false;
      const chosen = btn.dataset.art;
      const { correct, word } = artState.current;
      $$('.art-opt').forEach(b => b.disabled = true);
      if (chosen === correct) {
        btn.classList.add('correct');
        artState.score += 1;
        artState.streak += 1;
        $('#art-feedback').textContent = `Doğru! ${word.tr}${word.ex ? ' — ' + word.ex : ''}`;
      } else {
        btn.classList.add('wrong');
        artState.streak = 0;
        $$('.art-opt').forEach(b => {
          if (b.dataset.art === correct) b.classList.add('correct');
        });
        $('#art-feedback').innerHTML = `Doğru: <span class="art art-${correct}">${correct}</span> ${escapeHtml(word.noun || artState.current.noun)}`;
      }
      updateArtStats();
      artState.autoTimer = setTimeout(nextArtikelQuestion, 1300);
    });
  });

  // ---------------------------------------------------------------- STATS
  function renderStats() {
    const known = app.state.known || {};
    const totalKnown = Object.keys(known).length;
    $('#stat-total').textContent = totalKnown;

    $('#stat-streak').textContent = app.state.streakDays || 0;
    $('#stat-best-streak').textContent = app.state.bestStreak || 0;

    const goal = app.state.dailyGoal || 10;
    const today = todayKey();
    const todayCount = (app.state.lastStudyDate === today) ? (app.state.todayCount || 0) : 0;
    $('#stat-today').textContent = todayCount;
    $('#stat-goal').textContent = goal;
    $('#goal-input').value = goal;

    // Seviyelere göre
    const lvlWrap = $('#stat-levels');
    lvlWrap.innerHTML = '';
    ['a1', 'a2', 'b1'].forEach(lvl => {
      const list = app.vocabCache[lvl] || [];
      const k = list.filter(w => known[keyOf(lvl, w.de)]).length;
      const total = list.length;
      const pct = total ? Math.round((k / total) * 100) : 0;
      lvlWrap.appendChild(statRow(lvl.toUpperCase(), `${k} / ${total}`, pct));
    });

    // Kategorilere göre — aktif seviye
    $('#stat-cat-level').textContent = app.activeLevel.toUpperCase();
    const catWrap = $('#stat-cats');
    catWrap.innerHTML = '';
    const active = app.vocabCache[app.activeLevel] || [];
    const groups = {};
    active.forEach(w => {
      const g = w.group || '—';
      if (!groups[g]) groups[g] = { total: 0, known: 0 };
      groups[g].total += 1;
      if (known[keyOf(app.activeLevel, w.de)]) groups[g].known += 1;
    });
    // Sırala: en zayıftan en güçlüye (yüzdeye göre artan)
    const sorted = Object.entries(groups).sort((a, b) => {
      const pa = a[1].known / a[1].total;
      const pb = b[1].known / b[1].total;
      return pa - pb;
    });
    sorted.forEach(([name, g]) => {
      const pct = g.total ? Math.round((g.known / g.total) * 100) : 0;
      catWrap.appendChild(statRow(name, `${g.known} / ${g.total}`, pct));
    });

    // Bütün seviyelerin verisini ön-yükle (istatistik için)
    ['a1', 'a2', 'b1'].forEach(lvl => { if (!app.vocabCache[lvl]) ensureVocab(lvl).then(() => renderStats()).catch(() => {}); });
  }

  function statRow(name, value, pct) {
    const row = document.createElement('div');
    row.className = 'stat-row';
    row.innerHTML = `
      <div class="stat-row-head"><span>${escapeHtml(name)}</span><span>${escapeHtml(value)} <b>(${pct}%)</b></span></div>
      <div class="stat-row-bar"><div class="stat-row-fill" style="width:${pct}%"></div></div>`;
    return row;
  }

  // Goal input
  document.addEventListener('change', (e) => {
    if (e.target && e.target.id === 'goal-input') {
      const v = Math.max(1, Math.min(200, parseInt(e.target.value, 10) || 10));
      app.state.dailyGoal = v;
      e.target.value = v;
      persistState();
      updateDailyBar();
      $('#stat-goal').textContent = v;
    }
  });

  // ---------------------------------------------------------------- PWA register
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(err => console.warn('SW register başarısız:', err));
    });
  }

  // ---------------------------------------------------------------- config (registration)
  async function applyConfig() {
    try {
      const cfg = await api('/api/config');
      if (cfg && cfg.registrationOpen === false) {
        const regTab = document.querySelector('.tab[data-tab="register"]');
        if (regTab) regTab.style.display = 'none';
      }
    } catch {}
  }

  // --------------------------------------------------------------- bootstrap
  // ============================================================ TTS (Web Speech)
  const tts = {
    supported: typeof window.speechSynthesis !== 'undefined' && typeof window.SpeechSynthesisUtterance !== 'undefined',
    voice: null,
    voicesReady: false,
  };

  function pickGermanVoice() {
    if (!tts.supported) return null;
    const voices = window.speechSynthesis.getVoices() || [];
    if (!voices.length) return null;
    // Önce yerel/native bir Almanca ses bul
    let v = voices.find(x => /^de(-DE)?$/i.test(x.lang) && x.localService);
    if (!v) v = voices.find(x => /^de(-|_|$)/i.test(x.lang) && x.localService);
    if (!v) v = voices.find(x => /^de(-|_|$)/i.test(x.lang));
    return v || null;
  }

  if (tts.supported) {
    // İlk seferde voices boş gelebilir, event ile beklenir
    const refresh = () => { tts.voice = pickGermanVoice(); tts.voicesReady = true; };
    refresh();
    window.speechSynthesis.addEventListener?.('voiceschanged', refresh);
  }

  // Konuşmak için ses metnini hazırla: "der Mann, Männer" -> "der Mann"
  function ttsPrepare(de) {
    if (!de) return '';
    let s = String(de).trim();
    s = s.replace(/\s*\([^)]*\)/g, ''); // (Singular) gibi notlar
    s = s.replace(/,.*$/, '');           // ", -n" gibi plural
    return s.trim();
  }

  // text: konuşulacak metin; btn: vurgulanacak buton (opsiyonel)
  function speak(text, btn) {
    if (!tts.supported) { showToast('Bu tarayıcı sesi desteklemiyor.'); return; }
    const phrase = ttsPrepare(text);
    if (!phrase) return;

    // Chrome/Safari bug: cancel() + immediate speak() sessiz kalabiliyor.
    // resume() + 50ms gecikme ile düzeltilir.
    try {
      if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();
      if (window.speechSynthesis.paused)   window.speechSynthesis.resume();
    } catch {}

    const u = new SpeechSynthesisUtterance(phrase);
    u.lang = 'de-DE';
    u.rate = 0.85;
    u.pitch = 1;
    if (tts.voice) u.voice = tts.voice;

    const setSpeakingClass = (on) => {
      document.querySelectorAll('.card-speak, .card-speak-front, .wm-speak, .known-item-speak, .verb-speak-btn')
        .forEach(b => b.classList.remove('speaking'));
      if (on && btn) btn.classList.add('speaking');
    };
    u.onstart = () => setSpeakingClass(true);
    u.onend   = () => setSpeakingClass(false);
    u.onerror = () => setSpeakingClass(false);

    setTimeout(() => {
      try { window.speechSynthesis.speak(u); } catch {}
    }, 50);
  }

  // Flashcard speak butonu — kart döndürmesin diye stopPropagation
  $('#card-speak').addEventListener('click', (e) => {
    e.stopPropagation();
    const w = currentWord();
    if (w) speak(w.de, e.currentTarget);
  });

  $('#card-speak-front').addEventListener('click', (e) => {
    e.stopPropagation();
    const w = currentWord();
    if (w) speak(w.de, e.currentTarget);
  });

  // ============================================================ WORD MODAL
  const wmEl = $('#word-modal');
  let wmCurrent = null; // { word, level }

  function openWordModal(word, level) {
    if (!word) return;
    wmCurrent = { word, level: level || app.activeLevel };
    $('#wm-group').textContent = word.group || '';
    $('#wm-de').innerHTML = renderWord(word.de);
    // Çoğul: "der Mann, Männer" gibi ifadelerde virgül sonrasını çoğul olarak göster
    const m = String(word.de || '').match(/,\s*(.+)$/);
    $('#wm-plural').textContent = m ? `Çoğul: ${m[1].trim()}` : '';
    $('#wm-tr').textContent = word.tr || '';
    if (word.ex) {
      $('#wm-ex').hidden = false;
      $('#wm-ex-de').textContent = word.ex;
      $('#wm-ex-tr').textContent = word.ex_tr || '';
    } else {
      $('#wm-ex').hidden = true;
    }
    refreshWmKnownBtn();
    wmEl.hidden = false;
    wmEl.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeWordModal() {
    wmEl.hidden = true;
    wmEl.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    wmCurrent = null;
    try { window.speechSynthesis?.cancel(); } catch {}
  }

  function refreshWmKnownBtn() {
    if (!wmCurrent) return;
    const k = keyOf(wmCurrent.level, wmCurrent.word.de);
    const isKnown = !!app.state.known[k];
    const btn = $('#wm-known-btn');
    btn.textContent = isKnown ? '✓ Biliyorum işaretini kaldır' : '★ Biliyorum';
    btn.classList.toggle('unmark', isKnown);
  }

  // Modal kapatma: backdrop ve × butonu
  wmEl.addEventListener('click', (e) => {
    if (e.target.dataset.wmClose !== undefined ||
        e.target.closest('[data-wm-close]')) {
      closeWordModal();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !wmEl.hidden) closeWordModal();
  });

  $('#wm-speak').addEventListener('click', (e) => {
    if (!wmCurrent) return;
    speak(wmCurrent.word.de, e.currentTarget);
  });

  $('#wm-known-btn').addEventListener('click', () => {
    if (!wmCurrent) return;
    const k = keyOf(wmCurrent.level, wmCurrent.word.de);
    const isKnown = !!app.state.known[k];
    if (isKnown) {
      delete app.state.known[k];
    } else {
      app.state.known[k] = true;
      registerStudyAction();
      updateDailyBar();
    }
    persistState();
    refreshWmKnownBtn();
    // Bildiklerim ekranındaysak listeyi tazele
    if (app.mode === 'known') renderKnownList();
    // Kart ekranındaysak progress bar'ı tazele
    if (app.mode === 'cards') renderProgress();
  });

  // ============================================================ BİLDİKLERİM
  let knownSearchTerm = '';
  let knownSource = 'all';  // 'all' | 'goethe' | 'telc'
  let egKnownItems = [];    // { word, sublevel, sublevelLabel }

  $$('.ksf-btn').forEach(b => b.addEventListener('click', () => {
    knownSource = b.dataset.ksf;
    $$('.ksf-btn').forEach(x => x.classList.toggle('active', x === b));
    renderKnownList();
  }));

  function startKnownView() {
    ensureAllVocab().then(async () => {
      await loadAllEgKnown();
      $('#known-search').value = knownSearchTerm;
      renderKnownList();
    });
  }

  async function ensureAllVocab() {
    const levels = ['a1', 'a2', 'b1'];
    await Promise.all(levels.map(l => ensureVocab(l)));
  }

  // ── Zorlandıklarım ───────────────────────────────────────────────────────────
  let struggledSearchTerm = '';

  function startStruggled() {
    ensureAllVocab().then(() => {
      $('#struggled-search').value = struggledSearchTerm;
      renderStruggled();
    });
  }

  function collectStruggled() {
    const out = [];
    for (const lvl of ['a1', 'a2', 'b1']) {
      const list = app.vocabCache[lvl] || [];
      for (const w of list) {
        if ((app.state.struggled || {})[keyOf(lvl, w.de)]) {
          out.push({ word: w, level: lvl });
        }
      }
    }
    // Telc struggled
    for (const wk of egState.struggled) {
      const parts = wk.split('|');
      const sl = parts[0], de = parts.slice(2).join('|');
      const EG_LABELS = { a1_1:'A1.1', a1_2:'A1.2', a2_1:'A2.1', a2_2:'A2.2', b1_1:'B1.1', b1_2:'B1.2' };
      const cacheKey = `eg_all_${sl}`;
      const vocab = app.vocabCache[cacheKey] || app.vocabCache['eg'] || [];
      const word = vocab.find(w => w.de === de);
      if (word) out.push({ word, level: null, sublevelLabel: EG_LABELS[sl] || sl });
    }
    return out;
  }

  function renderStruggled() {
    const all = collectStruggled();
    const q = struggledSearchTerm.toLowerCase();
    const filtered = all.filter(it =>
      !q || it.word.de.toLowerCase().includes(q) || (it.word.tr || '').toLowerCase().includes(q)
    );
    const listEl = $('#struggled-list');
    const emptyEl = $('#struggled-empty');
    listEl.innerHTML = '';
    $('#struggled-count').textContent = q
      ? `${filtered.length} / ${all.length} kelime`
      : `${all.length} kelime`;

    if (!all.length) {
      emptyEl.hidden = false; return;
    }
    if (!filtered.length) {
      emptyEl.hidden = false;
      emptyEl.textContent = `"${struggledSearchTerm}" için sonuç yok.`;
      return;
    }
    emptyEl.hidden = true;
    const frag = document.createDocumentFragment();
    filtered.forEach(({ word, level, sublevelLabel }) => {
      const row = makeKnownItem(word, level);
      if (sublevelLabel) {
        const lbl = row.querySelector('.known-item-text');
        if (lbl) {
          const g = document.createElement('div');
          g.className = 'known-item-group';
          g.textContent = `${sublevelLabel} · ${word.group || ''}`;
          lbl.appendChild(g);
        }
      }
      // Zorlandıklarımdan çıkar butonu
      const removeBtn = document.createElement('button');
      removeBtn.className = 'struggled-remove';
      removeBtn.type = 'button';
      removeBtn.title = 'Listeden çıkar';
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (level) {
          delete (app.state.struggled || {})[keyOf(level, word.de)];
          persistState();
        } else {
          const wk = [...egState.struggled].find(k => k.endsWith(`|${word.de}`));
          if (wk) egState.struggled.delete(wk);
        }
        renderStruggled();
      });
      row.appendChild(removeBtn);
      frag.appendChild(row);
    });
    listEl.appendChild(frag);
  }

  $('#struggled-search').addEventListener('input', (e) => {
    struggledSearchTerm = e.target.value.trim();
    $('#struggled-clear').hidden = !struggledSearchTerm;
    renderStruggled();
  });
  $('#struggled-clear').addEventListener('click', () => {
    struggledSearchTerm = '';
    $('#struggled-search').value = '';
    $('#struggled-clear').hidden = true;
    renderStruggled();
    $('#struggled-search').focus();
  });

  async function loadAllEgKnown() {
    egKnownItems = [];
    try {
      const { known } = await api('/api/eg/progress?sublevel=all');
      if (!known || !known.length) return;
      const EG_LABELS = { a1_1:'A1.1', a1_2:'A1.2', a2_1:'A2.1', a2_2:'A2.2', b1_1:'B1.1', b1_2:'B1.2' };
      // group by sublevel
      const bySl = {};
      for (const wk of known) {
        const idx = wk.indexOf('|');
        const idx2 = wk.indexOf('|', idx + 1);
        if (idx < 0 || idx2 < 0) continue;
        const sl = wk.slice(0, idx);
        if (!bySl[sl]) bySl[sl] = [];
        bySl[sl].push(wk);
      }
      // load vocab per sublevel
      await Promise.all(Object.keys(bySl).map(async (sl) => {
        const cacheKey = `eg_all_${sl}`;
        if (!app.vocabCache[cacheKey]) {
          try {
            app.vocabCache[cacheKey] = await api(`/api/eg/words?sublevel=${sl}&lektion=all`);
          } catch { app.vocabCache[cacheKey] = []; }
        }
        const vocabMap = {};
        (app.vocabCache[cacheKey] || []).forEach(w => { vocabMap[w.de] = w; });
        for (const wk of bySl[sl]) {
          const parts = wk.split('|');
          const de = parts.slice(2).join('|');
          const word = vocabMap[de] || { de, group: parts[1] || '', tr: '', plural: null, ex: '' };
          egKnownItems.push({ word, sublevel: sl, sublevelLabel: EG_LABELS[sl] || sl });
        }
      }));
    } catch {}
  }

  function collectKnownWords() {
    const out = [];
    for (const lvl of ['a1', 'a2', 'b1']) {
      const list = app.vocabCache[lvl] || [];
      for (const w of list) {
        if (app.state.known[keyOf(lvl, w.de)]) {
          out.push({ word: w, level: lvl, source: 'goethe' });
        }
      }
    }
    return out;
  }

  function knownMatches(item, q) {
    if (!q) return true;
    const needle = q.toLowerCase();
    const de = (item.word.de || '').toLowerCase();
    const tr = (item.word.tr || '').toLowerCase();
    return de.includes(needle) || tr.includes(needle);
  }

  function renderKnownList() {
    const listEl = $('#known-list');
    const emptyEl = $('#known-empty');
    listEl.innerHTML = '';

    const goetheAll = collectKnownWords();
    const telcAll   = egKnownItems;
    const showGoethe = knownSource === 'all' || knownSource === 'goethe';
    const showTelc   = knownSource === 'all' || knownSource === 'telc';

    const goetheFiltered = showGoethe ? goetheAll.filter(it => knownMatches(it, knownSearchTerm)) : [];
    const telcFiltered   = showTelc   ? telcAll.filter(it => knownMatches(it, knownSearchTerm))   : [];
    const totalAll = (showGoethe ? goetheAll.length : 0) + (showTelc ? telcAll.length : 0);
    const totalFiltered = goetheFiltered.length + telcFiltered.length;

    $('#known-count').textContent = knownSearchTerm
      ? `${totalFiltered} / ${totalAll} kelime`
      : `${totalAll} kelime`;

    if (totalAll === 0) {
      emptyEl.hidden = false;
      emptyEl.innerHTML = 'Henüz <b>Biliyorum</b> işaretlediğin kelime yok.<br/>Kartlarda sağa kaydır veya <b>Biliyorum</b> butonuyla ekleyebilirsin.';
      return;
    }
    if (totalFiltered === 0) {
      emptyEl.hidden = false;
      emptyEl.textContent = `"${knownSearchTerm}" araması için sonuç yok.`;
      return;
    }
    emptyEl.hidden = true;

    const frag = document.createDocumentFragment();

    // ── Goethe bölümü ────────────────────────────────────────────────────────
    if (goetheFiltered.length) {
      if (knownSource === 'all') {
        const hdr = document.createElement('div');
        hdr.className = 'known-section-hdr';
        hdr.textContent = '📚 Goethe';
        frag.appendChild(hdr);
      }
      // Seviyeye ve gruba göre grupla
      const byGroup = {};
      goetheFiltered.forEach(it => {
        const key = `${it.level.toUpperCase()} · ${it.word.group || '—'}`;
        if (!byGroup[key]) byGroup[key] = [];
        byGroup[key].push(it);
      });
      Object.entries(byGroup).forEach(([groupKey, items]) => {
        const ghdr = document.createElement('div');
        ghdr.className = 'known-group-hdr';
        ghdr.textContent = groupKey;
        frag.appendChild(ghdr);
        items.forEach(it => frag.appendChild(makeKnownItem(it.word, it.level)));
      });
    }

    // ── Telc bölümü ──────────────────────────────────────────────────────────
    if (telcFiltered.length) {
      if (knownSource === 'all') {
        const hdr = document.createElement('div');
        hdr.className = 'known-section-hdr';
        hdr.textContent = '📖 Telc';
        frag.appendChild(hdr);
      }
      // Sublevel → lektion gruplama
      const byGroup = {};
      telcFiltered.forEach(it => {
        const key = `${it.sublevelLabel}|${it.word.group || '—'}`;
        if (!byGroup[key]) byGroup[key] = { label: `${it.sublevelLabel} · ${it.word.group || '—'}`, items: [] };
        byGroup[key].items.push(it);
      });
      Object.values(byGroup).forEach(({ label, items }) => {
        const ghdr = document.createElement('div');
        ghdr.className = 'known-group-hdr';
        ghdr.textContent = label;
        frag.appendChild(ghdr);
        items.forEach(it => frag.appendChild(makeKnownItem(it.word, null)));
      });
    }

    listEl.appendChild(frag);
  }

  function makeKnownItem(word, level) {
    const row = document.createElement('div');
    row.className = 'known-item';
    row.innerHTML = `
      <div class="known-item-text">
        <div class="known-item-de">${renderWord(word.de)}</div>
        <div class="known-item-tr">${escapeHtml(word.tr || '')}</div>
      </div>
      <button class="known-item-speak" type="button" aria-label="Telaffuzu dinle">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path fill="currentColor" d="M3 10v4a1 1 0 0 0 1 1h3l4 3.5a1 1 0 0 0 1.65-.78V6.28A1 1 0 0 0 11 5.5L7 9H4a1 1 0 0 0-1 1Zm13.5 2a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4Zm-2.5-8v2.07a6.5 6.5 0 0 1 0 11.86V20a8.5 8.5 0 0 0 0-16Z"/>
        </svg>
      </button>
    `;
    row.addEventListener('click', (e) => {
      if (e.target.closest('.known-item-speak')) return;
      openWordModal(word, level);
    });
    row.querySelector('.known-item-speak').addEventListener('click', (e) => {
      e.stopPropagation();
      speak(word.de, e.currentTarget);
    });
    return row;
  }

  $('#known-search').addEventListener('input', (e) => {
    knownSearchTerm = e.target.value.trim();
    $('#known-clear').hidden = !knownSearchTerm;
    renderKnownList();
  });
  $('#known-clear').addEventListener('click', () => {
    knownSearchTerm = '';
    $('#known-search').value = '';
    $('#known-clear').hidden = true;
    renderKnownList();
    $('#known-search').focus();
  });

  // ================================================================ VISIBILITY
  function applyVisibility() {
    const mode        = app.mode;
    const isGoethe    = activeSource === 'goethe';
    const isEinfach   = activeSource === 'einfach';
    const isVerb      = activeSource === 'verb';
    const isStudyStat = activeSource === 'studystats';
    const isGrammar   = activeSource === 'grammar';
    const inLkt       = egState.inLektion;

    const hideAll = isVerb || isStudyStat || isGrammar;
    $('.level-switch').hidden  = !isGoethe;
    $('.mode-switch').hidden   = hideAll;
    $('#daily-bar').hidden     = hideAll || mode === 'stats';
    $('#filters').hidden       = !(isGoethe && mode === 'cards');
    $('#progress-wrap').hidden = hideAll || mode === 'stats' || mode === 'artikel' || mode === 'known';

    const showKnown   = isGoethe || isEinfach;
    const showContent = isGoethe || (isEinfach && inLkt);

    const noPanel = mode === 'known' || mode === 'struggled';
    $('#eg-panel').hidden         = !(isEinfach && !inLkt && !noPanel);
    $('#eg-back-btn').hidden      = !(isEinfach && inLkt);
    $('#verb-panel').hidden        = !isVerb;
    $('#study-stats-panel').hidden = !isStudyStat;
    $('#grammar-panel').hidden     = !isGrammar;

    $('#cards-mode').hidden    = !showContent || mode !== 'cards';
    $('#quiz-mode').hidden     = !showContent || mode !== 'quiz';
    $('#artikel-mode').hidden  = !showContent || mode !== 'artikel';
    $('#known-mode').hidden    = !showKnown   || mode !== 'known';
    $('#struggled-mode').hidden= !showKnown   || mode !== 'struggled';
    $('#stats-mode').hidden    = !showContent || mode !== 'stats';
  }

  function isWordKnown(w) {
    if (activeSource === 'einfach') {
      return egState.known.has(`${egState.sublevel}|${w.group}|${w.de}`);
    }
    return !!app.state.known[keyOf(app.activeLevel, w.de)];
  }

  // ================================================================ SOURCE TABS
  function initSourceTabs() {
    $$('.src-tab').forEach(b => b.addEventListener('click', () => setSource(b.dataset.src)));
    applySourceTabUI();
    if (activeSource === 'einfach') loadEgMeta();
    else if (activeSource === 'verb') renderRecentVerbs();
    else if (activeSource === 'grammar') loadGrammarTopics();
  }

  function applySourceTabUI() {
    $$('.src-tab').forEach(b => b.classList.toggle('active', b.dataset.src === activeSource));
    applyVisibility();
  }

  window.addEventListener('popstate', () => {
    activeSource = srcFromPath(window.location.pathname);
    applySourceTabUI();
    if (activeSource === 'einfach' && !egState.inLektion) loadEgMeta();
    else if (activeSource === 'verb') renderRecentVerbs();
    else if (activeSource === 'studystats') renderStudyStatsPanel();
    else if (activeSource === 'grammar') loadGrammarTopics();
  });

  function setSource(src) {
    activeSource = src;
    localStorage.setItem('activeTab', src);
    history.pushState({ src }, '', SRC_TO_PATH[src] || '/');
    applySourceTabUI();
    if (src === 'goethe') {
      // Goethe'ye dönünce level'i ve vocab'ı yenile
      const lvl = ['a1', 'a2', 'b1'].includes(app.state.lastLevel) ? app.state.lastLevel : 'a1';
      setLevel(lvl, false);
      ensureVocab(lvl).then(() => { rebuildActiveVocab(true); render(); });
    } else if (src === 'einfach') {
      if (!egState.inLektion) loadEgMeta();
    } else if (src === 'verb') {
      renderRecentVerbs();
    } else if (src === 'studystats') {
      renderStudyStatsPanel();
    } else if (src === 'grammar') {
      loadGrammarTopics();
    }
  }

  // ================================================================ EINFACH GUT
  async function loadEgMeta() {
    if (!egState.meta) {
      try {
        egState.meta = await api('/api/eg/meta');
      } catch {
        showToast('Bağlantı hatası, tekrar deneyin');
        return;
      }
    }
    if (egState.known.size === 0) {
      try {
        const { known } = await api(`/api/eg/progress?sublevel=${egState.sublevel}`);
        egState.known = new Set(known || []);
      } catch {}
    }
    renderEgSublevelBar();
    renderEgLektionList();
  }

  function renderEgSublevelBar() {
    $$('.eg-sl').forEach(b => b.classList.toggle('active', b.dataset.sl === egState.sublevel));
  }

  $$('.eg-sl').forEach(b => b.addEventListener('click', () => selectEgSublevel(b.dataset.sl)));

  async function selectEgSublevel(sl) {
    if (sl === egState.sublevel && egState.meta) { renderEgSublevelBar(); renderEgLektionList(); return; }
    egState.sublevel = sl;
    egState.known = new Set();
    egState.inLektion = false;
    localStorage.setItem('egSublevel', sl);
    applyVisibility();
    try {
      const { known } = await api(`/api/eg/progress?sublevel=${sl}`);
      egState.known = new Set(known || []);
    } catch {}
    renderEgSublevelBar();
    renderEgLektionList();
  }

  function egKnownCount(sl, groupName) {
    const prefix = `${sl}|${groupName}|`;
    let n = 0;
    for (const k of egState.known) { if (k.startsWith(prefix)) n++; }
    return n;
  }

  function renderEgLektionList() {
    const sl = egState.sublevel;
    const info = egState.meta && egState.meta[sl];
    const wrap = $('#eg-lektions');
    if (!info) { wrap.innerHTML = ''; return; }

    let totalCount = 0;
    let totalKnown = 0;
    info.lektions.forEach(lkt => {
      totalCount += lkt.count;
      totalKnown += egKnownCount(sl, lkt.name);
    });

    const mkCard = (name, count, known, idx) => {
      const pct = count ? Math.round((known / count) * 100) : 0;
      const card = document.createElement('button');
      card.className = 'eg-lektion-card';
      card.type = 'button';
      card.innerHTML = `
        <div class="eg-lk-top">
          <span class="eg-lk-name">${escapeHtml(name)}</span>
          <span class="eg-lk-count">${known}/${count} ✓</span>
        </div>
        <div class="eg-lk-bar"><div class="eg-lk-fill" style="width:${pct}%"></div></div>`;
      card.addEventListener('click', () => selectEgLektion(idx));
      return card;
    };

    wrap.innerHTML = '';
    const frag = document.createDocumentFragment();
    info.lektions.forEach((lkt, i) => {
      const known = egKnownCount(sl, lkt.name);
      frag.appendChild(mkCard(lkt.name, lkt.count, known, i + 1));
    });
    // "Tümü" kartı
    frag.appendChild(mkCard(`Tümü — ${info.label}`, totalCount, totalKnown, 'all'));
    wrap.appendChild(frag);
  }

  async function selectEgLektion(idx) {
    const sl = egState.sublevel;
    try {
      const url = idx === 'all'
        ? `/api/eg/words?sublevel=${sl}&lektion=all`
        : `/api/eg/words?sublevel=${sl}&lektion=${idx}`;
      const words = await api(url);
      app.vocabCache['eg'] = words;
      app.activeLevel = 'eg';
      egState.inLektion = true;
      app.state.lastIdx = 0;
      app.cardFlipped = false;
      rebuildActiveVocab(true);
      applyVisibility();
      setMode('cards', false);
      render();
    } catch {
      showToast('Kelimeler yüklenemedi, tekrar deneyin');
    }
  }

  $('#eg-back-btn').addEventListener('click', () => {
    egState.inLektion = false;
    app.vocabCache['eg'] = [];
    applyVisibility();
    renderEgLektionList();
  });

  // ================================================================ FİİL ÇEKİMİ
  $('#verb-search-btn').addEventListener('click', doVerbSearch);
  $('#verb-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') doVerbSearch(); });

  function doVerbSearch() {
    const q = $('#verb-input').value.trim().toLowerCase();
    if (!q) return;
    searchVerb(q);
  }

  async function searchVerb(q) {
    lastVerbQuery = q;
    $('#verb-input').value = q;
    try {
      const data = await api(`/api/verb?q=${encodeURIComponent(q)}`);
      renderVerbResult(data);
      if (data.found) {
        addRecentVerb(q);
        renderRecentVerbs();
      }
    } catch {
      showToast('Bağlantı hatası, tekrar deneyin');
    }
  }

  function addRecentVerb(q) {
    vbState.recent = [q, ...vbState.recent.filter(v => v !== q)].slice(0, 5);
    try { localStorage.setItem('recentVerbs', JSON.stringify(vbState.recent)); } catch {}
  }

  function renderRecentVerbs() {
    const wrap = $('#recent-verbs-wrap');
    if (!wrap) return;
    wrap.innerHTML = '';
    if (!vbState.recent.length) return;
    const frag = document.createDocumentFragment();
    vbState.recent.forEach(v => {
      const chip = document.createElement('button');
      chip.className = 'verb-recent-chip';
      chip.type = 'button';
      chip.innerHTML = `${escapeHtml(v)} <span class="verb-chip-x" data-v="${escapeHtml(v)}">×</span>`;
      chip.addEventListener('click', (e) => {
        if (e.target.classList.contains('verb-chip-x')) {
          vbState.recent = vbState.recent.filter(x => x !== e.target.dataset.v);
          try { localStorage.setItem('recentVerbs', JSON.stringify(vbState.recent)); } catch {}
          renderRecentVerbs();
          return;
        }
        searchVerb(v);
      });
      frag.appendChild(chip);
    });
    wrap.appendChild(frag);
  }

  function renderVerbResult(data) {
    const wrap = $('#verb-result');
    if (!data || !data.found) {
      wrap.innerHTML = `<div class="verb-not-found">„${escapeHtml(lastVerbQuery)}" bulunamadı. Infinitiv formunu deneyin.</div>`;
      return;
    }
    const PERSONS = ['ich', 'du', 'er/sie/es', 'wir', 'ihr', 'Sie'];
    const speakBtn = (text) =>
      `<button class="verb-speak-btn" type="button" data-speak="${escapeHtml(text)}" aria-label="${escapeHtml(text)} telaffuzu dinle">🔊</button>`;

    const mainRows = PERSONS.map((p, i) =>
      `<tr><td class="vt-person">${escapeHtml(p)}</td>` +
      `<td class="vt-form">${escapeHtml(data.prasens[i])} ${speakBtn(data.prasens[i])}</td>` +
      `<td class="vt-form">${escapeHtml(data.prateritum[i])} ${speakBtn(data.prateritum[i])}</td></tr>`
    ).join('');

    const konjRows = PERSONS.map((p, i) =>
      `<tr><td class="vt-person">${escapeHtml(p)}</td>` +
      `<td class="vt-form">${escapeHtml(data.konjunktiv2[i])} ${speakBtn(data.konjunktiv2[i])}</td></tr>`
    ).join('');

    wrap.innerHTML = `
      <div class="verb-card">
        <div class="verb-header">
          <h2 class="verb-title">
            ${escapeHtml(data.infinitiv)}
            <button class="verb-speak-btn verb-title-speak" type="button"
              data-speak="${escapeHtml(data.infinitiv)}" aria-label="Infinitiv dinle">🔊</button>
          </h2>
          <div class="verb-meta">
            Yardımcı fiil: <strong>${escapeHtml(data.hilfsverb)}</strong>
            &nbsp;·&nbsp;
            Partizip II: <strong>${escapeHtml(data.partizip2)}</strong>
            ${speakBtn(data.partizip2)}
          </div>
        </div>

        <div class="vt-wrap">
          <table class="vt">
            <thead><tr><th>Kişi</th><th>Präsens</th><th>Präteritum</th></tr></thead>
            <tbody>${mainRows}</tbody>
          </table>
        </div>

        <div class="vt-sub-wrap">
          <div class="vt-sub-block">
            <h4 class="vt-sub-title">Konjunktiv II</h4>
            <table class="vt vt-small"><tbody>${konjRows}</tbody></table>
          </div>
          <div class="vt-sub-block">
            <h4 class="vt-sub-title">Imperativ</h4>
            <table class="vt vt-small">
              <tbody>
                <tr><td class="vt-person">Tekil</td>
                    <td class="vt-form">${escapeHtml(data.imperativ.singular)}! ${speakBtn(data.imperativ.singular)}</td></tr>
                <tr><td class="vt-person">Çoğul</td>
                    <td class="vt-form">${escapeHtml(data.imperativ.plural)}! ${speakBtn(data.imperativ.plural)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>`;

    wrap.querySelectorAll('.verb-speak-btn').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); speak(btn.dataset.speak, btn); });
    });
  }

  (async function init() {
    showAuth();
    applyConfig();
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem(app.localCacheKey) || 'null'); } catch {}
    if (cached) app.state = { ...defaultState(), ...cached, known: cached.known || {} };

    const ok = await loadMe(true);
    if (ok) {
      await enterApp();
    } else {
      showAuth();
    }
  })();

  // ================================================================ STUDY TIMER
  const studyTimer = {
    startTime: 0,
    sessionSeconds: 0,
    sessionWords: 0,
    lastPingWords: 0,
    pingInterval: null,
    tickInterval: null,
    paused: false,
  };

  function initStudyTimer() {
    studyTimer.startTime    = Date.now();
    studyTimer.sessionSeconds = 0;
    studyTimer.sessionWords = 0;
    studyTimer.lastPingWords = 0;
    studyTimer.paused = false;

    // Son oturum toast'u
    try {
      const ls = JSON.parse(localStorage.getItem('lastSession') || 'null');
      if (ls && ls.ts && (Date.now() - ls.ts) < 10 * 60 * 1000 && ls.duration_seconds > 10) {
        const m = Math.floor(ls.duration_seconds / 60);
        const s = ls.duration_seconds % 60;
        const timeStr = m > 0 ? `${m} dk ${s} sn` : `${s} sn`;
        showToast(`Son oturum: ${timeStr} — ${ls.words_learned} kelime 🎉`, 4000);
      }
      localStorage.removeItem('lastSession');
    } catch {}

    const toggleBtn = $('#timer-toggle');
    if (toggleBtn) {
      toggleBtn.hidden = false;
      toggleBtn.addEventListener('click', () => {
        studyTimer.paused = !studyTimer.paused;
        if (!studyTimer.paused) studyTimer.startTime = Date.now() - studyTimer.sessionSeconds * 1000;
        renderTimerDisplay();
      });
    }

    studyTimer.tickInterval = setInterval(() => {
      if (!studyTimer.paused) {
        studyTimer.sessionSeconds++;
        renderTimerDisplay();
      }
    }, 1000);

    studyTimer.pingInterval = setInterval(() => {
      if (studyTimer.paused) return;
      const pendingWords = studyTimer.sessionWords - studyTimer.lastPingWords;
      studyTimer.lastPingWords = studyTimer.sessionWords;
      sendStudyPing(30, pendingWords);
    }, 30000);

    document.addEventListener('visibilitychange', onStudyVisibilityChange);
    window.addEventListener('beforeunload', saveLastSession);
  }

  function sendStudyPing(secs, words) {
    if (secs <= 0 && words <= 0) return;
    api('/api/session/ping', {
      method: 'POST',
      body: JSON.stringify({ duration_seconds: secs, words_learned: words }),
    }).catch(() => {});
  }

  function saveLastSession() {
    try {
      localStorage.setItem('lastSession', JSON.stringify({
        duration_seconds: studyTimer.sessionSeconds,
        words_learned: studyTimer.sessionWords,
        date: new Date().toISOString().slice(0, 10),
        ts: Date.now(),
      }));
    } catch {}
  }

  function onStudyVisibilityChange() {
    if (document.hidden) {
      studyTimer.paused = true;
      // Kalan süreyi gönder
      const elapsed = Math.floor((Date.now() - studyTimer.startTime) / 1000);
      const remainder = elapsed % 30;
      const pendingWords = studyTimer.sessionWords - studyTimer.lastPingWords;
      studyTimer.lastPingWords = studyTimer.sessionWords;
      if (remainder > 0 || pendingWords > 0) sendStudyPing(remainder, pendingWords);
      saveLastSession();
    } else {
      studyTimer.paused = false;
      studyTimer.startTime = Date.now() - studyTimer.sessionSeconds * 1000;
    }
  }

  function renderTimerDisplay() {
    const el = $('#session-timer');
    if (!el) return;
    const s = studyTimer.sessionSeconds;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = (n) => String(n).padStart(2, '0');
    el.textContent = h > 0 ? `⏱ ${pad(h)}:${pad(m)}:${pad(sec)}` : `⏱ ${pad(m)}:${pad(sec)}`;
    const icon = $('#timer-pause-icon');
    if (icon) icon.textContent = studyTimer.paused ? '▶' : '⏸';
    const btn = $('#timer-toggle');
    if (btn) btn.classList.toggle('timer-paused', studyTimer.paused);
  }

  // ================================================================ STUDY STATS PANEL
  async function renderStudyStatsPanel() {
    const wrap = $('#study-stats-content');
    if (!wrap) return;
    wrap.innerHTML = '<div class="ss-loading">Yükleniyor…</div>';
    let data;
    try {
      data = await api('/api/session/stats');
    } catch {
      wrap.innerHTML = '<div class="ss-error">İstatistikler yüklenemedi.</div>';
      return;
    }

    const todayM   = Math.floor(data.today_seconds / 60);
    const todaySec = data.today_seconds % 60;
    const sesM     = Math.floor(studyTimer.sessionSeconds / 60);
    const sesSec   = studyTimer.sessionSeconds % 60;

    // Son 7 günü doldur (eksik günleri 0 ile tamamla)
    const TR_DAYS = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
    const weekMap = {};
    (data.weekly || []).forEach(r => { weekMap[r.date] = r; });
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const iso  = d.toISOString().slice(0, 10);
      const name = TR_DAYS[d.getDay()];
      const row  = weekMap[iso] || { duration_seconds: 0, words_learned: 0 };
      days.push({ iso, name, secs: row.duration_seconds, words: row.words_learned });
    }
    const maxSecs = Math.max(...days.map(d => d.secs), 1);

    const bars = days.map(d => {
      const pct  = Math.round((d.secs / maxSecs) * 100);
      const mins = Math.floor(d.secs / 60);
      return `
        <div class="ss-bar-row">
          <span class="ss-day">${escapeHtml(d.name)}</span>
          <div class="ss-bar-wrap">
            <div class="ss-bar" style="width:${pct}%"></div>
          </div>
          <span class="ss-bar-label">${mins > 0 ? mins + ' dk' : '—'}</span>
        </div>`;
    }).join('');

    wrap.innerHTML = `
      <h2 class="ss-title">📊 Çalışma İstatistikleri</h2>
      <div class="ss-cards">
        <div class="ss-card">
          <div class="ss-card-label">Bugün</div>
          <div class="ss-card-val">⏱ ${todayM > 0 ? todayM + ' dk ' + todaySec + ' sn' : todaySec + ' sn'}</div>
          <div class="ss-card-sub">📝 ${data.today_words} kelime öğrenildi</div>
        </div>
        <div class="ss-card">
          <div class="ss-card-label">Bu Oturum</div>
          <div class="ss-card-val">⏱ ${sesM > 0 ? sesM + ' dk ' + sesSec + ' sn' : sesSec + ' sn'}</div>
          <div class="ss-card-sub">📝 ${studyTimer.sessionWords} kelime öğrenildi</div>
        </div>
      </div>
      <h3 class="ss-week-title">Son 7 Gün</h3>
      <div class="ss-bars">${bars}</div>`;
  }

  // ================================================================ GRAMMAR
  const grammarState = {
    topics: null,
    activeTopic: null,
    exerciseIdx: 0,
    score: 0,
    answered: false,
  };

  async function loadGrammarTopics() {
    const topicsEl = $('#grammar-topic-cards');
    if (!topicsEl) return;
    $('#grammar-topics-view').hidden = false;
    $('#grammar-topic-view').hidden = true;

    if (grammarState.topics) { renderGrammarTopicCards(); return; }
    topicsEl.innerHTML = '<div class="gr-loading">Yükleniyor…</div>';
    try {
      grammarState.topics = await api('/api/grammar/topics');
      renderGrammarTopicCards();
    } catch {
      topicsEl.innerHTML = '<div class="gr-loading">Yüklenemedi, tekrar deneyin.</div>';
    }
  }

  async function renderGrammarTopicCards() {
    const wrap = $('#grammar-topic-cards');
    wrap.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (const t of grammarState.topics) {
      let prog = { correct: 0, total: t.exerciseCount };
      try { prog = await api(`/api/grammar/progress/${t.id}`); } catch {}
      const pct = prog.total ? Math.round((prog.correct / prog.total) * 100) : 0;
      const card = document.createElement('div');
      card.className = 'gr-topic-card';
      card.innerHTML = `
        <div class="gr-card-top">
          <div class="gr-card-title">${escapeHtml(t.title)}</div>
          <div class="gr-card-sub">${escapeHtml(t.subtitle)}</div>
        </div>
        <div class="gr-card-prog">
          <div class="gr-prog-bar"><div class="gr-prog-fill" style="width:${pct}%"></div></div>
          <span class="gr-prog-txt">${prog.correct}/${prog.total} doğru</span>
        </div>
        <button class="primary gr-start-btn" type="button">Çalış →</button>`;
      card.querySelector('.gr-start-btn').addEventListener('click', () => openGrammarTopic(t.id));
      frag.appendChild(card);
    }
    wrap.appendChild(frag);
  }

  async function openGrammarTopic(id) {
    try {
      const topic = await api(`/api/grammar/topic/${id}`);
      grammarState.activeTopic = topic;
      grammarState.exerciseIdx = 0;
      grammarState.score = 0;
      grammarState.answered = false;
      $('#grammar-topics-view').hidden = true;
      $('#grammar-topic-view').hidden = false;
      renderGrammarExplanation(topic);
      renderGrammarExercise();
    } catch {
      showToast('Konu yüklenemedi.');
    }
  }

  $('#grammar-back-btn').addEventListener('click', () => {
    $('#grammar-topics-view').hidden = false;
    $('#grammar-topic-view').hidden = true;
    grammarState.topics = null; // progress'i yenile
    loadGrammarTopics();
  });

  function renderGrammarExplanation(topic) {
    const wrap = $('#grammar-explanation');
    const exp = topic.explanation || {};
    let html = `<h2 class="gr-topic-title">${escapeHtml(topic.title)}</h2>
      <p class="gr-topic-sub">${escapeHtml(topic.subtitle)}</p>`;
    if (exp.tr) html += `<p class="gr-exp-intro">${escapeHtml(exp.tr)}</p>`;
    for (const sec of (exp.sections || [])) {
      html += `<h3 class="gr-sec-title">${escapeHtml(sec.title)}</h3>`;
      if (sec.tr) html += `<p class="gr-sec-tr">${escapeHtml(sec.tr)}</p>`;
      if (sec.examples) {
        html += '<div class="gr-examples">';
        for (const ex of sec.examples) {
          html += `<div class="gr-example">
            <div class="gr-ex-de">${escapeHtml(ex.de)}</div>
            <div class="gr-ex-tr">${escapeHtml(ex.tr)}</div>
          </div>`;
        }
        html += '</div>';
      }
      if (sec.table) {
        const [headers, ...rows] = sec.table;
        html += '<div class="gr-table-wrap"><table class="gr-table"><thead><tr>';
        for (const h of headers) html += `<th>${escapeHtml(h)}</th>`;
        html += '</tr></thead><tbody>';
        for (const row of rows) {
          html += '<tr>';
          for (const cell of row) html += `<td>${escapeHtml(cell)}</td>`;
          html += '</tr>';
        }
        html += '</tbody></table></div>';
      }
    }
    wrap.innerHTML = html;
  }

  function renderGrammarExercise() {
    const topic = grammarState.activeTopic;
    const exs = topic.exercises || [];
    const wrap = $('#grammar-exercises');
    if (grammarState.exerciseIdx >= exs.length) {
      renderGrammarSummary(); return;
    }
    const ex = exs[grammarState.exerciseIdx];
    grammarState.answered = false;
    const qNum = grammarState.exerciseIdx + 1;
    let html = `<div class="gr-ex-wrap">
      <div class="gr-ex-num">Soru ${qNum} / ${exs.length}</div>
      <div class="gr-ex-q">${escapeHtml(ex.question)}</div>`;
    if (ex.type === 'multiple') {
      html += '<div class="gr-opts">';
      for (const opt of (ex.options || [])) {
        html += `<button class="gr-opt" type="button" data-val="${escapeHtml(opt)}">${escapeHtml(opt)}</button>`;
      }
      html += '</div>';
    } else {
      html += `<div class="gr-fill-row">
        <input id="gr-fill-input" class="gr-fill-input" type="text"
          autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Cevabınız…" />
        <button id="gr-fill-check" class="primary gr-check-btn" type="button">Kontrol</button>
      </div>
      <div class="qw-umlauts gr-umlauts">
        <button class="qw-um" data-ch="ä" type="button">ä</button>
        <button class="qw-um" data-ch="ö" type="button">ö</button>
        <button class="qw-um" data-ch="ü" type="button">ü</button>
        <button class="qw-um" data-ch="ß" type="button">ß</button>
        <button class="qw-um" data-ch="Ä" type="button">Ä</button>
        <button class="qw-um" data-ch="Ö" type="button">Ö</button>
        <button class="qw-um" data-ch="Ü" type="button">Ü</button>
      </div>`;
    }
    html += `<div id="gr-feedback" class="gr-feedback"></div>
      <button id="gr-next-btn" class="primary gr-next-btn" type="button" hidden>Sonraki →</button>
    </div>`;
    wrap.innerHTML = html;

    if (ex.type === 'multiple') {
      wrap.querySelectorAll('.gr-opt').forEach(btn => {
        btn.addEventListener('click', () => checkGrammarAnswer(btn.dataset.val, ex));
      });
    } else {
      const inp = $('#gr-fill-input');
      $('#gr-fill-check').addEventListener('click', () => checkGrammarAnswer(inp.value, ex));
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') checkGrammarAnswer(inp.value, ex); });
      wrap.querySelectorAll('.qw-um').forEach(b => {
        b.addEventListener('mousedown', e => { e.preventDefault(); insertAtCursor(inp, b.dataset.ch); });
      });
      setTimeout(() => { try { inp.focus(); } catch {} }, 30);
    }
    $('#gr-next-btn').addEventListener('click', () => {
      grammarState.exerciseIdx++;
      renderGrammarExercise();
    });
  }

  function checkGrammarAnswer(userVal, ex) {
    if (grammarState.answered) return;
    grammarState.answered = true;
    const answers = ex.answer.split('/').map(a => a.trim().toLowerCase());
    const isCorrect = answers.includes(userVal.trim().toLowerCase());
    if (isCorrect) grammarState.score++;

    // POST progress
    api('/api/grammar/progress', {
      method: 'POST',
      body: JSON.stringify({ topic_id: grammarState.activeTopic.id, exercise_id: ex.id, correct: isCorrect }),
    }).catch(() => {});

    const fb = $('#gr-feedback');
    fb.className = 'gr-feedback ' + (isCorrect ? 'gr-ok' : 'gr-bad');
    fb.innerHTML = (isCorrect ? '✓ Doğru! ' : `✗ Yanlış. Doğrusu: <b>${escapeHtml(ex.answer)}</b><br>`) +
      `<span class="gr-exp">${escapeHtml(ex.explanation || '')}</span>`;

    if (ex.type === 'multiple') {
      const wrap = $('#grammar-exercises');
      wrap.querySelectorAll('.gr-opt').forEach(btn => {
        btn.disabled = true;
        if (btn.dataset.val === ex.answer) btn.classList.add('gr-correct');
        else if (btn.dataset.val === userVal && !isCorrect) btn.classList.add('gr-wrong');
      });
    } else {
      const inp = $('#gr-fill-input');
      if (inp) {
        inp.disabled = true;
        inp.classList.add(isCorrect ? 'correct' : 'wrong');
        $('#gr-fill-check').disabled = true;
      }
    }
    $('#gr-next-btn').hidden = false;
  }

  function renderGrammarSummary() {
    const topic = grammarState.activeTopic;
    const total = (topic.exercises || []).length;
    const score = grammarState.score;
    const pct = total ? Math.round((score / total) * 100) : 0;
    $('#grammar-exercises').innerHTML = `
      <div class="gr-summary">
        <div class="gr-summary-icon">${pct >= 75 ? '🎉' : pct >= 50 ? '👍' : '📚'}</div>
        <h3 class="gr-summary-title">${escapeHtml(topic.title)} tamamlandı!</h3>
        <div class="gr-summary-score">${score} / ${total} doğru (${pct}%)</div>
        <div class="gr-summary-btns">
          <button class="ghost gr-retry-btn" type="button">Tekrar Dene</button>
          <button class="primary gr-done-btn" type="button">Konulara Dön</button>
        </div>
      </div>`;
    document.querySelector('.gr-retry-btn').addEventListener('click', () => openGrammarTopic(topic.id));
    document.querySelector('.gr-done-btn').addEventListener('click', () => {
      $('#grammar-topics-view').hidden = false;
      $('#grammar-topic-view').hidden = true;
      grammarState.topics = null;
      loadGrammarTopics();
    });
  }

})();
