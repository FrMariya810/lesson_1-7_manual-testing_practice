import { mountLabControls, DRAFT_KEY } from './lab.js';

const applicationForm = document.querySelector('#application-form');
const list = document.querySelector('#applications');
const listStatus = document.querySelector('#list-status');
const count = document.querySelector('#application-count');
const refreshButton = document.querySelector('#refresh-button');
const submitButton = document.querySelector('#submit-button');
const submitStatus = document.querySelector('#submit-status');
const draftStatus = document.querySelector('#draft-status');
const topicLabels = { html: 'HTML и CSS', javascript: 'HTML и CSS', api: 'HTTP и API' };

function setListState(state, text) {
  listStatus.textContent = text;
  listStatus.dataset.state = state;
  list.hidden = state !== 'success';
}
function renderApplications(applications) {
  list.replaceChildren();
  for (const application of applications) {
    const article = document.createElement('article');
    article.className = 'application-card';
    article.dataset.id = application.id;
    const tag = document.createElement('span');
    tag.className = 'application-topic';
    tag.textContent = topicLabels[application.topic] || application.topic;
    const name = document.createElement('h3');
    name.textContent = application.name;
    const email = document.createElement('p');
    email.className = 'application-email';
    email.textContent = application.email;
    const id = document.createElement('span');
    id.className = 'application-id';
    id.textContent = `Заявка #${application.id}`;
    article.append(tag, name, email, id);
    list.append(article);
  }
  count.textContent = String(applications.length);
}
async function loadApplications() {
  refreshButton.disabled = true;
  setListState('loading', 'Загружаем заявки…');
  try {
    const response = await fetch('/applications', { cache: 'no-store' });
    const applications = await response.json();
    if (!response.ok) throw new Error(applications.error?.message || `HTTP ${response.status}`);
    if (!applications.length) {
      count.textContent = '0';
      setListState('empty', 'Заявок пока нет. Можно стать первым участником.');
      return;
    }
    renderApplications(applications);
    setListState('success', 'Список получен с сервера.');
  } catch (error) {
    count.textContent = '—';
    setListState('error', `Не удалось загрузить заявки. ${error.message}`);
  } finally {
    refreshButton.disabled = false;
  }
}
function formValues() {
  const formData = new FormData(applicationForm);
  return {
    name: String(formData.get('name') || '').trim(),
    email: String(formData.get('email') || '').trim(),
    topic: formData.get('topic'),
  };
}
applicationForm.addEventListener('input', () => {
  applicationForm.elements.name.setCustomValidity('');
  applicationForm.elements.email.setCustomValidity('');
});
applicationForm.addEventListener('reset', () => {
  applicationForm.elements.name.setCustomValidity('');
  applicationForm.elements.email.setCustomValidity('');
});
applicationForm.addEventListener('submit', async event => {
  event.preventDefault();
  const application = formValues();
  if (!application.name || Array.from(application.name).length < 2 || Array.from(application.name).length > 60) {
    applicationForm.elements.name.setCustomValidity('Имя должно содержать от 2 до 60 символов');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(application.email)) {
    applicationForm.elements.email.setCustomValidity('Укажите email вида name@example.com');
  }
  if (!applicationForm.reportValidity()) return;
  submitButton.disabled = true;
  submitStatus.dataset.state = 'loading';
  submitStatus.textContent = 'Отправляем заявку…';
  try {
    const response = await fetch('/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(application),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || `HTTP ${response.status}`);
    submitStatus.dataset.state = 'success';
    submitStatus.textContent = `Заявка #${result.id} сохранена. Спасибо!`;
    await loadApplications();
  } catch (error) {
    submitStatus.dataset.state = 'error';
    submitStatus.textContent = `Заявка не отправлена. ${error.message}`;
  } finally {
    applicationForm.reset();
    submitButton.disabled = false;
  }
});
document.querySelector('#save-draft').addEventListener('click', () => {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(formValues()));
    draftStatus.textContent = 'Черновик сохранён в этом браузере.';
  } catch {
    draftStatus.textContent = 'Не удалось сохранить черновик: хранилище недоступно.';
  }
});
document.querySelector('#clear-draft').addEventListener('click', () => {
  applicationForm.reset();
  draftStatus.textContent = 'Черновик удалён.';
});
function restoreDraft() {
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if (!saved || typeof saved !== 'object') return;
    for (const key of ['name', 'email', 'topic']) {
      if (typeof saved[key] === 'string') applicationForm.elements[key].value = saved[key];
    }
    draftStatus.textContent = 'Восстановлен сохранённый черновик.';
  } catch {
    draftStatus.textContent = 'Не удалось прочитать черновик. Используйте сброс учебного стенда.';
  }
}
refreshButton.addEventListener('click', loadApplications);
restoreDraft();
mountLabControls();
loadApplications();
