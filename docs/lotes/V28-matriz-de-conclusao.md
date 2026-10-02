# V28 — matriz única de conclusão (cadeias fora da V27)

Mantida durante a V28. Fonte: leitura do código no commit `c4ecb8d` por dois auxiliares (A: funcional
e aderência ao TR; B: motores e integridade), conferida por amostragem antes de construir. "Percurso"
quer dizer percurso de navegador escrito; "validada" só quando ele já passou registrado.

SAGRES, UG, LOA/projeto, ofícios 14/15 e a divergência de R$ 200 são da V27 (outra sessão) e não
estão aqui.

Situações: **ausente** · **parcial** · **sem percurso** · **validada** · **depende de externo** ·
**não aplicável (fundamento)**.

## 1. Folha até o banco e o custo

| Requisito / capacidade | Situação | Evidência | Lacuna |
|---|---|---|---|
| Cálculo, fechamento (5.12.51, 5.12.52) | validada | `scripts/smoke-folha.ts` | — |
| Tipos de folha (5.12.50) | parcial | enum `TipoDeFolha`: 5 de 9 | rescisão, férias, rendimentos acumulados, diferença de 13º |
| Apropriação e empenho do bruto | validada | `smoke-apropriacao-da-folha.ts` | provisão de férias/13º (5.12.85/86) |
| Certificação segregada | validada | `smoke-atesto-da-folha.ts` | — |
| Liquidação da folha | validada | idem | — |
| Pagamento do líquido | parcial | `pagar` do M05 por liquidação | número digitado (sem chave de idempotência); sem dados bancários do servidor; sem remessa (5.12.68) |
| IRRF retido pelo ente → receita própria | validada | `percurso-retencoes-proprias.ts` | — |
| Contribuição do servidor e consignações no pagamento | parcial | `lib/portas/pagamento.ts:271-314` | só entram se digitadas; sem guarda como a do IR (5.12.37, 5.12.83) |
| Recolhimento das retenções | validada | `smoke-recolhimento-por-origem.ts` | — |
| Retorno bancário | parcial | `servico-lote.ts:645` | sem estado "rejeitado"; rejeição não anula o pagamento |
| Envio de borderô | depende de externo | `enviarBordero` recusa | convênio bancário do ente |
| Custo da folha por centro (5.12.64) | parcial | centro no vínculo; M12 só apropria liquidação à mão | `FOLHA-SEM-RATEIO-POR-CENTRO` |
| Encargos no custo | ausente | memória em JSON, sem vínculo | depois do custo por centro |

## 2. Licitação e contrato até o pagamento

| Requisito / capacidade | Situação | Evidência | Lacuna |
|---|---|---|---|
| Demanda e pesquisa de preços | validada | `smoke-compras.ts` | ligação solicitação → processo (5.17.56/57) |
| Plano anual de licitações (5.17.69-74) | ausente | — | — |
| Reserva de dotação | validada | `smoke-contratacao.ts` | liberação da diferença estimado × vencido (5.17.77) |
| Condução do procedimento (5.17.13, 20-38) | ausente | — | comissão, propostas, lances, julgamento, recursos, ata |
| Homologação e contrato | validada | `smoke-contratacao.ts` | rescisão, apostila, reequilíbrio (5.17.78/81/82) |
| Empenho por contrato/ordem | validada | `smoke-cadeia-despesa.ts` | — |
| Medição, recebimento, glosa | validada | `smoke-ponte-contratual.ts` | — |
| Liquidação fora dos elementos 30, 39, 71 | ausente | `CONTRAPARTIDA_DA_LIQUIDACAO` | obras (51), equipamentos (52) e demais recusam |
| Retenções e pagamento | validada | `percurso-retencao-calculada.ts` | — |
| Conciliação | validada | `percurso-lancamento-e-conciliacao.ts` | — |

## 3. Patrimônio e almoxarifado

| Requisito / capacidade | Situação | Evidência | Lacuna |
|---|---|---|---|
| Aquisição de bem a partir da liquidação | ausente pela tela | `adquirirBem` sem chamador | sem gancho na liquidação; sem guarda cumulativa |
| Entrada em estoque (elemento 30) | sem percurso | `AoLiquidarMaterialPort` | — |
| Saída, requisição, inventário de estoque | validada | `smoke-ent06.ts` | — |
| Inventário de bens | sem tela | `abrirInventarioDeBens` | tela |
| Depreciação | validada | `smoke-pacote2.ts` | ~~residual com duas casas~~ corrigido em `a89f82c` |
| Baixa, reavaliação, alienação | validada | `smoke-pacote2.ts` | — |

