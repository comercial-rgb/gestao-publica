# V24 — Retenção automática, SIOPE, FAP, pagamento dos encargos e SAGRES

## Pedido, como veio (2026-09-30)

> O que não está construído comece a construindo por Retenção automática de IR, ISS e INSS do
> fornecedor, depois SIOPE, FAP nos encargos patronais, Pagamento dos encargos pela tela e SAGRES

Contexto: resposta à lista "O que não está construído" da conversa de 30/09 (SIOPE; retenção automática de
IR, ISS e INSS do fornecedor; FAP nos encargos patronais; pagamento dos encargos baixando a conta errada;
SAGRES com 19 de 58 tabelas). Ordem de execução: a do pedido.

Restrições que continuam valendo (V23 e CLAUDE.md): nada de push, deploy ou transmissão; nenhuma norma,
alíquota ou conta inventada (pendência vazia é melhor); migrations aditivas; sem suítes completas, só o
que mudou; a 3010 serve a apresentação a partir do build atual — nenhum `next build` sobre `.next` nem
migration no banco `gestao_publica_apresentacao` enquanto ela estiver no ar.

## Checkpoint 1 — 2026-10-01

Regime: **profundidade** (cálculo tributário, razão, folha, arquivo de tribunal); superfície nas telas
novas. Módulos: retenção em **M07** (motor, tabelas, memória) com o perfil fiscal sob o cadastro de
pessoas (M19, ação `ALTERAR_PESSOA`); FAP em **M33**; a obrigação do pagamento em **M05**; DespesaExtra no
adaptador **SAGRES** (`adapters/tribunais/tce-pb`).

**1. Retenção automática de IR, INSS e ISS (feita).** Tabelas carregadas dos textos oficiais com sha256
(`docs/oficial/MANIFEST-RETENCAO.json`, `scripts/carregar-tabelas-da-retencao.ts`): IR 9 naturezas (Anexo I
da IN RFB 1.234/2012, coluna 02, art. 3º-A), INSS 30 serviços, 11% e mínimo de R$ 10,00, 10 bases mínimas
(IN RFB 2.110/2022), ISS de Esperança 200 subitens com alíquota do art. 62 e local de incidência (LC 80/2017
com a LC 132/2025), IBGE de Esperança 2506004 (API do IBGE). O que o cálculo NÃO cobre fica "sem cálculo"
e o pagamento exige o valor informado com justificativa: pessoa física, contribuinte sobre a receita
bruta, adicional de atividade especial, ISS de construção (7.02/7.05: a LC 132 conflita com a dedução de
40% da LC 80), ISS devido a outro município, Simples sem a alíquota do documento. Rotas: Despesa ›
Pagamentos (bloco "IR, INSS e ISS do fornecedor", prévia e pagamento), Cadastros › Pessoas › [pessoa]
("Dados fiscais para retenção na fonte"). Defeito achado pelo percurso e corrigido: a conta do passivo
vinha do cadastro original e não da decisão vigente do ente.

**2. SIOPE (não construído — bloqueado por terceiro).** O manual oficial 2026 cita a "Tabela 2" (códigos
das planilhas) e não a traz; não há leiaute publicado à parte. Desbloqueio: um CSV exportado pelo próprio
programa do SIOPE na prefeitura traz os códigos no campo 3 de cada linha.

**3. FAP (feito).** RAT × FAP aprovado do CNPJ do ente no ano (Lei 10.666/2003, art. 10; Decreto
3.048/1999, art. 202-A): FAP de 0,5000 a 2,0000 com até 4 casas, aprovado por outra pessoa; a versão do
RAT marcada "multiplicar pelo FAP" exige alíquota de 1, 2 ou 3%; as versões anteriores calculam igual.
Rota: Folha › Encargos › FAP. Pendência: ente com mais de um CNPJ empregador (fundo, autarquia).

**4. Pagamento dos encargos pela tela (feito).** O pagamento pela tela debitava sempre fornecedores
(2.1.3.1.1.01.01), também em liquidações de encargos (2.1.1.4.3.01.01) e de salários (2.1.1.1.1.01.01).
Agora usa a obrigação que a liquidação creditou, e o `pagar()` do M05 recusa roteiro divergente para
qualquer chamador. Medido antes: 15 liquidações, todas com uma obrigação só.

**5. SAGRES (em andamento).** DespesaExtra §4.20 com o CPF/CNPJ de quem recebe (exigido no recolhimento)
e o CO da ficha que pagou. Próximo: o grupo de restos a pagar (§4.28 a §4.34 e §4.40).

**Medições:**

