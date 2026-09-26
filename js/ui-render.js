// ==========================================
// RENDERIZAÇÃO DE INTERFACE & GRÁFICOS (UI/UX PREMIUM)
// ==========================================

function renderizarTelas() {
    const navTabs = document.getElementById('nav-tabs');
    const btnConfig = document.getElementById('btn-config');
    
    if (!app.state) {
        navTabs.classList.remove('active');
        btnConfig.style.display = 'none';
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active-screen'));
        document.getElementById('screen-setup').classList.add('active-screen');
        
        const minDate = new Date(); minDate.setDate(minDate.getDate() + 28);
        document.getElementById('setup-data-alvo').value = getLocalISODate(minDate);
    } else {
        navTabs.classList.add('active');
        btnConfig.style.display = 'flex';
        switchTab('screen-today', 'tab-today');
        atualizarTelasGlobais();
        const simSlider = document.getElementById('sim-slider');
        if(simSlider) {
            simSlider.value = app.state.atleta.paceBaseSegundos;
            app.atualizarSimulador(simSlider.value);
        }
    }
}

window.switchTab = function(screenId, tabId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active-screen'));
    document.getElementById(screenId).classList.add('active-screen');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    
    if(screenId === 'screen-dashboard') {
        renderizarGrafico();
    }
};

function renderizarRacePredictor() {
    const elContainer = document.getElementById('ui-race-predictor');
    if (!elContainer || !app.state) return;
    const previsoes = app.calcularPrevisoesRiegel();
    if (!previsoes) return;
    elContainer.innerHTML = previsoes.map(p => `
        <div class="expanded-data-box" style="text-align: center;">
            <span>${p.prova}</span>
            <strong class="predictor-value">${p.tempoEstimado}</strong>
            <div class="predictor-pace">Pace: ${p.paceMedio}</div>
        </div>
    `).join('');
}

function renderizarTimelineFases() {
    if (!app.state || !app.state.plano || app.state.plano.length === 0) return '';
    const hojeISO = getLocalISODate();
    const fasesMap = {};
    app.state.plano.forEach(t => {
        const fase = t.fasePlano || 'Base Aeróbica';
        if (!fasesMap[fase]) fasesMap[fase] = { nome: fase, inicioISO: t.dataISO, fimISO: t.dataISO, treinos: [] };
        fasesMap[fase].fimISO = t.dataISO;
        fasesMap[fase].treinos.push(t);
    });
    const listaFases = Object.values(fasesMap);
    
    let html = `<div class="macro-card-standalone"><div class="macro-timeline-title">🛤️ Jornada do Macrociclo</div><div class="macro-timeline-scroll">`;
    listaFases.forEach(f => {
        const ehAtual = f.treinos.some(t => t.dataISO === hojeISO);
        const ehConcluido = f.treinos.every(t => t.concluido || t.dataISO < hojeISO);
        html += `
            <div class="phase-card ${ehAtual ? 'active-phase' : ''}">
                <span class="phase-chip ${ehAtual ? 'status-atual' : (ehConcluido ? 'status-concluido' : 'status-futuro')}">${ehAtual ? 'Fase Atual' : (ehConcluido ? 'Concluída' : 'Futura')}</span>
                <strong class="phase-card-title">${f.nome}</strong>
                <span class="phase-card-subtitle">${f.treinos.length} sessões</span>
            </div>`;
    });
    return html + `</div></div>`;
}

