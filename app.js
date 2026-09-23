'use strict';
const CARD_FIELDS = [
 ['title','Название','Назовите задачу коротко и понятно.'],
 ['context','Контекст','Опишите текущий процесс и ситуацию.'],
 ['need','Потребность','Что нужно изменить и почему?'],
 ['users','Пользователи','Кто будет пользоваться решением?'],
 ['materials','Данные и материалы','Какие данные, примеры или источники доступны?'],
 ['constraints','Ограничения','Сроки, технологии, доступы и другие границы.'],
 ['outcome','Ожидаемый результат','Что именно должна подготовить команда?'],
 ['success','Критерии успеха','Укажите проверяемые признаки принятия результата.'],
 ['contact','Контакт','Email, ссылка HTTPS или телефон в международном формате.'],
 ['interaction','Формат взаимодействия','Как будут проходить консультации и обратная связь?']
];
function cardOf(task) {
 return Object.fromEntries(CARD_FIELDS.map(([key]) => [key,String(task.card?.[key] ?? (key === 'title' ? task.title : key === 'context' ? task.description : '') ?? '')]));
}
function contactValid(value) {
 if (!value.trim()) return true;
 return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || /^\+?[\d ()-]{7,25}$/.test(value) || validLink(value);
}
function validLink(value) { try { const u = new URL(value); return ['http:','https:'].includes(u.protocol) && Boolean(u.hostname) && !u.username && !u.password; } catch { return false; } }
function cardErrors(card) {
 const errors = [];
 if (!card.title.trim()) errors.push(['title','Укажите название задачи.']);
 if (card.title.length > 120) errors.push(['title','Название не должно превышать 120 символов.']);
 if (!contactValid(card.contact)) errors.push(['contact','Укажите корректный email, ссылку http:// или https:// либо номер телефона.']);
 for (const [key,label] of CARD_FIELDS) {
  if (key !== 'contact' && /(?:https?:\/\/|www\.|[a-z]+:\/\/)/i.test(card[key])) {
   const links = card[key].match(/(?:[a-z]+:\/\/|www\.)[^\s]+/gi) || [];
   if (links.some(link => !validLink(link.replace(/[.,;!?]+$/, '')))) errors.push([key,`В поле «${label}» некорректная ссылка. Используйте полный адрес http:// или https://.`]);
  }
 }
 return errors;
}
function rating(card) {
 const filled = key => Boolean(card[key]?.trim()) && !/^(пока )?(неизвестно|не знаю|не указано|нет данных|уточнить|не определено)[.!]?$/i.test(card[key].trim());
 const sections = [
  ['Контекст и потребность',20,['context','need'],'Опишите текущую ситуацию и желаемое изменение.'],
  ['Данные и материалы',20,['materials'],'Укажите доступные материалы или объясните, как их получить.'],
  ['Ожидаемый результат',15,['outcome'],'Опишите конкретный результат работы команды.'],
  ['Критерии успеха',15,['success'],'Добавьте измеримый показатель или проверяемое условие приёмки.'],
  ['Ограничения',10,['constraints'],'Укажите сроки, технологии и ограничения доступа.'],
  ['Пользователи',10,['users'],'Опишите, для кого создаётся решение.'],
  ['Связь с бизнесом',10,['contact','interaction'],'Добавьте корректный контакт и порядок обратной связи.']
 ].map(([label,max,keys,tip]) => ({label,max,keys,tip,points:keys.reduce((sum,key) => sum+(filled(key) && (key !== 'contact' || contactValid(card.contact)) ? max/keys.length : 0),0)}));
 const score = sections.reduce((sum,item) => sum+item.points,0);
 const level = score < 40 ? 'Черновик' : score < 70 ? 'Рабочая' : score < 90 ? 'Готовая' : 'Приоритетная';
 return {score,level,sections,missing:CARD_FIELDS.filter(([key]) => key !== 'title' && (!filled(key) || key === 'contact' && !contactValid(card.contact))).map(([,label]) => label)};
}
function editor(task) {
 const card = cardOf(task);
 $('detail-content').innerHTML = `<div class="editor-heading"><p class="eyebrow">КАРТОЧКА ЗАДАЧИ</p><h1 class="responses-heading" tabindex="-1">Уточните задачу. Откройте возможности.</h1><p class="data-note">Заполните известные сведения и подтвердите карточку перед публикацией. Низкий рейтинг не ограничивает публикацию.</p></div><div class="card-workspace"><section class="edit-panel full-editor"><form id="card-form" novalidate>${CARD_FIELDS.map(([key,label,hint]) => `<label for="field-${key}">${label}${key === 'title' ? ' *' : ''}</label>${key === 'title' || key === 'contact' ? `<input id="field-${key}" maxlength="${key === 'title' ? 120 : 1000}" value="${esc(card[key])}" ${key === 'title' ? 'required' : ''} aria-describedby="hint-${key}">` : `<textarea id="field-${key}" maxlength="5000" rows="3" aria-describedby="hint-${key}">${esc(card[key])}</textarea>`}<p class="field-help" id="hint-${key}">${hint}</p>`).join('')}${task.clarifications?.length ? `<details class="draft-summary"><summary>Ответы на уточняющие вопросы</summary>${task.clarifications.map(item => `<p><strong>${esc(item.question)}</strong><br>${esc(item.answer)}</p>`).join('')}</details>` : ''}<p id="card-errors" class="form-error" role="alert"></p><div class="card-controls"><button type="button" class="outline-button" id="recalculate">Пересчитать</button><button type="button" class="outline-button" id="save-card">Сохранить черновик</button><button type="button" class="outline-button" id="confirm-card">Подтвердить карточку</button><button type="submit" class="role-button business-button">Опубликовать ↗</button></div><p id="version-status" class="data-note" role="status"></p></form></section><aside id="rating-panel" class="rating-panel"></aside></div>`;
 const read = () => Object.fromEntries(CARD_FIELDS.map(([key]) => [key,$(`field-${key}`).value]));
 const fingerprint = value => JSON.stringify(value);
 const refresh = () => {
  const current = read(), info = rating(current);
  const confirmed = task.confirmedVersion === fingerprint(current);
  $('version-status').textContent = confirmed ? 'Эта версия карточки подтверждена.' : 'Текущая версия не подтверждена. Перед публикацией нажмите «Подтвердить карточку».';
  $('rating-panel').innerHTML = `<p class="eyebrow">РЕЙТИНГ ГОТОВНОСТИ</p><div class="rating-number">${info.score}<small>/ 100</small></div><span class="state-badge">${info.level}</span><p class="field-help">${confirmed ? 'Оценка подтверждённой версии' : 'Предварительная оценка текущих полей'}</p><progress max="100" value="${info.score}" aria-label="Рейтинг готовности"></progress><div class="rating-sections">${info.sections.map(s => `<div><span>${s.label}</span><strong>${s.points} / ${s.max}</strong></div>`).join('')}</div><h2>Недостающие сведения</h2>${info.missing.length ? `<ul>${info.missing.map(label => `<li>${label}</li>`).join('')}</ul>` : '<p>Все разделы заполнены.</p>'}<h2>Как улучшить карточку</h2><ul>${info.sections.filter(s => s.points < s.max).map(s => `<li>${s.tip}</li>`).join('') || '<li>Проверьте точность сведений и согласуйте условия приёмки.</li>'}</ul><p class="field-help">Баллы начисляются за заполненные разделы. Это оценка полноты, а не экспертная проверка содержания.</p>`;
 };
 const validate = () => {
  const errors = cardErrors(read());
  CARD_FIELDS.forEach(([key]) => $(`field-${key}`).removeAttribute('aria-invalid'));
  $('card-errors').textContent = errors.map(([,message]) => message).join(' ');
  errors.forEach(([key]) => $(`field-${key}`).setAttribute('aria-invalid','true'));
  if(errors.length) $(`field-${errors[0][0]}`).focus();
  return !errors.length;
 };
 const persistCard = mode => {
  const current = read();
  task.card = current; task.title = current.title; task.description = current.context;
  task.score = rating(current).score;
  task.status = mode;
  if (mode === 'draft') task.confirmedVersion = null;
  return save();
 };
 $('card-form').addEventListener('input',() => { $('card-errors').textContent = ''; refresh(); });
 $('recalculate').addEventListener('click',() => { refresh(); toast('Рейтинг пересчитан по текущим полям.'); });
 $('save-card').addEventListener('click',() => { if(!validate()) return; if(persistCard('draft')) toast('Черновик сохранён.'); refresh(); });
 $('confirm-card').addEventListener('click',() => {
  if(!validate()) return;
  task.confirmedVersion = fingerprint(read());
  task.confirmedSnapshot = {...read()};
  if(persistCard('confirmed')) toast('Текущая версия карточки подтверждена.');
  refresh();
 });
 $('card-form').addEventListener('submit',event => {
  event.preventDefault(); if(!validate()) return;
  if(task.confirmedVersion !== fingerprint(read())) { $('card-errors').textContent = 'Подтвердите текущую версию карточки перед публикацией.'; $('confirm-card').focus(); return; }
  task.publishedTopic = task.topic || ''; task.publishedCard = {...read()}; task.publishedScore = rating(read()).score; task.publishedAt = new Date().toISOString();
  const saved = persistCard('published');
  location.hash = `task/${encodeURIComponent(task.id)}`;
  if(saved) toast('Задача опубликована и доступна в общем каталоге.');
 });
 refresh();
}
function publishedTasks() { return tasks.filter(t => t.publishedCard || t.status === 'published'); }
const catalogState = { topic: '', level: '', sort: 'desc' };
function catalogLevel(score) {
 return score < 40 ? {key:'draft',label:'Черновик'} : score < 70 ? {key:'working',label:'Рабочая'} : score < 90 ? {key:'ready',label:'Готовая'} : {key:'priority',label:'Приоритетная'};
}
function catalogEntries() {
 return publishedTasks().map(task => {
  const card = task.publishedCard || cardOf(task);
  const rawScore = task.publishedScore ?? task.score ?? 0;
  const score = Number.isFinite(rawScore) ? Math.min(100,Math.max(0,rawScore)) : 0;
  return {task,card,score,level:catalogLevel(score),topic:String(task.publishedTopic ?? task.topic ?? '').trim() || 'Без темы'};
 });
}
function filterCatalog(entries,filters) {
 return entries.filter(entry => (!filters.topic || entry.topic === filters.topic) && (!filters.level || entry.level.key === filters.level))
  .sort((a,b) => (filters.sort === 'asc' ? a.score-b.score : b.score-a.score) || a.card.title.localeCompare(b.card.title,'ru'));
}
function renderCatalog() {
 const entries = catalogEntries();
 const topics = [...new Set(entries.map(entry => entry.topic))].sort((a,b) => a.localeCompare(b,'ru'));
 if (!topics.includes(catalogState.topic)) catalogState.topic = '';
 $('detail-content').innerHTML = `<div class="catalog-hero"><div><p class="eyebrow">БИЗНЕС × КОМАНДЫ</p><h1 tabindex="-1">Найдите задачу,<br><em>которая вам интересна.</em></h1><p>Реальные потребности бизнеса и пространство для ваших решений.<br>Все опубликованные задачи открыты для бизнеса и команд.</p></div><div class="catalog-emblem" aria-hidden="true">✳</div></div><div class="catalog-toolbar"><div><label for="catalog-topic">Тема или отрасль</label><select id="catalog-topic"><option value="">Все темы</option>${topics.map(topic => `<option value="${esc(topic)}" ${catalogState.topic === topic ? 'selected' : ''}>${esc(topic)}</option>`).join('')}</select></div><div><label for="catalog-level">Уровень готовности</label><select id="catalog-level"><option value="">Все уровни</option>${[['draft','Черновик · 0–39'],['working','Рабочая · 40–69'],['ready','Готовая · 70–89'],['priority','Приоритетная · 90–100']].map(([key,label]) => `<option value="${key}" ${catalogState.level === key ? 'selected' : ''}>${label}</option>`).join('')}</select></div><div><label for="catalog-sort">Сортировка</label><select id="catalog-sort"><option value="desc" ${catalogState.sort === 'desc' ? 'selected' : ''}>Сначала высокий рейтинг</option><option value="asc" ${catalogState.sort === 'asc' ? 'selected' : ''}>Сначала низкий рейтинг</option></select></div><button id="catalog-reset" class="outline-button" type="button">Сбросить</button></div><div class="catalog-result-bar"><p id="catalog-count" role="status" aria-live="polite"></p><span>Низкий рейтинг — повод уточнить детали, а не ограничение доступа.</span></div><div id="catalog-grid" class="catalog-grid"></div>`;
 const update = () => {
  catalogState.topic = $('catalog-topic').value;
  catalogState.level = $('catalog-level').value;
  catalogState.sort = $('catalog-sort').value;
  const visible = filterCatalog(entries,catalogState);
  $('catalog-count').textContent = `Показано ${visible.length} из ${entries.length}`;
  $('catalog-grid').innerHTML = visible.map(({task,card,score,level,topic}) => `<article class="catalog-card"><div class="catalog-card-top"><span class="topic-chip">${esc(topic)}</span>${task.demo ? '<span class="demo-tag">ДЕМО</span>' : ''}</div><div class="catalog-score"><strong>${score}<small>/100</small></strong><span class="readiness-badge ${level.key}">${level.label}</span></div><div class="score-track" aria-hidden="true"><span style="width:${score}%"></span></div><h2>${esc(card.title)}</h2><p class="catalog-summary">${esc((card.context || 'Описание пока не добавлено.').slice(0,190))}${card.context?.length > 190 ? '…' : ''}</p><div class="catalog-card-bottom">${score < 40 ? '<span class="clarification-badge">Требует уточнения</span>' : '<span class="open-label">Открыта для команд</span>'}<a class="small-button" href="#task/${encodeURIComponent(task.id)}" aria-label="Подробнее: ${esc(card.title)}">Подробнее <span aria-hidden="true">↗</span></a></div></article>`).join('') || (entries.length ? empty('По вашим фильтрам задач нет','Выберите другую тему или уровень готовности либо нажмите «Сбросить».') : empty('Каталог ждёт первых задач','Подтвердите и опубликуйте карточку в кабинете бизнеса — она появится здесь.'));
 };
 ['catalog-topic','catalog-level','catalog-sort'].forEach(id => $(id).addEventListener('change',update));
 $('catalog-reset').addEventListener('click',() => { $('catalog-topic').value = ''; $('catalog-level').value = ''; $('catalog-sort').value = 'desc'; update(); });
 update();
}
function renderPublished(rawId) {
 let id; try {id = decodeURIComponent(rawId || '');} catch {id = '';}
 const task = publishedTasks().find(t => t.id === id);
 if(!task) { $('detail-content').innerHTML = empty('Задача не опубликована','Вернитесь в кабинет или откройте общий каталог.'); return; }
 const card = task.publishedCard || cardOf(task);
 $('detail-content').innerHTML = `<a class="back-link" href="#catalog">← Общий каталог</a><section class="edit-panel"><p class="eyebrow">ОПУБЛИКОВАННАЯ ЗАДАЧА</p><h1 class="responses-heading" tabindex="-1">${esc(card.title)}</h1><p class="state-badge published">Рейтинг: ${task.publishedScore ?? task.score ?? 0}/100</p>${CARD_FIELDS.filter(([key]) => key !== 'title').map(([key,label]) => `<h2 class="published-label">${label}</h2><p class="published-value">${esc(card[key]) || 'Пока не указано'}</p>`).join('')}<a class="small-button" href="#edit/${encodeURIComponent(task.id)}">Редактировать карточку</a></section>`;
}

