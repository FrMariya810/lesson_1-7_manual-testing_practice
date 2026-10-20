import http from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const seedFile = path.join(projectRoot, 'backend/data/seed.json');
const runtimeDir = path.join(projectRoot, '.runtime');
const databaseFile = path.join(runtimeDir, 'db.json');
const version = 'workshop-1.0';
const portArgument = process.argv.indexOf('--port');
const port = Number(portArgument === -1 ? 3000 : process.argv[portArgument + 1]);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('Укажите порт от 1 до 65535: npm start -- --port 3001');
  process.exit(1);
}

mkdirSync(runtimeDir, { recursive: true });
function initialDatabase() {
  return { nextId: 4, applications: JSON.parse(readFileSync(seedFile, 'utf8')) };
}
let database;
try {
  database = existsSync(databaseFile)
    ? JSON.parse(readFileSync(databaseFile, 'utf8'))
    : initialDatabase();
  if (!Array.isArray(database.applications) || !Number.isInteger(database.nextId)) {
    throw new Error('Неверная структура базы');
  }
} catch (error) {
  console.error('Не удалось прочитать .runtime/db.json. Сохраните файл для диагностики и удалите его, чтобы восстановить исходные данные.');
  console.error(error.message);
  process.exit(1);
}
function saveDatabase() {
  const temporary = `${databaseFile}.tmp`;
  writeFileSync(temporary, JSON.stringify(database, null, 2) + '\n');
  renameSync(temporary, databaseFile);
}
saveDatabase();
let mode = 'normal';
let generation = 0;
const modes = new Set(['normal', 'delay', 'empty', 'error']);

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
function sendJson(response, status, data) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Lab-Version': version,
    'X-Lab-Mode': response.labMode || mode,
  });
  response.end(JSON.stringify(data, null, 2));
}
function errorJson(response, status, code, message) {
  sendJson(response, status, { error: { code, message } });
}
async function readJson(request) {
  if (!(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'CONTENT_TYPE', 'Нужен Content-Type: application/json');
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes <= 65536) chunks.push(chunk);
  }
  if (bytes > 65536) throw new HttpError(413, 'BODY_LIMIT', 'Тело запроса слишком большое');
  let value;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'Тело запроса должно содержать корректный JSON');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'INVALID_BODY', 'Ожидается JSON-объект');
  }
  return value;
}
function validateApplication(value) {
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  const email = typeof value.email === 'string' ? value.email.trim() : '';
  const topic = value.topic;
  if (Array.from(name).length < 2 || Array.from(name).length > 60) {
    throw new HttpError(400, 'INVALID_NAME', 'Имя должно содержать от 2 до 60 символов');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) {
    throw new HttpError(400, 'INVALID_EMAIL', 'Укажите email вида name@example.com');
  }
  if (!['html', 'javascript', 'api'].includes(topic)) {
    throw new HttpError(400, 'INVALID_TOPIC', 'Допустимые темы: html, javascript, api');
  }
  return { name, email, topic };
}
function createApplication(value) {
  const application = {
    id: String(database.nextId++),
    ...validateApplication(value),
    createdAt: new Date().toISOString(),
  };
  if (application.topic !== 'api') database.applications.push(application);
  saveDatabase();
  return application;
}
function findApplication(id) {
  const application = database.applications.find(item => item.id === id);
  if (!application) throw new HttpError(404, 'NOT_FOUND', 'Заявка не найдена');
  const result = { ...application };
  if (id === '3') delete result.email;
  return result;
}

const staticFiles = new Map([
  ['/', ['frontend/index.html', 'text/html']],
  ['/index.html', ['frontend/index.html', 'text/html']],
  ['/api-lab.html', ['frontend/api-lab.html', 'text/html']],
  ['/styles.css', ['frontend/styles.css', 'text/css']],
  ['/script.js', ['frontend/script.js', 'text/javascript']],
  ['/lab.js', ['frontend/lab.js', 'text/javascript']],
  ['/api-lab.js', ['frontend/api-lab.js', 'text/javascript']],
  ['/CONTRACT.md', ['CONTRACT.md', 'text/plain']],
  ['/TASKS.md', ['TASKS.md', 'text/plain']],
]);

