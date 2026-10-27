"use strict";

// Zasady egzaminu państwowego (rozporządzenie w sprawie egzaminowania kierowców)
const EXAM = {
  totalTime: 25 * 60,
  passScore: 68,
  basic: { 3: 10, 2: 6, 1: 4 },       // liczba pytań podstawowych o danej wartości punktowej
  specialist: { 3: 6, 2: 4, 1: 2 },   // liczba pytań specjalistycznych o danej wartości punktowej
  basicRead: 20,
  basicAnswer: 15,
  specialistTime: 50,
};

const state = {
  lang: load("lang", "pl"),
  banks: [],
  bank: null,          // { id, name, questions, mediaBase }
  view: "home",
  learn: null,
  exam: null,
};

const $app = document.getElementById("app");
let cleanup = [];      // funkcje sprzątające (timery, nasłuchiwanie klawiatury) bieżącego widoku
let mediaCleanup = []; // zatrzymanie odtwarzanych filmów bieżącego pytania

// ---------- narzędzia ----------

function load(key, def) {
  try { const v = localStorage.getItem("prawko." + key); return v === null ? def : JSON.parse(v); }
  catch { return def; }
}
function save(key, val) { localStorage.setItem("prawko." + key, JSON.stringify(val)); }
function t(key) { return I18N[state.lang][key] ?? I18N.pl[key] ?? key; }
function tr(obj) { return obj ? (obj[state.lang] || obj.pl || Object.values(obj)[0] || "") : ""; }
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function fmtTime(s) { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }
function h(html) { const d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstElementChild; }
function clearMedia() { mediaCleanup.forEach(f => f()); mediaCleanup = []; }
function runCleanup() { clearMedia(); cleanup.forEach(f => f()); cleanup = []; }
function onKey(fn) {
  const handler = e => { if (!/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) fn(e); };
  document.addEventListener("keydown", handler);
  cleanup.push(() => document.removeEventListener("keydown", handler));
}
function answerLabel(q, a) {
  if (!a) return t("noAnswer");
  if (q.type === "yesno") return a === "T" ? t("yes") : t("no");
  return `${a}) ${tr(q.answers[a])}`;
}
function mediaAvailable(q) { return !q.media || !q.media.missing; }

// ---------- dane ----------

async function loadBanks() {
  const res = await fetch("resources/banks.json");
  if (!res.ok) throw new Error(res.status);
  state.banks = (await res.json()).banks;
}

async function selectBank(id) {
  const meta = state.banks.find(b => b.id === id) || state.banks[0];
  const res = await fetch("resources/" + meta.path);
  if (!res.ok) throw new Error(res.status);
  const data = await res.json();
  const dir = meta.path.split("/").slice(0, -1).join("/");
  state.bank = {
    id: meta.id,
    name: data.name || meta.name,
    questions: data.questions,
    mediaBase: `resources/${dir ? dir + "/" : ""}${data.mediaDir || "media"}/`,
  };
  save("bank", meta.id);
}

function progressKey() { return "progress." + state.bank.id; }
function getProgress() { return load(progressKey(), {}); }
function recordAnswer(q, ok) {
  const p = getProgress();
  const e = p[q.id] || { c: 0, w: 0 };
  ok ? e.c++ : e.w++;
  e.last = ok;
  p[q.id] = e;
  save(progressKey(), p);
}

// ---------- multimedia ----------

/**
 * Wstawia media pytania do kontenera.
 * opts.controls  - natywne kontrolki wideo (tryb nauki)
 * opts.startButton - film nie startuje sam; wyświetlany jest przycisk START
 * opts.autoplay  - film startuje od razu
 * opts.onEnded   - wywoływane po zakończeniu filmu (lub od razu, gdy filmu nie da się odtworzyć)
 * Zwraca { start(), isVideo }.
 */
