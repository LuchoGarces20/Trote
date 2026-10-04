// ==========================================
// GERADOR DE PLANOS DE TREINO & MACROCICLOS (BLINDAGEM TOTAL V3)
// ==========================================
const CoachPlanner = {
    _ehTreinoPernas(dataISO, atleta) {
        if (!atleta || !atleta.fazMusculacao) return false;
        const diasMusc = Array.isArray(atleta.diasMusculacao) ? atleta.diasMusculacao : [];
        const treinoForca = CoachPhysiology.obterTreinoForca(
            dataISO, atleta.fazMusculacao, atleta.divisaoMusculacao, diasMusc
        );
        if (!treinoForca) return false;
        
        const tfLower = (typeof treinoForca === 'string' ? treinoForca : (treinoForca.nome || ''))
                        .toLowerCase()
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, "");
                        
        return tfLower.includes('inferior') || tfLower.includes('quadriceps') ||
               tfLower.includes('posterior') || tfLower.includes('full body') ||
               tfLower.includes('perna');
    },

    gerarPlano(atleta, prova) {
        const atl = atleta || {};
        const prv = prova || {};
        const dataInicio = parseLocalDate(atl.dataInicioISO);
        const dataFim = parseLocalDate(prv.dataStr);
        
        let diffDias = Math.ceil((dataFim - dataInicio) / (1000 * 60 * 60 * 24)) + 1;
        if (isNaN(diffDias) || diffDias < 7) diffDias = 28; // Fallback para 4 semanas mínimas
        
        const totalDias = diffDias;
        const totalSemanas = Math.max(1, Math.ceil(totalDias / 7));
        const diasDisponiveis = (Array.isArray(atl.diasTreino) && atl.diasTreino.length >= 1)
            ? [...atl.diasTreino].map(d => parseInt(d, 10)).filter(d => !isNaN(d)).sort((a, b) => a - b)
            : [2, 4, 0];
            
        const volInicialAtleta = Math.max(5.0, parseFloat(atl.volSemanal) || 10.0);
        const ehIniciantePuro = volInicialAtleta <= 5.0;
        const distProva = Math.max(1.0, parseFloat(prv.distanciaKm) || 10.0);
        const multVol = Math.max(0.5, Math.min(2.0, parseFloat(atl.multiplicadorVolume) || 1.0));
        
        const ctlAtual = Math.max(0, parseFloat(atl.ctl) || 20);
        const atlAtual = Math.max(0, parseFloat(atl.atl) || 20);
        const acwrAtual = ctlAtual > 0 ? (atlAtual / ctlAtual) : 1.0;
        const ehAvancado = (ctlAtual > 45 && acwrAtual < 1.3);

        let plano = [];
        let idCounter = 1;

        const ehCicloExpress = totalSemanas <= 3;
        const maxSemanasProva = distProva <= 5 ? 12 : (distProva <= 10 ? 16 : 52);

        let semanasBaseManutencao = 0;
        let baseProgressivaAtiva = false;
        
        if (distProva <= 5 && totalSemanas > 12) {
            baseProgressivaAtiva = true;
            semanasBaseManutencao = totalSemanas - 12;
        } else {
            semanasBaseManutencao = Math.max(0, totalSemanas - maxSemanasProva);
        }

        const precisaPlato = (totalSemanas - semanasBaseManutencao) >= 20;
        const inicioPlato = Math.floor((totalSemanas - semanasBaseManutencao) * 0.35);
        const fimPlato = Math.floor((totalSemanas - semanasBaseManutencao) * 0.55);

        for (let s = 0; s < totalSemanas; s++) {
            const ehPolimento = ehCicloExpress || 
                                (s >= totalSemanas - 2 && totalSemanas > 4) || 
                                (s === totalSemanas - 1 && totalSemanas <= 4);
                                
            const ehRegenerativa = (s + 1) % 4 === 0 && !ehPolimento;
            let sEfetivo = Math.max(0, s - semanasBaseManutencao);
            const ehFasePlato = precisaPlato && sEfetivo >= inicioPlato && sEfetivo <= fimPlato;

            let fatorSemana = 1.0;
            if (ehRegenerativa) { fatorSemana = volInicialAtleta >= 30 ? 0.82 : 0.75; }
            if (ehPolimento) {
                if (ehCicloExpress) {
                    fatorSemana = Math.max(0.40, 0.85 - (s * 0.15));
                } else {
                    fatorSemana = (s === totalSemanas - 2 && totalSemanas > 4) ? 0.70 : 0.45;
                }
            }

            let fase = "Base Aeróbica";
            if (s < semanasBaseManutencao) {
                fase = "Manutenção Pré-Ciclo";
            } else if (ehPolimento) {
                fase = "Polimento / Taper";
            } else if (ehFasePlato) {
                fase = "Consolidação & Eficiência Neuromuscular";
            } else if (sEfetivo < (totalSemanas - semanasBaseManutencao) * 0.3) {
                fase = "Base Geral";
            } else if (sEfetivo < (totalSemanas - semanasBaseManutencao) * 0.7) {
                fase = "Base Específica & Força";
            } else {
                fase = "Construção Específica";
            }

            let fatorProgressao = 1.0;
            const tetoAbsolutoKm = Math.max(volInicialAtleta * 1.15, distProva >= 42 ? 85 : (distProva >= 21 ? 55 : 40));
            const multiplicadorTeto = Math.max(1.8, tetoAbsolutoKm / volInicialAtleta);
            const tetoFisiologicoProva = volInicialAtleta <= 15 ? Math.min(multiplicadorTeto, 8.0) : Math.min(multiplicadorTeto, 4.5);

            if (baseProgressivaAtiva && s < semanasBaseManutencao) {
                fase = "Construção de Base Aeróbica";
                fatorProgressao = ehIniciantePuro ? Math.min(2.2, 1.0 + (s * 0.08)) : 1.0 + (s * 0.025);
            }

            if (!ehPolimento && s >= semanasBaseManutencao) {
                if ((totalSemanas - semanasBaseManutencao) <= 16) {
                    fatorProgressao = 1.0 + (sEfetivo * 0.05);
                } else {
                    let sCarga = sEfetivo;
                    if (precisaPlato && sEfetivo >= inicioPlato) {
                        if (sEfetivo <= fimPlato) sCarga = inicioPlato - 1;
                        else sCarga = sEfetivo - (fimPlato - inicioPlato + 1);
                    }
                    const semanasCarga = Math.max(0, sCarga - Math.floor(sCarga / 4));
                    const taxaRampa = (ehIniciantePuro && distProva >= 21) ? 1.055 : (ehIniciantePuro ? 1.07 : 1.045);
                    fatorProgressao = Math.min(tetoFisiologicoProva, Math.pow(taxaRampa, semanasCarga));
                }
                
                if (ehFasePlato) {
                    fatorProgressao *= [0.90, 1.05, 1.0][s % 3];
                }

                let atingiuTeto = fatorProgressao >= tetoFisiologicoProva;
                fatorProgressao = Math.min(fatorProgressao, tetoFisiologicoProva);

                if (atingiuTeto && !ehRegenerativa && !ehPolimento) {
                    const prevRegen = (s % 4 === 0);
                    const fatorOndulacao = prevRegen ? 1.0 : [0.92, 1.0, 1.04][s % 3];
                    fatorProgressao *= fatorOndulacao;
                }
            }

            const volAlvoSemana = Math.max(5.0, volInicialAtleta * fatorProgressao * fatorSemana);
            const numSessoes = Math.max(1, diasDisponiveis.length);

            const distLongao = this._calcularDistanciaLongao(s, totalSemanas, distProva, volAlvoSemana, numSessoes, ehCicloExpress);
            
            const volRestante = ehIniciantePuro 
                ? Math.max(0, volAlvoSemana - distLongao) 
                : Math.max(numSessoes * 2.5, volAlvoSemana - distLongao);
                
            const baseComum = ehIniciantePuro ? 1.5 : 2.5;
            const distSessaoComumRaw = Math.max(baseComum, volRestante / Math.max(1, numSessoes - 1));
            const distSessaoComum = Math.min(distLongao * 0.85, distSessaoComumRaw);

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
                        ehTreinoPernas: this._ehTreinoPernas(dataISO, atl)
                    });
                }
            }

            // HIERARQUIA DE ALOCAÇÃO DO LONGÃO
            let diaLongaoObj = diasCorridaDaSemana.find(item => item.diaDaSemana === 0); // Domingo
            if (!diaLongaoObj) {
                diaLongaoObj = diasCorridaDaSemana.find(item => item.diaDaSemana === 6); // Sábado
            }
            if (!diaLongaoObj && diasCorridaDaSemana.length > 0) {
                diaLongaoObj = diasCorridaDaSemana[diasCorridaDaSemana.length - 1]; // Fallback
            }

            const diasCandidatosIntensidade = diasCorridaDaSemana.filter(item => item !== diaLongaoObj);
            let diaQualidadeEscolhido = null;

            if (diasCandidatosIntensidade.length > 0) {
                const diaLivreCompleto = diasCandidatosIntensidade.find(item => {
                    const dataOntemIso = getLocalISODate(new Date(parseLocalDate(item.dataISO).getTime() - 86400000));
                    return !item.ehTreinoPernas && !this._ehTreinoPernas(dataOntemIso, atl);
                });
                diaQualidadeEscolhido = diaLivreCompleto ? diaLivreCompleto.diaIndex : diasCandidatosIntensidade[0].diaIndex;
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
                const conflitoPernas = this._ehTreinoPernas(getLocalISODate(dataOntem), atl);

                let tipo = "Descanso";
                let distBase = 0;
                let prescricao = "Recuperação ativa ou repouso total.";
                let estrutura = [];

                const ehDiaDeTreino = diasDisponiveis.includes(diaDaSemana);
                const ehUltimoDiaDoPlano = (diaIndex === totalDias - 1);
                const ehDiaLongao = (diaLongaoObj && diaLongaoObj.diaIndex === diaIndex) || ehUltimoDiaDoPlano;

                const paceMedioMin = (Math.max(60, parseFloat(atl.paceBaseSegundos) || 330)) / 60;
                const p400 = Math.max(45, Math.round((paceMedioMin * 0.4) * 60 * 0.9));
                const p800 = Math.max(60, Math.round((paceMedioMin * 0.8) * 60 * 0.75));
                const p1000 = Math.max(90, Math.round(paceMedioMin * 60 * 0.65));

                if (ehUltimoDiaDoPlano) {
                    tipo = "PROVA ALVO";
                    distBase = distProva / multVol;
                    prescricao = "Dia da Grande Prova! Execute sua tática de ritmo e nutrição.";
                    const aq = parseFloat((distBase * 0.05).toFixed(1));
                    const pp = parseFloat((distBase - aq).toFixed(1));
                    estrutura = [`${aq}km Aquecimento`, `${pp}km Ritmo de Prova`];

                } else if (ehDiaDeTreino) {
                    if (ehDiaLongao) {
                        tipo = "Rodagem Leve";
                        distBase = Math.max(3.0, distLongao);
                        prescricao = "Treino longo em Zona 2 para desenvolvimento da eficiência aeróbica e capilarização.";
                        const deveProtegerSNC = acwrAtual > 1.25;

                        if ((fase === "Construção Específica" || fase === "Base Específica & Força") && distProva >= 21 && !deveProtegerSNC) {
                            const z2 = parseFloat((distBase * 0.6).toFixed(1));
                            const z3 = parseFloat((distBase - z2).toFixed(1));
                            estrutura = [`${z2}km Z2`, `${z3}km Z3 (Ritmo Prova)`];
                        } else {
                            const aq = parseFloat((distBase * 0.15).toFixed(1));
                            const pp = parseFloat((distBase - aq).toFixed(1));
                            estrutura = [`${aq}km Aquecimento Z1`, `${pp}km Z2 Constante`];
                        }
                    } else if (diaQualidadeEscolhido === diaIndex) {
                        if (ehCostasComCostas) {
                            tipo = "Rodagem Leve";
                            distBase = Math.min(distSessaoComum * 0.8, 10.0);
                            if (s % 2 === 0) {
                                prescricao = "Rodagem controlada em Z2 para proteção neuromuscular antes do Longão.";
                                estrutura = [`${distBase.toFixed(1)}km contínuos em Z2`];
                            } else {
                                prescricao = "Rodagem Z2 com acelerações neurológicas leves no final.";
                                const distAcel = 0.4;
                                if (distBase <= distAcel) {
                                    estrutura = [`4x 100m Acelerações Z4 (Pausa 60s caminhada)`];
                                } else {
                                    const aq = parseFloat((distBase - distAcel).toFixed(1));
                                    estrutura = [`${aq}km Z2`, `4x 100m Acelerações Z4 (Pausa 60s caminhada)`];
                                }
                            }
                        } else if (fase === "Base Geral" || fase === "Base Aeróbica" || fase === "Manutenção Pré-Ciclo") {
                            tipo = "Rodagem Leve";
                            const fatorOndulacaoManutencao = (fase === "Manutenção Pré-Ciclo") ? 1.0 + ((s % 3) - 1) * 0.1 : 1.0;
                            distBase = distSessaoComum * fatorOndulacaoManutencao;

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
                            const pp = 3.0; // 3x 1km
                            if (distBase <= pp) {
                                estrutura = [`3x 1km Z4 (Pausa ${p1000}s)`];
                            } else {
                                const resto = distBase - pp;
                                const aq = parseFloat((resto * 0.6).toFixed(1));
                                const desaq = parseFloat((resto - aq).toFixed(1));
                                estrutura = [`${aq}km Z2`, `3x 1km Z4 (Pausa ${p1000}s)`, `${desaq}km Z1`];
                            }
                        } else {
                            if (conflitoPernas) {
                                tipo = "Rodagem Leve";
                                distBase = distSessaoComum * 0.8;
                                prescricao = "Carga adaptada para Z1/Z2 visando priorizar a recuperação pós-musculação.";
                                estrutura = [`${distBase.toFixed(1)}km contínuos em Z2 (Regenerativo)`];
                            } else {
                                if (distProva >= 15 && fase !== "Base Geral" && fase !== "Base Aeróbica") {
                                    tipo = "Limiar Anaeróbico";
                                    distBase = distSessaoComum;
                                    prescricao = "Tempo Run (Z3/Z4). Foco em eficiência metabólica e tolerância ao lactato.";
                                    const aq = 2.0;
                                    const desaq = 1.0;
                                    if (distBase <= (aq + desaq)) {
                                         estrutura = [`${distBase.toFixed(1)}km Sustentado em Z3/Z4`];
                                    } else {
                                         const pp = parseFloat((distBase - aq - desaq).toFixed(1));
                                         estrutura = [`${aq}km Z2`, `${pp}km Sustentado em Z3/Z4`, `${desaq}km Z1`];
                                    }
                                } else {
                                    tipo = ehFasePlato ? "Limiar Anaeróbico" : "Intervalado VO2";
                                    distBase = distSessaoComum;
                                    prescricao = ehFasePlato ? "Foco em economia de corrida e tolerância (Cruise Intervals)." : "Sessão de alta intensidade para elevação do VO2 Max.";
                                    
                                    const teto400 = ehAvancado ? 16 : 10;
                                    const teto800 = ehAvancado ? 8 : 6;
                                    const teto1000 = ehAvancado ? 6 : 4;

                                    if (distProva <= 5) {
                                        const padraoTiro = s % 3;
                                        if (padraoTiro === 0) {
                                            const numReps = Math.min(teto400, Math.max(5, Math.floor(distSessaoComum * 1.2)));
                                            const distTiros = parseFloat((numReps * 0.4).toFixed(1));
                                            if (distBase <= distTiros) {
                                                estrutura = [`${numReps}x 400m Z5 (Pausa ${p400}s)`];
                                            } else {
                                                const resto = distBase - distTiros;
                                                const aq = parseFloat((resto * 0.6).toFixed(1));
                                                const desaq = parseFloat((resto - aq).toFixed(1));
                                                estrutura = [`${aq}km Z2 (Aquecimento)`, `${numReps}x 400m Z5 (Pausa ${p400}s)`, `${desaq}km Z1 (Desaquecimento)`];
                                            }
                                        } else if (padraoTiro === 1) {
                                            const numReps = Math.min(teto800, Math.max(3, Math.floor(distSessaoComum * 0.7)));
                                            const distTiros = parseFloat((numReps * 0.8).toFixed(1));
                                            if (distBase <= distTiros) {
                                                estrutura = [`${numReps}x 800m Z5 (Pausa ${p800}s)`];
                                            } else {
                                                const resto = distBase - distTiros;
                                                const aq = parseFloat((resto * 0.6).toFixed(1));
                                                const desaq = parseFloat((resto - aq).toFixed(1));
                                                estrutura = [`${aq}km Z2 (Aquecimento)`, `${numReps}x 800m Z5 (Pausa ${p800}s)`, `${desaq}km Z1 (Desaquecimento)`];
                                            }
                                        } else {
                                            const distTiros = 3.2; // 4x 600m + 4x 200m
                                            if (distBase <= distTiros) {
                                                estrutura = [`4x 600m Z5 (Pausa ${p800}s)`, `4x 200m Z5+ Velocidade (Pausa ${p400}s)`];
                                            } else {
                                                const resto = distBase - distTiros;
                                                const aq = parseFloat((resto * 0.6).toFixed(1));
                                                const desaq = parseFloat((resto - aq).toFixed(1));
                                                estrutura = [`${aq}km Z2 (Aquecimento)`, `4x 600m Z5 (Pausa ${p800}s)`, `4x 200m Z5+ Velocidade (Pausa ${p400}s)`, `${desaq}km Z1`];
                                            }
                                        }
                                    } else {
                                        const padraoTiro = s % 3;
                                        if (padraoTiro === 0) {
                                            const numReps = Math.min(teto800, Math.max(4, Math.floor(distSessaoComum * 0.7)));
                                            const distTiros = parseFloat((numReps * 0.8).toFixed(1));
                                            if (distBase <= distTiros) {
                                                estrutura = [`${numReps}x 800m Z5 (Pausa ${p800}s)`];
                                            } else {
                                                const resto = distBase - distTiros;
                                                const aq = parseFloat((resto * 0.6).toFixed(1));
                                                const desaq = parseFloat((resto - aq).toFixed(1));
                                                estrutura = [`${aq}km Z2 (Aquecimento)`, `${numReps}x 800m Z5 (Pausa ${p800}s)`, `${desaq}km Z1 (Desaquecimento)`];
                                            }
                                        } else if (padraoTiro === 1) {
                                            const numReps = Math.min(teto1000, Math.max(3, Math.floor(distSessaoComum * 0.5)));
                                            const distTiros = parseFloat((numReps * 1.0).toFixed(1));
                                            if (distBase <= distTiros) {
                                                estrutura = [`${numReps}x 1000m Z4/Z5 (Pausa ${p1000}s)`];
                                            } else {
                                                const resto = distBase - distTiros;
                                                const aq = parseFloat((resto * 0.6).toFixed(1));
                                                const desaq = parseFloat((resto - aq).toFixed(1));
                                                estrutura = [`${aq}km Z2 (Aquecimento)`, `${numReps}x 1000m Z4/Z5 (Pausa ${p1000}s)`, `${desaq}km Z1 (Desaquecimento)`];
                                            }
                                        } else {
                                            const numReps = Math.min(teto400, Math.max(6, Math.floor(distSessaoComum * 1.2)));
                                            const distTiros = parseFloat((numReps * 0.4).toFixed(1));
                                            if (distBase <= distTiros) {
                                                estrutura = [`${numReps}x 400m Z5 (Pausa ${p400}s)`];
                                            } else {
                                                const resto = distBase - distTiros;
                                                const aq = parseFloat((resto * 0.6).toFixed(1));
                                                const desaq = parseFloat((resto - aq).toFixed(1));
                                                estrutura = [`${aq}km Z2 (Aquecimento)`, `${numReps}x 400m Z5 (Pausa ${p400}s)`, `${desaq}km Z1 (Desaquecimento)`];
                                            }
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
                            const aq = parseFloat((distBase * 0.3).toFixed(1));
                            const desaq = parseFloat((distBase * 0.3).toFixed(1));
                            const pp = parseFloat((distBase - aq - desaq).toFixed(1));
                            if (pp > 0) {
                                estrutura = [`${aq}km Z2`, `${pp}km em Z4`, `${desaq}km Z1`];
                            } else {
                                estrutura = [`${distBase.toFixed(1)}km em Z4`];
                            }
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
                    distanciaBase: parseFloat((Math.max(0, distBase) || 0).toFixed(1)),
                    prescricao,
                    fasePlano: fase,
                    estrutura,
                    concluido: false
                });
            }
        }

        return plano;
    },

    validarMetaAgressiva(distAtual, tempoAtualMin, distAlvo, tempoAlvoStr) {
        const dA = Math.max(0, parseFloat(distAlvo) || 0);
        const tA = Math.max(0, parseFloat(tempoAtualMin) || 0);
        const dTarget = Math.max(0, parseFloat(distAlvo) || 0);

        if (dA <= 0 || tA <= 0 || dTarget <= 0 || !tempoAlvoStr) return null;

        const partes = String(tempoAlvoStr).split(':').map(v => parseInt(v, 10));
        let tempoAlvoMin = 0;
        if (partes.length === 3 && !partes.some(isNaN)) tempoAlvoMin = (partes[0] * 60) + partes[1] + (partes[2] / 60);
        else if (partes.length === 2 && !partes.some(isNaN)) tempoAlvoMin = partes[0] + (partes[1] / 60);
        else tempoAlvoMin = parseFloat(tempoAlvoStr) || 0;

        if (tempoAlvoMin <= 0) return null;

        const tempoRiegelMin = tA * Math.pow(dTarget / dA, 1.06);
        if (tempoRiegelMin <= 0) return null;

        const ganhoRequeridoPerc = ((tempoRiegelMin - tempoAlvoMin) / tempoRiegelMin) * 100;
        if (ganhoRequeridoPerc > 25) {
            const paceRiegelSeg = (tempoRiegelMin * 60) / dTarget;
            const paceAlvoSeg = (tempoAlvoMin * 60) / dTarget;
            
            const formatarPace = (seg) => {
                const segSan = Math.max(1, seg || 0);
                const m = Math.floor(segSan / 60);
                const s = Math.round(segSan % 60);
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

    _calcularDistanciaLongao(semanaIndex, totalSemanas, distProvaKm, volAlvoSemana, numSessoes = 3, ehCicloExpress = false) {
        const volAlvo = Math.max(1.0, parseFloat(volAlvoSemana) || 10.0);
        const distProva = Math.max(1.0, parseFloat(distProvaKm) || 10.0);
        const sessoes = Math.max(1, parseInt(numSessoes, 10) || 3);

        let tetoLongao;
        let pisoLongao;

        if (distProva <= 10) {
            tetoLongao = Math.min(21, Math.max(10, volAlvo * 0.35)); 
            pisoLongao = Math.max(3, volAlvo * 0.30);
        } else {
            tetoLongao = Math.min(distProva + 2, Math.max(16, distProva * 0.90)); 
            pisoLongao = Math.min(distProva, Math.max(5, distProva * 0.4));
        }

        const diasPolimento = ehCicloExpress ? 0 : (totalSemanas <= 3 ? 1 : 2);
        if (semanaIndex >= totalSemanas - diasPolimento) return pisoLongao;

        const divisorDiv = Math.max(1, totalSemanas - diasPolimento);
        const progresso = Math.min(1.0, (semanaIndex + 1) / divisorDiv);
        const distCalculada = pisoLongao + ((tetoLongao - pisoLongao) * progresso);

        const pctMaximo = (sessoes <= 2) ? (distProva >= 21 ? 0.65 : 0.55) : ((distProva >= 21 && sessoes <= 3) ? 0.60 : 0.48);
        const travaSegurancaVolume = volAlvo * pctMaximo;

        return Math.max(pisoLongao, Math.min(distCalculada, travaSegurancaVolume));
    },

    rebalancearAdesaoSevera(plano, treinosRealizados, hojeISO) {
        if (!Array.isArray(plano) || plano.length === 0) return [];
        if (!Array.isArray(treinosRealizados) || treinosRealizados.length === 0) return plano;

        const limiteDuasSemanas = parseLocalDate(hojeISO);
        limiteDuasSemanas.setDate(limiteDuasSemanas.getDate() - 14);
        const limiteISO = getLocalISODate(limiteDuasSemanas);

        const treinosUltimasDuasSemanas = treinosRealizados.filter(t => t && t.dataISO >= limiteISO && t.dataISO < hojeISO);

        if (treinosUltimasDuasSemanas.length === 0) {
            plano.forEach(t => {
                if (t && t.dataISO >= hojeISO && !t.concluido) {
                    t.distanciaBase = parseFloat((Math.max(0, (t.distanciaBase || 0) * 0.70)).toFixed(1)); 
                }
            });
        }
        return plano;
    },

    rebalancearSemana(plano, treinosRealizados, hojeISO, atleta) {
        if (!Array.isArray(plano)) return [];
        const { start, end } = obterLimitesDaSemana(hojeISO);

        const treinosDaSemana = plano.filter(t => t && t.dataISO >= start && t.dataISO <= end);
        const realizadosNaSemana = (Array.isArray(treinosRealizados) ? treinosRealizados : []).filter(t => t && t.dataISO >= start && t.dataISO <= end);
        
        let volPlanejado = treinosDaSemana.reduce((acc, t) => acc + (parseFloat(t.distanciaBase) || 0), 0);
        let volRealizado = realizadosNaSemana.reduce((acc, t) => acc + (parseFloat(t.dist) || 0), 0);

        if (volPlanejado > 0 && realizadosNaSemana.length > 0) {
            const numRestantes = treinosDaSemana.filter(t => t && t.dataISO > hojeISO && t.tipo !== "Descanso").length;
            if (numRestantes > 0) {
                const diff = volPlanejado - volRealizado;
                const ajustePorTreino = diff / numRestantes;
                
                const ctl = parseFloat(atleta?.ctl) || 0;
                const atl = parseFloat(atleta?.atl) || 0;
                const acwrAtual = ctl > 0 ? (atl / ctl) : 1.0;

                if (acwrAtual > 1.3) return plano;

                treinosDaSemana.forEach(t => {
                    if (t && t.dataISO > hojeISO && t.tipo !== "Descanso") {
                        const distBase = parseFloat(t.distanciaBase) || 0;
                        const tetoAjuste = distBase * 0.10;
                        const incrementoReal = Math.min(ajustePorTreino * 0.25, tetoAjuste);
                        t.distanciaBase = Math.max(2.5, parseFloat((distBase + incrementoReal).toFixed(1)));
                    }
                });
            }
        }
        return plano;
    },

    obterTenisSugerido(tipoTreino, listaTenis) {
        if (!Array.isArray(listaTenis) || listaTenis.length === 0) return null;
        const disponiveis = listaTenis.filter(t => t && !t.aposentado);
        if (disponiveis.length === 0) return null;

        const strTipo = String(tipoTreino || '');
        const ehVelocidade = strTipo.includes("Intervalado") || strTipo.includes("Tiros") || strTipo.includes("Tempo") || strTipo.includes("PROVA");
        
        const categoriaAlvo = ehVelocidade ? 'velocidade' : 'rodagem';
        const ideal = disponiveis.find(t => t.categoria === categoriaAlvo);
        if (ideal) return ideal.id;

        const versatil = disponiveis.find(t => t.categoria === 'versatil');
        if (versatil) return versatil.id;

        return disponiveis[0].id;
    },

    gerarPlanoPosProva(atleta, distProvaRealizada, dataProvaISO) {
        const atl = atleta || {};
        const dataInicio = parseLocalDate(dataProvaISO);
        const distReal = Math.max(1.0, parseFloat(distProvaRealizada) || 10.0);

        let semanasRecovery = 1;
        if (distReal >= 42) semanasRecovery = 4;
        else if (distReal >= 21) semanasRecovery = 3;
        else if (distReal >= 10) semanasRecovery = 2;

        const semanasBaseline = 8;
        const totalSemanas = semanasRecovery + semanasBaseline;

        const diasDisponiveis = (Array.isArray(atl.diasTreino) && atl.diasTreino.length >= 1)
            ? [...atl.diasTreino].map(d => parseInt(d, 10)).filter(d => !isNaN(d)).sort((a, b) => a - b)
            : [2, 4, 0];

        let plano = [];
        let idCounter = 1;

        for (let s = 0; s < totalSemanas; s++) {
            const ehFaseRecovery = s < semanasRecovery;
            const faseNome = ehFaseRecovery ? "Recuperação Ativa (Reverse Taper)" : "Modo Manutenção (Baseline)";
            
            let fatorVol = ehFaseRecovery ? (0.35 + (s * 0.15)) : 0.70;
            const volSemanalAlvo = Math.max(8.0, (parseFloat(atl.volSemanal) || 20) * fatorVol);
            const numSessoes = Math.max(1, diasDisponiveis.length);
            const distPorSessao = parseFloat((volSemanalAlvo / numSessoes).toFixed(1));

            let sessoesAlocadasSemana = 0;

            for (let d = 0; d < 7; d++) {
                const diaIndex = s * 7 + d + 1;
                const dataAtual = new Date(dataInicio);
                dataAtual.setDate(dataInicio.getDate() + diaIndex);
                const dataISO = getLocalISODate(dataAtual);
                const diaDaSemana = dataAtual.getDay();
                const conflitoPernasHoje = this._ehTreinoPernas(dataISO, atl);

                let tipo = "Descanso";
                let distBase = 0;
                let prescricao = "Repouso e flushing metabólico.";
                let estrutura = [];

                if (diasDisponiveis.includes(diaDaSemana)) {
                    sessoesAlocadasSemana++;

                    if (ehFaseRecovery && s === 0 && (distReal >= 21) && sessoesAlocadasSemana > 2) {
                        tipo = "Descanso";
                        distBase = 0;
                        prescricao = "Repouso sistêmico para cicatrização de microfissuras da prova.";
                        estrutura = [];
                    } else if (ehFaseRecovery || conflitoPernasHoje) {
                        tipo = "Rodagem Leve";
                        distBase = distPorSessao;
                        prescricao = s === 0 
                            ? "Trote regenerativo em Z1. Sem pressa, foco em soltar a musculatura."
                            : "Corrida leve em Z2 para restabelecer a oxigenação tecidual.";
                        estrutura = [`${distBase}km Z1/Z2 Regenerativo`];
                    } else {
                        const ehDiaQualidade = sessoesAlocadasSemana === 1 && s % 2 === 0;
                        if (ehDiaQualidade) {
                            tipo = "Limiar Anaeróbico";
                            distBase = distPorSessao;
                            prescricao = "Manutenção de potência aeróbica e VO2 sem acumular fadiga excessiva.";
                            const aq = 1.5;
                            const desaq = 1.0;
                            if (distBase <= (aq + desaq)) {
                                 estrutura = [`${distBase.toFixed(1)}km Z4 Sustentado`];
                            } else {
                                 const pp = parseFloat((distBase - aq - desaq).toFixed(1));
                                 estrutura = [`${aq}km Z2`, `${pp}km Z4 Sustentado`, `${desaq}km Z1`];
                            }
                        } else {
                            tipo = "Rodagem Leve";
                            distBase = distPorSessao;
                            prescricao = "Manutenção de base aeróbica em Zona 2.";
                            estrutura = [`${distBase}km contínuos em Z2`];
                        }
                    }

                    distBase = (ehFaseRecovery && s < 2 && distReal >= 42) ? Math.min(distBase, 5.0) : distBase;
                }

                plano.push({
                    id: idCounter++,
                    dataISO,
                    tipo,
                    distanciaBase: parseFloat((Math.max(0, distBase) || 0).toFixed(1)),
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