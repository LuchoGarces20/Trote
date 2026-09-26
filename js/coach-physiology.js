// ==========================================
// MOTOR DE FISIOLOGIA E MODELOS MATEMÁTICOS
// ==========================================
const CoachPhysiology = {
    // 1. Zonas de Karvonen & Ritmos
    obterZonasKarvonen(paceBaseSeg, fcRepouso = 60, fcMax = 185, modoEsteira = false) {
        const trimp = (porcentagem) => Math.round(fcRepouso + (porcentagem / 100) * (fcMax - fcRepouso));
        
        // CENÁRIO 8: Trava sanitizadora contra valores nulos, negativos ou div/0
        const formatarPaceOuVel = (segundos) => {
            const segSanitizado = Math.max(1, segundos || 0);
            if (modoEsteira) {
                const kmh = 3600 / segSanitizado;
                return `${kmh.toFixed(1)} km/h`;
            }
            const min = Math.floor(segSanitizado / 60);
            const seg = Math.round(segSanitizado % 60);
            return `${min}:${seg < 10 ? '0' : ''}${seg} /km`;
        };

        const paceSanitizado = Math.max(1, paceBaseSeg || 300);

        return {
            "Regenerativo": {
                pace: formatarPaceOuVel(paceSanitizado + 75),
                fc: `${trimp(60)} - ${trimp(68)} bpm (Z1)`,
                guia: "Conversacional fluida. Esforço muito leve (3-4/10)."
            },
            "Rodagem Leve": {
                pace: formatarPaceOuVel(paceSanitizado + 45),
                fc: `${trimp(68)} - ${trimp(76)} bpm (Z2)`,
                guia: "Ritmo confortável. Respiração controlada (4-5/10)."
            },
            "Ritmo Maratona": {
                pace: formatarPaceOuVel(paceSanitizado + 20),
                fc: `${trimp(76)} - ${trimp(82)} bpm (Z3)`,
                guia: "Ritmo sustentável de prova longa. Foco mental (6/10)."
            },
            "Limiar Anaeróbico": {
                pace: formatarPaceOuVel(paceSanitizado - 5),
                fc: `${trimp(82)} - ${trimp(88)} bpm (Z4)`,
                guia: "Desconfortável, fala apenas frases curtas (7-8/10)."
            },
            "Intervalado VO2": {
                pace: formatarPaceOuVel(paceSanitizado - 25),
                fc: `${trimp(88)} - ${trimp(95)} bpm (Z5)`,
                guia: "Esforço muito forte/ofegante. Foco total (9/10)."
            },
            "Tiros de Velocidade": {
                pace: formatarPaceOuVel(paceSanitizado - 45),
                fc: `> ${trimp(95)} bpm (Z5+)`,
                guia: "Sprint máximo/quase máximo com boa técnica (10/10)."
            }
        };
    },

    // 2. Modelo de Banister Otimizado (CTL / ATL / TSB)
    recalcularHistoricoCTL(historicoCTL, treinosRealizados, ctlInicial = 20, atlInicial = 20, dataInicioISO = null) {
        if (!historicoCTL || historicoCTL.length === 0) return [];
        const treinosMap = new Map();
        if (treinosRealizados && treinosRealizados.length > 0) {
            for (let i = 0; i < treinosRealizados.length; i++) {
                const t = treinosRealizados[i];
                if (t && t.dataISO) treinosMap.set(t.dataISO, t);
            }
        }
        let ctl = ctlInicial;
        let atl = atlInicial;
        let startIndex = 0;
        if (dataInicioISO) {
            const idx = historicoCTL.findIndex(d => d.dataISO === dataInicioISO);
            if (idx > 0) {
                startIndex = idx;
                ctl = historicoCTL[idx - 1].ctl || ctlInicial;
                atl = historicoCTL[idx - 1].atl || atlInicial;
            }
        }
        const kCTL = 1 - Math.exp(-1 / 42);
        const kATL = 1 - Math.exp(-1 / 7);
        for (let i = startIndex; i < historicoCTL.length; i++) {
            const dia = historicoCTL[i];
            const treinoDoDia = treinosMap.get(dia.dataISO);
            const tss = treinoDoDia ? (Number(treinoDoDia.tss) || 0) : 0;
            ctl = ctl + (tss - ctl) * kCTL;
            atl = atl + (tss - atl) * kATL;
            const tsb = ctl - atl;
            historicoCTL[i] = {
                ...dia,
                tss,
                ctl: parseFloat(ctl.toFixed(1)),
                atl: parseFloat(atl.toFixed(1)),
                tsb: parseFloat(tsb.toFixed(1))
            };
        }
        return historicoCTL;
    },

    // 3. Índice de Monotonia e Carga de Foster
    calcularMonotoniaEFoster(treinosRealizadosSemana) {
        if (!treinosRealizadosSemana || treinosRealizadosSemana.length === 0) {
            return { monotonia: 0, foster: 0 };
        }
        const cargas = treinosRealizadosSemana.map(t => t.tss || 0);
        const soma = cargas.reduce((a, b) => a + b, 0);
        const media = soma / 7;
        const variancia = cargas.reduce((acc, val) => acc + Math.pow(val - media, 2), 0) / 7;
        const desvioPadrao = Math.sqrt(variancia);
        const monotonia = desvioPadrao > 0 ? parseFloat((media / desvioPadrao).toFixed(2)) : 0;
        const foster = Math.round(soma * monotonia);
        return { monotonia, foster };
    },

    // 4. Predição de Prova por Riegel (Com Suporte a Prova Customizada)
    calcularPrevisoesRiegel(paceBaseSeg, distAlvoCustom = null) {
        const paceSanitizado = Math.max(1, paceBaseSeg || 300);
        const distRef = 5;
        const tempoRefSeg = paceSanitizado * distRef;
        const provas = [
            { nome: '5k', dist: 5 },
            { nome: '10k', dist: 10 },
            { nome: '21k', dist: 21.097 },
            { nome: '42k', dist: 42.195 }
        ];

        // CENÁRIO 4: Adiciona prova atípica customizada se informada
        if (distAlvoCustom && !provas.some(p => Math.abs(p.dist - distAlvoCustom) < 0.2)) {
            provas.push({ nome: `${distAlvoCustom}k (Alvo)`, dist: distAlvoCustom });
            provas.sort((a, b) => a.dist - b.dist);
        }

        return provas.map(p => {
            const tempoSeg = tempoRefSeg * Math.pow(p.dist / distRef, 1.06);
            const paceMedioSeg = tempoSeg / p.dist;
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

    // 5. Mapeamento de Treino de Força / Musculação
    obterTreinoForca(dataISO, fazMusculacao, divisaoMusculacao, diasMusculacao) {
        if (!fazMusculacao || divisaoMusculacao === 'nenhum' || !diasMusculacao || diasMusculacao.length === 0) {
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
        const idx = diasMusculacao.indexOf(diaSemana) % listaSessoes.length;
        return listaSessoes[idx];
    },

    // 6. Cálculo Assertivo de TSS (TRIMP Karvonen para FC Real + Fallback sRPE)
    calcularTSS(tempoMin, rpe, fcMedia = null, atleta = null) {
        const tempo = parseFloat(tempoMin) || 0;
        if (tempo <= 0) return 0;

        const fc = fcMedia ? parseInt(fcMedia) : null;
        if (fc && atleta && atleta.fcRepouso && atleta.fcMax && fc > atleta.fcRepouso) {
            const fcRep = atleta.fcRepouso;
            const fcMax = atleta.fcMax;
            const pctHRR = Math.max(0.01, Math.min(1.0, (fc - fcRep) / Math.max(1, fcMax - fcRep)));
            const y = (atleta.genero === 'F') ? 1.67 : 1.92;
            const trimp = tempo * pctHRR * 0.64 * Math.exp(y * pctHRR);
            const tssHR = Math.round(trimp * 0.60);
            return Math.min(Math.max(1, tssHR), 500);
        }

        const rpeVal = parseInt(rpe) || 6;
        const rpeMultiplier = Math.pow(rpeVal / 5, 2);
        const tssRPE = Math.round(tempo * rpeMultiplier);
        return Math.min(Math.max(1, tssRPE), 500);
    }
};