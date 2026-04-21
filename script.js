/**
 * TOMOA — script.js
 * Sistema inteligente de lembrete de medicamentos
 * Integrado com Google Apps Script backend
 */

// ═══════════════════════════════════════════════════
// CONFIGURAÇÃO
// ═══════════════════════════════════════════════════

const API_URL = "https://script.google.com/macros/s/AKfycbxYAbd4R2VX3oDG2DopLDNvnE964KwKUcHeQVuNE2acwyJrCT01jwVUzvPzbQHgJN9M/exec";

const FREE_PLAN_LIMIT = 2;

// ═══════════════════════════════════════════════════
// ESTADO DA APLICAÇÃO
// ═══════════════════════════════════════════════════

const state = {
  user: null,          // { id, nome, telefone, plano }
  remedios: [],        // lista atual de remédios
  currentView: 'home', // view ativa no dashboard
  loading: false,
};

// ═══════════════════════════════════════════════════
// HELPERS: TOAST NOTIFICATIONS
// ═══════════════════════════════════════════════════

/**
 * Exibe uma notificação toast moderna
 * @param {string} msg  - Mensagem a exibir
 * @param {'success'|'error'|'warning'} type - Tipo
 * @param {number} duration - Duração em ms (padrão 3500)
 */
function toast(msg, type = 'success', duration = 3500) {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  const icons = { success: '✓', error: '✕', warning: '⚠' };
  el.className = `toast ${type === 'error' ? 'error' : type === 'warning' ? 'warning' : ''}`;
  el.innerHTML = `<span>${icons[type] || icons.success}</span><span>${msg}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add('fadeout');
    setTimeout(() => el.remove(), 320);
  }, duration);
}

// ═══════════════════════════════════════════════════
// HELPERS: LOADING
// ═══════════════════════════════════════════════════

function showLoading() {
  document.getElementById('loading-overlay').classList.remove('hidden');
  state.loading = true;
}
function hideLoading() {
  document.getElementById('loading-overlay').classList.add('hidden');
  state.loading = false;
}

// ═══════════════════════════════════════════════════
// HELPERS: API FETCH
// ═══════════════════════════════════════════════════

/**
 * Faz requisição GET para o backend
 * Google Apps Script não suporta POST CORS, usamos GET com parâmetros
 */
async function apiCall(params) {
  const url = new URL(API_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));
  try {
    const res = await fetch(url.toString(), { method: 'GET' });
    const data = await res.json();
    return data;
  } catch (err) {
    console.error('[Tomoa API Error]', err);
    throw err;
  }
}

// ═══════════════════════════════════════════════════
// HELPERS: LOCAL STORAGE
// ═══════════════════════════════════════════════════

function saveUser(user) {
  localStorage.setItem('tomoa_user', JSON.stringify(user));
  state.user = user;
}
function loadUser() {
  try {
    const raw = localStorage.getItem('tomoa_user');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function clearUser() {
  localStorage.removeItem('tomoa_user');
  state.user = null;
}

// ═══════════════════════════════════════════════════
// HELPERS: FORMATO DATA/HORA
// ═══════════════════════════════════════════════════

function formatDateTime(str) {
  if (!str) return '—';
  try {
    const d = new Date(str);
    return d.toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return str; }
}

function greetingByHour() {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

// ═══════════════════════════════════════════════════
// HELPERS: SCREEN SWITCHING
// ═══════════════════════════════════════════════════

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
    s.classList.add('hidden');
  });
  const screen = document.getElementById(screenId);
  screen.classList.remove('hidden');
  screen.classList.add('active');
}

// ═══════════════════════════════════════════════════
// AUTH: LOGIN / CADASTRO
// ═══════════════════════════════════════════════════

function initAuth() {
  // Tab switching
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => switchAuthTab(tab.dataset.tab));
  });

  // Link buttons that switch tabs
  document.querySelectorAll('[data-switch]').forEach(btn => {
    btn.addEventListener('click', () => switchAuthTab(btn.dataset.switch));
  });

  // Phone mask
  document.getElementById('login-phone').addEventListener('input', maskPhone);
  document.getElementById('cad-phone').addEventListener('input', maskPhone);

  // Actions
  document.getElementById('btn-login').addEventListener('click', handleLogin);
  document.getElementById('btn-cadastro').addEventListener('click', handleCadastro);

  // Enter key
  document.getElementById('login-phone').addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });
  document.getElementById('cad-phone').addEventListener('keydown', e => { if (e.key === 'Enter') handleCadastro(); });
  document.getElementById('cad-name').addEventListener('keydown', e => { if (e.key === 'Enter') handleCadastro(); });
}

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.auth-tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
  document.getElementById(`tab-${tab}`).classList.add('active');
}

function maskPhone(e) {
  let v = e.target.value.replace(/\D/g, '');
  if (v.length <= 10) {
    v = v.replace(/^(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
  } else {
    v = v.replace(/^(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
  }
  e.target.value = v;
}

async function handleLogin() {
  const phone = document.getElementById('login-phone').value.trim();
  if (!phone || phone.replace(/\D/g, '').length < 10) {
    toast('Informe um telefone válido.', 'error'); return;
  }
  const btn = document.getElementById('btn-login');
  btn.disabled = true;
  btn.querySelector('.btn-text').textContent = 'Entrando…';
  showLoading();
  try {
    // Tenta recuperar usuário pelo telefone
    // O backend não tem endpoint de login direto, então buscamos pelo telefone localmente
    // Se o usuário existir no localStorage, entramos direto; senão tentamos criar
    const saved = loadUser();
    const phoneClean = phone.replace(/\D/g, '');
    if (saved && saved.telefone && saved.telefone.replace(/\D/g, '') === phoneClean) {
      saveUser(saved);
      toast(`Bem-vindo de volta, ${saved.nome}! 👋`);
      initDashboard();
      showScreen('screen-dashboard');
    } else {
      toast('Telefone não encontrado. Crie uma conta.', 'warning');
      switchAuthTab('cadastro');
      document.getElementById('cad-phone').value = phone;
    }
  } catch (err) {
    toast('Erro ao conectar. Tente novamente.', 'error');
  } finally {
    btn.disabled = false;
    btn.querySelector('.btn-text').textContent = 'Entrar';
    hideLoading();
  }
}

async function handleCadastro() {
  const nome = document.getElementById('cad-name').value.trim();
  const phone = document.getElementById('cad-phone').value.trim();
  if (!nome) { toast('Informe seu nome.', 'error'); return; }
  if (!phone || phone.replace(/\D/g, '').length < 10) {
    toast('Informe um telefone válido.', 'error'); return;
  }
  const btn = document.getElementById('btn-cadastro');
  btn.disabled = true;
  btn.querySelector('.btn-text').textContent = 'Criando conta…';
  showLoading();
  try {
    const data = await apiCall({ action: 'createUser', nome, telefone: phone });
    if (data && (data.success || data.id || data.user_id || data.userId)) {
      const userId = data.id || data.user_id || data.userId || data.data?.id || `local_${Date.now()}`;
      const user = { id: userId, nome, telefone: phone, plano: 'free' };
      saveUser(user);
      toast(`Conta criada com sucesso! Bem-vindo, ${nome} 🎉`);
      initDashboard();
      showScreen('screen-dashboard');
    } else if (data && data.message) {
      // Backend pode retornar mensagem de erro customizada
      toast(data.message, 'error');
    } else {
      // Fallback: salvar localmente mesmo que o backend não confirme
      const user = { id: `local_${Date.now()}`, nome, telefone: phone, plano: 'free' };
      saveUser(user);
      toast(`Bem-vindo, ${nome}! 🎉`);
      initDashboard();
      showScreen('screen-dashboard');
    }
  } catch (err) {
    // Modo offline: salvar localmente
    const user = { id: `local_${Date.now()}`, nome, telefone: phone, plano: 'free' };
    saveUser(user);
    toast(`Conta criada localmente. Bem-vindo, ${nome}! 🎉`);
    initDashboard();
    showScreen('screen-dashboard');
  } finally {
    btn.disabled = false;
    btn.querySelector('.btn-text').textContent = 'Começar agora — é grátis';
    hideLoading();
  }
}

// ═══════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════

function initDashboard() {
  const user = state.user;
  if (!user) return;

  // Atualiza UI com dados do usuário
  const firstName = user.nome.split(' ')[0];
  document.getElementById('greeting-name').textContent = firstName;
  document.getElementById('greeting-name').previousElementSibling.textContent = `${greetingByHour()} 👋`;
  document.getElementById('sidebar-name').textContent = firstName;
  document.getElementById('sidebar-avatar').textContent = firstName.charAt(0).toUpperCase();

  // Plano
  const planLabel = user.plano === 'premium' ? 'Premium ⭐' : 'Free';
  document.getElementById('sidebar-name').nextElementSibling.textContent = `Plano ${planLabel}`;

  // Setup view navigation
  setupNavigation();

  // Logout
  document.getElementById('btn-logout').addEventListener('click', handleLogout);
  document.getElementById('btn-logout-mobile')?.addEventListener('click', handleLogout);

  // Mobile menu
  document.getElementById('mobile-menu-btn')?.addEventListener('click', openMobileMenu);
  document.getElementById('mobile-nav-close')?.addEventListener('click', closeMobileMenu);
  document.getElementById('mobile-nav-overlay')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('mobile-nav-overlay')) closeMobileMenu();
  });

  // Add remédio button
  document.getElementById('btn-add-remedio').addEventListener('click', handleAddRemedio);

  // Shortcut button no dashboard
  document.getElementById('btn-add-shortcut').addEventListener('click', () => switchView('add'));

  // Botões [data-view] globais
  document.querySelectorAll('[data-view]').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // Carrega remédios
  loadRemedios();
}

function setupNavigation() {
  document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      switchView(btn.dataset.view);
      if (btn.dataset.mobile) closeMobileMenu();
    });
  });
}

function switchView(view) {
  state.currentView = view;

  // Atualiza views
  document.querySelectorAll('.view').forEach(v => {
    v.classList.remove('active');
    v.classList.add('hidden');
  });
  const target = document.getElementById(`view-${view}`);
  if (target) {
    target.classList.remove('hidden');
    target.classList.add('active');
  }

  // Atualiza nav items
  document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });

  // Pré-configuração por view
  if (view === 'add') setupAddForm();
  if (view === 'history') renderHistoryList();
  if (view === 'home') updateStats();
}

function openMobileMenu() {
  document.getElementById('mobile-nav-overlay').classList.remove('hidden');
}
function closeMobileMenu() {
  document.getElementById('mobile-nav-overlay').classList.add('hidden');
}

function handleLogout() {
  clearUser();
  state.remedios = [];
  showScreen('screen-auth');
  switchAuthTab('login');
  document.getElementById('login-phone').value = '';
  toast('Até logo! 👋');
}

// ═══════════════════════════════════════════════════
// REMÉDIOS: LISTAR
// ═══════════════════════════════════════════════════

async function loadRemedios() {
  if (!state.user) return;
  try {
    const data = await apiCall({ action: 'listRemedios', user_id: state.user.id });
    // O backend pode retornar { remedios: [...] } ou um array direto
    if (Array.isArray(data)) {
      state.remedios = data;
    } else if (data && Array.isArray(data.remedios)) {
      state.remedios = data.remedios;
    } else if (data && Array.isArray(data.data)) {
      state.remedios = data.data;
    } else {
      state.remedios = [];
    }
  } catch (err) {
    // Fallback: manter lista vazia
    state.remedios = [];
  }
  renderRemediosList();
  updateStats();
  checkUpgradeBanner();
}

function renderRemediosList() {
  const container = document.getElementById('remedios-list');
  const emptyState = document.getElementById('empty-state');
  container.innerHTML = '';

  if (!state.remedios || state.remedios.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');

  state.remedios.forEach((rem, idx) => {
    const card = createRemedioCard(rem, idx);
    container.appendChild(card);
  });
}

function createRemedioCard(rem, idx) {
  // Normaliza campos (o backend pode usar nomes variados)
  const id = rem.id || rem.rid || rem.remedio_id || idx;
  const nome = rem.nome || rem.name || rem.remedio || 'Remédio';
  const horario = rem.horario || rem.datetime || rem.data_hora || '';
  const dosagem = rem.dosagem || rem.dose || '';
  const confirmado = rem.confirmado === true || rem.confirmado === 'true' ||
                     rem.status === 'confirmado' || rem.status === 'Confirmado';

  const card = document.createElement('div');
  card.className = 'remedio-card';
  card.style.animationDelay = `${idx * 60}ms`;
  card.dataset.id = id;

  const statusClass = confirmado ? 'status-confirmado' : 'status-pendente';
  const statusText  = confirmado ? 'Confirmado' : 'Pendente';

  // Smart display: tipo + dias
  const tipo = rem.tipo || 'unico';
  const dias = rem.dias || '';
  const horarios = rem.horarios || [];
  let horariosDisplay = '';
  if (horarios.length > 1) {
    horariosDisplay = horarios.join(' · ');
  } else if (tipo === 'unico') {
    horariosDisplay = formatDateTime(horario);
  } else {
    horariosDisplay = horario ? horario.substring(0,5) : '—';
  }
  const tipoTag = tipo === 'continuo'
    ? '<span class="remedio-dosagem" style="background:#EFF6FF;color:#3B82F6;">🔄 Contínuo</span>'
    : '<span class="remedio-dosagem" style="background:#F5F3FF;color:#7C3AED;">1️⃣ Uso único</span>';

  card.innerHTML = `
    <div class="remedio-icon">💊</div>
    <div class="remedio-info">
      <div class="remedio-name">${escapeHtml(nome)}</div>
      <div class="remedio-meta">
        <span class="remedio-time">⏰ ${escapeHtml(horariosDisplay)}</span>
        ${tipoTag}
        ${dias ? `<span class="remedio-dosagem">📅 ${escapeHtml(dias)}</span>` : ''}
        ${dosagem ? `<span class="remedio-dosagem">⚖️ ${escapeHtml(dosagem)}</span>` : ''}
        <span class="remedio-status ${statusClass}">
          <span class="status-dot"></span>
          ${statusText}
        </span>
      </div>
    </div>
    <div class="remedio-actions">
      <button class="btn-confirm ${confirmado ? 'confirmed' : ''}" data-id="${id}" ${confirmado ? 'disabled' : ''}>
        ${confirmado ? '✓ Tomado' : '✓ Confirmar'}
      </button>
    </div>
  `;

  // Evento no botão confirmar
  const btnConfirm = card.querySelector('.btn-confirm');
  if (!confirmado) {
    btnConfirm.addEventListener('click', () => handleConfirmar(id, card));
  }

  return card;
}

// ═══════════════════════════════════════════════════
// REMÉDIOS: CONFIRMAR TOMADA
// ═══════════════════════════════════════════════════

async function handleConfirmar(rid, card) {
  const btn = card.querySelector('.btn-confirm');
  btn.disabled = true;
  btn.textContent = '…';

  try {
    const data = await apiCall({ action: 'confirmar', rid });
    if (data && (data.success || data.ok || data.confirmed)) {
      // Atualiza estado local
      const rem = state.remedios.find(r => String(r.id || r.rid || r.remedio_id) === String(rid));
      if (rem) { rem.confirmado = true; rem.status = 'confirmado'; }
      // Atualiza card na UI
      btn.className = 'btn-confirm confirmed';
      btn.textContent = '✓ Tomado';
      const statusEl = card.querySelector('.remedio-status');
      if (statusEl) {
        statusEl.className = 'remedio-status status-confirmado';
        statusEl.innerHTML = '<span class="status-dot"></span> Confirmado';
      }
      toast('Ótimo! Tomada confirmada 💊✓');
      updateStats();
    } else {
      toast('Erro ao confirmar. Tente novamente.', 'error');
      btn.disabled = false;
      btn.textContent = '✓ Confirmar';
    }
  } catch (err) {
    // Modo offline: confirma localmente
    const rem = state.remedios.find(r => String(r.id || r.rid || r.remedio_id) === String(rid));
    if (rem) { rem.confirmado = true; rem.status = 'confirmado'; }
    btn.className = 'btn-confirm confirmed';
    btn.textContent = '✓ Tomado';
    const statusEl = card.querySelector('.remedio-status');
    if (statusEl) {
      statusEl.className = 'remedio-status status-confirmado';
      statusEl.innerHTML = '<span class="status-dot"></span> Confirmado';
    }
    toast('Confirmado localmente 💊', 'warning');
    updateStats();
  }
}

// ═══════════════════════════════════════════════════
// REMÉDIOS: ADICIONAR
// ═══════════════════════════════════════════════════

function setupAddForm() {
  // Verifica limite antes de mostrar o form
  const atLimit = state.remedios.length >= FREE_PLAN_LIMIT && state.user?.plano !== 'premium';
  const warning = document.getElementById('limit-warning');
  const btn = document.getElementById('btn-add-remedio');
  if (atLimit) {
    warning.classList.remove('hidden');
    btn.disabled = true;
  } else {
    warning.classList.add('hidden');
    btn.disabled = false;
  }

  // Seta horário default para agora + 10 min (para uso único)
  const now = new Date(Date.now() + 10 * 60000);
  const pad = n => String(n).padStart(2, '0');
  const defaultVal = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const horarioInput = document.getElementById('rem-horario');
  if (horarioInput && !horarioInput.value) horarioInput.value = defaultVal;

  // Inicializa smart form (frequência, dias, horários dinâmicos)
  initSmartForm();
}

// ═══════════════════════════════════════════════════
// SMART FORM — Frequência, Dias, Horários Dinâmicos
// ═══════════════════════════════════════════════════

function initSmartForm() {
  const freqContinuo = document.getElementById('freq-continuo');
  const freqUnico    = document.getElementById('freq-unico');
  const blocoContinuo = document.getElementById('bloco-continuo');
  const blocoUnico    = document.getElementById('bloco-unico');
  const remVezes      = document.getElementById('rem-vezes');
  const diaTodos      = document.getElementById('dia-todos');

  if (!freqContinuo) return; // guard

  // Função que mostra/esconde blocos com base na frequência selecionada
  function updateFreqDisplay() {
    const isContinuo = freqContinuo.checked;
    if (isContinuo) {
      blocoContinuo.classList.remove('hidden');
      blocoUnico.classList.add('hidden');
    } else {
      blocoContinuo.classList.add('hidden');
      blocoUnico.classList.remove('hidden');
    }
  }

  // Evento de mudança de frequência
  freqContinuo.addEventListener('change', updateFreqDisplay);
  freqUnico.addEventListener('change', updateFreqDisplay);

  // Inicializa estado correto
  updateFreqDisplay();

  // Horários dinâmicos: ao mudar "vezes por dia"
  remVezes.addEventListener('change', renderHorariosDinamicos);
  renderHorariosDinamicos(); // render inicial com 1 campo

  // "Todos os dias" — marca/desmarca todos
  diaTodos.addEventListener('change', function() {
    const diasIndividuais = ['dia-seg','dia-ter','dia-qua','dia-qui','dia-sex','dia-sab','dia-dom'];
    diasIndividuais.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.checked = diaTodos.checked;
      // Atualiza visual do chip
      const chip = el?.closest('.dia-chip');
      if (chip) chip.classList.toggle('checked', diaTodos.checked);
    });
  });

  // Se um dia individual for desmarcado, desmarca "todos"
  ['dia-seg','dia-ter','dia-qua','dia-qui','dia-sex','dia-sab','dia-dom'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', function() {
        if (!this.checked && diaTodos.checked) {
          diaTodos.checked = false;
        }
      });
    }
  });
}

function renderHorariosDinamicos() {
  const vezes = parseInt(document.getElementById('rem-vezes')?.value || '1', 10);
  const container = document.getElementById('horarios-dinamicos');
  if (!container) return;

  // Salva valores existentes para não perder o que o usuário digitou
  const existing = Array.from(container.querySelectorAll('input[type="time"]'))
    .map(inp => inp.value);

  container.innerHTML = '';

  const labels = ['1º horário', '2º horário', '3º horário', '4º horário'];
  const defaults = ['08:00', '14:00', '20:00', '23:00'];

  for (let i = 0; i < vezes; i++) {
    const item = document.createElement('div');
    item.className = 'horario-item';
    item.style.animationDelay = `${i * 60}ms`;
    item.innerHTML = `
      <span class="horario-label">${labels[i] || (i+1)+'º'}</span>
      <div class="input-wrap">
        <span class="input-icon">⏰</span>
        <input type="time" id="rem-time-${i}" value="${existing[i] || defaults[i]}" required />
      </div>
    `;
    container.appendChild(item);
  }
}

function getSmartFormData() {
  const freqUnico = document.getElementById('freq-unico')?.checked;

  if (freqUnico) {
    const horario = document.getElementById('rem-horario')?.value || '';
    return { tipo: 'unico', horario, dias: '', vezes: 1, horarios: [horario] };
  }

  // Contínuo
  const diasIds = ['dia-seg','dia-ter','dia-qua','dia-qui','dia-sex','dia-sab','dia-dom'];
  const nomesDias = {'dia-seg':'Segunda','dia-ter':'Terça','dia-qua':'Quarta','dia-qui':'Quinta','dia-sex':'Sexta','dia-sab':'Sábado','dia-dom':'Domingo'};
  const diasSelecionados = diasIds
    .filter(id => document.getElementById(id)?.checked)
    .map(id => nomesDias[id]);

  const vezes = parseInt(document.getElementById('rem-vezes')?.value || '1', 10);
  const horarios = [];
  for (let i = 0; i < vezes; i++) {
    const val = document.getElementById(`rem-time-${i}`)?.value || '';
    if (val) horarios.push(val);
  }

  // Para compatibilidade com backend: usa primeiro horário como "horario" principal
  const horarioPrincipal = horarios[0] || '';

  return {
    tipo: 'continuo',
    horario: horarioPrincipal,
    dias: diasSelecionados.join(', '),
    vezes,
    horarios,
  };
}

function validateSmartForm() {
  const freqUnico = document.getElementById('freq-unico')?.checked;

  if (freqUnico) {
    const horario = document.getElementById('rem-horario')?.value;
    if (!horario) { toast('Informe a data e horário.', 'error'); return false; }
    return true;
  }

  // Contínuo: pelo menos um dia
  const diasIds = ['dia-seg','dia-ter','dia-qua','dia-qui','dia-sex','dia-sab','dia-dom'];
  const algumDia = diasIds.some(id => document.getElementById(id)?.checked);
  if (!algumDia) { toast('Selecione ao menos um dia da semana.', 'error'); return false; }

  // Pelo menos um horário preenchido
  const vezes = parseInt(document.getElementById('rem-vezes')?.value || '1', 10);
  const algumHorario = Array.from({length: vezes}, (_, i) => document.getElementById(`rem-time-${i}`)?.value).some(Boolean);
  if (!algumHorario) { toast('Informe ao menos um horário.', 'error'); return false; }

  return true;
}

async function handleAddRemedio() {
  const nome = document.getElementById('rem-nome').value.trim();
  const dosagem = document.getElementById('rem-dosagem').value.trim();

  if (!nome) { toast('Informe o nome do remédio.', 'error'); return; }
  if (!validateSmartForm()) return;

  // Verificar limite do plano
  if (state.remedios.length >= FREE_PLAN_LIMIT && state.user?.plano !== 'premium') {
    document.getElementById('limit-warning').classList.remove('hidden');
    toast('Limite do plano gratuito atingido. Faça upgrade por R$9,90/mês', 'warning', 5000);
    return;
  }

  const smartData = getSmartFormData();
  const btn = document.getElementById('btn-add-remedio');
  btn.disabled = true;
  btn.querySelector('.btn-text').textContent = 'Salvando…';
  showLoading();

  try {
    // Monta payload compatível com backend existente
    const params = {
      action: 'addRemedio',
      user_id: state.user.id,
      nome,
      horario: smartData.horario,  // horario principal (compatível com backend)
      tipo: smartData.tipo,
      dias: smartData.dias,
      vezes: smartData.vezes,
      horarios: smartData.horarios.join(','),
    };
    if (dosagem) params.dosagem = dosagem;

    const data = await apiCall(params);

    if (data && (data.success || data.id || data.remedio_id || data.ok)) {
      const newRem = {
        id: data.id || data.remedio_id || data.data?.id || `local_${Date.now()}`,
        nome,
        horario: smartData.horario,
        horarios: smartData.horarios,
        tipo: smartData.tipo,
        dias: smartData.dias,
        dosagem,
        confirmado: false, status: 'pendente',
      };
      state.remedios.push(newRem);
      toast(`"${nome}" adicionado com sucesso! 🎉`);
      clearAddForm();
      switchView('home');
      renderRemediosList();
      updateStats();
      checkUpgradeBanner();
    } else if (data && data.message) {
      toast(data.message, 'error');
    } else {
      addRemedioLocally(nome, smartData, dosagem);
    }
  } catch (err) {
    addRemedioLocally(nome, smartData, dosagem);
  } finally {
    btn.disabled = false;
    btn.querySelector('.btn-text').textContent = 'Salvar remédio';
    hideLoading();
  }
}

function addRemedioLocally(nome, smartData, dosagem) {
  const newRem = {
    id: `local_${Date.now()}`,
    nome,
    horario: smartData.horario,
    horarios: smartData.horarios,
    tipo: smartData.tipo,
    dias: smartData.dias,
    dosagem,
    confirmado: false, status: 'pendente',
  };
  state.remedios.push(newRem);
  toast(`"${nome}" salvo localmente 💊`, 'warning');
  clearAddForm();
  switchView('home');
  renderRemediosList();
  updateStats();
  checkUpgradeBanner();
}

function clearAddForm() {
  const nomeEl = document.getElementById('rem-nome');
  const dosEl  = document.getElementById('rem-dosagem');
  if (nomeEl) nomeEl.value = '';
  if (dosEl)  dosEl.value  = '';
  const horEl = document.getElementById('rem-horario');
  if (horEl) horEl.value = '';
  document.getElementById('limit-warning').classList.add('hidden');
  // Reset frequência para contínuo
  const freqCont = document.getElementById('freq-continuo');
  if (freqCont) { freqCont.checked = true; freqCont.dispatchEvent(new Event('change')); }
  // Limpa dias
  ['dia-todos','dia-seg','dia-ter','dia-qua','dia-qui','dia-sex','dia-sab','dia-dom'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.checked = false;
  });
}

// ═══════════════════════════════════════════════════
// DASHBOARD: STATS & UPGRADE BANNER
// ═══════════════════════════════════════════════════

function updateStats() {
  const total = state.remedios.length;
  const confirmados = state.remedios.filter(r => r.confirmado === true || r.confirmado === 'true' || r.status === 'confirmado').length;
  const pendentes = total - confirmados;
  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-confirmados').textContent = confirmados;
  document.getElementById('stat-pendentes').textContent = pendentes;
}

function checkUpgradeBanner() {
  const banner = document.getElementById('upgrade-banner');
  const atLimit = state.remedios.length >= FREE_PLAN_LIMIT && state.user?.plano !== 'premium';
  banner.classList.toggle('hidden', !atLimit);
}

// ═══════════════════════════════════════════════════
// HISTÓRICO
// ═══════════════════════════════════════════════════

function renderHistoryList() {
  const container = document.getElementById('history-list');
  container.innerHTML = '';
  if (!state.remedios || state.remedios.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <h4>Nenhum histórico ainda</h4>
        <p>Adicione remédios para ver o histórico aqui.</p>
      </div>`;
    return;
  }
  // Mostra todos, ordenados por horário
  const sorted = [...state.remedios].sort((a, b) => {
    const da = new Date(a.horario || a.datetime || 0);
    const db = new Date(b.horario || b.datetime || 0);
    return db - da;
  });
  sorted.forEach((rem, idx) => {
    const card = createRemedioCard(rem, idx);
    container.appendChild(card);
  });
}

