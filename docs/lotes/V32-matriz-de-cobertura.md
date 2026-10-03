# V32 — Matriz de cobertura do sistema atual (áreas não explicitadas)

Pedido: `docs/lotes/V32-conferencia-das-areas-nao-explicitadas.md`. Levantamento por leitura de código, testes e
registros (quatro auxiliares somente leitura) e construção das lacunas que interrompiam operação exigida.
**Evidência** aqui é teste de integração ou percurso executado nesta rodada, com saída bruta em
`.registro-de-execucao/v32-*` na worktree `wt-v28`. Menu, tabela ou relato de rodada anterior não contam como
evidência — quando só há isso, a linha diz.

Legenda da situação: **OPERA** (o operador conclui pela tela, com efeito contábil e prova nesta rodada) ·
**OPERA, PROVA ANTERIOR** (conclui pela tela; a prova é de rodada anterior) · **PARCIAL** (parte da operação
exigida não se conclui) · **AUSENTE**.

## 1. As catorze áreas

| Área | Exigência | Modelo e motor | Tela e ação | O que o operador conclui | Efeito contábil e integrações | Evidência | Lacuna que resta | Situação |
|---|---|---|---|---|---|---|---|---|
| Convênios | 5.10.1.66–69, 5.39.19 | `m28-convenios` (cadastro, parcela, prestação, glosa, devolução, estorno) | `/transferencias/convenios` · CADASTRAR_CONVENIO, LIBERAR_PARCELA…, APROVAR_PRESTACAO_DE_CONTAS | Cadastrar, liberar, aprovar, glosar, devolver. **V32:** o roteiro de controle passou a ser declarado pela tela (`/contabilidade/roteiros-patrimoniais`) — antes só teste o escrevia e a prestação era recusada sem saída | Controle 7/8 pelo roteiro declarado (append-only) | `m01-roteiro-patrimonial-declarado` t2 (prestação do convenente lança com o roteiro declarado); `m28` 21/21 | Estorno e anexo sem botão; painel de atraso; portal (5.38.37) | PARCIAL |
| Dívida fundada / operações de crédito | 5.10.1.59, 5.10.1.91 (cabeçalho cita 4.64) | `m10/divida.ts` (cadastro, ingresso, atualização, amortização no pagamento, estorno) | `/divida/fundada`; empenho grupo 6 com "Dívida fundada"; **V32:** guia com "Operação de crédito que esta guia ingressa" | Cadastrar, atualizar, amortizar pelo pagamento e **registrar o ingresso pela guia** | Ingresso: D banco × C passivo da dívida (nunca VPA), com as pernas orçamentária e de DDR | `m10-guia-da-divida` t4/t5 (N=2, passivo = movimentos, nenhuma VPA; natureza fora de operação de crédito recusada) | Relatório da dívida; estorno pela tela | OPERA |
| Créditos a receber / dívida ativa | 5.34.x, 5.29.39–46, 5.10.2.62 | `m10/divida-ativa.ts`, `m04/reconhecimento.ts`, `m34/lancamento.ts` | `/divida/ativa`; **V32:** guia "Dívida ativa que esta guia recebe" e ação "Inscrever crédito já lançado" | Inscrever (comum e **reclassificação do crédito lançado**), atualizar, cancelar, **receber pela guia** | Recebimento permutativo: D banco × C dívida ativa (a VPA não se repete); reclassificação D dívida ativa × C crédito a receber | `m10-guia-da-divida` t1–t3 (N=2, VPA intacta, mutação acusada); motor da reclassificação em `m10-divida-ativa` | O lançamento tributário do M34 não inscreve sozinho no vencimento (inscrição é ato do operador); CDA, protesto, livro | PARCIAL |
| Suprimento de fundos | 5.10.1.14, .60–.63, .70 | **V32:** `m05-despesa/adiantamentos.ts` + `m05-adiantamentos.prisma` | `/despesa/adiantamentos` · EMPENHAR (conceder, registrar prestação), APROVAR_PRESTACAO_DE_CONTAS (aprovar/rejeitar) | Conceder sobre empenho do suprido, registrar a prestação (comprovado + devolvido = concedido), aprovar ou rejeitar com parecer | Controle 7/8 na concessão e baixa na aprovação, pelas contas declaradas; Lei 4.320 art. 69 (em alcance, dois em aberto) | `m05-adiantamentos` t1–t4 (N=2, concorrência sob o trinco 37, art. 69, negações); mutações (trinco, art. 69) acusadas; percurso V32 | O devolvido volta pela anulação de sempre (não é automático); prestação online pelo próprio servidor | OPERA |
| Diárias | 5.10.2.25, .26, 5.38.13, 5.12.78 | **V32:** o mesmo motor, espécie DIARIA (elemento 14/15, quantidade × valor unitário) | `/despesa/adiantamentos`; **portal `/transparencia/diarias`** | Conceder, prestar contas, aprovar; consulta pública por exercício | Controle 7/8; portal com CPF mascarado | `m05-adiantamentos` t1, t5 (portal, máscara, mutação acusada) | Autorização de diária pelo RH (5.12.78) como fluxo próprio; importação pelo RH (5.12.90) | OPERA |
| Precatórios / RPV | 5.10.1.78–81 | `m29-precatorios` (fila do art. 100, baixa no `pagar`) | `/divida/precatorios`; **V32:** roteiro pela tela, "Precatório" no empenho, justificativa no pagamento | Cadastrar, inscrever, atualizar, cancelar, **empenhar e pagar com baixa e ordem conferida** | Roteiro declarado; baixa e ordem constitucional dentro do `pagar` | `m29-precatorios` 10/10 (o vínculo agora passa pelo empenho, não por gravação direta); t10 negações; mutação (elemento 91) acusada | RPV (nenhuma cláusula); relatório de movimentações; estorno pela tela | OPERA |
| Garantias e depósitos | 5.10.1.74/75, 5.10.2.37 | `m07-extraorcamentario` (caução como tipo de consignação) | `/financeiro/extraorcamentario`, `/recolher` | Ingresso, devolução por recolhimento, estorno | D disponibilidade × C consignação | `m07` (relato anterior: ciclo da caução); percursos `percurso-sagres-receita-extra`, `smoke-recolhimento-por-origem` (relato 27/09) | Garantia contratual com vencimento (nenhuma cláusula) | OPERA, PROVA ANTERIOR |
| Conciliações entre módulos | 5.10.2.43–53, 5.10.1.90 | `m09/conciliacao*`, `m12/consistencia.ts` | `/financeiro/conciliacao`, `/relatorios/consistencia`; **V32:** a conferência roda no fechamento do mês | Conciliar o banco; **o fechamento recusa com divergência** | Leitura | `m12-fechamento-mensal` t2 (balancete adulterado recusa nomeando a diferença) | Folha×razão, patrimônio×razão, receita×tributário (ampliação); seleção múltipla | PARCIAL |
| Fechamento mensal e anual | 5.10.1.90, .93–.104 | `m16` travar/destravar; `m08` encerramento, apuração, virada | **V32:** `/contabilidade/fechamento-mensal` (TRAVAR_COMPETENCIA / DESTRAVAR_COMPETENCIA); `/despesa/restos-a-pagar`, `/contabilidade/virada-dos-controles` | **Conferir e fechar o mês, reabrir com motivo**; encerrar o exercício, apurar, virar os controles | A trava vale para todo lançamento pela data do fato | `m12-fechamento-mensal` t1–t3 + mutação; percurso V32 passo 5 | Abertura contábil "refazer" (5.10.1.95); cópia de notas/programações (5.10.1.99/103) | OPERA |
| Notas explicativas | nenhuma cláusula | — | — | — | — | — | Ampliação de escopo (registrar a decisão do ente) | AUSENTE (fora do edital) |
| Ordenadores e delegações | V26 (SAGRES §4.36), 5.10.2.56 | `m05/ordenador.ts` | `/contabilidade/ordenadores` | Designar, encerrar, declarar o responsável | Alimenta o SAGRES | `m15-cadastro-v26` (relato); percurso V26 (relato 26/26) | O ordenador designado não restringe quem autoriza (ampliação) | OPERA, PROVA ANTERIOR |
| Transparência | 5.38.x (57 cláusulas) | `lib/portas/*-publicas.ts`, `m13` | `/transparencia/*`; **V32:** diárias | Consulta pública de bens, despesas, receitas, pessoal, contratos, demonstrativos e **diárias** | Leitura | Testes de contrato das consultas (relato); `m05-adiantamentos` t5 | Convênios, licitações, obras no portal; aritmética duplicada M13 × portas | PARCIAL |
| Migração e saldos de abertura | condições 5.1, 5.1.1, 5.2.3, 4.16 | **V32:** `m01/implantacao-de-saldos.ts`; `m20-importador` (folha, tributos) | **V32:** `/contabilidade/implantacao-de-saldos` (REGISTRAR_LANCAMENTO_MANUAL) | **Conferir o balancete do sistema anterior e implantá-lo** num lançamento de abertura; importar folha e tributos | Um lançamento por exercício, fechando por subsistema, idempotente pela marca; corrige-se por estorno | `m01-implantacao-de-saldos` t1–t4 (leitor contra valores à mão, N=2 subsistemas, um por exercício, mutação acusada); percurso V32 passo 6 | Saldos por fonte/conta corrente; restos e dívida ativa legados com detalhe | PARCIAL |
| Recuperação e cópia de segurança | condições 5.7.4.1–4 | `m16` comando idempotente; **V32:** `scripts/operacao/copia-de-seguranca.sh`, `provar-restauracao.sh`, unidades systemd | Operação (sem tela) | Cópia diária com sha256 e retenção; prova de restauração com relatório | — | Executado no clone: restauração provada em 9 s; o instrumento acusa nome proibido, banco existente, cópia adulterada e razão desequilibrado | **Destino externo e credencial (do operador)**; instalação no servidor; RPO de 4 h | PARCIAL |

