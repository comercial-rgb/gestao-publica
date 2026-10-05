# RREO Anexo 4 — Receitas e Despesas Previdenciárias do RPPS (V35)

`rreo-anexo4.ts`. LRF, art. 53, II; MDF 15ª ed., Tabela 4 (Municípios). Tela: `/relatorios/rreo/anexo4` (bimestre,
CSV). Também alimenta o bloco RPPS do Anexo 14, que antes era declarado ausente.

## A fonte das regras

O mapeamento oficial da STN para o MDF 15ª ed. sobre a MSC 2026:
- arquivo: `docs/oficial/stn-sof/mapeamento-rreo-mdf15-msc2026.zip`;
- versão de 08/07/2026, sha256 `9e626eedb1f40facca7b56362ce0e9726c02538295124efaa0dfb797131ee972`;
- planilha "RREO - ANEXO 04", aba "Anexo 4 - RPPS ( M e DF )".

Cada regra do código declara a linha da planilha. O teste lê o zip de forma independente e confere cada prefixo
transcrito contra a célula oficial: o número solto da lista, ou o código completo da coluna de critérios sem os zeros
finais. A mutação de um prefixo foi provada vermelha.

## Quem é de qual quadro

Pela fonte:

| Fonte | Quadro |
|---|---|
| 800 | Fundo em capitalização |
| 801 | Fundo em repartição |
| 802 | Administração (taxa) |
| 804 | Benefícios mantidos pelo Tesouro |

Com outra fonte, pelos blocos complementares do mapeamento:
- o código de acompanhamento 1111… (capitalização) ou 2111… (repartição), na subfunção 272;
- a subfunção 274, para os benefícios mantidos pelo Tesouro.

## Onde este sistema se afasta do mapeamento (nomeado nas notas do próprio demonstrativo)

- **Subelemento:** é opcional no empenho e não existe na ficha.
  - 01, 03 e 86 se classificam pelo elemento.
  - 91, 92 e 94 se classificam pelo subelemento quando ele existe; sem ele, vão a "Demais despesas previdenciárias",
    com a contagem na nota.
- **Saldo das contas sem fonte:** a conta 1.1.1.1.3, que o mapeamento parte pela fonte, não entra no quadro de bens.
- **Administração paga com outra fonte:** a despesa da administração paga com outra fonte, pelo Poder/Órgão do RPPS,
  não é lida.
- **Reprevisão:** a reprevisão da receita é por natureza. Vai ao quadro em que a natureza foi prevista; se foi prevista
  em mais de um, fica fora e é nomeada.

## Aritmética

Nenhuma soma nova sobre o fato:

| Item | De onde vem |
|---|---|
| Receita realizada | `arrecadadoPorNaturezaFonte` (M04) |
| Previsão | `receitaPrevista` + `reprevisaoAcumuladaPorNatureza` |
| Dotação atualizada | `calcularSaldos` do M05 sobre os movimentos de dotação (inclui créditos e realocações) |
| Empenhado, liquidado e pago | `somaLiquidaEstornaveis`, por empenho classificado. O estorno e a anulação parcial herdam a linha do empenho original. |
| Aportes e bens | saldo das contas transcritas, no fim do bimestre |

O resultado é a receita realizada menos a despesa liquidada (1º ao 5º bimestre) ou empenhada (6º). A receita de aportes
para déficit atuarial fica fora do total (IV), como manda a nota 1 da tabela.

## Esperança

A LOA 2026 já se separa pelas fontes:
- **capitalização (800):** receita prevista de 29.502.000,00; dotação de 29.172.000,00 (aposentadorias 19.453.500,00,
  pensões 3.118.500,00, demais 6.600.000,00) e reserva de 330.000,00;
- **administração (802):** 1.234.200,00.

O Anexo 10 (projeção atuarial) existe desde a V35 (`rreo-anexo10.ts`, tela `/relatorios/rreo/anexo10`), pelas regras do
Siconfi (STN, "Regras Gerais e Instruções de Preenchimento — RREO", 2025): só no 6º bimestre; 75 anos ou mais a partir
do ano anterior; (c) = (a) − (b) e (d) = (d anterior) + (c), com o primeiro d anterior dos controles do ente; uma tabela
por plano (capitalização; repartição só com segregação da massa). Os números são do ente, colados da avaliação atuarial
com o documento; o resultado e o saldo são calculados, nunca gravados. Teste `m12-rreo-anexo10.test.ts` (N=2 nos
planos, contas à mão; negações com o motivo; parser contra valores escritos à mão), três mutações provadas; percurso
`scripts/percurso-v35-anexo10.mts`. O que continua de terceiro é só o DADO: a avaliação atuarial do FUNPREVE.
