// ==========================================
// CONTROLADORES DE EVENTOS, MODAIS & BOOT
// ==========================================

// Wizard de Onboarding (Com trava de validação por passo e animações bidirecionais)
let currentWizardStep = 1;

window.changeWizardStep = function(direction) {
    // 1. TRAVA DE VALIDAÇÃO POR PASSO (Avanço)
    if (direction > 0) {
        const stepAtual = document.getElementById(`step-${currentWizardStep}`);
        if (stepAtual) {
            const inputs = stepAtual.querySelectorAll('input[required], select[required]');
            let valido = true;

            for (const input of inputs) {
                if (!input.checkValidity()) {
                    input.reportValidity();
                    valido = false;
                    break;
                }
            }
            if (!valido) return;
        }

        // Validação específica de seleção de dias no Passo 3
        if (currentWizardStep === 3) {
            const diasMarcados = document.querySelectorAll('input[name="setup-dias"]:checked');
            const warnStep3 = document.getElementById('setup-warning-step3');
            if (diasMarcados.length < 2) {
                if (warnStep3) {
                    warnStep3.style.display = 'block';
                    warnStep3.innerHTML = '⚠️ <b>Atenção:</b> Selecione pelo menos 2 dias de treino semanal para montar seu macrociclo.';
                }
                return;
            } else if (warnStep3) {
                warnStep3.style.display = 'none';
            }
        }
    }

    // 2. DIRECIONALIDADE DAS ANIMAÇÕES
    const stepAtualEl = document.getElementById(`step-${currentWizardStep}`);
    const dotAtualEl = document.getElementById(`dot-${currentWizardStep}`);

    if (stepAtualEl) {
        stepAtualEl.classList.remove('active', 'slide-forward', 'slide-backward');
    }
    if (dotAtualEl) {
        dotAtualEl.classList.remove('active');
    }

    currentWizardStep += direction;

    const proxStepEl = document.getElementById(`step-${currentWizardStep}`);
    const proxDotEl = document.getElementById(`dot-${currentWizardStep}`);

    if (proxStepEl && proxDotEl) {
        const animClass = direction > 0 ? 'slide-forward' : 'slide-backward';
        proxStepEl.className = `wizard-step active ${animClass}`;
        proxDotEl.classList.add('active');
    }
};

// BANNER GLASSMORPHISM E AVALIAÇÃO EM TEMPO REAL NO PASSO 4
function verificarAvisosPasso4() {
    const elWarning = document.getElementById('setup-warning-step4');
    if (!elWarning) return;

    const volSemanal = parseFloat(document.getElementById('setup-vol-semanal')?.value) || 0;
    const distAlvo = parseFloat(document.getElementById('setup-dist-alvo')?.value) || 10;
    const dataAlvoStr = document.getElementById('setup-data-alvo')?.value;

    if (!dataAlvoStr || volSemanal <= 0) {
        elWarning.style.display = 'none';
        return;
    }

    const dAlvo = parseLocalDate(dataAlvoStr);
    const diasAteProva = Math.ceil((dAlvo - new Date()) / (1000 * 60 * 60 * 24));
    const semanasDisponiveis = Math.floor(diasAteProva / 7);
    const fatorPiso = semanasDisponiveis >= 20 ? 0.35 : (semanasDisponiveis >= 12 ? 0.45 : 0.60);

    let msgs = [];

    if (distAlvo >= 21.1 && volSemanal < distAlvo * fatorPiso) {
        msgs.push(`🛡️ <b>Plano Blindado Ativo:</b> Seu volume semanal (${volSemanal} km) está abaixo da base sugerida para ${distAlvo} km. O Trote aplicará travas de progressão para prevenir lesões teciduais.`);
    }

    if (diasAteProva < 21 && diasAteProva > 0) {
        msgs.push(`⏱️ <b>Polimento Imediato:</b> Sua prova é em menos de 3 semanas (${diasAteProva} dias). O macrociclo iniciará direto na fase de Tapering para descansar sua musculatura.`);
    }

    if (msgs.length > 0) {
        elWarning.innerHTML = msgs.join('<br><br>');
        elWarning.style.display = 'block';
    } else {
        elWarning.style.display = 'none';
    }
}

