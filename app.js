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

const STORAGE_KEY = 'trote_app_v4';

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

class RunningCoach {
    constructor() {
        this.state = this.loadState();
        if (this.state) {
            if(!this.state.atleta.tenis) this.state.atleta.tenis = [];
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

    // 1. RECURSO: Rebalanceamento Semanal Automático
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
                        msg: `⚖️ <b>Rebalanceamento IA:</b> ${t2.tipo} adiado para ${novaDataISO.split('-').reverse().join('/')} para garantir recuperação neuromuscular.`
                    });
                } else if (!t2.concluido) {
                    t2.tipo = "Regenerativo";
                    t2.prescricao = "⚖️ Rebalanceamento Automático: Sessão ajustada para Z1 para evitar sobrecarga de dias intensos colados.";
                    const distRegen = Math.max(3, parseFloat((t2.distanciaBase * 0.7).toFixed(1)));
                    t2.distanciaBase = distRegen;
                    t2.estrutura = [`${distRegen}km leve em Z1`];
                }
            }
        }
        this.state.plano.sort((a, b) => new Date(a.dataISO) - new Date(b.dataISO));
    }
    
    recalcularLinhaDoTempo() {
        if (!this.state || !this.state.atleta || !this.state.atleta.dataInicioISO) return;
        
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
                if (treinoPlanejado && treinoPlanejado.tipo !== "Descanso") {
                    const dist = treinoPlanejado.distanciaBase * (this.state.atleta.multiplicadorVolume || 1.0);
                    const paceSeg = this.state.atleta.paceBaseSegundos;
                    const tempoMin = (dist * paceSeg) / 60;
                    
                    let ifEst = 0.75; 
                    if (treinoPlanejado.tipo.includes("Regenerativo")) ifEst = 0.60;
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

    // 2. RECURSO: Índice de Desacoplamento Cardíaco (Pa:HR)
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
        
        // Limiar de início da deriva escala com o Fitness Crônico (CTL)
        const tLimiar = Math.min(120, 45 + Math.round(ctlAtual * 1.0));
        
        if (tempoMin <= tLimiar) return 1.0;
        
        const minutosExcedentes = tempoMin - tLimiar;
        const amortecimentoCtl = 1 + (0.01 * ctlAtual);
        const taxaDeriva = (Math.pow(ifFactor, 2) / amortecimentoCtl) * 0.12;
        
        const fatorAdicional = (minutosExcedentes / 60) * taxaDeriva;
        return parseFloat((1.0 + Math.min(0.25, fatorAdicional)).toFixed(3));
    }

    // 3. RECURSO: Simulador de Previsão de Prova (Race Predictor)
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
        let dayTempo = dias[0]; 
        if(dias.length >= 3) dayTempo = dias[Math.floor((dias.length - 1) / 2)];
        
        const diasRegen = dias.filter(d => d !== dayLongao && d !== dayTempo);
        const dataHojeISO = getLocalISODate();
        
        const tenisInicial = [{
            id: Date.now(),
            nome: dadosForm.tenisNome,
            categoria: dadosForm.tenisCat,
            kmAcumulados: 0,
            aposentado: false
        }];
        
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
                diasTreino: { longao: dayLongao, tempo: dayTempo, regen: diasRegen }
            },
            prova: { distancia: dadosForm.distAlvo, dataStr: dadosForm.dataAlvo },
            plano: [], treinosRealizados: [], logs: []
        };
        
        this.state.logs.push({ data: new Date().toLocaleDateString('pt-BR'), msg: `Calibração Karvonen & VDOT ativa. FC Máx: ${fcMaxCalc}, Repouso: ${dadosForm.fcRepouso}.` });
        
        this.gerarPlanoTreino();
        this.recalcularLinhaDoTempo();
    }
    
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
    
    let maxLongao;
    if (distAlvo >= 42.2) maxLongao = 34;
    else if (distAlvo >= 21.1) maxLongao = 22;
    else if (distAlvo > 5) maxLongao = 14;
    else maxLongao = 10;

    const semanasTotais = Math.ceil((diasTotais + 1) / 7);
    let volumesSemanais = [];
    let picoVolumeEfetivo = volSemanalBase;
    let volumeCorrida = volSemanalBase;
    
    for (let w = 0; w < semanasTotais; w++) {
        const semanasParaProva = semanasTotais - w;
        let fasePlano = "";

        // AJUSTE 1: Cap Fisiológico Dinâmico (cresce +0.05 por semana a partir de 2.5 até o limite de 4.0)
        const multCapDinamico = Math.min(4.0, 2.5 + (w * 0.05));
        const capFisiologicoSemanal = volSemanalBase * multCapDinamico;
        const capProva = Math.max(volSemanalBase * 1.2, distAlvo * 2.2);
        const capSemanalAbsoluto = Math.min(capFisiologicoSemanal, capProva);
        
        if (semanasParaProva <= 2) {
            fasePlano = "Polimento (Tapering)";
        } else if (semanasParaProva <= 10) {
            fasePlano = `Específico para ${distAlvo}k`;
            volumeCorrida = Math.min(volumeCorrida * 1.03, capSemanalAbsoluto);
        } else if (semanasParaProva <= 18) {
            fasePlano = "Construção de Limiar";
            volumeCorrida = Math.min(volumeCorrida * 1.025, capSemanalAbsoluto * 0.9);
        } else {
            fasePlano = "Base & Velocidade (5k/10k)";
            const capBaseExtendido = Math.max(volSemanalBase * 1.6, capSemanalAbsoluto * 0.70);
            volumeCorrida = Math.min(volumeCorrida * 1.018, capBaseExtendido);
        }

        if (fasePlano !== "Polimento (Tapering)" && volumeCorrida > picoVolumeEfetivo) {
            picoVolumeEfetivo = volumeCorrida;
        }
        
        let volSemanalAtual = volumeCorrida;

        // AJUSTE 3: Garante que a semana anterior a um Time Trial seja obrigatoriamente um Deload
        const proximaEhSemanaDeTeste = semanasTotais > 20 && ((w + 2) % 10 === 0) && (semanasTotais - (w + 1) > 3);
        const ehDeload = ((w % 4 === 3) || proximaEhSemanaDeTeste) && semanasParaProva > 2;
        
        if (semanasParaProva === 2) volSemanalAtual = picoVolumeEfetivo * 0.60;
        else if (semanasParaProva === 1) volSemanalAtual = picoVolumeEfetivo * 0.40;
        else if (ehDeload) volSemanalAtual *= 0.75;
        
        volumesSemanais.push({ vol: volSemanalAtual, fase: fasePlano, ehDeload: ehDeload, semanasParaProva: semanasParaProva });
    }
    
    for (let i = 0; i <= diasTotais; i++) {
        let dataTreino = new Date(dataInicio);
        dataTreino.setDate(dataInicio.getDate() + i);
        const diaSemana = dataTreino.getDay() === 0 ? 7 : dataTreino.getDay();
        const diaSemanaNormal = dataTreino.getDay();
        
        const numeroSemanaAtual = Math.floor(i / 7);
        const infoSemana = volumesSemanais[Math.min(numeroSemanaAtual, volumesSemanais.length - 1)];
        const volSemanalAtual = infoSemana.vol;
        const fasePlano = infoSemana.fase;
        const ehDeload = infoSemana.ehDeload;
        const semanasParaProva = infoSemana.semanasParaProva;
        
        let tipo = "Descanso", distancia = 0, prescricao = "", estrutura = [];
        
        if (i === diasTotais) {
            tipo = "PROVA ALVO"; distancia = distAlvo; 
            prescricao = "O trabalho está feito. Confie no polimento e execute a estratégia.";
            estrutura = [`${distancia}km contínuos no pace alvo da prova.`];
        } else if ((diaSemanaNormal === longao || diaSemana === longao) && i !== diasTotais) {
            const ehSemanaDeTeste = semanasTotais > 20 && 
                                    (numeroSemanaAtual + 1) % 10 === 0 && 
                                    semanasParaProva > 3;

            if (ehSemanaDeTeste) {
                const distTeste = distAlvo <= 10 ? 5 : 10;
                tipo = "Time Trial (Teste de Ritmo)";
                distancia = distTeste + 3; 
                prescricao = `🏁 DIA DE TESTE (${distTeste}k): Avaliação de evolução metabólica (VDOT) com pernas descansadas!`;
                estrutura = [
                    "Aquecimento: 2km suaves em Z1 + 4x acelerações soltas",
                    `Principal: ${distTeste}km em Esforço Máximo Sustentado (Z5/Limiar)`,
                    "Soltura: 1km trote em Z1"
                ];
            } else {
                const pctLongao = numRegen === 0 ? 0.55 : 0.42;
                distancia = Math.min(volSemanalAtual * pctLongao, maxLongao); 

                if (!ehDeload && semanasParaProva > 2 && fasePlano !== "Polimento (Tapering)") {
                    const pisoProporcional = distAlvo <= 10 ? distAlvo * 0.75 : distAlvo * 0.50;
                    distancia = Math.min(Math.max(distancia, pisoProporcional), maxLongao);
                }

                const distKm = parseFloat(distancia.toFixed(1));

                if (semanasParaProva <= 2) {
                    tipo = "Longão de Polimento";
                    prescricao = "Tapering. Absorção de carga, volume reduzido e hidratação.";
                    estrutura = [`${distKm}km suaves em Z2.`];
                } else if (ehDeload) {
                    tipo = "Longão Regenerativo";
                    prescricao = "Semana de assimilação de carga. Foco em recuperação tecidual.";
                    estrutura = [`${distKm}km leves em Z2.`];
                } else if (fasePlano.includes("Base & Velocidade")) {
                    if (numeroSemanaAtual % 2 === 0) {
                        tipo = "Longão Aeróbico (LISS)";
                        prescricao = "Construção de capilarização muscular. Mantenha Z2 estrita.";
                        estrutura = [`${distKm}km contínuos em Z2.`];
                    } else {
                        tipo = "Longão Progressivo";
                        const baseKm = (distKm * 0.7).toFixed(1);
                        const finalKm = (distKm - parseFloat(baseKm)).toFixed(1);
                        prescricao = "Progressão moderada no final para recrutar fibras em fadiga leve.";
                        estrutura = [`Início: ${baseKm}km em Z2`, `Final: ${finalKm}km acelerando até Z3`];
                    }
                } else {
                    const modSemana = numeroSemanaAtual % 4;

                    if (modSemana === 0) {
                        tipo = "Longão Rodagem Z2";
                        prescricao = "Base aeróbica pura e queima de gordura como combustível.";
                        estrutura = [`${distKm}km contínuos em Z2.`];
                    } else if (modSemana === 1) {
                        tipo = "Longão Fast Finish";
                        const kmForte = distAlvo >= 21.1 ? 5 : 3;
                        const kmZ2 = Math.max(2, distKm - kmForte).toFixed(1);
                        const kmAtaque = (distKm - parseFloat(kmZ2)).toFixed(1);
                        prescricao = "Simulação mental de fim de prova. Termine com pernas cansadas mas fortes.";
                        estrutura = [`Base: ${kmZ2}km em Z2`, `Ataque: Últimos ${kmAtaque}km no Pace de Prova (Z3/Z4)`];
                    } else if (modSemana === 2) {
                        tipo = "Longão em Blocos de Ritmo";
                        const aquecKm = Math.max(2, parseFloat((distKm * 0.20).toFixed(1)));
                        const ritmoKm = parseFloat((distKm * 0.60).toFixed(1));
                        const solturaKm = parseFloat((distKm - aquecKm - ritmoKm).toFixed(1));
                        prescricao = `Especificidade para ${distAlvo}k: Blocos sustentados no ritmo da prova.`;
                        estrutura = [`Aquecimento: ${aquecKm}km Z2`, `Bloco Principal: ${ritmoKm}km no Pace de Prova`, `Desaquecimento: ${solturaKm}km Z1`];
                    } else {
                        tipo = "Longão Progressivo Avançado";
                        const terço = (distKm / 3).toFixed(1);
                        prescricao = "3 Terços: Z2 leve -> Z3 moderado -> Z4 limiar no final.";
                        estrutura = [`${terço}km Z2`, `${terço}km Z3`, `${terço}km Z4`];
                    }
                }
            }
        } else if (diaSemanaNormal === tempo || diaSemana === tempo) {
            const pctTempo = numRegen === 0 ? 0.38 : 0.22;
            
            if (fasePlano === "Polimento (Tapering)") {
                tipo = "Tiros de Polimento";
                distancia = Math.max(3, volSemanalAtual * 0.15);
                prescricao = "Manutenção de viço muscular sem gerar metabólitos pesados.";
                estrutura = ["Aquecimento: 15min Z1", "Principal: 4x 400m Z5 (Pausa 90s Z1)", "Soltura: 10min Z1"];
            } else if (fasePlano.includes("Base & Velocidade")) {
                const intensosBase = ["Intervalado VO2", "Fartlek", "Subidas", "Tempo Run"];
                tipo = intensosBase[numeroSemanaAtual % 4];
                distancia = Math.max(4, volSemanalAtual * pctTempo);
                
                if (tipo === "Intervalado VO2") {
                    const reps = Math.max(5, Math.min(10, Math.round((distancia * 0.4 * 1000) / 400)));
                    prescricao = "Estímulo de velocidade rápida e melhoria da mecânica de passada.";
                    estrutura = ["Aquecimento: 15min Z1", `Principal: ${reps}x 400m em Z5 (Pausa 60s trote Z1)`, "Soltura: 10min Z1"];
                } else if (tipo === "Fartlek") {
                    prescricao = "Jogo de velocidades livre para sensibilidade de ritmo.";
                    estrutura = ["Aquecimento: 10min Z1", "Principal: 10x (1min Z4-Z5 / 1min Z1 trote)", "Soltura: 10min Z1"];
                } else if (tipo === "Subidas") {
                    prescricao = "Força específica, recrutamento de fibras e proteção articular.";
                    estrutura = ["Aquecimento: 15min Z1", "Principal: 8x 30s rampa forte Z5 (descida trote)", "Soltura: 10min Z1"];
                } else {
                    prescricao = "Corrida contínua de limiar inicial.";
                    estrutura = ["Aquecimento: 2km Z1", `Principal: ${Math.max(2, Math.round(distancia - 3))}km em Z3`, "Soltura: 1km Z1"];
                }
            } else {
                const intensosEsp = ["Tempo Run", "Cruise Intervals", "Tiros Longos", "Fartlek Específico"];
                tipo = intensosEsp[numeroSemanaAtual % 4];
                distancia = Math.max(4, volSemanalAtual * pctTempo);

                if (tipo === "Tempo Run") {
                    const kmLimiar = Math.max(3, Math.round(distancia - 3));
                    prescricao = "Sustentação de Limiar de Lactato (Anatropismo). Desconforto controlado.";
                    estrutura = ["Aquecimento: 2km Z1", `Principal: ${kmLimiar}km firmes em Z4 (Limiar)`, "Soltura: 1km Z1"];
                } else if (tipo === "Cruise Intervals") {
                    const blocoKm = distAlvo >= 21.1 ? 2 : 1;
                    const reps = Math.max(3, Math.floor((distancia - 3) / blocoKm));
                    prescricao = "Fracionado de limiar: permite maior tempo total na zona Z4 com pausas curtas.";
                    estrutura = ["Aquecimento: 1.5km Z1", `Principal: ${reps}x ${blocoKm}km Z4 (Pausa 90s trote Z1)`, "Soltura: 1.5km Z1"];
                } else if (tipo === "Tiros Longos") {
                    const mTiro = distAlvo >= 21.1 ? 2000 : 1000;
                    const reps = Math.max(3, Math.round((distancia * 0.5 * 1000) / mTiro));
                    const nomeTiro = mTiro >= 1000 ? `${mTiro / 1000}km` : `${mTiro}m`;
                    prescricao = "Expansão da potência aeróbica superior e resiliência psicológica.";
                    estrutura = ["Aquecimento: 15min Z1/Z2", `Principal: ${reps}x ${nomeTiro} em Z4/Z5 (Pausa 2min Z1)`, "Soltura: 10min Z1"];
                } else {
                    prescricao = "Fartlek Específico com alternância entre pace de prova e pace leve.";
                    estrutura = ["Aquecimento: 10min Z1", "Principal: 6x (3min Pace Prova Z4 / 2min Z2)", "Soltura: 10min Z1"];
                }
            }
        } else if (numRegen > 0 && (regen.includes(diaSemanaNormal) || regen.includes(diaSemana))) {
            tipo = "Regenerativo"; 
            distancia = Math.max(3, (volSemanalAtual * 0.35) / numRegen); 
            prescricao = "Recovery ativo e flushing de resíduos metabólicos.";
            
            if (fasePlano !== "Polimento (Tapering)") {
                estrutura = [`${distancia.toFixed(1)}km em Z1 (Sem pressa)`, "Final: 4x 80m Strides (Acelerações soltas)"];
            } else {
                estrutura = [`${distancia.toFixed(1)}km em Z1 estrita`];
            }
        }
        
        this.state.plano.push({
            id: idCounter++, dataISO: getLocalISODate(dataTreino),
            tipo: tipo, distanciaBase: parseFloat(distancia.toFixed(1)), 
            prescricao: prescricao, estrutura: estrutura, concluido: false,
            fasePlano: fasePlano
        });
    }
}
    
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
        
        return {
            "Regenerativo": { pace: `${this._segundosParaPace(base * 1.28)}/km`, fc: `Z1 (${calcBPM(0.50, 0.60)})` },
            "Longão": { pace: `${this._segundosParaPace(base * 1.15)}/km`, fc: `Z2 (${calcBPM(0.60, 0.70)})` },
            "Longão Rodagem Z2": { pace: `${this._segundosParaPace(base * 1.15)}/km`, fc: `Z2 (${calcBPM(0.60, 0.70)})` },
            "Longão Aeróbico (LISS)": { pace: `${this._segundosParaPace(base * 1.16)}/km`, fc: `Z2 (${calcBPM(0.60, 0.70)})` },
            "Longão Progressivo": { pace: `${this._segundosParaPace(base * 1.15)} ➔ ${this._segundosParaPace(base * 1.03)}/km`, fc: `Z2 ➔ Z3` },
            "Longão Fast Finish": { pace: `${this._segundosParaPace(base * 1.15)} ➔ ${this._segundosParaPace(base * 0.98)}/km`, fc: `Z2 ➔ Z4` },
            "Longão em Blocos de Ritmo": { pace: `Z2 / Bloco: ${this._segundosParaPace(base * 1.01)}/km`, fc: `Z2 / Z3-Z4` },
            "Longão Progressivo Avançado": { pace: "Z2 ➔ Z3 ➔ Z4", fc: "Z2 ➔ Z3 ➔ Z4" },
            "Tempo Run": { pace: `${this._segundosParaPace(base * 0.97)}/km`, fc: `Z4 (${calcBPM(0.80, 0.88)})` },
            "Cruise Intervals": { pace: `${this._segundosParaPace(base * 0.96)}/km`, fc: `Z4 (${calcBPM(0.82, 0.88)})` },
            "Tiros Longos": { pace: `${this._segundosParaPace(base * 0.92)}/km`, fc: `Z4/Z5 (${calcBPM(0.88, 0.94)})` },
            "Intervalado VO2": { pace: `${this._segundosParaPace(base * 0.85)}/km`, fc: `Z5 (${calcBPM(0.90, 1.00)})` },
            "Tiros Curtos (Neuromuscular)": { pace: `${this._segundosParaPace(base * 0.82)}/km`, fc: `Z5 (${calcBPM(0.92, 1.00)})` },
            "Fartlek": { pace: "Variado (Z2 a Z5)", fc: `Z2 a Z5 (${calcBPM(0.60, 0.90)})` },
            "Fartlek Específico": { pace: "Variado", fc: "Z2 a Z4" },
            "Subidas": { pace: "Esforço Máx Rampa", fc: `Z5 (${calcBPM(0.90, 1.00)})` },
            "PROVA ALVO": { pace: `${this._segundosParaPace(base * 1.01)}/km`, fc: `Z3/Z4` },
            "Descanso": { pace: "-", fc: "-" }
        };
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
    
    processarTreino(treinoId, distReal, tempoMin, fcMedia, rpe, tenisId) {
        const treino = this.state.plano.find(t => t.id === parseInt(treinoId));
        if(!treino) return;
        treino.concluido = true;
        let tss = 0, logMsg = `[${treino.tipo}] ${distReal}km. `;
        
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
        
        // 1. Declaração do ifFactor com escopo geral do método
        let ifFactor = 0.75;
        const fcNum = parseInt(fcMedia) || 0;

        if (!isNaN(fcNum) && fcNum > 0) {
            const hrr = this.state.atleta.fcMax - this.state.atleta.fcRepouso;
            const hrRatio = Math.max(0.1, Math.min(1, (fcNum - this.state.atleta.fcRepouso) / hrr));
            ifFactor = hrRatio / 0.85; 
            tss = (tempoMin / 60) * Math.pow(ifFactor, 2) * 100;
        } else {
            const safeRpe = isNaN(rpe) ? 6 : rpe; 
            if (safeRpe <= 4) {
                ifFactor = Math.pow(safeRpe / 10, 1.5);
            } else {
                ifFactor = Math.max(0.4, safeRpe / 7.5);
            }
            tss = (tempoMin / 60) * Math.pow(ifFactor, 2) * 100;
        }
        
        // 2. Aplica o Fator de Deriva Cardíaca Dinâmico
        const fatorDeriva = this.calcularFatorDeriva(tempoMin, ifFactor);
        tss = Math.round(tss * fatorDeriva);
        logMsg += `Carga: ${tss} TSS.`;
        
        // 3. Salva a fcMedia no registro para a análise de feedback da IA
        this.state.treinosRealizados.push({ 
            idReferencia: treino.id, 
            dataISO: treino.dataISO, 
            tss: tss, 
            dist: distReal,
            fcMedia: fcNum,
            tenisId: tenisId,
            rpeReal: parseInt(rpe) || 6
        });
        this.recalcularLinhaDoTempo();
        this.state.logs.unshift({ data: new Date().toLocaleDateString('pt-BR'), msg: logMsg });
        
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
        if(!treino) return;
        
        let expectedRPE = 5;
        if(treino.tipo === "Regenerativo") expectedRPE = 3;
        else if(treino.tipo.includes("Longão")) expectedRPE = 6;
        else if(["Tempo Run", "Fartlek", "Cruise Intervals"].includes(treino.tipo)) expectedRPE = 8;
        else if(["Intervalado VO2", "Subidas", "Tiros Longos"].includes(treino.tipo)) expectedRPE = 9;

        // AJUSTE 4: Se não houver FC média digitada, só considera fadiga crítica em RPE 9/10 se o treino era leve/moderado (Incoerência de Esforço)
        const temFC = log.fcMedia && log.fcMedia > 0;
        if (temFC) {
            if (log.rpeReal >= expectedRPE + 2 || log.rpeReal >= 9) fadigaCritica++;
        } else {
            if (expectedRPE <= 6 && log.rpeReal >= 8) fadigaCritica++; // Treino leve sentido como muito duro
            else if (log.rpeReal >= 10) fadigaCritica++; // Exaustão extrema absoluta
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
            t.tipo !== "Descanso"
        );

        let intervencaoRealizada = false;

        treinosAfetados.forEach(prox => {
            if (!prox.ajustadoPorIA) {
                let msgAcao = "";

                if (!prox.tipo.includes("Regenerativo") && !prox.tipo.includes("Longão")) {
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
                    if(prox.estrutura && prox.estrutura.length > 0) {
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
                    msg: `🚨 <b>Protocolo IA (${d}/${m}):</b> ${msgAcao}` 
                });
            }
        });

        if (intervencaoRealizada) {
            setTimeout(() => { 
                showToast("⚠️ Alerta IA: Sobrecarga crítica! Seus próximos 5 dias foram reestruturados."); 
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
        if(!this.state) return;
        const elPace = document.getElementById('sim-pace-val');
        const elHr = document.getElementById('sim-hr-val');
        const elZone = document.getElementById('sim-zone-val');
        if(!elPace) return;

        elPace.innerText = this._segundosParaPace(paceSegundos);

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

const app = new RunningCoach();
window.app = app; 

function formatarDataHoje() {
    const dias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const d = new Date();
    return `${dias[d.getDay()]}, ${d.getDate()} ${meses[d.getMonth()]}`;
}

let currentWizardStep = 1;
window.changeWizardStep = function(direction) {
    document.getElementById(`step-${currentWizardStep}`).classList.remove('active');
    document.getElementById(`dot-${currentWizardStep}`).classList.remove('active');
    currentWizardStep += direction;
    document.getElementById(`step-${currentWizardStep}`).classList.add('active');
    document.getElementById(`dot-${currentWizardStep}`).classList.add('active');
}

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
}

// 4. MÉTODOS DE UI E GRÁFICO ATUALIZADOS
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
                    borderColor: '#0284C7',
                    backgroundColor: 'rgba(2, 132, 199, 0.1)',
                    borderWidth: 3,
                    tension: 0.3,
                    fill: true,
                    pointRadius: 0
                },
                {
                    label: 'Fitness Projetado (CTL)',
                    data: dadosJanela.map(h => h.ehFuturo || h.dataISO === hojeISO ? h.ctl : null),
                    borderColor: '#0284C7',
                    borderDash: [6, 6],
                    borderWidth: 2,
                    tension: 0.3,
                    pointRadius: 0
                },
                {
                    type: 'bar',
                    label: 'Forma (TSB)',
                    data: dadosJanela.map(h => (h.ctl - h.atl)),
                    backgroundColor: (context) => {
                        const val = context.raw;
                        return val > 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)';
                    },
                    borderRadius: 3
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
    const hojeISO = getLocalISODate();
    const treinoHoje = app.state.plano.find(t => t.dataISO === hojeISO);
    const zonas = app.obterZonasKarvonen();
    const uiHoje = document.getElementById('ui-hoje');
    
    let themeColor = 'var(--brand-accent)';
    let themeGlow = 'var(--brand-glow)';
    
    if (treinoHoje && !treinoHoje.concluido && treinoHoje.tipo !== "Descanso") {
        if (["Tempo Run", "Fartlek", "Cruise Intervals", "PROVA ALVO"].includes(treinoHoje.tipo)) {
            themeColor = 'var(--warning)'; 
            themeGlow = 'rgba(245, 158, 11, 0.2)';
        } else if (["Intervalado VO2", "Subidas", "Tiros Longos", "Tiros Curtos (Neuromuscular)"].includes(treinoHoje.tipo)) {
            themeColor = 'var(--danger)'; 
            themeGlow = 'rgba(239, 68, 68, 0.2)';
        }
    }
    uiHoje.style.setProperty('--theme-color', themeColor);
    uiHoje.style.setProperty('--theme-glow', themeGlow);

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

    if (!treinoHoje) {
        uiHoje.innerHTML = `<div class="today-date">${formatarDataHoje()}</div><h2 class="today-type">Ciclo Concluído</h2><p class="today-desc">Jornada finalizada.</p>`;
    } else if (treinoHoje.concluido) {
        uiHoje.innerHTML = `<div class="today-date">${formatarDataHoje()}</div><h2 class="today-type">${treinoHoje.tipo}</h2><div class="today-done"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg></div><p class="today-desc">Sessão finalizada. Foco na recuperação.</p>${progressHtml}`;
    } else if (treinoHoje.tipo === "Descanso") {
        uiHoje.innerHTML = `<div class="today-date">${formatarDataHoje()}</div><h2 class="today-type">Recovery</h2><div class="today-rest"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg></div><p class="today-desc">O ganho de performance ocorre no repouso.</p>${progressHtml}`;
    } else {
        const paceAlvo = zonas[treinoHoje.tipo]?.pace || '-';
        const fcAlvo = zonas[treinoHoje.tipo]?.fc || '-';
        const distCalculada = parseFloat((treinoHoje.distanciaBase * app.state.atleta.multiplicadorVolume).toFixed(1));
        
        let htmlEstrutura = '';
        if (treinoHoje.estrutura && treinoHoje.estrutura.length > 0) {
            htmlEstrutura = `<div class="workout-structure"><div class="workout-structure-title">Execução</div>` +
                  treinoHoje.estrutura.map(bloco => `<div class="workout-block">${bloco}</div>`).join('') + `</div>`;
        }
        
        const tenisIdSugerido = app.obterTenisSugerido(treinoHoje.tipo);
        let nomeTenisSugerido = "Escolha um tênis";
        if(tenisIdSugerido) {
            const tFound = app.state.atleta.tenis.find(t => t.id === tenisIdSugerido);
            if(tFound) nomeTenisSugerido = tFound.nome;
        }
        let hintTenis = app.state.atleta.tenis.length > 0 
            ? `<div style="margin-bottom: 20px; font-size: 0.82rem; color: var(--theme-color); font-weight: 700; transition: color 0.5s ease;">Tênis Recomendado: <span style="color: var(--text-primary); font-weight: 600;">${nomeTenisSugerido}</span></div>`
            : '';
            
        const nomeFase = treinoHoje.fasePlano || 'Ciclo de Treino';
            
        uiHoje.innerHTML = `
            <div class="phase-badge">${nomeFase}</div>
            <div class="today-date">${formatarDataHoje()}</div>
            <h2 class="today-type">${treinoHoje.tipo}</h2>
            <div class="today-distance">${distCalculada}<span>km</span></div>
            
            <div class="today-metrics">
                <div class="today-metrics-card"><div>Pace Alvo</div><strong>${paceAlvo}</strong></div>
                <div class="today-metrics-card"><div>Frequência Cardíaca</div><strong>${fcAlvo}</strong></div>
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
                    <strong>${d}/${m}</strong> - ${t.dist}km <br>
                    <span>Carga Gerada: ${t.tss} TSS</span>
                    ${nomeTenisLog}
                </div>
                <button class="btn-icon-small" onclick="app.deletarTreino('${t.idReferencia}', '${t.dataISO}')">Excluir</button>
            </div>`;
        }).join('');
    }

    const feed = document.getElementById('feed-relatorios');
    feed.innerHTML = app.state.logs.slice(0, 10).map(log => `<div class="log-entry"><span class="log-date">${log.data}</span>${log.msg}</div>`).join('');

    const uiCalendario = document.getElementById('ui-calendario');
    let htmlCalendario = ''; 
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
            : `<svg class="day-chevron" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;

        let actionBtn = !treino.concluido 
            ? `<button class="btn-outline-small" onclick="event.stopPropagation(); abrirModalReagendar(${treino.id}, '${treino.dataISO}')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg> Mudar Dia do Treino</button>` 
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
    
    // Chama o Renderizador do Race Predictor
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
}

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

