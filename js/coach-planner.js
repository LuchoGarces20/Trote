// ==========================================
// GERADOR DE PLANOS DE TREINO & MACROCICLOS
// ==========================================
const CoachPlanner = {

    // Helper privado: Verifica silenciosamente se o dia tem treino muscular de pernas
    _ehTreinoPernas(dataISO, atleta) {
        if (!atleta.fazMusculacao) return false;
        const treinoForca = CoachPhysiology.obterTreinoForca(
            dataISO, atleta.fazMusculacao, atleta.divisaoMusculacao, atleta.diasMusculacao
        );
        if (!treinoForca) return false;
        const tfLower = (typeof treinoForca === 'string' ? treinoForca : (treinoForca.nome || '')).toLowerCase();
        return tfLower.includes('inferiores') || tfLower.includes('quadríceps') ||
               tfLower.includes('posterior') || tfLower.includes('full body');
    },

    // 1. Gerador do Macrociclo Completo
    gerarPlano(atleta, prova) {
        const dataInicio = parseLocalDate(atleta.dataInicioISO);
        const dataFim = parseLocalDate(prova.dataStr);
        const totalDias = Math.ceil((dataFim - dataInicio) / (1000 * 60 * 60 * 24)) + 1;
        const totalSemanas = Math.max(1, Math.ceil(totalDias / 7));
        
        const diasDisponiveis = (atleta.diasTreino && atleta.diasTreino.length >= 1)
            ? [...atleta.diasTreino].sort((a, b) => a - b)
            : [2, 4, 0];

        const volInicialAtleta = Math.max(5.0, atleta.volSemanal || 0);
        const ehIniciantePuro = volInicialAtleta <= 5.0;
        const distProva = prova.distanciaKm || 10;
        const multVol = atleta.multiplicadorVolume || 1.0;

        // CENÁRIO 8: Verificação de Atleta Avançado para escalonamento de intensidade
        const ctlAtual = atleta.ctl || 20;
        const atlAtual = atleta.atl || 20;
        const acwrAtual = ctlAtual > 0 ? atlAtual / ctlAtual : 1.0;
        const ehAvancado = (ctlAtual > 45 && acwrAtual < 1.3);

        let plano = [];
        let idCounter = 1;
        
        const ehCicloExpress = totalSemanas <= 3;
        
        // CENÁRIO 5: Configuração do Platô de Consolidação para ciclos longos
        const precisaPlato = totalSemanas >= 20;
        const inicioPlato = Math.floor(totalSemanas * 0.35);
        const fimPlato = Math.floor(totalSemanas * 0.55);

        for (let s = 0; s < totalSemanas; s++) {
            const ehPolimento = ehCicloExpress || 
                 (s >= totalSemanas - 2 && totalSemanas > 4) || 
                 (s === totalSemanas - 1 && totalSemanas <= 4);
            const ehRegenerativa = (s + 1) % 4 === 0 && !ehPolimento;
            const ehFasePlato = precisaPlato && s >= inicioPlato && s <= fimPlato;

            let fatorSemana = 1.0;
            if (ehRegenerativa) fatorSemana = 0.75;
            
            if (ehPolimento) {
                if (ehCicloExpress) {
                    fatorSemana = Math.max(0.40, 0.70 - (s * 0.15));
                } else {
                    fatorSemana = (s === totalSemanas - 2 && totalSemanas > 4) ? 0.70 : 0.45;
                }
            }

            let fase = "Base Aeróbica";
            if (ehPolimento) {
                fase = "Polimento / Taper";
            } else if (ehFasePlato) {
                fase = "Consolidação & Eficiência Neuromuscular"; // O Platô Fisiológico
            } else if (s < totalSemanas * 0.3) {
                fase = "Base Geral";
            } else if (s < totalSemanas * 0.7) {
                fase = "Base Específica & Força";
            } else {
                fase = "Construção Específica";
            }

            let fatorProgressao = 1.0;
            const tetoAbsolutoKm = distProva >= 42 ? 80 : (distProva >= 21 ? 50 : 30);
            const multiplicadorTeto = Math.max(1.8, tetoAbsolutoKm / volInicialAtleta);
            const tetoFisiologicoProva = Math.min(multiplicadorTeto, 4.5);

            if (!ehPolimento) {
                if (totalSemanas <= 16) {
                    fatorProgressao = 1.0 + (s * 0.05);
                } else {
                    let sEfetivo = s;
                    // Lógica de Congelamento do Platô de Consolidação
                    if (precisaPlato && s >= inicioPlato) {
                        if (s <= fimPlato) {
                            sEfetivo = inicioPlato - 1; // Congela o volume no início do platô
                        } else {
                            sEfetivo = s - (fimPlato - inicioPlato + 1); // Retoma crescimento após o platô
                        }
                    }
                    const semanasCarga = sEfetivo - Math.floor(sEfetivo / 4);
                    const taxaRampa = 1.045;
                    fatorProgressao = Math.min(tetoFisiologicoProva, Math.pow(taxaRampa, semanasCarga));
                }
                if (totalSemanas > 24 && s > 12 && s < totalSemanas - 8 && !precisaPlato) {
                    fatorProgressao = Math.min(fatorProgressao, tetoFisiologicoProva * 0.8);
                }
            }

            const volAlvoSemana = volInicialAtleta * fatorProgressao * fatorSemana;
            const numSessoes = diasDisponiveis.length;
            
            const distLongao = this._calcularDistanciaLongao(s, totalSemanas, distProva, volAlvoSemana, numSessoes) * fatorSemana;
            
            const volRestante = ehIniciantePuro
                ? Math.max(0, volAlvoSemana - distLongao)
                : Math.max(numSessoes * 2.5, volAlvoSemana - distLongao);
            
            const distSessaoComum = ehIniciantePuro
                ? Math.max(1.5, volRestante / Math.max(1, numSessoes - 1))
                : Math.max(2.5, volRestante / Math.max(1, numSessoes - 1));

            const diasCorridaDaSemana = [];
            for (let d = 0; d < 7; d++) {
                const diaIndex = s * 7 + d;
                if (diaIndex >= totalDias) break;
                
                const dataAtual = new Date(dataInicio);
                dataAtual.setDate(dataInicio.getDate() + diaIndex);
                const dataISO = getLocalISODate(dataAtual);
                const diaDaSemana = dataAtual.getDay();

                if (diasDisponiveis.includes(diaDaSemana)) {
                    diasCorridaDaSemana.push({
                        diaIndex,
                        dataISO,
                        diaDaSemana,
                        ehTreinoPernas: this._ehTreinoPernas(dataISO, atleta)
                    });
                }
            }

            const diaLongaoObj = diasCorridaDaSemana.length > 0 
                ? diasCorridaDaSemana[diasCorridaDaSemana.length - 1] 
                : null;
            
            const diasCandidatosIntensidade = diasCorridaDaSemana.filter(item => item !== diaLongaoObj);
            let diaQualidadeEscolhido = null;

            if (diasCandidatosIntensidade.length > 0) {
                // Tenta ativamente buscar um dia sem pernas para a qualidade
                const diaSemPernas = diasCandidatosIntensidade.find(item => !item.ehTreinoPernas);
                diaQualidadeEscolhido = diaSemPernas ? diaSemPernas.diaIndex : diasCandidatosIntensidade[0].diaIndex;
            }

            const ehCostasComCostas = numSessoes <= 2 && diaLongaoObj && diaQualidadeEscolhido !== null && (diaLongaoObj.diaIndex - diaQualidadeEscolhido === 1);

            for (let d = 0; d < 7; d++) {
                const diaIndex = s * 7 + d;
                if (diaIndex >= totalDias) break;
                
                const dataAtual = new Date(dataInicio);
                dataAtual.setDate(dataInicio.getDate() + diaIndex);
                const dataISO = getLocalISODate(dataAtual);
                const diaDaSemana = dataAtual.getDay();
                
                const dataOntem = new Date(dataAtual);
                dataOntem.setDate(dataAtual.getDate() - 1);
                
                const conflitoPernasHoje = this._ehTreinoPernas(dataISO, atleta);
                const conflitoPernasOntem = this._ehTreinoPernas(getLocalISODate(dataOntem), atleta);
                const conflitoPernas = conflitoPernasHoje || conflitoPernasOntem;

                let tipo = "Descanso";
                let distBase = 0;
                let prescricao = "Recuperação ativa ou repouso total.";
                let estrutura = [];

                const ehDiaDeTreino = diasDisponiveis.includes(diaDaSemana);
                const ehUltimoDiaDoPlano = (diaIndex === totalDias - 1);
                const ehDiaLongao = (diaLongaoObj && diaLongaoObj.diaIndex === diaIndex) || ehUltimoDiaDoPlano;

                if (ehUltimoDiaDoPlano) {
                    tipo = "PROVA ALVO";
                    distBase = distProva / multVol;
                    prescricao = "Dia da Grande Prova! Execute sua tática de ritmo e nutrição.";
                    estrutura = [`0.5km Aquecimento`, `${distProva}km Ritmo de Prova`];
                } else if (ehDiaDeTreino) {
                    if (ehDiaLongao) {
                        tipo = "Rodagem Leve";
                        distBase = Math.max(3.0, distLongao);
                        prescricao = "Treino longo em Zona 2 para desenvolvimento da eficiência aeróbica.";
                        
                        if ((fase === "Construção Específica" || fase === "Base Específica & Força") && distProva >= 21) {
                            estrutura = [`${(distBase * 0.6).toFixed(1)}km Z2`, `${(distBase * 0.4).toFixed(1)}km Z3 (Ritmo Prova)`];
                        } else {
                            estrutura = [`${(distBase * 0.15).toFixed(1)}km Aquecimento Z1`, `${(distBase * 0.85).toFixed(1)}km Z2 Constante`];
                        }

                    } else if (diaQualidadeEscolhido === diaIndex) {
                        if (ehCostasComCostas) {
                            tipo = "Rodagem Leve";
                            distBase = distSessaoComum * 0.8;
                            if (s % 2 === 0) {
                                prescricao = "Rodagem controlada em Z2 para proteção neuromuscular antes do Longão.";
                                estrutura = [`${distBase.toFixed(1)}km contínuos em Z2`];
                            } else {
                                prescricao = "Rodagem Z2 com acelerações neurológicas leves no final.";
                                estrutura = [`${Math.max(1.5, distBase - 0.8).toFixed(1)}km Z2`, "4x 100m Acelerações Z4 (Pausa 60s caminhada)"];
                            }
                        } else if (fase === "Base Geral" || fase === "Base Aeróbica") {
                            tipo = "Rodagem Leve";
                            distBase = distSessaoComum;
                            
                            if (ehIniciantePuro && s < 4) {
                                prescricao = "Protocolo de transição: Caminhada rápida + Trote leve.";
                                estrutura = [`${distBase.toFixed(1)}km alternando: 1 min trote Z2 / 1 min caminhada`];
                            } else {
                                prescricao = "Rodagem de desenvolvimento com boa cadência.";
                                estrutura = [`${distBase.toFixed(1)}km contínuos em Z2`];
                            }
                        } else if (fase === "Polimento / Taper") {
                            tipo = "Limiar Anaeróbico";
                            distBase = Math.max(3.0, distSessaoComum * 0.7);
                            prescricao = "Ativação neuromuscular leve sem acumular fadiga.";
                            estrutura = ["1.5km Z2", "3x 1km Z4 (Pausa 2min)", "1km Z1"];
                        } else {
                            // CENÁRIO 11: Blindagem Severa Contra Lesão Fibrilar em Conflito de Musculação
                            if (conflitoPernas) {
                                tipo = "Rodagem Leve"; // Força Z1/Z2 para Flushing, jamais Z3/Z4.
                                distBase = distSessaoComum * 0.8;
                                prescricao = "Carga adaptada para Z1/Z2 visando priorizar a recuperação neuromuscular pós-musculação severa. Sem estímulos láticos hoje.";
                                estrutura = [`${distBase.toFixed(1)}km contínuos em Z2 (Regenerativo)`];
                            } else {
                                if (distProva >= 42) {
                                    tipo = "Limiar Anaeróbico";
                                    distBase = distSessaoComum;
                                    prescricao = "Tempo Run em Ritmo de Maratona (Z3/Z4). Foco em eficiência metabólica e oxidação de gorduras.";
                                    estrutura = ["2km Z2", `${Math.max(3, distBase - 3).toFixed(1)}km Sustentado em Z3 (Ritmo Prova)`, "1km Z1"];
                                } else {
                                    tipo = ehFasePlato ? "Limiar Anaeróbico" : "Intervalado VO2";
                                    distBase = distSessaoComum;
                                    prescricao = ehFasePlato ? "Foco em economia de corrida e tolerância (Cruise Intervals)." : "Sessão de alta intensidade para elevação do VO2 Max.";
                                    
                                    // CENÁRIO 8: Escalonamento de teto para atletas avançados baseados no CTL e ACWR
                                    const teto400 = ehAvancado ? 16 : 10;
                                    const teto800 = ehAvancado ? 8 : 6;
                                    const teto1000 = ehAvancado ? 6 : 4;

                                    if (distProva <= 5) {
                                        const padraoTiro = s % 3;
                                        if (padraoTiro === 0) {
                                            const numReps = Math.min(teto400, Math.max(5, Math.floor(distSessaoComum * 1.2)));
                                            estrutura = ["2km Z2 (Aquecimento)", `${numReps}x 400m Z5 (Pausa 60s)`, "1.5km Z1 (Desaquecimento)"];
                                        } else if (padraoTiro === 1) {
                                            const numReps = Math.min(teto800, Math.max(3, Math.floor(distSessaoComum * 0.7)));
                                            estrutura = ["2km Z2 (Aquecimento)", `${numReps}x 800m Z5 (Pausa 90s)`, "1.5km Z1 (Desaquecimento)"];
                                        } else {
                                            estrutura = ["2km Z2 (Aquecimento)", "4x 600m Z5 (Pausa 75s)", "4x 200m Z5+ Velocidade (Pausa 60s)", "1km Z1"];
                                        }
                                    } else {
                                        const padraoTiro = s % 3;
                                        if (padraoTiro === 0) {
                                            const numReps = Math.min(teto800, Math.max(4, Math.floor(distSessaoComum * 0.7)));
                                            estrutura = ["2km Z2 (Aquecimento)", `${numReps}x 800m Z5 (Pausa 90s)`, "1.5km Z1 (Desaquecimento)"];
                                        } else if (padraoTiro === 1) {
                                            const numReps = Math.min(teto1000, Math.max(3, Math.floor(distSessaoComum * 0.5)));
                                            estrutura = ["2km Z2 (Aquecimento)", `${numReps}x 1000m Z4/Z5 (Pausa 2min)`, "1.5km Z1 (Desaquecimento)"];
                                        } else {
                                            const numReps = Math.min(teto400, Math.max(6, Math.floor(distSessaoComum * 1.2)));
                                            estrutura = ["2km Z2 (Aquecimento)", `${numReps}x 400m Z5 (Pausa 60s)`, "1.5km Z1 (Desaquecimento)"];
                                        }
                                    }
                                }
                            }
                        }
                    } else {
                        const permitirSegundoTreinoQualidade = numSessoes >= 4 && !conflitoPernas;
                        tipo = (fase === "Construção Específica" && permitirSegundoTreinoQualidade) ? "Limiar Anaeróbico" : "Rodagem Leve";
                        distBase = distSessaoComum;
                        
                        prescricao = tipo.includes("Limiar")
                            ? "Manter ritmo firme na Zona 4 de forma sustentada."
                            : (ehIniciantePuro && s < 4 ? "Protocolo de transição: Caminhada rápida + Trote leve." : "Corrida regenerativa/móvel em Zona 2.");
                        
                        if (tipo.includes("Limiar")) {
                            estrutura = ["1.5km Z2", `${Math.max(1, distBase - 3).toFixed(1)}km em Z4`, "1.5km Z1"];
                        } else if (ehIniciantePuro && s < 4) {
                            estrutura = [`${distBase.toFixed(1)}km alternando: 1 min trote Z2 / 1 min caminhada`];
                        } else {
                            estrutura = [`${distBase.toFixed(1)}km em Z2`];
                        }
                    }
                }

                plano.push({
                    id: idCounter++,
                    dataISO,
                    tipo,
                    distanciaBase: parseFloat(distBase.toFixed(1)),
                    prescricao,
                    fasePlano: fase,
                    estrutura,
                    concluido: false
                });
            }
        }
        return plano;
    },

    // 2. Validação Preditiva (Riegel vs Meta)
    validarMetaAgressiva(distAtual, tempoAtualMin, distAlvo, tempoAlvoStr) {
        if (!distAtual || !tempoAtualMin || !distAlvo || !tempoAlvoStr) return null;
        const partes = tempoAlvoStr.split(':').map(Number);
        let tempoAlvoMin = 0;
        if (partes.length === 3) tempoAlvoMin = (partes[0] * 60) + partes[1] + (partes[2] / 60);
        else if (partes.length === 2) tempoAlvoMin = partes[0] + (partes[1] / 60);
        else tempoAlvoMin = parseFloat(tempoAlvoStr);

        if (isNaN(tempoAlvoMin) || tempoAlvoMin <= 0) return null;

        const tempoRiegelMin = tempoAtualMin * Math.pow(distAlvo / distAtual, 1.06);
        const ganhoRequeridoPerc = ((tempoRiegelMin - tempoAlvoMin) / tempoRiegelMin) * 100;

        if (ganhoRequeridoPerc > 25) {
            const paceRiegelSeg = (tempoRiegelMin * 60) / distAlvo;
            const paceAlvoSeg = (tempoAlvoMin * 60) / distAlvo;
            const formatarPace = (seg) => {
                const m = Math.floor(seg / 60);
                const s = Math.round(seg % 60);
                return `${m}:${s < 10 ? '0' : ''}${s}`;
            };
            return {
                agressivo: true,
                percentual: Math.round(ganhoRequeridoPerc),
                paceRiegel: formatarPace(paceRiegelSeg),
                paceAlvo: formatarPace(paceAlvoSeg)
            };
        }
        return { agressivo: false };
    },

    // 3. Cálculo Proporcional e Contínuo do Treino Longo
    _calcularDistanciaLongao(semanaIndex, totalSemanas, distProvaKm, volAlvoSemana, numSessoes = 3) {
        let tetoLongao;
        let pisoLongao;

        // CENÁRIO 6: Desvincular o Longão da distância da prova para 5k/10k, baseando no volume semanal.
        if (distProvaKm <= 10) {
            tetoLongao = Math.min(21, Math.max(10, volAlvoSemana * 0.35)); // Permite longões de até 21k para alto volume
            pisoLongao = Math.max(5, volAlvoSemana * 0.20);
        } else {
            tetoLongao = Math.min(34, Math.max(7, distProvaKm * 0.85));
            pisoLongao = Math.min(distProvaKm, Math.max(3, distProvaKm * 0.5));
        }

        const progresso = Math.min(1.0, (semanaIndex + 1) / Math.max(1, totalSemanas - 2));
        const distCalculada = pisoLongao + ((tetoLongao - pisoLongao) * progresso);
        
        const pctMaximo = (distProvaKm >= 21 && numSessoes <= 3) ? 0.55 : 0.48;
        const travaSegurancaVolume = volAlvoSemana * pctMaximo;

        return Math.max(pisoLongao, Math.min(distCalculada, travaSegurancaVolume));
    },

    // 4. Rebalanceamento por Adesão Severa 
    rebalancearAdesaoSevera(plano, treinosRealizados, hojeISO) {
        if (!treinosRealizados || treinosRealizados.length === 0) return plano;
        const limiteDuasSemanas = parseLocalDate(hojeISO);
        limiteDuasSemanas.setDate(limiteDuasSemanas.getDate() - 14);
        const limiteISO = getLocalISODate(limiteDuasSemanas);
        
        const treinosUltimasDuasSemanas = treinosRealizados.filter(t => t.dataISO >= limiteISO && t.dataISO < hojeISO);
        
        if (treinosUltimasDuasSemanas.length === 0) {
            plano.forEach(t => {
                if (t.dataISO >= hojeISO && !t.concluido) {
                    t.distanciaBase = parseFloat((t.distanciaBase * 0.70).toFixed(1)); // Suaviza em 30%
                }
            });
        }
        return plano;
    },

    // 5. Rebalanceamento Semanal
    rebalancearSemana(plano, treinosRealizados, hojeISO) {
        const { start, end } = obterLimitesDaSemana(hojeISO);
        const treinosDaSemana = plano.filter(t => t.dataISO >= start && t.dataISO <= end);
        const realizadosNaSemana = treinosRealizados.filter(t => t.dataISO >= start && t.dataISO <= end);

        let volPlanejado = treinosDaSemana.reduce((acc, t) => acc + t.distanciaBase, 0);
        let volRealizado = realizadosNaSemana.reduce((acc, t) => acc + t.dist, 0);

        if (volPlanejado > 0 && realizadosNaSemana.length > 0) {
            const numRestantes = treinosDaSemana.filter(t => t.dataISO > hojeISO && t.tipo !== "Descanso").length;
            if (numRestantes > 0) {
                const diff = volPlanejado - volRealizado;
                const ajustePorTreino = diff / numRestantes;

                treinosDaSemana.forEach(t => {
                    if (t.dataISO > hojeISO && t.tipo !== "Descanso") {
                        const tetoAjuste = t.distanciaBase * 0.20;
                        const incrementoReal = Math.min(ajustePorTreino * 0.25, tetoAjuste);
                        t.distanciaBase = Math.max(2.5, parseFloat((t.distanciaBase + incrementoReal).toFixed(1)));
                    }
                });
            }
        }
        return plano;
    },

    // 6. Recomendação Inteligente de Tênis
    obterTenisSugerido(tipoTreino, listaTenis) {
        if (!listaTenis || listaTenis.length === 0) return null;
        const disponiveis = listaTenis.filter(t => !t.aposentado);
        if (disponiveis.length === 0) return null;

        const ehVelocidade = tipoTreino.includes("Intervalado") || tipoTreino.includes("Tiros") || tipoTreino.includes("Tempo") || tipoTreino.includes("PROVA");
        const categoriaAlvo = ehVelocidade ? 'velocidade' : 'rodagem';
        
        const ideal = disponiveis.find(t => t.categoria === categoriaAlvo);
        if (ideal) return ideal.id;

        const versatil = disponiveis.find(t => t.categoria === 'versatil');
        if (versatil) return versatil.id;

        return disponiveis[0].id;
    },

    // 7. Gerador do Plano Pós-Prova (Recovery & Baseline)
    gerarPlanoPosProva(atleta, distProvaRealizada, dataProvaISO) {
        const dataInicio = parseLocalDate(dataProvaISO);
        
        let semanasRecovery = 1;
        if (distProvaRealizada >= 42) semanasRecovery = 4;
        else if (distProvaRealizada >= 21) semanasRecovery = 3;
        else if (distProvaRealizada >= 10) semanasRecovery = 2;

        const semanasBaseline = 8;
        const totalSemanas = semanasRecovery + semanasBaseline;

        const diasDisponiveis = (atleta.diasTreino && atleta.diasTreino.length >= 1)
            ? [...atleta.diasTreino].sort((a, b) => a - b)
            : [2, 4, 0];

        let plano = [];
        let idCounter = 1;

        for (let s = 0; s < totalSemanas; s++) {
            const ehFaseRecovery = s < semanasRecovery;
            const faseNome = ehFaseRecovery ? "Recuperação Ativa (Reverse Taper)" : "Modo Manutenção (Baseline)";

            let fatorVol = 1.0;
            if (ehFaseRecovery) {
                fatorVol = 0.35 + (s * 0.15);
            } else {
                fatorVol = 0.70;
            }

            const volSemanalAlvo = Math.max(8.0, atleta.volSemanal * fatorVol);
            const numSessoes = diasDisponiveis.length;
            const distPorSessao = parseFloat((volSemanalAlvo / numSessoes).toFixed(1));

            for (let d = 0; d < 7; d++) {
                const diaIndex = s * 7 + d + 1;
                const dataAtual = new Date(dataInicio);
                dataAtual.setDate(dataInicio.getDate() + diaIndex);
                const dataISO = getLocalISODate(dataAtual);
                const diaDaSemana = dataAtual.getDay();

                let tipo = "Descanso";
                let distBase = 0;
                let prescricao = "Repouso e flushing metabólico.";
                let estrutura = [];

                if (diasDisponiveis.includes(diaDaSemana)) {
                    if (ehFaseRecovery && s === 0 && (distProvaRealizada >= 21) && d > 1) {
                        tipo = "Descanso";
                        distBase = 0;
                        prescricao = "Repouso sistêmico para cicatrização de microfissuras da prova.";
                        estrutura = [];
                    } else if (ehFaseRecovery) {
                        tipo = "Rodagem Leve";
                        distBase = distPorSessao;
                        prescricao = s === 0 
                            ? "Trote regenerativo em Z1. Sem pressa, foco em soltar a musculatura."
                            : "Corrida leve em Z2 para restabelecer a oxigenação tecidual.";
                        estrutura = [`${distBase}km Z1/Z2 Regenerativo`];
                    } else {
                        const ehDiaQualidade = d === diasDisponiveis[0] && s % 2 === 0;
                        if (ehDiaQualidade) {
                            tipo = "Limiar Anaeróbico";
                            distBase = distPorSessao;
                            prescricao = "Manutenção de potência aeróbica e VO2 sem acumular fadiga excessiva.";
                            estrutura = ["1.5km Z2", `${Math.max(1, distBase - 2.5).toFixed(1)}km Z4 Sustentado`, "1km Z1"];
                        } else {
                            tipo = "Rodagem Leve";
                            distBase = distPorSessao;
                            prescricao = "Manutenção de base aeróbica em Zona 2.";
                            estrutura = [`${distBase}km contínuos em Z2`];
                        }
                    }
                }

                plano.push({
                    id: idCounter++,
                    dataISO,
                    tipo,
                    distanciaBase: distBase,
                    prescricao,
                    fasePlano: faseNome,
                    estrutura,
                    concluido: false
                });
            }
        }
        return plano;
    }
};