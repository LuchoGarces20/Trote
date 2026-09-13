// ==========================================
// UTILS & HELPERS GLOBAIS
// ==========================================
const STORAGE_KEY = 'trote_app_v4';

// Gestão de Tema
const themeToggleBtn = document.getElementById('theme-toggle');
const body = document.body;

function applyTheme(themeName) {
    body.setAttribute('data-theme', themeName);
    localStorage.setItem('trote_theme', themeName);

    const themeColorMeta = document.getElementById('theme-color-meta');
    if (themeColorMeta) {
        themeColorMeta.setAttribute('content', themeName === 'dark' ? '#121212' : '#F4F5F7');
    }

    const brandLogo = document.getElementById('brand-logo-img');
    const favicon = document.querySelector('link[rel="icon"]');
    const isDark = themeName === 'dark';

    if (brandLogo) {
        brandLogo.src = isDark ? 'img/Trote-logo.svg' : 'img/Trote-logo-light.svg';
    }
    if (favicon) {
        favicon.href = isDark ? 'img/Trote-logo.svg' : 'img/Trote-logo-light.svg';
    }
}

const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const savedTheme = localStorage.getItem('trote_theme') || (systemPrefersDark ? 'dark' : 'light');

applyTheme(savedTheme);

if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
        applyTheme(body.getAttribute('data-theme') === 'light' ? 'dark' : 'light');
    });
}

// Utilitários de Data ISO e Calendário
function getLocalISODate(d = new Date()) {
    const tzOffset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tzOffset).toISOString().split('T')[0];
}

function parseLocalDate(isoString) {
    if(!isoString) return new Date();
    const [y, m, d] = isoString.split('-');
    return new Date(y, m - 1, d);
}

function obterLimitesDaSemana(dateStr) {
    const d = parseLocalDate(dateStr);
    const day = d.getDay() === 0 ? 7 : d.getDay(); 
    const diffToMon = day - 1;
    const diffToSun = 7 - day;

    const start = new Date(d); start.setDate(d.getDate() - diffToMon);
    const end = new Date(d); end.setDate(d.getDate() + diffToSun);
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
    toast.innerHTML = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 4000);
};