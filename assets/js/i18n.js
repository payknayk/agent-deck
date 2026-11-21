/* Словарь интерфейса: RU / EN */

export const DICT = {
  ru: {
    'brand.sub': 'реестр запущенных агентов',
    'top.snapshot': 'снимок',
    'btn.import': 'Импорт снимка',
    'btn.upload': 'Загрузить контекст',
    'btn.export': 'Экспорт',
    'exp.snapshot': 'Снимок данных',
    'exp.snapshotSub': 'agents + sessions + статистика, .json',
    'exp.csv': 'Реестр запусков',
    'exp.csvSub': 'текущая выборка с фильтрами, .csv',
    'exp.contexts': 'Все контексты',
    'exp.contextsSub': 'переписка всех сессий одним .json',
    'exp.site': 'Сайт целиком',
    'exp.siteSub': 'HTML + данные одним .html',
    'exp.agent': 'Контекст агента',
    'toast.exportDone': 'Сохранено: {what}',
    'toast.exportProgress': 'Сборка: {done} из {total}',

    'hero.eyebrow': 'MiniMax Code · локальный рантайм',
    'hero.title': 'Все запущенные ИИ-агенты — в одном месте',
    'hero.lead': 'Живой снимок локального рантайма: агенты, их запуски, модели, расход токенов и полный контекст переписки. Свои контексты можно загрузить прямо в браузере — они никуда не отправляются.',
    'hero.cta1': 'Открыть реестр запусков',
    'hero.cta2': 'Загрузить свой контекст',
    'notice.public': 'Контексты в этом снимке опубликованы в открытом доступе — они содержат реальные пути, сообщения и рабочие данные.',

    'agents.title': 'Агенты',
    'agents.sub': 'Роли, персоны и статистика из конфигурации рантайма',
    'agents.persona': 'Показать персону',
    'agents.contexts': 'Контексты',
    'agents.sessions': 'запусков',
    'agents.messages': 'сообщений',
    'agents.tokens': 'токенов',
    'kpi.active': 'активно',

    'reg.title': 'Реестр запусков',
    'reg.sub': 'Каждая сессия рантайма: статус, модель, токены, контекст',
    'reg.search': 'Поиск по названию, id, рабочей папке…',
    'reg.allstatus': 'Все статусы',
    'reg.allagents': 'Все агенты',
    'reg.sort': 'Сортировка',
    'reg.sort.updated': 'Сначала свежие',
    'reg.sort.messages': 'Больше сообщений',
    'reg.sort.tokens': 'Больше токенов',
    'reg.empty': 'Ничего не найдено — измените фильтры.',
    'reg.open': 'Контекст',
    'reg.msgs': 'сообщений',
    'reg.tokens': 'токенов',

    'up.title': 'Загрузка контекста',
    'up.sub': 'Прикрепите файлы к агенту или запуску — хранятся только в этом браузере',
    'up.drop': 'Перетащите файлы сюда',
    'up.drop2': 'или нажмите, чтобы выбрать · md, txt, json, csv, log',
    'up.kind': 'Тип цели',
    'up.kindSession': 'Запуск (сессия)',
    'up.kindAgent': 'Агент',
    'up.kindGlobal': 'Общий архив',
    'up.targetId': 'Цель',
    'up.hint': 'Файлы читаются в браузере через File API и складываются в IndexedDB. Они не покидают устройство и не отправляются на сервер.',
    'up.attached': 'Прикреплённые файлы',
    'up.bundleMd': 'Собрать .md',
    'up.bundleJson': 'Собрать .json',
    'up.clear': 'Очистить',
    'up.empty': 'Пока ничего не загружено.',
    'up.saved': 'Файл сохранён',
    'up.deleted': 'Файл удалён',
    'up.noFiles': 'Сначала загрузите хотя бы один файл',
    'up.binary': 'бинарный файл (содержимое не сохранено)',

    'foot.sub': 'Статический дашборд по данным локального рантайма MiniMax Code',
    'foot.source': 'Источник',
    'foot.built': 'Собрано',

    'ctx.search': 'Поиск по контексту…',
    'ctx.copy': 'Копировать',
    'ctx.md': 'Скачать .md',
    'ctx.json': 'Скачать .json',
    'ctx.copied': 'Контекст скопирован в буфер обмена',
    'ctx.copyFail': 'Не удалось скопировать — используйте «Скачать .md»',
    'ctx.loading': 'Загрузка контекста…',
    'ctx.empty': 'В этой сессии нет сообщений',
    'ctx.truncated': 'Показано {shown} из {total} сообщений — контекст обрезан при сборке снимка',
    'ctx.showMore': 'Показать ещё 60',
    'ctx.args': 'Аргументы',
    'ctx.result': 'Результат',

    'toast.snapshotLoaded': 'Снимок загружен: {agents} агентов, {sessions} запусков',
    'toast.snapshotFail': 'Не похоже на снимок рантайма: нет массивов agents/sessions',
    'toast.theme': 'Тема переключена',
    'toast.filesAdded': 'Загружено файлов: {n}',
  },
  en: {
    'brand.sub': 'registry of running agents',
    'top.snapshot': 'snapshot',
    'btn.import': 'Import snapshot',
    'btn.upload': 'Upload context',
    'btn.export': 'Export',
    'exp.snapshot': 'Data snapshot',
    'exp.snapshotSub': 'agents + sessions + stats, .json',
    'exp.csv': 'Run registry',
    'exp.csvSub': 'current filtered selection, .csv',
    'exp.contexts': 'All contexts',
    'exp.contextsSub': 'every conversation in one .json',
    'exp.site': 'Whole site',
    'exp.siteSub': 'HTML + data in one .html',
    'exp.agent': 'Agent context',
    'toast.exportDone': 'Saved: {what}',
    'toast.exportProgress': 'Building: {done} of {total}',

    'hero.eyebrow': 'MiniMax Code · local runtime',
    'hero.title': 'Every running AI agent, in one place',
    'hero.lead': 'A live snapshot of the local runtime: agents, their runs, models, token spend and the full conversation context. You can upload your own context right in the browser — nothing leaves your device.',
    'hero.cta1': 'Open the run registry',
    'hero.cta2': 'Upload your context',
    'notice.public': 'Contexts in this snapshot are published openly — they contain real paths, messages and working data.',

    'agents.title': 'Agents',
    'agents.sub': 'Roles, personas and stats straight from the runtime configuration',
    'agents.persona': 'Show persona',
    'agents.contexts': 'Contexts',
    'agents.sessions': 'runs',
    'agents.messages': 'messages',
    'agents.tokens': 'tokens',
    'kpi.active': 'active',

    'reg.title': 'Run registry',
    'reg.sub': 'Every session in the runtime: status, model, tokens, context',
    'reg.search': 'Search by title, id, workspace…',
    'reg.allstatus': 'All statuses',
    'reg.allagents': 'All agents',
    'reg.sort': 'Sort by',
    'reg.sort.updated': 'Most recent first',
    'reg.sort.messages': 'Most messages',
    'reg.sort.tokens': 'Most tokens',
    'reg.empty': 'Nothing found — adjust the filters.',
    'reg.open': 'Context',
    'reg.msgs': 'messages',
    'reg.tokens': 'tokens',

    'up.title': 'Upload context',
    'up.sub': 'Attach files to an agent or run — they stay in this browser only',
    'up.drop': 'Drop files here',
    'up.drop2': 'or click to choose · md, txt, json, csv, log',
    'up.kind': 'Target type',
    'up.kindSession': 'Run (session)',
    'up.kindAgent': 'Agent',
    'up.kindGlobal': 'Shared archive',
    'up.targetId': 'Target',
    'up.hint': 'Files are read in the browser through the File API and stored in IndexedDB. They never leave the device and are never uploaded to a server.',
    'up.attached': 'Attached files',
    'up.bundleMd': 'Build .md',
    'up.bundleJson': 'Build .json',
    'up.clear': 'Clear',
    'up.empty': 'Nothing uploaded yet.',
    'up.saved': 'File stored',
    'up.deleted': 'File removed',
    'up.noFiles': 'Upload at least one file first',
    'up.binary': 'binary file (content not stored)',

    'foot.sub': 'A static dashboard built from the local MiniMax Code runtime',
    'foot.source': 'Source',
    'foot.built': 'Built',

    'ctx.search': 'Search the context…',
    'ctx.copy': 'Copy',
    'ctx.md': 'Download .md',
    'ctx.json': 'Download .json',
    'ctx.copied': 'Context copied to clipboard',
    'ctx.copyFail': 'Copy failed — use “Download .md” instead',
    'ctx.loading': 'Loading context…',
    'ctx.empty': 'This session has no messages',
    'ctx.truncated': 'Showing {shown} of {total} messages — the context was trimmed while building the snapshot',
    'ctx.showMore': 'Show 60 more',
    'ctx.args': 'Arguments',
    'ctx.result': 'Result',

    'toast.snapshotLoaded': 'Snapshot loaded: {agents} agents, {sessions} runs',
    'toast.snapshotFail': 'Not a runtime snapshot: agents/sessions arrays are missing',
    'toast.theme': 'Theme switched',
    'toast.filesAdded': 'Files uploaded: {n}',
  },
};