'use strict';
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const KEY = 'ai-sana-business-dashboard-v1';
const statusLabels = { draft:'Черновик', confirmed:'Подтверждена', published:'Опубликована' };
let tasks = [];
try { const saved = JSON.parse(localStorage.getItem(KEY)); if (Array.isArray(saved)) tasks = saved.filter(t => t && typeof t.id === 'string' && typeof t.title === 'string' && statusLabels[t.status] && Array.isArray(t.responses)); } catch { /* Work without persistence if necessary. */ }
let timer;
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(timer); timer = setTimeout(() => { $('toast').hidden = true; },4000); }
function save() { try { localStorage.setItem(KEY,JSON.stringify(tasks)); return true; } catch { toast('Не удалось сохранить в браузере. Данные доступны до перезагрузки.'); return false; } }
function empty(title,text) { return `<div class="empty-box"><h3>${title}</h3><p>${text}</p></div>`; }
function renderBusiness() {
  $('total-tasks').textContent = tasks.length;
  $('published-tasks').textContent = tasks.filter(t => t.status === 'published').length;
  $('total-responses').textContent = tasks.reduce((total,t) => total + t.responses.length,0);
  $('load-demo').disabled = tasks.some(t => t.demo);
  $('load-demo').textContent = tasks.some(t => t.demo) ? 'Демо-задачи загружены' : 'Загрузить демо-задачи';
  $('business-tasks').innerHTML = tasks.length ? tasks.map(t => `<article class="task-item"><div class="task-top"><span class="state-badge ${t.status}">${statusLabels[t.status]}</span>${t.demo ? '<span class="demo-tag">ДЕМО-ПРИМЕР</span>' : ''}</div><h3>${esc(t.title)}</h3><p>${esc(t.description)}</p><div class="task-meta"><span>Рейтинг: <strong>${Number.isFinite(t.score) ? `${t.score}/100` : 'ещё не рассчитан'}</strong></span><span>Откликов: <strong>${t.responses.length}</strong></span></div><div class="task-actions"><a class="small-button" href="#edit/${encodeURIComponent(t.id)}">Редактировать</a><a class="small-button" href="#responses/${encodeURIComponent(t.id)}">Посмотреть отклики (${t.responses.length})</a></div></article>`).join('') : `${empty('Пока нет задач','Создайте первый черновик или загрузите демо-примеры, чтобы посмотреть кабинет.')}<p><a class="small-button" href="#draft">+ Создать задачу</a></p>`;
}
function responses(task) {
  $('detail-content').innerHTML = `<p class="eyebrow">ПРЕДЛОЖЕНИЯ КОМАНД</p><h1 class="responses-heading" tabindex="-1">Отклики на задачу</h1><p class="dashboard-subtitle">${esc(task.title)}</p>${task.responses.length ? `<div class="task-list">${task.responses.map(r => `<article class="task-item"><span class="demo-tag">${task.demo ? 'ДЕМО-ПРИМЕР' : 'ПРЕДЛОЖЕНИЕ'}</span><h3>${esc(r.team)}</h3><p><strong>Идея решения</strong><br>${esc(r.idea)}</p><p><strong>План реализации</strong><br>${esc(r.plan)}</p></article>`).join('')}</div>` : empty('Откликов пока нет','Когда команды отправят предложения, они появятся здесь.')}`;
}
function route(focus = true) {
  cancelAnalysis();
  const [name,rawId] = location.hash.slice(1).split('/');
  $('home-screen').hidden = Boolean(name);
  $('business-screen').hidden = name !== 'business';
  $('detail-screen').hidden = !['draft','edit','responses','catalog','task'].includes(name);
  $('navigation-status').hidden = true;
  $('navigation-status').textContent = 'Общий каталог ещё не подключён.';
  if (name === 'catalog') renderCatalog();
  else if (name === 'task') renderPublished(rawId);
  else if (name === 'business') renderBusiness();
  else if (name === 'draft') renderDraft();
  else if (name === 'edit' || name === 'responses') {
    let taskId; try { taskId = decodeURIComponent(rawId || ''); } catch { taskId = ''; }
    const task = tasks.find(t => t.id === taskId);
    if (!task) $('detail-content').innerHTML = empty('Задача не найдена','Вернитесь в кабинет и выберите задачу из списка.');
    else if (name === 'edit') editor(task); else responses(task);
  } else if (name !== 'catalog') $('home-screen').hidden = false;
  document.title = name === 'catalog' ? 'Каталог задач — AI Sana' : name === 'task' ? 'Опубликованная задача — AI Sana' : name === 'business' ? 'Кабинет бизнеса — AI Sana' : name === 'draft' ? 'Новый черновик — AI Sana' : name === 'edit' ? 'Редактор задачи — AI Sana' : name === 'responses' ? 'Отклики — AI Sana' : 'AI Sana — выберите роль';
  if (focus) { const heading = document.querySelector('main:not([hidden]) h1'); if (heading) { heading.setAttribute('tabindex','-1'); heading.focus(); } }
}
$('load-demo').addEventListener('click',() => {
  if (tasks.some(t => t.demo)) return;
  tasks.push(
    {id:'demo-draft',title:'Автоматизация записи клиентов',description:'Хотим упростить запись клиентов в салон и сократить число пропущенных обращений.',status:'draft',score:30,demo:true,responses:[]},
    {id:'demo-confirmed',title:'Панель учёта остатков',description:'Нужен прототип панели для контроля остатков товаров на небольшом складе.',status:'confirmed',score:75,demo:true,responses:[]},
    {id:'demo-published',title:'Сервис предзаказа для кофейни',description:'Помогите клиентам заранее заказывать напитки, а сотрудникам — видеть очередь заказов.',status:'published',score:90,demo:true,responses:[{team:'Команда «Импульс»',idea:'Веб-форма заказа с выбором времени получения.',plan:'Изучить меню, собрать прототип, проверить его на тестовых заказах.'},{team:'Команда «Вектор»',idea:'Простой бот для оформления предзаказов.',plan:'Согласовать сценарий, реализовать меню и очередь, провести демонстрацию.'}]}
  );
  const saved = save(); renderBusiness(); if(saved) toast('Добавлены три демо-задачи. Рейтинги и отклики — тестовые.');
});
document.querySelectorAll('[data-role]').forEach(link => link.addEventListener('click',() => document.dispatchEvent(new CustomEvent('app:navigate',{detail:{role:link.dataset.role,route:link.dataset.role === 'business' ? 'business' : 'catalog'}}))));
window.addEventListener('hashchange',() => route());