// OUVINTES DE EVENTOS NOS INPUTS DO PASSO 4 PARA FEEDBACK EM TEMPO REAL
['setup-vol-semanal', 'setup-dist-alvo', 'setup-data-alvo'].forEach(id => {
    const inputEl = document.getElementById(id);
    if (inputEl) {
        inputEl.addEventListener('change', verificarAvisosPasso4);
        inputEl.addEventListener('input', verificarAvisosPasso4);
    }
});

// Funções de Modais Globais
window.abrirModal = function(idModal) { history.pushState({ modalId: idModal }, ''); document.getElementById(idModal).classList.add('active'); };
window.fecharModal = function(idModal) { document.getElementById(idModal).classList.remove('active'); };
window.fecharModaisFora = function(event, idModal) { 
    if (event.target === document.getElementById(idModal)) fecharModal(idModal); 
};

window.abrirTreino = function(id, tipo, distCalculada) {
    abrirModal('modal-treino');
    document.getElementById('treino-id').value = id; 
    document.getElementById('treino-edit-mode').value = "false";
    document.getElementById('input-dist').value = distCalculada;
    
    const zonas = app.obterZonasKarvonen();
    let estimativaMin = 45; 
    if(zonas[tipo] && zonas[tipo].pace !== "-" && !zonas[tipo].pace.includes("Variado") && !zonas[tipo].pace.includes("Máx")) {
        const paceStr = zonas[tipo].pace.split(' ')[0].replace('/km', '');
        const paceSegundos = app._paceParaSegundos(paceStr);
        estimativaMin = (paceSegundos * distCalculada) / 60;
    } else {
        estimativaMin = (app.state.atleta.paceBaseSegundos * distCalculada) / 60;
    }
    document.getElementById('input-tempo').value = app._minutosParaTempoString(estimativaMin);
    
    const selectTenis = document.getElementById('input-treino-tenis');
    selectTenis.innerHTML = '';
    const tenisAtivos = app.state.atleta.tenis.filter(t => !t.aposentado);
    
    if(tenisAtivos.length === 0) {
        selectTenis.innerHTML = '<option value="">Nenhum tênis ativo</option>';
    } else {
        const idSugerido = app.obterTenisSugerido(tipo);
        tenisAtivos.forEach(t => {
            const isSelected = (t.id === idSugerido) ? 'selected' : '';
            selectTenis.innerHTML += `<option value="${t.id}" ${isSelected}>${t.nome}</option>`;
        });
    }
};

window.aposentarTenis = function(id) {
    if(confirm("Deseja aposentar este tênis? Os KMs ficarão salvos, mas ele sairá das opções de treino.")) {
        const t = app.state.atleta.tenis.find(x => x.id === id);
        if(t) t.aposentado = true;
        app.saveState();
        atualizarTelasGlobais();
    }
};

window.abrirConfig = function() {
    if (!app.state) return;
    document.getElementById('config-genero').value = app.state.atleta.genero;
    document.getElementById('config-fc-repouso').value = app.state.atleta.fcRepouso;
    document.getElementById('config-fc-max').value = app.state.atleta.fcMax;
    document.getElementById('config-pace-base').value = app._segundosParaPace(app.state.atleta.paceBaseSegundos);
    abrirModal('modal-config');
};

window.toggleMetaTempoInput = function(valor) {
    const grp = document.getElementById('group-tempo-alvo');
    if (grp) {
        grp.style.display = (valor === 'tempo') ? 'block' : 'none';
    }
};

window.resetarApp = function() {
    if(confirm("ATENÇÃO: Deseja destruir todo o seu histórico e recalibrar o motor?")) {
        localStorage.removeItem(STORAGE_KEY);
        location.reload();
    }
};

window.abrirModalReagendar = function(treinoId, dataAtualISO) {
    document.getElementById('reagendar-id').value = treinoId;
    document.getElementById('reagendar-data').value = dataAtualISO;
    abrirModal('modal-reagendar');
};

window.abrirEstrategiaProva = function() {
    if(!app.state) return;
    document.getElementById('est-distancia').value = app.state.prova.distancia;
    const minutosIdeais = Math.round((app.state.atleta.paceBaseSegundos * app.state.prova.distancia) / 60);
    const h = Math.floor(minutosIdeais / 60).toString().padStart(2, '0');
    const m = (minutosIdeais % 60).toString().padStart(2, '0');
    document.getElementById('est-tempo').value = `${h}:${m}`;
    
    document.getElementById('resultado-estrategia').style.display = 'none';
    abrirModal('modal-estrategia');
};

