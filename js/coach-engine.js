// ==========================================
// MOTOR FISIOLÓGICO & CLASSE PRINCIPAL
// ==========================================
class RunningCoach {
    constructor() {
        this.state = this.loadState();
        if (this.state) {
            if (!this.state.atleta) this.state.atleta = {};
            if (!this.state.atleta.tenis) this.state.atleta.tenis = [];
            if (!this.state.treinosRealizados) this.state.treinosRealizados = [];
            if (!this.state.logs) this.state.logs = [];
            if (this.state.atleta.alertaSeguranca === undefined) this.state.atleta.alertaSeguranca = "";
            this.recalcularLinhaDoTempo();
        }
    }
         
    loadState() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            return saved ? JSON.parse(saved) : null;
        } catch (e) {
            return null;
        }
    }
         
    saveState() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    }

    // ------------------------------------------------------------------
    // PROTOCOLO 1: DETRAINING (RETORNO PÓS-PAUSA)
    // ------------------------------------------------------------------
    verificarInatividadeEReajustar() {
        if (!this.state || !this.state.treinosRealizados || this.state.treinosRealizados.length === 0) return;

        const hojeISO = getLocalISODate();
        const realizadosOrdenados = [...this.state.treinosRealizados].sort((a, b) => new Date(b.dataISO) - new Date(a.dataISO));
        const ultimoTreino = realizadosOrdenados[0];
        
        const dHoje = parseLocalDate(hojeISO);
        const dUltimo = parseLocalDate(ultimoTreino.dataISO);
        const diasInativo = Math.floor((dHoje - dUltimo) / (1000 * 60 * 60 * 24));

        // Trava para aplicar o ajuste apenas uma vez por janela de inatividade
        const idAjuste = `${ultimoTreino.dataISO}_${hojeISO}`;
        if (diasInativo >= 7 && this.state.atleta.ultimoAjusteInatividade !== idAjuste) {
            let fatorCorte = 1.0;
            let acrescimoPaceSeg = 0;
            let msgImpacto = "";

            if (diasInativo >= 28) {
                fatorCorte = 0.50; // Reduz 50% do volume
                acrescimoPaceSeg = 30; // +30s/km devido à perda neuromuscular
                msgImpacto = "Pausa severa (>28 dias). Volume cortado em 50% e Pace Base suavizado em +30s/km para readaptação tecidual.";
            } else if (diasInativo >= 15) {
                fatorCorte = 0.60; // Reduz 40% do volume
                acrescimoPaceSeg = 15; // +15s/km
                msgImpacto = "Pausa média (15-28 dias). Volume cortado em 40% e Pace Base suavizado em +15s/km.";
            } else {
                fatorCorte = 0.75; // Reduz 25% do volume
                acrescimoPaceSeg = 0;
                msgImpacto = "Pausa curta (7-14 dias). Volume do macrociclo reduzido em 25% para evitar sobrecarga aguda.";
            }

            // Aplica as alterações no perfil do atleta
            this.state.atleta.multiplicadorVolume = parseFloat((this.state.atleta.multiplicadorVolume * fatorCorte).toFixed(2));
            if (acrescimoPaceSeg > 0) {
                this.state.atleta.paceBaseSegundos += acrescimoPaceSeg;
            }

            this.state.atleta.ultimoAjusteInatividade = idAjuste;
            this.state.atleta.alertaSeguranca = `Detraining Ativo: ${msgImpacto}`;

            this.state.logs.unshift({
                data: new Date().toLocaleDateString('pt-BR'),
                msg: `⚠️ **Protocolo Detraining (${diasInativo} dias inativo):** ${msgImpacto}`
            });

            // Regenera o macrociclo futuro com os novos parâmetros
            this.gerarPlanoTreino();
            this.saveState();
        }
    }

    // ------------------------------------------------------------------
    // PROTOCOLO 2: GUARDRAIL DE METAS TÓXICAS (RAMP RATE)
    // ------------------------------------------------------------------
    validarEProtegerMeta(volBase, distAlvo, semanasTotais) {
        const picoNecessario = Math.max(volBase * 1.2, distAlvo * 2.2);
        const taxaCrescimentoNecessaria = Math.pow(picoNecessario / Math.max(1, volBase), 1 / Math.max(1, semanasTotais - 2));

        this.state.atleta.alertaSeguranca = ""; // Reseta alertas anteriores

        // Se a rampa semanal exigida for maior que 12%/semana (Teto biológico 10-12%)
        if (taxaCrescimentoNecessaria > 1.12) {
            if (this.state.prova.tipoMeta === 'tempo') {
                this.state.prova.tipoMeta = 'concluir';
                this.state.prova.paceAlvoSegundos = null;
                
                const percCalculado = ((taxaCrescimentoNecessaria - 1) * 100).toFixed(1);
                const msg = `Guardrail: A meta exigiria ${percCalculado}%/semana de evolução de volume. Rebaixada para 'Apenas Concluir' para proteger suas articulações.`;
                
                this.state.atleta.alertaSeguranca = msg;
                this.state.logs.unshift({
                    data: new Date().toLocaleDateString('pt-BR'),
                    msg: `🛡️ **Guardrail de Segurança:** ${msg}`
                });
            }
        }
    }

    // ------------------------------------------------------------------
    // PROTOCOLO 4: GESTÃO DE TREINOS PERDIDOS ("Ghost Workout Rule")
    // ------------------------------------------------------------------
    gestaoTreinosPerdidos() {
        if (!this.state || !this.state.plano) return;
        const hojeISO = getLocalISODate();

        let alteracaoFeita = false;
        this.state.plano.forEach(treino => {
            // Se a data já passou, não foi concluído e não é descanso nem já cancelado
            if (treino.dataISO < hojeISO && !treino.concluido && treino.tipo !== "Descanso" && treino.tipo !== "Não Realizado") {
                const tipoOriginal = treino.tipo;
                treino.tipo = "Não Realizado";
                treino.prescricao = `Sessão expirada (${tipoOriginal}). Regra de Ouro: Treino perdido é treino cancelado. Não compense volume extra.`;
                treino.distanciaBase = 0;
                treino.estrutura = [];
                alteracaoFeita = true;

                const [, m, d] = treino.dataISO.split('-');
                this.state.logs.unshift({
                    data: new Date().toLocaleDateString('pt-BR'),
                    msg: `🚫 **Treino Expirado (${d}/${m}):** A sessão de ${tipoOriginal} foi cancelada para evitar acúmulo excessivo de fadiga.`
                });
            }
        });

        if (alteracaoFeita) {
            this.saveState();
        }
    }


    rebalancearSemana(dataIsoRef) {
        if (!this.state || !this.state.plano) return;
        const { start, end } = obterLimitesDaSemana(dataIsoRef);
        const treinosDaSemana = this.state.plano
            .filter(t => t.dataISO >= start && t.dataISO <= end && t.tipo !== "Descanso")
            .sort((a, b) => new Date(a.dataISO) - new Date(b.dataISO));
        const ehIntenso = (tipo) => {
            return tipo.includes("Tempo") || tipo.includes("Intervalado") || 
                 tipo.includes("Tiros") || tipo.includes("Subidas") || 
                 tipo.includes("Time Trial") || tipo.includes("Cruise") || 
                 tipo.includes("Fartlek");
        };
        for (let i = 0; i < treinosDaSemana.length - 1; i++) {
            const t1 = treinosDaSemana[i];
            const t2 = treinosDaSemana[i + 1];
            const d1 = parseLocalDate(t1.dataISO);
            const d2 = parseLocalDate(t2.dataISO);
            const diffDias = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
            if (diffDias === 1 && ehIntenso(t1.tipo) && ehIntenso(t2.tipo)) {
                const novaData = new Date(d2);
                novaData.setDate(d2.getDate() + 1);
                const novaDataISO = getLocalISODate(novaData);
                if (novaDataISO <= end && !t2.concluido) {
                    t2.dataISO = novaDataISO;
                    this.state.logs.unshift({
                        data: new Date().toLocaleDateString('pt-BR'),
                        msg: `🛡️ <b>Rebalanceamento IA:</b> ${t2.tipo} adiado para ${novaDataISO.split('-').reverse().join('/')} para garantir recuperação neuromuscular.`
                    });
                } else if (!t2.concluido) {
                    t2.tipo = "Regenerativo";
                    t2.prescricao = "⚠️ Rebalanceamento Automático: Sessão ajustada para Z1 para evitar sobrecarga de dias intensos colados.";
                    const distRegen = Math.max(3, parseFloat((t2.distanciaBase * 0.7).toFixed(1)));
                    t2.distanciaBase = distRegen;
                    t2.estrutura = [`${distRegen}km leve em Z1`];
                }
            }
        }
        this.state.plano.sort((a, b) => new Date(a.dataISO) - new Date(b.dataISO));
    }

    _segundosParaKmH(seg) {
        if (!seg || isNaN(seg) || seg <= 0) return "0.0 km/h";
        const kmh = (3600 / seg).toFixed(1);
        return `${kmh} km/h`;
    }

    _formatarRitmo(segPace) {
        if (this.state && this.state.modoEsteira) {
            return this._segundosParaKmH(segPace);
        }
        return `${this._segundosParaPace(segPace)}/km`;
    }

    _formatarFaixaRitmo(segRapido, segLento) {
        if (this.state && this.state.modoEsteira) {
            const kmhMin = (3600 / segLento).toFixed(1);
            const kmhMax = (3600 / segRapido).toFixed(1);
            return `${kmhMin} - ${kmhMax} km/h`;
        }
        const paceRapido = this._segundosParaPace(segRapido);
        const paceLento = this._segundosParaPace(segLento);
        return `${paceRapido} a ${paceLento}/km`;
    }

    _tempoStringParaMinutos(str) {
        if (!str) return 0;
        if (typeof str === 'number') return str;
        const partes = str.toString().trim().split(':').map(Number);
        if (partes.some(isNaN)) return parseFloat(str) || 0;
        if (partes.length === 3) {
            return (partes[0] * 60) + partes[1] + (partes[2] / 60);
        } else if (partes.length === 2) {
            return partes[0] + (partes[1] / 60);
        }
        return parseFloat(str) || 0;
    }

    _minutosParaTempoString(minutos) {
        if (!minutos || isNaN(minutos) || minutos <= 0) return "00:00";
        const totalSeg = Math.round(minutos * 60);
        const h = Math.floor(totalSeg / 3600);
        const m = Math.floor((totalSeg % 3600) / 60);
        const s = totalSeg % 60;
        const pad = (n) => n.toString().padStart(2, '0');
        return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
    }

    atualizarDiasTreino(novosDias) {
        if (!this.state || !novosDias || novosDias.length < 2) return;
        novosDias.sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b));
        const dayLongao = novosDias[novosDias.length - 1];          
        let dayTempo, diasRegen = [];
        if (novosDias.length === 3) {
            const gap = novosDias[1] - novosDias[0];
            if (gap === 1) {
                dayTempo = novosDias[0]; 
                diasRegen = [novosDias[1]]; 
            } else {
                dayTempo = novosDias[1]; 
                diasRegen = [novosDias[0]]; 
            }
        } else {
            dayTempo = novosDias[0]; 
            if (novosDias.length >= 3) dayTempo = novosDias[Math.floor((novosDias.length - 1) / 2)];
            diasRegen = novosDias.filter(d => d !== dayLongao && d !== dayTempo);
        }
        this.state.atleta.diasTreino = { longao: dayLongao, tempo: dayTempo, regen: diasRegen };
        const hojeISO = getLocalISODate();
        const treinosPassados = this.state.plano.filter(t => t.concluido || t.dataISO < hojeISO);
        const treinosFuturosPendentes = this.state.plano.filter(t => !t.concluido && t.dataISO >= hojeISO);
        const dataInicio = parseLocalDate(hojeISO);
        const dataFim = parseLocalDate(this.state.prova.dataStr);
        const diasTotais = Math.ceil((dataFim - dataInicio) / (1000 * 60 * 60 * 24));
        let novosTreinosFuturos = [];
        let pendentesQueue = [...treinosFuturosPendentes];
        for (let i = 0; i <= diasTotais; i++) {
            let dataTreino = new Date(dataInicio);
            dataTreino.setDate(dataInicio.getDate() + i);
            const dataIsoStr = getLocalISODate(dataTreino);
            
            const diaSemanaNormal = dataTreino.getDay();
            const diaSemanaIso = diaSemanaNormal === 0 ? 7 : diaSemanaNormal;
            let tipo = "Descanso";
            if (i === diasTotais) {
                tipo = "PROVA ALVO";
            } else if (diaSemanaNormal === dayLongao || diaSemanaIso === dayLongao) {
                tipo = "Longao";
            } else if (diaSemanaNormal === dayTempo || diaSemanaIso === dayTempo) {
                tipo = "Tempo";
            } else if (diasRegen.includes(diaSemanaNormal) || diasRegen.includes(diaSemanaIso)) {
                tipo = "Regenerativo";
            }
            if (tipo !== "Descanso") {
                let idxPendente = pendentesQueue.findIndex(t => 
                    (tipo === "Longao" && (t.tipo.includes("Longão") || t.tipo.includes("LISS"))) ||
                    (tipo === "Tempo" && (t.tipo.includes("Tempo") || t.tipo.includes("Intervalado") || t.tipo.includes("Tiros") || t.tipo.includes("Subidas") || t.tipo.includes("Fartlek"))) ||
                    (tipo === "Regenerativo" && (t.tipo.includes("Regenerativo") || t.tipo.includes("Rodagem em Fadiga"))) ||
                    (tipo === "PROVA ALVO" && t.tipo === "PROVA ALVO")
                );
                if (idxPendente === -1 && pendentesQueue.length > 0) idxPendente = 0;
                if (idxPendente !== -1) {
                    const treinoReaproveitado = pendentesQueue.splice(idxPendente, 1)[0];
                    treinoReaproveitado.dataISO = dataIsoStr;
                    novosTreinosFuturos.push(treinoReaproveitado);
                }
            } else {
                novosTreinosFuturos.push({
                    id: Date.now() + i,
                    dataISO: dataIsoStr,
                    tipo: "Descanso",
                    distanciaBase: 0,
                    prescricao: "Dia de descanso.",
                    estrutura: [],
                    concluido: false
                });
            }
        }
        this.state.plano = [...treinosPassados, ...novosTreinosFuturos].sort((a, b) => new Date(a.dataISO) - new Date(b.dataISO));
        
        this.state.logs.unshift({ 
            data: new Date().toLocaleDateString('pt-BR'), 
            msg: `📅 <b>Rotina Atualizada:</b> Dias de treino futuros reajustados sem perder o histórico.` 
        });
        this.saveState();
        this.recalcularLinhaDoTempo();
    }

    alternarModoEsteira() {
        if (!this.state) return;
        this.state.modoEsteira = !this.state.modoEsteira;
        this.saveState();
        
        const simSlider = document.getElementById('sim-slider');
        if (simSlider) {
            this.atualizarSimulador(simSlider.value);
        }
        atualizarTelasGlobais();
        if (typeof showToast === 'function') {
            showToast(this.state.modoEsteira ? "🏃 Modo Esteira Ativo (km/h)" : "🏙️ Modo Rua Ativo (Pace min/km)");
        }
    }
        
    recalcularLinhaDoTempo() {
        if (!this.state || !this.state.atleta || !this.state.atleta.dataInicioISO) return;
        
        // Protocolos IA de manutenção diária
        this.gestaoTreinosPerdidos();
        this.verificarInatividadeEReajustar();

        const dataInicial = parseLocalDate(this.state.atleta.dataInicioISO);
        const hoje = new Date();
        hoje.setHours(0,0,0,0);
        
        let dataFinal = hoje;
        if (this.state.prova && this.state.prova.dataStr) {
            const dProva = parseLocalDate(this.state.prova.dataStr);
            if (dProva > hoje) dataFinal = dProva;
        }
        
        let ctlAtual = this.state.atleta.ctlInicial;
        let atlAtual = this.state.atleta.ctlInicial * 1.2;
        
        const tauCTL = 42;
        const tauATL = 7;
        const alphaCTL = 1 - Math.exp(-1 / tauCTL); 
        const alphaATL = 1 - Math.exp(-1 / tauATL);
        
        const diasTotais = Math.floor((dataFinal - dataInicial) / (1000 * 60 * 60 * 24));
        const diasAteHoje = Math.floor((hoje - dataInicial) / (1000 * 60 * 60 * 24));
        
        this.state.atleta.historicoCTL = [];
        
        for (let i = 0; i <= diasTotais; i++) {
            let dataIteracao = new Date(dataInicial);
            dataIteracao.setDate(dataInicial.getDate() + i);
            const dataIsoStr = getLocalISODate(dataIteracao);
            
            ctlAtual = ctlAtual * Math.exp(-1 / tauCTL);
            atlAtual = atlAtual * Math.exp(-1 / tauATL);
            
            let tssDia = 0;
            
            if (i <= diasAteHoje) {
                const treinosDoDia = this.state.treinosRealizados.filter(t => t.dataISO === dataIsoStr);
                treinosDoDia.forEach(t => tssDia += t.tss);
            } else {
                const treinoPlanejado = this.state.plano.find(t => t.dataISO === dataIsoStr);
                if (treinoPlanejado && treinoPlanejado.tipo !== "Descanso" && treinoPlanejado.tipo !== "Não Realizado") {
                    const dist = treinoPlanejado.distanciaBase * (this.state.atleta.multiplicadorVolume || 1.0);
                    const paceSeg = this.state.atleta.paceBaseSegundos;
                    const tempoMin = (dist * paceSeg) / 60;
                    
                    let ifEst = 0.75; 
                    if (treinoPlanejado.tipo.includes("Regenerativo") || treinoPlanejado.tipo.includes("Rodagem em Fadiga")) ifEst = 0.60;
                    else if (treinoPlanejado.tipo.includes("Tempo") || treinoPlanejado.tipo.includes("Cruise")) ifEst = 0.88;
                    else if (treinoPlanejado.tipo.includes("Intervalado") || treinoPlanejado.tipo.includes("Tiros")) ifEst = 0.95;
                    else if (treinoPlanejado.tipo === "PROVA ALVO") ifEst = 0.92;
                    
                    tssDia = (tempoMin / 60) * Math.pow(ifEst, 2) * 100;
                }
            }
            
            if (tssDia > 0) {
                ctlAtual += (tssDia * alphaCTL);
                atlAtual += (tssDia * alphaATL);
            }
            
            this.state.atleta.historicoCTL.push({ 
                dataISO: dataIsoStr, 
                ctl: ctlAtual, 
                atl: atlAtual,
                ehFuturo: i > diasAteHoje
            });
            
            if (i === diasAteHoje) {
                this.state.atleta.ctl = ctlAtual;
                this.state.atleta.atl = atlAtual;
                this.state.atleta.tsb = ctlAtual - atlAtual;
            }
        }
        
        this.state.atleta.ultimaAtualizacaoISO = getLocalISODate(hoje);
        this.saveState();
    }

    calcularDecouplingCardiaco(distKm, tempoMin, fcMetade1, fcMetade2) {
        if (!fcMetade1 || !fcMetade2 || fcMetade1 <= 0 || fcMetade2 <= 0) return null;
        const velocidadeMmin = (distKm * 1000) / tempoMin;
        const ef1 = velocidadeMmin / fcMetade1; 
        const ef2 = velocidadeMmin / fcMetade2; 
        const desacoplamento = ((ef1 - ef2) / ef1) * 100;
        return parseFloat(desacoplamento.toFixed(1));
    }

    calcularFatorDeriva(tempoMin, ifFactor) {
        const ctlAtual = this.state.atleta.ctl || 15;
        const tLimiar = Math.min(120, 45 + Math.round(ctlAtual * 1.0));
        
        if (tempoMin <= tLimiar) return 1.0;
        
        const minutosExcedentes = tempoMin - tLimiar;
        const amortecimentoCtl = 1 + (0.01 * ctlAtual);
        const taxaDeriva = (Math.pow(ifFactor, 2) / amortecimentoCtl) * 0.12;
        
        const fatorAdicional = (minutosExcedentes / 60) * taxaDeriva;
        return parseFloat((1.0 + Math.min(0.25, fatorAdicional)).toFixed(3));
    }

    calcularPrevisoesRiegel() {
        if (!this.state || !this.state.atleta) return null;
        const d1 = this.state.atleta.distanciaAtualMax || 10; 
        const t1Seg = (this.state.atleta.paceBaseSegundos * d1) / 0.97; 
        const distanciasAlvo = [
            { nome: "5k", dist: 5 },
            { nome: "10k", dist: 10 },
            { nome: "Meia (21.1k)", dist: 21.0975 },
            { nome: "Maratona (42.2k)", dist: 42.195 }
        ];
        return distanciasAlvo.map(item => {
            const t2Seg = t1Seg * Math.pow((item.dist / d1), 1.06);
            const paceMedioSeg = t2Seg / item.dist;
            const h = Math.floor(t2Seg / 3600);
            const m = Math.floor((t2Seg % 3600) / 60);
            const s = Math.round(t2Seg % 60);
            const tempoFormatado = h > 0 
                ? `${h}h${m < 10 ? '0' : ''}${m}m` 
                : `${m}m${s < 10 ? '0' : ''}${s}s`;
            return {
                prova: item.nome,
                tempoEstimado: tempoFormatado,
                paceMedio: `${this._segundosParaPace(paceMedioSeg)}/km`
            };
        });
    }
    
    initSetup(dadosForm) {
        const fcMaxDigitada = parseInt(dadosForm.fcMax);
        const fcMaxCalc = (!isNaN(fcMaxDigitada) && fcMaxDigitada > 0) ? fcMaxDigitada : Math.round(208 - 0.7 * dadosForm.idade);
        
        const distAtualSegura = Math.max(1, dadosForm.distAtual);
        const tempoAtualSeguro = Math.max(1, dadosForm.tempoAtual);
        const paceAtualSegundos = Math.round((tempoAtualSeguro / distAtualSegura) * 60);
        
        const volSemanal = Math.max(distAtualSegura, dadosForm.volSemanal);
        const tssSemanal = ((volSemanal * (paceAtualSegundos / 60)) / 60) * Math.pow(0.75, 2) * 100;
        const ctlInicial = Math.max(10, tssSemanal / 7);
        
        let dias = dadosForm.diasSelecionados;
        dias.sort((a,b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b));
        
        const dayLongao = dias[dias.length - 1]; 
        let dayTempo, diasRegen = [];
        if (dias.length === 3) {
            const gap = dias[1] - dias[0];
            if (gap === 1) {
                dayTempo = dias[0]; 
                diasRegen = [dias[1]]; 
            } else {
                dayTempo = dias[1]; 
                diasRegen = [dias[0]]; 
            }
        } else {
            dayTempo = dias[0]; 
            if(dias.length >= 3) dayTempo = dias[Math.floor((dias.length - 1) / 2)];
            diasRegen = dias.filter(d => d !== dayLongao && d !== dayTempo);
        }
        
        const dataHojeISO = getLocalISODate();
        
        const tenisInicial = [{
            id: Date.now(),
            nome: dadosForm.tenisNome,
            categoria: dadosForm.tenisCat,
            kmAcumulados: 0,
            aposentado: false
        }];

        let tempoAlvoMinutos = 0;
        let paceAlvoSeg = null;
        if (dadosForm.tipoMeta === 'tempo' && dadosForm.tempoAlvoStr) {
            tempoAlvoMinutos = this._tempoStringParaMinutos(dadosForm.tempoAlvoStr);
            if (tempoAlvoMinutos > 0 && dadosForm.distAlvo > 0) {
                paceAlvoSeg = Math.round((tempoAlvoMinutos * 60) / dadosForm.distAlvo);
            }
        }
        
        this.state = {
            atleta: {
                nome: dadosForm.nome, idade: dadosForm.idade, genero: dadosForm.genero,
                fcMax: fcMaxCalc, fcRepouso: dadosForm.fcRepouso, 
                paceBaseSegundos: paceAtualSegundos, 
                distanciaAtualMax: distAtualSegura,
                volumeSemanalBase: volSemanal, 
                dataInicioISO: dataHojeISO,
                ctlInicial: ctlInicial, ctl: ctlInicial, atl: ctlInicial * 1.2, tsb: ctlInicial - (ctlInicial * 1.2),
                multiplicadorVolume: 1.0, historicoCTL: [],
                tenis: tenisInicial,
                ultimaAtualizacaoISO: dataHojeISO,
                diasTreino: { longao: dayLongao, tempo: dayTempo, regen: diasRegen },
                alertaSeguranca: ""
            },
            prova: { 
                distancia: dadosForm.distAlvo, 
                dataStr: dadosForm.dataAlvo,
                tipoMeta: dadosForm.tipoMeta || 'concluir',
                tempoAlvoMinutos: tempoAlvoMinutos,
                paceAlvoSegundos: paceAlvoSeg
            },
            plano: [], treinosRealizados: [], logs: []
        };
        
        // Guardrail: Valida e corrige meta impossível
        const semanasTotais = Math.ceil((Math.ceil((parseLocalDate(dadosForm.dataAlvo) - parseLocalDate(dataHojeISO)) / (1000 * 60 * 60 * 24)) + 1) / 7);
        this.validarEProtegerMeta(volSemanal, dadosForm.distAlvo, semanasTotais);

        const msgMeta = this.state.prova.tipoMeta === 'tempo' && paceAlvoSeg
            ? `Meta: Sub-${this._minutosParaTempoString(tempoAlvoMinutos)} (Pace Alvo: ${this._segundosParaPace(paceAlvoSeg)}/km).`
            : `Meta: Concluir a prova de ${dadosForm.distAlvo}k de forma segura.`;

        this.state.logs.push({ 
            data: new Date().toLocaleDateString('pt-BR'), 
            msg: `Calibração Karvonen & VDOT ativa. FC Máx: ${fcMaxCalc}, Repouso: ${dadosForm.fcRepouso}. ${msgMeta}` 
        });
        
        this.gerarPlanoTreino();
        this.recalcularLinhaDoTempo();
    }
    
    // ==========================================
    // GERADOR DE PLANO E ROTEAMENTO
    // ==========================================
    gerarPlanoTreino() {
        const dataInicio = parseLocalDate(this.state.atleta.dataInicioISO);
        const dataFim = parseLocalDate(this.state.prova.dataStr);
        const diasTotais = Math.ceil((dataFim - dataInicio) / (1000 * 60 * 60 * 24));
        
        const { longao, tempo, regen } = this.state.atleta.diasTreino;
        const numRegen = Math.max(0, regen.length);
        
        let idCounter = 0; 
        this.state.plano = [];

        const volSemanalBase = this.state.atleta.volumeSemanalBase;
        const distAlvo = this.state.prova.distancia;
        
        const ehMetaTempo = this.state.prova.tipoMeta === 'tempo' && this.state.prova.paceAlvoSegundos;
        const paceAlvoStr = ehMetaTempo ? this._segundosParaPace(this.state.prova.paceAlvoSegundos) : null;
        
        let maxLongao = 10;
        if (distAlvo >= 42.2) maxLongao = 34;
        else if (distAlvo >= 21.1) maxLongao = 22;
        else if (distAlvo > 5) maxLongao = 14;

        const semanasTotais = Math.ceil((diasTotais + 1) / 7);
        
        const volumesSemanais = this._calcularVolumesSemanais(semanasTotais, volSemanalBase, distAlvo);
        
        for (let i = 0; i <= diasTotais; i++) {
            let dataTreino = new Date(dataInicio);
            dataTreino.setDate(dataInicio.getDate() + i);
            
            const diaSemana = dataTreino.getDay() === 0 ? 7 : dataTreino.getDay();
            const diaSemanaNormal = dataTreino.getDay();
            
            const numeroSemanaAtual = Math.floor(i / 7);
            const infoSemana = volumesSemanais[Math.min(numeroSemanaAtual, volumesSemanais.length - 1)];
            
            const ctx = {
                distAlvo, ehMetaTempo, paceAlvoStr, maxLongao,
                numeroSemanaAtual, semanasTotais, numRegen,
                semanasParaProva: infoSemana.semanasParaProva,
                ehDeload: infoSemana.ehDeload,
                fasePlano: infoSemana.fase,
                volSemanalAtual: infoSemana.vol,
                ontemFoiQualidade: (diaSemanaNormal - 1 < 0 ? 6 : diaSemanaNormal - 1) === tempo || (diaSemana - 1 === 0 ? 7 : diaSemana - 1) === tempo
            };
            
            let treino = { tipo: "Descanso", distancia: 0, prescricao: "Dia de descanso para adaptação muscular.", estrutura: [] };
            
            if (i === diasTotais) {
                treino = this._gerarProvaAlvo(ctx);
            } 
            else if ((diaSemanaNormal === longao || diaSemana === longao) && i !== diasTotais) {
                treino = this._gerarTreinoLongo(ctx);
            } 
            else if (diaSemanaNormal === tempo || diaSemana === tempo) {
                treino = this._gerarTreinoQualidade(ctx);
            } 
            else if (numRegen > 0 && (regen.includes(diaSemanaNormal) || regen.includes(diaSemana))) {
                treino = this._gerarTreinoRegenerativo(ctx);
            }
            
            this.state.plano.push({
                id: idCounter++, 
                dataISO: getLocalISODate(dataTreino),
                tipo: treino.tipo, 
                distanciaBase: parseFloat(treino.distancia.toFixed(1)), 
                prescricao: treino.prescricao, 
                estrutura: treino.estrutura, 
                concluido: false,
                fasePlano: infoSemana.fase
            });
        }
    }

    _calcularVolumesSemanais(semanasTotais, volSemanalBase, distAlvo) {
        let volumesSemanais = [];
        let picoVolumeEfetivo = volSemanalBase;
        let volumeCorrida = volSemanalBase;
        const RAMP_RATE_MAX = 1.10; // Teto biológico: máximo 10% de crescimento por semana
        
        let semanasTapering = 2;
        if (distAlvo >= 42.2) semanasTapering = 3; 
        
        for (let w = 0; w < semanasTotais; w++) {
            const semanasParaProva = semanasTotais - w;
            let fasePlano = "";
            
            const capRampSegura = w === 0 ? volSemanalBase : volumesSemanais[w - 1].vol * RAMP_RATE_MAX;
            const capProva = Math.max(volSemanalBase * 1.2, distAlvo * 2.2);
            const capSemanalAbsoluto = Math.min(capRampSegura, capProva);

            if (semanasParaProva <= semanasTapering) {
                fasePlano = "Polimento (Tapering)";
            } else if (semanasParaProva <= 10) {
                fasePlano = `Específico para ${distAlvo}k`;
                volumeCorrida = Math.min(volumeCorrida * 1.03, capSemanalAbsoluto);
            } else if (semanasParaProva <= 18) {
                fasePlano = "Construção de Limiar";
                volumeCorrida = Math.min(volumeCorrida * 1.025, capSemanalAbsoluto);
            } else {
                fasePlano = "Base Aeróbica";
                volumeCorrida = Math.min(volumeCorrida * 1.018, capSemanalAbsoluto);
            }

            if (fasePlano !== "Polimento (Tapering)" && volumeCorrida > picoVolumeEfetivo) {
                picoVolumeEfetivo = volumeCorrida;
            }
            
            let volSemanalAtual = volumeCorrida;
            const proximaEhSemanaDeTeste = semanasTotais > 20 && ((w + 2) % 10 === 0) && (semanasParaProva - (w + 1) > 3);
            const ehDeload = ((w % 4 === 3) || proximaEhSemanaDeTeste) && semanasParaProva > semanasTapering;
            
            if (fasePlano === "Polimento (Tapering)") {
                if (distAlvo >= 42.2) {
                    if (semanasParaProva === 3) volSemanalAtual = picoVolumeEfetivo * 0.70;
                    else if (semanasParaProva === 2) volSemanalAtual = picoVolumeEfetivo * 0.50;
                    else if (semanasParaProva === 1) volSemanalAtual = picoVolumeEfetivo * 0.30;
                } else {
                    if (semanasParaProva === 2) volSemanalAtual = picoVolumeEfetivo * 0.60;
                    else if (semanasParaProva === 1) volSemanalAtual = picoVolumeEfetivo * 0.40;
                }
            } else if (ehDeload) {
                volSemanalAtual *= 0.75;
            }
            
            volumesSemanais.push({ vol: volSemanalAtual, fase: fasePlano, ehDeload, semanasParaProva });
        }
        return volumesSemanais;
    }

    _gerarProvaAlvo(ctx) {
        let prescricao, estrutura;
        if (ctx.ehMetaTempo) {
            prescricao = `🏁 DIA D: Execute o plano de ritmo cravando ${ctx.paceAlvoStr}/km. Confie na preparação e na gestão de combustível.`;
            estrutura = [`${ctx.distAlvo}km contínuos mantendo o Pace Alvo de ${ctx.paceAlvoStr}/km.`];
        } else {
            prescricao = "🏁 DIA D: Conquista em foco! Mantenha ritmo confortável em Z2/Z3 e priorize completar a distância sem estresse de tempo.";
            estrutura = [`${ctx.distAlvo}km em ritmo constante e sustentável.`];
        }
        return { tipo: "PROVA ALVO", distancia: ctx.distAlvo, prescricao, estrutura };
    }

    _gerarTreinoLongo(ctx) {
        let tipo, distancia, prescricao, estrutura;
        const ehSemanaDeTeste = ctx.semanasTotais > 20 && ((ctx.numeroSemanaAtual + 1) % 10 === 0) && ctx.semanasParaProva > 3;

        if (ehSemanaDeTeste) {
            const distTeste = ctx.distAlvo <= 10 ? 5 : 10;
            tipo = "Time Trial (Teste de Ritmo)";
            distancia = 2 + distTeste + 1; 
            prescricao = `⏱️ DIA DE TESTE (${distTeste}k): Avaliação de evolução metabólica com pernas descansadas!`;
            estrutura = [
                `Aquecimento: 2km suaves em Z1 + 4x acelerações`,
                `Principal: ${distTeste}km em Esforço Sustentado (Z4/Z5)`,
                `Soltura: 1km trote em Z1`
            ];
        } else {
            const pctLongao = ctx.numRegen === 0 ? 0.55 : 0.42;
            let distBaseLongao = Math.min(ctx.volSemanalAtual * pctLongao, ctx.maxLongao);
            
            if (!ctx.ehDeload && ctx.semanasParaProva > 2 && ctx.fasePlano !== "Polimento (Tapering)") {
                const pisoProporcional = ctx.distAlvo <= 10 ? ctx.distAlvo * 0.75 : ctx.distAlvo * 0.50;
                distBaseLongao = Math.min(Math.max(distBaseLongao, pisoProporcional), ctx.maxLongao);
            }

            distancia = parseFloat(distBaseLongao.toFixed(1));

            if (ctx.fasePlano === "Polimento (Tapering)") {
                tipo = "Longão de Polimento";
                prescricao = "Tapering. Absorção de carga, volume reduzido e manutenção de viço.";
                estrutura = [`${distancia}km suaves em Z2.`];
            } else if (ctx.ehDeload) {
                tipo = "Longão Regenerativo";
                prescricao = "Semana de assimilação de carga. Foco em recuperação tecidual.";
                estrutura = [`${distancia}km leves em Z2.`];
            } else if (!ctx.ehMetaTempo) {
                tipo = (ctx.numeroSemanaAtual % 2 === 0) ? "Longão Aeróbico (LISS)" : "Longão Progressivo Leve";
                if (tipo.includes("LISS")) {
                    prescricao = "Construção de resistência aeróbica e adaptação estrutural. Mantenha Z2 estrita.";
                    estrutura = [`${distancia}km contínuos confortáveis em Z2.`];
                } else {
                    const baseKm = parseFloat((distancia * 0.75).toFixed(1));
                    const finalKm = parseFloat((distancia - baseKm).toFixed(1));
                    prescricao = "Progressão leve no final sem sair da zona de conforto aeróbica.";
                    estrutura = [`Início: ${baseKm}km em Z2`, `Final: ${finalKm}km em Z2 alto/Z3 leve`];
                }
            } else {
                const modSemana = ctx.numeroSemanaAtual % 3;
                if (modSemana === 0) {
                    tipo = "Longão Rodagem Z2";
                    prescricao = "Base aeróbica pura e eficiência no uso de gordura como combustível.";
                    estrutura = [`${distancia}km contínuos em Z2.`];
                } else if (modSemana === 1) {
                    tipo = "Longão Fast Finish";
                    const kmForte = ctx.distAlvo >= 21.1 ? 4 : 2.5;
                    const kmZ2 = Math.max(2, parseFloat((distancia - kmForte).toFixed(1)));
                    distancia = kmZ2 + kmForte;
                    prescricao = `Simulação mental: Feche os últimos ${kmForte}km cravados no Pace Alvo (${ctx.paceAlvoStr}/km).`;
                    estrutura = [`Base: ${kmZ2}km em Z2`, `Ataque: últimos ${kmForte}km no Pace Alvo (${ctx.paceAlvoStr}/km)`];
                } else {
                    tipo = "Longão em Blocos de Ritmo";
                    const aquecKm = Math.max(2, parseFloat((distancia * 0.20).toFixed(1)));
                    const ritmoKm = parseFloat((distancia * 0.55).toFixed(1));
                    const solturaKm = parseFloat((distancia - aquecKm - ritmoKm).toFixed(1));
                    distancia = aquecKm + ritmoKm + solturaKm;
                    prescricao = `Especificidade de ritmo: Sustente o bloco no Pace de Prova (${ctx.paceAlvoStr}/km).`;
                    estrutura = [`Aquecimento: ${aquecKm}km Z2`, `Bloco Principal: ${ritmoKm}km no Pace Alvo (${ctx.paceAlvoStr}/km)`, `Desaquecimento: ${solturaKm}km Z1`];
                }
            }
        }
        return { tipo, distancia, prescricao, estrutura };
    }

    _gerarTreinoQualidade(ctx) {
        let tipo, distancia, prescricao, estrutura;
        const pctTempo = ctx.numRegen === 0 ? 0.38 : 0.22;
        const distEstimada = Math.max(4, ctx.volSemanalAtual * pctTempo);
    
        // PACE ADAPTATIVO DA SEMANA
        const paceAtualSeg = this.state.atleta.paceBaseSegundos;
        const paceAlvoSeg = this.state.prova.paceAlvoSegundos || paceAtualSeg;
        const progressoSemana = Math.min(1.0, ctx.numeroSemanaAtual / Math.max(1, ctx.semanasTotais - 2));
        
        const paceSemanaLimiarSeg = Math.round(paceAtualSeg - ((paceAtualSeg - paceAlvoSeg) * progressoSemana * 0.7));
        const paceSemanaTirosSeg = Math.round(paceSemanaLimiarSeg * 0.92); 
        
        const paceSemanaLimiarStr = this._segundosParaPace(paceSemanaLimiarSeg);
        const paceSemanaTirosStr = this._segundosParaPace(paceSemanaTirosSeg);
    
        if (ctx.fasePlano === "Polimento (Tapering)") {
            tipo = "Tiros de Polimento";
            distancia = 2 + (4 * 0.4) + 1;
            prescricao = "Manutenção de ativação neuromuscular sem gerar fadiga pesada.";
            estrutura = [`Aquecimento: 2km Z1`, `Principal: 4x 400m soltos em Z4/Z5 (Pausa 90s Z1)`, `Soltura: 1km Z1`];
        } else if (!ctx.ehMetaTempo) {
            const intensosSuaves = ["Fartlek Confortável", "Tempo Run Moderado", "Rodagem com Estrutura", "Fartlek Livre"];
            tipo = intensosSuaves[ctx.numeroSemanaAtual % 4];
            if (tipo === "Fartlek Confortável") {
                const reps = Math.max(5, Math.floor((distEstimada - 3) / 0.4));
                distancia = 3 + (reps * 0.4);
                prescricao = "Variação suave de ritmo para ativar o sistema cardiovascular sem desgaste extremo.";
                estrutura = [`Aquecimento: 1.5km Z1`, `Principal: ${reps}x (2min Z3 moderado / 2min caminhada ou trote Z1)`, `Soltura: 1.5km Z1`];
            } else if (tipo === "Tempo Run Moderado") {
                const kmTempo = Math.max(2, Math.round(distEstimada - 3));
                distancia = 3 + kmTempo;
                prescricao = "Estímulo de limiar sob controle confortável em Z3.";
                estrutura = [`Aquecimento: 2km Z1`, `Principal: ${kmTempo}km firmes mas controlados em Z3`, `Soltura: 1km Z1`];
            } else {
                const kmBase = Math.max(3, Math.round(distEstimada - 3));
                distancia = 3 + kmBase;
                prescricao = "Rodagem contínua com foco em estabilidade respiratória.";
                estrutura = [`Aquecimento: 2km Z1`, `Principal: ${kmBase}km ritmo contínuo Z2/Z3`, `Soltura: 1km Z1`];
            }
        } else {
            const intensosMeta = ["Tempo Run", "Cruise Intervals", "Tiros Longos", "Fartlek Específico"];
            tipo = intensosMeta[ctx.numeroSemanaAtual % 4];
    
            if (tipo === "Tempo Run") {
                const kmLimiar = Math.max(3, Math.round(distEstimada - 3));
                distancia = 3 + kmLimiar;
                prescricao = `Sustentação de Limiar: Execute o bloco mantendo o pace adaptativo de ${paceSemanaLimiarStr}/km (Z4).`;
                estrutura = [`Aquecimento: 2km Z1`, `Principal: ${kmLimiar}km firmes em Z4 (Pace ~${paceSemanaLimiarStr}/km)`, `Soltura: 1km Z1`];
            } else if (tipo === "Cruise Intervals") {
                const blocoKm = ctx.distAlvo >= 21.1 ? 2 : 1;
                const reps = Math.max(3, Math.floor((distEstimada - 3) / blocoKm));
                distancia = 3 + (reps * blocoKm);
                prescricao = `Fracionado de Limiar: Mantenha as repetições cravadas em ${paceSemanaLimiarStr}/km (Z4).`;
                estrutura = [`Aquecimento: 1.5km Z1`, `Principal: ${reps}x ${blocoKm}km Z4 (${paceSemanaLimiarStr}/km) com pausa de 90s trote Z1`, `Soltura: 1.5km Z1`];
            } else if (tipo === "Tiros Longos") {
                const mTiro = ctx.distAlvo >= 21.1 ? 2000 : 1000;
                const reps = Math.max(3, Math.round((distEstimada * 0.5 * 1000) / mTiro));
                distancia = 3 + ((reps * mTiro) / 1000);
                const nomeTiro = mTiro >= 1000 ? `${mTiro / 1000}km` : `${mTiro}m`;
                prescricao = `Expansão de Potência Aeróbica: Execute os tiros em ${paceSemanaTirosStr}/km (Z4/Z5).`;
                estrutura = [`Aquecimento: 2km Z1`, `Principal: ${reps}x ${nomeTiro} em Z4/Z5 (${paceSemanaTirosStr}/km - Pausa 2min Z1)`, `Soltura: 1km Z1`];
            } else {
                const reps = Math.max(5, Math.floor((distEstimada - 3) / 0.6));
                distancia = 3 + parseFloat((reps * 0.6).toFixed(1));
                prescricao = `Fartlek Específico: Alternância entre Pace de Limiar (${paceSemanaLimiarStr}/km) e trote Z2.`;
                estrutura = [`Aquecimento: 1.5km Z1`, `Principal: ${reps}x (3min em ${paceSemanaLimiarStr}/km / 2min Z2 trote)`, `Soltura: 1.5km Z1`];
            }
        }
        return { tipo, distancia, prescricao, estrutura };
    }

    _gerarTreinoRegenerativo(ctx) {
        let tipo, prescricao, estrutura;
        let distancia = Math.max(3, (ctx.volSemanalAtual * 0.35) / ctx.numRegen);
        
        if (ctx.ontemFoiQualidade && ctx.distAlvo >= 21.1) {
            tipo = "Rodagem em Fadiga (Z2)";
            prescricao = "Estratégia Back-to-Back: Corra em Z2 (Leve a Moderado) com as pernas pesadas de ontem. Isso otimiza a queima de gordura e prepara mentalmente para o final da prova.";
            
            if (ctx.fasePlano !== "Polimento (Tapering)") {
                estrutura = [`${distancia.toFixed(1)}km constantes em Z2 (Foque na postura, mesmo com fadiga)`];
            } else {
                estrutura = [`${(distancia * 0.7).toFixed(1)}km em Z1 estrita (Polimento)`];
            }
        } 
        else {
            tipo = "Regenerativo";
            prescricao = "Recovery ativo e liberação metabólica. Mantenha Z1 rigorosa sem pressa.";
            
            if (ctx.fasePlano !== "Polimento (Tapering)") {
                estrutura = [`${distancia.toFixed(1)}km muito leves em Z1`, "Final: 4x 80m Strides (Acelerações soltas)"];
            } else {
                estrutura = [`${distancia.toFixed(1)}km em Z1 estrita`];
            }
        }
        return { tipo, distancia, prescricao, estrutura };
    }

    // ==========================================
    // UTILITÁRIOS (FORMATAÇÃO & CÁLCULOS)
    // ==========================================
    _segundosParaPace(seg) {
        if(!seg || isNaN(seg)) return "00:00";
        const m = Math.floor(seg / 60); 
        const s = Math.round(seg % 60); 
        return `${m < 10 ? '0':''}${m}:${s < 10 ? '0' : ''}${s}`;
    }
    
    _paceParaSegundos(str) {
        const parts = str.split(':');
        if(parts.length !== 2) return 330; 
        return (parseInt(parts[0]) * 60) + parseInt(parts[1]);
    }
    
    obterZonasKarvonen() {
        const base = this.state.atleta.paceBaseSegundos;
        const fcMax = this.state.atleta.fcMax;
        const fcRepouso = this.state.atleta.fcRepouso;
        const hrr = fcMax - fcRepouso;
        
        const calcBPM = (minPct, maxPct) => `${Math.round(fcRepouso + (minPct * hrr))}-${Math.round(fcRepouso + (maxPct * hrr))} bpm`;
        
        const explicacoes = {
            Z1: "🤍 Z1 (Recuperação): Muito leve. Conversa fácil em frases longas.",
            Z2: "💙 Z2 (Base Aeróbica): Confortável. Dá para bater papo sem perder o fôlego.",
            Z3: "💚 Z3 (Tempo / Moderado): Ritmo firme. Fôlego encurta, conversa em frases curtas.",
            Z4: "💛 Z4 (Limiar): Desconfortável / Forte. Exige foco total, fala apenas palavras soltas.",
            Z5: "❤️ Z5 (VO2 Máx / Tiros): Esforço máximo. Sensação de falta de ar, impossível falar."
        };

        const mapaZonas = {
            "Regenerativo": { pace: this._formatarFaixaRitmo(base * 1.22, base * 1.32), fc: `Z1 (${calcBPM(0.50, 0.60)})`, guia: explicacoes.Z1 },
            "Rodagem em Fadiga (Z2)": { pace: this._formatarFaixaRitmo(base * 1.10, base * 1.20), fc: `Z2 (${calcBPM(0.60, 0.70)})`, guia: "🧠 Resistência Mental: Você vai começar o treino já cansado. Mantenha a Z2 firme, o benefício fisiológico aqui é gigante." },
            "Longão": { pace: this._formatarFaixaRitmo(base * 1.10, base * 1.20), fc: `Z2 (${calcBPM(0.60, 0.70)})`, guia: explicacoes.Z2 },
            "Longão Rodagem Z2": { pace: this._formatarFaixaRitmo(base * 1.10, base * 1.20), fc: `Z2 (${calcBPM(0.60, 0.70)})`, guia: explicacoes.Z2 },
            "Longão Aeróbico (LISS)": { pace: this._formatarFaixaRitmo(base * 1.12, base * 1.22), fc: `Z2 (${calcBPM(0.60, 0.70)})`, guia: explicacoes.Z2 },
            "Longão Progressivo": { pace: `${this._formatarFaixaRitmo(base * 1.12, base * 1.20)} ➔ ${this._formatarFaixaRitmo(base * 1.00, base * 1.06)}`, fc: `Z2 ➔ Z3`, guia: explicacoes.Z2 },
            "Longão Fast Finish": { pace: `${this._formatarFaixaRitmo(base * 1.12, base * 1.20)} ➔ ${this._formatarFaixaRitmo(base * 0.96, base * 1.01)}`, fc: `Z2 ➔ Z4`, guia: explicacoes.Z2 },
            "Longão de Polimento": { pace: this._formatarFaixaRitmo(base * 1.15, base * 1.25), fc: `Z2 (${calcBPM(0.60, 0.70)})`, guia: explicacoes.Z2 },
            "Tempo Run": { pace: this._formatarFaixaRitmo(base * 0.95, base * 1.00), fc: `Z4 (${calcBPM(0.80, 0.88)})`, guia: explicacoes.Z4 },
            "Cruise Intervals": { pace: this._formatarFaixaRitmo(base * 0.94, base * 0.98), fc: `Z4 (${calcBPM(0.82, 0.88)})`, guia: explicacoes.Z4 },
            "Tiros Longos": { pace: this._formatarFaixaRitmo(base * 0.90, base * 0.95), fc: `Z4/Z5 (${calcBPM(0.88, 0.94)})`, guia: explicacoes.Z4 },
            "Intervalado VO2": { pace: this._formatarFaixaRitmo(base * 0.82, base * 0.88), fc: `Z5 (${calcBPM(0.90, 1.00)})`, guia: explicacoes.Z5 },
            "Tiros de Polimento": { pace: this._formatarFaixaRitmo(base * 0.85, base * 0.90), fc: `Z5 (${calcBPM(0.90, 1.00)})`, guia: explicacoes.Z5 },
            "Subidas": { pace: "Esforço Rampa", fc: `Z5 (${calcBPM(0.90, 1.00)})`, guia: explicacoes.Z5 },
            "Fartlek": { pace: "Variado", fc: `Z2 a Z5 (${calcBPM(0.60, 0.90)})`, guia: explicacoes.Z3 },
            "PROVA ALVO": { pace: this._formatarFaixaRitmo(base * 0.98, base * 1.02), fc: `Z3/Z4`, guia: explicacoes.Z4 },
            "Descanso": { pace: "-", fc: "-", guia: "🛌 Descanso total para adaptação muscular." },
            "Não Realizado": { pace: "-", fc: "-", guia: "Treino Expirado e cancelado pela IA." }
        };

        return new Proxy(mapaZonas, {
            get: (target, prop) => {
                if (prop in target) return target[prop];
                if (typeof prop === 'string') {
                    if (prop.includes("Regenerativo")) return target["Regenerativo"];
                    if (prop.includes("Longão")) return target["Longão"];
                    if (prop.includes("Tempo") || prop.includes("Cruise")) return target["Tempo Run"];
                    if (prop.includes("Tiros") || prop.includes("Intervalado") || prop.includes("Time Trial")) return target["Intervalado VO2"];
                    if (prop.includes("Fartlek")) return target["Fartlek"];
                }
                return { pace: this._formatarFaixaRitmo(base * 1.08, base * 1.15), fc: `Z2/Z3`, guia: explicacoes.Z2 };
            }
        });
    }
    
    obterTenisSugerido(tipoTreino) {
        const lista = this.state.atleta.tenis || [];
        const ativos = lista.filter(t => !t.aposentado);
        if (ativos.length === 0) return null;
        
        const ehVelocidade = tipoTreino.includes("Tempo") || tipoTreino.includes("Intervalado") || tipoTreino.includes("Tiros") || tipoTreino === "PROVA ALVO";
        const categoriaAlvo = ehVelocidade ? "velocidade" : "rodagem";

        let sugerido = ativos.find(t => t.categoria === categoriaAlvo);
        if (!sugerido) sugerido = ativos.find(t => t.categoria === "versatil");
        
        return sugerido ? sugerido.id : ativos[0].id;
    }
    
    adicionarTenis(nome, categoria) {
        this.state.atleta.tenis = this.state.atleta.tenis || [];
        this.state.atleta.tenis.push({
            id: Date.now(),
            nome: nome,
            categoria: categoria,
            kmAcumulados: 0,
            aposentado: false
        });
        this.state.logs.unshift({ data: new Date().toLocaleDateString('pt-BR'), msg: `Tênis '${nome}' adicionado à garagem.` });
        this.saveState();
    }

    verificarERecalibrarTimeTrial(treino, distReal, tempoMin) {
        const ehTimeTrial = treino.tipo.includes("Time Trial") || treino.tipo.includes("Teste");
        if (!ehTimeTrial || distReal <= 0 || tempoMin <= 0) return;

        const paceTesteSeg = Math.round((tempoMin * 60) / distReal);
        const paceBaseAntigo = this.state.atleta.paceBaseSegundos;

        if (paceTesteSeg < paceBaseAntigo) {
            const novoPaceBase = Math.round((paceTesteSeg * 0.7) + (paceBaseAntigo * 0.3));
            
            this.state.atleta.paceBaseSegundos = novoPaceBase;
            this.state.atleta.distanciaAtualMax = Math.max(this.state.atleta.distanciaAtualMax, distReal);

            const paceAntigoStr = this._segundosParaPace(paceBaseAntigo);
            const paceNovoStr = this._segundosParaPace(novoPaceBase);

            this.state.logs.unshift({
                data: new Date().toLocaleDateString('pt-BR'),
                msg: `🚀 <b>EVOLUÇÃO DETECTADA (Time Trial):</b> Performance confirmada! Seu Pace Base evoluiu de ${paceAntigoStr}/km para ${paceNovoStr}/km. Todo o macrociclo futuro foi reajustado.`
            });

            this.gerarPlanoTreino();
        }
    }
    
    processarTreino(treinoId, distReal, tempoMin, fcMedia, rpe, tenisId, ehEdicao = false) {
        if (!distReal || distReal <= 0 || !tempoMin || tempoMin <= 0) {
            if (typeof showToast === 'function') showToast("⚠️ Erro: Distância e Tempo devem ser maiores que zero.");
            return;
        }
        const treino = this.state.plano.find(t => t.id === parseInt(treinoId));
        if(!treino) return;

        treino.concluido = true;
        let tss = 0, logMsg = `[${treino.tipo}] ${distReal}km. `;
        
        const idxExistente = this.state.treinosRealizados.findIndex(t => t.idReferencia == treino.id && t.dataISO === treino.dataISO);
        
        if (ehEdicao && idxExistente > -1) {
            const treinoAntigo = this.state.treinosRealizados[idxExistente];
            if (treinoAntigo.tenisId) {
                const tenisAntigo = this.state.atleta.tenis.find(t => t.id == treinoAntigo.tenisId);
                if (tenisAntigo) tenisAntigo.kmAcumulados = Math.max(0, tenisAntigo.kmAcumulados - treinoAntigo.dist);
            }
        }

        if (tenisId && tenisId !== "") {
            const tenisUsado = this.state.atleta.tenis.find(t => t.id == tenisId);
            if(tenisUsado) {
                tenisUsado.kmAcumulados += distReal;
                logMsg += `Tênis: ${tenisUsado.nome}. `;
            }
        }
        
        if (!isNaN(fcMedia) && fcMedia > this.state.atleta.fcMax) {
            this.state.atleta.fcMax = fcMedia;
            logMsg += `Nova FC Máx (${fcMedia}). `;
        }
        
        let ifFactor = 0.75; 
        const fcNum = parseInt(fcMedia) || 0;

        if (!isNaN(fcNum) && fcNum > 0) {
            const hrr = this.state.atleta.fcMax - this.state.atleta.fcRepouso;
            const hrRatio = Math.max(0.1, Math.min(1, (fcNum - this.state.atleta.fcRepouso) / hrr));
            ifFactor = hrRatio / 0.85; 
            tss = (tempoMin / 60) * Math.pow(ifFactor, 2) * 100;
        } else {
            const safeRpe = isNaN(rpe) ? 6 : rpe; 
            ifFactor = safeRpe <= 4 ? Math.pow(safeRpe / 10, 1.5) : Math.max(0.4, safeRpe / 7.5);
            tss = (tempoMin / 60) * Math.pow(ifFactor, 2) * 100;
        }
        
        const fatorDeriva = this.calcularFatorDeriva(tempoMin, ifFactor);
        tss = Math.round(tss * fatorDeriva);

        logMsg += `Carga: ${tss} TSS.`;
        
        const novoRegistro = { 
            idReferencia: treino.id, 
            dataISO: treino.dataISO, 
            tss: tss, 
            dist: distReal,
            tempoMin: tempoMin,
            fcMedia: fcNum,
            tenisId: tenisId,
            rpeReal: parseInt(rpe) || 6
        };

        if (ehEdicao && idxExistente > -1) {
            this.state.treinosRealizados[idxExistente] = novoRegistro;
            this.state.logs.unshift({ data: new Date().toLocaleDateString('pt-BR'), msg: `✏️ Treino editado: ${logMsg}` });
        } else {
            this.state.treinosRealizados.push(novoRegistro);
            this.state.logs.unshift({ data: new Date().toLocaleDateString('pt-BR'), msg: logMsg });
        }

        this.verificarERecalibrarTimeTrial(treino, distReal, tempoMin);
        this.recalcularLinhaDoTempo();
        this.analisarFeedbackFisiologico();
        this.saveState();
    }
    
    analisarFeedbackFisiologico() {
        const realizados = this.state.treinosRealizados;
        if (realizados.length < 3) return;
        
        const ultimos3 = realizados.slice(-3);
        let fadigaCritica = 0;

        ultimos3.forEach(log => {
            const treino = this.state.plano.find(p => p.id === log.idReferencia);
            if (!treino) return;
            
            let expectedRPE = 5;
            const tipo = treino.tipo;

            if (tipo.includes("Regenerativo") || tipo.includes("Rodagem em Fadiga")) expectedRPE = 3;
            else if (tipo.includes("Longão")) expectedRPE = 6;
            else if (tipo.includes("Tempo") || tipo.includes("Cruise") || tipo.includes("Fartlek")) expectedRPE = 8;
            else if (tipo.includes("Intervalado") || tipo.includes("Tiros") || tipo.includes("Subidas") || tipo.includes("Time Trial") || tipo === "PROVA ALVO") expectedRPE = 9;

            const temFC = log.fcMedia && log.fcMedia > 0;
            if (temFC) {
                if (log.rpeReal >= expectedRPE + 2) fadigaCritica++;
            } else {
                if (expectedRPE <= 6 && log.rpeReal >= 8) fadigaCritica++;
                else if (expectedRPE <= 8 && log.rpeReal >= 10) fadigaCritica++;
            }
        });

        const acwr = this.state.atleta.ctl > 0 ? (this.state.atleta.atl / this.state.atleta.ctl) : 0;

        if (fadigaCritica >= 3 || acwr > 1.45) {
            const hojeISO = getLocalISODate();
            const dataLimite = new Date();
            dataLimite.setDate(dataLimite.getDate() + 5);
            const limiteISO = getLocalISODate(dataLimite);
            
            const treinosAfetados = this.state.plano.filter(t => 
                t.dataISO >= hojeISO && 
                t.dataISO <= limiteISO && 
                !t.concluido && 
                t.tipo !== "Descanso" &&
                t.tipo !== "Não Realizado"
            );

            let intervencaoRealizada = false;

            treinosAfetados.forEach(prox => {
                if (!prox.ajustadoPorIA) {
                    let msgAcao = "";

                    if (!prox.tipo.includes("Regenerativo") && !prox.tipo.includes("Longão") && !prox.tipo.includes("Rodagem em Fadiga")) {
                        prox.tipoOriginal = prox.tipo;
                        prox.tipo = "Regenerativo";
                        prox.prescricao = "⚠️ OVERREACHING DETECTADO. Sessão convertida para regenerativa em Z1 para dissipar fadiga aguda do sistema nervoso.";
                        const novaDist = Math.max(3, parseFloat((prox.distanciaBase * 0.7).toFixed(1)));
                        prox.distanciaBase = novaDist;
                        prox.estrutura = [`${novaDist}km extremamente leve em Z1`];
                        msgAcao = `Treino de ${prox.tipoOriginal} convertido em Regenerativo.`;
                    } else {
                        const oldDist = prox.distanciaBase;
                        prox.distanciaBase = parseFloat((oldDist * 0.70).toFixed(1));
                        prox.prescricao = "⚠️ ALERTA SOBRECARGA: Volume reduzido em 30% sistemicamente para prevenir lesões teciduais.";
                        if (prox.estrutura && prox.estrutura.length > 0) {
                            prox.estrutura[0] = `${prox.distanciaBase}km focado em ritmo de recuperação.`;
                        } else {
                            prox.estrutura = [`${prox.distanciaBase}km em recovery.`];
                        }
                        msgAcao = `Volume cortado de ${oldDist}km para ${prox.distanciaBase}km.`;
                    }
                    
                    prox.ajustadoPorIA = true;
                    intervencaoRealizada = true;
                    
                    const [, m, d] = prox.dataISO.split('-');
                    this.state.logs.unshift({ 
                        data: new Date().toLocaleDateString('pt-BR'), 
                        msg: `🛡️ <b>Protocolo IA (${d}/${m}):</b> ${msgAcao}` 
                    });
                }
            });

            if (intervencaoRealizada) {
                setTimeout(() => { 
                    if (typeof showToast === 'function') {
                        showToast("⚠️ Alerta IA: Sobrecarga crítica! Seus próximos 5 dias foram reestruturados."); 
                    }
                }, 4500);
            }
        }
    }

    deletarTreino(idRef, dataISO) {
        if(confirm("Remover este treino do histórico? Os dados de carga e a quilometragem do tênis serão recalculados.")) {
            const idx = this.state.treinosRealizados.findIndex(t => t.idReferencia == idRef && t.dataISO === dataISO);
            if(idx > -1) {
                const treinoRemovido = this.state.treinosRealizados[idx];
                
                if(treinoRemovido.tenisId) {
                    const tenisRestaurado = this.state.atleta.tenis.find(t => t.id == treinoRemovido.tenisId);
                    if(tenisRestaurado) {
                        tenisRestaurado.kmAcumulados = Math.max(0, tenisRestaurado.kmAcumulados - treinoRemovido.dist);
                    }
                }
                
                this.state.treinosRealizados.splice(idx, 1);

                const treinoPlano = this.state.plano.find(p => p.id == idRef && p.dataISO === dataISO);
                if(treinoPlano) treinoPlano.concluido = false;
                
                this.state.logs.unshift({ data: new Date().toLocaleDateString('pt-BR'), msg: `Treino de ${dataISO} removido. TSS e KMs estornados.` });
                this.recalcularLinhaDoTempo();
                atualizarTelasGlobais();
            }
        }
    }
    
    calcularMonotoniaEFoster() {
        if (!this.state || !this.state.treinosRealizados) return { monotonia: 0, strain: 0, status: "Ideal" };
        
        const hoje = new Date();
        hoje.setHours(0,0,0,0);
        
        const DIAS = 14;
        let cargasUltimos14Dias = [];
        
        for (let i = DIAS - 1; i >= 0; i--) {
            let d = new Date(hoje);
            d.setDate(hoje.getDate() - i);
            const dataIsoStr = getLocalISODate(d);
            
            const treinosDoDia = this.state.treinosRealizados.filter(t => t.dataISO === dataIsoStr);
            let tssDia = 0;
            treinosDoDia.forEach(t => tssDia += t.tss);
            
            cargasUltimos14Dias.push(tssDia);
        }
        
        const somaTotal = cargasUltimos14Dias.reduce((acc, val) => acc + val, 0);
        const media = somaTotal / DIAS;
        
        const variancia = cargasUltimos14Dias.reduce((acc, val) => acc + Math.pow(val - media, 2), 0) / DIAS;
        const desvioPadrao = Math.sqrt(variancia);
        
        if (desvioPadrao === 0) {
            return { monotonia: media > 0 ? 2.0 : 0, strain: somaTotal, status: "Sem variação" };
        }
        
        const monotonia = media / desvioPadrao;
        const strain = somaTotal * monotonia;
        
        let status = "Ideal";
        if (monotonia > 2.0) status = "Alto Risco";
        else if (monotonia >= 1.5) status = "Atenção";
        
        return {
            monotonia: parseFloat(monotonia.toFixed(2)),
            strain: Math.round(strain),
            status: status
        };
    }

    atualizarSimulador(paceSegundos) {
        if (!this.state) return;
        const elPace = document.getElementById('sim-pace-val');
        const elUnit = document.getElementById('sim-pace-unit');
        const elHr = document.getElementById('sim-hr-val');
        const elZone = document.getElementById('sim-zone-val');

        if (!elPace) return;

        if (this.state.modoEsteira) {
            const kmh = (3600 / paceSegundos).toFixed(1);
            elPace.innerText = kmh;
            if (elUnit) elUnit.innerText = "km/h";
        } else {
            elPace.innerText = this._segundosParaPace(paceSegundos);
            if (elUnit) elUnit.innerText = "/km";
        }

        const basePace = this.state.atleta.paceBaseSegundos;
        const hrRep = this.state.atleta.fcRepouso;
        const hrMax = this.state.atleta.fcMax;
        const hrr = hrMax - hrRep;

        const ratio = basePace / paceSegundos;          
        const estHrrPct = ratio * 0.85;

        let estHr = hrRep + (estHrrPct * hrr);
        estHr = Math.min(hrMax, Math.max(hrRep, Math.round(estHr)));

        elHr.innerText = estHr;

        const pct = estHrrPct;
        let zona = "Z1 - Recuperação"; let cor = "var(--brand-accent)";
        if (pct >= 0.90) { zona = "Z5 - VO2 Máx"; cor = "var(--danger)"; }
        else if (pct >= 0.80) { zona = "Z4 - Limiar"; cor = "var(--warning)"; }
        else if (pct >= 0.70) { zona = "Z3 - Tempo"; cor = "var(--warning)"; }
        else if (pct >= 0.60) { zona = "Z2 - Base (LISS)"; cor = "var(--brand-accent)"; }
        
        elZone.innerText = zona;
        elZone.style.color = cor;
        elZone.style.borderColor = cor;
    }
}

// Instanciação Global da Aplicação
const app = new RunningCoach();
window.app = app;