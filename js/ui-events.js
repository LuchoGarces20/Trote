// ==========================================
// CONTROLADORES DE EVENTOS, MODAIS & BOOT (BLINDAGEM TOTAL)
// ==========================================

let currentWizardStep = 1;

window.changeWizardStep = function(direction) {
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

        if (currentWizardStep === 3) {
            const diasMarcados = document.querySelectorAll('input[name="setup-dias"]:checked');
            const warnStep3 = document.getElementById('setup-warning-step3');
            if (diasMarcados.length < 1) {
                if (warnStep3) {
                    warnStep3.style.display = 'block';
                    warnStep3.innerHTML = '⚠️ <b>Atenção:</b> Selecione pelo menos 1 dia de treino semanal para montar seu macrociclo.';
                }
                return;
            } else if (warnStep3) {
                warnStep3.style.display = 'none';
            }
        }
    }

    const stepAtualEl = document.getElementById(`step-${currentWizardStep}`);
    const dotAtualEl = document.getElementById(`dot-${currentWizardStep}`);
    
    if (stepAtualEl) stepAtualEl.classList.remove('active', 'slide-forward', 'slide-backward');
    if (dotAtualEl) dotAtualEl.classList.remove('active');

    currentWizardStep += direction;

    const proxStepEl = document.getElementById(`step-${currentWizardStep}`);
    const proxDotEl = document.getElementById(`dot-${currentWizardStep}`);

    if (proxStepEl && proxDotEl) {
        const animClass = direction > 0 ? 'slide-forward' : 'slide-backward';
        proxStepEl.className = `wizard-step active ${animClass}`;
        proxDotEl.classList.add('active');
    }
};

function verificarAvisosPasso4() {
    const elWarning = document.getElementById('setup-warning-step4');
    if (!elWarning) return;

    const volSemanal = Math.max(0, parseFloat(document.getElementById('setup-vol-semanal')?.value) || 0);
    const distAlvo = Math.max(1, parseFloat(document.getElementById('setup-dist-alvo')?.value) || 10);
    const dataAlvoStr = document.getElementById('setup-data-alvo')?.value;
    
    const distAtual = Math.max(0, parseFloat(document.getElementById('setup-dist-atual')?.value) || 0);
    const tempoAtual = Math.max(0, parseFloat(document.getElementById('setup-tempo-atual')?.value) || 0);
    const tipoMeta = document.getElementById('setup-tipo-meta')?.value || 'concluir';
    const tempoAlvoStr = document.getElementById('setup-tempo-alvo')?.value?.trim() || '';

    if (!dataAlvoStr) {
        elWarning.style.display = 'none';
        return;
    }

    const dAlvo = parseLocalDate(dataAlvoStr);
    const diasAteProva = Math.ceil((dAlvo - new Date()) / (1000 * 60 * 60 * 24));
    const semanasDisponiveis = Math.max(1, Math.floor(diasAteProva / 7));
    const fatorPiso = semanasDisponiveis >= 20 ? 0.35 : (semanasDisponiveis >= 12 ? 0.45 : 0.60);

    let msgs = [];

    if (distAlvo >= 21.1 && volSemanal < distAlvo * fatorPiso) {
        msgs.push(`⚠️ <b>Plano Blindado Ativo:</b> Seu volume semanal (${volSemanal} km) está abaixo da base sugerida para ${distAlvo} km. O Trote aplicará travas de progressão para prevenir lesões teciduais.`);
    }

    if (diasAteProva < 21 && diasAteProva > 0) {
        msgs.push(`⏳ <b>Polimento Imediato:</b> Sua prova é em menos de 3 semanas (${diasAteProva} dias). O macrociclo iniciará direto na fase de Tapering para descansar sua musculatura.`);
    }

    if (tipoMeta === 'tempo' && tempoAlvoStr && distAtual > 0 && tempoAtual > 0) {
        const validacao = CoachPlanner.validarMetaAgressiva(distAtual, tempoAtual, distAlvo, tempoAlvoStr);
        if (validacao && validacao.agressivo) {
            msgs.push(`🔥 <b>Meta Desafiadora (${validacao.percentual}% acima do baseline):</b> Pelo seu momento atual, a projeção de Riegel estima <b>${validacao.paceRiegel}/km</b>. Sua meta exige <b>${validacao.paceAlvo}/km</b>. O plano ajustará os ritmos graduais, mas atente-se à fadiga!`);
        }
    }

    if (msgs.length > 0) {
        elWarning.innerHTML = msgs.join('<br><br>');
        elWarning.style.display = 'block';
    } else {
        elWarning.style.display = 'none';
    }
}

