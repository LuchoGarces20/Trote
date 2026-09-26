// ==========================================
// GERENCIADOR DE ESTADO & CONTROLADOR (STATE)
// ==========================================
class RunningCoach {
    constructor() {
        this.STORAGE_KEY = 'trote_coach_state_v2';
        this.state = null;
        this.loadState();
    }

    loadState() {
        try {
            const saved = localStorage.getItem(this.STORAGE_KEY);
            if (saved) {
                this.state = JSON.parse(saved);
                this._garantirIntegridadeEstrutural();
                this.verificarDestreinamentoEgressor(); // CENÁRIO 3: Validação de retorno de lesão/inatividade
            }
        } catch (e) {
            console.error("Erro ao carregar estado do localStorage:", e);
            this.state = null;
        }
    }

    saveState() {
        if (!this.state) return;
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.state));
        } catch (e) {
            console.error("Erro ao salvar estado no localStorage:", e);
        }
    }

    resetState() {
        localStorage.removeItem(this.STORAGE_KEY);
        this.state = null;
    }

    _garantirIntegridadeEstrutural() {
        if (!this.state.atleta.tenis) this.state.atleta.tenis = [];
        if (!this.state.logs) this.state.logs = [];
        if (!this.state.atleta.historicoCTL) this.state.atleta.historicoCTL = [];
        if (this.state.modoEsteira === undefined) this.state.modoEsteira = false;
        if (this.state.atleta.fazMusculacao === undefined) this.state.atleta.fazMusculacao = false;
        if (!this.state.atleta.divisaoMusculacao) this.state.atleta.divisaoMusculacao = 'nenhum';
        if (!this.state.atleta.diasMusculacao) this.state.atleta.diasMusculacao = [];
    }

    initSetup(d) {
        // CENÁRIO 9: Validação defensiva contra divisão por zero / NaN na inicialização
        const distAtualSanitizada = Math.max(0.1, parseFloat(d.distAtual) || 10);
        const tempoAtualSanitizado = Math.max(1, parseFloat(d.tempoAtual) || 60);
        const paceBaseSegundos = Math.round((tempoAtualSanitizado * 60) / distAtualSanitizada);
        
        let diasMusc = d.diasMusculacao || [];
        if (d.fazMusculacao && diasMusc.length === 0) {
            diasMusc = [1, 3, 5];
        }

        const dadosAtleta = {
            nome: d.nome,
            idade: d.idade,
            genero: d.genero,
            diasTreino: d.diasSelecionados,
            volSemanal: d.volSemanal,
            multiplicadorVolume: 1.0,
            fcRepouso: d.fcRepouso,
            fcMax: d.fcMax ? parseInt(d.fcMax) : (220 - d.idade),
            paceBaseSegundos: paceBaseSegundos,
            fazMusculacao: d.fazMusculacao,
            divisaoMusculacao: d.divisaoMusculacao,
            diasMusculacao: diasMusc,
            dataInicioISO: getLocalISODate(),
            tenis: [{ id: Date.now(), nome: d.tenisNome, categoria: d.tenisCat, kmAcumulados: 0.0, aposentado: false }],
            ctl: 20,
            atl: 20
        };

        const dadosProva = {
            distanciaKm: d.distAlvo,
            dataStr: d.dataAlvo,
            tipoMeta: d.tipoMeta,
            tempoAlvoStr: d.tempoAlvoStr
        };

        this.inicializarAtleta(dadosAtleta, dadosProva);
    }

    inicializarAtleta(dadosAtleta, dadosProva) {
        const planoGerado = CoachPlanner.gerarPlano(dadosAtleta, dadosProva);
        const historicoInicial = planoGerado.map(t => ({
            dataISO: t.dataISO,
            ctl: dadosAtleta.ctl || 20,
            atl: dadosAtleta.atl || 20,
            tsb: 0,
            ehFuturo: true
        }));

        this.state = {
            atleta: {
                ...dadosAtleta,
                historicoCTL: historicoInicial
            },
            prova: dadosProva,
            plano: planoGerado,
            treinosRealizados: [],
            logs: [{ data: formatarDataHoje(), msg: "🚀 Plano de treinamento iniciado com sucesso!" }],
            modoEsteira: false
        };

        this.recalcularFisiologia();
        this.saveState();
    }

    // CENÁRIO 3: Detector de destreinamento por inatividade prolongada (>= 21 dias)
    verificarDestreinamentoEgressor() {
        if (!this.state || !this.state.treinosRealizados || this.state.treinosRealizados.length === 0) return;
        const hojeISO = getLocalISODate();
        const treinosOrdenados = [...this.state.treinosRealizados].sort((a,b) => new Date(b.dataISO) - new Date(a.dataISO));
        
        const ultimaData = parseLocalDate(treinosOrdenados[0].dataISO);
        const diasInativo = Math.ceil((parseLocalDate(hojeISO) - ultimaData) / (1000 * 60 * 60 * 24));

        if (diasInativo >= 21) {
            this.state.atleta.volSemanal = Math.max(5, parseFloat((this.state.atleta.volSemanal * 0.5).toFixed(1)));
            this.state.atleta.dataInicioISO = hojeISO;
            this.state.plano = CoachPlanner.gerarPlano(this.state.atleta, this.state.prova);
            this.state.logs.unshift({
                data: formatarDataHoje(),
                msg: `⚠️ Inatividade severa detectada (${diasInativo} dias sem treino). Macrociclo reajustado com rampa de segurança.`
            });
            this.recalcularFisiologia();
            this.saveState();
        }
    }

    processarTreino(idReferencia, dist, tempoMin, fc, rpe, tenisId, ehEdicao) {
        if (!ehEdicao) {
            this.registrarTreino(parseInt(idReferencia), dist, tempoMin, rpe, tenisId, fc);
            return;
        }
        const treino = this.state.treinosRealizados.find(t => t.idReferencia === idReferencia);
        if (treino) {
            const distNum = parseFloat(dist);
            if (treino.tenisId) {
                const oldTenis = this.state.atleta.tenis.find(t => t.id == treino.tenisId);
                if (oldTenis) {
                    oldTenis.kmAcumulados = parseFloat(Math.max(0, oldTenis.kmAcumulados - treino.dist).toFixed(1));
                }
            }
            treino.dist = distNum;
            treino.tempoMin = parseFloat(tempoMin);
            treino.fcMedia = fc ? parseInt(fc) : null;
            treino.rpe = parseInt(rpe);
            
            treino.tss = CoachPhysiology.calcularTSS(treino.tempoMin, treino.rpe, treino.fcMedia, this.state.atleta);
            
            treino.tenisId = tenisId ? parseInt(tenisId) : null;
            if (treino.tenisId) {
                const newTenis = this.state.atleta.tenis.find(t => t.id == treino.tenisId);
                if (newTenis) {
                    newTenis.kmAcumulados = parseFloat((newTenis.kmAcumulados + treino.dist).toFixed(1));
                }
            }
            this.recalcularFisiologia();
            this.saveState();
        }
    }

    registrarTreino(idPlano, dist, tempoMin, rpe, tenisId, fc = null) {
        if (!this.state) return;
        const treinoPlano = this.state.plano.find(t => t.id === idPlano);
        if (!treinoPlano) return;
        const distNum = parseFloat(dist);
        const fcMedia = fc ? parseInt(fc) : null;
        
        const tss = CoachPhysiology.calcularTSS(tempoMin, rpe, fcMedia, this.state.atleta);

        const novoRegistro = {
            idReferencia: `log_${Date.now()}`,
            dataISO: treinoPlano.dataISO,
            tipo: treinoPlano.tipo,
            dist: distNum,
            tempoMin: parseFloat(tempoMin),
            fcMedia: fcMedia,
            rpe: parseInt(rpe),
            tss,
            tenisId: tenisId ? parseInt(tenisId) : null
        };
        treinoPlano.concluido = true;
        this.state.treinosRealizados.push(novoRegistro);
        if (tenisId) {
            const tenis = this.state.atleta.tenis.find(t => t.id == tenisId);
            if (tenis) {
                tenis.kmAcumulados = parseFloat((tenis.kmAcumulados + distNum).toFixed(1));
            }
        }
        this.state.logs.unshift({ data: formatarDataHoje(), msg: `🏃 Treino registrado: ${treinoPlano.tipo} (${distNum} km)` });
        
        this.rebalancearSemana(treinoPlano.dataISO);
        this.recalcularFisiologia();
        this.saveState();
    }

    deletarTreino(idReferencia, dataISO) {
        if (!this.state) return;
        const idx = this.state.treinosRealizados.findIndex(t => t.idReferencia === idReferencia);
        
        if (idx !== -1) {
            const removido = this.state.treinosRealizados[idx];
            if (removido.tenisId) {
                const tenis = this.state.atleta.tenis.find(t => t.id == removido.tenisId);
                if (tenis) {
                    tenis.kmAcumulados = parseFloat(Math.max(0, tenis.kmAcumulados - removido.dist).toFixed(1));
                }
            }
            this.state.treinosRealizados.splice(idx, 1);
            
            const sobrouNaData = this.state.treinosRealizados.some(t => t.dataISO === dataISO);
            if (!sobrouNaData) {
                const itemPlano = this.state.plano.find(t => t.dataISO === dataISO);
                if (itemPlano) itemPlano.concluido = false;
            }
            this.recalcularFisiologia();
            this.saveState();
            if (typeof atualizarTelasGlobais === 'function') atualizarTelasGlobais();
        }
    }

    // CENÁRIO 2: Refatorado para preservar histórico e evitar duplicação ou omissão de volume
    atualizarDiasTreino(novosDias) {
        if (!this.state) return;
        this.state.atleta.diasTreino = novosDias;
        const hoje = getLocalISODate();
        
        const treinosPassados = this.state.plano.filter(t => t.dataISO < hoje || t.concluido);
        const novoPlanoBase = CoachPlanner.gerarPlano(this.state.atleta, this.state.prova);
        
        let maxId = Math.max(...treinosPassados.map(t => t.id || 0), 0);
        const treinosFuturos = novoPlanoBase
            .filter(t => t.dataISO >= hoje && !t.concluido)
            .map(t => ({ ...t, id: ++maxId }));

        this.state.plano = [...treinosPassados, ...treinosFuturos];
        this.rebalancearSemana(hoje);
        this.saveState();
    }

    recalcularLinhaDoTempo() {
        if (!this.state) return;
        this.state.plano.sort((a, b) => new Date(a.dataISO) - new Date(b.dataISO));
        this.saveState();
    }

    atualizarSimulador(paceSeg) {
        if (!this.state) return;
        const paceStr = this._segundosParaPace(paceSeg);
        const elPace = document.getElementById('sim-pace-val');
        const elHr = document.getElementById('sim-hr-val');
        const elZone = document.getElementById('sim-zone-val');
        if (elPace) elPace.innerText = paceStr;
        if (elHr && elZone) {
            const base = this.state.atleta.paceBaseSegundos;
            const rep = this.state.atleta.fcRepouso;
            const max = this.state.atleta.fcMax || (220 - this.state.atleta.idade);
            
            let perc = 0.65;
            if (paceSeg <= base - 45) perc = 0.95;
            else if (paceSeg <= base - 15) perc = 0.88;
            else if (paceSeg <= base + 15) perc = 0.80;
            else if (paceSeg <= base + 45) perc = 0.72;
            else perc = 0.60;
            const hr = Math.round(rep + perc * (max - rep));
            elHr.innerText = hr;
            if (perc >= 0.9) elZone.innerText = "Z5 - VO2/Anaeróbico";
            else if (perc >= 0.8) elZone.innerText = "Z4 - Limiar";
            else if (perc >= 0.7) elZone.innerText = "Z3 - Tempo";
            else elZone.innerText = "Z1/Z2 - Aeróbico Leve";
        }
    }

    alternarModoEsteira() {
        if (!this.state) return;
        this.state.modoEsteira = !this.state.modoEsteira;
        this.saveState();
        if (typeof atualizarTelasGlobais === 'function') atualizarTelasGlobais();
    }

    recalcularFisiologia() {
        if (!this.state) return;
        this.state.atleta.historicoCTL = CoachPhysiology.recalcularHistoricoCTL(
            this.state.atleta.historicoCTL,
            this.state.treinosRealizados,
            this.state.atleta.ctl,
            this.state.atleta.atl
        );
        const hojeISO = getLocalISODate();
        const hojestat = this.state.atleta.historicoCTL.find(h => h.dataISO === hojeISO) || {};
        this.state.atleta.ctl = hojestat.ctl || this.state.atleta.ctl;
        this.state.atleta.atl = hojestat.atl || this.state.atleta.atl;
        this.state.atleta.tsb = hojestat.tsb || 0;
    }

    obterZonasKarvonen() {
        if (!this.state) return {};
        return CoachPhysiology.obterZonasKarvonen(this.state.atleta.paceBaseSegundos, this.state.atleta.fcRepouso, this.state.atleta.fcMax, this.state.modoEsteira);
    }

    calcularMonotoniaEFoster() {
        const { start, end } = obterLimitesDaSemana(getLocalISODate());
        const treinosSemana = this.state ? this.state.treinosRealizados.filter(t => t.dataISO >= start && t.dataISO <= end) : [];
        return CoachPhysiology.calcularMonotoniaEFoster(treinosSemana);
    }

    // CENÁRIO 4: Passa a distância customizada da prova para o preditor de Riegel
    calcularPrevisoesRiegel() {
        if (!this.state) return null;
        const distCustom = this.state.prova ? this.state.prova.distanciaKm : null;
        return CoachPhysiology.calcularPrevisoesRiegel(this.state.atleta.paceBaseSegundos, distCustom);
    }

    obterTreinoForca(dataISO) {
        if (!this.state) return null;
        return CoachPhysiology.obterTreinoForca(
            dataISO, 
            this.state.atleta.fazMusculacao, 
            this.state.atleta.divisaoMusculacao, 
            this.state.atleta.diasMusculacao
        );
    }

    // CENÁRIO 6: Inclui a verificação de adesão severa antes do rebalanceamento semanal
    rebalancearSemana(hojeISO) {
        if (!this.state) return;
        this.state.plano = CoachPlanner.rebalancearAdesaoSevera(this.state.plano, this.state.treinosRealizados, hojeISO);
        this.state.plano = CoachPlanner.rebalancearSemana(this.state.plano, this.state.treinosRealizados, hojeISO);
    }

    obterTenisSugerido(tipoTreino) {
        if (!this.state) return null;
        return CoachPlanner.obterTenisSugerido(tipoTreino, this.state.atleta.tenis);
    }

    adicionarTenis(nome, categoria) {
        if (!this.state) return;
        this.state.atleta.tenis.push({ id: Date.now(), nome, categoria, kmAcumulados: 0.0, aposentado: false });
        this.saveState();
    }

    aposentarTenis(id) {
        if (!this.state) return;
        const tenis = this.state.atleta.tenis.find(t => t.id == id);
        if (tenis) { tenis.aposentado = true; this.saveState(); }
    }

    _tempoStringParaMinutos(str) {
        if (!str) return 0;
        const pts = str.split(':');
        if (pts.length === 2) return parseInt(pts[0]) + (parseInt(pts[1]) / 60);
        if (pts.length === 3) return (parseInt(pts[0]) * 60) + parseInt(pts[1]) + (parseInt(pts[2]) / 60);
        return parseFloat(str);
    }

    _minutosParaTempoString(minutosTotais) {
        const h = Math.floor(minutosTotais / 60);
        const m = Math.round(minutosTotais % 60);
        return h > 0 ? `${h}h${m < 10 ? '0' : ''}${m}m` : `${m}min`;
    }

    _paceParaSegundos(str) {
        if (!str) return 0;
        const pts = str.split(':');
        return (parseInt(pts[0]) * 60) + parseInt(pts[1] || 0);
    }

    _segundosParaPace(seg) {
        const m = Math.floor(seg / 60);
        const s = Math.round(seg % 60);
        return `${m < 10 ? '0'+m : m}:${s < 10 ? '0'+s : s}`;
    }

    finalizarProvaEIniciarPosProva(idPlano, distReal, tempoMin, rpe, tenisId, fc = null) {
        if (!this.state) return;
        
        const tempoTotalSeg = tempoMin * 60;
        const distRef10k = 10;
        const tempoEst10kSeg = tempoTotalSeg * Math.pow(distRef10k / distReal, 1 / 1.06);
        const ritmoLimiarSeg = Math.round(tempoEst10kSeg / distRef10k);

        this.state.atleta.paceBaseSegundos = ritmoLimiarSeg;

        const treinoPlano = this.state.plano.find(t => t.id === idPlano);
        if (treinoPlano) treinoPlano.concluido = true;

        const fcMedia = fc ? parseInt(fc) : null;
        const tss = CoachPhysiology.calcularTSS(tempoMin, rpe, fcMedia, this.state.atleta);

        const novoRegistro = {
            idReferencia: `log_prova_${Date.now()}`,
            dataISO: treinoPlano ? treinoPlano.dataISO : getLocalISODate(),
            tipo: "PROVA ALVO",
            dist: parseFloat(distReal),
            tempoMin: parseFloat(tempoMin),
            fcMedia: fcMedia,
            rpe: parseInt(rpe),
            tss,
            tenisId: tenisId ? parseInt(tenisId) : null
        };
        this.state.treinosRealizados.push(novoRegistro);

        if (tenisId) {
            const tenis = this.state.atleta.tenis.find(t => t.id == tenisId);
            if (tenis) tenis.kmAcumulados = parseFloat((tenis.kmAcumulados + distReal).toFixed(1));
        }

        this.state.emManutencao = true;

        const planoPos = CoachPlanner.gerarPlanoPosProva(
            this.state.atleta, 
            distReal, 
            novoRegistro.dataISO
        );
        this.state.plano = planoPos;
        this.state.logs.unshift({
            data: formatarDataHoje(),
            msg: `🏆 Prova concluída em ${this._minutosParaTempoString(tempoMin)}! Pace Base recalibrado para ${this._segundosParaPace(ritmoLimiarSeg)}/km. Entrando no modo Recuperação + Baseline.`
        });
        this.recalcularFisiologia();
        this.saveState();
    }

    // CENÁRIO 7: Reconstrução do histórico CTL/ATL ao mudar de meta para não corromper a linha do tempo do Chart.js
    definirNovaMeta(distAlvo, dataAlvoISO, tipoMeta, tempoAlvoStr) {
        if (!this.state) return;
        this.state.prova = {
            distanciaKm: parseFloat(distAlvo),
            dataStr: dataAlvoISO,
            tipoMeta: tipoMeta,
            tempoAlvoStr: tempoAlvoStr
        };
        
        this.state.atleta.dataInicioISO = getLocalISODate();
        this.state.emManutencao = false;
        
        const novoPlano = CoachPlanner.gerarPlano(this.state.atleta, this.state.prova);
        this.state.plano = novoPlano;

        const hojeISO = getLocalISODate();
        const historicoAtualizado = [
            ...this.state.atleta.historicoCTL.filter(h => h.dataISO < hojeISO && !h.ehFuturo),
            ...novoPlano.map(t => ({
                dataISO: t.dataISO,
                ctl: this.state.atleta.ctl || 20,
                atl: this.state.atleta.atl || 20,
                tsb: 0,
                ehFuturo: true
            }))
        ];
        this.state.atleta.historicoCTL = historicoAtualizado;

        this.state.logs.unshift({
            data: formatarDataHoje(),
            msg: `🎯 Novo objetivo definido: Prova de ${distAlvo}km para ${dataAlvoISO.split('-').reverse().join('/')}. Macrociclo recriado!`
        });
        this.recalcularFisiologia();
        this.saveState();
    }
}

// Instância Global Única
window.app = new RunningCoach();