// Screen 3: one draft, two sequential states. Only questions use the AI API.
const WIZARD_KEY = 'ai-sana-draft-wizard-v1';
let wizard = {description:'',topic:'',questions:[],answers:[],phase:'input',source:'',analyzedText:''};
try {
  const value = JSON.parse(localStorage.getItem(WIZARD_KEY));
  if (value && typeof value.description === 'string' && typeof value.topic === 'string' && Array.isArray(value.questions) && value.questions.length <= 10 && value.questions.every(q => typeof q === 'string') && Array.isArray(value.answers) && value.answers.every(a => typeof a === 'string')) {
    wizard = {...wizard,...value};
    if (wizard.phase !== 'questions' || wizard.questions.length < 3) wizard.phase = 'input';
  }
} catch { /* Draft remains available in memory. */ }
let analysisController = null;
let analysisVersion = 0;
function cancelAnalysis() { analysisVersion++; if(analysisController) analysisController.abort(); analysisController = null; }
function storeWizard() { try { localStorage.setItem(WIZARD_KEY,JSON.stringify(wizard)); } catch { /* No server dependency for a draft. */ } }
function renderDraft() {
  const questions = wizard.phase === 'questions';
  $('detail-content').innerHTML = `<section class="edit-panel wizard-panel"><p class="eyebrow">СОЗДАНИЕ ЗАДАЧИ · ШАГ ${questions ? '2' : '1'} ИЗ 2</p><div class="wizard-steps"><span class="${questions ? '' : 'current'}">01 Описание</span><span aria-hidden="true">→</span><span class="${questions ? 'current' : ''}">02 Уточнения</span></div><h1 tabindex="-1">${questions ? 'Давайте уточним детали' : 'Расскажите о вашей задаче'}</h1><p class="data-note">${questions ? 'Ответьте на каждый вопрос. Ваши ответы попадут в редактируемую карточку без добавления неизвестных фактов.' : 'Опишите проблему своими словами. Система проанализирует описание и предложит уточняющие вопросы.'}</p>${questions ? questionsHTML() : inputHTML()}</section>`;
  if (questions) {
    $('questions-form').addEventListener('input',() => { wizard.answers = wizard.questions.map((_,i) => $(`answer-${i}`).value); storeWizard(); });
    $('back-description').addEventListener('click',() => { wizard.phase = 'input'; storeWizard(); renderDraft(); $('draft-description').focus(); });
    $('questions-form').addEventListener('submit',formCard);
  } else {
    $('analysis-form').addEventListener('input',() => { wizard.description = $('draft-description').value; wizard.topic = $('draft-topic').value; $('analysis-error').hidden = true; $('standard-questions').hidden = true; storeWizard(); });
    $('analysis-form').addEventListener('submit',analyze);
    $('standard-questions').addEventListener('click',standardQuestions);
  }
}
function inputHTML() {
  return `<form id="analysis-form" novalidate><label for="draft-description">Описание задачи</label><textarea id="draft-description" rows="9" maxlength="4000" placeholder="Например: у нас кофейня, заказы поступают в мессенджер и иногда теряются. Хотим упростить приём заказов." required>${esc(wizard.description)}</textarea><label for="draft-topic">Тема или отрасль</label><input id="draft-topic" maxlength="100" placeholder="Например: общепит, образование, логистика" value="${esc(wizard.topic)}" required><p class="data-note">Для анализа нужно не менее 20 символов в описании. Текст будет отправлен в подключённый сервис анализа.</p><div id="analysis-loading" class="analysis-loading" role="status" hidden><span class="spinner" aria-hidden="true"></span>AI анализирует задачу и готовит вопросы…</div><p id="analysis-error" class="form-error" role="alert" hidden></p><div class="wizard-actions"><button id="analyze-button" class="role-button business-button" type="submit">Проанализировать <span>✳</span></button><button id="standard-questions" class="outline-button" type="button" hidden>Использовать стандартные вопросы</button></div></form>`;
}
function questionsHTML() {
  return `<div class="notice-panel">${wizard.source === 'ai' ? 'Вопросы подготовлены AI.' : 'Используются стандартные вопросы, без AI.'}</div><details class="draft-summary"><summary>Ваше описание · ${esc(wizard.topic)}</summary><p>${esc(wizard.description)}</p></details><form id="questions-form" novalidate>${wizard.questions.map((q,i) => `<label for="answer-${i}"><span class="question-number">0${i+1}</span> ${esc(q)}</label><textarea id="answer-${i}" rows="3" maxlength="2000" required placeholder="Ваш ответ…">${esc(wizard.answers[i] || '')}</textarea>`).join('')}<p id="answers-error" class="form-error" role="alert"></p><div class="wizard-actions"><button class="role-button business-button" type="submit">Сформировать карточку →</button><button class="outline-button" id="back-description" type="button">← Вернуться к описанию</button></div></form>`;
}
async function analyze(event) {
  event.preventDefault();
  wizard.description = $('draft-description').value;
  wizard.topic = $('draft-topic').value;
  if (wizard.description.trim().length < 20 || !wizard.topic.trim()) {
    $('analysis-error').hidden = false; $('analysis-error').textContent = 'Укажите тему и описание задачи длиной не менее 20 символов.';
    (wizard.description.trim().length < 20 ? $('draft-description') : $('draft-topic')).focus(); return;
  }
  const fingerprint = JSON.stringify([wizard.description.trim(),wizard.topic.trim()]);
  if (wizard.analyzedText === fingerprint && wizard.questions.length >= 3) { wizard.phase = 'questions'; storeWizard(); renderDraft(); return; }
  cancelAnalysis(); const version = analysisVersion;
  analysisController = new AbortController(); const controller = analysisController;
  const timeout = setTimeout(() => controller.abort(),45000);
  $('analysis-error').hidden = true; $('standard-questions').hidden = true;
  $('analysis-loading').hidden = false; $('analysis-form').setAttribute('aria-busy','true');
  ['analyze-button','draft-description','draft-topic'].forEach(id => { $(id).disabled = true; });
  try {
    const response = await fetch('/api/questions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({task:`Тема: ${wizard.topic.trim()}\n${wizard.description.trim()}`}),signal:controller.signal});
    if (!response.ok) throw new Error('service');
    const body = await response.json();
    if (!Array.isArray(body.questions) || body.questions.length < 3 || body.questions.length > 10 || body.questions.some(q => typeof q !== 'string' || !q.trim() || q.length > 1000) || new Set(body.questions.map(q => q.trim())).size !== body.questions.length) throw new Error('format');
    if (version !== analysisVersion) return;
    if (body.mode === 'fallback') throw new Error('fallback');
    wizard.questions = body.questions.map(q => q.trim()); wizard.answers = wizard.questions.map(() => ''); wizard.source = body.mode === 'ai' ? 'ai' : 'standard'; wizard.phase = 'questions'; wizard.analyzedText = fingerprint;
    storeWizard(); renderDraft(); $('answer-0').focus();
  } catch (error) {
    if (version !== analysisVersion || location.hash !== '#draft') return;
    $('analysis-error').hidden = false;
    $('analysis-error').textContent = error.name === 'AbortError' ? 'Анализ занял слишком много времени. Повторите запрос или используйте стандартные вопросы.' : error.message === 'format' ? 'Сервис вернул некорректные вопросы. Повторите запрос или используйте стандартные вопросы.' : 'Не удалось получить AI-вопросы. Проверьте подключение сервиса, повторите запрос или используйте стандартные вопросы.';
    $('standard-questions').hidden = false;
  } finally {
    clearTimeout(timeout);
    if (version === analysisVersion) {
      analysisController = null;
      if ($('analysis-form')) { $('analysis-loading').hidden = true; $('analysis-form').removeAttribute('aria-busy'); ['analyze-button','draft-description','draft-topic'].forEach(id => { $(id).disabled = false; }); }
    }
  }
}
function standardQuestions() {
  wizard.questions = [
    `Кто будет пользоваться решением в сфере «${wizard.topic.trim()}» и какую проблему нужно решить?`,
    'Какой результат вы ожидаете и по каким измеримым признакам поймёте, что задача решена?',
    'Какие данные и материалы доступны? Какие есть ограничения, сроки и способ связи с бизнесом?'
  ];
  wizard.answers = ['','','']; wizard.source = 'standard'; wizard.phase = 'questions'; wizard.analyzedText = JSON.stringify([wizard.description.trim(),wizard.topic.trim()]);
  storeWizard(); renderDraft(); $('answer-0').focus();
}
function formCard(event) {
  event.preventDefault();
  wizard.answers = wizard.questions.map((_,i) => $(`answer-${i}`).value.trim());
  const missing = wizard.answers.findIndex(a => a.length < 2);
  if (missing !== -1) { $('answers-error').textContent = 'Ответьте на каждый вопрос: минимум два символа. Если сведений нет, укажите «Пока неизвестно».'; $(`answer-${missing}`).focus(); return; }
  const task = {id:Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8),title:wizard.description.trim().split(/[.!?\n]/)[0].slice(0,120) || wizard.topic.trim(),description:wizard.description.trim(),topic:wizard.topic.trim(),clarifications:wizard.questions.map((question,i) => ({question,answer:wizard.answers[i]})),status:'draft',score:null,responses:[]};
  tasks.unshift(task); const saved = save();
  wizard = {description:'',topic:'',questions:[],answers:[],phase:'input',source:'',analyzedText:''}; storeWizard();
  location.hash = `edit/${encodeURIComponent(task.id)}`;
  if (saved) toast('Карточка собрана из ваших ответов. Проверьте и отредактируйте её.');
}
route(false);