document.getElementById('form-tenis').addEventListener('submit', (e) => {
    e.preventDefault();
    const nome = document.getElementById('input-tenis-nome').value;
    const cat = document.getElementById('input-tenis-cat').value;
    
    app.adicionarTenis(nome, cat);
    fecharModal('modal-tenis');
    e.target.reset();
    atualizarTelasGlobais();
});

document.getElementById('form-setup').addEventListener('submit', (e) => {
    e.preventDefault();
    const dias = Array.from(document.querySelectorAll('input[name="setup-dias"]:checked')).map(el => parseInt(el.value));
    if (dias.length < 2) return alert("Selecione pelo menos 2 dias.");
    
    const dataAlvoStr = document.getElementById('setup-data-alvo').value;
    const dAlvo = parseLocalDate(dataAlvoStr);
    const diasAteProva = Math.ceil((dAlvo - new Date()) / (1000 * 60 * 60 * 24));
    
    const distAlvo = parseFloat(document.getElementById('setup-dist-alvo').value);
    const volSemanal = parseFloat(document.getElementById('setup-vol-semanal').value);

    const semanasDisponiveis = Math.floor(diasAteProva / 7);
    const fatorPiso = semanasDisponiveis >= 20 ? 0.35 : (semanasDisponiveis >= 12 ? 0.45 : 0.60);

if (distAlvo >= 21.1 && volSemanal < distAlvo * fatorPiso) {
    const msgAviso = `⚠️ ALERTA DE SEGURANÇA FISIOLÓGICA:\n\nSeu volume semanal atual (${volSemanal} km) está muito abaixo do recomendável para preparar ${distAlvo} km em ${semanasDisponiveis} semanas.\n\nO Trote criará um plano progressivo com travas rígidas de volume para prevenir lesões teciduais.\n\nDeseja prosseguir com o plano blindado?`;
    if (!confirm(msgAviso)) return;
}

    if (diasAteProva < 21) {
        const confirmar = confirm("⚠️ Atenção! Sua prova é em menos de 3 semanas.\n\nO Trote entrará diretamente na fase de Polimento para descansar suas pernas.\n\nDeseja continuar?");
        if (!confirmar) return;
    }

    app.initSetup({
        nome: document.getElementById('setup-nome').value, 
        idade: parseInt(document.getElementById('setup-idade').value),
        genero: document.getElementById('setup-genero').value,
        diasSelecionados: dias,
        distAlvo: parseFloat(document.getElementById('setup-dist-alvo').value),
        dataAlvo: document.getElementById('setup-data-alvo').value, 
        distAtual: parseFloat(document.getElementById('setup-dist-atual').value),
        tempoAtual: parseInt(document.getElementById('setup-tempo-atual').value), 
        volSemanal: parseFloat(document.getElementById('setup-vol-semanal').value),
        fcRepouso: parseInt(document.getElementById('setup-fc-repouso').value),
        fcMax: document.getElementById('setup-fc-max').value,
        tenisNome: document.getElementById('setup-tenis-nome').value,
        tenisCat: document.getElementById('setup-tenis-cat').value
    });
    
    currentWizardStep = 1;
    document.querySelectorAll('.wizard-step').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.progress-dot').forEach(el => el.classList.remove('active'));
    document.getElementById('step-1').classList.add('active');
    document.getElementById('dot-1').classList.add('active');

    renderizarTelas();
});