window.abrirModalDiasTreino = function() {
    if (!app.state) return;
    abrirModal('modal-dias-treino');
};

window.abrirEditarTreino = function(idRef, dataISO) {
    const log = app.state.treinosRealizados.find(t => t.idReferencia == idRef && t.dataISO === dataISO);
    const treinoPlano = app.state.plano.find(p => p.id == idRef && p.dataISO === dataISO);
    if (!log || !treinoPlano) return;

    abrirModal('modal-treino');
    document.getElementById('treino-id').value = idRef;
    document.getElementById('treino-edit-mode').value = "true";
    document.getElementById('input-dist').value = log.dist;
    document.getElementById('input-tempo').value = app._minutosParaTempoString(log.tempoMin || 0);
    document.getElementById('input-fc').value = log.fcMedia || '';
    document.getElementById('input-rpe').value = log.rpeReal || 6;

    const selectTenis = document.getElementById('input-treino-tenis');
    selectTenis.innerHTML = '';
    const tenisAtivos = app.state.atleta.tenis.filter(t => !t.aposentado);
    tenisAtivos.forEach(t => {
        const isSelected = (t.id == log.tenisId) ? 'selected' : '';
        selectTenis.innerHTML += `<option value="${t.id}" ${isSelected}>${t.nome}</option>`;
    });
};

// Listeners de Formulários
document.getElementById('form-tenis')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const nome = document.getElementById('input-tenis-nome').value;
    const cat = document.getElementById('input-tenis-cat').value;
    
    app.adicionarTenis(nome, cat);
    fecharModal('modal-tenis');
    e.target.reset();
    atualizarTelasGlobais();
});

// SUBMISSÃO FLUIDA DO SETUP (SEM POP-UPS NATIVOS E COM VALIDAÇÃO DE DIAS)
document.getElementById('form-setup')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const dias = Array.from(document.querySelectorAll('input[name="setup-dias"]:checked')).map(el => parseInt(el.value));
    if (dias.length < 2) {
        const warnStep3 = document.getElementById('setup-warning-step3');
        if (warnStep3) {
            warnStep3.style.display = 'block';
            warnStep3.innerHTML = '⚠️ <b>Atenção:</b> Selecione pelo menos 2 dias de treino semanal para montar seu macrociclo.';
        }
        return;
    }
    
    const dataAlvoStr = document.getElementById('setup-data-alvo').value;
    const distAlvo = parseFloat(document.getElementById('setup-dist-alvo').value) || 10;
    const volSemanal = parseFloat(document.getElementById('setup-vol-semanal').value) || 20;
    const tipoMeta = document.getElementById('setup-tipo-meta') ? document.getElementById('setup-tipo-meta').value : 'concluir';
    const tempoAlvoStr = document.getElementById('setup-tempo-alvo') ? document.getElementById('setup-tempo-alvo').value.trim() : '';

    app.initSetup({
        nome: document.getElementById('setup-nome').value.trim() || "Atleta", 
        idade: parseInt(document.getElementById('setup-idade').value) || 30,
        genero: document.getElementById('setup-genero').value,
        diasSelecionados: dias,
        distAlvo: distAlvo,
        dataAlvo: dataAlvoStr, 
        distAtual: parseFloat(document.getElementById('setup-dist-atual').value) || 10,
        tempoAtual: parseInt(document.getElementById('setup-tempo-atual').value) || 60, 
        volSemanal: volSemanal,
        fcRepouso: parseInt(document.getElementById('setup-fc-repouso').value) || 60,
        fcMax: document.getElementById('setup-fc-max').value,
        tenisNome: document.getElementById('setup-tenis-nome').value.trim() || "Tênis Principal",
        tenisCat: document.getElementById('setup-tenis-cat').value,
        tipoMeta: tipoMeta,
        tempoAlvoStr: tempoAlvoStr
    });
    
    currentWizardStep = 1;
    document.querySelectorAll('.wizard-step').forEach(el => el.classList.remove('active', 'slide-forward', 'slide-backward'));
    document.querySelectorAll('.progress-dot').forEach(el => el.classList.remove('active'));
    document.getElementById('step-1')?.classList.add('active');
    document.getElementById('dot-1')?.classList.add('active');

    renderizarTelas();
});