['setup-vol-semanal', 'setup-dist-alvo', 'setup-data-alvo', 'setup-dist-atual', 'setup-tempo-atual', 'setup-tipo-meta', 'setup-tempo-alvo'].forEach(id => {
    const inputEl = document.getElementById(id);
    if (inputEl) {
        inputEl.addEventListener('change', verificarAvisosPasso4);
        inputEl.addEventListener('input', verificarAvisosPasso4);
    }
});

// ==========================================
// GERENCIAMENTO NATIVO DE MODAIS & NAVEGAÇÃO ANDROID
// ==========================================
window.abrirModal = function(idModal) {
    const modal = document.getElementById(idModal);
    if (modal && !modal.classList.contains('active')) {
        modal.classList.add('active');
        try { 
            history.pushState({ modalId: idModal }, ''); 
        } catch (e) {}
    }
};

window.fecharModal = function(idModal) {
    const modal = document.getElementById(idModal);
    if (modal && modal.classList.contains('active')) {
        modal.classList.remove('active');
        const card = modal.querySelector('.modal-card');
        if (card) card.style.transform = '';
        if (history.state && history.state.modalId === idModal) {
            history.back();
        }
    }
};

window.fecharModaisFora = function(event, idModal) {
    if (event.target === document.getElementById(idModal)) fecharModal(idModal);
};

// CONTROLE DO BOTÃO "VOLTAR" NATIVO DO ANDROID (POPSTATE)
window.addEventListener('popstate', () => {
    const modaisAbertos = document.querySelectorAll('.modal-overlay.active');
    if (modaisAbertos.length > 0) {
        const ultimoModal = modaisAbertos[modaisAbertos.length - 1];
        ultimoModal.classList.remove('active');
        const card = ultimoModal.querySelector('.modal-card');
        if (card) card.style.transform = '';
        return;
    }

    const screenToday = document.getElementById('screen-today');
    if (screenToday && !screenToday.classList.contains('active-screen')) {
        if (typeof switchTab === 'function') switchTab('screen-today', 'tab-today');
    }
});

// ==========================================
// GESTO DESLIZAR PARA BAIHO (SWIPE TO DISMISS)
// ==========================================
function inicializarGestoDeslizarModais() {
    document.querySelectorAll('.modal-card').forEach(card => {
        let startY = 0;
        let currentY = 0;
        let isDragging = false;

        card.addEventListener('touchstart', (e) => {
            if (card.scrollTop <= 0) {
                startY = e.touches[0].clientY;
                isDragging = true;
                card.style.transition = 'none';
            }
        }, { passive: true });

        card.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            currentY = e.touches[0].clientY;
            const deltaY = currentY - startY;

            if (deltaY > 0 && card.scrollTop <= 0) {
                card.style.transform = `translateY(${deltaY}px)`;
                if (e.cancelable) e.preventDefault();
            } else {
                isDragging = false;
                card.style.transform = '';
            }
        }, { passive: false });

        card.addEventListener('touchend', () => {
            if (!isDragging) return;
            isDragging = false;
            const deltaY = currentY - startY;
            card.style.transition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)';

            if (deltaY > 110) {
                const modalOverlay = card.closest('.modal-overlay');
                if (modalOverlay) {
                    fecharModal(modalOverlay.id);
                }
            } else {
                card.style.transform = '';
            }
            startY = 0;
            currentY = 0;
        }, { passive: true });
    });
}

