import { DEFAULT_PLAN } from "./plan-data.js";

const KEYS = { plan: "hp.plan", history: "hp.history", settings: "hp.settings" };
const MAX_HISTORY = 10;

const $ = (sel) => document.querySelector(sel);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const uid = () => Math.random().toString(36).slice(2, 10);

function load(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}
function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    alert("저장 공간이 부족해요. 오래된 분석 기록을 지워주세요.");
  }
}

function freshPlan() {
  return DEFAULT_PLAN.map((s) => ({
    id: uid(),
    title: s.title,
    icon: s.icon,
    time: s.time,
    tip: s.tip,
    items: s.items.map((text) => ({ id: uid(), text, done: false })),
  }));
}

let plan = load(KEYS.plan, null) || freshPlan();
let history = load(KEYS.history, []);
let settings = load(KEYS.settings, { apiKey: "", model: "claude-opus-5-5" });
const openSteps = new Set();

/* ---------- 탭 ---------- */
document.querySelectorAll(".tabs button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("active", b === btn));
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.id === `tab-${btn.dataset.tab}`));
    window.scrollTo(0, 0);
  });
});

/* ---------- 정리 순서 ---------- */
function savePlan() {
  save(KEYS.plan, plan);
  renderPlan();
}

function renderProgress() {
  const all = plan.flatMap((s) => s.items);
  const done = all.filter((i) => i.done).length;
  const pct = all.length ? Math.round((done / all.length) * 100) : 0;
  $("#progress-fill").style.width = `${pct}%`;
  $("#progress-text").textContent = `${pct}% (${done}/${all.length})`;
}

function renderPlan() {
  const list = $("#plan-list");
  list.innerHTML = plan
    .map((s, idx) => {
      const done = s.items.filter((i) => i.done).length;
      const complete = s.items.length > 0 && done === s.items.length;
      return `
      <li class="step ${complete ? "done" : ""} ${openSteps.has(s.id) ? "open" : ""}" data-id="${s.id}">
        <div class="step-head" data-act="toggle">
          <div class="step-num">${complete ? "✓" : idx + 1}</div>
          <div class="step-title">${esc(s.icon)} ${esc(s.title)}<small>⏱ ${esc(s.time || "-")}</small></div>
          <div class="step-count">${done}/${s.items.length}</div>
        </div>
        <div class="step-body">
          ${s.tip ? `<div class="step-tip">💡 ${esc(s.tip)}</div>` : ""}
          ${s.items
            .map(
              (it) => `
            <label class="item ${it.done ? "checked" : ""}">
              <input type="checkbox" data-act="check" data-item="${it.id}" ${it.done ? "checked" : ""} />
              <span>${esc(it.text)}</span>
              <button class="del" data-act="del-item" data-item="${it.id}" aria-label="항목 삭제">×</button>
            </label>`
            )
            .join("")}
          <div class="step-actions">
            <button data-act="add-item">＋ 항목</button>
            <button data-act="up" ${idx === 0 ? "disabled" : ""}>▲ 위로</button>
            <button data-act="down" ${idx === plan.length - 1 ? "disabled" : ""}>▼ 아래로</button>
            <button data-act="rename">✏️ 이름</button>
            <button data-act="del-step" class="danger-text">🗑 단계 삭제</button>
          </div>
        </div>
      </li>`;
    })
    .join("");
  renderProgress();
}

$("#plan-list").addEventListener("click", (e) => {
  const actEl = e.target.closest("[data-act]");
  if (!actEl) return;
  const stepEl = e.target.closest(".step");
  const idx = plan.findIndex((s) => s.id === stepEl.dataset.id);
  const step = plan[idx];
  const act = actEl.dataset.act;

  if (act === "toggle") {
    openSteps.has(step.id) ? openSteps.delete(step.id) : openSteps.add(step.id);
    return renderPlan();
  }
  if (act === "check") {
    const item = step.items.find((i) => i.id === actEl.dataset.item);
    item.done = actEl.checked;
    return savePlan();
  }
  if (act === "del-item") {
    e.preventDefault();
    step.items = step.items.filter((i) => i.id !== actEl.dataset.item);
    return savePlan();
  }
  if (act === "add-item") {
    const text = prompt("추가할 항목을 입력하세요");
    if (text?.trim()) step.items.push({ id: uid(), text: text.trim(), done: false });
    return savePlan();
  }
  if (act === "up" || act === "down") {
    const to = act === "up" ? idx - 1 : idx + 1;
    [plan[idx], plan[to]] = [plan[to], plan[idx]];
    return savePlan();
  }
  if (act === "rename") {
    const title = prompt("단계 이름", step.title);
    if (title?.trim()) step.title = title.trim();
    return savePlan();
  }
  if (act === "del-step") {
    if (confirm(`'${step.title}' 단계를 삭제할까요?`)) plan.splice(idx, 1);
    return savePlan();
  }
});

$("#add-step").addEventListener("click", () => {
  const title = prompt("새 단계 이름 (예: 베란다)");
  if (!title?.trim()) return;
  const step = { id: uid(), title: title.trim(), icon: "📦", time: "", tip: "", items: [] };
  plan.push(step);
  openSteps.add(step.id);
  savePlan();
});

/* ---------- 사진 분석 ---------- */
let currentImage = null; // { base64, thumb }