// ═══════════════════════════════════════════════════
// UTILITY: XSS PROTECTION
// ═══════════════════════════════════════════════════

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ═══════════════════════════════════════════════════
// INIT: BOOTSTRAP DA APLICAÇÃO
// ═══════════════════════════════════════════════════

function init() {
  // Verifica sessão existente
  const savedUser = loadUser();
  if (savedUser && savedUser.id && savedUser.nome) {
    state.user = savedUser;
    initDashboard();
    showScreen('screen-dashboard');
  } else {
    showScreen('screen-auth');
    initAuth();
  }
}

// ═══════════════════════════════════════════════════
// LOGO CROP — Mostra apenas a parte superior do logo
// (o arquivo é um sheet com 3 variações; queremos só a principal)
// ═══════════════════════════════════════════════════

function cropLogos() {
  // O logo original é 2048x2048 com 3 versões dispostas assim:
  // Topo: logo grande (0-52% da altura), centralizado (20-80% da largura)
  // Usamos um canvas para extrair e substituir cada <img>
  const sourceImg = new Image();
  sourceImg.crossOrigin = 'anonymous';
  sourceImg.onload = function() {
    const sw = sourceImg.naturalWidth;
    const sh = sourceImg.naturalHeight;

    // Crop coordinates: top main logo
    const sx = Math.floor(sw * 0.18);
    const sy = 0;
    const sWidth  = Math.floor(sw * 0.64);
    const sHeight = Math.floor(sh * 0.50);

    function makeCropped(destW, destH) {
      const canvas = document.createElement('canvas');
      canvas.width  = destW;
      canvas.height = destH;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(sourceImg, sx, sy, sWidth, sHeight, 0, 0, destW, destH);
      return canvas.toDataURL('image/png');
    }

    // Sidebar logo
    const sidebarImg = document.getElementById('sidebar-logo-img');
    if (sidebarImg) sidebarImg.src = makeCropped(160, Math.round(160 * sHeight / sWidth));

    // Mobile logo
    const mobileImg = document.getElementById('mobile-logo-img');
    if (mobileImg) mobileImg.src = makeCropped(120, Math.round(120 * sHeight / sWidth));

    // Auth logo (on brand panel — keep inverted white version)
    const authImg = document.getElementById('auth-logo-img');
    if (authImg) authImg.src = makeCropped(240, Math.round(240 * sHeight / sWidth));
  };
  sourceImg.onerror = function() {
    // If image load fails (e.g. CORS), gracefully show text fallback
    ['sidebar-logo-img', 'mobile-logo-img', 'auth-logo-img'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
  };
  sourceImg.src = 'IMG_4233.JPG';
}

// Aguarda DOM pronto
document.addEventListener('DOMContentLoaded', () => {
  init();
  cropLogos();
});
