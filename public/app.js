/* ---- tab switching ---- */
function switchTab(tabName) {
  document.querySelectorAll("#tabs button").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
  const btn = document.querySelector(`#tabs button[data-tab="${tabName}"]`);
  if (btn) btn.classList.add("active");
  const content = document.getElementById("tab-" + tabName);
  if (content) content.classList.add("active");
}

document.querySelectorAll("#tabs button").forEach(btn => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

// Handle tab switch from main process (tray menu, shortcuts)
if (window.checkone?.onSwitchTab) {
  window.checkone.onSwitchTab((tab) => switchTab(tab));
}

/* ---- SSE ---- */
function connectSSE() {
  es = new EventSource("/api/events");
  es.addEventListener("monitor_added", (e) => addMonitorCard(JSON.parse(e.data)));
  es.addEventListener("monitor_update", (e) => updateMonitorCard(JSON.parse(e.data)));
  es.addEventListener("monitor_done", (e) => updateMonitorCard(JSON.parse(e.data)));
  es.addEventListener("screenshot_taken", (e) => console.log("screenshot:", JSON.parse(e.data).path));
  es.addEventListener("hello", () => console.log("[sse] connected"));
  es.onerror = () => { es.close(); setTimeout(connectSSE, 5000); };
}
let es;
connectSSE();

/* ---- dashboard ---- */
function addMonitorCard(data) {
  const el = document.querySelector(".empty-hint");
  if (el) el.remove();
  const card = document.createElement("div");
  card.className = "monitor-card";
  card.id = "monitor-" + data.id;
  card.innerHTML = renderCard(data);
  document.getElementById("monitor-list").appendChild(card);
}

function updateMonitorCard(data) {
  let card = document.getElementById("monitor-" + data.id);
  if (!card) { addMonitorCard(data); return; }
  card.innerHTML = renderCard(data);
}

function renderCard(data) {
  const statusClass = data.status || "running";
  const progress = data.progress || 0;
  return `<div class="card-header">
    <span class="card-status ${statusClass}"></span>
    <span class="card-label">${esc(data.label || data.id)}</span>
  </div>
  ${statusClass === "running" ? `<div class="card-progress"><div class="card-progress-bar" style="width:${progress}%"></div></div>` : ""}
  <div class="card-meta">${statusClass === "done" ? "已完成" : statusClass === "error" ? "出错" : `进度 ${progress}%`}</div>
  ${statusClass === "running" ? `<div class="card-actions"><button data-action="cancel" data-id="${data.id}">取消</button></div>` : ""}`;
}

function esc(str) { const el = document.createElement("span"); el.textContent = str || ""; return el.innerHTML; }

// Event delegation for monitor card buttons (cancel, etc.)
document.getElementById("monitor-list").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;
  const id = btn.dataset.id;
  if (action === "cancel") {
    await fetch(`/api/monitors/${id}`, { method: "DELETE" });
    const card = document.getElementById("monitor-" + id);
    if (card) card.remove();
  }
});

document.getElementById("btn-screenshot-full").addEventListener("click", async () => {
  const btn = document.getElementById("btn-screenshot-full");
  btn.textContent = "截图中…";
  btn.disabled = true;
  try {
    const res = await fetch("/api/screenshot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "full" }) });
    const data = await res.json();
    if (data.ok) btn.textContent = "已保存 ✓";
    else btn.textContent = "截图失败";
  } catch {
    btn.textContent = "截图失败";
  }
  setTimeout(() => { btn.textContent = "截图全屏"; btn.disabled = false; }, 2000);
});

document.getElementById("btn-new-monitor").addEventListener("click", () => {
  const row = document.getElementById("new-monitor-row");
  row.style.display = "flex";
  document.getElementById("nm-input").focus();
});

document.getElementById("nm-cancel").addEventListener("click", () => {
  document.getElementById("new-monitor-row").style.display = "none";
  document.getElementById("nm-input").value = "";
});

document.getElementById("nm-submit").addEventListener("click", async () => {
  const type = document.getElementById("nm-type").value;
  const value = document.getElementById("nm-input").value.trim();
  if (!value) return;
  document.getElementById("new-monitor-row").style.display = "none";
  document.getElementById("nm-input").value = "";
  await fetch("/api/monitors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(type === "web" ? { type: "web", url: value } : { type: "terminal", command: value }),
  });
});

document.getElementById("nm-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("nm-submit").click();
  if (e.key === "Escape") document.getElementById("nm-cancel").click();
});

/* ---- chat ---- */
const chatMessages = document.getElementById("chat-messages");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");