document.getElementById('form-treino')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const ehEdicao = document.getElementById('treino-edit-mode').value === "true";
    const tempoStr = document.getElementById('input-tempo').value;
    const tempoMin = app._tempoStringParaMinutos(tempoStr);

    app.processarTreino(
        document.getElementById('treino-id').value,
        parseFloat(document.getElementById('input-dist').value),
        tempoMin,
        parseInt(document.getElementById('input-fc').value),
        parseInt(document.getElementById('input-rpe').value),
        document.getElementById('input-treino-tenis').value,
        ehEdicao
    );
    fecharModal('modal-treino');
    e.target.reset();
    atualizarTelasGlobais();

    const ultimoTreino = app.state.treinosRealizados[app.state.treinosRealizados.length - 1];
    if(ultimoTreino) {
        showToast(ehEdicao ? "✏️ Treino atualizado com sucesso!" : `🔥 Treino salvo! Você gerou <strong>${ultimoTreino.tss} TSS</strong>. Seu Fitness subiu!`);
    }
});

document.getElementById('form-config')?.addEventListener('submit', (e) => {
    e.preventDefault();
    app.state.atleta.genero = document.getElementById('config-genero').value;
    app.state.atleta.fcRepouso = parseInt(document.getElementById('config-fc-repouso').value);
    app.state.atleta.fcMax = parseInt(document.getElementById('config-fc-max').value);
    app.state.atleta.paceBaseSegundos = app._paceParaSegundos(document.getElementById('config-pace-base').value);
    
    app.state.logs.unshift({ data: new Date().toLocaleDateString('pt-BR'), msg: `Perfil Fisiológico atualizado. Zonas reajustadas.` });
    app.saveState();
    fecharModal('modal-config');
    atualizarTelasGlobais();
});

document.getElementById('form-reagendar')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const treinoId = parseInt(document.getElementById('reagendar-id').value);
    const novaDataISO = document.getElementById('reagendar-data').value;

    const treino = app.state.plano.find(t => t.id === treinoId);
    if(treino) {
        const dataAntiga = treino.dataISO;
        treino.dataISO = novaDataISO;

        // Limpa treinos de Descanso antigos na nova data destino se existirem
        app.state.plano = app.state.plano.filter(t => !(t.dataISO === novaDataISO && t.tipo === "Descanso"));

        // Garante que a data de origem fique preenchida com Descanso se ficou sem treinos
        const temOutroTreinoDataAntiga = app.state.plano.some(t => t.dataISO === dataAntiga && t.id !== treinoId);
        if (!temOutroTreinoDataAntiga) {
            app.state.plano.push({
                id: Date.now(),
                dataISO: dataAntiga,
                tipo: "Descanso",
                distanciaBase: 0,
                prescricao: "Dia de descanso.",
                estrutura: [],
                concluido: false
            });
        }

        app.state.plano.sort((a, b) => new Date(a.dataISO) - new Date(b.dataISO));

        const formatoBrAntiga = dataAntiga.split('-').reverse().join('/');
        const formatoBrNova = novaDataISO.split('-').reverse().join('/');
        app.state.logs.unshift({ 
            data: new Date().toLocaleDateString('pt-BR'), 
            msg: `Agenda modificada: O ${treino.tipo} passou do dia ${formatoBrAntiga.substring(0,5)} para ${formatoBrNova.substring(0,5)}.` 
        });

        app.saveState();
        fecharModal('modal-reagendar');
        
        app.rebalancearSemana(novaDataISO);
        app.recalcularLinhaDoTempo();
        atualizarTelasGlobais();
        
        if (typeof showToast === 'function') {
            showToast("Treino reagendado com sucesso! 🗓️");
        }
    }
});

