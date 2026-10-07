// ==========================================
// GERENCIADOR DE ESTADO & CONTROLADOR (STATE - BLINDAGEM TOTAL)
// ==========================================

class RunningCoach {
    constructor() {
        this.STORAGE_KEY = 'trote_coach_state_v2';
        this.BACKUP_SEED_KEY = 'trote_coach_state_v2_backup_seed_v1';
        this._backupLegadoPendente = null;
        this.state = null;
        this.loadState();
    }

    loadState() {
        try {
            const saved = localStorage.getItem(this.STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed && typeof parsed === 'object') {
                    this.state = parsed;
                    if (!this._seedFisiologiaValido(parsed.fisiologiaSeed)) this._backupLegadoPendente = saved;
                    this._garantirIntegridadeEstrutural();
                    this._garantirSeedFisiologia();
                    this.verificarDestreinamentoEgressor();
                    this.recalcularFisiologia();
                    this.saveState();
                } else {
                    this.state = null;
                }
            }
        } catch (e) {
            console.error("Erro ao carregar estado do localStorage:", e);
            this.state = null;
        }
    }

    saveState() {
        if (!this.state) return;
        try {
            // Guarda o JSON original antes da primeira conversão do seed legado.
            // Se o backup falhar, não sobrescreve a única cópia persistida.
            if (this._backupLegadoPendente !== null) {
                if (localStorage.getItem(this.BACKUP_SEED_KEY) === null) {
                    localStorage.setItem(this.BACKUP_SEED_KEY, this._backupLegadoPendente);
                }
            }
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.state));
            this._backupLegadoPendente = null;
            return true;
        } catch (e) {
            console.error("Erro ao salvar estado no localStorage:", e);
            if (typeof showToast === 'function') showToast("Não foi possível salvar. Não feche o app até liberar espaço e tentar novamente.");
            return false;
        }
    }

    resetState() {
        try {
            localStorage.removeItem(this.STORAGE_KEY);
        } catch (e) {
            console.warn("Erro ao limpar localStorage:", e);
        }
        this.state = null;
    }

    _garantirIntegridadeEstrutural() {
        if (!this.state || typeof this.state !== 'object') {
            this.state = {};
        }
        if (!this.state.atleta || typeof this.state.atleta !== 'object') {
            this.state.atleta = {};
        }
        if (!this.state.prova || typeof this.state.prova !== 'object') {
            this.state.prova = { distanciaKm: 10, dataStr: getLocalISODate(), tipoMeta: 'concluir', tempoAlvoStr: '' };
        }

        const a = this.state.atleta;
        if (!Array.isArray(a.tenis)) a.tenis = [];
        if (!Array.isArray(a.historicoCTL)) a.historicoCTL = [];
        if (!Array.isArray(a.diasTreino)) a.diasTreino = [2, 4, 0];
        if (!Array.isArray(a.diasMusculacao)) a.diasMusculacao = [];

        a.ctl = Math.max(0, numeroFinito(a.ctl, 20));
        a.atl = Math.max(0, numeroFinito(a.atl, 20));
        a.tsb = parseFloat(a.tsb) || 0;
        a.volSemanal = Math.max(0, numeroFinito(a.volSemanal, 10));
        a.fcRepouso = Math.max(30, parseInt(a.fcRepouso, 10) || 60);
        a.fcMax = Math.max(a.fcRepouso + 10, parseInt(a.fcMax, 10) || 185);
        a.paceBaseSegundos = Math.max(60, parseInt(a.paceBaseSegundos, 10) || 330);
        a.multiplicadorVolume = Math.max(0.5, Math.min(2, numeroFinito(a.multiplicadorVolume, 1)));
        a.fazMusculacao = !!a.fazMusculacao;
        a.divisaoMusculacao = a.divisaoMusculacao || 'nenhum';
        a.faseRegeneracaoAbsoluta = !!a.faseRegeneracaoAbsoluta;

        if (!Array.isArray(this.state.plano)) this.state.plano = [];
        if (!Array.isArray(this.state.treinosRealizados)) this.state.treinosRealizados = [];
        if (!Array.isArray(this.state.logs)) this.state.logs = [];
        CoachPlanner.sincronizarEstruturasPlano(this.state.plano);

        if (this.state.modoEsteira === undefined) this.state.modoEsteira = false;
        if (this.state.emManutencao === undefined) this.state.emManutencao = false;
    }

    initSetup(d) {
        const inputData = d || {};
        const validacao = validarDataMeta(inputData.dataAlvo);
        if (!validacao.ok) return validacao;
        const distAtualSanitizada = Math.max(0.1, parseFloat(inputData.distAtual) || 10);
        const tempoAtualSanitizado = Math.max(1, parseFloat(inputData.tempoAtual) || 60);
        const paceBaseSegundos = Math.round((tempoAtualSanitizado * 60) / distAtualSanitizada);
        
        let diasMusc = Array.isArray(inputData.diasMusculacao) ? inputData.diasMusculacao : [];
        if (inputData.fazMusculacao && diasMusc.length === 0) {
            diasMusc = [1, 3, 5];
        }
        
        const volSemanal = Math.max(0, numeroFinito(inputData.volSemanal, 10));
        const ctlInferido = Math.min(85, Math.max(15, (volSemanal * 0.90)));
        const atlInferido = ctlInferido * 1.05;
        const idade = Math.max(10, parseInt(inputData.idade, 10) || 30);
        const fcRepouso = Math.max(30, parseInt(inputData.fcRepouso, 10) || 60);
        const fcMax = inputData.fcMax ? parseInt(inputData.fcMax, 10) : (220 - idade);
        
        const dadosAtleta = {
            nome: String(inputData.nome || 'Atleta'),
            idade: idade,
            genero: inputData.genero === 'F' ? 'F' : 'M',
            diasTreino: Array.isArray(inputData.diasSelecionados) ? inputData.diasSelecionados : [2, 4, 0],
            volSemanal: volSemanal,
            multiplicadorVolume: 1.0,
            fcRepouso: fcRepouso,
            fcMax: Math.max(fcRepouso + 10, fcMax),
            paceBaseSegundos: Math.max(60, paceBaseSegundos),
            fazMusculacao: !!inputData.fazMusculacao,
            divisaoMusculacao: inputData.divisaoMusculacao || 'nenhum',
            diasMusculacao: diasMusc,
            dataInicioISO: getLocalISODate(),
            tenis: [{ id: Date.now(), nome: String(inputData.tenisNome || 'Tênis Principal'), categoria: inputData.tenisCat || 'versatil', kmAcumulados: 0.0, aposentado: false }],
            ctl: ctlInferido,
            atl: atlInferido,
            faseRegeneracaoAbsoluta: false
        };
        
        const dadosProva = {
            distanciaKm: Math.max(1, parseFloat(inputData.distAlvo) || 10),
            dataStr: inputData.dataAlvo || getLocalISODate(),
            tipoMeta: inputData.tipoMeta || 'concluir',
            tempoAlvoStr: String(inputData.tempoAlvoStr || '')
        };
        
        this.inicializarAtleta(dadosAtleta, dadosProva);
        return { ok: true };
    }

    inicializarAtleta(dadosAtleta, dadosProva) {
        const planoGerado = CoachPlanner.gerarPlano(dadosAtleta, dadosProva);
        const historicoInicial = planoGerado.map(t => ({
            dataISO: t.dataISO,
            ctl: numeroFinito(dadosAtleta.ctl, 20),
            atl: numeroFinito(dadosAtleta.atl, 20),
            tsb: 0,
            ehFuturo: true
        }));
        
        const dataSeed = parseLocalDate(dadosAtleta.dataInicioISO);
        dataSeed.setDate(dataSeed.getDate() - 1);
        this.state = {
            schemaVersion: 3,
            fisiologiaSeed: Object.freeze({
                versao: 1,
                dataInicioISO: dadosAtleta.dataInicioISO,
                dataSeedISO: getLocalISODate(dataSeed),
                ctlInicial: Math.max(0, numeroFinito(dadosAtleta.ctl, 20)),
                atlInicial: Math.max(0, numeroFinito(dadosAtleta.atl, 20)),
                origem: 'perfil-inicial'
            }),
            atleta: {
                ...dadosAtleta,
                historicoCTL: historicoInicial
            },
            prova: dadosProva,
            plano: planoGerado,
            treinosRealizados: [],
            logs: [{ data: formatarDataHoje(), msg: "Plano de treinamento iniciado com sucesso!" }],
            modoEsteira: false,
            emManutencao: false
        };
        
        this.recalcularFisiologia();
        this.saveState();
    }

    verificarDestreinamentoEgressor() {
        if (!this.state || !Array.isArray(this.state.treinosRealizados) || this.state.treinosRealizados.length === 0) return;
        if (this.state.atleta?.faseRegeneracaoAbsoluta) return;
        
        const hojeISO = getLocalISODate();
        const treinosOrdenados = [...this.state.treinosRealizados].sort((a,b) => new Date(b.dataISO) - new Date(a.dataISO));
        
        if (!treinosOrdenados[0] || !treinosOrdenados[0].dataISO) return;
        
        const ultimaDataISO = treinosOrdenados[0].dataISO;
        // Usa função robusta de dias ISO
        const diasInativo = typeof diferencaDiasISO === 'function' ? diferencaDiasISO(ultimaDataISO, hojeISO) : 0;
        
        if (diasInativo >= 21) {
            if (!validarDataMeta(this.state.prova.dataStr, hojeISO).ok) return;
            // ISSUE 12: Impede o corte duplo no mesmo dia
            const checkJaAjustado = this.state.logs.some(l => l.data === formatarDataHoje() && l.msg.includes("Inatividade severa"));
            if (!checkJaAjustado) {
                this.state.atleta.volSemanal = Math.max(5, parseFloat((this.state.atleta.volSemanal * 0.5).toFixed(1)));
                this.state.atleta.dataInicioISO = hojeISO;
                this.state.plano = CoachPlanner.gerarPlano(this.state.atleta, this.state.prova);
                this.state.logs.unshift({
                    data: formatarDataHoje(),
                    msg: `Inatividade severa detectada (${diasInativo} dias sem treino). Macrociclo reajustado com rampa de segurança.`
                });
                this.recalcularFisiologia();
                this.saveState();
            }
        }
    }

    processarTreino(idReferencia, dist, tempoMin, fc, rpe, tenisId, ehEdicao) {
        if (!this.state) return;
        if (!ehEdicao) {
            this.registrarTreino(parseInt(idReferencia, 10), dist, tempoMin, rpe, tenisId, fc);
            return;
        }

        const treino = this.state.treinosRealizados.find(t => t && t.idReferencia === idReferencia);
        if (treino) {
            const distNum = Math.max(0.01, parseFloat(dist) || 0);
            
            if (treino.tenisId) {
                const oldTenis = this.state.atleta.tenis.find(t => t && t.id == treino.tenisId);
                if (oldTenis) {
                    const kmAntigos = parseFloat(oldTenis.kmAcumulados) || 0;
                    oldTenis.kmAcumulados = parseFloat(Math.max(0, kmAntigos - treino.dist).toFixed(1));
                }
            }
            
            treino.dist = distNum;
            treino.tempoMin = Math.max(1, parseFloat(tempoMin) || 1);
            treino.fcMedia = fc ? parseInt(fc, 10) : null;
            treino.rpe = Math.max(1, Math.min(10, parseInt(rpe, 10) || 6));
            treino.tss = CoachPhysiology.calcularTSS(treino.tempoMin, treino.rpe, treino.fcMedia, this.state.atleta);
            treino.tenisId = tenisId ? parseInt(tenisId, 10) : null;
            
            if (treino.tenisId) {
                const newTenis = this.state.atleta.tenis.find(t => t && t.id == treino.tenisId);
                if (newTenis) {
                    const kmNovos = parseFloat(newTenis.kmAcumulados) || 0;
                    newTenis.kmAcumulados = parseFloat((kmNovos + treino.dist).toFixed(1));
                }
            }
            
            this.recalcularFisiologia();
            this.saveState();
        }
    }

    registrarTreino(idPlano, dist, tempoMin, rpe, tenisId, fc = null) {
        if (!this.state) return;
        const treinoPlano = this.state.plano.find(t => t && t.id === idPlano);
        if (!treinoPlano) return;
        
        // ISSUE 12: Impede que cliques duplos registrem múltiplas vezes
        if (treinoPlano.concluido) return;
        
        const distNum = Math.max(0.01, parseFloat(dist) || 0);
        const tempoMinNum = Math.max(1, parseFloat(tempoMin) || 1);
        const fcMedia = fc ? parseInt(fc, 10) : null;
        const rpeVal = Math.max(1, Math.min(10, parseInt(rpe, 10) || 6));
        const tss = CoachPhysiology.calcularTSS(tempoMinNum, rpeVal, fcMedia, this.state.atleta);
        
        const novoRegistro = {
            idReferencia: `log_${Date.now()}`,
            dataISO: treinoPlano.dataISO,
            tipo: treinoPlano.tipo,
            dist: distNum,
            tempoMin: tempoMinNum,
            fcMedia: fcMedia,
            rpe: rpeVal,
            tss,
            tenisId: tenisId ? parseInt(tenisId, 10) : null
        };
        
        treinoPlano.concluido = true;
        this.state.treinosRealizados.push(novoRegistro);
        
        if (tenisId) {
            const tenis = this.state.atleta.tenis.find(t => t && t.id == tenisId);
            if (tenis) {
                const kmPrev = parseFloat(tenis.kmAcumulados) || 0;
                tenis.kmAcumulados = parseFloat((kmPrev + distNum).toFixed(1));
            }
        }
        
        this.state.logs.unshift({ data: formatarDataHoje(), msg: `Treino registrado: ${treinoPlano.tipo} (${distNum} km)` });
        this.rebalancearSemana(treinoPlano.dataISO);
        this.recalcularFisiologia();
        this.saveState();
    }

    registrarComoPrescrito(idPlano) {
        if (!this.state || !Array.isArray(this.state.plano)) return;
        const treinoPlano = this.state.plano.find(t => t && t.id === idPlano);
        if (!treinoPlano || treinoPlano.concluido) return;
        
        const distNum = this.obterDistanciaTreino(treinoPlano);
        if (distNum <= 0) return;
        const tipo = treinoPlano.tipo || "Rodagem Leve";
        const tempoMin = this.estimarTempoTreino(tipo, distNum);

        let rpeDefault = 6;
        if (tipo.includes("Regenerativo")) rpeDefault = 2;
        else if (tipo.includes("Rodagem") || tipo.includes("Leve")) rpeDefault = 4;
        else if (tipo.includes("Maratona") || tipo.includes("Tempo")) rpeDefault = 6;
        else if (tipo.includes("Limiar")) rpeDefault = 8;
        else if (tipo.includes("Intervalado") || tipo.includes("Tiros") || tipo === "PROVA ALVO") rpeDefault = 9;
        
        const tenisId = this.obterTenisSugerido(tipo);
        
        if (treinoPlano.tipo === "PROVA ALVO") {
            this.finalizarProvaEIniciarPosProva(parseInt(idPlano, 10), distNum, tempoMin, rpeDefault, tenisId, null);
            if (typeof showToast === 'function') showToast("🎉 Prova registrada como prescrita!");
            if (typeof atualizarTelasGlobais === 'function') atualizarTelasGlobais();
            return;
        }
        
        this.registrarTreino(idPlano, distNum, tempoMin, rpeDefault, tenisId, null);
        if (typeof showToast === 'function') showToast("✅ Treino registrado como prescrito!");
        if (typeof atualizarTelasGlobais === 'function') atualizarTelasGlobais();
    }

    deletarTreino(idReferencia, dataISO) {
        if (!this.state || !Array.isArray(this.state.treinosRealizados)) return;
        const idx = this.state.treinosRealizados.findIndex(t => t && t.idReferencia === idReferencia);
        if (idx !== -1) {
            const removido = this.state.treinosRealizados[idx];
            if (removido && removido.tenisId) {
                const tenis = this.state.atleta.tenis.find(t => t && t.id == removido.tenisId);
                if (tenis) {
                    const kmPrev = parseFloat(tenis.kmAcumulados) || 0;
                    tenis.kmAcumulados = parseFloat(Math.max(0, kmPrev - (parseFloat(removido.dist) || 0)).toFixed(1));
                }
            }
            this.state.treinosRealizados.splice(idx, 1);
            
            const sobrouNaData = this.state.treinosRealizados.some(t => t && t.dataISO === dataISO);
            if (!sobrouNaData) {
                const itemPlano = this.state.plano.find(t => t && t.dataISO === dataISO);
                if (itemPlano) itemPlano.concluido = false;
            }
            this.recalcularFisiologia();
            this.saveState();
            if (typeof atualizarTelasGlobais === 'function') atualizarTelasGlobais();
        }
    }

    atualizarDiasTreino(novosDias) {
        if (!this.state) return;
        this.state.atleta.diasTreino = Array.isArray(novosDias) ? novosDias : [2, 4, 0];
        
        const hoje = getLocalISODate();
        const treinosPassados = this.state.plano.filter(t => t && (t.dataISO < hoje || t.concluido));
        
        const novoPlanoBase = CoachPlanner.gerarPlano(this.state.atleta, this.state.prova);
        let maxId = Math.max(0, ...treinosPassados.map(t => parseInt(t.id, 10) || 0));
        
        const treinosFuturos = novoPlanoBase
            .filter(t => t && t.dataISO >= hoje && !t.concluido)
            .map(t => ({ ...t, id: ++maxId }));
            
        this.state.plano = [...treinosPassados, ...treinosFuturos];
        this.rebalancearSemana(hoje);
        this.saveState();
    }

    recalcularLinhaDoTempo() {
        if (!this.state || !Array.isArray(this.state.plano)) return;
        this.state.plano.sort((a, b) => new Date(a.dataISO) - new Date(b.dataISO));
        this.saveState();
    }

    atualizarSimulador(paceSeg) {
        if (!this.state) return;
        const paceNum = Math.max(60, parseFloat(paceSeg) || 330);
        
        let paceStr;
        if (this.state.modoEsteira) {
            paceStr = (3600 / paceNum).toFixed(1);
        } else {
            paceStr = this._segundosParaPace(paceNum);
        }
        
        const elPace = document.getElementById('sim-pace-val');
        const elHr = document.getElementById('sim-hr-val');
        const elZone = document.getElementById('sim-zone-val');
        const elUnit = document.getElementById('sim-pace-unit');

        if (elPace) elPace.innerText = paceStr;
        if (elUnit) elUnit.innerText = this.state.modoEsteira ? 'km/h' : '/km';

        // ISSUE 11: Padronização idêntica entre simulador e Zonas Karvonen
        if (elHr && elZone) {
            const base = Math.max(60, parseFloat(this.state.atleta.paceBaseSegundos) || 330);
            const rep = Math.max(30, parseFloat(this.state.atleta.fcRepouso) || 60);
            const max = Math.max(rep + 10, parseFloat(this.state.atleta.fcMax) || 185);
            
            const ratio = paceNum / base;
            let perc = 0.65;
            let zoneTxt = "";

            if (ratio <= 0.80) { perc = 0.96; zoneTxt = "Z5+ - Velocidade/Sprint"; }
            else if (ratio <= 0.90) { perc = 0.91; zoneTxt = "Z5 - VO2/Anaeróbico"; }
            else if (ratio <= 0.97) { perc = 0.85; zoneTxt = "Z4 - Limiar"; }
            else if (ratio <= 1.08) { perc = 0.79; zoneTxt = "Z3 - Ritmo Maratona"; }
            else if (ratio <= 1.20) { perc = 0.72; zoneTxt = "Z2 - Rodagem Leve"; }
            else { perc = 0.64; zoneTxt = "Z1 - Regenerativo"; }
            
            const hr = Math.round(rep + perc * (max - rep));
            elHr.innerText = isNaN(hr) ? '--' : hr;
            elZone.innerText = zoneTxt;
        }
    }

    alternarModoEsteira() {
        if (!this.state) return;
        this.state.modoEsteira = !this.state.modoEsteira;
        this.saveState();
        if (typeof atualizarTelasGlobais === 'function') atualizarTelasGlobais();
    }

    _seedFisiologiaValido(seed) {
        return !!seed && seed.versao === 1 && ehDataISOValida(seed.dataInicioISO)
            && ehDataISOValida(seed.dataSeedISO) && diferencaDiasISO(seed.dataSeedISO, seed.dataInicioISO) === 1
            && Number.isFinite(seed.ctlInicial) && seed.ctlInicial >= 0
            && Number.isFinite(seed.atlInicial) && seed.atlInicial >= 0;
    }

    _garantirSeedFisiologia() {
        if (this._seedFisiologiaValido(this.state.fisiologiaSeed)) {
            this.state.fisiologiaSeed = Object.freeze(this.state.fisiologiaSeed);
            return this.state.fisiologiaSeed;
        }
        const atleta = this.state.atleta;
        const historico = atleta.historicoCTL.filter(dia => dia && ehDataISOValida(dia.dataISO))
            .sort((a, b) => a.dataISO.localeCompare(b.dataISO));
        const primeiro = historico[0];
        const inicio = primeiro?.dataISO || (ehDataISOValida(atleta.dataInicioISO) ? atleta.dataInicioISO : getLocalISODate());
        let ctlInicial = Math.max(0, numeroFinito(atleta.ctl, 20));
        let atlInicial = Math.max(0, numeroFinito(atleta.atl, 20));
        let origem = 'legado-sem-serie-estimado';
        if (primeiro && Number.isFinite(primeiro.ctl) && Number.isFinite(primeiro.atl)) {
            const tss = Math.max(0, numeroFinito(primeiro.tss, 0));
            const kCTL = 1 - Math.exp(-1 / 42);
            const kATL = 1 - Math.exp(-1 / 7);
            // Inversão aproximada: o histórico legado já foi arredondado.
            // Não recupera deriva causada por recálculos anteriores à correção.
            ctlInicial = Math.max(0, (primeiro.ctl - tss * kCTL) / (1 - kCTL));
            atlInicial = Math.max(0, (primeiro.atl - tss * kATL) / (1 - kATL));
            origem = 'legado-invertido-aproximado';
        }
        this.state.schemaVersion = 3;
        const dataSeed = parseLocalDate(inicio);
        dataSeed.setDate(dataSeed.getDate() - 1);
        this.state.fisiologiaSeed = Object.freeze({ versao: 1, dataInicioISO: inicio, dataSeedISO: getLocalISODate(dataSeed), ctlInicial, atlInicial, origem });
        this.state.logs.unshift({ data: formatarDataHoje(), msg: 'Cálculo de carga atualizado. O ponto inicial do histórico antigo foi estimado; uma cópia anterior foi reservada para backup.' });
        return this.state.fisiologiaSeed;
    }

    recalcularFisiologia() {
        if (!this.state) return;
        const seed = this._garantirSeedFisiologia();
        const hojeISO = getLocalISODate();
        const historicoAnterior = this.state.atleta.historicoCTL;
        const datas = [hojeISO, ...historicoAnterior.map(dia => dia?.dataISO),
            ...this.state.plano.map(treino => treino?.dataISO), ...this.state.treinosRealizados.map(treino => treino?.dataISO)]
            .filter(data => ehDataISOValida(data) && data >= seed.dataInicioISO).sort();
        const fimISO = datas.at(-1) || seed.dataInicioISO;
        const grade = [];
        const data = parseLocalDate(seed.dataInicioISO);
        const totalDias = diferencaDiasISO(seed.dataInicioISO, fimISO);
        for (let i = 0; i <= totalDias; i++) {
            const dataISO = getLocalISODate(data);
            grade.push({ dataISO });
            data.setDate(data.getDate() + 1);
        }
        this.state.atleta.historicoCTL = CoachPhysiology.recalcularHistoricoCTL(
            grade, this.state.treinosRealizados, this.state.plano, this.state.atleta,
            seed.ctlInicial, seed.atlInicial
        );
        const hoje = this.state.atleta.historicoCTL.find(dia => dia.dataISO === hojeISO);
        if (hoje) {
            this.state.atleta.ctl = hoje.ctl;
            this.state.atleta.atl = hoje.atl;
            this.state.atleta.tsb = hoje.tsb;
        }
    }

    obterDistanciaTreino(treino) {
        const multiplicador = Math.max(0.5, Math.min(2, numeroFinito(this.state?.atleta?.multiplicadorVolume, 1)));
        return Math.round(Math.max(0, numeroFinito(treino?.distanciaBase, 0)) * multiplicador * 10) / 10;
    }

    obterEstruturaTreino(treino) {
        return CoachPlanner._reescalarEstrutura(treino?.estrutura, treino?.distanciaBase, this.obterDistanciaTreino(treino));
    }

    estimarTempoTreino(tipo, distanciaKm) {
        const zona = this.obterZonasKarvonen()[tipo];
        const segundosPorKm = numeroFinito(zona?.segundosMedio, Math.max(60, numeroFinito(this.state?.atleta?.paceBaseSegundos, 330)));
        return Math.max(0, numeroFinito(distanciaKm, 0)) * segundosPorKm / 60;
    }

    obterZonasKarvonen() {
        if (!this.state || !this.state.atleta) return {};
        return CoachPhysiology.obterZonasKarvonen(
            this.state.atleta.paceBaseSegundos, 
            this.state.atleta.fcRepouso, 
            this.state.atleta.fcMax, 
            this.state.modoEsteira
        );
    }

    calcularMonotoniaEFoster() {
        const { start, end } = obterLimitesDaSemana(getLocalISODate());
        const treinosSemana = (this.state && Array.isArray(this.state.treinosRealizados)) 
            ? this.state.treinosRealizados.filter(t => t && t.dataISO >= start && t.dataISO <= end) 
            : [];
        return CoachPhysiology.calcularMonotoniaEFoster(treinosSemana);
    }

    calcularPrevisoesRiegel() {
        if (!this.state || !this.state.atleta) return null;
        const distCustom = this.state.prova ? this.state.prova.distanciaKm : null;
        return CoachPhysiology.calcularPrevisoesRiegel(this.state.atleta.paceBaseSegundos, distCustom);
    }

    obterTreinoForca(dataISO) {
        if (!this.state || !this.state.atleta) return null;
        return CoachPhysiology.obterTreinoForca(
            dataISO, 
            this.state.atleta.fazMusculacao, 
            this.state.atleta.divisaoMusculacao, 
            this.state.atleta.diasMusculacao
        );
    }

    rebalancearSemana(hojeISO) {
        if (!this.state) return;
        this.state.plano = CoachPlanner.rebalancearAdesaoSevera(this.state.plano, this.state.treinosRealizados, hojeISO);
        this.state.plano = CoachPlanner.rebalancearSemana(this.state.plano, this.state.treinosRealizados, hojeISO, this.state.atleta);
    }

    obterTenisSugerido(tipoTreino) {
        if (!this.state || !this.state.atleta) return null;
        return CoachPlanner.obterTenisSugerido(tipoTreino, this.state.atleta.tenis);
    }

    adicionarTenis(nome, categoria, kmInicial = 0) {
        if (!this.state) return;
        const km = Math.max(0, parseFloat(kmInicial) || 0);
        this.state.atleta.tenis.push({
            id: Date.now(),
            nome: String(nome || 'Tênis Novo').trim(),
            categoria: categoria || 'versatil',
            kmAcumulados: parseFloat(km.toFixed(1)),
            aposentado: false
        });
        this.saveState();
    }

    editarTenis(id, nome, categoria, kmAcumulados) {
        if (!this.state || !Array.isArray(this.state.atleta.tenis)) return;
        const tenis = this.state.atleta.tenis.find(t => t && t.id == id);
        if (tenis) {
            tenis.nome = String(nome || tenis.nome).trim();
            tenis.categoria = categoria || tenis.categoria;
            tenis.kmAcumulados = Math.max(0, parseFloat(kmAcumulados) || 0);
            this.saveState();
        }
    }

    aposentarTenis(id) {
        if (!this.state || !Array.isArray(this.state.atleta.tenis)) return;
        const tenis = this.state.atleta.tenis.find(t => t && t.id == id);
        if (tenis) { tenis.aposentado = true; this.saveState(); }
    }

    // ISSUE 10: Conversão impecável de texto p/ minutos c/ suporte a hh:mm:ss e "1h30m"
    _tempoStringParaMinutos(str) {
        if (typeof str === 'number') return Math.max(0, str);
        if (!str || typeof str !== 'string') return 0;
        
        const cleanStr = str.toLowerCase().replace(/\s/g, '');
        
        let h = 0, m = 0, s = 0;
        if (cleanStr.includes('h') || cleanStr.includes('m') || cleanStr.includes('s')) {
            const matchH = cleanStr.match(/(\d+(?:\.\d+)?)h/);
            if (matchH) h = parseFloat(matchH[1]);
            
            const matchM = cleanStr.match(/(\d+(?:\.\d+)?)(?:m|min)/);
            if (matchM) m = parseFloat(matchM[1]);
            
            const matchS = cleanStr.match(/(\d+(?:\.\d+)?)(?:s|sec)/);
            if (matchS) s = parseFloat(matchS[1]);
            
            return (h * 60) + m + (s / 60);
        }
        
        const pts = cleanStr.split(':').map(v => parseFloat(v));
        if (pts.some(isNaN)) return parseFloat(cleanStr) || 0;
        
        if (pts.length === 2) return pts[0] + (pts[1] / 60);
        if (pts.length === 3) return (pts[0] * 60) + pts[1] + (pts[2] / 60);
        
        return parseFloat(cleanStr) || 0;
    }

    _minutosParaTempoString(minutosTotais) {
        return formatarDuracaoMinutos(minutosTotais);
    }

    _paceParaSegundos(str) {
        if (typeof str === 'number') return Math.max(0, str);
        if (!str || typeof str !== 'string') return 300;
        const pts = str.split(':').map(v => parseInt(v, 10));
        if (pts.some(isNaN)) return 300;
        return (pts[0] * 60) + (pts[1] || 0);
    }

    _segundosParaPace(seg) {
        return formatarPaceSegundos(seg);
    }

    finalizarProvaEIniciarPosProva(idPlano, distReal, tempoMin, rpe, tenisId, fc = null) {
        if (!this.state) return;
        const distValida = Math.max(0.5, parseFloat(distReal) || 10.0);
        const tempoMinValido = Math.max(1, parseFloat(tempoMin) || 60);
        
        const tempoTotalSeg = tempoMinValido * 60;
        const distRef10k = 10;
        
        // ISSUE 11: Correção do expoente de Riegel para estimativa limiar
        const tempoEst10kSeg = tempoTotalSeg * Math.pow(distRef10k / distValida, 1.06);
        const ritmoLimiarSeg = Math.max(60, Math.round(tempoEst10kSeg / distRef10k));
        
        this.state.atleta.paceBaseSegundos = ritmoLimiarSeg;

        const treinoPlano = this.state.plano.find(t => t && t.id === idPlano);
        if (treinoPlano) treinoPlano.concluido = true;
        
        const fcMedia = fc ? parseInt(fc, 10) : null;
        const rpeVal = Math.max(1, Math.min(10, parseInt(rpe, 10) || 6));
        const tss = CoachPhysiology.calcularTSS(tempoMinValido, rpeVal, fcMedia, this.state.atleta);
        
        const novoRegistro = {
            idReferencia: `log_prova_${Date.now()}`,
            dataISO: treinoPlano ? treinoPlano.dataISO : getLocalISODate(),
            tipo: "PROVA ALVO",
            dist: distValida,
            tempoMin: tempoMinValido,
            fcMedia: fcMedia,
            rpe: rpeVal,
            tss,
            tenisId: tenisId ? parseInt(tenisId, 10) : null
        };
        
        this.state.treinosRealizados.push(novoRegistro);
        
        if (tenisId) {
            const tenis = this.state.atleta.tenis.find(t => t && t.id == tenisId);
            if (tenis) {
                const kmPrev = parseFloat(tenis.kmAcumulados) || 0;
                tenis.kmAcumulados = parseFloat((kmPrev + distValida).toFixed(1));
            }
        }
        
        this.state.emManutencao = true;
        this.state.atleta.faseRegeneracaoAbsoluta = true;
        
        const planoPos = CoachPlanner.gerarPlanoPosProva(
            this.state.atleta, 
            distValida, 
            novoRegistro.dataISO
        );
        this.state.plano = planoPos;
        
        this.state.logs.unshift({
            data: formatarDataHoje(),
            msg: `Prova concluída em ${this._minutosParaTempoString(tempoMinValido)}! Pace Base recalibrado para ${this._segundosParaPace(ritmoLimiarSeg)}/km. Entrando no modo Recuperação + Baseline.`
        });
        
        this.recalcularFisiologia();
        this.saveState();
    }

    definirNovaMeta(distAlvo, dataAlvoISO, tipoMeta, tempoAlvoStr) {
        if (!this.state) return;
        const distValida = Math.max(1, parseFloat(distAlvo) || 10);
        const validacao = validarDataMeta(dataAlvoISO);
        if (!validacao.ok) return validacao;
        const dataValida = dataAlvoISO;

        this.state.prova = {
            distanciaKm: distValida,
            dataStr: dataValida,
            tipoMeta: tipoMeta || 'concluir',
            tempoAlvoStr: String(tempoAlvoStr || '')
        };
        
        this.state.atleta.dataInicioISO = getLocalISODate();
        this.state.emManutencao = false;
        this.state.atleta.faseRegeneracaoAbsoluta = false;
        
        const novoPlano = CoachPlanner.gerarPlano(this.state.atleta, this.state.prova);
        this.state.plano = novoPlano;
        
        const hojeISO = getLocalISODate();
        const historicoAtualizado = [
            ...this.state.atleta.historicoCTL.filter(h => h && h.dataISO < hojeISO && !h.ehFuturo),
            ...novoPlano.map(t => ({
                dataISO: t.dataISO,
                ctl: numeroFinito(this.state.atleta.ctl, 20),
                atl: numeroFinito(this.state.atleta.atl, 20),
                tsb: 0,
                ehFuturo: true
            }))
        ];
        
        this.state.atleta.historicoCTL = historicoAtualizado;
        
        this.state.logs.unshift({
            data: formatarDataHoje(),
            msg: `Novo objetivo definido: Prova de ${distValida}km para ${dataValida.split('-').reverse().join('/')}. Macrociclo recriado!`
        });
        
        this.recalcularFisiologia();
        this.saveState();
        return { ok: true };
    }
}

window.app = new RunningCoach();