function resizeImage(file, maxSide, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("사진을 불러올 수 없어요."));
    img.src = URL.createObjectURL(file);
  });
}

function setStatus(el, msg, isError = false, loading = false) {
  el.hidden = !msg;
  el.classList.toggle("error", isError);
  el.innerHTML = (loading ? '<span class="spinner"></span>' : "") + esc(msg);
}

$("#photo-input").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const full = await resizeImage(file, 1568, 0.85);
    const thumb = await resizeImage(file, 160, 0.7);
    currentImage = { base64: full.split(",")[1], thumb };
    const preview = $("#photo-preview");
    preview.src = full;
    preview.hidden = false;
    $("#upload-label").hidden = true;
    $("#analyze-btn").disabled = false;
    setStatus($("#photo-status"), "");
  } catch (err) {
    setStatus($("#photo-status"), err.message, true);
  }
});

$("#analyze-btn").addEventListener("click", async () => {
  const status = $("#photo-status");
  if (!settings.apiKey) {
    setStatus(status, "먼저 설정 탭에서 Claude API 키를 입력해 주세요.", true);
    return;
  }
  if (!currentImage) return;
  const btn = $("#analyze-btn");
  btn.disabled = true;
  setStatus(status, "사진을 살펴보는 중이에요… (10~40초)", false, true);
  $("#result").innerHTML = "";

  let api;
  try {
    api = await import("./claude.js");
  } catch {
    setStatus(status, "분석 기능을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.", true);
    btn.disabled = false;
    return;
  }

  try {
    const result = await api.analyzePhoto({
      apiKey: settings.apiKey,
      model: settings.model,
      imageBase64: currentImage.base64,
      note: $("#photo-note").value.trim(),
    });
    const entry = { id: uid(), date: new Date().toISOString(), thumb: currentImage.thumb, result };
    history.unshift(entry);
    history = history.slice(0, MAX_HISTORY);
    save(KEYS.history, history);
    setStatus(status, "");
    renderResult(entry);
    renderHistory();
  } catch (err) {
    setStatus(status, api.describeError(err), true);
  } finally {
    btn.disabled = false;
  }
});

const listHtml = (arr, tag = "ul") =>
  arr?.length ? `<${tag}>${arr.map((x) => `<li>${esc(x)}</li>`).join("")}</${tag}>` : "<p class='hint'>없음</p>";

function renderResult(entry) {
  const r = entry.result;
  const added = plan.some((s) => s.fromAnalysis === entry.id);
  $("#result").innerHTML = `
    <div class="card result">
      <div><span class="tag">${esc(r.space)}</span><span class="tag">⏱ ${esc(r.time)}</span></div>
      <h3>🔍 지금 상태</h3><p>${esc(r.summary)}</p>
      <h3>📋 이 순서로 정리하세요</h3>${listHtml(r.steps, "ol")}
      <h3>🗑 비울 후보</h3>${listHtml(r.declutter)}
      <h3>📦 수납 아이디어</h3>${listHtml(r.storage)}
      <h3>✨ 유지 팁</h3><p>${esc(r.keep_tip)}</p>
      <button id="add-to-plan" class="btn wide" ${added ? "disabled" : ""}>${added ? "계획에 추가됨 ✓" : "＋ 내 정리 순서에 추가"}</button>
    </div>`;
  $("#add-to-plan").addEventListener("click", () => {
    plan.push({
      id: uid(),
      fromAnalysis: entry.id,
      title: `${r.space} (사진 분석)`,
      icon: "📷",
      time: r.time,
      tip: r.keep_tip,
      items: r.steps.map((text) => ({ id: uid(), text, done: false })),
    });
    savePlan();
    renderResult(entry);
  });
  $("#result").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderHistory() {
  const el = $("#history");
  if (!history.length) {
    el.innerHTML = '<p class="empty">아직 분석 기록이 없어요.</p>';
    return;
  }
  el.innerHTML = history
    .map(
      (h) => `
      <div class="history-item" data-id="${h.id}">
        <img src="${h.thumb}" alt="" />
        <div><b>${esc(h.result.space)}</b>${new Date(h.date).toLocaleString("ko-KR")}</div>
      </div>`
    )
    .join("");
}

$("#history").addEventListener("click", (e) => {
  const item = e.target.closest(".history-item");
  if (!item) return;
  const entry = history.find((h) => h.id === item.dataset.id);
  if (entry) renderResult(entry);
});

/* ---------- 설정 ---------- */
$("#api-key").value = settings.apiKey;
$("#model").value = settings.model;

$("#save-settings").addEventListener("click", () => {
  settings = { apiKey: $("#api-key").value.trim(), model: $("#model").value };
  save(KEYS.settings, settings);
  setStatus($("#settings-status"), "저장했어요 ✓");
});

$("#export-data").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify({ plan, history }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `집정리계획-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

$("#reset-plan").addEventListener("click", () => {
  if (!confirm("정리 순서와 체크 기록을 기본값으로 되돌릴까요?")) return;
  plan = freshPlan();
  openSteps.clear();
  savePlan();
});

/* ---------- 시작 ---------- */
if (!load(KEYS.plan, null)) save(KEYS.plan, plan);
openSteps.add(plan.find((s) => s.items.some((i) => !i.done))?.id);
renderPlan();
renderHistory();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