function renderizarGrafico() {
    if (!app.state || !app.state.atleta.historicoCTL) return;
    const ctx = document.getElementById('chart-carga');
    
    const hojeISO = getLocalISODate();
    const historicoCompleto = app.state.atleta.historicoCTL;
    const idxHoje = historicoCompleto.findIndex(h => h.dataISO === hojeISO);
    
    const inicioIdx = Math.max(0, idxHoje - 14);
    const fimIdx = Math.min(historicoCompleto.length, idxHoje + 30);
    const dadosJanela = historicoCompleto.slice(inicioIdx, fimIdx);
    
    const labels = dadosJanela.map(h => {
        const [, m, d] = h.dataISO.split('-');
        return `${d}/${m}`;
    });

    const canvasCtx = ctx.getContext('2d');
    const gradient = canvasCtx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(14, 165, 233, 0.35)');
    gradient.addColorStop(1, 'rgba(14, 165, 233, 0.0)');

    if (window.cargaChart) window.cargaChart.destroy();
    
    Chart.defaults.color = '#A1A1AA';
    Chart.defaults.font.family = "'Inter', sans-serif";
    
    window.cargaChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Fitness Real (CTL)',
                    data: dadosJanela.map(h => !h.ehFuturo ? h.ctl : null),
                    borderColor: '#0EA5E9',
                    backgroundColor: gradient,
                    borderWidth: 3,
                    tension: 0.35,
                    fill: true,
                    pointRadius: 0
                },
                {
                    label: 'Fitness Projetado (CTL)',
                    data: dadosJanela.map(h => h.ehFuturo || h.dataISO === hojeISO ? h.ctl : null),
                    borderColor: '#0EA5E9',
                    borderDash: [5, 5],
                    borderWidth: 2,
                    tension: 0.35,
                    pointRadius: 0
                },
                {
                    type: 'bar',
                    label: 'Forma (TSB)',
                    data: dadosJanela.map(h => (h.ctl - h.atl)),
                    backgroundColor: (context) => {
                        const val = context.raw;
                        return val > 0 ? 'rgba(16, 185, 129, 0.45)' : 'rgba(239, 68, 68, 0.45)';
                    },
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 10, usePointStyle: true } }
            },
            scales: {
                y: { grid: { color: 'rgba(255, 255, 255, 0.05)' } },
                x: { grid: { display: false } }
            }
        }
    });
}

function atualizarTelasGlobais() {
    if (!app.state) return;
    const hojeISO = getLocalISODate();
    const zonas = app.obterZonasKarvonen();

    _atualizarBotaoEsteira();
    renderizarCardHoje(hojeISO, zonas);
    renderizarMetricasFisiologicas();
    renderizarGaragem();
    renderizarHistorico();
    renderizarLogs();
    renderizarForecastCalendario(hojeISO, zonas);
    renderizarRacePredictor();
}

function _atualizarBotaoEsteira() {
    const btnEsteira = document.getElementById('btn-modo-esteira');
    const iconEsteira = document.getElementById('icon-modo-esteira');
    if (!btnEsteira || !iconEsteira || !app.state) return;

    const eEsteira = !!app.state.modoEsteira;
    iconEsteira.innerText = eEsteira ? '🏃‍♂️' : '🛣️';
    btnEsteira.setAttribute('title', eEsteira ? 'Modo Esteira (km/h)' : 'Modo Rua (Pace)');
    
    if (eEsteira) {
        btnEsteira.style.borderColor = 'var(--brand-accent)';
        btnEsteira.style.background = 'var(--brand-glow)';
    } else {
        btnEsteira.style.borderColor = '';
        btnEsteira.style.background = '';
    }
}

function _gerarHtmlProgressoSemanal(hojeISO) {
    const { start: weekStart, end: weekEnd } = obterLimitesDaSemana(hojeISO);
    
    let volPlanejadoSemana = 0;
    app.state.plano.forEach(t => {
        if (t.dataISO >= weekStart && t.dataISO <= weekEnd) volPlanejadoSemana += (t.distanciaBase * app.state.atleta.multiplicadorVolume);
    });
    
    let volRealizadoSemana = 0;
    app.state.treinosRealizados.forEach(t => {
        if (t.dataISO >= weekStart && t.dataISO <= weekEnd) volRealizadoSemana += t.dist;
    });
    
    const percentualVolume = volPlanejadoSemana > 0 ? Math.min(100, (volRealizadoSemana / volPlanejadoSemana) * 100) : 0;
    
    setTimeout(() => {
        const fill = document.querySelector('.weekly-progress-fill');
        if (fill) fill.style.width = `${percentualVolume}%`;
    }, 50);

    return `
        <div class="weekly-progress-container">
            <div class="weekly-progress-header">
                <span>Meta Semanal</span>
                <span>${volRealizadoSemana.toFixed(1)} / ${volPlanejadoSemana.toFixed(1)} km</span>
            </div>
            <div class="weekly-progress-bar">
                <div class="weekly-progress-fill" style="width: 0%;"></div>
            </div>
        </div>
    `;
}