| Comando | Resultado |
|---|---|
| motor da retenção | 24/24, 8 mutações acusadas |
| leitura das fontes | 12/12 (conferências independentes) |
| retenção no banco | 13/13 (inclui par de autorização e a decisão da conta), 3+3 mutações |
| FAP (motor, banco, encargos) | 51/51, 5 mutações |
| obrigação do pagamento | regressão M05/M06/M07/M08/encargos 584/584, 3 mutações |
| SAGRES | 86/86, 4 mutações |
| guards de tela | 262/262 e 263/264 — o vermelho é `data-civil.test.ts` com 32 sítios de 27-28/09 (V21/V22), nenhum desta rodada |
| typecheck app, rotas e backend | sem erro novo (backend mantém os 18 de `leitura.ts`/`exportacoes-federais.ts`) |
| percursos (3011, clone, build próprio numa worktree) | retenção calculada 22/22; FAP 8/8 |

Migrations aditivas aplicadas em test e local (NÃO no banco da apresentação, que segue servindo a 3010):
`v24_retencao_calculada`, `v24_fator_acidentario`, `v24_favorecido_do_recolhimento`.

Pendências desta rodada: aplicar as migrations, `carregar-tabelas-da-retencao` e o build novo no banco da
apresentação quando o usuário decidir; o ente da demonstração é Campina Grande (2504009) e a lista do ISS
carregada é a de Esperança (o ISS só calcula com o ente de Esperança); as consignações IRRF/INSS/ISS do
banco da apresentação apontam contas erradas (GARANTIAS, sintética) e o IRRF não existe — o percurso as
corrige pela tela; a classificação do IR retido como receita do município (MCASP) não foi conferida.

## Checkpoint 2 — 2026-10-01 (fechamento da rodada)

**5. SAGRES (feito nesta rodada): 19 → 27 das 58 tabelas.** DespesaExtra §4.20 com o CPF/CNPJ de quem recebe
(exigido no recolhimento) e o CO da ficha que pagou. O grupo de restos a pagar: PagamentosRestos §4.28,
EstornoPagamentoRestos §4.29, CancelamentoRestos §4.30, LiquidacaoRestos §4.31, EstornoLiquidacaoRestos §4.32,
RetencaoRestos §4.33, EstornoRetencaoRestos §4.34 e RestosInscritos §4.40 (no balancete de dezembro). Os
arquivos do exercício (§4.10 a §4.15) deixaram de levar os fatos de restos (antes saíam lá). Recusas
nomeadas: cancelamento de restos desfeito (o leiaute não tem registro); recolhimento com retenções de CO
diferente. Sem operação no sistema: anular liquidação de restos (o §4.32 sai sem registros).

**Percursos finais** (build próprio numa worktree em `24cb74e`, servido na 3011 sobre clone limpo do
`gestao_publica_apresentacao_modelo` com as três migrations, as tabelas carregadas e o ente em 2506004):

| Percurso | Resultado |
|---|---|
| retenção calculada (`percurso-retencao-calculada.ts`) | 22/22 |
| pagamento dos encargos (`percurso-pagamento-de-encargos.ts`) | 5/5 (D 2.1.1.4.3.01.01 1.040,00, nada em fornecedores) |
| FAP (`percurso-fap.ts`) | 8/8 |
| SAGRES receita extra (V23, agora "27 de 58") | 13/13 — num clone limpo; rodado DEPOIS do da retenção falha 1 passo, porque aquele troca a conta do ISS (o passo espera a conta antiga da POC) |
| execução da despesa (V22) | 35/35 |
| lançamento e conciliação (V22) | 18/18 |

Defeito do próprio percurso achado e corrigido: a conferência no livro comparava "1040,00" com a tela, que
mostra "1.040,00" — e a afirmação negativa (fornecedores) passava por vacuidade. A worktree e o clone foram
removidos; a 3010 seguiu servindo a apresentação.

**Medições adicionais:** restos no SAGRES 5/5 com 7 mutações; SAGRES 105/105; typecheck app, rotas,
backend e scripts sem erro novo; guards de tela 262/262.

**Pendências reais:**
- **Banco da apresentação:** aplicar as três migrations, `carregar-tabelas-da-retencao`, a atualização do
  build e as consignações IRRF/INSS/ISS nas contas analíticas. Não foi feito porque a 3010 está servindo;
  depende do usuário.
- **SIOPE:** bloqueado pela Tabela 2 do FNDE (ver o checkpoint 1).
- **Retenção:**
  - ISS de construção 7.02/7.05: conflito entre a LC 132 e a LC 80.
  - Pessoa física.
  - Contribuinte sobre a receita bruta.
  - Adicional de atividade especial.
  - Classificação do IR retido como receita do município (MCASP).
  - Recolhimento que mistura retenção calculada e consignação manual no mesmo pagamento.
- **FAP:** ente com mais de um CNPJ empregador.
- **SAGRES:** 31 tabelas ainda não geradas.
  - PLOA.
  - Programas e ações.
  - Fornecedores.
  - Ordenador.
  - Relacionamentos.
  - Transferências.
  - Saldo inicial.
  - Receita prevista.
  - Frota e farmácia, que ficam fora da contabilidade.
- **Guard de data civil:** `data-civil.test.ts` vermelho com 32 sítios de 27-28/09 (V21/V22).