// CONTROLE DO SELETOR VISUAL DE sRPE
window.selecionarSRPE = function(val) {
    const valNum = parseInt(val, 10) || 6;
    const inputRpe = document.getElementById('input-rpe');
    if (inputRpe) inputRpe.value = valNum;

    document.querySelectorAll('.srpe-btn').forEach(btn => {
        if (parseInt(btn.getAttribute('data-rpe'), 10) === valNum) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
};

window.abrirTreino = function(id, tipo, distCalculada) {
    abrirModal('modal-treino');
    const elId = document.getElementById('treino-id');
    const elEdit = document.getElementById('treino-edit-mode');
    const elDist = document.getElementById('input-dist');
    const elTempo = document.getElementById('input-tempo');
    const selectTenis = document.getElementById('input-treino-tenis');

    if (elId) elId.value = id;
    if (elEdit) elEdit.value = "false";

    const distNum = Math.max(0.01, parseFloat(distCalculada) || 0.01);
    if (elDist) elDist.value = distNum;

    const zonas = (app && typeof app.obterZonasKarvonen === 'function') ? app.obterZonasKarvonen() : {};
    let estimativaMin = 45;

    if (zonas[tipo] && zonas[tipo].pace && zonas[tipo].pace !== "-" && !zonas[tipo].pace.includes("Variado") && !zonas[tipo].pace.includes("Máx")) {
        const paceStr = zonas[tipo].pace.split(' ')[0].replace('/km', '');
        const paceSegundos = app._paceParaSegundos(paceStr);
        estimativaMin = (paceSegundos * distNum) / 60;
    } else if (app && app.state && app.state.atleta) {
        const baseSeg = Math.max(60, parseFloat(app.state.atleta.paceBaseSegundos) || 330);
        estimativaMin = (baseSeg * distNum) / 60;
    }

    if (elTempo) elTempo.value = app._minutosParaTempoString(estimativaMin);

    // Ajustar sRPE sugerido de acordo com o tipo
    let rpeSugerido = 6;
    if (tipo.includes("Regenerativo")) rpeSugerido = 2;
    else if (tipo.includes("Rodagem") || tipo.includes("Leve")) rpeSugerido = 4;
    else if (tipo.includes("Maratona")) rpeSugerido = 6;
    else if (tipo.includes("Limiar")) rpeSugerido = 8;
    else if (tipo.includes("Intervalado") || tipo.includes("Tiros")) rpeSugerido = 9;
    
    selecionarSRPE(rpeSugerido);

    if (selectTenis) {
        selectTenis.innerHTML = '';
        const tenisList = Array.isArray(app.state?.atleta?.tenis) ? app.state.atleta.tenis : [];
        const tenisAtivos = tenisList.filter(t => t && !t.aposentado);

        if (tenisAtivos.length === 0) {
            selectTenis.innerHTML = '<option value="">Nenhum tênis ativo</option>';
        } else {
            const idSugerido = app.obterTenisSugerido(tipo);
            tenisAtivos.forEach(t => {
                const isSelected = (t.id === idSugerido) ? 'selected' : '';
                selectTenis.innerHTML += `<option value="${t.id}" ${isSelected}>${t.nome}</option>`;
            });
        }
    }
};

// ==========================================
// AÇÕES DE GARAGEM DE TÊNIS (ADICIONAR / EDITAR / APOSENTAR)
// ==========================================
window.abrirAdicionarTenis = function() {
    const inputId = document.getElementById('input-tenis-id');
    const inputEdit = document.getElementById('input-tenis-edit-mode');
    const inputNome = document.getElementById('input-tenis-nome');
    const inputCat = document.getElementById('input-tenis-cat');
    const inputKm = document.getElementById('input-tenis-km');
    const modalTitulo = document.getElementById('modal-tenis-titulo');

    if (inputId) inputId.value = '';
    if (inputEdit) inputEdit.value = "false";
    if (inputNome) inputNome.value = '';
    if (inputCat) inputCat.value = 'versatil';
    if (inputKm) inputKm.value = '0.0';
    if (modalTitulo) modalTitulo.innerText = "Adicionar Tênis";

    abrirModal('modal-tenis');
};

window.abrirEditarTenis = function(id) {
    if (!app || !app.state || !Array.isArray(app.state.atleta?.tenis)) return;
    const tenis = app.state.atleta.tenis.find(t => t && t.id == id);
    if (!tenis) return;

    const inputId = document.getElementById('input-tenis-id');
    const inputEdit = document.getElementById('input-tenis-edit-mode');
    const inputNome = document.getElementById('input-tenis-nome');
    const inputCat = document.getElementById('input-tenis-cat');
    const inputKm = document.getElementById('input-tenis-km');
    const modalTitulo = document.getElementById('modal-tenis-titulo');

    if (inputId) inputId.value = tenis.id;
    if (inputEdit) inputEdit.value = "true";
    if (inputNome) inputNome.value = tenis.nome || '';
    if (inputCat) inputCat.value = tenis.categoria || 'versatil';
    if (inputKm) inputKm.value = tenis.kmAcumulados || 0;
    if (modalTitulo) modalTitulo.innerText = "Editar Tênis";

    abrirModal('modal-tenis');
};

document.getElementById('form-tenis')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('input-tenis-id')?.value;
    const ehEdicao = document.getElementById('input-tenis-edit-mode')?.value === "true";
    const nome = document.getElementById('input-tenis-nome')?.value;
    const cat = document.getElementById('input-tenis-cat')?.value;
    const km = parseFloat(document.getElementById('input-tenis-km')?.value) || 0;

    if (ehEdicao) {
        if (app && typeof app.editarTenis === 'function') {
            app.editarTenis(id, nome, cat, km);
        }
    } else {
        if (app && typeof app.adicionarTenis === 'function') {
            app.adicionarTenis(nome, cat, km);
        }
    }
    fecharModal('modal-tenis');
    e.target.reset();
    if (typeof atualizarTelasGlobais === 'function') atualizarTelasGlobais();
});

