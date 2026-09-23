'use strict';
// Frontend demo: replace analyzeDraft with a backend adapter when the API is ready.
const KEY = 'ai-sana-hub-v1';
const $ = id => document.getElementById(id);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const initial = () => ({ tasks: [], responses: [], builder: { draft: '', answers: ['', '', ''], card: null } });
let data = initial();
try {
  const saved = JSON.parse(localStorage.getItem(KEY));
  if (saved && Array.isArray(saved.tasks) && Array.isArray(saved.responses) && saved.builder && Array.isArray(saved.builder.answers)) data = saved;
} catch { /* Unavailable storage does not prevent using the demo. */ }
let storageWarning = false;
let toastTimer;
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4200); }
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); }
  catch { if (!storageWarning) { toast('Хранилище недоступно. Данные сохранятся только до закрытия страницы.'); storageWarning = true; } }
}
function id() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`; }
const status = score => score >= 90 ? ['Приоритетная','priority'] : score >= 70 ? ['Готовая','ready'] : score >= 40 ? ['Рабочая','working'] : ['Черновик','draft'];
const badge = score => `<span class="badge ${status(score)[1]}">${score}/100 · ${status(score)[0]}</span>`;
function scoreCard(card = {}) {
  const has = (field, min) => String(card[field] || '').trim().length >= min;
  const constraints = String(card.constraints || '');
  const criteria = [
    ['Понятное название', has('title',5) ? 10 : 0, 10],
    ['Контекст и проблема', has('description',20) ? 20 : 0, 20],
    ['Пользователь и потребность', has('audience',10) ? 15 : 0, 15],
    ['Ожидаемый результат', has('result',10) ? 20 : 0, 20],
    ['Измеримый критерий успеха', has('result',10) && /\d|процент|количество|не менее|не более|без ошибок|без потерь|конверси|метрик|критери|тест/iu.test(card.result) ? 15 : 0, 15],
    ['Данные и ограничения', has('constraints',10) ? 10 : 0, 10],
    ['Срок и способ связи', /дн|день|дней|недел|месяц|срок|дедлайн|\d{1,2}[./]\d{1,2}/iu.test(constraints) && /@|контакт|связ|куратор|почт|телефон|telegram|телеграм/iu.test(constraints) ? 10 : 0, 10]
  ];
  return { criteria, score: criteria.reduce((sum,item) => sum + item[1], 0) };
}
const fields = { title:'card-title', description:'card-preview', audience:'card-audience', result:'card-result', constraints:'card-constraints' };
function readCard() { return Object.fromEntries(Object.entries(fields).map(([key,element]) => [key,$(element).value.trim()])); }
function setCard(card) { for (const [key,element] of Object.entries(fields)) $(element).value = card[key] || ''; }
function renderScore() {
  const { score,criteria } = scoreCard(data.builder.card || {});
  $('score-val').textContent = score;
  $('status-val').textContent = status(score)[0]; $('status-val').className = `badge ${status(score)[1]}`;
  $('score-bar').style.width = `${score}%`;
  document.querySelector('.progress').setAttribute('aria-valuenow',score);
  $('criteria-list').innerHTML = criteria.map(([label,value,max]) => `<div class="criterion"><span>${label}</span><span>${value} / ${max}</span></div>`).join('');
}
function analyzeDraft(draft) { return { title:draft.split(/[.!?\n]/u)[0].slice(0,100).trim(), description:draft, audience:'', result:'', constraints:'' }; }
$('task-draft').value = data.builder.draft || '';
['audience','result','constraints'].forEach((key,i) => {
  $(`answer-${key}`).value = data.builder.answers[i] || '';
  $(`answer-${key}`).addEventListener('input', event => { data.builder.answers[i] = event.target.value; persist(); });
});
if (data.builder.card) { setCard(data.builder.card); $('ai-result').hidden = false; }
$('task-draft').addEventListener('input', event => { data.builder.draft = event.target.value; persist(); });
$('use-example').addEventListener('click', () => {
  $('task-draft').value = 'Наша кофейня принимает заказы в мессенджере. Заказы теряются, а сотрудники тратят время на повторяющиеся ответы. Нужен удобный сервис предзаказа.';
  data.builder.draft = $('task-draft').value; persist(); $('task-draft').focus(); toast('Пример добавлен. Нажмите «Анализировать ИИ».');
});
$('btn-analyze').addEventListener('click', () => {
  const draft = $('task-draft').value.trim();
  if (draft.length < 20) { $('builder-error').textContent = 'Опишите задачу подробнее — минимум 20 символов.'; $('task-draft').focus(); toast('Добавьте описание задачи: минимум 20 символов.'); return; }
  // Keep manual card edits intact when analysis is clicked again.
  if (data.builder.card) { toast('Карточка уже создана. Отредактируйте её поля ниже или обновите ответы.'); $('card-preview').focus(); return; }
  data.builder.draft = draft; data.builder.card = analyzeDraft(draft);
  $('builder-error').textContent = ''; $('ai-result').hidden = false; setCard(data.builder.card); renderScore(); persist();
  toast('Карточка создана. Ответьте на три вопроса.'); $('answer-audience').focus();
});
$('btn-recalc').addEventListener('click', () => {
  const answers = ['audience','result','constraints'].map(key => $(`answer-${key}`).value.trim());
  const incomplete = answers.findIndex(answer => answer.length < 10);
  if (incomplete !== -1) { toast('Каждый ответ должен содержать хотя бы 10 символов.'); $(`answer-${['audience','result','constraints'][incomplete]}`).focus(); return; }
  const before = scoreCard(data.builder.card).score;
  data.builder.answers = answers; data.builder.card = { ...readCard(), audience:answers[0], result:answers[1], constraints:answers[2] };
  setCard(data.builder.card); renderScore(); persist();
  toast(`Карточка обновлена. Рейтинг: ${before} → ${scoreCard(data.builder.card).score}/100.`);
});
$('publish-form').addEventListener('input', () => { data.builder.card = readCard(); renderScore(); persist(); });
$('publish-form').addEventListener('submit', event => {
  event.preventDefault();
  const card = readCard();
  if (card.title.length < 5 || card.description.length < 20 || [card.audience,card.result,card.constraints].some(v => v.length < 10)) { toast('Заполните все поля карточки содержательным текстом.'); return; }
  data.tasks.push({ ...card, id:id(), createdAt:new Date().toISOString(), score:scoreCard(card).score });
  data.builder = initial().builder;
  $('task-draft').value = ''; document.querySelectorAll('.answer-input').forEach(input => { input.value = ''; }); $('publish-form').reset(); $('ai-result').hidden = true;
  persist(); renderAll(); showTab('catalog'); toast('Задача опубликована в каталоге!');
});
function empty(title,description,target,label) { return `<div class="empty"><div class="empty-icon">↗</div><h3>${title}</h3><p>${description}</p>${target ? `<button class="button secondary" data-tab="${target}">${label}</button>` : ''}</div>`; }
function renderCatalog() {
  $('catalog-count').textContent = data.tasks.length;
  const tasks = [...data.tasks].sort((a,b) => b.score-a.score || b.createdAt.localeCompare(a.createdAt));
  $('catalog-list').innerHTML = tasks.length ? tasks.map(task => `<article class="task-card"><div class="card-top">${badge(task.score)}<small>БИЗНЕС → КОМАНДА</small></div><h3>${escapeHTML(task.title)}</h3><p class="summary">${escapeHTML(task.description.slice(0,180))}${task.description.length > 180 ? '…' : ''}</p><button class="button secondary" data-open="${escapeHTML(task.id)}">Подробнее и откликнуться ↗</button></article>`).join('') : empty('Здесь появятся реальные задачи','Создайте первую карточку в конструкторе и опубликуйте её.','builder','Создать задачу ↗');
}
let selectedTask = null;
function openTask(taskId) {
  const task = data.tasks.find(item => item.id === taskId); if (!task) return;
  selectedTask = taskId;
  $('task-detail').innerHTML = `<h2 id="detail-title">${escapeHTML(task.title)}</h2>${badge(task.score)}${[['Контекст и проблема',task.description],['Пользователи',task.audience],['Результат и критерий успеха',task.result],['Данные, ограничения, сроки и контакт',task.constraints]].map(([label,text]) => `<h4>${label}</h4><p class="detail-text">${escapeHTML(text)}</p>`).join('')}`;
  $('response-form').reset(); $('response-error').textContent = ''; $('task-dialog').showModal();
}
$('close-dialog').addEventListener('click', () => $('task-dialog').close());
function safeURL(value) { try { const url = new URL(value); return ['http:','https:'].includes(url.protocol) ? url.href : null; } catch { return null; } }
$('response-form').addEventListener('submit', event => {
  event.preventDefault();
  const team = $('team-name').value.trim(), idea = $('solution-idea').value.trim(), plan = $('solution-plan').value.trim(), link = safeURL($('prototype-url').value.trim());
  if (team.length < 2 || idea.length < 10 || plan.length < 10 || !link) { $('response-error').textContent = 'Заполните название, идею и план; укажите ссылку с https:// или http://.'; return; }
  if (!data.tasks.some(task => task.id === selectedTask)) { $('response-error').textContent = 'Задача не найдена. Откройте каталог заново.'; return; }
  if (data.responses.some(response => response.taskId === selectedTask && response.team.toLocaleLowerCase() === team.toLocaleLowerCase())) { $('response-error').textContent = 'Эта команда уже откликнулась на задачу. Статус доступен в кабинете команды.'; return; }
  data.responses.push({ id:id(), taskId:selectedTask, team, idea, plan, link, status:'pending', createdAt:new Date().toISOString() });
  persist(); $('task-dialog').close(); renderAll(); showTab('student'); toast('Отклик отправлен бизнесу. Ожидайте решения.');
});
const responseStatuses = { pending:'На рассмотрении', accepted:'Принят', rejected:'Отклонён' };
function responseHTML(response,business) {
  const task = data.tasks.find(item => item.id === response.taskId);
  const link = safeURL(response.link);
  return `<article class="response-card"><div class="response-title"><h3>${escapeHTML(response.team)}</h3><span class="badge ${response.status}">${responseStatuses[response.status]}</span></div><p class="muted">Задача: ${escapeHTML(task?.title || 'Задача недоступна')}</p><h4>Идея решения</h4><p>${escapeHTML(response.idea)}</p><h4>План реализации</h4><p>${escapeHTML(response.plan)}</p><h4>Прототип / GitHub</h4>${link ? `<a href="${escapeHTML(link)}" target="_blank" rel="noopener noreferrer">${escapeHTML(link)} ↗</a>` : '<p>Некорректная ссылка</p>'}${business ? `<div class="response-actions"><button class="button" data-decision="accepted" data-response="${escapeHTML(response.id)}" ${response.status === 'accepted' ? 'disabled' : ''}>Принять</button><button class="button reject" data-decision="rejected" data-response="${escapeHTML(response.id)}" ${response.status === 'rejected' ? 'disabled' : ''}>Отклонить</button></div>` : ''}</article>`;
}
function renderResponses() {
  $('response-count').textContent = data.responses.filter(response => response.status === 'pending').length;
  const filter = $('task-filter').value || 'all';
  $('task-filter').innerHTML = '<option value="all">Все задачи</option>' + data.tasks.map(task => `<option value="${escapeHTML(task.id)}">${escapeHTML(task.title)}</option>`).join('');
  $('task-filter').value = data.tasks.some(task => task.id === filter) ? filter : 'all';
  const responses = [...data.responses].reverse().filter(response => $('task-filter').value === 'all' || response.taskId === $('task-filter').value);
  $('responses-list').innerHTML = responses.length ? responses.map(response => responseHTML(response,true)).join('') : empty('Откликов пока нет','Команды смогут предложить решение из карточки в каталоге.','catalog','Открыть каталог ↗');
  $('student-list').innerHTML = data.responses.length ? [...data.responses].reverse().map(response => responseHTML(response,false)).join('') : empty('Ваше первое решение впереди','Выберите задачу и отправьте идею, план и ссылку на прототип.','catalog','Выбрать задачу ↗');
}
$('task-filter').addEventListener('change',renderResponses);
function renderAll() { renderScore(); renderCatalog(); renderResponses(); }
function showTab(name,focus = true) {
  if (!['builder','catalog','student','responses'].includes(name)) name = 'builder';
  document.querySelectorAll('.tab-content').forEach(section => { section.hidden = section.id !== `tab-${name}`; });
  document.querySelectorAll('.tabs button').forEach(button => { const active = button.dataset.tab === name; button.classList.toggle('active',active); if (active) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current'); });
  if (location.hash !== `#${name}`) history.replaceState(null,'',`#${name}`);
  if (focus) $(`${name}-title`).focus();
}
// Kept global for compatibility with the user's original onclick="showTab(...)" skeleton.
window.showTab = showTab;
 document.addEventListener('click',event => {
  const tabButton = event.target.closest('[data-tab]'); if (tabButton) { showTab(tabButton.dataset.tab); return; }
  const open = event.target.closest('[data-open]'); if (open) { openTask(open.dataset.open); return; }
  const decision = event.target.closest('[data-decision]');
  if (decision) {
    const response = data.responses.find(item => item.id === decision.dataset.response); if (!response) return;
    response.status = decision.dataset.decision; persist(); renderResponses(); toast(response.status === 'accepted' ? 'Вы приняли предложение команды.' : 'Вы отклонили предложение команды.');
  }
});
window.addEventListener('hashchange', () => showTab(location.hash.slice(1)));
renderAll(); showTab(location.hash.slice(1),false);