function renderMedia(container, q, opts = {}) {
  container.innerHTML = "";
  const m = q.media;
  const placeholder = (title, detail) => {
    container.innerHTML = `<div class="media-placeholder"><div>${esc(title)}</div>${detail ? `<small>${esc(detail)}</small>` : ""}</div>`;
  };
  if (!m) { placeholder(t("noMedia")); return { start() { opts.onEnded?.(); }, isVideo: false }; }
  const src = state.bank.mediaBase + encodeURIComponent(m.file);
  const missing = () => placeholder(t("mediaMissing"), `${t("mediaMissingHint")} ${m.source || m.file}`);

  if (m.type === "image") {
    if (m.missing) missing();
    else {
      const img = h(`<img class="media-el" alt="">`);
      img.onerror = missing;
      img.src = src;
      container.appendChild(img);
    }
    return { start() {}, isVideo: false };
  }

  // wideo
  let failed = false;
  const finish = () => opts.onEnded?.();
  if (m.missing) {
    missing();
    return { start: finish, isVideo: true };
  }
  const startAt = Number(m.startAt) || 0;
  const video = h(`<video class="media-el" playsinline preload="auto" ${opts.controls ? "controls" : ""}></video>`);
  video.src = src + (startAt ? `#t=${startAt}` : "");
  video.addEventListener("ended", finish);
  video.addEventListener("error", () => { failed = true; missing(); finish(); });
  container.appendChild(video);

  let overlay = null;
  const start = () => {
    if (failed) return finish();
    overlay?.remove();
    overlay = null;
    const go = () => {
      try { video.currentTime = startAt; } catch { /* metadane jeszcze niedostępne */ }
      // gdy przeglądarka blokuje autoodtwarzanie z dźwiękiem - odtwórz bez dźwięku
      video.play().catch(() => { video.muted = true; video.play().catch(() => {}); });
    };
    if (video.readyState >= 1) go(); else video.addEventListener("loadedmetadata", go, { once: true });
  };
  if (opts.startButton) {
    overlay = h(`<div class="media-overlay"><button class="btn btn-start">${t("start")}</button><small>${t("startHint")}</small></div>`);
    overlay.querySelector("button").onclick = () => opts.onStartClick ? opts.onStartClick() : start();
    container.appendChild(overlay);
  } else if (opts.autoplay) {
    start();
  }
  mediaCleanup.push(() => { video.pause(); video.removeAttribute("src"); video.load(); });
  return { start, isVideo: true, video };
}

// ---------- widoki ----------

function render() {
  runCleanup();
  document.documentElement.lang = state.lang;
  document.title = t("appTitle");
  renderHeader();
  if (state.view === "home") renderHome();
  else if (state.view === "learn") renderLearn();
  else if (state.view === "exam") renderExam();
  else if (state.view === "result") renderResult();
}

function renderHeader() {
  const header = document.getElementById("header");
  const inExam = state.view === "exam";
  header.innerHTML = `
    <div class="brand" data-nav="home">🏍️ ${esc(t("appTitle"))}</div>
    <nav>
      ${inExam ? "" : `<button class="link ${state.view === "home" ? "active" : ""}" data-nav="home">${t("home")}</button>
      <button class="link ${state.view === "learn" ? "active" : ""}" data-nav="learn">${t("learn")}</button>
      <button class="link ${state.view === "exam" ? "active" : ""}" data-nav="examIntro">${t("exam")}</button>`}
      <select id="lang" aria-label="${t("language")}">
        ${Object.keys(I18N).map(l => `<option value="${l}" ${l === state.lang ? "selected" : ""}>${{ pl: "🇵🇱 Polski", en: "🇬🇧 English", de: "🇩🇪 Deutsch" }[l]}</option>`).join("")}
      </select>
    </nav>`;
  header.querySelector("#lang").onchange = e => {
    state.lang = e.target.value;
    save("lang", state.lang);
    if (state.view === "exam") { renderHeader(); state.exam.rerender(); }
    else render();
  };
  header.querySelectorAll("[data-nav]").forEach(el => el.onclick = () => {
    if (inExam) return;
    const nav = el.dataset.nav;
    if (nav === "learn") startLearn();
    else { state.view = nav === "examIntro" ? "home" : nav; render(); if (nav === "examIntro") document.getElementById("exam-card")?.scrollIntoView(); }
  });
}