## 2. Pendências históricas — folha, entidade, SAGRES, percursos

Fechadas nesta rodada (com a evidência):

- `ELO-DO-EMPENHO-PERDIDO-NA-JANELA` — a retomada religa o empenho sem elo e recusa com valor diferente (`m33-apropriacao`, teste V32 + mutação).
- `ROTULO-CRU-DO-TIPO-DE-FOLHA` — rótulo de gente na lista, no detalhe e no título.
- Do levantamento, confirmadas fechadas com código e teste: `CONTRIBUICAO-DO-SERVIDOR-NO-PAGAMENTO`, `FOLHA-SEM-RATEIO-POR-CENTRO`, `APURADO-A-REPOR-ENCOBERTO-POR-FOLHA-SEM-VINCULOS`, `SELECAO-NO-CALCULO-SEM-SUPERFICIE`, `NUMERACAO-DA-FOLHA-FORA-DO-CAMPO-DO-SAGRES`, `REALOCACAO-NO-SAGRES`, `SAGRES-POC-CONTA-SINTETICA`, as eliminações intragovernamentais como demonstrativo. Documentos desatualizados que ainda as listam: `m07 MODULO.md:323`, `m32 MODULO.md:412`, o topo do `MODULO.md` do SAGRES ("13 de 13"; são 58).