window.aposentarTenis = function(id) {
    if (confirm("Deseja aposentar este tênis? Os KMs ficarão salvos, mas ele sairá das opções de treino.")) {
        if (app && typeof app.aposentarTenis === 'function') {
            app.aposentarTenis(id);
            if (typeof atualizarTelasGlobais === 'function') atualizarTelasGlobais();
        }
    }
};

window.abrirConfig = function() {
    if (!app || !app.state || !app.state.atleta) return;
    const gen = document.getElementById('config-genero');
    const rep = document.getElementById('config-fc-repouso');
    const max = document.getElementById('config-fc-max');
    const pace = document.getElementById('config-pace-base');

    if (gen) gen.value = app.state.atleta.genero || 'M';
    if (rep) rep.value = app.state.atleta.fcRepouso || 60;
    if (max) max.value = app.state.atleta.fcMax || 185;
    if (pace) pace.value = app._segundosParaPace(app.state.atleta.paceBaseSegundos || 330);

    abrirModal('modal-config');
};

window.toggleMetaTempoInput = function(valor) {
    const grp = document.getElementById('group-tempo-alvo');
    if (grp) {
        grp.style.display = (valor === 'tempo') ? 'block' : 'none';
    }
    verificarAvisosPasso4();
};

window.resetarApp = function() {
    if (confirm("ATENÇÃO: Deseja destruir todo o seu histórico e recalibrar o motor?")) {
        if (app) app.resetState();
        location.reload();
    }
};

window.abrirModalReagendar = function(treinoId, dataAtualISO) {
    const elId = document.getElementById('reagendar-id');
    const elData = document.getElementById('reagendar-data');
    if (elId) elId.value = treinoId;
    if (elData) elData.value = dataAtualISO || getLocalISODate();
    abrirModal('modal-reagendar');
};

window.abrirEstrategiaProva = function() {
    if (!app || !app.state || !app.state.prova) return;
    const elDist = document.getElementById('est-distancia');
    const elTempo = document.getElementById('est-tempo');
    const elRes = document.getElementById('resultado-estrategia');

    const dist = Math.max(1, parseFloat(app.state.prova.distanciaKm) || 10);
    if (elDist) elDist.value = dist;

    const baseSeg = Math.max(60, parseFloat(app.state.atleta?.paceBaseSegundos) || 330);
    const minutosIdeais = Math.round((baseSeg * dist) / 60);
    const h = Math.floor(minutosIdeais / 60).toString().padStart(2, '0');
    const m = (minutosIdeais % 60).toString().padStart(2, '0');
    if (elTempo) elTempo.value = `${h}:${m}`;

    if (elRes) elRes.style.display = 'none';
    abrirModal('modal-estrategia');
};

window.abrirModalDiasTreino = function() {
    if (!app || !app.state) return;
    abrirModal('modal-dias-treino');
};

