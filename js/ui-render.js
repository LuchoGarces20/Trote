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
            <strong style="color: var(--brand-accent); font-size: 1.2rem;">${p.tempoEstimado}</strong>
            <div style="font-size: 0.75rem; color: var(--text-tertiary); margin-top: 2px;">Pace: ${p.paceMedio}</div>
        </div>
    `).join('');
}

function renderizarTimelineFases() {
    if (!app.state || !app.state.plano || app.state.plano.length === 0) return '';

    const hojeISO = getLocalISODate();
    const fasesMap = {};

    app.state.plano.forEach(t => {
        const fase = t.fasePlano || 'Base Aeróbica';
        if (!fasesMap[fase]) {
            fasesMap[fase] = { nome: fase, inicioISO: t.dataISO, fimISO: t.dataISO, treinos: [] };
        }
        fasesMap[fase].fimISO = t.dataISO;
        fasesMap[fase].treinos.push(t);
    });

    const listaFases = Object.values(fasesMap);
    
    let html = `
        <div class="macro-card-standalone">
            <div style="font-size: 0.78rem; font-weight: 800; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 10px;">🗺️ Jornada do Macrociclo</div>
            <div class="macro-timeline-scroll">
    `;

    listaFases.forEach(f => {
        const ehAtual = f.treinos.some(t => t.dataISO === hojeISO);
        const ehConcluido = f.treinos.every(t => t.concluido || t.dataISO < hojeISO);
        
        let chipClass = "status-futuro";
        let chipLabel = "Futura";

        if (ehAtual) {
            chipClass = "status-atual";
            chipLabel = "Fase Atual";
        } else if (ehConcluido) {
            chipClass = "status-concluido";
            chipLabel = "Concluída";
        }

        html += `
            <div class="phase-card ${ehAtual ? 'active-phase' : ''}">
                <span class="phase-chip ${chipClass}">${chipLabel}</span>
                <strong style="font-size: 0.85rem; color: var(--text-primary); margin-top: 4px;">${f.nome}</strong>
                <span style="font-size: 0.72rem; color: var(--text-tertiary);">${f.treinos.length} sessões</span>
            </div>
        `;
    });

    html += `</div></div>`;
    return html;
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
    const btnEsteira = document.getElementById('btn-modo-esteira');
    const iconEsteira = document.getElementById('icon-modo-esteira');
    
    if (btnEsteira && iconEsteira && app.state) {
        const eEsteira = !!app.state.modoEsteira;
        iconEsteira.innerText = eEsteira ? '📟' : '🏃';
        btnEsteira.setAttribute('title', eEsteira ? 'Modo Esteira (km/h)' : 'Modo Rua (Pace)');
        
        if (eEsteira) {
            btnEsteira.style.borderColor = 'var(--brand-accent)';
            btnEsteira.style.background = 'var(--brand-glow)';
        } else {
            btnEsteira.style.borderColor = '';
            btnEsteira.style.background = '';
        }
    }

    const hojeISO = getLocalISODate();
    const zonas = app.obterZonasKarvonen();
    const uiHoje = document.getElementById('ui-hoje');
    
    uiHoje.classList.add('today-card');

    // 1. Tratamento seguro para localizar o treino de hoje
    let treinoHoje = app.state.plano.find(t => t.dataISO === hojeISO && t.tipo !== "Descanso");
    if (!treinoHoje) {
        treinoHoje = app.state.plano.find(t => t.dataISO === hojeISO);
    }

    // Se hoje está no intervalo do plano mas a data ficou sem registro (devido a um reagendamento)
    const dataInicioISO = app.state.atleta.dataInicioISO;
    const dataFimISO = app.state.prova ? app.state.prova.dataStr : null;

    if (!treinoHoje && dataFimISO && hojeISO >= dataInicioISO && hojeISO <= dataFimISO) {
        treinoHoje = {
            dataISO: hojeISO,
            tipo: "Descanso",
            distanciaBase: 0,
            prescricao: "O ganho de performance ocorre no repouso.",
            estrutura: [],
            concluido: false
        };
    }

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
    
    const progressHtml = `
        <div class="weekly-progress-container">
            <div class="weekly-progress-header">
                <span>Meta Semanal</span>
                <span>${volRealizadoSemana.toFixed(1)} / ${volPlanejadoSemana.toFixed(1)} km</span>
            </div>
            <div class="weekly-progress-bar">
                <div class="weekly-progress-fill" style="width: ${percentualVolume}%;"></div>
            </div>
        </div>
    `;

    // Renderização do Hero Card Principal (Hoje)
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
        const ehZ5 = tipo.includes("Intervalado") || tipo.includes("Tiros") || tipo.includes("Subidas");
        const ehZ3Z4 = tipo.includes("Tempo") || tipo.includes("Cruise") || tipo.includes("Fartlek") || tipo === "PROVA ALVO";

        let intensityKey = "z1-z2";
        if (ehTimeTrial) intensityKey = "timetrial";
        else if (ehZ5) intensityKey = "z5-tiros";
        else if (ehZ3Z4) intensityKey = "z3-z4";

        uiHoje.setAttribute('data-intensity', intensityKey);

        const badgeValidation = ehTimeTrial ? `<div class="badge-timetrial">🔥 DIA DE VALIDAÇÃO</div>` : '';
        const distCalculada = parseFloat((treinoHoje.distanciaBase * app.state.atleta.multiplicadorVolume).toFixed(1));
        
        let htmlEstrutura = '';
        if (treinoHoje.estrutura && treinoHoje.estrutura.length > 0) {
            htmlEstrutura = `<div class="workout-structure"><div class="workout-structure-title">Execução Estruturada</div>` +
                  treinoHoje.estrutura.map(bloco => `<div class="workout-block">${bloco}</div>`).join('') + `</div>`;
        }
        
        const tenisIdSugerido = app.obterTenisSugerido(treinoHoje.tipo);
        let nomeTenisSugerido = "Escolha um tênis";
        if(tenisIdSugerido) {
            const tFound = app.state.atleta.tenis.find(t => t.id === tenisIdSugerido);
            if(tFound) nomeTenisSugerido = tFound.nome;
        }
        let hintTenis = app.state.atleta.tenis.length > 0 
            ? `<div style="margin-bottom: 20px; font-size: 0.82rem; color: var(--text-primary); font-weight: 700;">👟 Recomendação: <span style="color: var(--brand-accent); font-weight: 600;">${nomeTenisSugerido}</span></div>`
            : '';
            
        const nomeFase = treinoHoje.fasePlano || 'Ciclo de Treino';
        const eEsteira = app.state.modoEsteira || false;
        const rotuloRitmo = eEsteira ? 'Velocidade' : 'Pace';
        const infoZona = zonas[treinoHoje.tipo] || {};
        const guiaPercepcao = infoZona.guia || '';

        const cardPaceHtml = `
            <div class="today-metrics-card primary-metric">
                <div class="metric-tag">🎯 Target</div>
                <div class="metric-label">${rotuloRitmo} Alvo</div>
                <strong class="metric-val">${infoZona.pace || '-'}</strong>
            </div>`;
            
        const cardFcHtml = `
            <div class="today-metrics-card secondary-metric">
                <div class="metric-label">Zona & FC Esperada</div>
                <strong class="metric-val">${infoZona.fc || '-'}</strong>
            </div>`;

        uiHoje.innerHTML = `
            ${badgeValidation}
            <div class="phase-badge">${nomeFase}</div>
            <div class="today-date">${formatarDataHoje()}</div>
            <h2 class="today-type" style="margin-top:4px;">${treinoHoje.tipo}</h2>
            
            <div class="hero-distance-huge">${distCalculada}<span>km</span></div>
            
            <div class="today-metrics">
                ${cardPaceHtml}
                ${cardFcHtml}
            </div>
            
            <div style="background: rgba(255,255,255,0.03); padding: 12px 16px; border-radius: var(--radius-sm); font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 20px; text-align: left; border-left: 3px solid var(--brand-accent);">
                <strong>💡 Guia de Sensação:</strong><br>${guiaPercepcao}
            </div>

            ${htmlEstrutura}
            ${hintTenis}
            
            <p class="today-desc" style="font-size:0.85rem;">"${treinoHoje.prescricao}"</p>
            <button class="btn-giant" onclick="abrirTreino(${treinoHoje.id}, '${treinoHoje.tipo}', ${distCalculada})">Registrar Treino</button>
            ${progressHtml}
        `;
        
        setTimeout(() => {
            const fill = document.querySelector('.weekly-progress-fill');
            if(fill) fill.style.width = `${percentualVolume}%`;
        }, 50);
    }
    
    const ctl = app.state.atleta.ctl;
    const atl = app.state.atleta.atl;
    document.getElementById('val-ctl').innerText = Math.round(ctl);
    document.getElementById('val-atl').innerText = Math.round(atl);
    
    const acwr = ctl > 0 ? (atl / ctl).toFixed(2) : (0).toFixed(2);
    const acwrEl = document.getElementById('val-acwr');
    acwrEl.innerText = acwr;
    acwrEl.classList.remove('positive', 'warning', 'danger');
    if (acwr <= 1.3) acwrEl.classList.add('positive');
    else if (acwr <= 1.5) acwrEl.classList.add('warning');
    else acwrEl.classList.add('danger');
    
    const tsb = Math.round(app.state.atleta.tsb);
    const tsbEl = document.getElementById('val-tsb');
    tsbEl.innerText = tsb > 0 ? `+${tsb}` : tsb;
    tsbEl.classList.remove('positive', 'negative', 'danger');
    if (tsb >= -15 && tsb <= 10) tsbEl.classList.add('positive'); 
    else if (tsb < -25) tsbEl.classList.add('danger'); 
    else tsbEl.classList.add('negative'); 

    const foster = app.calcularMonotoniaEFoster();
    const monoEl = document.getElementById('val-monotonia');
    if (monoEl) {
        monoEl.innerText = foster.monotonia > 0 ? foster.monotonia : '--';
        monoEl.classList.remove('positive', 'warning', 'danger');
        
        if (foster.monotonia > 2.0) monoEl.classList.add('danger');
        else if (foster.monotonia >= 1.5) monoEl.classList.add('warning');
        else if (foster.monotonia > 0) monoEl.classList.add('positive');
    }

    const insightEl = document.getElementById('insight-coach');
    if (insightEl) {
        let insightMsg = "<strong>🤖 Coach Trote:</strong> Mantenha a consistência. Seu corpo está respondendo perfeitamente ao plano.";
        if (acwr > 1.5) insightMsg = "<strong>⚠️ Coach Trote:</strong> Seu corpo acumulou muita fadiga rápido demais (ACWR alto). Reduza a intensidade e foque em recovery.";
        else if (tsb > 10) insightMsg = "<strong>🚀 Coach Trote:</strong> Você está fresco e recuperado! Excelente janela metabólica para quebrar recordes no treino de velocidade.";
        else if (tsb < -20) insightMsg = "<strong>📉 Coach Trote:</strong> Fadiga alta detectada. Priorize sono, hidratação e respeite rigorosamente a zona do seu próximo regenerativo.";
        
        insightEl.innerHTML = insightMsg;
    }

    const uiGaragem = document.getElementById('ui-garagem');
    if (app.state.atleta.tenis.length === 0) {
        uiGaragem.innerHTML = '<p style="color: var(--text-tertiary); font-size: 0.85rem;">Adicione seus tênis para rastrear o desgaste.</p>';
    } else {
        const catMap = { 'rodagem': '🏃 Rodagem', 'velocidade': '⚡ Velocidade', 'versatil': '🔄 Versátil' };
        
        uiGaragem.innerHTML = app.state.atleta.tenis.map(t => {
            const warning = t.kmAcumulados > 600 && !t.aposentado ? '<span title="Desgaste alto!" style="margin-left:6px;">⚠️</span>' : '';
            const aposentadoStyle = t.aposentado ? 'opacity: 0.5; filter: grayscale(1);' : '';
            const actionBtn = t.aposentado ? 
                `<span style="font-size:0.7rem; color: var(--text-tertiary); margin-top: 8px; display: inline-block;">Aposentado</span>` : 
                `<button class="btn-icon-small" style="margin-top: 8px;" onclick="aposentarTenis(${t.id})">Aposentar</button>`;

            return `
            <div class="shoe-card" style="${aposentadoStyle}">
                <div class="shoe-info">
                    <strong>${t.nome} ${warning}</strong>
                    <span>${catMap[t.categoria] || t.categoria}</span>
                    ${actionBtn}
                </div>
                <div class="shoe-km">
                    ${t.kmAcumulados.toFixed(1)}<span>KM</span>
                </div>
            </div>`;
        }).join('');
    }

    const uiHistorico = document.getElementById('ui-historico');
    if (app.state.treinosRealizados.length === 0) {
        uiHistorico.innerHTML = '<p style="color: var(--text-tertiary); font-size: 0.85rem;">Nenhum treino registrado ainda.</p>';
    } else {
        uiHistorico.innerHTML = [...app.state.treinosRealizados].reverse().slice(0, 10).map(t => {
            const [,m,d] = t.dataISO.split('-');
            let nomeTenisLog = "";
            if(t.tenisId) {
                const tr = app.state.atleta.tenis.find(x => x.id == t.tenisId);
                if(tr) nomeTenisLog = `<br><span style="font-size:0.75rem; color:var(--brand-accent);">👟 ${tr.nome}</span>`;
            }
            return `
            <div class="history-card">
                <div class="history-card-info">
                    <strong>${d}/${m}</strong> - ${t.dist}km (${app._minutosParaTempoString(t.tempoMin || 0)})<br>
                    <span>Carga Gerada: ${t.tss} TSS</span>
                    ${nomeTenisLog}
                </div>
                <div style="display: flex; gap: 6px;">
                    <button class="btn-icon-small" style="border-color: var(--brand-accent); color: var(--brand-accent);" onclick="abrirEditarTreino('${t.idReferencia}', '${t.dataISO}')">Editar</button>
                    <button class="btn-icon-small" onclick="app.deletarTreino('${t.idReferencia}', '${t.dataISO}')">Excluir</button>
                </div>
            </div>`;
        }).join('');
    }

    const feed = document.getElementById('feed-relatorios');
    feed.innerHTML = app.state.logs.slice(0, 10).map(log => `<div class="log-entry"><span class="log-date">${log.data}</span>${log.msg}</div>`).join('');

    // Renderiza a Jornada do Macrociclo em seu card próprio antes do Forecast
    const uiCalendario = document.getElementById('ui-calendario');
    const timelineFasesHtml = renderizarTimelineFases();
    
    let htmlCalendario = `${timelineFasesHtml}`; 
    app.state.plano.filter(t => t.dataISO >= hojeISO).slice(0, 7).forEach(treino => {
        const ehHoje = treino.dataISO === hojeISO;
        const ehDescanso = treino.tipo === "Descanso";
        const [, m, d] = treino.dataISO.split('-');
        
        const distCalculada = parseFloat((treino.distanciaBase * app.state.atleta.multiplicadorVolume).toFixed(1));
        const paceAlvo = zonas[treino.tipo]?.pace || '-';
        const fcAlvo = zonas[treino.tipo]?.fc || '-';

        let htmlEstrutura = '';
        if (treino.estrutura && treino.estrutura.length > 0) {
            htmlEstrutura = `<div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 12px; display: flex; flex-direction: column; gap: 6px;">` +
                treino.estrutura.map(b => `<div style="padding-left:10px; border-left:2px solid var(--brand-solid);">${b}</div>`).join('') +
            `</div>`;
        }

        const nomeFaseCalendario = treino.fasePlano || 'Ciclo Ativo';

        let iconStatus = treino.concluido 
            ? `<div><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg></div>` 
            : `<svg class="day-chevron" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>`;

        let actionBtn = !treino.concluido 
            ? `<button class="btn-outline-small" onclick="event.stopPropagation(); abrirModalReagendar(${treino.id}, '${treino.dataISO}')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg> Mudar Dia do Treino</button>` 
            : '';

        htmlCalendario += `
        <div class="day-card ${ehHoje ? 'today' : ''} ${treino.concluido ? 'done' : ''}" onclick="this.classList.toggle('expanded')">
            <div class="day-card-header">
                <div class="day-info">
                    <div class="day-date">${ehHoje ? 'HOJE' : `${d}/${m}`}</div>
                    <div class="day-title">${treino.tipo}</div>
                    <div class="day-details">${nomeFaseCalendario} ${!ehDescanso ? `• Zonas: ${fcAlvo}` : ''}</div>
                </div>
                ${iconStatus}
            </div>

            <div class="day-expanded-content" onclick="event.stopPropagation()">
                ${!ehDescanso ? `
                <div class="expanded-grid">
                    <div class="expanded-data-box"><span>Volume Base</span><strong>${distCalculada} km</strong></div>
                    <div class="expanded-data-box"><span>Pace Alvo</span><strong>${paceAlvo}</strong></div>
                </div>
                ${htmlEstrutura}
                <p style="font-size: 0.8rem; color: var(--text-tertiary); margin-top: 14px; font-style: italic;">"${treino.prescricao}"</p>
                ` : `<p style="font-size: 0.85rem; color: var(--text-secondary);">Dia reservado para adaptação fisiológica e flushing de metabólitos.</p>`}
                
                ${actionBtn}
            </div>
        </div>`;
    });
    uiCalendario.innerHTML = htmlCalendario;
    
    renderizarRacePredictor();
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
            <div class="day-card ${treino.concluido ? 'done' : ''}" style="margin-bottom:6px; padding:12px 14px; cursor: default;">
                <div class="day-card-header">
                    <div class="day-info">
                        <div class="day-date">${d}/${m}</div>
                        <div class="day-title" style="font-size: 0.9rem;">${treino.tipo} <span style="font-size: 0.75rem; color: var(--text-tertiary); font-weight: normal; margin-left: 6px;">${treino.distanciaBase} km</span></div>
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