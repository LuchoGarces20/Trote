// ==========================================
// MOTOR DE FISIOLOGIA E MODELOS MATEMÁTICOS (BLINDAGEM TOTAL V2)
// ==========================================

const CoachPhysiology = {
    obterZonasKarvonen(paceBaseSeg, fcRepouso = 60, fcMax = 185, modoEsteira = false) {
        const rep = Math.max(30, Math.min(120, parseInt(fcRepouso, 10) || 60));
        const max = Math.max(rep + 10, Math.min(230, parseInt(fcMax, 10) || 185));
        const paceSanitizado = Math.max(60, Math.min(1200, parseFloat(paceBaseSeg) || 300));

        const trimp = (porcentagem) => {
            const pct = Math.max(0, Math.min(100, parseFloat(porcentagem) || 0));
            return Math.round(rep + (pct / 100) * (max - rep));
        };

        const formatarRange = (segMin, segMax) => {
            if (modoEsteira) {
                const velMin = (3600 / segMax).toFixed(1);
                const velMax = (3600 / segMin).toFixed(1);
                return `${velMin} - ${velMax} km/h`;
            }
            const formatarSeg = (segundos) => {
                const min = Math.floor(segundos / 60);
                const seg = Math.round(segundos % 60);
                return `${min}:${seg < 10 ? '0' : ''}${seg}`;
            };
            return `${formatarSeg(segMin)} - ${formatarSeg(segMax)} /km`;
        };

        return {
            "Regenerativo": {
                pace: formatarRange(paceSanitizado * 1.20, paceSanitizado * 1.30),
                segundosMedio: (paceSanitizado * 1.20 + paceSanitizado * 1.30) / 2,
                fc: `${trimp(60)} - ${trimp(68)} bpm (Z1)`,
                guia: "Conversacional fluida. Esforço muito leve (3-4/10)."
            },
            "Rodagem Leve": {
                pace: formatarRange(paceSanitizado * 1.10, paceSanitizado * 1.20),
                segundosMedio: (paceSanitizado * 1.10 + paceSanitizado * 1.20) / 2,
                fc: `${trimp(68)} - ${trimp(76)} bpm (Z2)`,
                guia: "Ritmo confortável. Respiração controlada (4-5/10)."
            },
            "Ritmo Maratona": {
                pace: formatarRange(paceSanitizado * 1.02, paceSanitizado * 1.08),
                segundosMedio: (paceSanitizado * 1.02 + paceSanitizado * 1.08) / 2,
                fc: `${trimp(76)} - ${trimp(82)} bpm (Z3)`,
                guia: "Ritmo sustentável de prova longa. Foco mental (6/10)."
            },
            "Limiar Anaeróbico": {
                pace: formatarRange(paceSanitizado * 0.93, paceSanitizado * 0.97),
                segundosMedio: (paceSanitizado * 0.93 + paceSanitizado * 0.97) / 2,
                fc: `${trimp(82)} - ${trimp(88)} bpm (Z4)`,
                guia: "Desconfortável, fala apenas frases curtas (7-8/10)."
            },
            "Intervalado VO2": {
                pace: formatarRange(paceSanitizado * 0.85, paceSanitizado * 0.90),
                segundosMedio: (paceSanitizado * 0.85 + paceSanitizado * 0.90) / 2,
                fc: `${trimp(88)} - ${trimp(95)} bpm (Z5)`,
                guia: "Esforço muito forte/ofegante. Foco total (9/10)."
            },
            "Tiros de Velocidade": {
                pace: formatarRange(paceSanitizado * 0.75, paceSanitizado * 0.80),
                segundosMedio: (paceSanitizado * 0.75 + paceSanitizado * 0.80) / 2,
                fc: `> ${trimp(95)} bpm (Z5+)`,
                guia: "Sprint máximo/quase máximo com boa técnica (10/10)."
            }
        };
    },

    recalcularHistoricoCTL(historicoCTL, treinosRealizados, planoFuturo, atleta, ctlInicial = 20, atlInicial = 20, dataInicioISO = null) {
        if (!Array.isArray(historicoCTL) || historicoCTL.length === 0) return [];
        
        const hojeISO = getLocalISODate();
        const treinosMap = new Map();
        if (Array.isArray(treinosRealizados)) {
            for (const t of treinosRealizados) {
                if (t && t.dataISO) {
                    const currentTss = treinosMap.get(t.dataISO) || 0;
                    treinosMap.set(t.dataISO, currentTss + Math.max(0, parseFloat(t.tss) || 0));
                }
            }
        }

        const planoMap = new Map();
        if (Array.isArray(planoFuturo)) {
            for (const p of planoFuturo) {
                if (p && p.dataISO > hojeISO && p.tipo !== "Descanso" && p.distanciaBase > 0) {
                    // Estima o TSS do treino planejado usando RPE médio 6 e o pace base
                    const paceBase = atleta?.paceBaseSegundos || 330;
                    const tempoEst = (p.distanciaBase * paceBase) / 60;
                    const estTss = this.calcularTSS(tempoEst, 6, null, atleta);
                    planoMap.set(p.dataISO, estTss);
                }
            }
        }

        let ctl = Math.max(0, parseFloat(ctlInicial) || 0);
        let atl = Math.max(0, parseFloat(atlInicial) || 0);
        let startIndex = 0;
        
        if (dataInicioISO) {
            const idx = historicoCTL.findIndex(d => d && d.dataISO === dataInicioISO);
            if (idx > 0) {
                startIndex = idx;
                const diaPrev = historicoCTL[idx - 1];
                ctl = Math.max(0, parseFloat(diaPrev?.ctl) || ctlInicial);
                atl = Math.max(0, parseFloat(diaPrev?.atl) || atlInicial);
            }
        }

        const kCTL = 1 - Math.exp(-1 / 42);
        const kATL = 1 - Math.exp(-1 / 7);

        for (let i = startIndex; i < historicoCTL.length; i++) {
            const dia = historicoCTL[i] || {};
            let tss = 0;
            const ehFuturo = dia.dataISO > hojeISO;

            if (ehFuturo) {
                tss = planoMap.get(dia.dataISO) || 0;
            } else {
                tss = treinosMap.get(dia.dataISO) || 0;
            }
            
            ctl = ctl + (tss - ctl) * kCTL;
            atl = atl + (tss - atl) * kATL;
            const tsb = ctl - atl;

            historicoCTL[i] = {
                ...dia,
                ehFuturo: ehFuturo,
                tss: Math.round(tss),
                ctl: parseFloat(ctl.toFixed(1)) || 0,
                atl: parseFloat(atl.toFixed(1)) || 0,
                tsb: parseFloat(tsb.toFixed(1)) || 0
            };
        }
        return historicoCTL;
    },

    calcularMonotoniaEFoster(treinosRealizadosSemana) {
        if (!Array.isArray(treinosRealizadosSemana)) {
            return { monotonia: 0, foster: 0 };
        }

        const mapDias = {};
        treinosRealizadosSemana.forEach(t => {
            if (t && t.dataISO) {
                mapDias[t.dataISO] = (mapDias[t.dataISO] || 0) + Math.max(0, parseFloat(t?.tss) || 0);
            }
        });

        // ISSUE 9: Tratar rigorosamente 7 dias (incluindo folgas) e evitar div/0
        const cargas = Object.values(mapDias);
        while (cargas.length < 7) cargas.push(0);

        const soma = cargas.reduce((a, b) => a + b, 0);
        const media = soma / 7;
        const variancia = cargas.reduce((acc, val) => acc + Math.pow(val - media, 2), 0) / 7;
        const desvioPadrao = Math.sqrt(variancia);
        
        let monotonia = 0;
        if (media > 0) {
            monotonia = parseFloat((media / Math.max(0.001, desvioPadrao)).toFixed(2));
        }

        const foster = Math.round(soma * monotonia);
        return { monotonia, foster: isNaN(foster) ? 0 : foster };
    },

    calcularPrevisoesRiegel(paceBaseSeg, distAlvoCustom = null) {
        const paceSanitizado = Math.max(60, Math.min(1200, parseFloat(paceBaseSeg) || 300));
        const distRef = 5;
        const tempoRefSeg = paceSanitizado * distRef;

        const provas = [
            { nome: '5k', dist: 5 },
            { nome: '10k', dist: 10 },
            { nome: '21k', dist: 21.097 },
            { nome: '42k', dist: 42.195 }
        ];

        const customDistNum = parseFloat(distAlvoCustom);
        if (!isNaN(customDistNum) && customDistNum > 0.5 && !provas.some(p => Math.abs(p.dist - customDistNum) < 0.2)) {
            provas.push({ nome: `${customDistNum}k (Alvo)`, dist: customDistNum });
            provas.sort((a, b) => a.dist - b.dist);
        }

        return provas.map(p => {
            const distSegura = Math.max(0.1, p.dist);
            const tempoSeg = tempoRefSeg * Math.pow(distSegura / distRef, 1.06);
            const paceMedioSeg = tempoSeg / distSegura;
            
            const hor = Math.floor(tempoSeg / 3600);
            const min = Math.floor((tempoSeg % 3600) / 60);
            const seg = Math.round(tempoSeg % 60);
            
            const paceMin = Math.floor(paceMedioSeg / 60);
            const paceSeg = Math.round(paceMedioSeg % 60);
            
            const tempoFormatado = hor > 0 
                ? `${hor}h${min < 10 ? '0' : ''}${min}m` 
                : `${min}m${seg < 10 ? '0' : ''}${seg}s`;
                
            return {
                prova: p.nome,
                tempoEstimado: tempoFormatado,
                paceMedio: `${paceMin}:${paceSeg < 10 ? '0' : ''}${paceSeg}/km`
            };
        });
    },

    obterTreinoForca(dataISO, fazMusculacao, divisaoMusculacao, diasMusculacao) {
        if (!fazMusculacao || divisaoMusculacao === 'nenhum' || !Array.isArray(diasMusculacao) || diasMusculacao.length === 0) {
            return null;
        }

        const dAtual = parseLocalDate(dataISO);
        const diaSemana = dAtual.getDay();
        if (!diasMusculacao.includes(diaSemana)) return null;

        const rotinas = {
            'fullbody': ['Full Body A (Quadríceps & Core)', 'Full Body B (Posterior & Glúteos)', 'Full Body C (Estabilizadores)'],
            'ab': ['Treino A (Membros Inferiores)', 'Treino B (Membros Superiores & Core)'],
            'abc': ['Treino A (Quadríceps)', 'Treino B (Posteriores)', 'Treino C (Superiores/Core)'],
            'abcd': ['Treino A (Quadríceps e Panturrilhas)', 'Treino B (Peito e Tríceps)', 'Treino C (Posterior e Glúteos)', 'Treino D (Costas e Bíceps)']
        };

        const listaSessoes = rotinas[divisaoMusculacao] || rotinas['fullbody'];
        const idxIndex = diasMusculacao.indexOf(diaSemana);
        const idx = (idxIndex >= 0 ? idxIndex : 0) % listaSessoes.length;
        
        return listaSessoes[idx];
    },

    calcularTSS(tempoMin, rpe, fcMedia = null, atleta = null) {
        const tempo = Math.max(0, parseFloat(tempoMin) || 0);
        if (tempo <= 0) return 0;

        const fc = fcMedia ? parseInt(fcMedia, 10) : null;
        const fcRep = atleta ? parseFloat(atleta.fcRepouso) : NaN;
        const fcMax = atleta ? parseFloat(atleta.fcMax) : NaN;

        if (!isNaN(fc) && fc > 0 && !isNaN(fcRep) && !isNaN(fcMax) && fcMax > fcRep && fc > fcRep) {
            const pctHRR = Math.max(0.01, Math.min(1.0, (fc - fcRep) / (fcMax - fcRep)));
            const y = (atleta?.genero === 'F') ? 1.67 : 1.92;
            const trimp = tempo * pctHRR * 0.64 * Math.exp(y * pctHRR);
            const tssHR = Math.round(trimp * 0.60);
            return Math.min(Math.max(1, tssHR || 0), 500);
        }

        const rpeVal = Math.max(1, Math.min(10, parseInt(rpe, 10) || 6));
        const rpeMultiplier = Math.pow(rpeVal / 5, 2);
        const tssRPE = Math.round(tempo * rpeMultiplier);
        return Math.min(Math.max(1, tssRPE || 0), 500);
    }
};