function renderizarCardHoje(hojeISO, zonas) {
    const uiHoje = document.getElementById('ui-hoje');
    if (!uiHoje) return;
    uiHoje.classList.add('today-card');
    const progressHtml = _gerarHtmlProgressoSemanal(hojeISO);

    let treinoHoje = app.state.plano.find(t => t.dataISO === hojeISO && t.tipo !== "Descanso") || app.state.plano.find(t => t.dataISO === hojeISO);
    const dataFimISO = app.state.prova ? app.state.prova.dataStr : null;
    if (!treinoHoje && dataFimISO && hojeISO >= app.state.atleta.dataInicioISO && hojeISO <= dataFimISO) {
        treinoHoje = { dataISO: hojeISO, tipo: "Descanso", distanciaBase: 0, prescricao: "O ganho de performance ocorre no repouso.", estrutura: [], concluido: false };
    }

    if (!treinoHoje) {
        uiHoje.removeAttribute('data-intensity');
        uiHoje.innerHTML = `<div class="today-date">${formatarDataHoje()}</div><h2 class="today-type">Ciclo Concluído</h2><p class="today-desc">Jornada finalizada com sucesso!</p>`;
    } else if (treinoHoje.concluido) {
        uiHoje.removeAttribute('data-intensity');
        uiHoje.innerHTML = `<div class="today-date">${formatarDataHoje()}</div><h2 class="today-type">${treinoHoje.tipo}</h2><div class="today-done"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg></div><p class="today-desc">Sessão finalizada. Foco no descanso.</p>${progressHtml}`;
    } else if (treinoHoje.tipo === "Descanso") {
        uiHoje.removeAttribute('data-intensity');
        uiHoje.innerHTML = `<div class="today-date">${formatarDataHoje()}</div><h2 class="today-type">Recovery</h2><div class="today-rest"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg></div><p class="today-desc">O ganho de performance ocorre no repouso.</p>${progressHtml}`;
    } else {
        const tipo = treinoHoje.tipo;
        const ehTimeTrial = tipo.includes("Time Trial") || tipo.includes("Teste");
        const intensityKey = ehTimeTrial ? "timetrial" : (tipo.includes("Intervalado") || tipo.includes("Tiros") || tipo.includes("Subidas") ? "z5-tiros" : (tipo.includes("Tempo") || tipo.includes("Cruise") || tipo.includes("Fartlek") || tipo === "PROVA ALVO" ? "z3-z4" : "z1-z2"));
        uiHoje.setAttribute('data-intensity', intensityKey);
        
        const badgeValidation = ehTimeTrial ? `<div class="badge-timetrial">🔥 DIA DE VALIDAÇÃO</div>` : '';
        const distCalculada = parseFloat((treinoHoje.distanciaBase * app.state.atleta.multiplicadorVolume).toFixed(1));
        const infoZona = zonas[tipo] || {};
        const rotuloRitmo = app.state.modoEsteira ? 'Velocidade' : 'Pace';

        let htmlEstrutura = '';
        if (treinoHoje.estrutura && treinoHoje.estrutura.length > 0) {
            htmlEstrutura = `<div class="workout-structure"><div class="workout-structure-title">Execução Estruturada</div>` +
                treinoHoje.estrutura.map(bloco => `<div class="workout-block">${bloco}</div>`).join('') + `</div>`;
        }
        
        const lembreteForca = typeof app.obterTreinoForca === 'function' ? app.obterTreinoForca(hojeISO) : null;
        const hintForca = lembreteForca ? `<div class="card-lembrete-forca"><strong>💪 Lembrete de Força:</strong> Hoje é dia de <span class="text-highlight-forca">${lembreteForca}</span>.</div>` : '';

        const tenisIdSugerido = app.obterTenisSugerido(tipo);
        let nomeTenis = "Escolha um tênis";
        if(tenisIdSugerido) { const tF = app.state.atleta.tenis.find(t => t.id === tenisIdSugerido); if(tF) nomeTenis = tF.nome; }
        const hintTenis = app.state.atleta.tenis.length > 0 ? `<div class="hint-tenis">💡 Recomendação: <span class="text-highlight-tenis">${nomeTenis}</span></div>` : '';

        uiHoje.innerHTML = `
            ${badgeValidation}
            <div class="phase-badge">${treinoHoje.fasePlano || 'Ciclo de Treino'}</div>
            <div class="today-date">${formatarDataHoje()}</div>
            <h2 class="today-type" style="margin-top:4px;">${tipo}</h2>
            <div class="hero-distance-huge">${distCalculada}<span>km</span></div>
            <div class="today-metrics">
                <div class="today-metrics-card primary-metric"><div class="metric-tag">🎯 Target</div><div class="metric-label">${rotuloRitmo} Alvo</div><strong class="metric-val">${infoZona.pace || '-'}</strong></div>
                <div class="today-metrics-card secondary-metric"><div class="metric-label">Zona & FC Esperada</div><strong class="metric-val">${infoZona.fc || '-'}</strong></div>
            </div>
            <div class="guia-sensacao-box"><strong>🧭 Guia de Sensação:</strong><br>${infoZona.guia || ''}</div>
            ${htmlEstrutura}${hintForca}${hintTenis}
            <p class="today-desc today-desc-small">"${treinoHoje.prescricao}"</p>
            <button class="btn-giant" onclick="abrirTreino(${treinoHoje.id}, '${tipo}', ${distCalculada})">Registrar Treino</button>
            ${progressHtml}
        `;
    }

    if (app.state.emManutencao) {
        uiHoje.innerHTML += `
            <div style="margin-top: 16px; width: 100%;">
                <button class="btn-secondary" onclick="abrirModalNovaMeta()" style="border-color: var(--brand-accent); color: var(--brand-accent);">
                    🎯 Definir Próxima Prova Alvo
                </button>
            </div>
        `;
    }
}

