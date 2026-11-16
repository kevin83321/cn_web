'use strict';
import { CONFIG } from './config.js';

export const $ = id => document.getElementById(id);
export const esc = v => String(v ?? '—').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const errors = {
  UNAUTHORIZED: '登入已失效，正在返回登入頁面',
  FORBIDDEN: '沒有管理員查詢權限',
  INVALID_FILTER: '篩選條件不正確',
  INVALID_PAGINATION: '分頁參數不正確'
};
export const getToken = () => localStorage.getItem(CONFIG.TOKEN_KEY) || sessionStorage.getItem(CONFIG.TOKEN_KEY) || '';
export async function api(path, options = {}) {
  if (window.CNAuthGuardReady) await window.CNAuthGuardReady;
  const token = getToken();
  if (!token) throw new Error('UNAUTHORIZED');
  const response = await fetch(CONFIG.API_BASE + path, {
    method: options.method || 'GET',
    cache: 'no-store',
    headers: {
      Authorization: 'Bearer ' + token,
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {})
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {})
  });
  let data;
  try { data = await response.json(); }
  catch { throw new Error('HTTP_' + response.status); }
  if (!response.ok || !data.success) {
    const error = new Error(data.error || 'HTTP_' + response.status);
    error.status = response.status;
    throw error;
  }
  return data;
}