function renderHome() {
  const qs = state.bank.questions;
  const p = getProgress();
  const seen = qs.filter(q => p[q.id]).length;
  const good = qs.filter(q => p[q.id]?.last).length;
  const bad = qs.filter(q => p[q.id] && !p[q.id].last).length;
  const pct = n => (qs.length ? (100 * n / qs.length).toFixed(1) : 0);
  const el = h(`
    <main class="home">
      ${state.banks.length > 1 ? `<label class="bank-select">${t("bank")}:
        <select id="bank">${state.banks.map(b => `<option value="${b.id}" ${b.id === state.bank.id ? "selected" : ""}>${esc(tr(b.name))}</option>`).join("")}</select></label>` : ""}
      <h1>${esc(tr(state.bank.name))} <span class="muted">· ${qs.length} ${t("questions")}</span></h1>
      <div class="cards">
        <section class="card">
          <h2>📘 ${t("learn")}</h2>
          <p>${t("learnDesc")}</p>
          <div class="progress-bar"><div class="good" style="width:${pct(good)}%"></div><div class="bad" style="width:${pct(bad)}%"></div></div>
          <ul class="stats">
            <li><b>${seen}</b> / ${qs.length} ${t("seen")}</li>
            <li class="good-t"><b>${good}</b> ${t("mastered")}</li>
            <li class="bad-t"><b>${bad}</b> ${t("toReview")}</li>
          </ul>
          <div class="row">
            <button class="btn primary" id="go-learn">${t("startLearning")}</button>
            <button class="btn ghost" id="reset">${t("resetProgress")}</button>
          </div>
        </section>
        <section class="card" id="exam-card">
          <h2>📝 ${t("exam")}</h2>
          <p>${t("examDesc")}</p>
          <ul class="rules">
            <li>${t("examIntro")}</li>
            <li>${t("examRulesBasic")}</li>
            <li>${t("examRulesSpec")}</li>
          </ul>
          <label class="check"><input type="checkbox" id="exclude-missing" ${load("excludeMissing", true) ? "checked" : ""}> ${t("excludeMissing")}</label>
          <div class="row"><button class="btn primary" id="go-exam">${t("startExam")}</button></div>
        </section>
      </div>
    </main>`);
  $app.replaceChildren(el);
  el.querySelector("#go-learn").onclick = () => startLearn();
  el.querySelector("#go-exam").onclick = () => startExam();
  el.querySelector("#exclude-missing").onchange = e => save("excludeMissing", e.target.checked);
  el.querySelector("#reset").onclick = () => { if (confirm(t("resetConfirm"))) { save(progressKey(), {}); render(); } };
  el.querySelector("#bank")?.addEventListener("change", async e => { await selectBank(e.target.value); render(); });
}

// ---------- tryb nauki ----------

function startLearn() {
  const f = load("learnFilters", { scope: "all", block: "all", status: "all", order: "seq", search: "" });
  state.learn = { filters: f, list: [], index: 0, answered: null };
  applyFilters(load("learnPos." + state.bank.id, null));
  state.view = "learn";
  render();
}

function applyFilters(keepId) {
  const L = state.learn, f = L.filters, p = getProgress();
  const s = f.search.trim().toLowerCase();
  let list = state.bank.questions.filter(q =>
    (f.scope === "all" || q.scope === f.scope) &&
    (f.block === "all" || q.block === f.block) &&
    (f.status === "all" ||
      (f.status === "new" && !p[q.id]) ||
      (f.status === "wrong" && p[q.id] && !p[q.id].last) ||
      (f.status === "correct" && p[q.id]?.last)) &&
    (!s || q.id === s || tr(q.text).toLowerCase().includes(s) ||
      Object.values(q.answers || {}).some(a => tr(a).toLowerCase().includes(s))));
  list = f.order === "random" ? shuffle(list) : list.sort((a, b) => Number(a.id) - Number(b.id) || a.id.localeCompare(b.id));
  L.list = list;
  const i = keepId ? list.findIndex(q => q.id === keepId) : -1;
  L.index = i >= 0 ? i : 0;
  L.answered = null;
  save("learnFilters", f);
}