const ROLE_LABEL = {
  ru: { orchestrator: 'оркестратор', explore: 'разведчик', worker: 'исполнитель', verifier: 'верификатор', agent: 'агент' },
  en: { orchestrator: 'orchestrator', explore: 'explorer', worker: 'worker', verifier: 'verifier', agent: 'agent' },
};

const STATUS_LABEL = {
  ru: { started: 'запущен', running: 'работает', idle: 'ожидает', error: 'ошибка', aborted: 'прерван', interrupted: 'прерван' },
  en: { started: 'started', running: 'running', idle: 'idle', error: 'error', aborted: 'aborted', interrupted: 'interrupted' },
};

let current = 'ru';

export function setLang(lang) {
  current = DICT[lang] ? lang : 'ru';
  document.documentElement.lang = current;
}

export function getLang() {
  return current;
}

export function t(key, vars) {
  let value = DICT[current]?.[key] ?? DICT.ru[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) value = value.replaceAll(`{${k}}`, String(v));
  }
  return value;
}

export function roleLabel(role) {
  return (ROLE_LABEL[current] || ROLE_LABEL.ru)[role] || role;
}

export function statusLabel(status) {
  return (STATUS_LABEL[current] || STATUS_LABEL.ru)[status] || status;
}

export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-ph]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPh);
  });
}