window.abrirModal = function(idModal) { document.getElementById(idModal).classList.add('active'); }
window.fecharModal = function(idModal) { document.getElementById(idModal).classList.remove('active'); }
window.fecharModaisFora = function(event, idModal) { 
    if (event.target === document.getElementById(idModal)) fecharModal(idModal); 
}

window.abrirTreino = function(id, tipo, distCalculada) {
    abrirModal('modal-treino');
    document.getElementById('treino-id').value = id; 
    document.getElementById('input-dist').value = distCalculada;
    
    const zonas = app.obterZonasKarvonen();
    let estimativaMin = 45; 
    if(zonas[tipo] && zonas[tipo].pace !== "-" && !zonas[tipo].pace.includes("Variado") && !zonas[tipo].pace.includes("Máx")) {
        const paceStr = zonas[tipo].pace.split(' ')[0].replace('/km', '');
        const paceSegundos = app._paceParaSegundos(paceStr);
        estimativaMin = Math.round((paceSegundos * distCalculada) / 60);
    } else {
        estimativaMin = Math.round((app.state.atleta.paceBaseSegundos * distCalculada) / 60);
    }
    document.getElementById('input-tempo').value = estimativaMin;
    
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
}

window.showToast = function(msg) {
    const toast = document.getElementById('toast');
    toast.innerHTML = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 4000);
}

