"use strict";

/* ---------- Storage ---------- */
const LS_LESSONS = "shadow_lessons_v1";
const LS_PROGRESS = "shadow_progress_v1";

function loadLessons() {
  try { return JSON.parse(localStorage.getItem(LS_LESSONS)) || []; }
  catch (e) { return []; }
}
function saveLessons(lessons) {
  localStorage.setItem(LS_LESSONS, JSON.stringify(lessons));
}
function loadProgress() {
  try { return JSON.parse(localStorage.getItem(LS_PROGRESS)) || { streak: 0, lastDate: null, history: {} }; }
  catch (e) { return { streak: 0, lastDate: null, history: {} }; }
}
function saveProgress(p) {
  localStorage.setItem(LS_PROGRESS, JSON.stringify(p));
}

function todayStr() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function markPracticedToday() {
  const p = loadProgress();
  const today = todayStr();
  p.history[today] = (p.history[today] || 0) + 1;
  if (p.lastDate !== today) {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const yesterday = y.getFullYear() + "-" + String(y.getMonth() + 1).padStart(2, "0") + "-" + String(y.getDate()).padStart(2, "0");
    p.streak = p.lastDate === yesterday ? p.streak + 1 : 1;
    p.lastDate = today;
  }
  saveProgress(p);
  updateStreakUI();
}

function updateStreakUI() {
  const p = loadProgress();
  document.getElementById("streakNum").textContent = p.streak || 0;
}

