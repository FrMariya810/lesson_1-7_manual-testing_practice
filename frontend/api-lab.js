import { mountLabControls } from './lab.js';

const form = document.querySelector('#request-form');
const method = document.querySelector('#method');
const requestPath = document.querySelector('#path');
const requestBody = document.querySelector('#request-body');
const sendButton = document.querySelector('#send-request');
const status = document.querySelector('#response-status');
const responseBody = document.querySelector('#response-body');
const downloadButton = document.querySelector('#download-evidence');
let evidence = null;
document.querySelector('#base-url').textContent = window.location.origin;
function updateMethod() {
  requestBody.disabled = method.value !== 'POST';
}
method.addEventListener('change', updateMethod);
updateMethod();
form.addEventListener('submit', async event => {
  event.preventDefault();
  evidence = null;
  downloadButton.disabled = true;
  const pathname = requestPath.value.trim();
  if (!/^\/applications(?:\/[a-zA-Z0-9_-]+)?$/.test(pathname)) {
    status.textContent = 'Для этого клиента укажите /applications или /applications/id.';
    status.dataset.state = 'error';
    responseBody.textContent = 'Запрос не отправлен.';
    document.querySelector('#sent-request').textContent = '—';
    document.querySelector('#response-version').textContent = '—';
    document.querySelector('#response-type').textContent = '—';
    return;
  }
  const request = {
    method: method.value,
    url: `${window.location.origin}${pathname}`,
    headers: method.value === 'POST' ? { 'Content-Type': 'application/json' } : {},
    body: method.value === 'POST' ? requestBody.value : null,
  };
  sendButton.disabled = true;
  status.dataset.state = 'loading';
  status.textContent = 'Запрос выполняется…';
  responseBody.textContent = 'Ожидаем ответ.';
  document.querySelector('#sent-request').textContent = `${request.method} ${request.url}`;
  document.querySelector('#response-version').textContent = '—';
  document.querySelector('#response-type').textContent = '—';
  const start = performance.now();
  try {
    const response = await fetch(request.url, {
      method: request.method, headers: request.headers,
      ...(request.body === null ? {} : { body: request.body }),
      cache: 'no-store',
    });
    const body = await response.text();
    const elapsed = Math.round(performance.now() - start);
    status.textContent = `HTTP ${response.status} ${response.statusText} · ${elapsed} мс`;
    status.dataset.state = response.ok ? 'received' : 'error';
    document.querySelector('#response-version').textContent = `${response.headers.get('x-lab-version')} / ${response.headers.get('x-lab-mode')}`;
    document.querySelector('#response-type').textContent = response.headers.get('content-type') || '—';
    responseBody.textContent = body || '(пустое тело)';
    evidence = {
      capturedAt: new Date().toISOString(), request,
      response: { status: response.status, headers: Object.fromEntries(response.headers), body, elapsedMs: elapsed },
    };
    downloadButton.disabled = false;
  } catch (error) {
    status.textContent = 'Нет HTTP-ответа: проверьте, запущен ли сервер.';
    status.dataset.state = 'error';
    responseBody.textContent = error.message;
  } finally {
    sendButton.disabled = false;
  }
});
downloadButton.addEventListener('click', () => {
  if (!evidence) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(evidence, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `api-evidence-${Date.now()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
mountLabControls();
