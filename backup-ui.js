import { readLibrary } from './library.js?v=20261007perf2';
import { createBackup, parseBackup, previewImport, commitImport, MAX_BACKUP_BYTES } from './backup.js?v=20261007perf2';

function element(tag, text = '') {
  const result = document.createElement(tag);
  result.textContent = text;
  return result;
}

function download(items, prefix = 'moviedb-library') {
  const backup = createBackup(items);
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' }));
  const link = element('a');
  link.href = url;
  link.download = `${prefix}-${backup.exportedAt.slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function mountLibraryBackup(host, onChange) {
  const panel = element('details');
  panel.className = 'backup-panel';
  panel.append(element('summary', 'Резервная копия «Моё»'));
  panel.append(element('p', 'Сохрани все три списка в файл или перенеси их на другое устройство. Файл читается только здесь и не отправляется на сервер. Это не синхронизация.'));
  const actions = element('div');
  actions.className = 'backup-actions';
  const exportButton = element('button', 'Скачать копию');
  exportButton.type = 'button';
  const fileLabel = element('label', 'Восстановить из файла');
  const fileInput = element('input');
  fileInput.type = 'file';
  fileInput.accept = '.json,application/json';
  fileLabel.append(fileInput);
  actions.append(exportButton, fileLabel);
  const emptyNote = element('p', 'Пока сохранять нечего — сначала добавь фильм или сериал в «Моё».');
  const status = element('p');
  status.className = 'backup-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const preview = element('div');
  preview.hidden = true;
  const summary = element('p');
  const modes = element('fieldset');
  modes.append(element('legend', 'Как восстановить списки'));
  const radios = [];
  for (const [value, text] of [['merge', 'Объединить с текущими — ничего не удалять'], ['replace', 'Заменить текущие списки содержимым файла']]) {
    const label = element('label', text);
    const radio = element('input');
    radio.type = 'radio';
    radio.name = 'backup-mode';
    radio.value = value;
    radio.checked = value === 'merge';
    label.prepend(radio);
    modes.append(label);
    radios.push(radio);
  }
  const consequence = element('p');
  const confirmationLabel = element('label', 'Подтверждаю замену: текущие списки будут удалены.');
  const confirmation = element('input');
  confirmation.type = 'checkbox';
  confirmationLabel.prepend(confirmation);
  const saveBefore = element('button', 'Скачать текущие списки перед заменой');
  saveBefore.type = 'button';
  const apply = element('button', 'Объединить списки');
  apply.type = 'button';
  const cancel = element('button', 'Отменить импорт');
  cancel.type = 'button';
  const recovery = element('button', 'Скачать предыдущую версию списков');
  recovery.type = 'button';
  recovery.hidden = true;
  let parsed = null;
  let plan = null;
  let previous = null;
  let sequence = 0;
  const update = () => {
    exportButton.disabled = readLibrary().length === 0;
    emptyNote.hidden = !exportButton.disabled;
  };
  const drawPreview = () => {
    const mode = radios.find(radio => radio.checked).value;
    apply.disabled = true;
    confirmationLabel.hidden = mode !== 'replace';
    saveBefore.hidden = mode !== 'replace';
    confirmation.checked = false;
    try {
      plan = previewImport(parsed, mode);
      summary.textContent = `В файле: ${parsed.valid} корректных записей; пропущено: ${parsed.skipped}; повторов: ${parsed.duplicates}. Совпадений с текущими: ${plan.conflicts}.`;
      consequence.textContent = `Записей после ${mode === 'merge' ? 'объединения' : 'замены'}: ${plan.items.length}. ${mode === 'merge' ? 'Отметки всех трёх списков объединятся.' : 'Перед заменой скачай текущую копию. Предыдущая версия также останется в памяти до обновления или закрытия страницы.'}`;
      apply.textContent = mode === 'merge' ? 'Объединить списки' : 'Заменить списки';
      apply.disabled = !parsed.items.length || mode === 'replace';
      saveBefore.disabled = !plan.before.length;
      if (!parsed.items.length) consequence.textContent = 'В файле нет корректных записей. Текущие списки не изменятся.';
    } catch (error) { plan = null; status.textContent = error.message; }
  };
  exportButton.addEventListener('click', () => {
    try { download(readLibrary()); status.textContent = 'Копия подготовлена. Сохрани файл; при переносе выбери его на другом устройстве.'; }
    catch (_) { status.textContent = 'Не удалось подготовить файл. Попробуй ещё раз.'; }
  });
  fileInput.addEventListener('change', async () => {
    const request = ++sequence;
    preview.hidden = true;
    parsed = null;
    plan = null;
    const file = fileInput.files[0];
    if (!file) return;
    status.textContent = 'Проверяем файл…';
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error('Файл слишком большой. Максимум — 2 МБ.');
      const text = await file.text();
      if (request !== sequence) return;
      parsed = parseBackup(text);
      radios[0].checked = true;
      preview.hidden = false;
      status.textContent = 'Файл проверен. Списки ещё не изменены.';
      drawPreview();
    } catch (error) { if (request === sequence) status.textContent = error.message; }
    finally { if (request === sequence) fileInput.value = ''; }
  });
  radios.forEach(radio => radio.addEventListener('change', () => { status.textContent = 'Списки ещё не изменены.'; drawPreview(); }));
  confirmation.addEventListener('change', () => { apply.disabled = !plan?.imported || !confirmation.checked; });
  saveBefore.addEventListener('click', () => { if (plan) download(plan.before); });
  recovery.addEventListener('click', () => { if (previous) download(previous, 'moviedb-library-before-import'); });
  cancel.addEventListener('click', () => { ++sequence; parsed = null; plan = null; preview.hidden = true; status.textContent = 'Импорт отменён. Списки не изменены.'; fileInput.focus(); });
  apply.addEventListener('click', () => {
    if (!plan || (plan.mode === 'replace' && !confirmation.checked)) return;
    try {
      if (!commitImport(plan)) return;
      previous = plan.before;
      recovery.hidden = previous.length === 0;
      preview.hidden = true;
      status.textContent = `Списки восстановлены. Записей: ${plan.items.length}.${previous.length ? ' Предыдущую версию можно скачать до обновления или закрытия страницы.' : ''}`;
      parsed = null;
      plan = null;
      update();
      onChange();
      exportButton.focus();
    } catch (error) { status.textContent = error.message; apply.disabled = true; }
  });
  preview.append(summary, modes, consequence, saveBefore, confirmationLabel, apply, cancel);
  panel.append(actions, emptyNote, status, preview, recovery);
  panel.addEventListener('toggle', update);
  host.append(panel);
  update();
  return update;
}
