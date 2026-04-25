const DEFAULTS = {
  enabled: false,
  folder: "ChatGPT",
  apiBaseUrl: "http://127.0.0.1:27123",
  dailyFolder: "Daily",
  indexNotePath: "ChatGPT/_index.md",
  appendDailyLinks: true,
  updateIndex: true
};

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(Object.keys(DEFAULTS));
  await chrome.storage.local.set({ ...DEFAULTS, ...current });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "opsidian/toggle") {
    sendResponse({ ok: true });
    return;
  }

  if (message?.type === "opsidian/ping") {
    pingObsidian()
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }

  if (message?.type === "opsidian/manual-sync") {
    requestForceSyncFromTab(sender)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }

  if (message?.type === "opsidian/conversation-upsert") {
    upsertConversation(message.payload)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        console.error("[Opsidian] sync error", error);
        sendResponse({ ok: false, error: String(error?.message || error) });
      });
    return true;
  }

  return false;
});

async function requestForceSyncFromTab(sender) {
  const tabId = sender?.tab?.id;
  if (!tabId) {
    throw new Error("활성 ChatGPT 탭에서만 수동 동기화가 가능합니다.");
  }

  await chrome.tabs.sendMessage(tabId, { type: "opsidian/force-sync" });
}

async function getSettings() {
  return chrome.storage.local.get([
    "vaultName",
    "folder",
    "apiBaseUrl",
    "apiKey",
    "enabled",
    "dailyFolder",
    "indexNotePath",
    "appendDailyLinks",
    "updateIndex"
  ]);
}

function buildMarkdown(payload) {
  const { title, sourceUrl, capturedAt, messages } = payload;
  const lines = [];

  lines.push("---");
  lines.push(`title: ${escapeYaml(title)}`);
  lines.push(`source: ${escapeYaml(sourceUrl)}`);
  lines.push(`updatedAt: ${capturedAt}`);
  lines.push("tags: [chatgpt, opsidian]");
  lines.push("---");
  lines.push("");
  lines.push(`# ${title}`);
  lines.push("");

  for (const msg of messages) {
    const speaker = msg.role === "user" ? "사용자" : msg.role === "assistant" ? "어시스턴트" : msg.role;
    lines.push(`## ${speaker}`);
    lines.push("");
    lines.push(msg.text);
    lines.push("");
  }

  return lines.join("\n");
}

function escapeYaml(value) {
  return JSON.stringify(String(value ?? ""));
}

function normalizePath(path) {
  return path
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("/");
}

async function upsertConversation(payload) {
  const settings = await getSettings();
  if (!settings.enabled) return;

  if (!settings.vaultName || !settings.apiKey) {
    throw new Error("옵션 페이지에서 vaultName/apiKey를 입력하세요.");
  }

  const day = payload.capturedAt.slice(0, 10);
  const safeTitle = payload.title
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);

  const baseFolder = normalizePath(settings.folder || "ChatGPT");
  const filePath = normalizePath(`${baseFolder}/${day}-${safeTitle || payload.conversationId}.md`);
  const markdown = buildMarkdown(payload);

  await putMarkdown(settings, filePath, markdown);

  if (settings.updateIndex && settings.indexNotePath) {
    const linkLine = `- [[${filePath.replace(/\.md$/i, "")}]]`;
    await appendUniqueLine(settings, normalizePath(settings.indexNotePath), [
      "# ChatGPT Index",
      "",
      linkLine
    ], linkLine);
  }

  if (settings.appendDailyLinks && settings.dailyFolder) {
    const dailyPath = normalizePath(`${settings.dailyFolder}/${day}.md`);
    const linkLine = `- [[${filePath.replace(/\.md$/i, "")}]]`;
    await appendUniqueLine(settings, dailyPath, [`# ${day}`, "", linkLine], linkLine);
  }

  await chrome.storage.local.set({
    lastSyncAt: new Date().toISOString(),
    lastSyncedFile: filePath
  });
}

async function pingObsidian() {
  const settings = await getSettings();
  if (!settings.vaultName || !settings.apiKey) {
    throw new Error("vaultName/apiKey가 비어 있습니다.");
  }

  const response = await request(settings, "GET", "");
  return {
    status: response.status,
    ok: response.ok
  };
}

async function appendUniqueLine(settings, filePath, initialLines, lineToEnsure) {
  const existing = await getMarkdown(settings, filePath);
  if (existing.ok) {
    const text = await existing.text();
    if (text.includes(lineToEnsure)) {
      return;
    }

    const updated = `${text.trimEnd()}\n${lineToEnsure}\n`;
    await putMarkdown(settings, filePath, updated);
    return;
  }

  if (existing.status === 404) {
    await putMarkdown(settings, filePath, `${initialLines.join("\n")}\n`);
    return;
  }

  const body = await existing.text();
  throw new Error(`노트 읽기 실패 (${existing.status}): ${body.slice(0, 220)}`);
}

async function getMarkdown(settings, filePath) {
  return request(settings, "GET", filePath);
}

async function putMarkdown(settings, filePath, markdown) {
  const response = await request(settings, "PUT", filePath, markdown);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Obsidian API 실패 (${response.status}): ${body.slice(0, 220)}`);
  }
}

async function request(settings, method, filePath, body) {
  const encodedPath = filePath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

  const path = filePath ? `/vault/${encodeURIComponent(settings.vaultName)}/${encodedPath}` : "/";
  const url = new URL(path, settings.apiBaseUrl);

  return fetchWithRetry(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      "api-key": settings.apiKey,
      "Content-Type": "text/markdown"
    },
    body
  });
}

async function fetchWithRetry(url, options, retries = 2) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fetch(url, options);
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
  }

  throw lastError;
}