const server = http.createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const method = request.method;
    // Учебные управляющие маршруты не зависят от режима ошибок продукта.
    if (pathname === '/lab/state' && method === 'GET') {
      return sendJson(response, 200, { version, mode, count: database.applications.length, generation });
    }
    if (pathname === '/lab/config' && method === 'POST') {
      const body = await readJson(request);
      if (!modes.has(body.mode)) throw new HttpError(400, 'INVALID_MODE', 'Неизвестный режим');
      mode = body.mode;
      return sendJson(response, 200, { version, mode });
    }
    if (pathname === '/lab/reset' && method === 'POST') {
      await readJson(request);
      database = initialDatabase();
      mode = 'normal';
      generation++;
      saveDatabase();
      return sendJson(response, 200, { version, mode, count: 3, generation });
    }
    if (pathname === '/applications' || pathname.startsWith('/applications/')) {
      const currentGeneration = generation;
      const requestMode = mode;
      response.labMode = requestMode;
      if (requestMode === 'delay') await new Promise(resolve => setTimeout(resolve, 1500));
      if (generation !== currentGeneration) {
        throw new HttpError(409, 'RESET_DURING_REQUEST', 'Стенд был сброшен. Повторите запрос.');
      }
      if (requestMode === 'error') {
        return errorJson(response, 500, 'SIMULATED_FAILURE', 'Учебный режим: сервер временно недоступен');
      }
      if (pathname === '/applications' && method === 'GET') {
        return sendJson(response, 200, requestMode === 'empty' ? [] : database.applications);
      }
      if (pathname === '/applications' && method === 'POST') {
        const body = await readJson(request);
        if (generation !== currentGeneration) {
          throw new HttpError(409, 'RESET_DURING_REQUEST', 'Стенд был сброшен. Повторите запрос.');
        }
        const validated = validateApplication(body);
        return sendJson(response, 201, createApplication(validated));
      }
      if (/^\/applications\/[^/]+$/.test(pathname) && method === 'GET') {
        return sendJson(response, 200, findApplication(decodeURIComponent(pathname.split('/')[2])));
      }
      return errorJson(response, 405, 'METHOD_NOT_ALLOWED', 'Для ресурса доступны GET, для коллекции GET и POST');
    }
    if (pathname === '/favicon.ico') {
      response.writeHead(204);
      return response.end();
    }
    const file = staticFiles.get(pathname);
    if (file && method === 'GET') {
      response.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8`, 'Cache-Control': 'no-store' });
      return response.end(readFileSync(path.join(projectRoot, file[0])));
    }
    return errorJson(response, 404, 'NOT_FOUND', 'Маршрут не найден');
  } catch (error) {
    if (response.headersSent || response.destroyed) return;
    if (!(error instanceof HttpError)) console.error(error);
    errorJson(response, error.status || 500, error.code || 'INTERNAL_ERROR', error.status ? error.message : 'Внутренняя ошибка сервера');
  }
});

server.on('error', error => {
  console.error(error.code === 'EADDRINUSE'
    ? `Порт ${port} занят. Остановите старый процесс или выполните: npm start -- --port ${port + 1}`
    : error.message);
  process.exit(1);
});
server.listen(port, '127.0.0.1', () => {
  console.log(`Веб-мастерская · ${version}`);
  console.log(`Приложение: http://localhost:${port}`);
  console.log(`API-лаборатория: http://localhost:${port}/api-lab.html`);
  console.log(`API: http://localhost:${port}/applications`);
  console.log('Остановка: Ctrl+C. Данные сохраняются в .runtime/db.json.');
});
