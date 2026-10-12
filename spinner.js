// Один индикатор для каталога, подробностей и демонстрации.
export function makeSpinner({ large = false } = {}) {
  const spinner = document.createElement('span');
  spinner.className = 'cinema-spinner' + (large ? ' cinema-spinner--large' : '');
  spinner.setAttribute('aria-hidden', 'true');
  const core = document.createElement('img');
  core.className = 'cinema-spinner__core';
  core.src = 'assets/pwa-icon.svg';
  core.alt = '';
  core.width = 32;
  core.height = 32;
  spinner.append(core);
  return spinner;
}

export function setLoadingStatus(target, label, options) {
  const text = document.createElement('span');
  text.textContent = label;
  target.replaceChildren(makeSpinner(options), text);
}

export const SLOW_LOAD_MS = 8000;
export const VPN_HINT = 'Если ты в России, попробуй включить VPN и повторить загрузку. Также проверь подключение к интернету.';

export function startLoadingNotice(container, { signal, onRetry, delayMs = SLOW_LOAD_MS } = {}) {
  const notice = document.createElement('div');
  notice.className = 'loading-notice';
  notice.hidden = true;
  const copy = document.createElement('p');
  copy.setAttribute('role', 'status');
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = 'Повторить загрузку';
  retry.addEventListener('click', onRetry);
  notice.append(copy, retry);
  container.append(notice);
  const show = failed => {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    copy.textContent = offline
      ? 'Нет подключения к интернету. Подключись к сети и повтори загрузку.'
      : (failed ? 'Не всё удалось загрузить. ' : 'Загрузка затянулась. ') + VPN_HINT;
    notice.hidden = false;
  };
  const timer = setTimeout(() => show(false), delayMs);
  const abort = () => { clearTimeout(timer); notice.remove(); };
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  return {
    element: notice,
    finish({ failed = false, retryAvailable = true } = {}) {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (signal?.aborted || !failed) notice.remove();
      else {
        retry.hidden = !retryAvailable;
        if (!notice.isConnected) container.append(notice);
        show(true);
      }
    },
  };
}
