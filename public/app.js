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
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      ...opts,
    });
    let body = null;
    try { body = await res.json(); } catch { /* no-op */ }
    if (!res.ok) {
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
    known: {},          // "level|de"  -> true
    lastLevel: 'a1',
    lastGroup: null,    // null = tüm gruplar
    lastIdx: 0,
    lastMode: 'cards',  // cards | quiz
    hideKnown: false,
    quizDir: 'de-tr',
  });

  const app = {
    username: null,
    state: defaultState(),
    vocabCache: {},     // level -> array
    activeVocab: [],    // filtered & ordered
    activeLevel: 'a1',
    activeGroup: null,
    mode: 'cards',
    cardFlipped: false,
    quiz: { question: null, options: [], correctIdx: -1, score: 0, streak: 0, awaiting: false },
    localCacheKey: 'deutsch.state.cache',
  };

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
    authError.hidden = true;
    authSubmit.disabled = true;
    const username = $('#username').value.trim();
    const password = $('#password').value;
    try {
      const path = authMode === 'login' ? '/api/login' : '/api/register';
      const out = await api(path, { method: 'POST', body: JSON.stringify({ username, password }) });
      app.username = out.username;
      await loadMe(true);
      enterApp();
    } catch (err) {
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

  function logoutLocal() {
    app.username = null;
    app.state = defaultState();
    $('#auth-screen').hidden = false;
    $('#app-screen').hidden = true;
  }

  $('#logout-btn').addEventListener('click', async () => {
    try { await api('/api/logout', { method: 'POST' }); } catch {}
    try { localStorage.removeItem(app.localCacheKey); } catch {}
    logoutLocal();
  });

  // --------------------------------------------------------------- app boot
  async function enterApp() {
    $('#auth-screen').hidden = true;
    $('#app-screen').hidden = false;
    $('#hello').textContent = `Merhaba, ${app.username}`;
    app.mode = app.state.lastMode === 'quiz' ? 'quiz' : 'cards';
    setMode(app.mode, /*persist*/ false);
    $('#hide-known').checked = !!app.state.hideKnown;
    setLevel(app.state.lastLevel || 'a1', /*persist*/ false);
    await ensureVocab(app.activeLevel);
    rebuildActiveVocab(/*resetIdx*/ false);
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
    $('#cards-mode').hidden = mode !== 'cards';
    $('#quiz-mode').hidden = mode !== 'quiz';
    app.state.lastMode = mode;
    if (persist) persistState();
    if (mode === 'quiz') startQuiz();
  }

  // -------------------------------------------------------- group filtering
  function rebuildActiveVocab(resetIdx) {
    const all = app.vocabCache[app.activeLevel] || [];
    const groups = Array.from(new Set(all.map(w => w.group))).filter(Boolean);
    renderGroupChips(groups);

    let filtered = all;
    if (app.activeGroup) filtered = filtered.filter(w => w.group === app.activeGroup);
    if (app.state.hideKnown) filtered = filtered.filter(w => !app.state.known[keyOf(app.activeLevel, w.de)]);

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
      b.addEventListener('click', () => {
        app.activeGroup = value;
        app.state.lastGroup = value;
        rebuildActiveVocab(true);
        persistState();
        render();
      });
      return b;
    };
    wrap.appendChild(mkChip('Tümü', null));
    groups.forEach(g => wrap.appendChild(mkChip(g, g)));
  }

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
    if (!w) {
      cardGroup.textContent = '';
      cardWord.textContent = 'Bu filtreyle gösterilecek kelime kalmadı 🎉';
      cardTr.textContent = '';
      cardEx.textContent = '';
      $('#card-counter').textContent = '0 / 0';
      return;
    }
    cardGroup.textContent = w.group || '';
    cardWord.textContent = w.de;
    cardTr.textContent = w.tr;
    cardEx.textContent = w.ex || '';
    card.classList.toggle('flipped', app.cardFlipped);
    $('#card-counter').textContent = `${app.state.lastIdx + 1} / ${app.activeVocab.length}`;
  }

  function renderProgress() {
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
    const k = keyOf(app.activeLevel, w.de);
    if (isKnown) {
      app.state.known[k] = true;
      animateSwipe('right');
    } else {
      delete app.state.known[k];
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
      render();
    }, 220);
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

  $('#quiz-next').addEventListener('click', nextQuizQuestion);

  function updateQuizStats() {
    $('#quiz-score').textContent = app.quiz.score;
    $('#quiz-streak').textContent = app.quiz.streak;
  }

  function nextQuizQuestion() {
    const pool = (app.vocabCache[app.activeLevel] || []).filter(Boolean);
    if (pool.length < 4) {
      $('#quiz-question').textContent = 'Quiz için en az 4 kelime gerekli.';
      $('#quiz-options').innerHTML = '';
      $('#quiz-feedback').textContent = '';
      $('#quiz-next').hidden = true;
      return;
    }
    const idx = Math.floor(Math.random() * pool.length);
    const correct = pool[idx];
    const distractorSet = new Set([idx]);
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

    $('#quiz-question').textContent = qText;
    const wrap = $('#quiz-options');
    wrap.innerHTML = '';
    options.forEach((w) => {
      const b = document.createElement('button');
      b.className = 'quiz-opt';
      b.textContent = labelOf(w);
      b.addEventListener('click', () => onQuizAnswer(b, w === correct, correct));
      wrap.appendChild(b);
    });
    $('#quiz-feedback').textContent = '';
    $('#quiz-next').hidden = true;
    app.quiz.awaiting = true;
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
      $$('#quiz-options .quiz-opt').forEach(b => {
        if (b.textContent === (dir === 'de-tr' ? correct.tr : correct.de)) b.classList.add('correct');
      });
      $('#quiz-feedback').textContent = `Doğru cevap: ${dir === 'de-tr' ? correct.tr : correct.de}`;
    }
    updateQuizStats();
    $('#quiz-next').hidden = false;
  }

  // --------------------------------------------------------------- bootstrap
  (async function init() {
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem(app.localCacheKey) || 'null'); } catch {}
    if (cached) app.state = { ...defaultState(), ...cached, known: cached.known || {} };

    const ok = await loadMe(true);
    if (ok) enterApp();
  })();
})();
