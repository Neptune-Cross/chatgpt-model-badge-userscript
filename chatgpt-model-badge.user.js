// ==UserScript==
// @name         ChatGPT 模型标记：GPT-5.5 Thinking
// @namespace    local.codex.chatgpt-model-badge
// @version      1.0.0
// @description  在 ChatGPT 回复结束后的操作按钮下方显示本地模型标记。
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const CONFIG = {
    labelText: '已使用 GPT-5.5 Thinking',
    onlyLatestAssistant: false,
    scanDelayMs: 120,
  };

  const STYLE_ID = 'cgpt-local-model-badge-style';
  const BADGE_ROW_CLASS = 'cgpt-local-model-badge-row';
  const BADGE_TEXT_CLASS = 'cgpt-local-model-badge-text';
  const BADGE_ATTR = 'data-cgpt-local-model-badge';

  const ACTION_TEST_ID_PARTS = [
    'copy-turn',
    'good-response',
    'bad-response',
    'regenerate',
    'share-turn',
    'more-turn',
    'voice',
    'read-aloud',
  ];

  const ACTION_LABEL_PARTS = [
    'copy',
    '复制',
    'good response',
    'bad response',
    'like',
    'dislike',
    '赞',
    '踩',
    '重新生成',
    '重试',
    'regenerate',
    'share',
    '分享',
    'more',
    '更多',
    'read aloud',
    '朗读',
  ];

  const CODE_COPY_LABEL_PARTS = [
    'copy code',
    '复制代码',
    'copy snippet',
    '复制片段',
  ];

  const STOP_LABEL_PARTS = [
    'stop generating',
    '停止生成',
    '停止回答',
    'cancel generation',
    '取消生成',
  ];

  let scanTimer = 0;

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .${BADGE_ROW_CLASS} {
        display: flex;
        align-items: center;
        min-height: 20px;
        margin-top: 2px;
        color: var(--text-secondary, #9b9b9b);
        font-size: 14px;
        line-height: 20px;
        pointer-events: none;
        user-select: none;
      }

      .${BADGE_TEXT_CLASS} {
        display: inline-flex;
        align-items: center;
        white-space: nowrap;
        opacity: 0.95;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function getButtonName(button) {
    return normalizeText([
      button.getAttribute('data-testid'),
      button.getAttribute('aria-label'),
      button.getAttribute('title'),
      button.textContent,
    ].filter(Boolean).join(' '));
  }

  function isVisible(element) {
    return Boolean(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
  }

  function isCodeCopyButton(button, name) {
    if (CODE_COPY_LABEL_PARTS.some((part) => name.includes(part))) return true;

    const testId = normalizeText(button.getAttribute('data-testid'));
    if (testId.includes('copy-turn') || testId.includes('turn-action')) return false;

    return Boolean(button.closest('pre, code, [data-code-block], [class*="code-block"]'))
      && (name === 'copy' || name === '复制');
  }

  function getAssistantContent(turn) {
    return turn.querySelector('[data-message-author-role="assistant"]');
  }

  function isInsideAssistantContent(button, turn) {
    const content = getAssistantContent(turn);
    return Boolean(content && content.contains(button));
  }

  function isKnownActionButton(button, turn, allowInsideContent) {
    const name = getButtonName(button);
    if (!name || isCodeCopyButton(button, name)) return false;

    const testId = normalizeText(button.getAttribute('data-testid'));
    const hasTurnSpecificTestId = ACTION_TEST_ID_PARTS.some((part) => testId.includes(part));
    if (hasTurnSpecificTestId) return true;

    if (!allowInsideContent && isInsideAssistantContent(button, turn)) return false;

    return ACTION_LABEL_PARTS.some((part) => name.includes(part));
  }

  function getActionButtons(scope, turn, allowInsideContent = false) {
    return Array.from(scope.querySelectorAll('button'))
      .filter((button) => isVisible(button))
      .filter((button) => isKnownActionButton(button, turn, allowInsideContent));
  }

  function getAssistantTurns() {
    const roleNodes = Array.from(document.querySelectorAll('[data-message-author-role="assistant"]'));
    const turns = [];
    const seen = new Set();

    for (const roleNode of roleNodes) {
      const turn = roleNode.closest('article, [data-testid^="conversation-turn"], [data-testid*="conversation-turn"]') || roleNode;
      if (!seen.has(turn)) {
        seen.add(turn);
        turns.push(turn);
      }
    }

    return turns;
  }

  function countVisibleButtons(element) {
    return Array.from(element.querySelectorAll('button')).filter((button) => isVisible(button)).length;
  }

  function compactTextLength(element) {
    return normalizeText(element.textContent).length;
  }

  function isToolbarCandidate(element, turn) {
    if (!element || element === turn || !turn.contains(element)) return false;

    const actionCount = getActionButtons(element, turn).length;
    const buttonCount = countVisibleButtons(element);
    const textLength = compactTextLength(element);

    return actionCount >= 1 && buttonCount <= 16 && textLength <= 180;
  }

  function smallestCommonAncestor(nodes, boundary) {
    if (!nodes.length) return null;

    let candidate = nodes[0].parentElement;
    while (candidate && candidate !== boundary.parentElement) {
      if (nodes.every((node) => candidate.contains(node))) return candidate;
      candidate = candidate.parentElement;
    }

    return null;
  }

  function findActionToolbar(turn) {
    let actionButtons = getActionButtons(turn, turn);

    if (!actionButtons.length) {
      actionButtons = getActionButtons(turn, turn, true);
    }

    if (!actionButtons.length) return null;

    if (actionButtons.length >= 2) {
      const common = smallestCommonAncestor(actionButtons, turn);
      if (isToolbarCandidate(common, turn)) return common;
    }

    for (const button of actionButtons) {
      let current = button.parentElement;
      let depth = 0;

      while (current && current !== turn && depth < 8) {
        const actionCount = getActionButtons(current, turn).length;
        if (actionCount >= Math.min(2, actionButtons.length) && isToolbarCandidate(current, turn)) {
          return current;
        }

        current = current.parentElement;
        depth += 1;
      }
    }

    return actionButtons[0].parentElement;
  }

  function isPageGenerating() {
    return Array.from(document.querySelectorAll('button')).some((button) => {
      const name = getButtonName(button);
      const testId = normalizeText(button.getAttribute('data-testid'));
      return STOP_LABEL_PARTS.some((part) => name.includes(part)) || testId.includes('stop');
    });
  }

  function createBadgeRow() {
    const row = document.createElement('div');
    row.className = BADGE_ROW_CLASS;
    row.setAttribute(BADGE_ATTR, 'true');

    const text = document.createElement('span');
    text.className = BADGE_TEXT_CLASS;
    text.textContent = CONFIG.labelText;

    row.appendChild(text);
    return row;
  }

  function ensureBadge(turn) {
    const toolbar = findActionToolbar(turn);
    if (!toolbar) return;

    let row = turn.querySelector(`[${BADGE_ATTR}="true"]`);
    if (!row) row = createBadgeRow();

    const text = row.querySelector(`.${BADGE_TEXT_CLASS}`);
    if (text && text.textContent !== CONFIG.labelText) {
      text.textContent = CONFIG.labelText;
    }

    if (row.previousElementSibling !== toolbar) {
      toolbar.insertAdjacentElement('afterend', row);
    }
  }

  function scan() {
    if (!document.body) return;

    installStyles();
    if (isPageGenerating()) return;

    const turns = getAssistantTurns();
    const targetTurns = CONFIG.onlyLatestAssistant ? turns.slice(-1) : turns;

    for (const turn of targetTurns) {
      ensureBadge(turn);
    }

    if (CONFIG.onlyLatestAssistant) {
      for (const row of document.querySelectorAll(`[${BADGE_ATTR}="true"]`)) {
        if (!targetTurns.some((turn) => turn.contains(row))) row.remove();
      }
    }
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
  window.addEventListener('popstate', scheduleScan);
  document.addEventListener('visibilitychange', scheduleScan);
  window.setInterval(scheduleScan, 2000);

  scheduleScan();
})();
