// ==UserScript==
// @name         ChatGPT 模型标记：GPT-5.5 Thinking
// @namespace    local.codex.chatgpt-model-badge
// @version      1.3.0
// @description  自动记录 ChatGPT 回复使用的模型，并显示在切换模型/重试按钮下方。
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const CONFIG = {
    fallbackText: '已使用 GPT-5.5 Thinking',
    onlyLatestAssistant: false,
    scanDelayMs: 120,
  };

  const STYLE_ID = 'cgpt-local-model-badge-style';
  const BADGE_ATTR = 'data-cgpt-local-model-badge';
  const TOOLBAR_ATTR = 'data-cgpt-local-model-badge-toolbar';
  const TURN_TEXT_ATTR = 'data-cgpt-local-model-badge-text';
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
  let latestAssistantUsageTexts = [];
  let observerStarted = false;

  hookFetch();

  function hookFetch() {
    const originalFetch = window.fetch;
    if (!originalFetch || originalFetch.__cgptLocalModelBadgeHooked) return;

    window.fetch = async function cgptLocalModelBadgeFetch(...args) {
      const response = await originalFetch.apply(this, args);
      inspectFetchResponse(args[0], response);
      return response;
    };

    try {
      window.fetch.__cgptLocalModelBadgeHooked = true;
    } catch (_) {}
  }

  function inspectFetchResponse(input, response) {
    const url = getFetchUrl(input);
    if (!url || !/\/backend-api\/(?:f\/)?conversation\b|\/backend-api\/conversation\//.test(url)) return;
    if (!response || !response.ok) return;

    response.clone().text()
      .then((text) => {
        const usageTexts = extractUsageTextsFromResponseText(text);
        if (usageTexts.length) {
          latestAssistantUsageTexts = usageTexts;
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

  function extractUsageTextsFromResponseText(text) {
    const messages = [];

    for (const payload of parseJsonPayloads(text)) {
      collectAssistantMessages(payload, messages);
    }

    return dedupeMessages(messages)
      .map(getUsageTextFromMessage)
      .filter(Boolean);
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
    const rawModel = metadata.model_slug
      || metadata.requested_model_slug
      || metadata.default_model_slug
      || metadata.parent_model_slug
      || '';

    const modelName = formatModelName(rawModel);
    return modelName ? `已使用 ${modelName}` : '';
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
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      [${TOOLBAR_ATTR}="true"] {
        position: relative !important;
        overflow: visible !important;
      }

      [${BADGE_ATTR}="true"] {
        display: flex;
        flex: 0 0 100%;
        align-items: center;
        min-height: 18px;
        margin-top: -2px;
        box-sizing: border-box;
        width: 100%;
        max-width: 100%;
        padding-left: var(--cgpt-local-model-badge-left, 0px);
        overflow: hidden;
        color: var(--text-secondary, #9b9b9b);
        font-size: 14px;
        line-height: 18px;
        text-overflow: ellipsis;
        white-space: nowrap;
        opacity: 0.98;
        pointer-events: none;
        user-select: none;
      }
    `;
    document.documentElement.appendChild(style);
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

    const buttons = Array.from(element.querySelectorAll('button')).filter(isVisible);
    if (buttons.length < 2 || buttons.length > 14) return false;

    const names = buttons.map(getButtonName).join(' ').toLowerCase();
    return /复制|copy/.test(names)
      && /喜欢|good-response|bad-response|like|dislike|分享|share|更多|more|重试|retry|regenerate|model|模型/.test(names);
  }

  function getToolbarFromAnchor(anchor, turn) {
    const roleGroup = anchor.closest('[role="group"]');
    if (roleGroup && turn.contains(roleGroup)) return roleGroup;

    let current = anchor.parentElement;
    let depth = 0;

    while (current && current !== turn && depth < 8) {
      if (looksLikeReplyToolbar(current, turn)) return current;
      current = current.parentElement;
      depth += 1;
    }

    return anchor.parentElement;
  }

  function getTurnForNode(node) {
    return node?.closest?.('article, section[data-testid^="conversation-turn"], [data-testid*="conversation-turn"]') || null;
  }

  function extractUsageText(text) {
    const normalized = normalizeText(text);
    const chineseMatch = normalized.match(/已使用\s+((?:GPT|gpt|O|o)[^。]*?)(?=重试|已使用|$)/i);
    if (chineseMatch) return normalizeText(`已使用 ${chineseMatch[1]}`);

    const englishMatch = normalized.match(/used\s+((?:GPT|gpt|O|o)[^.。]*?)(?=retry|regenerate|used|$)/i);
    if (englishMatch) return normalizeText(`used ${englishMatch[1]}`);

    return '';
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
    badge.textContent = CONFIG.fallbackText;
    return badge;
  }

  function getTurnUsageText(turn) {
    return turn.getAttribute(TURN_TEXT_ATTR) || CONFIG.fallbackText;
  }

  function setTurnUsageText(turn, usageText) {
    const text = normalizeText(usageText);
    if (text) turn.setAttribute(TURN_TEXT_ATTR, text);
  }

  function placeBadge(turn, toolbar, button) {
    let badge = turn.querySelector(`[${BADGE_ATTR}="true"]`);
    if (!badge) badge = createBadge();

    const toolbarRect = toolbar.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const left = Math.max(0, Math.round(buttonRect.left - toolbarRect.left));

    toolbar.setAttribute(TOOLBAR_ATTR, 'true');
    toolbar.style.setProperty('--cgpt-local-model-badge-left', `${left}px`);

    const nextText = getTurnUsageText(turn);
    if (badge.textContent !== nextText) badge.textContent = nextText;

    if (badge.parentElement !== toolbar) toolbar.appendChild(badge);
  }

  function bindModelButton(turn, button) {
    if (button.dataset.cgptLocalModelBadgeBound === 'true') return;
    button.dataset.cgptLocalModelBadgeBound = 'true';

    const updateFromTooltip = () => {
      window.setTimeout(() => {
        const usageText = readVisibleNativeUsageText();
        if (usageText) {
          setTurnUsageText(turn, usageText);
          scheduleScan();
        }
      }, 80);
    };

    button.addEventListener('mouseenter', updateFromTooltip, true);
    button.addEventListener('focus', updateFromTooltip, true);
    button.addEventListener('pointerenter', updateFromTooltip, true);
  }

  function ensureBadge(turn, assistantIndex) {
    const button = getAnchorButton(turn);
    if (!button) return;

    const toolbar = getReplyToolbar(turn) || getToolbarFromAnchor(button, turn);
    if (!toolbar) return;

    if (latestAssistantUsageTexts[assistantIndex]) {
      setTurnUsageText(turn, latestAssistantUsageTexts[assistantIndex]);
    }

    bindModelButton(turn, button);
    placeBadge(turn, toolbar, button);
  }

  function cleanupBadges(keptTurns) {
    const kept = new Set(keptTurns);
    for (const badge of document.querySelectorAll(`[${BADGE_ATTR}="true"]`)) {
      const ownerTurn = getTurnForNode(badge);
      if (ownerTurn && !kept.has(ownerTurn)) badge.remove();
    }
  }

  function scan() {
    if (!document.body) return;
    installStyles();

    const turns = getAssistantTurns();
    const targetTurns = CONFIG.onlyLatestAssistant ? turns.slice(-1) : turns;

    for (const turn of targetTurns) {
      ensureBadge(turn, turns.indexOf(turn));
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
