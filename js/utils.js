// ==========================================
// UTILS & HELPERS GLOBAIS (BLINDADO CONTRA NaN E NULL)
// ==========================================

const STORAGE_KEY = 'trote_app_v4';

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