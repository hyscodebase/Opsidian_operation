const STATE_KEY_PREFIX = "opsidian:lastDigest:";
let lastDigestInMemory = "";
let syncTimer = null;

function toSafeSlug(input) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-_]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return String(hash);
}

function getConversationId() {
  const match = location.pathname.match(/\/c\/([a-z0-9-]+)/i);
  if (match?.[1]) {
    return match[1];
  }

  const title = document.title.replace(/\s*-\s*ChatGPT\s*$/i, "").trim() || "conversation";
  return toSafeSlug(title) || "conversation";
}

function getConversationTitle() {
  const h1 = document.querySelector("main h1");
  if (h1?.textContent?.trim()) {
    return h1.textContent.trim();
  }

  return document.title.replace(/\s*-\s*ChatGPT\s*$/i, "").trim() || "Untitled";
}

function extractMessages() {
  const roleNodes = document.querySelectorAll('[data-message-author-role]');
  if (roleNodes.length > 0) {
    return Array.from(roleNodes)
      .map((node) => ({
        role: node.getAttribute("data-message-author-role") || "unknown",
        text: node.innerText?.trim() || ""
      }))
      .filter((msg) => msg.text.length > 0);
  }

  const turnNodes = document.querySelectorAll('article[data-testid^="conversation-turn"]');
  return Array.from(turnNodes)
    .map((node) => {
      const role = node.querySelector('[data-message-author-role]')?.getAttribute("data-message-author-role")
        || (node.textContent?.includes("You said:") ? "user" : "assistant");
      return {
        role,
        text: node.innerText?.trim() || ""
      };
    })
    .filter((msg) => msg.text.length > 0);
}

function buildPayload() {
  const messages = extractMessages();
  if (messages.length === 0) {
    return null;
  }

  return {
    sourceUrl: location.href,
    conversationId: getConversationId(),
    title: getConversationTitle(),
    capturedAt: new Date().toISOString(),
    messages
  };
}

async function maybeSync(force = false) {
  const { enabled = false } = await chrome.storage.local.get("enabled");
  if (!enabled) return;

  const payload = buildPayload();
  if (!payload) return;

  const digest = hashString(JSON.stringify(payload.messages));
  const storageKey = `${STATE_KEY_PREFIX}${payload.conversationId}`;
  const stored = await chrome.storage.local.get(storageKey);

  const lastDigestPersisted = stored[storageKey] || "";
  const alreadySent = digest === lastDigestInMemory || digest === lastDigestPersisted;
  if (!force && alreadySent) return;

  lastDigestInMemory = digest;
  await chrome.storage.local.set({ [storageKey]: digest });

  chrome.runtime.sendMessage({
    type: "opsidian/conversation-upsert",
    payload
  });
}

function scheduleSync() {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    maybeSync(false);
  }, 1200);
}

const observer = new MutationObserver(() => {
  scheduleSync();
});

observer.observe(document.body, { childList: true, subtree: true });
maybeSync(false);
setInterval(() => maybeSync(false), 10000);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "opsidian/force-sync") {
    maybeSync(true)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }

  return false;
});