function renderLearn() {
  const L = state.learn, f = L.filters;
  const blocks = [...new Set(state.bank.questions.map(q => q.block))].sort((a, b) =>
    a[0].localeCompare(b[0]) || parseInt(a.slice(1)) - parseInt(b.slice(1)));
  const opt = (v, label, cur) => `<option value="${v}" ${v === cur ? "selected" : ""}>${esc(label)}</option>`;
  const el = h(`
    <main class="learn">
      <aside class="filters card">
        <h3>${t("filters")}</h3>
        <label>${t("scope")}<select data-f="scope">${opt("all", t("all"), f.scope)}${opt("basic", t("basic"), f.scope)}${opt("specialist", t("specialist"), f.scope)}</select></label>
        <label>${t("block")}<select data-f="block">${opt("all", t("all"), f.block)}${blocks.map(b => opt(b, b, f.block)).join("")}</select></label>
        <label>${t("status")}<select data-f="status">${opt("all", t("all"), f.status)}${opt("new", t("statusNew"), f.status)}${opt("wrong", t("statusWrong"), f.status)}${opt("correct", t("statusCorrect"), f.status)}</select></label>
        <label>${t("order")}<select data-f="order">${opt("seq", t("orderSeq"), f.order)}${opt("random", t("orderRandom"), f.order)}</select></label>
        <label>${t("search")}<input type="search" data-f="search" value="${esc(f.search)}"></label>
        <p class="muted small">${t("keyboardHint")}</p>
      </aside>
      <section class="learn-main" id="learn-main"></section>
    </main>`);
  $app.replaceChildren(el);
  el.querySelectorAll("[data-f]").forEach(input => {
    const ev = input.tagName === "INPUT" ? "input" : "change";
    input.addEventListener(ev, () => {
      f[input.dataset.f] = input.value;
      applyFilters(null);
      renderLearnQuestion();
    });
  });
  onKey(e => {
    const q = L.list[L.index];
    if (!q) return;
    const k = e.key.toUpperCase();
    if (e.key === "ArrowRight") gotoLearn(1);
    else if (e.key === "ArrowLeft") gotoLearn(-1);
    else if (e.key === " " && L.media?.isVideo) { e.preventDefault(); L.media.start(); }
    else if (q.type === "yesno" && ["T", "Y", "J"].includes(k)) answerLearn("T");
    else if (q.type === "yesno" && k === "N") answerLearn("N");
    else if (q.type === "abc" && ["A", "B", "C"].includes(k)) answerLearn(k);
  });
  renderLearnQuestion();
}

function gotoLearn(d) {
  const L = state.learn;
  const i = L.index + d;
  if (i < 0 || i >= L.list.length) return;
  L.index = i;
  L.answered = null;
  renderLearnQuestion();
}

function answerLearn(a) {
  const L = state.learn, q = L.list[L.index];
  if (L.answered) return;
  L.answered = a;
  recordAnswer(q, a === q.correct);
  renderAnswers();
}

function renderLearnQuestion() {
  const L = state.learn;
  const main = document.getElementById("learn-main");
  const q = L.list[L.index];
  clearMedia();
  if (!q) { main.innerHTML = `<div class="card empty">${t("noResults")}</div>`; return; }
  save("learnPos." + state.bank.id, q.id);
  const p = getProgress()[q.id];
  main.innerHTML = `
    <div class="card question-card">
      <div class="q-meta">
        <span>${t("question")} ${L.index + 1} ${t("of")} ${L.list.length}</span>
        <span class="tag">#${esc(q.id)}</span>
        <span class="tag">${q.scope === "basic" ? t("basic") : t("specialist")}</span>
        <span class="tag">${t("block")} ${esc(q.block)}</span>
        <span class="tag">${t("points")}: ${q.points}</span>
        ${p ? `<span class="tag ${p.last ? "good" : "bad"}">✔ ${p.c} · ✘ ${p.w}</span>` : ""}
      </div>
      <div class="media" id="media"></div>
      <div class="media-tools" id="media-tools"></div>
      <h2 class="q-text">${esc(tr(q.text))}</h2>
      <div class="answers" id="answers"></div>
      <div class="feedback" id="feedback"></div>
      <div class="row nav">
        <button class="btn" id="prev" ${L.index === 0 ? "disabled" : ""}>← ${t("prev")}</button>
        <button class="btn primary" id="next" ${L.index >= L.list.length - 1 ? "disabled" : ""}>${t("next")} →</button>
      </div>
    </div>`;
  L.media = renderMedia(main.querySelector("#media"), q, { controls: true, startButton: true });
  if (L.media.isVideo && mediaAvailable(q)) {
    const tools = main.querySelector("#media-tools");
    tools.innerHTML = `<button class="btn small">▶ ${t("replay")}</button>${q.media.startAt ? `<span class="muted small">start: ${q.media.startAt}${t("sec")}</span>` : ""}`;
    tools.querySelector("button").onclick = () => L.media.start();
  }
  main.querySelector("#prev").onclick = () => gotoLearn(-1);
  main.querySelector("#next").onclick = () => gotoLearn(1);
  renderAnswers();
}