function addChatMsg(role, text) {
  const el = document.createElement("div");
  el.className = "chat-msg " + role;
  el.textContent = text;
  chatMessages.appendChild(el);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  chatInput.value = "";
  chatInput.disabled = true;
  addChatMsg("user", text);

  const thinking = document.createElement("div");
  thinking.className = "chat-msg tool";
  thinking.textContent = "思考中…";
  chatMessages.appendChild(thinking);

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: text }] }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let streamEl = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      // Parse complete SSE frames (separated by \n\n)
      let sep;
      while ((sep = buf.indexOf("\n\n")) >= 0) {
        const frame = buf.slice(0, sep);
        buf = buf.slice(sep + 2);
        let eventType = "";
        let dataStr = "";
        for (const fl of frame.split("\n")) {
          if (fl.startsWith("event:")) eventType = fl.slice(6).trim();
          else if (fl.startsWith("data:")) dataStr = fl.slice(5).trim();
        }
        if (!eventType) continue;
        let data = {};
        try { data = JSON.parse(dataStr); } catch {}
        if (eventType === "delta") {
          if (!streamEl) {
            thinking.remove();
            streamEl = document.createElement("div");
            streamEl.className = "chat-msg asha";
            chatMessages.appendChild(streamEl);
          }
          streamEl.textContent += data.text || "";
          chatMessages.scrollTop = chatMessages.scrollHeight;
        } else if (eventType === "tool_start") {
          thinking.textContent = `调用工具: ${data.name}…`;
        } else if (eventType === "tool_end") {
          thinking.textContent = `工具 ${data.name} 完成 (${data.durationMs}ms)`;
        } else if (eventType === "message") {
          thinking.remove();
          if (!streamEl) addChatMsg("asha", data.text || "");
        } else if (eventType === "error") {
          thinking.remove();
          addChatMsg("asha", "抱歉，出了点问题：" + (data.message || "未知错误"));
        }
      }
    }
  } catch (err) {
    thinking.remove();
    addChatMsg("asha", "抱歉，请求失败：" + (err.message || "网络错误"));
  } finally {
    chatInput.disabled = false;
    chatInput.focus();
  }
});

/* ---- config ---- */
const LLM_PRESETS = {
  custom: { baseUrl: "", model: "" },
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  deepseek: { baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  dashscope: { baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-turbo" },
  glm: { baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-flash" },
  moonshot: { baseUrl: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k" },
  volcengine: { baseUrl: "https://ark.cn-beijing.volces.com/api/v3", model: "doubao-pro-32k" },
  ollama: { baseUrl: "http://localhost:11434/v1", model: "llama3.2" },
};

async function loadConfig() {
  const res = await fetch("/api/status");
  const data = await res.json();
  const s = data.settings || {};
  document.getElementById("cfg-baseUrl").value = s.llm?.baseUrl || "";
  document.getElementById("cfg-apiKey").value = s.llm?.apiKey || "";
  document.getElementById("cfg-model").value = s.llm?.model || "";
  document.getElementById("cfg-ss-interval").value = s.screenshotIntervalSec ?? 5;
  document.getElementById("cfg-poll-interval").value = s.terminalPollIntervalSec ?? 2;
  document.getElementById("cfg-cleanup-days").value = s.autoCleanupDays ?? 7;
  document.getElementById("cfg-notify-done").checked = s.notifyOnDone !== false;
  document.getElementById("cfg-notify-error").checked = s.notifyOnError !== false;
  document.getElementById("llm-warning").style.display = data.llmConfigured ? "none" : "flex";
}
loadConfig();

document.getElementById("cfg-preset").addEventListener("change", (e) => {
  const preset = LLM_PRESETS[e.target.value];
  if (!preset) return;
  if (preset.baseUrl) document.getElementById("cfg-baseUrl").value = preset.baseUrl;
  if (preset.model) document.getElementById("cfg-model").value = preset.model;
});

document.getElementById("btn-llm-test").addEventListener("click", async () => {
  const result = document.getElementById("llm-test-result");
  const btn = document.getElementById("btn-llm-test");
  result.textContent = "测试中…";
  result.className = "test-result";
  btn.disabled = true;
  try {
    // 1. Save settings first so server has latest config
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        llm: {
          baseUrl: document.getElementById("cfg-baseUrl").value,
          apiKey: document.getElementById("cfg-apiKey").value,
          model: document.getElementById("cfg-model").value,
        },
      }),
    });
    // 2. Actually test the LLM connection
    const res = await fetch("/api/llm/test", { method: "POST" });
    const data = await res.json();
    if (data.ok) {
      result.textContent = "✓ " + data.message;
      result.className = "test-result ok";
      document.getElementById("llm-warning").style.display = "none";
    } else {
      result.textContent = "✗ " + (data.error || "连接失败");
      result.className = "test-result err";
    }
  } catch (err) {
    result.textContent = "✗ " + (err.message || "网络错误");
    result.className = "test-result err";
  } finally {
    btn.disabled = false;
  }
});

function miniToast(text) {
  const el = document.createElement("div");
  el.className = "mini-toast";
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 300); }, 1500);
}

document.getElementById("btn-save-all").addEventListener("click", async () => {
  const body = {
    llm: {
      baseUrl: document.getElementById("cfg-baseUrl").value,
      apiKey: document.getElementById("cfg-apiKey").value,
      model: document.getElementById("cfg-model").value,
    },
    screenshotIntervalSec: Number(document.getElementById("cfg-ss-interval").value),
    terminalPollIntervalSec: Number(document.getElementById("cfg-poll-interval").value),
    autoCleanupDays: Number(document.getElementById("cfg-cleanup-days").value),
    notifyOnDone: document.getElementById("cfg-notify-done").checked,
    notifyOnError: document.getElementById("cfg-notify-error").checked,
  };
  const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (data.ok) {
    miniToast("设置已保存");
    document.getElementById("llm-warning").style.display = "flex";
    if (body.llm.baseUrl && body.llm.apiKey) document.getElementById("llm-warning").style.display = "none";
  } else {
    miniToast("保存失败: " + (data.error || ""));
  }
});