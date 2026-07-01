// ==UserScript==
// @name         ChatGPT 模型标记
// @namespace    local.codex.chatgpt-model-badge.force-visible
// @version      1.9.0
// @description  自动记录 ChatGPT 回复使用的模型，并显示在切换模型/重试按钮同一行右侧。
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @run-at       document-start
// @grant        unsafeWindow
// ==/UserScript==

(function () {
  'use strict';

  const CONFIG = {
    fallbackText: '',
    onlyLatestAssistant: false,
    scanDelayMs: 120,
  };

  const SCRIPT_VERSION = '1.9.0';
  const STYLE_ID = 'cgpt-local-model-badge-style';
  const BADGE_ATTR = 'data-cgpt-local-model-badge';
  const TOOLBAR_ATTR = 'data-cgpt-local-model-badge-toolbar';
  const TURN_TEXT_ATTR = 'data-cgpt-local-model-badge-text';
  const TURN_SOURCE_ATTR = 'data-cgpt-local-model-badge-source';
  const TURN_MESSAGE_ID_ATTR = 'data-cgpt-local-model-badge-message-id';
  const STYLE_TEXT = `
    [${TOOLBAR_ATTR}="true"] {
      position: relative !important;
      overflow: visible !important;
    }

    [${BADGE_ATTR}="true"] {
      display: inline-flex !important;
      flex: 0 0 auto !important;
      align-items: center !important;
      min-height: 18px !important;
      margin-top: 0 !important;
      margin-left: 8px !important;
      box-sizing: border-box !important;
      width: auto !important;
      max-width: min(260px, 40vw) !important;
      padding-left: 0 !important;
      overflow: hidden !important;
      color: var(--text-secondary, #9b9b9b) !important;
      font-size: 14px !important;
      line-height: 18px !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
      opacity: 0.98 !important;
      position: static !important;
      z-index: auto !important;
      pointer-events: none !important;
      user-select: none !important;
    }
  `;
  const ANCHOR_LABEL_PARTS = [
    '切换模型',
    '模型',
    '重试',
    '重新生成',
    'retry',
    'regenerate',
    'try again',
    'switch model',
    'model',
  ];

  let scanTimer = 0;
  const usageTextByMessageId = new Map();
  let observerStarted = false;

  console.info(`[ChatGPT 模型标记] 已运行 v${SCRIPT_VERSION}`);
  hookFetch();

  function hookFetch() {
    try {
      const targetWindow = getPageWindow();
      const originalFetch = targetWindow.fetch;
      if (!originalFetch || originalFetch.__cgptLocalModelBadgeHooked) return;

      targetWindow.fetch = async function cgptLocalModelBadgeFetch(...args) {
        const response = await originalFetch.apply(this, args);
        inspectFetchResponse(args[0], response);
        return response;
      };

      try {
        targetWindow.fetch.__cgptLocalModelBadgeHooked = true;
      } catch (_) {}
    } catch (_) {}
  }

  function getPageWindow() {
    try {
      if (typeof unsafeWindow !== 'undefined' && unsafeWindow?.fetch) return unsafeWindow;
    } catch (_) {}
    return window;
  }

  function inspectFetchResponse(input, response) {
    const url = getFetchUrl(input);
    if (!url || !/\/backend-api\/(?:f\/)?conversation\b|\/backend-api\/conversation\//.test(url)) return;
    if (!response || !response.ok) return;

    response.clone().text()
      .then((text) => {
        const usageEntries = extractUsageEntriesFromResponseText(text);
        let changed = false;

        for (const entry of usageEntries) {
          if (!entry.messageId || !entry.usageText) continue;
          usageTextByMessageId.set(entry.messageId, entry.usageText);
          changed = true;
        }

        if (changed) {
          scheduleScan();
        }
      })
      .catch(() => {});
  }

  function getFetchUrl(input) {
    if (typeof input === 'string') return input;
    if (input && typeof input.url === 'string') return input.url;
    return '';
  }

  function extractUsageEntriesFromResponseText(text) {
    const messages = [];

    for (const payload of parseJsonPayloads(text)) {
      collectAssistantMessages(payload, messages);
    }

    return dedupeMessages(messages)
      .map((message) => ({
        messageId: normalizeText(message?.id),
        usageText: getUsageTextFromMessage(message),
      }));
  }

  function dedupeMessages(messages) {
    const byId = new Map();
    const anonymous = [];

    for (const message of messages) {
      if (message?.id) {
        byId.set(message.id, message);
      } else {
        anonymous.push(message);
      }
    }

    return Array.from(byId.values())
      .concat(anonymous)
      .sort((a, b) => Number(a?.create_time || 0) - Number(b?.create_time || 0));
  }

  function parseJsonPayloads(text) {
    const trimmed = String(text || '').trim();
    const payloads = [];

    if (!trimmed) return payloads;

    if (trimmed[0] === '{' || trimmed[0] === '[') {
      try {
        payloads.push(JSON.parse(trimmed));
        return payloads;
      } catch (_) {}
    }

    for (const line of trimmed.split(/\r?\n/)) {
      const data = line.startsWith('data:') ? line.slice(5).trim() : '';
      if (!data || data === '[DONE]') continue;

      try {
        payloads.push(JSON.parse(data));
      } catch (_) {}
    }

    return payloads;
  }

  function collectAssistantMessages(value, out, seen = new WeakSet()) {
    if (!value || typeof value !== 'object') return;
    if (seen.has(value)) return;
    seen.add(value);

    if (value.author?.role === 'assistant') {
      out.push(value);
      return;
    }

    if (value.message?.author?.role === 'assistant') {
      out.push(value.message);
    }

    if (Array.isArray(value)) {
      for (const item of value) collectAssistantMessages(item, out, seen);
      return;
    }

    for (const key of Object.keys(value)) {
      if (key === 'metadata' || key === 'content') continue;
      collectAssistantMessages(value[key], out, seen);
    }
  }

  function getUsageTextFromMessage(message) {
    const metadata = message?.metadata || {};
    const rawModel = metadata.model_slug || '';

    return getUsageTextFromModelSlug(rawModel);
  }

  function getUsageTextFromModelSlug(rawModel) {
    const modelName = formatModelName(rawModel);
    return modelName;
  }

  function formatModelName(value) {
    const raw = normalizeText(value);
    if (!raw) return '';

    if (/gpt[-_. ]?5[-_. ]?5.*thinking/i.test(raw)) return 'GPT-5.5 Thinking';
    if (/gpt[-_. ]?5[-_. ]?5/i.test(raw)) return 'GPT-5.5';
    if (/gpt[-_. ]?5.*thinking/i.test(raw)) return 'GPT-5 Thinking';

    return raw
      .replace(/^gpt/i, 'GPT')
      .replace(/[-_]+/g, ' ')
      .replace(/\bo(\d)/i, 'o$1')
      .replace(/\bthinking\b/i, 'Thinking')
      .replace(/\breasoning\b/i, 'Reasoning')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function installStyles() {
    if (!document.documentElement) return;

    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(style);
    }

    style.setAttribute('data-cgpt-local-model-badge-version', SCRIPT_VERSION);
    if (style.textContent !== STYLE_TEXT) {
      style.textContent = STYLE_TEXT;
    }
  }

  function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function isVisible(element) {
    return Boolean(element && (element.offsetWidth || element.offsetHeight || element.getClientRects().length));
  }

  function getAssistantTurns() {
    const roleNodes = Array.from(document.querySelectorAll('[data-message-author-role="assistant"]'));
    const turns = [];
    const seen = new Set();

    for (const roleNode of roleNodes) {
      const turn = roleNode.closest('article, section[data-testid^="conversation-turn"], [data-testid*="conversation-turn"]') || roleNode;
      if (!seen.has(turn)) {
        seen.add(turn);
        turns.push(turn);
      }
    }

    return turns;
  }

  function getReplyToolbar(turn) {
    const groups = Array.from(turn.querySelectorAll('[role="group"][aria-label="回复操作"], [role="group"][aria-label*="操作"], [role="group"][aria-label*="action" i], [role="group"][aria-label*="response" i], [role="group"][aria-label*="reply" i], [role="group"][aria-label*="message" i]'))
      .filter(isVisible);

    return groups.find((group) => getModelButton(group)) || null;
  }

  function getAllAnchorButtons() {
    return Array.from(document.querySelectorAll('button'))
      .filter(isVisible)
      .filter(isAnchorButton);
  }

  function getButtonName(button) {
    return normalizeText([
      button.getAttribute('aria-label'),
      button.getAttribute('data-testid'),
      button.getAttribute('title'),
      button.textContent,
    ].filter(Boolean).join(' '));
  }

  function isAnchorButton(button) {
    const name = getButtonName(button).toLowerCase();
    return ANCHOR_LABEL_PARTS.some((part) => name.includes(part.toLowerCase()));
  }

  function getModelButton(scope) {
    const direct = scope.querySelector('button[aria-label="切换模型"], button[aria-label*="模型"], button[aria-label*="model" i]');
    if (direct && isVisible(direct)) return direct;

    return Array.from(scope.querySelectorAll('button'))
      .filter(isVisible)
      .find(isAnchorButton) || null;
  }

  function getAnchorButton(turn) {
    const buttons = Array.from(turn.querySelectorAll('button')).filter(isVisible);
    return buttons.find((button) => button.getAttribute('aria-label') === '切换模型')
      || buttons.find((button) => normalizeText(button.getAttribute('aria-label')).includes('重试'))
      || buttons.find(isAnchorButton)
      || null;
  }

  function looksLikeReplyToolbar(element, turn) {
    if (!element || element === turn || !turn.contains(element)) return false;
    return looksLikeButtonGroup(element);
  }

  function looksLikeButtonGroup(element) {
    if (!element) return false;

    const buttons = Array.from(element.querySelectorAll('button')).filter(isVisible);
    if (buttons.length < 2 || buttons.length > 14) return false;

    const names = buttons.map(getButtonName).join(' ').toLowerCase();
    return /复制|copy/.test(names)
      && /喜欢|good-response|bad-response|like|dislike|分享|share|更多|more|重试|retry|regenerate|model|模型/.test(names);
  }

  function getToolbarFromAnchor(anchor, turn) {
    const roleGroup = anchor.closest('[role="group"]');
    if (roleGroup) return roleGroup;

    let current = anchor.parentElement;
    let depth = 0;

    while (current && current !== turn && depth < 8) {
      if (looksLikeReplyToolbar(current, turn) || looksLikeButtonGroup(current)) return current;
      current = current.parentElement;
      depth += 1;
    }

    return anchor.parentElement;
  }

  function getTurnForButton(button, turns) {
    const containingTurn = turns.find((turn) => turn.contains(button));
    if (containingTurn) return containingTurn;

    let previousTurn = null;
    for (const turn of turns) {
      const relation = turn.compareDocumentPosition(button);
      if (relation & Node.DOCUMENT_POSITION_FOLLOWING) previousTurn = turn;
      if (relation & Node.DOCUMENT_POSITION_PRECEDING) break;
    }

    return previousTurn;
  }

  function getTurnForNode(node) {
    return node?.closest?.('article, section[data-testid^="conversation-turn"], [data-testid*="conversation-turn"]') || null;
  }

  function getTurnMessageNode(turn) {
    return turn.querySelector('[data-message-author-role="assistant"][data-message-id]')
      || turn.querySelector('[data-message-id]');
  }

  function getTurnMessageId(turn) {
    return normalizeText(getTurnMessageNode(turn)?.getAttribute('data-message-id'));
  }

  function getTurnModelSlug(turn) {
    return normalizeText(getTurnMessageNode(turn)?.getAttribute('data-message-model-slug'));
  }

  function extractUsageText(text) {
    const normalized = normalizeText(text);
    const chineseMatch = normalized.match(/已使用\s+((?:GPT|gpt|O|o)[^。]*?)(?=重试|已使用|$)/i);
    if (chineseMatch) return stripUsagePrefix(chineseMatch[1]);

    const englishMatch = normalized.match(/used\s+((?:GPT|gpt|O|o)[^.。]*?)(?=retry|regenerate|used|$)/i);
    if (englishMatch) return stripUsagePrefix(englishMatch[1]);

    return '';
  }

  function stripUsagePrefix(text) {
    return normalizeText(text)
      .replace(/^(?:已使用|使用了|used)\s+/i, '')
      .trim();
  }

  function readVisibleNativeUsageText() {
    const nodes = Array.from(document.querySelectorAll([
      '[role="tooltip"]',
      '[data-radix-popper-content-wrapper]',
      '[data-state="delayed-open"]',
      '[data-side]',
    ].join(','))).filter(isVisible);

    for (const node of nodes) {
      const usageText = extractUsageText(node.textContent);
      if (usageText) return usageText;
    }

    return '';
  }

  function createBadge() {
    const badge = document.createElement('div');
    badge.setAttribute(BADGE_ATTR, 'true');
    badge.setAttribute('aria-hidden', 'true');
    badge.textContent = '';
    return badge;
  }

  function getTurnUsageText(turn) {
    const directText = getUsageTextFromModelSlug(getTurnModelSlug(turn));
    if (directText) return directText;

    const currentMessageId = getTurnMessageId(turn);
    if (currentMessageId && usageTextByMessageId.has(currentMessageId)) {
      return usageTextByMessageId.get(currentMessageId);
    }

    const text = stripUsagePrefix(turn.getAttribute(TURN_TEXT_ATTR));
    const source = normalizeText(turn.getAttribute(TURN_SOURCE_ATTR));
    const storedMessageId = normalizeText(turn.getAttribute(TURN_MESSAGE_ID_ATTR));
    if (text && source && currentMessageId && storedMessageId === currentMessageId) return text;

    clearTurnUsageText(turn);
    if (!source && isAmbiguousLegacyText(text)) return CONFIG.fallbackText;
    return CONFIG.fallbackText;
  }

  function isAmbiguousLegacyText(text) {
    return /^(?:已使用\s+|used\s+)?GPT-5(?:\.5)?$/i.test(text);
  }

  function setTurnUsageText(turn, usageText, source) {
    const text = stripUsagePrefix(usageText);
    const messageId = getTurnMessageId(turn);
    if (!text) {
      clearTurnUsageText(turn);
      return;
    }

    turn.setAttribute(TURN_TEXT_ATTR, text);
    turn.setAttribute(TURN_SOURCE_ATTR, source || 'detected');
    if (messageId) turn.setAttribute(TURN_MESSAGE_ID_ATTR, messageId);
  }

  function clearTurnUsageText(turn) {
    turn.removeAttribute(TURN_TEXT_ATTR);
    turn.removeAttribute(TURN_SOURCE_ATTR);
    turn.removeAttribute(TURN_MESSAGE_ID_ATTR);
  }

  function placeBadge(turn, toolbar, button) {
    let badge = toolbar.querySelector(`[${BADGE_ATTR}="true"]`) || turn.querySelector(`[${BADGE_ATTR}="true"]`);
    const nextText = getTurnUsageText(turn);
    if (!nextText) {
      if (badge) removeElement(badge);
      return;
    }

    if (!badge) badge = createBadge();

    toolbar.setAttribute(TOOLBAR_ATTR, 'true');
    toolbar.setAttribute('data-cgpt-local-model-badge-version', SCRIPT_VERSION);
    toolbar.style.removeProperty('--cgpt-local-model-badge-left');
    toolbar.style.removeProperty('--cgpt-local-model-badge-top');
    toolbar.style.removeProperty('--cgpt-local-model-badge-reserve');

    if (badge.textContent !== nextText) badge.textContent = nextText;

    if (badge.parentElement !== toolbar) toolbar.appendChild(badge);
  }

  function bindModelButton(turn, button) {
    if (button.getAttribute('data-cgpt-local-model-badge-bound') === 'true') return;
    button.setAttribute('data-cgpt-local-model-badge-bound', 'true');

    const updateFromTooltip = () => {
      window.setTimeout(() => {
        const usageText = readVisibleNativeUsageText();
        if (usageText) {
          setTurnUsageText(turn, usageText, 'tooltip');
          scheduleScan();
        }
      }, 80);
    };

    button.addEventListener('mouseenter', updateFromTooltip, true);
    button.addEventListener('focus', updateFromTooltip, true);
    button.addEventListener('pointerenter', updateFromTooltip, true);
  }

  function ensureBadge(turn) {
    const button = getAnchorButton(turn);
    if (!button) return;

    ensureBadgeForButton(turn, button);
  }

  function ensureBadgeForButton(turn, button) {
    const toolbar = getReplyToolbar(turn) || getToolbarFromAnchor(button, turn);
    if (!toolbar) return;

    bindModelButton(turn, button);
    placeBadge(turn, toolbar, button);
  }

  function cleanupBadges(keptTurns) {
    const kept = new Set(keptTurns);
    for (const badge of document.querySelectorAll(`[${BADGE_ATTR}="true"]`)) {
      const ownerTurn = getTurnForNode(badge);
      if (ownerTurn && !kept.has(ownerTurn)) removeElement(badge);
    }
  }

  function removeElement(element) {
    if (!element?.parentNode) return;
    element.parentNode.removeChild(element);
  }

  function scan() {
    if (!document.body) return;
    installStyles();

    const turns = getAssistantTurns();
    const targetTurns = CONFIG.onlyLatestAssistant ? turns.slice(-1) : turns;

    for (const turn of targetTurns) {
      ensureBadge(turn);
    }

    for (const button of getAllAnchorButtons()) {
      const turn = getTurnForButton(button, turns);
      if (!turn) continue;
      if (CONFIG.onlyLatestAssistant && !targetTurns.includes(turn)) continue;
      ensureBadgeForButton(turn, button);
    }

    if (CONFIG.onlyLatestAssistant) cleanupBadges(targetTurns);
  }

  function scheduleScan() {
    window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(scan, CONFIG.scanDelayMs);
  }

  function startObserver() {
    if (!document.documentElement || observerStarted) return;
    observerStarted = true;

    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  startObserver();

  document.addEventListener('DOMContentLoaded', () => {
    startObserver();
    scheduleScan();
  }, { once: true });
  window.addEventListener('load', scheduleScan);
  window.addEventListener('resize', scheduleScan);
  window.addEventListener('scroll', scheduleScan, { passive: true });
  window.addEventListener('popstate', scheduleScan);
  document.addEventListener('visibilitychange', scheduleScan);
  window.setInterval(scheduleScan, 2000);

  scheduleScan();
})();
