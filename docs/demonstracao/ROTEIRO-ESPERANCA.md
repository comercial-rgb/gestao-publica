# Roteiro de Esperança: o que clicar em cada item

Cada item da matriz C01 a C40 (lida do edital de Esperança, `docs/lotes/V14-contabilidade-esperanca-dois-dias.md`)
aparece aqui com a tela, o que se faz nela e o que conferir depois.

Entre com `admin@cg.pb.gov.br`. O endereço é `http://localhost:3010` na demonstração local, ou o
domínio, quando publicado.

> O PDF do edital de Esperança não está nesta máquina. A matriz foi lida dele à mão. Se aparecer
> um item fora desta lista, ele não foi conferido aqui.

## Manter no ar durante a apresentação

A tarefa agendada `GestaoPublica-Apresentacao` roda `scripts/demonstracao/manter-apresentacao-no-ar.mjs` sem janela
(`conhost --headless`), por 12 h. A cada 20 s confere o banco e a tela de entrada, e sobe o servidor de novo se cair
(medido: volta em cerca de 25 s). A cada 5 min impede a suspensão por inatividade, sem alterar a configuração de
energia. Registro em `%LOCALAPPDATA%\gestao-publica-apresentacao\apresentacao-no-ar.log`.

- Iniciar: `Start-ScheduledTask GestaoPublica-Apresentacao`. Parar: `Stop-ScheduledTask GestaoPublica-Apresentacao`
  (o servidor continua no ar). Remover depois: `Unregister-ScheduledTask GestaoPublica-Apresentacao`.
- Não iniciar o supervisor de um terminal ou por janela visível: fechar a janela derruba tudo.
- Velocidade medida (`scripts/demonstracao/medir-velocidade-das-telas.ts`): mediana 0,3 s por tela; as duas lentas
  são Roteiros de restos a pagar (5 s) e Plano de contas (3,5 s), que montam listas com milhares de contas.

## Escrituração e controles gerais

| Item | Tela | O que fazer | O que conferir |
|---|---|---|---|
| C01 Escrituração | Contabilidade › Lançamentos | Registrar lançamento manual (data, número, histórico, partidas). Tente primeiro com débito diferente do crédito, e depois com conta sintética (1.1.1.1.1.00.00). | As duas tentativas são recusadas com o motivo. O certo aparece na lista. As operações (empenho, pagamento, arrecadação) também lançam sozinhas. |
| C02 Identificação patrimonial | Patrimônio › Bens patrimoniais › um bem | Baixar ou alienar. | O lançamento leva ao bem e ao documento. |
| C03 Correção sem apagar | Contabilidade › Lançamentos | Estornar lançamento manual. | O original continua e o estorno fica ao lado. Vale igual para empenho, liquidação e pagamento (Anular): o motivo tem de 10 a 120 caracteres, sem aspas, porque vai ao Tribunal de Contas. |
| C04 Segurança | Administração › Perfis; entrar com um usuário sem a permissão | Tentar uma ação sem a permissão. | O servidor recusa e diz qual ação faltou. |
| C05 Centros de custo | Contabilidade › Centros de custo | Apropriar parte de uma liquidação. | O teto é o valor da despesa. A composição volta à liquidação. |
| C06 Convênios e contratos | Transferências › Convênios; Licitações › Contratos | Cadastrar, liberar parcela. | Os empenhos relacionados aparecem no instrumento. |
| C07 Intragovernamental | Relatórios › Eliminações intragovernamentais | Consultar. | Visão individual e ajuste consolidado. |
| C08 Demonstrativos | Relatórios › Diário, Razão, Balancete, Balanços, DVP, DFC | Consultar e exportar. | Os totais fecham com os fatos do período. |
| C09 Dados federais | Contabilidade › Arquivos para a STN e a Receita | Gerar MSC e MANAD. | O arquivo baixa. O SIOPE **não existe** (ver pendências). |

## Planejamento

| Item | Tela | O que fazer | O que conferir |
|---|---|---|---|
| C10 PPA | Planejamento › PPA | Cadastrar programa e ação. | Versão e anexos. |
| C11 LDO | Planejamento › LDO | Cadastrar. | Vínculo com o PPA. |
| C12 LOA | Planejamento › Projeto e Lei da LOA | Cadastrar o projeto, registrar a lei, anexar o PDF. | Publicação antes da sanção é recusada. A dotação nasce das fichas da LOA. |
| C13 Alterações de PPA/LDO | Planejamento › Alterações | Alterar e comparar. | O original fica preservado. |
| C14 Limites constitucionais | Relatórios › RREO anexos 8 e 12; RGF anexo 1 | Consultar. | Base, exclusões e percentual visíveis. |
| C15 CMD e MBA | Planejamento › CMD e MBA | Criar versão. | Totais e realizado comparável. |
| C16 Saldo orçamentário | Planejamento › QDD | Consultar. | Dotação, reservado, empenhado e disponível separados. |

## Alterações orçamentárias

| Item | Tela | O que fazer | O que conferir |
|---|---|---|---|
| C17, C18, C20 Créditos adicionais | Planejamento › Créditos adicionais | Criar o decreto, executar, anular. | Ato, fonte e limite. O pedido não altera o saldo até a efetivação. |
| C19 Remanejamento, transposição e transferência | Planejamento › Remanejamento… | Registrar e anular. | Classificação própria, sem virar suplementação. |

## Execução da despesa

