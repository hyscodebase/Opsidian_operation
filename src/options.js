const vaultNameEl = document.getElementById("vaultName");
const folderEl = document.getElementById("folder");
const dailyFolderEl = document.getElementById("dailyFolder");
const indexNotePathEl = document.getElementById("indexNotePath");
const apiBaseUrlEl = document.getElementById("apiBaseUrl");
const apiKeyEl = document.getElementById("apiKey");
const appendDailyLinksEl = document.getElementById("appendDailyLinks");
const updateIndexEl = document.getElementById("updateIndex");
const saveEl = document.getElementById("save");
const testConnectionEl = document.getElementById("testConnection");
const savedEl = document.getElementById("saved");

function setMessage(msg, isError = false) {
  savedEl.style.color = isError ? "#dc2626" : "#16a34a";
  savedEl.textContent = msg;
}

async function load() {
  const settings = await chrome.storage.local.get([
    "vaultName",
    "folder",
    "dailyFolder",
    "indexNotePath",
    "apiBaseUrl",
    "apiKey",
    "appendDailyLinks",
    "updateIndex"
  ]);

  vaultNameEl.value = settings.vaultName ?? "";
  folderEl.value = settings.folder ?? "ChatGPT";
  dailyFolderEl.value = settings.dailyFolder ?? "Daily";
  indexNotePathEl.value = settings.indexNotePath ?? "ChatGPT/_index.md";
  apiBaseUrlEl.value = settings.apiBaseUrl ?? "http://127.0.0.1:27123";
  apiKeyEl.value = settings.apiKey ?? "";
  appendDailyLinksEl.checked = settings.appendDailyLinks ?? true;
  updateIndexEl.checked = settings.updateIndex ?? true;
}

async function save() {
  const vaultName = vaultNameEl.value.trim();
  const apiKey = apiKeyEl.value.trim();

  if (!vaultName || !apiKey) {
    setMessage("Vault 이름과 API Key는 필수입니다.", true);
    return false;
  }

  await chrome.storage.local.set({
    vaultName,
    folder: folderEl.value.trim() || "ChatGPT",
    dailyFolder: dailyFolderEl.value.trim() || "Daily",
    indexNotePath: indexNotePathEl.value.trim() || "ChatGPT/_index.md",
    apiBaseUrl: apiBaseUrlEl.value.trim() || "http://127.0.0.1:27123",
    apiKey,
    appendDailyLinks: appendDailyLinksEl.checked,
    updateIndex: updateIndexEl.checked
  });

  setMessage("저장되었습니다.");
  return true;
}

saveEl.addEventListener("click", async () => {
  await save();
});

testConnectionEl.addEventListener("click", async () => {
  try {
    const ok = await save();
    if (!ok) return;

    setMessage("연결 테스트 중...");
    const result = await chrome.runtime.sendMessage({ type: "opsidian/ping" });

    if (result?.ok && result?.result?.ok) {
      setMessage(`연결 성공 (status ${result.result.status})`);
      return;
    }

    setMessage(`연결 실패: ${result?.error || "status error"}`, true);
  } catch (error) {
    setMessage(`연결 실패: ${String(error?.message || error)}`, true);
  }
});

load();
