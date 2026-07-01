// ==UserScript==
// @name         ChatGPT 模型标记：GPT-5.5 Thinking
// @namespace    local.codex.chatgpt-model-badge
// @version      1.2.0
// @description  在 ChatGPT 回复结束后的切换模型/重试按钮下方显示模型标记。
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @run-at       document-idle
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

  let scanTimer = 0;

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      [${TOOLBAR_ATTR}="true"] {
        position: relative !important;
        overflow: visible !important;
        margin-bottom: var(--cgpt-local-model-badge-reserve, 22px) !important;
      }

      [${BADGE_ATTR}="true"] {
        position: absolute;
        z-index: 4;
        left: var(--cgpt-local-model-badge-left, 0px);
        top: var(--cgpt-local-model-badge-top, calc(100% + 1px));
        display: inline-flex;
        align-items: center;
        min-height: 18px;
        max-width: min(340px, calc(100vw - 32px));
        overflow: hidden;
        color: var(--text-secondary, #9b9b9b);
        font-size: 14px;
        line-height: 18px;
        text-overflow: ellipsis;
        white-space: nowrap;
        opacity: 0.95;
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

  function getModelButton(scope) {
    const direct = scope.querySelector('button[aria-label="切换模型"], button[aria-label*="模型"], button[aria-label*="model" i]');
    if (direct && isVisible(direct)) return direct;

    return Array.from(scope.querySelectorAll('button'))
      .filter(isVisible)
      .find((button) => {
        const text = normalizeText([
          button.getAttribute('aria-label'),
          button.getAttribute('data-testid'),
          button.getAttribute('title'),
        ].join(' ')).toLowerCase();
        return text.includes('切换模型') || text.includes('switch model') || text.includes('model');
      }) || null;
  }

  function getTurnForNode(node) {
    return node?.closest?.('article, section[data-testid^="conversation-turn"], [data-testid*="conversation-turn"]') || null;
  }

  function extractUsageText(text) {
    const normalized = normalizeText(text);
    const chineseMatch = normalized.match(/已使用\s+[^重]+?(?:Thinking|思考|GPT[-\w. ]+|o\d[-\w. ]*)/i);
    if (chineseMatch) return normalizeText(chineseMatch[0]);

    const englishMatch = normalized.match(/used\s+[^.。]+?(?:Thinking|GPT[-\w. ]+|o\d[-\w. ]*)/i);
    if (englishMatch) return normalizeText(englishMatch[0]);

    const looseMatch = normalized.match(/已使用\s+(.+)$/i);
    if (looseMatch) return normalizeText(`已使用 ${looseMatch[1]}`);

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
    const top = Math.max(18, Math.round(toolbarRect.height + 1));

    toolbar.setAttribute(TOOLBAR_ATTR, 'true');
    toolbar.style.setProperty('--cgpt-local-model-badge-left', `${left}px`);
    toolbar.style.setProperty('--cgpt-local-model-badge-top', `${top}px`);
    toolbar.style.setProperty('--cgpt-local-model-badge-reserve', '22px');

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

  function ensureBadge(turn) {
    const toolbar = getReplyToolbar(turn);
    if (!toolbar) return;

    const button = getModelButton(toolbar);
    if (!button) return;

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
    installStyles();

    const turns = getAssistantTurns();
    const targetTurns = CONFIG.onlyLatestAssistant ? turns.slice(-1) : turns;

    for (const turn of targetTurns) ensureBadge(turn);
    if (CONFIG.onlyLatestAssistant) cleanupBadges(targetTurns);
  }

  function scheduleScan() {
    window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(scan, CONFIG.scanDelayMs);
  }

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  window.addEventListener('load', scheduleScan);
  window.addEventListener('resize', scheduleScan);
  window.addEventListener('scroll', scheduleScan, { passive: true });
  window.addEventListener('popstate', scheduleScan);
  document.addEventListener('visibilitychange', scheduleScan);
  window.setInterval(scheduleScan, 2000);

  scheduleScan();
})();
