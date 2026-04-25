const toggleButton = document.getElementById("toggle");
const syncNowButton = document.getElementById("syncNow");
const pingButton = document.getElementById("ping");
const statusEl = document.getElementById("status");
const openOptions = document.getElementById("openOptions");

function setStatus(message) {
  statusEl.textContent = message;
}

async function refresh() {
  const { enabled = false, lastSyncAt = null, lastSyncedFile = "" } = await chrome.storage.local.get([
    "enabled",
    "lastSyncAt",
    "lastSyncedFile"
  ]);

  toggleButton.classList.toggle("on", enabled);
  toggleButton.classList.toggle("off", !enabled);
  toggleButton.textContent = enabled ? "동기화 ON" : "동기화 OFF";

  if (!lastSyncAt) {
    setStatus(enabled ? "동기화 준비됨" : "대기 중");
    return;
  }

  const time = new Date(lastSyncAt).toLocaleString();
  const fileInfo = lastSyncedFile ? `\n파일: ${lastSyncedFile}` : "";
  setStatus(`마지막 동기화: ${time}${fileInfo}`);
}

async function getActiveChatTabId() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.id || !tab.url) return null;

  if (!tab.url.includes("chatgpt.com") && !tab.url.includes("chat.openai.com")) {
    return null;
  }

  return tab.id;
}

toggleButton.addEventListener("click", async () => {
  const { enabled = false } = await chrome.storage.local.get("enabled");
  await chrome.storage.local.set({ enabled: !enabled });

  await chrome.runtime.sendMessage({
    type: "opsidian/toggle",
    enabled: !enabled
  });

  await refresh();
});

syncNowButton.addEventListener("click", async () => {
  try {
    const tabId = await getActiveChatTabId();
    if (!tabId) {
      setStatus("활성 탭이 ChatGPT가 아닙니다.");
      return;
    }

    setStatus("수동 동기화 요청 중...");

    const result = await chrome.tabs.sendMessage(tabId, { type: "opsidian/force-sync" });
    if (!result?.ok) {
      setStatus(`수동 동기화 실패: ${result?.error || "unknown"}`);
      return;
    }

    await refresh();
    setStatus(`${statusEl.textContent}\n(수동 동기화 완료)`);
  } catch (error) {
    setStatus(`수동 동기화 실패: ${String(error?.message || error)}`);
  }
});

pingButton.addEventListener("click", async () => {
  try {
    setStatus("Obsidian 연결 확인 중...");
    const result = await chrome.runtime.sendMessage({ type: "opsidian/ping" });

    if (result?.ok && result?.result?.ok) {
      setStatus(`Obsidian 연결 성공 (status ${result.result.status})`);
      return;
    }

    setStatus(`Obsidian 연결 실패: ${result?.error || "status error"}`);
  } catch (error) {
    setStatus(`Obsidian 연결 실패: ${String(error?.message || error)}`);
  }
});

openOptions.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

refresh();