window.abrirEditarTreino = function(idRef, dataISO) {
    if (!app || !app.state || !Array.isArray(app.state.treinosRealizados)) return;
    const log = app.state.treinosRealizados.find(t => t && t.idReferencia == idRef && t.dataISO === dataISO);
    if (!log) return;

    abrirModal('modal-treino');
    const elId = document.getElementById('treino-id');
    const elEdit = document.getElementById('treino-edit-mode');
    const elDist = document.getElementById('input-dist');
    const elTempo = document.getElementById('input-tempo');
    const elFc = document.getElementById('input-fc');
    const selectTenis = document.getElementById('input-treino-tenis');

    if (elId) elId.value = idRef;
    if (elEdit) elEdit.value = "true";
    if (elDist) elDist.value = log.dist || 0;
    if (elTempo) elTempo.value = app._minutosParaTempoString(log.tempoMin || 0);
    if (elFc) elFc.value = log.fcMedia || '';
    
    selecionarSRPE(log.rpe || 6);

    if (selectTenis) {
        selectTenis.innerHTML = '';
        const tenisList = Array.isArray(app.state.atleta?.tenis) ? app.state.atleta.tenis : [];
        const tenisAtivos = tenisList.filter(t => t && !t.aposentado);
        tenisAtivos.forEach(t => {
            const isSelected = (t.id == log.tenisId) ? 'selected' : '';
            selectTenis.innerHTML += `<option value="${t.id}" ${isSelected}>${t.nome}</option>`;
        });
    }
};

window.finalizarOnboarding = function() {
    const dias = Array.from(document.querySelectorAll('input[name="setup-dias"]:checked'))
        .map(el => parseInt(el.value, 10))
        .filter(v => !isNaN(v));

    if (dias.length < 1) {
        const warnStep3 = document.getElementById('setup-warning-step3');
        if (warnStep3) {
            warnStep3.style.display = 'block';
            warnStep3.innerHTML = '⚠️ <b>Atenção:</b> Selecione pelo menos 1 dia de treino semanal para montar seu macrociclo.';
        }
        currentWizardStep = 3;
        document.querySelectorAll('.wizard-step').forEach(el => el.classList.remove('active', 'slide-forward', 'slide-backward'));
        document.querySelectorAll('.progress-dot').forEach(el => el.classList.remove('active'));
        document.getElementById('step-3')?.classList.add('active');
        document.getElementById('dot-3')?.classList.add('active');
        return;
    }

    const dataAlvoStr = document.getElementById('setup-data-alvo')?.value;
    if (!dataAlvoStr) {
        alert("Por favor, selecione a data da prova no Passo 4.");
        currentWizardStep = 4;
        document.querySelectorAll('.wizard-step').forEach(el => el.classList.remove('active', 'slide-forward', 'slide-backward'));
        document.querySelectorAll('.progress-dot').forEach(el => el.classList.remove('active'));
        document.getElementById('step-4')?.classList.add('active');
        document.getElementById('dot-4')?.classList.add('active');
        return;
    }

    const diasAteProva = Math.ceil((parseLocalDate(dataAlvoStr) - new Date()) / 86400000);
    if (diasAteProva < 14) return alert("Ciclo mínimo de preparação: 2 semanas.");
    if (diasAteProva > 365) return alert("O macrociclo máximo suportado é de 1 ano (365 dias).");

    const idade = Math.max(10, parseInt(document.getElementById('setup-idade')?.value, 10) || 30);
    const fcRepouso = Math.max(30, parseInt(document.getElementById('setup-fc-repouso')?.value, 10) || 60);
    const fcMaxInput = document.getElementById('setup-fc-max')?.value;
    const fcMax = fcMaxInput ? parseInt(fcMaxInput, 10) : (220 - idade);

    if (fcRepouso >= fcMax) return alert("A Frequência Cardíaca de Repouso deve ser obrigatoriamente menor que a FC Máxima.");

    const distAlvo = Math.max(1, parseFloat(document.getElementById('setup-dist-alvo')?.value) || 10);
    const volSemanal = Math.max(0, parseFloat(document.getElementById('setup-vol-semanal')?.value) || 10);
    const tipoMeta = document.getElementById('setup-tipo-meta') ? document.getElementById('setup-tipo-meta').value : 'concluir';
    const tempoAlvoStr = document.getElementById('setup-tempo-alvo') ? document.getElementById('setup-tempo-alvo').value.trim() : '';
    const tenisNome = (document.getElementById('setup-tenis-nome')?.value || '').trim();

    if (!tenisNome) {
        alert("Por favor, informe o modelo do seu tênis no Passo 5.");
        document.getElementById('setup-tenis-nome')?.focus();
        return;
    }

    const fazMusculacao = document.getElementById('setup-musculacao-faz') ? document.getElementById('setup-musculacao-faz').value === 'sim' : false;
    const diasMusc = fazMusculacao 
        ? Array.from(document.querySelectorAll('input[name="setup-dias-musc"]:checked')).map(el => parseInt(el.value, 10)).filter(v => !isNaN(v))
        : [];

    app.initSetup({
        nome: (document.getElementById('setup-nome')?.value || "Atleta").trim(),
        idade: idade,
        genero: document.getElementById('setup-genero')?.value || 'M',
        diasSelecionados: dias,
        distAlvo: distAlvo,
        dataAlvo: dataAlvoStr,
        distAtual: Math.max(0.1, parseFloat(document.getElementById('setup-dist-atual')?.value) || 10),
        tempoAtual: Math.max(1, parseInt(document.getElementById('setup-tempo-atual')?.value, 10) || 60),
        volSemanal: volSemanal,
        fcRepouso: fcRepouso,
        fcMax: fcMax,
        tenisNome: tenisNome,
        tenisCat: document.getElementById('setup-tenis-cat')?.value || 'versatil',
        tipoMeta: tipoMeta,
        tempoAlvoStr: tempoAlvoStr,
        fazMusculacao: fazMusculacao,
        divisaoMusculacao: document.getElementById('setup-musculacao-divisao') ? document.getElementById('setup-musculacao-divisao').value : 'ab',
        diasMusculacao: diasMusc
    });

    currentWizardStep = 1;
    document.querySelectorAll('.wizard-step').forEach(el => el.classList.remove('active', 'slide-forward', 'slide-backward'));
    document.querySelectorAll('.progress-dot').forEach(el => el.classList.remove('active'));
    document.getElementById('step-1')?.classList.add('active');
    document.getElementById('dot-1')?.classList.add('active');

    renderizarTelas();
    if (typeof showToast === 'function') showToast("🚀 Macrociclo gerado com sucesso! Bom treino!");
};