function renderAnswers() {
  const L = state.learn, q = L.list[L.index];
  const box = document.getElementById("answers");
  const opts = q.type === "yesno" ? [["T", t("yes")], ["N", t("no")]] : ["A", "B", "C"].map(k => [k, `${k}) ${tr(q.answers[k])}`]);
  box.className = "answers " + q.type;
  box.innerHTML = opts.map(([k, label]) => {
    let cls = "answer";
    if (L.answered) {
      if (k === q.correct) cls += " correct";
      else if (k === L.answered) cls += " wrong";
    }
    return `<button class="${cls}" data-a="${k}" ${L.answered ? "disabled" : ""}>${esc(label)}</button>`;
  }).join("");
  box.querySelectorAll("button").forEach(b => b.onclick = () => answerLearn(b.dataset.a));
  const fb = document.getElementById("feedback");
  if (!L.answered) fb.innerHTML = "";
  else if (L.answered === q.correct) fb.innerHTML = `<div class="ok">✔ ${t("correct")}</div>`;
  else fb.innerHTML = `<div class="err">✘ ${t("wrong")} <b>${esc(answerLabel(q, q.correct))}</b></div>`;
}

// ---------- egzamin ----------

function pickExamQuestions() {
  const excludeMissing = load("excludeMissing", true);
  const used = new Set();
  const pick = (scope, counts) => {
    const out = [];
    for (const [pts, n] of Object.entries(counts)) {
      let pool = state.bank.questions.filter(q => q.scope === scope && q.points === Number(pts) && !used.has(q.id));
      const avail = pool.filter(mediaAvailable);
      if (excludeMissing && avail.length >= n) pool = avail;
      const chosen = shuffle(pool).slice(0, n);
      chosen.forEach(q => used.add(q.id));
      out.push(...chosen);
    }
    return shuffle(out);
  };
  return [...pick("basic", EXAM.basic), ...pick("specialist", EXAM.specialist)];
}

function startExam() {
  const questions = pickExamQuestions();
  state.exam = {
    questions,
    answers: Array(questions.length).fill(null),
    index: 0,
    endsAt: Date.now() + EXAM.totalTime * 1000,
    rerender: () => {},
  };
  state.view = "exam";
  render();
}