Abertas, por impacto (nenhuma fechada sem evidência):

| Família | Pendência | Por quê importa |
|---|---|---|
| SAGRES | `RECORTE-POR-UG-NOS-ARQUIVOS` — com duas ou mais unidades gestoras operadas, cada arquivo leva a base inteira e nada recusa | **A mais grave**: Esperança tem 4 UGs previstas. Exige a dimensão de UG nos dados (ou recusa explícita) — decisão com a frente do SAGRES |
| Entidade | Razão sem dimensão de entidade/UG; `SUPERAVIT-SEM-ENTIDADE-NAS-QUATRO-PERNAS`; `ROTEIRO-SEM-NIVEL-DE-CONSOLIDACAO`; `IMPORTADOR-SEM-ENTIDADE` | Sem a dimensão, balancete e demonstrativos por entidade não existem |
| Folha | `RETIFICACAO-DA-FOLHA`; rescisão, férias, rendimentos acumulados, diferença de 13º; pensão alimentícia (zero fixo); faltas; margem consignável; provisões 5.12.85/86; folha por entidade; segunda complementar; contracheque em PDF | Tipos e eventos de folha que um município usa todo mês |
| Pagamento | `IDEMPOTENCIA-DO-PAGAMENTO-DA-FOLHA` (número digitado; a unicidade por liquidação e número e o saldo da liquidação já impedem o pagamento em dobro); remessa bancária (5.12.68, depende do convênio bancário); `RETORNO-BANCARIO-REJEITADO-SEM-EFEITO` | |
| Percursos | Vale até a mensal abatendo e o pagamento; SAGRES com 2+ UGs; aquisição de bem por liquidação de capital; termo patrimonial congelado; `/folha/esocial` | |

## 3. Ampliações de escopo (registradas, não iniciadas)

Notas explicativas; RPV; garantia contratual com vencimento; conciliação folha×razão, patrimônio×razão e
receita×tributário; inscrição automática do lançamento tributário vencido; CDA, protesto e execução fiscal;
vínculo do ordenador com quem autoriza; reexecução de relatório com falha e trabalhador contínuo; dados abertos em
JSON; consultas públicas de convênios, licitações e obras.

