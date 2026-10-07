// ==========================================
// UTILS & HELPERS GLOBAIS (BLINDADO CONTRA NaN E NULL)
// ==========================================

const STORAGE_KEY = 'trote_app_v4';

// Zero é um valor válido; somente ausência/valor não finito usa o padrão.
function numeroFinito(valor, padrao = 0) {
    const numero = parseFloat(valor);
    return Number.isFinite(numero) ? numero : padrao;
}

function decomporTempoSegundos(segundos) {
    const total = Math.max(0, Math.round(numeroFinito(segundos, 0)));
    return { total, horas: Math.floor(total / 3600), minutos: Math.floor(total / 60) % 60, segundos: total % 60 };
}

function formatarPaceSegundos(segundos, preencherMinutos = true) {
    const total = Math.max(1, Math.round(numeroFinito(segundos, 300)));
    const minutos = String(Math.floor(total / 60));
    return `${preencherMinutos ? minutos.padStart(2, '0') : minutos}:${String(total % 60).padStart(2, '0')}`;
}

function formatarDuracaoMinutos(minutos) {
    const tempo = decomporTempoSegundos(numeroFinito(minutos, 0) * 60);
    const segundos = tempo.segundos > 0 ? `${String(tempo.segundos).padStart(2, '0')}s` : '';
    return tempo.horas > 0
        ? `${tempo.horas}h${String(tempo.minutos).padStart(2, '0')}m${segundos}`
        : `${tempo.minutos}m${segundos}`;
}

// Validação estrita sem deixar o Date normalizar 31/02 para março.
function ehDataISOValida(dataISO) {
    if (typeof dataISO !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dataISO)) return false;
    const [ano, mes, dia] = dataISO.split('-').map(Number);
    if (ano < 1) return false;
    const data = new Date(0);
    data.setFullYear(ano, mes - 1, dia);
    data.setHours(0, 0, 0, 0);
    return data.getFullYear() === ano && data.getMonth() === mes - 1 && data.getDate() === dia;
}

// Mesma regra no onboarding, na nova meta e no gerador: 14 a 365 dias civis.
function validarDataMeta(dataAlvoISO, dataInicioISO = getLocalISODate()) {
    if (!ehDataISOValida(dataAlvoISO) || !ehDataISOValida(dataInicioISO)) {
        return { ok: false, mensagem: 'Informe uma data de prova válida.' };
    }
    const dias = diferencaDiasISO(dataInicioISO, dataAlvoISO);
    if (dias < 14) return { ok: false, mensagem: 'Escolha uma prova com pelo menos 14 dias de preparação.' };
    if (dias > 365) return { ok: false, mensagem: 'O macrociclo máximo suportado é de 365 dias.' };
    return { ok: true, dias };
}

const themeToggleBtn = document.getElementById('theme-toggle');
const body = document.body;

function applyTheme(themeName) {
    const validTheme = (themeName === 'dark' || themeName === 'light') ? themeName : 'dark';
    body.setAttribute('data-theme', validTheme);

    try {
        localStorage.setItem('trote_theme', validTheme);
    } catch (e) {
        console.warn("localStorage inacessível para salvar tema:", e);
    }

    const themeColorMeta = document.getElementById('theme-color-meta');
    if (themeColorMeta) {
        themeColorMeta.setAttribute('content', validTheme === 'dark' ? '#121212' : '#F4F5F7');
    }

    const brandLogo = document.getElementById('brand-logo-img');
    const favicon = document.querySelector('link[rel="icon"]');
    const isDark = validTheme === 'dark';

    if (brandLogo) {
        brandLogo.src = isDark ? 'img/Trote-logo.svg' : 'img/Trote-logo-light.svg';
    }
    if (favicon) {
        favicon.href = isDark ? 'img/Trote-logo.svg' : 'img/Trote-logo-light.svg';
    }
}

const systemPrefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
let savedTheme = 'dark';
try {
    savedTheme = localStorage.getItem('trote_theme') || (systemPrefersDark ? 'dark' : 'light');
} catch (e) {
    savedTheme = systemPrefersDark ? 'dark' : 'light';
}
applyTheme(savedTheme);

if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
        applyTheme(body.getAttribute('data-theme') === 'light' ? 'dark' : 'light');
    });
}

function getLocalISODate(d = new Date()) {
    let dateObj = (d instanceof Date && !isNaN(d.getTime())) ? d : new Date(d);
    if (isNaN(dateObj.getTime())) {
        dateObj = new Date();
    }
    const tzOffset = dateObj.getTimezoneOffset() * 60000;
    return new Date(dateObj.getTime() - tzOffset).toISOString().split('T')[0];
}

function parseLocalDate(isoString) {
    if (!isoString || typeof isoString !== 'string') return new Date();
    const partes = isoString.split('-').map(v => parseInt(v, 10));
    if (partes.length < 3 || partes.some(isNaN)) return new Date();
    const [y, m, d] = partes;
    const dateCandidate = new Date(y, m - 1, d);
    return isNaN(dateCandidate.getTime()) ? new Date() : dateCandidate;
}

// ISSUE 13: Cálculo limpo de fuso UTC para não pular dias em transições de Horário de Verão
function diferencaDiasISO(isoA, isoB) {
    if (!isoA || !isoB) return 0;
    const dA = parseLocalDate(isoA);
    const dB = parseLocalDate(isoB);
    const utcA = Date.UTC(dA.getFullYear(), dA.getMonth(), dA.getDate());
    const utcB = Date.UTC(dB.getFullYear(), dB.getMonth(), dB.getDate());
    return Math.round((utcB - utcA) / 86400000);
}

function obterLimitesDaSemana(dateStr) {
    const d = parseLocalDate(dateStr);
    const rawDay = d.getDay();
    const day = rawDay === 0 ? 7 : rawDay; 
    const diffToMon = day - 1;
    const diffToSun = 7 - day;
    
    const start = new Date(d); 
    start.setDate(d.getDate() - diffToMon);
    
    const end = new Date(d); 
    end.setDate(d.getDate() + diffToSun);
    
    return { start: getLocalISODate(start), end: getLocalISODate(end) };
}

function formatarDataHoje() {
    const dias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const d = new Date();
    return `${dias[d.getDay()]}, ${d.getDate()} ${meses[d.getMonth()]}`;
}

window.showToast = function(msg) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.innerHTML = String(msg || '');
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 4000);
};