function renderizarMetricasFisiologicas() {
    const ctl = app.state.atleta.ctl;
    const atl = app.state.atleta.atl;
    document.getElementById('val-ctl').innerText = Math.round(ctl);
    document.getElementById('val-atl').innerText = Math.round(atl);
    
    const acwr = ctl > 0 ? (atl / ctl).toFixed(2) : (0).toFixed(2);
    const acwrEl = document.getElementById('val-acwr');
    acwrEl.innerText = acwr;
    acwrEl.classList.remove('positive', 'warning', 'danger');
    if (acwr <= 1.3) acwrEl.classList.add('positive'); else if (acwr <= 1.5) acwrEl.classList.add('warning'); else acwrEl.classList.add('danger');
    
    const tsb = Math.round(app.state.atleta.tsb);
    const tsbEl = document.getElementById('val-tsb');
    tsbEl.innerText = tsb > 0 ? `+${tsb}` : tsb;
    tsbEl.classList.remove('positive', 'negative', 'danger');
    if (tsb >= -15 && tsb <= 10) tsbEl.classList.add('positive'); else if (tsb < -25) tsbEl.classList.add('danger'); else tsbEl.classList.add('negative');
    
    const foster = app.calcularMonotoniaEFoster();
    const monoEl = document.getElementById('val-monotonia');
    if (monoEl) {
        monoEl.innerText = foster.monotonia > 0 ? foster.monotonia : '--';
        monoEl.classList.remove('positive', 'warning', 'danger');
        if (foster.monotonia > 2.0) monoEl.classList.add('danger'); else if (foster.monotonia >= 1.5) monoEl.classList.add('warning'); else if (foster.monotonia > 0) monoEl.classList.add('positive');
    }

    const insightEl = document.getElementById('insight-coach');
    if (insightEl) {
        let insightMsg = "<strong>🧠 Coach Trote:</strong> Mantenha a consistência. Seu corpo está respondendo perfeitamente ao plano.";
        if (acwr > 1.5) insightMsg = "<strong>🧠 Coach Trote:</strong> Seu corpo acumulou muita fadiga rápido demais (ACWR alto). Reduza a intensidade e foque em recovery.";
        else if (tsb > 10) insightMsg = "<strong>🧠 Coach Trote:</strong> Você está fresco e recuperado! Excelente janela metabólica para quebrar recordes no treino de velocidade.";
        else if (tsb < -20) insightMsg = "<strong>🧠 Coach Trote:</strong> Fadiga alta detectada. Priorize sono, hidratação e respeite rigorosamente a zona do seu próximo regenerativo.";
        insightEl.innerHTML = insightMsg;
    }
}