## 4. V33 — integração e operação do contador (atualização desta matriz, não inventário novo)

Pedido: `docs/lotes/V33-integracao-operacao-completa-e-documentos.md`. Branch `apresentacao/contabilidade`
com `v28-integrado` integrada (merge 7a7a28a + 1dc584a). Evidência: teste de integração ou percurso desta rodada,
saída bruta em `.registro-de-execucao/v33-*` e `.registro-de-execucao/percursos/v33-*`.

| Pergunta do contador | Caminho de tela | Operação executada | Efeito persistido | Documento / exportação | Evidência | Situação |
|---|---|---|---|---|---|---|
| Por que o contador não via os livros? | Menu Contabilidade › Lançamentos e livros | Perfil do contador com CONSULTAR_RELATORIOS (e receita, tesouraria, patrimônio, TRAVAR_COMPETENCIA); sem DESTRAVAR e sem PAGAR | — (perfil) | Livros e demonstrações pela mesma regra na tela e no PDF | percurso v33 C.1–C.3, rastreio 19/19 (negação no planejamento) | OPERA |
| Fechamento mensal e travamento são a mesma coisa? | Contabilidade › Encerramento e abertura › Fechamento mensal | Conferir e fechar; reabrir só com a ação, com motivo | `MovimentoTravamento` TRAVAR/DESTRAVAR (um fato só) | — | percurso v33 C.4–C.6, A.8 | OPERA |
| Cada arquivo do SAGRES leva só a UG pedida? | Contabilidade › Unidades gestoras (vínculo unidade → UG); Integrações › SAGRES | Declarar de qual UG é cada unidade; prévia e download por UG | `VinculoDaUnidadeOrcamentariaComUg` (insert-only, vigência) | Pacote recortado pela unidade da linha; dotação pela Prefeitura com a UG dona; o que não tem vínculo fica fora do ZIP, nomeado | m15-abrangencia 10/10 + 5 mutações; sagres-recorte-por-ug 4/4 (gerador real, N=2); percurso v33 A.1–A.7 | PARCIAL: contas, saldos, conciliação, extras, receita e ordenador ainda fora com 2+ UGs (`SAGRES-CONTAS-E-EXTRAS-POR-UG`) |
| Quanto devo, a quem, e o que já é exigível? | Orçamento e despesa › Execução › A pagar por credor | Consultar por credor, fase, origem | — (leitura pela régua do M05/M08) | CSV do resultado inteiro; impressão | m05-a-pagar 5/5 (N=2 credores, RP P/NP, retenções) + mutações; percurso v33 C.7–C.8, T.1 | OPERA |
| Onde anulo, e o que muda? | Orçamento e despesa › Execução › Anulações e estornos | Conferir (objeto, valor, motivo, efeito) e confirmar pelo serviço do fato | Registro novo de anulação + lançamento | Links ao original e ao lançamento; registradas com saldo atual | anulacoes-registradas 1/1 + mutação; percurso v33 C.9–C.11 | OPERA (despesa); demais áreas pelo caminho até a tela delas |
| De onde vem este número do balanço? | Relatórios › Demonstrações › Balanço Patrimonial / DVP | Abrir a conta da linha | — | Composição por conta com saldo → razão no período → lançamento → documento | periodo-das-demonstracoes 2/2; percurso v33 C.2–C.3 | PARCIAL: Balanço Financeiro, DFC e Balanço Orçamentário só levam ao balancete (`DRILL-COMPOSICAO-BF-DFC-BO`) |

Dependências restantes (documento, credencial, configuração ou autorização):

- **Vínculo unidade orçamentária → UG de Esperança** (configuração do ente): sem ele, com as 4 UGs operadas, a
  cadeia da despesa sai fora do pacote. Registro: `VinculoDaUnidadeOrcamentariaComUg`. Operação: remessa SAGRES.
- **CNPJ e entidade de cada UG de Esperança** (documento do Tribunal): `UnidadeGestora`. Operação: remessa.
- **Ordenador designado por unidade** (ato do ente): `DesignacaoDeOrdenador`. Operação: arquivo de Empenhos.
- **Mapeamento das linhas do Balanço Patrimonial** (configuração contábil): sem ele o balanço diz que falta.
- **Credencial de transmissão ao Tribunal**: nenhuma remessa é transmitida nesta rodada.
- **Destino externo da cópia de segurança** (do operador): a cópia local continua local.
- **Autorização para publicar** (do usuário): nada foi enviado ao GitHub nem à produção.
