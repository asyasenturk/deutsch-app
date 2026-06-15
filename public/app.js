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
    lastLevel: 'a1',
    lastGroup: null,          // null = tüm gruplar
    lastIdx: 0,
    lastMode: 'cards',        // cards | quiz | artikel | stats
    hideKnown: false,
    quizDir: 'de-tr',
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
    const allowedModes = new Set(['cards', 'quiz', 'artikel', 'stats']);
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
    $('#artikel-mode').hidden = mode !== 'artikel';
    $('#stats-mode').hidden = mode !== 'stats';

    // Bazı modlarda filtre/progress/daily bar'ı gizle
    const showFilters = mode === 'cards';
    $('#filters').hidden = !showFilters;
    $('#progress-wrap').hidden = mode === 'stats' || mode === 'artikel';
    $('#daily-bar').hidden = mode === 'stats';

    app.state.lastMode = mode;
    if (persist) persistState();
    if (mode === 'quiz') startQuiz();
    if (mode === 'artikel') startArtikelQuiz();
    if (mode === 'stats') renderStats();
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
    if (!w) {
      cardGroup.textContent = '';
      cardWord.textContent = 'Bu filtreyle gösterilecek kelime kalmadı 🎉';
      cardTr.textContent = '';
      cardEx.innerHTML = '';
      $('#card-counter').textContent = '0 / 0';
      return;
    }
    cardGroup.textContent = w.group || '';
    cardWord.innerHTML = renderWord(w.de);
    cardTr.textContent = w.tr;
    const exTr = w.ex_tr ? `<div class="card-ex-tr">${escapeHtml(w.ex_tr)}</div>` : '';
    cardEx.innerHTML = (w.ex ? escapeHtml(w.ex) : '') + exTr;
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
    const wasKnown = !!app.state.known[k];
    if (isKnown) {
      app.state.known[k] = true;
      if (!wasKnown) registerStudyAction();
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

    // Soru: DE→TR ise Almanca'yı artikel renkli göster; TR→DE ise düz yaz
    if (dir === 'de-tr') $('#quiz-question').innerHTML = renderWord(qText);
    else $('#quiz-question').textContent = qText;

    const wrap = $('#quiz-options');
    wrap.innerHTML = '';
    options.forEach((w) => {
      const b = document.createElement('button');
      b.className = 'quiz-opt';
      const lbl = labelOf(w);
      // TR→DE seçenekleri Almanca, onları renkli yap
      if (dir === 'tr-de') b.innerHTML = renderWord(lbl);
      else b.textContent = lbl;
      b.dataset.value = lbl;
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
      const correctLbl = dir === 'de-tr' ? correct.tr : correct.de;
      $$('#quiz-options .quiz-opt').forEach(b => {
        if (b.dataset.value === correctLbl) b.classList.add('correct');
      });
      $('#quiz-feedback').textContent = `Doğru cevap: ${correctLbl}`;
    }
    updateQuizStats();
    $('#quiz-next').hidden = false;
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
})();