document.getElementById('form-treino').addEventListener('submit', (e) => {
    e.preventDefault();
    app.processarTreino(
        document.getElementById('treino-id').value,
        parseFloat(document.getElementById('input-dist').value),
        parseInt(document.getElementById('input-tempo').value),
        parseInt(document.getElementById('input-fc').value),
        parseInt(document.getElementById('input-rpe').value),
        document.getElementById('input-treino-tenis').value
    );
    fecharModal('modal-treino');
    e.target.reset();
    atualizarTelasGlobais();

    const ultimoTreino = app.state.treinosRealizados[app.state.treinosRealizados.length - 1];
    if(ultimoTreino) {
        showToast(`🔥 Treino salvo! Você gerou <strong>${ultimoTreino.tss} TSS</strong>. Seu Fitness subiu!`);
    }
});

window.aposentarTenis = function(id) {
    if(confirm("Deseja aposentar este tênis? Os KMs ficarão salvos, mas ele sairá das opções de treino.")) {
        const t = app.state.atleta.tenis.find(x => x.id === id);
        if(t) t.aposentado = true;
        app.saveState();
        atualizarTelasGlobais();
    }
}

window.abrirConfig = function() {
    if (!app.state) return;
    document.getElementById('config-genero').value = app.state.atleta.genero;
    document.getElementById('config-fc-repouso').value = app.state.atleta.fcRepouso;
    document.getElementById('config-fc-max').value = app.state.atleta.fcMax;
    document.getElementById('config-pace-base').value = app._segundosParaPace(app.state.atleta.paceBaseSegundos);
    abrirModal('modal-config');
}

