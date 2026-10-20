export const DRAFT_KEY = 'workshop-1:draft';

export async function mountLabControls() {
  const root = document.querySelector('#lab-controls');
  root.innerHTML = `
    <details>
      <summary>Условия проверки <span data-mode-summary>загрузка…</span></summary>
      <div class="lab-body">
        <div><label for="lab-mode">Режим ответа API</label>
          <select id="lab-mode">
            <option value="normal">normal · обычный ответ</option>
            <option value="delay">delay · задержка 1,5 секунды</option>
            <option value="empty">empty · пустой список</option>
            <option value="error">error · HTTP 500</option>
          </select>
        </div>
        <button type="button" class="button button-secondary" id="reset-lab">Сбросить стенд</button>
        <p>Сброс восстанавливает 3 исходные заявки, режим normal и удаляет черновик этого приложения. Перезагрузка страницы этого не делает.</p>
        <p class="lab-message" role="status" aria-live="polite"></p>
      </div>
    </details>`;
  const select = root.querySelector('#lab-mode');
  const reset = root.querySelector('#reset-lab');
  const message = root.querySelector('.lab-message');
  const summary = root.querySelector('[data-mode-summary]');
  async function sync() {
    try {
      const response = await fetch('/lab/state', { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const state = await response.json();
      select.value = state.mode;
      summary.textContent = `${state.version} / ${state.mode}`;
      document.querySelectorAll('[data-version]').forEach(el => el.textContent = state.version);
    } catch {
      summary.textContent = 'сервер недоступен';
      message.textContent = 'Проверьте терминал и снова откройте страницу.';
    }
  }
  select.addEventListener('change', async () => {
    select.disabled = true;
    reset.disabled = true;
    try {
      const response = await fetch('/lab/config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: select.value }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      message.textContent = 'Режим применён. Теперь повторите запрос или действие в приложении.';
      await sync();
    } catch {
      message.textContent = 'Режим не изменён. Проверьте подключение к серверу.';
    } finally {
      select.disabled = false;
      reset.disabled = false;
    }
  });
  reset.addEventListener('click', async () => {
    if (!confirm('Сбросить учебные заявки и локальный черновик? Файлы кода и ваш отчёт останутся.')) return;
    reset.disabled = true;
    select.disabled = true;
    try {
      const response = await fetch('/lab/reset', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* Хранилище может быть недоступно. */ }
      window.location.reload();
    } catch {
      message.textContent = 'Сброс не выполнен. Проверьте терминал API.';
      reset.disabled = false;
      select.disabled = false;
    }
  });
  window.addEventListener('focus', sync);
  await sync();
}
