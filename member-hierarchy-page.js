'use strict';

const TOKEN_KEY = 'member_session_token';

let sessionToken =
  sessionStorage.getItem(TOKEN_KEY) || '';

const $ = id => document.getElementById(id);

function gasUrl() {
  const url = sessionStorage.getItem('gas_url');

  if (!url) {
    throw new Error(
      '找不到 GAS API URL，請重新登入'
    );
  }

  return url;
}

async function api(action, extra = {}) {
  const response = await fetch(gasUrl(), {
    method: 'POST',
    redirect: 'follow',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    },
    body: JSON.stringify({
      action,
      ...extra
    })
  });

  if (!response.ok) {
    throw new Error(
      'API HTTP ' + response.status
    );
  }

  return response.json();
}

async function verifySession() {
  if (!sessionToken) {
    location.replace('./index.html');
    return false;
  }

  const result = await api('me', {
    token: sessionToken
  });

  if (!result.success) {
    sessionStorage.removeItem(TOKEN_KEY);
    location.replace('./index.html');
    return false;
  }

  return true;
}

$('backToMember').addEventListener(
  'click',
  () => {
    location.href = './index.html';
  }
);