document.getElementById('form-config').addEventListener('submit', (e) => {
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

window.resetarApp = function() {
    if(confirm("ATENÇÃO: Deseja destruir todo o seu histórico e recalibrar o motor?")) {
        localStorage.removeItem(STORAGE_KEY);
        location.reload();
    }
}

window.abrirModalReagendar = function(treinoId, dataAtualISO) {
    document.getElementById('reagendar-id').value = treinoId;
    document.getElementById('reagendar-data').value = dataAtualISO;
    abrirModal('modal-reagendar');
}

document.getElementById('form-reagendar').addEventListener('submit', (e) => {
    e.preventDefault();
    const treinoId = parseInt(document.getElementById('reagendar-id').value);
    const novaDataISO = document.getElementById('reagendar-data').value;

    const treino = app.state.plano.find(t => t.id === treinoId);
    if(treino) {
        const dataAntiga = treino.dataISO;
        treino.dataISO = novaDataISO;

        app.state.plano.sort((a, b) => new Date(a.dataISO) - new Date(b.dataISO));

        const formatoBrAntiga = dataAntiga.split('-').reverse().join('/');
        const formatoBrNova = novaDataISO.split('-').reverse().join('/');
        app.state.logs.unshift({ 
            data: new Date().toLocaleDateString('pt-BR'), 
            msg: `Agenda modificada: O ${treino.tipo} passou do dia ${formatoBrAntiga.substring(0,5)} para ${formatoBrNova.substring(0,5)}.` 
        });

        app.saveState();
        fecharModal('modal-reagendar');
        
        // Chamando a nova lógica de rebalanceamento IA
        app.rebalancearSemana(novaDataISO);
        app.recalcularLinhaDoTempo();
        atualizarTelasGlobais();
        
        showToast("Treino reagendado com sucesso! 🗓️");
    }
});

window.abrirEstrategiaProva = function() {
    if(!app.state) return;
    document.getElementById('est-distancia').value = app.state.prova.distancia;
    const minutosIdeais = Math.round((app.state.atleta.paceBaseSegundos * app.state.prova.distancia) / 60);
    const h = Math.floor(minutosIdeais / 60).toString().padStart(2, '0');
    const m = (minutosIdeais % 60).toString().padStart(2, '0');
    document.getElementById('est-tempo').value = `${h}:${m}`;
    
    document.getElementById('resultado-estrategia').style.display = 'none';
    abrirModal('modal-estrategia');
}

document.getElementById('form-estrategia').addEventListener('submit', (e) => {
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

renderizarTelas();