document.getElementById('form-treino')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const idTreino = document.getElementById('treino-id')?.value;
    const ehEdicao = document.getElementById('treino-edit-mode')?.value === "true";
    const tempoStr = document.getElementById('input-tempo')?.value;
    const tempoMin = app._tempoStringParaMinutos(tempoStr);
    const dist = Math.max(0.01, parseFloat(document.getElementById('input-dist')?.value) || 0.01);
    const fc = document.getElementById('input-fc')?.value;
    const rpe = parseInt(document.getElementById('input-rpe')?.value, 10) || 6;
    const tenisId = document.getElementById('input-treino-tenis')?.value;

    const treinoPlano = Array.isArray(app.state?.plano) ? app.state.plano.find(p => p && p.id == idTreino) : null;
    if (treinoPlano && treinoPlano.tipo === "PROVA ALVO" && !ehEdicao) {
        app.finalizarProvaEIniciarPosProva(parseInt(idTreino, 10), dist, tempoMin, rpe, tenisId, fc);
        fecharModal('modal-treino');
        atualizarTelasGlobais();
        if (typeof showToast === 'function') showToast("🏆 Parabéns pela Prova Concluída! Você entrou na Fase de Recuperação + Baseline.");
        return;
    }

    app.processarTreino(idTreino, dist, tempoMin, fc, rpe, tenisId, ehEdicao);
    fecharModal('modal-treino');
    e.target.reset();
    atualizarTelasGlobais();
});

document.getElementById('form-nova-meta')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const dist = document.getElementById('nova-dist-alvo')?.value;
    const dataAlvo = document.getElementById('nova-data-alvo')?.value;
    const tipoMeta = document.getElementById('novo-tipo-meta')?.value;
    const tempoAlvo = document.getElementById('novo-tempo-alvo')?.value;

    if (app && typeof app.definirNovaMeta === 'function') {
        app.definirNovaMeta(dist, dataAlvo, tipoMeta, tempoAlvo);
    }
    fecharModal('modal-nova-meta');
    if (typeof atualizarTelasGlobais === 'function') atualizarTelasGlobais();
    if (typeof showToast === 'function') showToast("🚀 Novo plano gerado com sucesso! Bom treino!");
});

window.abrirModalNovaMeta = function() {
    const minDate = new Date();
    minDate.setDate(minDate.getDate() + 28);
    const dateInput = document.getElementById('nova-data-alvo');
    if (dateInput) dateInput.value = getLocalISODate(minDate);
    abrirModal('modal-nova-meta');
};

