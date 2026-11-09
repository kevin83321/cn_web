
'use strict';
import { CONFIG } from './config.js';

(() => {

  const $ = id => document.getElementById(id);

  const createButton = $('createInviteButton');
  const output = $('inviteLinkOutput');
  const resultSection = $('inviteResult');
  const urlText = $('inviteUrlText');
  const shareMessage = $('inviteShareMessage');

  const copyButton = $('copyInviteButton');
  const lineButton = $('lineShareButton');
  const nativeButton = $('nativeShareButton');
  const copyTextButton = $('copyInviteTextButton');

  if (
    !createButton ||
    !output ||
    !resultSection ||
    !urlText ||
    !shareMessage
  ) {
    return;
  }

  let currentInviteUrl = '';

  // ============================================================
  // Helpers
  // ============================================================

  function getSessionToken() {
    return (
      localStorage.getItem(CONFIG.TOKEN_KEY) ||
      sessionStorage.getItem(CONFIG.TOKEN_KEY) ||
      ''
    );
  }

  function showMessage(message, type = '') {
    shareMessage.textContent = message;
    shareMessage.className =
      'message' + (type ? ' ' + type : '');
  }

  function getInviteMessage(url) {
    return [
      '邀請你加入 CN 會員中心！',
      '',
      '請透過以下專屬連結完成註冊：',
      url,
      '',
      '邀請連結有效期限為 7 天，僅能使用一次。'
    ].join('\n');
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch {
        // Fall back to legacy copy.
      }
    }

    const textarea = document.createElement('textarea');

    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';

    document.body.appendChild(textarea);
    textarea.select();

    try {
      if (!document.execCommand('copy')) {
        throw new Error('COPY_FAILED');
      }
    } finally {
      textarea.remove();
    }
  }

  function validateInviteUrl(value) {
    if (typeof value !== 'string' || !value) {
      throw new Error('API 未回傳邀請連結');
    }

    const url = new URL(value);

    if (
      url.protocol !== 'https:' ||
      url.origin !== location.origin
    ) {
      throw new Error('邀請連結來源不正確');
    }

    return url.href;
  }

  // ============================================================
  // Create Invitation
  // ============================================================

  async function createInvitation() {
    if (createButton.disabled) {
      return;
    }

    createButton.disabled = true;
    createButton.textContent = '產生中…';

    output.textContent = '正在產生邀請連結…';
    output.className = 'message';

    resultSection.hidden = true;
    currentInviteUrl = '';

    try {
      const token = getSessionToken();

      if (!token) {
        throw new Error('請先登入會員帳號');
      }

      const response = await fetch(
        CONFIG.API_BASE + '/api/auth/invitations',
        {
          method: 'POST',
          cache: 'no-store',
          headers: {
            Authorization: 'Bearer ' + token
          }
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || '產生邀請連結失敗'
        );
      }

      const inviteUrl = validateInviteUrl(data.url);

      currentInviteUrl = inviteUrl;

      urlText.textContent = inviteUrl;
      resultSection.hidden = false;

      createButton.textContent = '產生另一組邀請連結';

      // Automatic copy is best-effort.
      try {
        await copyText(inviteUrl);

        output.textContent = '邀請連結已產生並複製';
        output.className = 'message success';
      } catch {
        output.textContent =
          '邀請連結已產生，請點擊下方按鈕複製';

        output.className = 'message success';
      }

      showMessage('');

    } catch (error) {
      output.textContent =
        '無法產生邀請連結：' + error.message;

      output.className = 'message error';

      createButton.textContent = '重新產生邀請連結';

    } finally {
      createButton.disabled = false;
    }
  }

  // ============================================================
  // Copy Invitation URL
  // ============================================================

  async function copyInviteUrl() {
    if (!currentInviteUrl) {
      return;
    }

    try {
      await copyText(currentInviteUrl);
      showMessage('連結已複製', 'success');
    } catch {
      showMessage(
        '無法自動複製，請長按上方連結手動複製',
        'error'
      );
    }
  }

  // ============================================================
  // Copy Invitation Message
  // ============================================================

  async function copyInviteMessage() {
    if (!currentInviteUrl) {
      return;
    }

    try {
      await copyText(
        getInviteMessage(currentInviteUrl)
      );

      showMessage(
        '完整邀請文字已複製',
        'success'
      );
    } catch {
      showMessage(
        '無法複製邀請文字',
        'error'
      );
    }
  }

  // ============================================================
  // LINE Share
  // ============================================================

  function shareToLine() {
    if (!currentInviteUrl) {
      return;
    }

    const shareUrl =
      'https://social-plugins.line.me/lineit/share?url=' +
      encodeURIComponent(currentInviteUrl);

    const opened = window.open(
      shareUrl,
      '_blank',
      'noopener,noreferrer'
    );

    if (!opened) {
      // Some embedded browsers may block new windows.
      location.href = shareUrl;
    }
  }

  // ============================================================
  // Native Share
  // ============================================================

  async function shareNative() {
    if (!currentInviteUrl) {
      return;
    }

    if (!navigator.share) {
      try {
        await copyText(
          getInviteMessage(currentInviteUrl)
        );

        showMessage(
          '此裝置不支援分享面板，已複製邀請文字',
          'success'
        );
      } catch {
        showMessage(
          '此裝置不支援分享面板，請使用複製連結',
          'error'
        );
      }

      return;
    }

    try {
      await navigator.share({
        title: 'CN 會員邀請',
        text: '邀請你加入 CN 會員中心！',
        url: currentInviteUrl
      });

      showMessage('已完成分享操作', 'success');

    } catch (error) {
      if (error.name === 'AbortError') {
        return;
      }

      showMessage(
        '無法開啟分享面板，請使用複製連結',
        'error'
      );
    }
  }

  // ============================================================
  // Event Listeners
  // ============================================================

  createButton.addEventListener(
    'click',
    createInvitation
  );

  copyButton?.addEventListener(
    'click',
    copyInviteUrl
  );

  copyTextButton?.addEventListener(
    'click',
    copyInviteMessage
  );

  lineButton?.addEventListener(
    'click',
    shareToLine
  );

  nativeButton?.addEventListener(
    'click',
    shareNative
  );

})();
