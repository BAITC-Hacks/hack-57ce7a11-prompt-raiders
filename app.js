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
function editor(task) {
  const edit = Boolean(task);
  $('detail-content').innerHTML = `<section class="edit-panel"><p class="eyebrow">${edit ? 'РЕДАКТИРОВАНИЕ КАРТОЧКИ' : 'НОВАЯ ЗАДАЧА'}</p><h1 tabindex="-1">${edit ? 'Редактор карточки' : 'Введите черновик'}</h1><p class="data-note">${edit ? 'После изменения задача вернётся в черновики для повторного подтверждения и расчёта рейтинга.' : 'Опишите задачу своими словами. Сохранённый черновик появится в кабинете бизнеса.'}</p><form id="task-form" novalidate><label for="task-title">Название задачи</label><input id="task-title" maxlength="120" value="${esc(task?.title || '')}" required><label for="task-description">Описание задачи</label><textarea id="task-description" rows="6" maxlength="5000" required>${esc(task?.description || '')}</textarea>${task?.topic ? `<label for="card-topic">Тема или отрасль</label><input id="card-topic" maxlength="100" value="${esc(task.topic)}">` : ''}${task?.clarifications?.length ? `<h2 class="answers-heading">Уточнения для карточки</h2>${task.clarifications.map((item,i) => `<label for="card-answer-${i}">${esc(item.question)}</label><textarea id="card-answer-${i}" rows="3" maxlength="2000">${esc(item.answer)}</textarea>`).join('')}` : ''}<p class="form-error" id="task-error" role="alert"></p><button class="role-button business-button" type="submit">${edit ? 'Сохранить изменения' : 'Сохранить черновик'} <span>→</span></button></form></section>`;
  $('task-form').addEventListener('submit',event => {
    event.preventDefault();
    const title = $('task-title').value.trim(), description = $('task-description').value.trim();
    if (!title || !description) { $('task-error').textContent = 'Заполните название и описание задачи.'; (!title ? $('task-title') : $('task-description')).focus(); return; }
    if (edit) {
      const topic = $('card-topic') ? $('card-topic').value.trim() : task.topic;
      const clarifications = task.clarifications?.map((item,i) => ({question:item.question,answer:$(`card-answer-${i}`).value.trim()}));
      if (title !== task.title || description !== task.description || topic !== task.topic || JSON.stringify(clarifications) !== JSON.stringify(task.clarifications)) Object.assign(task,{title,description,topic,clarifications,status:'draft',score:null});
    } else tasks.unshift({id: Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8),title,description,status:'draft',score:null,responses:[]});
    const saved = save(); location.hash = 'business'; if (saved) toast(edit ? 'Изменения сохранены.' : 'Черновик создан.');
  });
}
function responses(task) {
  $('detail-content').innerHTML = `<p class="eyebrow">ПРЕДЛОЖЕНИЯ КОМАНД</p><h1 class="responses-heading" tabindex="-1">Отклики на задачу</h1><p class="dashboard-subtitle">${esc(task.title)}</p>${task.responses.length ? `<div class="task-list">${task.responses.map(r => `<article class="task-item"><span class="demo-tag">${task.demo ? 'ДЕМО-ПРИМЕР' : 'ПРЕДЛОЖЕНИЕ'}</span><h3>${esc(r.team)}</h3><p><strong>Идея решения</strong><br>${esc(r.idea)}</p><p><strong>План реализации</strong><br>${esc(r.plan)}</p></article>`).join('')}</div>` : empty('Откликов пока нет','Когда команды отправят предложения, они появятся здесь.')}`;
}
function route(focus = true) {
  cancelAnalysis();
  const [name,rawId] = location.hash.slice(1).split('/');
  $('home-screen').hidden = Boolean(name && name !== 'catalog');
  $('business-screen').hidden = name !== 'business';
  $('detail-screen').hidden = !['draft','edit','responses'].includes(name);
  $('navigation-status').hidden = name !== 'catalog';
  $('navigation-status').textContent = 'Общий каталог ещё не подключён.';
  if (name === 'business') renderBusiness();
  else if (name === 'draft') renderDraft();
  else if (name === 'edit' || name === 'responses') {
    let taskId; try { taskId = decodeURIComponent(rawId || ''); } catch { taskId = ''; }
    const task = tasks.find(t => t.id === taskId);
    if (!task) $('detail-content').innerHTML = empty('Задача не найдена','Вернитесь в кабинет и выберите задачу из списка.');
    else if (name === 'edit') editor(task); else responses(task);
  } else if (name !== 'catalog') $('home-screen').hidden = false;
  document.title = name === 'business' ? 'Кабинет бизнеса — AI Sana' : name === 'draft' ? 'Новый черновик — AI Sana' : name === 'edit' ? 'Редактор задачи — AI Sana' : name === 'responses' ? 'Отклики — AI Sana' : 'AI Sana — выберите роль';
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