function renderExam() {
  const E = state.exam;
  const nBasic = E.questions.filter(q => q.scope === "basic").length;
  const nSpec = E.questions.length - nBasic;
  let phase, phaseEnd, media, qTimer;

  const el = h(`
    <main class="exam">
      <div class="exam-top">
        <div class="box"><small>${t("points")}</small><b id="x-points"></b></div>
        <div class="box"><small>${t("scopeLabel")}</small><b id="x-scope"></b></div>
        <div class="box"><small>${t("basicCount")}</small><b id="x-basic"></b></div>
        <div class="box"><small>${t("specCount")}</small><b id="x-spec"></b></div>
        <div class="box"><small>${t("timeLeft")}</small><b id="x-time"></b></div>
        <button class="btn danger" id="x-finish">${t("finishExam")}</button>
      </div>
      <div class="exam-body">
        <div class="exam-left">
          <div class="media exam-media" id="x-media"></div>
          <h2 class="q-text" id="x-text"></h2>
          <div class="answers" id="x-answers"></div>
        </div>
        <div class="exam-right card">
          <div id="x-phase-label" class="phase-label"></div>
          <div class="timer"><div id="x-timer-bar"></div></div>
          <div id="x-timer-text" class="timer-text"></div>
          <div id="x-start-box"></div>
          <button class="btn primary big" id="x-next">${t("nextQuestion")}</button>
        </div>
      </div>
    </main>`);
  $app.replaceChildren(el);
  const $ = s => el.querySelector(s);

  const globalTick = setInterval(() => {
    const left = (E.endsAt - Date.now()) / 1000;
    $("#x-time").textContent = fmtTime(left);
    if (left <= 0) finishExam();
  }, 250);
  cleanup.push(() => clearInterval(globalTick));
  $("#x-time").textContent = fmtTime((E.endsAt - Date.now()) / 1000);
  $("#x-finish").onclick = () => { if (confirm(t("finishConfirm"))) finishExam(); };
  $("#x-next").onclick = () => nextQuestion();

  onKey(e => {
    const q = E.questions[E.index];
    if (!q) return;
    const k = e.key.toUpperCase();
    if (e.key === "Enter") { e.preventDefault(); nextQuestion(); }
    else if (e.key === " " && phase === "read") { e.preventDefault(); beginAnswerPhase(); }
    else if (q.type === "yesno" && ["T", "Y", "J"].includes(k)) choose("T");
    else if (q.type === "yesno" && k === "N") choose("N");
    else if (q.type === "abc" && ["A", "B", "C"].includes(k)) choose(k);
  });

  function setPhase(name, seconds) {
    phase = name;
    clearInterval(qTimer);
    const total = seconds;
    phaseEnd = seconds == null ? null : Date.now() + seconds * 1000;
    const label = { read: t("readTime"), answer: t("answerTime"), video: t("videoPlaying"), spec: t("answerTime") }[name];
    $("#x-phase-label").textContent = label;
    const bar = $("#x-timer-bar"), txt = $("#x-timer-text");
    const tick = () => {
      if (phaseEnd == null) { bar.style.width = "100%"; bar.className = "video"; txt.textContent = "▶"; return; }
      const left = (phaseEnd - Date.now()) / 1000;
      bar.style.width = `${Math.max(0, 100 * left / total)}%`;
      bar.className = left < 5 ? "low" : "";
      txt.textContent = `${Math.max(0, Math.ceil(left))} ${t("sec")}`;
      if (left <= 0) {
        clearInterval(qTimer);
        if (phase === "read") beginAnswerPhase(); else nextQuestion();
      }
    };
    tick();
    qTimer = setInterval(tick, 100);
  }
  cleanup.push(() => clearInterval(qTimer));

  function beginAnswerPhase() {
    if (phase !== "read") return;
    $("#x-start-box").innerHTML = "";
    const q = E.questions[E.index];
    if (media.isVideo && mediaAvailable(q)) {
      setPhase("video", null);
      media.start();
    } else {
      setPhase("answer", EXAM.basicAnswer);
    }
  }

  function choose(a) {
    E.answers[E.index] = a;
    renderExamAnswers();
  }

  function renderExamAnswers() {
    const q = E.questions[E.index];
    const box = $("#x-answers");
    const opts = q.type === "yesno" ? [["T", t("yes")], ["N", t("no")]] : ["A", "B", "C"].map(k => [k, `${k}) ${tr(q.answers[k])}`]);
    box.className = "answers " + q.type;
    box.innerHTML = opts.map(([k, label]) =>
      `<button class="answer ${E.answers[E.index] === k ? "selected" : ""}" data-a="${k}">${esc(label)}</button>`).join("");
    box.querySelectorAll("button").forEach(b => b.onclick = () => choose(b.dataset.a));
  }

  function showQuestion() {
    const q = E.questions[E.index];
    clearMedia();
    clearInterval(qTimer);
    const basicIdx = E.questions.slice(0, E.index + 1).filter(x => x.scope === "basic").length;
    const specIdx = E.index + 1 - basicIdx;
    $("#x-points").textContent = q.points;
    $("#x-scope").textContent = q.scope === "basic" ? t("basic").toUpperCase() : t("specialist").toUpperCase();
    $("#x-basic").textContent = q.scope === "basic" ? `${basicIdx} / ${nBasic}` : `${nBasic} / ${nBasic}`;
    $("#x-spec").textContent = q.scope === "specialist" ? `${specIdx} / ${nSpec}` : `0 / ${nSpec}`;
    $("#x-text").textContent = tr(q.text);
    $("#x-start-box").innerHTML = "";

    if (q.scope === "basic") {
      media = renderMedia($("#x-media"), q, {
        startButton: true,
        onStartClick: beginAnswerPhase,
        onEnded: () => { if (phase === "video") setPhase("answer", EXAM.basicAnswer); },
      });
      if (!media.isVideo || !mediaAvailable(q)) {
        const btn = h(`<button class="btn btn-start">${t("start")}</button>`);
        btn.onclick = beginAnswerPhase;
        $("#x-start-box").appendChild(btn);
      }
      setPhase("read", EXAM.basicRead);
    } else {
      media = renderMedia($("#x-media"), q, { autoplay: true });
      setPhase("spec", EXAM.specialistTime);
    }
    renderExamAnswers();
  }

  function nextQuestion() {
    if (state.view !== "exam") return;
    if (E.index >= E.questions.length - 1) return finishExam();
    E.index++;
    showQuestion();
  }

  E.rerender = () => {
    // zmiana języka w trakcie egzaminu: przeładuj tylko teksty
    const q = E.questions[E.index];
    $("#x-text").textContent = tr(q.text);
    renderExamAnswers();
  };

  showQuestion();
}