/* ---------- IndexedDB: recordings ---------- */
let dbPromise = null;
function getDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open("ShadowingDB", 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("recordings", { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}
async function saveRecording(key, blob) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("recordings", "readwrite");
    tx.objectStore("recordings").put({ key, blob, createdAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function getRecording(key) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("recordings", "readonly");
    const req = tx.objectStore("recordings").get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

/* ---------- Utils ---------- */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function parseYouTubeId(input) {
  if (!input) return null;
  input = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;
  const patterns = [
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = input.match(re);
    if (m) return m[1];
  }
  return null;
}

function formatTime(sec) {
  if (sec == null) return "--:--";
  sec = Math.max(0, sec);
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ":" + String(s).padStart(2, "0");
}

function parseScriptText(text) {
  return text.split("\n").map(l => l.trim()).filter(Boolean).map(line => {
    const parts = line.split("|");
    return {
      id: uid(),
      en: parts[0].trim(),
      ko: (parts[1] || "").trim(),
      start: null,
      end: null,
      done: false,
    };
  });
}

function parseVocabText(text) {
  return text.split("\n").map(l => l.trim()).filter(Boolean).map(line => {
    const m = line.match(/^(.+?)\s*[-–:]\s*(.+)$/);
    if (m) return { word: m[1].trim(), meaning: m[2].trim() };
    return { word: line, meaning: "" };
  });
}

function normalizeWords(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[.,!?;:"“”‘’()]/g, "")
    .split(/\s+/)
    .filter(Boolean);
}

/* Longest common subsequence based word diff */
function diffWords(targetText, saidText) {
  const a = normalizeWords(targetText);
  const b = normalizeWords(saidText);
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const tokens = [];
  let i = 0, j = 0, matched = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      tokens.push({ word: a[i], type: "match" });
      matched++; i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      tokens.push({ word: a[i], type: "missing" });
      i++;
    } else {
      tokens.push({ word: b[j], type: "extra" });
      j++;
    }
  }
  while (i < a.length) { tokens.push({ word: a[i], type: "missing" }); i++; }
  while (j < b.length) { tokens.push({ word: b[j], type: "extra" }); j++; }
  const score = a.length ? Math.round((matched / a.length) * 100) : 0;
  return { tokens, score };
}

/* ---------- App state ---------- */
let lessons = loadLessons();
let currentLessonId = null;
let ytPlayer = null;
let ytReady = false;
let playbackWatcher = null;
let playbackRate = 1;

let calibrating = false;
let calibrateIndex = 0;
let calibratePlaying = false;

let activeRecorder = null;
let activeRecognition = null;

/* ---------- YouTube IFrame API ---------- */
function onYouTubeIframeAPIReady() {
  ytReady = true;
  const lesson = getCurrentLesson();
  if (lesson) mountPlayer(lesson.youtubeId);
}
window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;

function mountPlayer(videoId) {
  if (!ytReady) return;
  if (ytPlayer) {
    ytPlayer.loadVideoById(videoId);
    return;
  }
  ytPlayer = new YT.Player("ytPlayer", {
    videoId,
    playerVars: { playsinline: 1, rel: 0, modestbranding: 1, enablejsapi: 1 },
    events: {
      onReady: () => { ytPlayer.setPlaybackRate(playbackRate); },
    },
  });
}

/* ---------- Lessons CRUD ---------- */
function getCurrentLesson() {
  return lessons.find(l => l.id === currentLessonId) || null;
}

function computeLessonProgress(lesson) {
  if (!lesson.sentences.length) return 0;
  const done = lesson.sentences.filter(s => s.done).length;
  return Math.round((done / lesson.sentences.length) * 100);
}

function renderLessonList() {
  const el = document.getElementById("lessonList");
  el.innerHTML = "";
  lessons.forEach(lesson => {
    const item = document.createElement("div");
    item.className = "lesson-item" + (lesson.id === currentLessonId ? " active" : "");
    const pct = computeLessonProgress(lesson);
    item.innerHTML = `
      <div class="t">${escapeHtml(lesson.title)}</div>
      <div class="m">${lesson.sentences.length}문장 ${lesson.level ? "· " + escapeHtml(lesson.level) : ""}</div>
      <div class="progress-bar"><span style="width:${pct}%"></span></div>
    `;
    item.addEventListener("click", () => selectLesson(lesson.id));
    el.appendChild(item);
  });
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str || "";
  return d.innerHTML;
}

function selectLesson(id) {
  currentLessonId = id;
  stopCalibration();
  const lesson = getCurrentLesson();
  document.getElementById("emptyState").classList.toggle("hidden", !!lesson);
  document.getElementById("lessonView").classList.toggle("hidden", !lesson);
  if (!lesson) { renderLessonList(); return; }

  document.getElementById("lessonTitle").textContent = lesson.title;
  document.getElementById("lessonMeta").textContent =
    (lesson.level ? lesson.level + " · " : "") + lesson.sentences.length + "개 문장";

  mountPlayer(lesson.youtubeId);
  renderSentenceList();
  renderVocabList();
  renderLessonList();
}

function openLessonModal(lesson) {
  const backdrop = document.getElementById("lessonModalBackdrop");
  backdrop.classList.remove("hidden");
  document.getElementById("modalTitle").textContent = lesson ? "영상 수정" : "새 영상 추가";
  document.getElementById("inputUrl").value = lesson ? lesson.youtubeId : "";
  document.getElementById("inputTitle").value = lesson ? lesson.title : "";
  document.getElementById("inputLevel").value = lesson ? (lesson.level || "") : "";
  document.getElementById("inputScript").value = lesson
    ? lesson.sentences.map(s => s.ko ? `${s.en} | ${s.ko}` : s.en).join("\n")
    : "";
  document.getElementById("inputVocab").value = lesson
    ? lesson.vocab.map(v => v.meaning ? `${v.word} - ${v.meaning}` : v.word).join("\n")
    : "";
  backdrop.dataset.editingId = lesson ? lesson.id : "";
}

function closeLessonModal() {
  document.getElementById("lessonModalBackdrop").classList.add("hidden");
}

function saveLessonFromModal() {
  const url = document.getElementById("inputUrl").value.trim();
  const title = document.getElementById("inputTitle").value.trim() || "제목 없는 레슨";
  const level = document.getElementById("inputLevel").value.trim();
  const scriptText = document.getElementById("inputScript").value;
  const vocabText = document.getElementById("inputVocab").value;

  const videoId = parseYouTubeId(url);
  if (!videoId) {
    alert("유튜브 링크 또는 영상 ID를 확인해주세요. (예: https://www.youtube.com/shorts/XXXXXXXXXXX)");
    return;
  }
  const editingId = document.getElementById("lessonModalBackdrop").dataset.editingId;
  const newSentences = parseScriptText(scriptText);
  const vocab = parseVocabText(vocabText);

  if (editingId) {
    const lesson = lessons.find(l => l.id === editingId);
    const oldById = {};
    lesson.sentences.forEach(s => { oldById[s.en] = s; });
    lesson.youtubeId = videoId;
    lesson.title = title;
    lesson.level = level;
    lesson.vocab = vocab;
    lesson.sentences = newSentences.map(s => {
      const prev = oldById[s.en];
      return prev ? { ...s, start: prev.start, end: prev.end, done: prev.done } : s;
    });
  } else {
    lessons.push({
      id: uid(),
      youtubeId: videoId,
      title, level,
      sentences: newSentences,
      vocab,
      addedAt: Date.now(),
    });
  }
  saveLessons(lessons);
  closeLessonModal();
  selectLesson(editingId || lessons[lessons.length - 1].id);
}

function deleteLesson() {
  const lesson = getCurrentLesson();
  if (!lesson) return;
  if (!confirm(`"${lesson.title}" 레슨을 삭제할까요?`)) return;
  lessons = lessons.filter(l => l.id !== lesson.id);
  saveLessons(lessons);
  currentLessonId = lessons[0] ? lessons[0].id : null;
  if (currentLessonId) selectLesson(currentLessonId);
  else {
    document.getElementById("emptyState").classList.remove("hidden");
    document.getElementById("lessonView").classList.add("hidden");
    renderLessonList();
  }
}

/* ---------- Sentence rendering & playback ---------- */
function renderSentenceList() {
  const lesson = getCurrentLesson();
  const showKo = document.getElementById("showTranslation").checked;
  const el = document.getElementById("sentenceList");
  el.innerHTML = "";
  lesson.sentences.forEach((s, idx) => {
    const card = document.createElement("div");
    card.className = "sentence-card" + (s.done ? " done" : "");
    card.dataset.sid = s.id;
    const hasTime = s.start != null && s.end != null;
    card.innerHTML = `
      <div class="sentence-top">
        <div>
          <span class="sentence-idx">${idx + 1}</span>
          <span class="sentence-en">${escapeHtml(s.en)}</span>
          ${showKo && s.ko ? `<div class="sentence-ko">${escapeHtml(s.ko)}</div>` : ""}
        </div>
      </div>
      ${hasTime
        ? `<div class="sentence-controls">
            <button class="btn btn-sm play-native">▶ 원어민 발음</button>
            <button class="btn btn-sm loop-native">🔁 3회 반복</button>
            <button class="btn btn-sm rec-btn">🎙 내 발음 녹음</button>
            <button class="btn btn-sm play-mine hidden">▶ 내 녹음 듣기</button>
            <button class="btn btn-sm done-toggle">${s.done ? "완료 취소" : "완료로 표시"}</button>
          </div>`
        : `<div class="no-timestamp-note">⏱ 아직 구간이 설정되지 않았어요. 상단 "구간 설정 모드"에서 시작 지점을 지정해주세요.</div>`
      }
      <div class="analysis-box hidden"></div>
    `;
    el.appendChild(card);

    if (hasTime) {
      card.querySelector(".play-native").addEventListener("click", () => playClip(s.start, s.end, 1));
      card.querySelector(".loop-native").addEventListener("click", () => playClipLoop(s.start, s.end, 3));
      card.querySelector(".rec-btn").addEventListener("click", () => toggleRecording(s, card));
      card.querySelector(".done-toggle").addEventListener("click", () => {
        s.done = !s.done;
        saveLessons(lessons);
        renderSentenceList();
        renderLessonList();
      });
      getRecording(recKey(lesson.id, s.id)).then(rec => {
        if (rec) card.querySelector(".play-mine").classList.remove("hidden");
      });
      card.querySelector(".play-mine").addEventListener("click", async () => {
        const rec = await getRecording(recKey(lesson.id, s.id));
        if (rec) new Audio(URL.createObjectURL(rec.blob)).play();
      });
    }
  });
}

function recKey(lessonId, sentenceId) { return lessonId + "_" + sentenceId; }

function clearPlaybackWatcher() {
  if (playbackWatcher) { clearInterval(playbackWatcher); playbackWatcher = null; }
}

function playClip(start, end, rate) {
  if (!ytPlayer || typeof ytPlayer.seekTo !== "function") return;
  clearPlaybackWatcher();
  ytPlayer.setPlaybackRate(rate || playbackRate);
  ytPlayer.seekTo(start, true);
  ytPlayer.playVideo();
  playbackWatcher = setInterval(() => {
    if (ytPlayer.getCurrentTime() >= end) {
      ytPlayer.pauseVideo();
      clearPlaybackWatcher();
    }
  }, 100);
}

function playClipLoop(start, end, times) {
  let count = 0;
  clearPlaybackWatcher();
  ytPlayer.setPlaybackRate(playbackRate);
  function loopOnce() {
    ytPlayer.seekTo(start, true);
    ytPlayer.playVideo();
    playbackWatcher = setInterval(() => {
      if (ytPlayer.getCurrentTime() >= end) {
        clearPlaybackWatcher();
        count++;
        if (count < times) setTimeout(loopOnce, 400);
        else ytPlayer.pauseVideo();
      }
    }, 100);
  }
  loopOnce();
}

/* ---------- Vocab rendering ---------- */
function renderVocabList() {
  const lesson = getCurrentLesson();
  const el = document.getElementById("vocabList");
  el.innerHTML = "";
  if (!lesson.vocab.length) {
    el.innerHTML = `<div class="hint" style="color:var(--muted); font-size:0.85rem;">등록된 단어가 없어요.</div>`;
    return;
  }
  lesson.vocab.forEach(v => {
    const div = document.createElement("div");
    div.className = "vocab-item";
    div.innerHTML = `<div class="w">${escapeHtml(v.word)}</div>${v.meaning ? `<div class="m">${escapeHtml(v.meaning)}</div>` : ""}`;
    el.appendChild(div);
  });
}

/* ---------- Calibration (탭으로 구간 설정) ---------- */
function toggleCalibration() {
  calibrating = !calibrating;
  document.getElementById("calibratePanel").classList.toggle("hidden", !calibrating);
  document.getElementById("calibrateToggle").classList.toggle("active", calibrating);
  if (!calibrating) stopCalibration();
  else {
    calibrateIndex = 0;
    updateCalibrateLabel();
  }
}

function stopCalibration() {
  calibratePlaying = false;
  document.getElementById("calibrateMarkBtn") && (document.getElementById("calibrateMarkBtn").disabled = true);
}

function updateCalibrateLabel() {
  const lesson = getCurrentLesson();
  const label = document.getElementById("calibrateCurrent");
  if (!lesson) return;
  if (calibrateIndex >= lesson.sentences.length) {
    label.textContent = "모든 문장의 시작 지점을 설정했어요. '완료'를 눌러 마지막 구간을 저장하세요.";
  } else {
    label.textContent = `문장 ${calibrateIndex + 1} 시작 대기 중: "${lesson.sentences[calibrateIndex].en}"`;
  }
}

function startCalibrationPlayback() {
  const lesson = getCurrentLesson();
  if (!lesson || !ytPlayer) return;
  calibrateIndex = 0;
  ytPlayer.setPlaybackRate(playbackRate);
  ytPlayer.seekTo(0, true);
  ytPlayer.playVideo();
  calibratePlaying = true;
  document.getElementById("calibrateMarkBtn").disabled = false;
  document.getElementById("calibrateMarkBtn").textContent = "다음 문장 시작 (Space)";
  updateCalibrateLabel();
}

function markCalibrationPoint() {
  if (!calibratePlaying) return;
  const lesson = getCurrentLesson();
  const t = ytPlayer.getCurrentTime();

  if (calibrateIndex >= lesson.sentences.length) return;

  lesson.sentences[calibrateIndex].start = t;
  if (calibrateIndex > 0) lesson.sentences[calibrateIndex - 1].end = t;
  calibrateIndex++;

  if (calibrateIndex >= lesson.sentences.length) {
    document.getElementById("calibrateMarkBtn").textContent = "완료 (마지막 구간 저장)";
  }
  saveLessons(lessons);
  updateCalibrateLabel();
}

function finishCalibrationIfNeeded() {
  const lesson = getCurrentLesson();
  if (calibrateIndex >= lesson.sentences.length && lesson.sentences.length) {
    const last = lesson.sentences[lesson.sentences.length - 1];
    if (last.end == null) last.end = ytPlayer.getCurrentTime();
    ytPlayer.pauseVideo();
    calibratePlaying = false;
    document.getElementById("calibrateMarkBtn").disabled = true;
    saveLessons(lessons);
    renderSentenceList();
  }
}

function resetCalibration() {
  const lesson = getCurrentLesson();
  if (!lesson) return;
  if (!confirm("이 레슨의 모든 구간(시작/끝 시간) 설정을 초기화할까요?")) return;
  lesson.sentences.forEach(s => { s.start = null; s.end = null; });
  saveLessons(lessons);
  calibrateIndex = 0;
  updateCalibrateLabel();
  renderSentenceList();
}

/* ---------- Recording + pronunciation analysis ---------- */
function toggleRecording(sentence, card) {
  const btn = card.querySelector(".rec-btn");
  if (activeRecorder && activeRecorder.card === card) {
    stopActiveRecording();
    return;
  }
  if (activeRecorder) stopActiveRecording();
  startRecording(sentence, card, btn);
}

async function startRecording(sentence, card, btn) {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    alert("마이크 접근 권한이 필요해요. 브라우저 권한 설정을 확인해주세요.");
    return;
  }
  const chunks = [];
  const recorder = new MediaRecorder(stream);
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
  recorder.onstop = async () => {
    stream.getTracks().forEach(t => t.stop());
    const blob = new Blob(chunks, { type: "audio/webm" });
    const lesson = getCurrentLesson();
    await saveRecording(recKey(lesson.id, sentence.id), blob);
    card.querySelector(".play-mine").classList.remove("hidden");
    btn.textContent = "🎙 내 발음 녹음";
  };
  recorder.start();
  activeRecorder = { recorder, card };
  btn.textContent = "⏹ 녹음 중지";

  runSpeechRecognition(sentence, card);

  // safety auto-stop after 12s so mic isn't left open indefinitely
  activeRecorder.timeout = setTimeout(() => stopActiveRecording(), 12000);
}

function stopActiveRecording() {
  if (!activeRecorder) return;
  clearTimeout(activeRecorder.timeout);
  try { activeRecorder.recorder.stop(); } catch (e) {}
  activeRecorder = null;
  if (activeRecognition) {
    try { activeRecognition.stop(); } catch (e) {}
    activeRecognition = null;
  }
}

function runSpeechRecognition(sentence, card) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const box = card.querySelector(".analysis-box");
  if (!SpeechRecognition) {
    box.classList.remove("hidden");
    box.innerHTML = `<span style="color:var(--muted)">이 브라우저는 발음 인식(Web Speech API)을 지원하지 않아요. Chrome 브라우저 사용을 권장해요.</span>`;
    return;
  }
  const recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onresult = (event) => {
    const said = event.results[0][0].transcript;
    const { tokens, score } = diffWords(sentence.en, said);
    renderAnalysis(box, said, tokens, score);
    if (score >= 80) {
      sentence.done = true;
      saveLessons(lessons);
      markPracticedToday();
      card.classList.add("done");
      const doneBtn = card.querySelector(".done-toggle");
      if (doneBtn) doneBtn.textContent = "완료 취소";
      renderLessonList();
    } else {
      markPracticedToday();
    }
  };
  recognition.onerror = () => {
    box.classList.remove("hidden");
    box.innerHTML = `<span style="color:var(--muted)">음성을 인식하지 못했어요. 마이크와 가까이서 다시 시도해보세요.</span>`;
  };
  activeRecognition = recognition;
  try { recognition.start(); } catch (e) {}
}

function renderAnalysis(box, said, tokens, score) {
  box.classList.remove("hidden");
  const scoreClass = score >= 80 ? "good" : score >= 50 ? "warn" : "bad";
  const wordsHtml = tokens.map(t => `<span class="diff-word ${t.type}">${escapeHtml(t.word)}</span>`).join(" ");
  box.innerHTML = `
    <div>발음 일치도: <span class="analysis-score ${scoreClass}">${score}%</span></div>
    <div style="margin-top:0.35rem;">${wordsHtml}</div>
    <div style="margin-top:0.35rem; color:var(--muted); font-size:0.78rem;">내가 말한 문장(인식 결과): "${escapeHtml(said)}"</div>
  `;
}

/* ---------- Wire up UI ---------- */
document.addEventListener("DOMContentLoaded", () => {
  updateStreakUI();
  renderLessonList();
  if (lessons[0]) selectLesson(lessons[0].id);

  document.getElementById("addLessonBtn").addEventListener("click", () => openLessonModal(null));
  document.getElementById("editLessonBtn").addEventListener("click", () => openLessonModal(getCurrentLesson()));
  document.getElementById("deleteLessonBtn").addEventListener("click", deleteLesson);
  document.getElementById("modalCancel").addEventListener("click", closeLessonModal);
  document.getElementById("modalSave").addEventListener("click", saveLessonFromModal);

  document.getElementById("showTranslation").addEventListener("change", renderSentenceList);

  document.getElementById("rateButtons").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-rate]");
    if (!btn) return;
    playbackRate = parseFloat(btn.dataset.rate);
    document.querySelectorAll("#rateButtons button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    if (ytPlayer && ytPlayer.setPlaybackRate) ytPlayer.setPlaybackRate(playbackRate);
  });

  document.getElementById("calibrateToggle").addEventListener("click", toggleCalibration);
  document.getElementById("calibratePlayBtn").addEventListener("click", startCalibrationPlayback);
  document.getElementById("calibrateResetBtn").addEventListener("click", resetCalibration);
  document.getElementById("calibrateMarkBtn").addEventListener("click", () => {
    markCalibrationPoint();
    finishCalibrationIfNeeded();
  });

  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" && calibrating && calibratePlaying && document.activeElement.tagName !== "TEXTAREA" && document.activeElement.tagName !== "INPUT") {
      e.preventDefault();
      markCalibrationPoint();
      finishCalibrationIfNeeded();
    }
  });
});
