/* NovaCalc PRO — sin dependencias ni eval(). */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const ui = { expression: $('expression-display'), result: $('result-display'), status: $('display-status'), workspace: $('workspace'), panel: $('history-panel'), toggle: $('history-toggle'), toggleText: $('history-toggle-text'), count: $('history-count'), list: $('history-list'), clearHistory: $('clear-history'), backdrop: $('history-backdrop'), toast: $('toast'), theme: $('theme-toggle') };
  const KEY_HISTORY = 'novacalc-pro-history-v1', KEY_THEME = 'novacalc-pro-theme-v1';
  const operators = ['+', '-', '*', '/'];
  const MAX_DIGITS = 16;
  let tokens = ['0']; // Alterna números (con signo y punto interno) y operadores.
  let justSolved = false;
  let solvedExpression = null; // Conserva la expresión final hasta empezar otro cálculo.
  let history = loadHistory();
  let toastTimer;
  const format = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 12, useGrouping: true });
  const read = (key, fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
  const save = (key, value) => { try { localStorage.setItem(key, value); } catch { /* Navegador sin almacenamiento. */ } };
  function loadHistory() {
    try {
      const value = JSON.parse(read(KEY_HISTORY, '[]'));
      return Array.isArray(value) ? value.filter(x => x && typeof x.expression === 'string' && typeof x.value === 'number' && Number.isFinite(x.value)).slice(0, 100) : [];
    } catch { return []; }
  }
  function nice(value) {
    if (!Number.isFinite(value)) return 'Error';
    if (Math.abs(value) > 0 && (Math.abs(value) >= 1e15 || Math.abs(value) < 1e-9)) return value.toExponential(8).replace('.', ',');
    return format.format(value);
  }
  function tidy(value) {
    if (!Number.isFinite(value)) throw Error('Resultado fuera de rango');
    // Elimina artefactos binarios comunes sin modificar los valores enteros seguros.
    return Number.isInteger(value) ? value : Number(value.toPrecision(13));
  }
  const opSymbol = x => ({'*':'×','/':'÷','-':'−','+':'+'})[x] || x;
  function displayNumber(x) {
    const [base, suffix] = x.endsWith('%') ? [x.slice(0,-1), '%'] : [x, ''];
    const [integer, decimals] = base.split('.');
    const sign = integer.startsWith('-') ? '−' : '';
    const digits = sign ? integer.slice(1) : integer;
    const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return sign + grouped + (decimals !== undefined ? ',' + decimals : '') + suffix;
  }
  const displayTokens = arr => arr.map(x => operators.includes(x) ? opSymbol(x) : displayNumber(x)).join(' ');
  function evaluate(arr) {
    if (!arr.length || operators.includes(arr.at(-1))) throw Error('Operación incompleta');
    const values = [];
    const ops = [];
    for (const part of arr) {
      if (operators.includes(part)) ops.push(part);
      else {
        const percent = part.endsWith('%');
        const raw = percent ? part.slice(0, -1) : part;
        const number = Number(raw);
        if (!Number.isFinite(number)) throw Error('Número inválido');
        values.push({value: number, percent});
      }
    }
    if (values.length !== ops.length + 1) throw Error('Operación incompleta');
    // Primero multiplicación y división. Porcentaje equivale a x/100.
    for (let i = 0; i < ops.length;) {
      if (ops[i] === '*' || ops[i] === '/') {
        const left = values[i].value / (values[i].percent ? 100 : 1);
        const right = values[i+1].value / (values[i+1].percent ? 100 : 1);
        if (ops[i] === '/' && right === 0) throw Error('No se puede dividir entre cero');
        values.splice(i, 2, {value: tidy(ops[i] === '*' ? left * right : left / right), percent: false});
        ops.splice(i, 1);
      } else i++;
    }
    let total = values[0].value / (values[0].percent ? 100 : 1);
    for (let i = 0; i < ops.length; i++) {
      const item = values[i+1];
      // 200 + 10% = 220, 200 - 10% = 180.
      const right = item.percent ? total * item.value / 100 : item.value;
      total = tidy(ops[i] === '+' ? total + right : total - right);
    }
    return tidy(total);
  }
  function current() { return tokens.at(-1); }
  function show() {
    // La pantalla grande es siempre la zona de escritura. Solo '=' la sustituye
    // por el resultado definitivo. La línea superior indica la vista previa.
    ui.result.classList.remove('is-error');
    ui.result.textContent = justSolved ? nice(Number(current())) : displayTokens(tokens);
    ui.result.dataset.value = justSolved ? String(Number(current())) : ''; // Solo copiar un resultado confirmado
    ui.status.classList.remove('is-error');

    if (justSolved) {
      ui.expression.textContent = solvedExpression || 'Operación completada';
      ui.status.innerHTML = '<span class="status-dot" aria-hidden="true"></span> Resultado final';
      return;
    }
    try {
      const complete = operators.includes(current()) ? tokens.slice(0, -1) : tokens;
      const value = evaluate(complete);
      ui.expression.textContent = '≈ ' + nice(value);
      ui.status.innerHTML = '<span class="status-dot" aria-hidden="true"></span> Resultado provisional';
    } catch (error) {
      ui.expression.textContent = '—';
      ui.status.classList.toggle('is-error', error.message === 'No se puede dividir entre cero');
      ui.status.textContent = error.message === 'No se puede dividir entre cero'
        ? error.message : 'Esperando valores';
    }
  }
  function resumeEditing() {
    justSolved = false;
    solvedExpression = null;
  }
  function digit(d) {
    if (justSolved) { tokens = ['0']; resumeEditing(); }
    if (operators.includes(current())) tokens.push(d);
    else {
      let number = current();
      if (number.endsWith('%')) { tokens[tokens.length-1] = d; }
      else if (number.replace(/[^0-9]/g,'').length < MAX_DIGITS) {
        if (number === '0') number = d;
        else if (number === '-0') number = '-' + d;
        else number += d;
        tokens[tokens.length-1] = number;
      }
    }
    show();
  }
  function decimal() {
    if (justSolved) { tokens = ['0']; resumeEditing(); }
    if (operators.includes(current())) tokens.push('0.');
    else if (current().endsWith('%')) return;
    else if (!current().includes('.')) tokens[tokens.length-1] += '.';
    show();
  }
  function operator(op) {
    resumeEditing();
    if (operators.includes(current())) tokens[tokens.length-1] = op;
    else tokens.push(op);
    show();
  }
  function percent() {
    if (!operators.includes(current()) && !current().endsWith('%')) tokens[tokens.length-1] += '%';
    resumeEditing(); show();
  }
  function sign() {
    if (operators.includes(current())) tokens.push('-0');
    else {
      const x = current();
      tokens[tokens.length-1] = x.startsWith('-') ? x.slice(1) : '-' + x;
    }
    resumeEditing(); show();
  }
  function backspace() {
    if (justSolved) {
      // Si se pulsa retroceso tras =, se edita el resultado mostrado.
      resumeEditing();
    }
    if (operators.includes(current())) tokens.pop();
    else if (current().length > 1) {
      const next = current().slice(0,-1);
      tokens[tokens.length-1] = next === '-' ? '0' : next;
    } else if (tokens.length > 1) tokens.pop();
    else tokens = ['0'];
    if (!tokens.length) tokens = ['0'];
    show();
  }
  function notify(message) {
    ui.toast.textContent = message;
    ui.toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.remove('visible'), 2300);
  }
  function equals() {
    if (justSolved) return;
    try {
      const value = evaluate(tokens);
      const expression = displayTokens(tokens);
      history.unshift({id: Date.now() + Math.random(), expression, value});
      history = history.slice(0, 100);
      save(KEY_HISTORY, JSON.stringify(history));
      renderHistory();
      tokens = [String(value)];
      justSolved = true;
      solvedExpression = expression;
      show();
    } catch (error) { notify(error.message); }
  }
  function setHistory(open) {
    ui.workspace.classList.toggle('history-open', open);
    ui.toggle.setAttribute('aria-expanded', String(open));
    ui.panel.setAttribute('aria-hidden', String(!open));
    ui.panel.inert = !open;
    ui.toggleText.textContent = open ? 'Ocultar' : 'Historial';
    ui.backdrop.classList.toggle('visible', open);
    document.body.classList.toggle('history-modal-open', open);
  }
  function renderHistory() {
    ui.list.replaceChildren();
    ui.count.textContent = String(history.length);
    ui.count.hidden = history.length === 0;
    ui.clearHistory.disabled = history.length === 0;
    if (!history.length) {
      const empty = document.createElement('div');
      empty.className = 'history-empty';
      empty.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5m4-1v5l3 2"/></svg><strong>Sin operaciones todavía</strong><p>Tus cálculos aparecerán aquí al pulsar igual.</p>';
      ui.list.append(empty); return;
    }
    for (const item of history) {
      const card = document.createElement('article'); card.className = 'history-item';
      const exp = document.createElement('p'); exp.className = 'history-expression'; exp.textContent = item.expression;
      const value = document.createElement('strong'); value.className = 'history-result'; value.textContent = nice(item.value);
      const actions = document.createElement('div'); actions.className = 'history-item-actions';
      for (const [label, action] of [['Usar', 'use'], ['Copiar', 'copy'], ['Borrar', 'delete']]) {
        const btn = document.createElement('button'); btn.type = 'button'; btn.textContent = label;
        btn.setAttribute('aria-label', `${label} operación ${item.expression}`);
        btn.addEventListener('click', () => {
          if (action === 'use') { tokens = [String(item.value)]; justSolved = true; solvedExpression = item.expression; show(); setHistory(false); notify('Resultado recuperado'); }
          if (action === 'copy') copy(String(item.value));
          if (action === 'delete') { history = history.filter(x => x.id !== item.id); save(KEY_HISTORY, JSON.stringify(history)); renderHistory(); }
        }); actions.append(btn);
      }
      card.append(exp, value, actions); ui.list.append(card);
    }
  }
  async function copy(value) {
    if (!value) return notify('No hay resultado para copiar');
    try { await navigator.clipboard.writeText(value); notify('Resultado copiado'); }
    catch {
      const field = document.createElement('textarea'); field.value = value; field.style.position = 'fixed'; field.style.opacity = '0';
      document.body.append(field); field.select();
      try { document.execCommand('copy'); notify('Resultado copiado'); } catch { notify('No se pudo copiar'); }
      field.remove();
    }
  }
  document.querySelector('.keypad').addEventListener('click', event => {
    const key = event.target.closest('button'); if (!key) return;
    if (key.dataset.digit !== undefined) digit(key.dataset.digit);
    else if (key.dataset.operator) operator(key.dataset.operator);
    else ({clear: () => {tokens=['0'];resumeEditing();show();}, backspace, decimal, percent, sign, equals})[key.dataset.action]?.();
  });
  document.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey || ['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) return;
    const key = event.key;
    if (/^[0-9]$/.test(key)) digit(key);
    else if (['+','-','*','/'].includes(key)) {event.preventDefault();operator(key);}
    else if (key === '.' || key === ',') decimal();
    else if (key === '%') percent();
    else if (key === 'Enter' || key === '=') {event.preventDefault();equals();}
    else if (key === 'Backspace') {event.preventDefault();backspace();}
    else if (key === 'Delete' || key === 'Escape') {
      if (key === 'Escape' && ui.toggle.getAttribute('aria-expanded') === 'true') setHistory(false);
      else {tokens=['0'];resumeEditing();show();}
    }
  });
  ui.toggle.addEventListener('click', () => setHistory(ui.toggle.getAttribute('aria-expanded') !== 'true'));
  $('close-history').addEventListener('click', () => setHistory(false));
  ui.backdrop.addEventListener('click', () => setHistory(false));
  ui.clearHistory.addEventListener('click', () => { history=[];save(KEY_HISTORY,'[]');renderHistory();notify('Historial eliminado'); });
  $('copy-result').addEventListener('click', () => copy(ui.result.dataset.value));
  function theme(mode) {
    document.body.dataset.theme = mode;
    ui.theme.setAttribute('aria-label', mode === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro');
    save(KEY_THEME, mode);
  }
  ui.theme.addEventListener('click', () => theme(document.body.dataset.theme === 'dark' ? 'light' : 'dark'));
  theme(read(KEY_THEME, 'dark') === 'light' ? 'light' : 'dark');
  renderHistory(); show();
})();