function finishExam() {
  const E = state.exam;
  if (state.view !== "exam") return;
  E.score = E.questions.reduce((s, q, i) => s + (E.answers[i] === q.correct ? q.points : 0), 0);
  E.maxScore = E.questions.reduce((s, q) => s + q.points, 0);
  E.questions.forEach((q, i) => recordAnswer(q, E.answers[i] === q.correct));
  state.view = "result";
  render();
}

function renderResult() {
  const E = state.exam;
  const passed = E.score >= EXAM.passScore;
  const nCorrect = E.questions.filter((q, i) => E.answers[i] === q.correct).length;
  const el = h(`
    <main class="result">
      <section class="card result-head ${passed ? "pass" : "fail"}">
        <h1>${t("result")}: ${passed ? t("passed") : t("failed")}</h1>
        <div class="score"><b>${E.score}</b> / ${E.maxScore}</div>
        <p>${t("scoreLabel")} · ${t("correctCount")}: ${nCorrect} / ${E.questions.length}</p>
        <div class="row">
          <button class="btn primary" id="again">${t("newExam")}</button>
          <button class="btn" id="home">${t("backHome")}</button>
        </div>
      </section>
      <h2>${t("review")}</h2>
      <div class="review">
        ${E.questions.map((q, i) => {
          const ok = E.answers[i] === q.correct;
          return `<details class="card review-item ${ok ? "ok" : "bad"}" data-i="${i}">
            <summary><span class="num">${i + 1}.</span> <span class="mark">${ok ? "✔" : "✘"}</span>
              <span class="txt">${esc(tr(q.text))}</span><span class="pts">${ok ? q.points : 0}/${q.points}</span></summary>
            <div class="media small-media"></div>
            <p>${t("yourAnswer")}: <b class="${ok ? "good-t" : "bad-t"}">${esc(answerLabel(q, E.answers[i]))}</b></p>
            ${ok ? "" : `<p>${t("correctAnswer")}: <b class="good-t">${esc(answerLabel(q, q.correct))}</b></p>`}
            <p class="muted small">#${esc(q.id)} · ${t("block")} ${esc(q.block)}</p>
          </details>`;
        }).join("")}
      </div>
    </main>`);
  $app.replaceChildren(el);
  el.querySelector("#again").onclick = () => startExam();
  el.querySelector("#home").onclick = () => { state.view = "home"; render(); };
  el.querySelectorAll("details").forEach(d => d.addEventListener("toggle", () => {
    const box = d.querySelector(".media");
    if (d.open && !box.childElementCount) renderMedia(box, E.questions[d.dataset.i], { controls: true, startButton: true });
  }));
}

// ---------- start ----------

(async function init() {
  try {
    await loadBanks();
    await selectBank(load("bank", state.banks[0]?.id));
  } catch (e) {
    renderHeader();
    $app.innerHTML = `<div class="card error">${esc(t("loadError"))}<br><small>${esc(e.message || e)}</small></div>`;
    return;
  }
  render();
})();