| Item | Tela | O que fazer | O que conferir |
|---|---|---|---|
| C21 Reserva | Licitações › Processos › um processo | Reservar dotação. | A reserva convertida em empenho não desconta duas vezes. |
| C22 Bloqueio pelo CMD | Planejamento › CMD e MBA | Configurar o bloqueio e tentar empenhar acima da cota. | Recusado com a cota do mês. |
| C23 Solicitação de empenho | Despesa › Solicitações de empenho | Solicitar e autorizar. | Sem autorização não vira empenho. |
| C24 Empenho | Despesa › Empenhos | Empenhar a partir da ordem de compra. O número é **só com dígitos** (é como o SAGRES recebe). | Vínculos com contrato, campanha e convênio. |
| C25 Liquidação | Despesa › Liquidações | Liquidar com nota fiscal e anexar o comprovante. | Limite pelo empenho. |
| C26 Pagamento | Despesa › Pagamentos | Pagar. | Fonte errada é recusada. |
| C27 Retenções | Despesa › Pagamentos (composição do pagamento); Folha | Informar a retenção no pagamento. | Na folha, o IRRF é calculado. No fornecedor, o valor é informado (ver pendências). |
| C28 Retenção e receita | Financeiro › Extraorçamentário | Consultar a retenção nascida do pagamento. | Ingresso de caixa sem duplicar. |
| C29 Arrecadação | Receita › Arrecadação | Registrar e anular. | Natureza e fonte próprias. |
| C30 Distribuição por fonte | Receita › Distribuição da receita por fonte | Repartir a guia. | As parcelas somam o total. |
| C31 Reversões | Qualquer tela com Anular ou Estornar; Restos a pagar › estornar apuração | Anular. | Motivo e vínculo ao original. |

## Extraorçamentário, tesouraria e fim de exercício

| Item | Tela | O que fazer | O que conferir |
|---|---|---|---|
| C32 Ingresso | Financeiro › Extraorçamentário | **Registrar ingresso** (caução, depósito), com o CPF ou CNPJ de quem entregou. | Aparece no saldo a recolher. Não é receita orçamentária. CPF/CNPJ com dígito errado é recusado. |
| C33, C34 Recolhimento | Financeiro › Retenções a recolher | Recolher, dizendo de quais retenções sai. | Saldo por origem. |
| C35 Virada do exercício | Contabilidade › Virada dos controles; Despesa › Restos a pagar | Parametrizar e encerrar. | Nada duplicado na virada. |
| C36 Estorno extra | Financeiro › Extraorçamentário | Estornar o recolhimento. | Reabre só a parcela. |
| C37 Composição | Financeiro › Extraorçamentário | Consultar. | Retido, recolhido, estornado e a recolher. |
| C38 Restos a pagar | Despesa › Restos a pagar › uma inscrição | Liquidar, pagar, cancelar. | Sem empenho novo. |
| — Conciliação bancária | Financeiro › Conciliação bancária | **Vincular** a linha do extrato ao registro do sistema, e desfazer com motivo. | O vínculo aparece mesmo feito depois do fim do extrato. Com duas contas na mesma conta contábil, cada uma fecha com os seus fatos. |
| C39 SAGRES | Integrações › SAGRES | Escolher o dia ou o mês e gerar. Para a receita extra, importar a planilha do plano de contas do Tribunal (`docs/oficial/tce-pb/Pcasp_2025.xlsx`) dizendo qual ano da tabela vale e por quê. | O pacote baixa. A tabela da tela mostra as 58 tabelas do leiaute: 19 geradas, as outras marcadas como não geradas. As anulações de empenho, liquidação e pagamento saem nos arquivos de estorno, não como documentos novos. Sem a planilha do Tribunal, a receita extra fica fora do pacote e a prévia diz por quê. |
| C40 Implantação | Ver `docs/operacao/` | Instalar e atualizar. | Atualização automática em `ATUALIZACAO-AUTOMATICA.md`. |

## O que ainda não está pronto, com motivo

- **SIOPE (C09).** O leiaute de importação foi obtido (manual do instalador oficial 2026, em
  `docs/oficial/fnde-siope/`): arquivo CSV com ";", transmissão bimestral. Falta a "Tabela 2" de
  códigos das planilhas, que o manual cita e não traz; sem ela não se monta o mapeamento das contas. O
  exportador não foi construído.
- **Retenção automática de fornecedor (C27).** Hoje o valor é informado no pagamento. As normas foram
  obtidas (IN RFB 1.234/2012 com o Anexo I, IN RFB 2.110/2022 para o INSS, LC 80/2017 e LC 132/2025 de
  Esperança para o ISS). Falta construir: o sistema não guarda os dados fiscais do fornecedor (Simples
  Nacional, regime) nem da operação (item da lista de serviços, local da prestação, materiais).
- **FAP e natureza 319013.** O FAP não existe no cálculo dos encargos (a alíquota do encargo tem 4 casas,
  e RAT × FAP pede mais). A 319013 não quebra nada: é decisão de classificação (patronal do RPPS vai em
  3.1.91.13, intraorçamentária). O pagamento dos encargos pela tela baixa a conta de fornecedores, e não a
  obrigação de encargos.
- **SAGRES.** 39 das 58 tabelas não são geradas (lista na própria tela). A tabela de 2026 publicada pelo
  Tribunal tem as exigências por conta zeradas; a tabela que vale é escolhida na importação, com fundamento.
  Na despesa extra, o CPF/CNPJ do favorecido e o código de detalhamento da fonte saem zerados e a prévia
  aponta.