document.getElementById('form-config')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!app || !app.state || !app.state.atleta) return;

    const gen = document.getElementById('config-genero')?.value;
    const rep = parseInt(document.getElementById('config-fc-repouso')?.value, 10);
    const max = parseInt(document.getElementById('config-fc-max')?.value, 10);
    const paceStr = document.getElementById('config-pace-base')?.value;

    app.state.atleta.genero = gen || 'M';
    app.state.atleta.fcRepouso = Math.max(30, rep || 60);
    app.state.atleta.fcMax = Math.max(app.state.atleta.fcRepouso + 10, max || 185);
    app.state.atleta.paceBaseSegundos = app._paceParaSegundos(paceStr);

    if (Array.isArray(app.state.logs)) {
        app.state.logs.unshift({ data: formatarDataHoje(), msg: `⚙️ Perfil Fisiológico atualizado. Zonas reajustadas.` });
    }

    app.saveState();
    fecharModal('modal-config');
    if (typeof atualizarTelasGlobais === 'function') atualizarTelasGlobais();
});

document.getElementById('form-reagendar')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const treinoId = parseInt(document.getElementById('reagendar-id')?.value, 10);
    const novaDataISO = document.getElementById('reagendar-data')?.value;

    if (!app || !app.state || !Array.isArray(app.state.plano)) return;
    const treino = app.state.plano.find(t => t && t.id === treinoId);
    if (treino) {
        const dataAntiga = treino.dataISO;
        treino.dataISO = novaDataISO;

        app.state.plano = app.state.plano.filter(t => t && !(t.dataISO === novaDataISO && t.tipo === "Descanso"));

        const temOutroTreinoDataAntiga = app.state.plano.some(t => t && t.dataISO === dataAntiga && t.id !== treinoId);
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

        if (Array.isArray(app.state.logs)) {
            app.state.logs.unshift({ 
                data: formatarDataHoje(), 
                msg: `📅 Agenda modificada: O ${treino.tipo} passou do dia ${formatoBrAntiga.substring(0,5)} para ${formatoBrNova.substring(0,5)}.` 
            });
        }

        app.saveState();
        fecharModal('modal-reagendar');

        app.rebalancearSemana(novaDataISO);
        app.recalcularLinhaDoTempo();
        if (typeof atualizarTelasGlobais === 'function') atualizarTelasGlobais();

        if (typeof showToast === 'function') {
            showToast("📅 Treino reagendado com sucesso!");
        }
    }
});

document.getElementById('form-estrategia')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const dist = parseFloat(document.getElementById('est-distancia')?.value);
    const tempoStr = document.getElementById('est-tempo')?.value || '';
    const tatic = document.getElementById('est-tatica')?.value;

    const partes = tempoStr.split(':').map(v => parseInt(v, 10));
    const hh = (!isNaN(partes[0])) ? partes[0] : 0;
    const mm = (!isNaN(partes[1])) ? partes[1] : 0;
    const totalSegundos = (hh * 3600) + (mm * 60);

    if (isNaN(totalSegundos) || totalSegundos <= 0 || isNaN(dist) || dist <= 0) return;

    const paceAlvoSeg = Math.round(totalSegundos / dist);
    const elResPace = document.getElementById('res-pace-alvo');
    if (elResPace) {
        elResPace.innerHTML = `${app._segundosParaPace(paceAlvoSeg)}<span style="font-size: 1rem; color: var(--text-tertiary);">/km</span>`;
    }

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

    const elBlocos = document.getElementById('res-blocos');
    if (elBlocos) elBlocos.innerHTML = htmlBlocos;

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

    const elNutricao = document.getElementById('res-nutricao');
    if (elNutricao) elNutricao.innerHTML = nutricaoText;

    const elResultado = document.getElementById('resultado-estrategia');
    if (elResultado) elResultado.style.display = 'block';
});

document.getElementById('form-dias-treino')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const dias = Array.from(document.querySelectorAll('input[name="update-dias"]:checked'))
        .map(el => parseInt(el.value, 10))
        .filter(v => !isNaN(v));

    if (dias.length < 1) return alert("Selecione pelo menos 1 dia de treino.");

    if (app && typeof app.atualizarDiasTreino === 'function') {
        app.atualizarDiasTreino(dias);
    }
    fecharModal('modal-dias-treino');
    if (typeof atualizarTelasGlobais === 'function') atualizarTelasGlobais();
    if (typeof showToast === 'function') showToast("📅 Dias de treino atualizados! O plano futuro foi reorganizado.");
});

document.addEventListener('DOMContentLoaded', () => {
    inicializarGestoDeslizarModais();
    if (typeof renderizarTelas === 'function') renderizarTelas();
});