document.getElementById('form-estrategia')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const dist = parseFloat(document.getElementById('est-distancia').value);
    const tempoStr = document.getElementById('est-tempo').value;
    const tatic = document.getElementById('est-tatica').value;
    
    const partes = tempoStr.split(':');
    const hh = parseInt(partes[0]) || 0;
    const mm = parseInt(partes[1]) || 0;
    
    const totalSegundos = (hh * 3600) + (mm * 60);
    
    if (isNaN(totalSegundos) || totalSegundos <= 0 || isNaN(dist) || dist <= 0) return;
    
    const paceAlvoSeg = Math.round(totalSegundos / dist);
    
    document.getElementById('res-pace-alvo').innerHTML = `${app._segundosParaPace(paceAlvoSeg)}<span style="font-size: 1rem; color: var(--text-tertiary);">/km</span>`;
    
    let htmlBlocos = "";
    
    if (tatic === "negative") {
        const pace1 = app._segundosParaPace(paceAlvoSeg + 10);
        const km1 = (dist * 0.3).toFixed(1);
        htmlBlocos += `<div class="expanded-data-box" style="border-left: 3px solid var(--text-tertiary);"><span>Do km 0 ao ${km1} (Conservador)</span><strong>${pace1} /km</strong><p style="font-size:0.75rem; color:var(--text-secondary); margin-top:4px;">Segure a emoção. Poupe glicogênio e deixe os apressados passarem (+10s do alvo).</p></div>`;
        
        const pace2 = app._segundosParaPace(paceAlvoSeg);
        const km2 = (dist * 0.75).toFixed(1);
        htmlBlocos += `<div class="expanded-data-box" style="border-left: 3px solid var(--warning);"><span>Do km ${km1} ao ${km2} (Cruzeiro)</span><strong>${pace2} /km</strong><p style="font-size:0.75rem; color:var(--text-secondary); margin-top:4px;">Entre no ritmo. Concentre-se na respiração e economize energia.</p></div>`;
        
        const pace3 = app._segundosParaPace(paceAlvoSeg - 12);
        htmlBlocos += `<div class="expanded-data-box" style="border-left: 3px solid var(--brand-accent); background: var(--brand-glow);"><span>Do km ${km2} até a Chegada (Ataque)</span><strong>${pace3} /km</strong><p style="font-size:0.75rem; color:var(--text-secondary); margin-top:4px;">Negative split! Deixe tudo na pista, você tem energia de sobra (-12s do alvo).</p></div>`;
    } else {
        htmlBlocos += `<div class="expanded-data-box" style="border-left: 3px solid var(--brand-accent);"><span>Do Km 0 ao Km ${dist}</span><strong>${app._segundosParaPace(paceAlvoSeg)} /km</strong><p style="font-size:0.75rem; color:var(--text-secondary); margin-top:4px;">Seja um relógio suíço. Crave esse pace a cada quilômetro.</p></div>`;
    }
    
    document.getElementById('res-blocos').innerHTML = htmlBlocos;
    
    const tempoTotalMins = totalSegundos / 60;
    let nutricaoText = "";
    
    if (tempoTotalMins <= 50) {
        nutricaoText = "Prova rápida. Foque apenas em hidratação nos postos de água. Seu glicogênio muscular dá conta do recado.";
    } else if (tempoTotalMins <= 90) {
        nutricaoText = "Leve <b>1 carbogel</b> para tomar por volta do minuto 40. Tome com pequenos goles de água.";
    } else {
        const qtdGeis = Math.floor(tempoTotalMins / 40);
        nutricaoText = `Leve <b>${qtdGeis} carbogeis</b>. Tome 1 sachê a cada 40-45 min. Em provas assim longas, considere também cápsulas de sal.`;
    }
    
    document.getElementById('res-nutricao').innerHTML = nutricaoText;
    document.getElementById('resultado-estrategia').style.display = 'block';
});

document.getElementById('form-dias-treino')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const dias = Array.from(document.querySelectorAll('input[name="update-dias"]:checked')).map(el => parseInt(el.value));
    if (dias.length < 2) return alert("Selecione pelo menos 2 dias de treino.");

    app.atualizarDiasTreino(dias);
    fecharModal('modal-dias-treino');
    atualizarTelasGlobais();
    showToast("🗓️ Dias de treino atualizados! O plano futuro foi reorganizado.");
});

// Suporte a Navegação e Botão Voltar (Android / PWA)
window.addEventListener('popstate', () => {
    const modaisAbertos = document.querySelectorAll('.modal-overlay.active');
    if (modaisAbertos.length > 0) {
        const ultimoModal = modaisAbertos[modaisAbertos.length - 1];
        ultimoModal.classList.remove('active');
        return;
    }

    const screenToday = document.getElementById('screen-today');
    if (screenToday && !screenToday.classList.contains('active-screen')) {
        switchTab('screen-today', 'tab-today');
    }
});

// Inicialização da aplicação
renderizarTelas();