## 4. Restos a pagar

| Requisito / capacidade | Situação | Evidência | Lacuna |
|---|---|---|---|
| Inscrição | validada sem razão | `smoke-encerramento-do-exercicio.ts` | `INSCRICAO-DE-RP-SEM-PERNA-NO-RAZAO` |
| Liquidação, pagamento, cancelamento | validada | `smoke-restos-a-pagar-operacoes.ts` | contas 6.3 nas execuções |
| RP em ordem de pagamento e lote | ausente | `ItemDoLote` | — |
| Relatório de RP e prescrição (5.10.1.27) | ausente | — | — |

## 5. Receita

| Requisito / capacidade | Situação | Evidência | Lacuna |
|---|---|---|---|
| Previsão | validada | `smoke-receita-por-fontes.ts` | — |
| Reconhecimento tributário | sem percurso | `m34-tributario/lancamento.ts` | — |
| Arrecadação baixando o crédito reconhecido | ausente pela tela | `arrecadarComVinculo` sem chamador | VPA lançada duas vezes pela tela |
| Identificação bancária, conciliação | validada | `smoke-arrecadacao-conta.ts` | — |
| Anulação de arrecadação | validada | `anular-actions.ts` | estorno do reconhecimento sem tela |
| Dedução e restituição (5.10.2.10/16/17/64) | ausente | — | — |

## Situação depois da V28 (o que mudou)

| Capacidade | Antes | Agora | Evidência |
|---|---|---|---|
| Residual da depreciação | duas casas (12,5% virava 12%) | seis casas, tela aceita decimal | m10 t7 + mutação; percurso passo 12 |
| Guia quitando crédito reconhecido | ausente pela tela (VPA em dobro) | validada na 3012 | m04 guia t1-t4 + mutação; percurso passo 5 |
| VPA da guia | constante = VPA do ITR para toda natureza | declarada pelo ente por natureza, fail-closed | m04 conta-da-receita + mutação; percurso passos 3-4 |
| Liquidação de obras/equipamentos (elementos fora de 30/39/71) | ausente | conta declarada pelo ente por elemento | m01 conta-da-liquidacao + mutação; percurso passo 2 |
| Aquisição de bem pela liquidação | sem teto cumulativo; reconhecia duas vezes; sem tela | teto sob trava, reclassificação obrigatória, tela no detalhe do bem | m10 t1, t1c, t4b, t4c + mutações; **sem percurso** (o clone não tem ficha de capital) |
| Descontos do servidor no pagamento da folha | só o IR retido; INSS ia ao servidor | consignação declarada por rubrica, retenção automática, recusa sem declaração | m33 ir-da-folha (12) + mutações; percurso passos 7-10 |
| Custo da folha por centro | ausente | repartido pelo centro de cada vínculo na competência | m33/m12 custo (3) + mutação; percurso passo 11 |
| Controle orçamentário dos restos (5.3/6.3) | ausente | **não construído**: varredura com desenho pronto | docs/varreduras/varredura-v28-controle-orcamentario-dos-restos.md |
| Retorno bancário rejeitado | sem efeito | **não construído**: depende de confirmar o fluxo operacional (o pagamento já existe quando o banco responde?) | — |

Percurso: `scripts/demonstracao/percurso-v28-cadeias.ts`, 26/26 num clone limpo do banco da apresentação
(`gestao_publica_v28`), servido na 3012 a partir do commit `781181b` (build `eYKgBELX2Zz5MymgAZra_`).

## Ordem de construção adotada

Primeiro o que produz número contábil errado, depois o que bloqueia cadeia inteira:

1. ~~Residual da depreciação com duas casas~~ — `a89f82c`.
2. Arrecadação pela tela baixando o crédito tributário reconhecido (VPA em dobro).
3. Aquisição de bem: guarda cumulativa e a não duplicação VPD + ativo.
4. Inscrição de RP com perna no razão (roteiro versionado, contas pelo contador).
5. Pagamento da folha: chave de idempotência e guarda das retenções do servidor.
6. Custo da folha por centro.
7. Tabela elemento → conta da liquidação (decisão do ente), destravando obras e equipamentos.
8. Retorno bancário rejeitado anulando o pagamento.

## Progresso

| Unidade | Commit | Verificação |
|---|---|---|
| Residual com seis casas | `a89f82c` | M10 dirigidos 66/66; mutação em dois sítios; `tsc` do app 0 erros |