// CENÁRIO 5: Notificação de advertência se 100% dos tênis estiverem esgotados/aposentados
function renderizarGaragem() {
    const uiGaragem = document.getElementById('ui-garagem');
    if (!uiGaragem) return;
    if (app.state.atleta.tenis.length === 0) {
        uiGaragem.innerHTML = '<p class="empty-state-text">Adicione seus tênis para rastrear o desgaste.</p>';
    } else {
        const catMap = { 'rodagem': '🏃 Rodagem', 'velocidade': '⚡ Velocidade', 'versatil': '👟 Versátil' };
        let htmlGaragem = app.state.atleta.tenis.map(t => {
            const warning = t.kmAcumulados > 600 && !t.aposentado ? '<span title="Desgaste alto!" style="margin-left:6px;">⚠️</span>' : '';
            const actionBtn = t.aposentado ? `<span class="shoe-badge-aposentado">Aposentado</span>` : `<button class="btn-icon-small btn-icon-small-garagem" onclick="aposentarTenis(${t.id})">Aposentar</button>`;
            return `
            <div class="shoe-card ${t.aposentado ? 'shoe-card-aposentado' : ''}">
                <div class="shoe-info"><strong>${t.nome} ${warning}</strong><span>${catMap[t.categoria] || t.categoria}</span>${actionBtn}</div>
                <div class="shoe-km">${t.kmAcumulados.toFixed(1)}<span>KM</span></div>
            </div>`;
        }).join('');

        const todosDesgastados = app.state.atleta.tenis.every(t => t.aposentado || t.kmAcumulados >= 600);
        if (todosDesgastados) {
            htmlGaragem += `
                <div class="insight-card" style="border-left-color: var(--danger); margin-top:12px; font-size:0.85rem;">
                    ⚠️ <strong>Atenção:</strong> Todos os seus tênis cadastrados estão aposentados ou ultrapassaram o limite crítico de 600 km. Cadastre um novo par para prevenir impacto excessivo nas articulações.
                </div>`;
        }
        uiGaragem.innerHTML = htmlGaragem;
    }
}

function renderizarHistorico() {
    const uiHistorico = document.getElementById('ui-historico');
    if (!uiHistorico) return;
    if (app.state.treinosRealizados.length === 0) {
        uiHistorico.innerHTML = '<p class="empty-state-text">Nenhum treino registrado ainda.</p>';
    } else {
        uiHistorico.innerHTML = [...app.state.treinosRealizados].reverse().slice(0, 10).map(t => {
            const [,m,d] = t.dataISO.split('-');
            const tr = app.state.atleta.tenis.find(x => x.id == t.tenisId);
            const nomeTenisLog = tr ? `<br><span class="log-tenis-historico">👟 ${tr.nome}</span>` : '';
            return `
            <div class="history-card">
                <div class="history-card-info">
                    <strong>${d}/${m}</strong> - ${t.dist}km (${app._minutosParaTempoString(t.tempoMin || 0)})<br>
                    <span>Carga Gerada: ${t.tss} TSS</span>${nomeTenisLog}
                </div>
                <div class="history-actions">
                    <button class="btn-icon-small btn-icon-small-edit" onclick="abrirEditarTreino('${t.idReferencia}', '${t.dataISO}')">Editar</button>
                    <button class="btn-icon-small" onclick="app.deletarTreino('${t.idReferencia}', '${t.dataISO}')">Excluir</button>
                </div>
            </div>`;
        }).join('');
    }
}

function renderizarLogs() {
    const feed = document.getElementById('feed-relatorios');
    if(feed) feed.innerHTML = app.state.logs.slice(0, 10).map(log => `<div class="log-entry"><span class="log-date">${log.data}</span>${log.msg}</div>`).join('');
}

function renderizarForecastCalendario(hojeISO, zonas) {
    const uiCalendario = document.getElementById('ui-calendario');
    if (!uiCalendario) return;
    
    let htmlCalendario = renderizarTimelineFases(); 
    app.state.plano.filter(t => t.dataISO >= hojeISO).slice(0, 7).forEach(treino => {
        const ehDescanso = treino.tipo === "Descanso";
        const [, m, d] = treino.dataISO.split('-');
        const distCalculada = parseFloat((treino.distanciaBase * app.state.atleta.multiplicadorVolume).toFixed(1));
        const paceAlvo = zonas[treino.tipo]?.pace || '-';
        const fcAlvo = zonas[treino.tipo]?.fc || '-';
        
        let htmlEstrutura = '';
        if (treino.estrutura && treino.estrutura.length > 0) {
            htmlEstrutura = `<div class="workout-structure-list">` + treino.estrutura.map(b => `<div class="workout-structure-item">${b}</div>`).join('') + `</div>`;
        }
        
        let iconStatus = treino.concluido ? `<div><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg></div>` : `<svg class="day-chevron" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
        let actionBtn = !treino.concluido ? `<button class="btn-outline-small" onclick="event.stopPropagation(); abrirModalReagendar(${treino.id}, '${treino.dataISO}')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg> Mudar Dia do Treino</button>` : '';
        
        const lembreteForca = typeof app.obterTreinoForca === 'function' ? app.obterTreinoForca(treino.dataISO) : null;
        let badgeForca = lembreteForca ? `<div class="badge-forca">💪 Musculação: ${lembreteForca}</div>` : '';

        htmlCalendario += `
        <div class="day-card ${treino.dataISO === hojeISO ? 'today' : ''} ${treino.concluido ? 'done' : ''}" onclick="this.classList.toggle('expanded')">
            <div class="day-card-header">
                <div class="day-info">
                    <div class="day-date">${treino.dataISO === hojeISO ? 'HOJE' : `${d}/${m}`}</div>
                    <div class="day-title">${treino.tipo}</div>
                    <div class="day-details">${treino.fasePlano || 'Ciclo Ativo'} ${!ehDescanso ? ` • Zonas: ${fcAlvo}` : ''}</div>
                </div>
                ${iconStatus}
            </div>
            <div class="day-expanded-content" onclick="event.stopPropagation()">
                ${!ehDescanso ? `<div class="expanded-grid"><div class="expanded-data-box"><span>Volume Base</span><strong>${distCalculada} km</strong></div><div class="expanded-data-box"><span>Pace Alvo</span><strong>${paceAlvo}</strong></div></div>${htmlEstrutura}<p class="forecast-desc-small">"${treino.prescricao}"</p>` : `<p class="forecast-desc-descanso">Dia reservado para adaptação fisiológica e flushing de metabólitos.</p>`}
                ${badgeForca}${actionBtn}
            </div>
        </div>`;
    });
    uiCalendario.innerHTML = htmlCalendario;
}

let semanasCarregadasMacrociclo = 0;
const SEMANAS_POR_PAGINA = 4;

window.abrirPlanoCompleto = function() {
    if(!app.state) return;
    semanasCarregadasMacrociclo = 0;
    
    const container = document.getElementById('container-plano-completo');
    container.innerHTML = '';
    
    const listaDiv = document.createElement('div');
    listaDiv.id = 'lista-macrociclo';
    container.appendChild(listaDiv);
    
    const btnCarregar = document.createElement('button');
    btnCarregar.className = 'btn-secondary';
    btnCarregar.id = 'btn-carregar-mais-macro';
    btnCarregar.innerText = 'Carregar mais semanas';
    btnCarregar.style.marginTop = '16px';
    btnCarregar.onclick = carregarMaisSemanasMacrociclo;
    
    container.appendChild(btnCarregar);
    
    carregarMaisSemanasMacrociclo();
    abrirModal('modal-plano');
};

function carregarMaisSemanasMacrociclo() {
    if(!app.state) return;
    const listaDiv = document.getElementById('lista-macrociclo');
    const btnCarregar = document.getElementById('btn-carregar-mais-macro');
    
    const diasTotaisDoPlano = app.state.plano.length;
    const diaInicial = semanasCarregadasMacrociclo * 7;
    const diaFinal = Math.min(diaInicial + (SEMANAS_POR_PAGINA * 7), diasTotaisDoPlano);
    
    if(diaInicial >= diasTotaisDoPlano) return;
    
    let htmlChunk = "";
    let semanaAtualNum = semanasCarregadasMacrociclo + 1;
    let treinosDaSemana = 0;
    
    for(let i = diaInicial; i < diaFinal; i++) {
        const treino = app.state.plano[i];
        if(!treino) continue;
        
        if (treinosDaSemana === 0) { 
            htmlChunk += `<div class="week-group"><div class="week-header"><span>Semana ${semanaAtualNum}</span></div>`;
        }
        
        const [, m, d] = treino.dataISO.split('-');
        
        htmlChunk += `
            <div class="day-card macro-day-card ${treino.concluido ? 'done' : ''}">
                <div class="day-card-header">
                    <div class="day-info">
                        <div class="day-date">${d}/${m}</div>
                        <div class="day-title macro-day-title">${treino.tipo} <span class="macro-day-dist">${treino.distanciaBase} km</span></div>
                    </div>
                </div>
            </div>`;
            
        treinosDaSemana++;
        
        if (treinosDaSemana === 7 || i === diaFinal - 1 || i === diasTotaisDoPlano - 1) {
            htmlChunk += `</div>`;
            semanaAtualNum++;
            treinosDaSemana = 0;
        }
    }
    
    listaDiv.insertAdjacentHTML('beforeend', htmlChunk);
    semanasCarregadasMacrociclo += SEMANAS_POR_PAGINA;
    
    if (semanasCarregadasMacrociclo * 7 >= diasTotaisDoPlano) {
        btnCarregar.style.display = 'none';
    }
}