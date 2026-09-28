# V22 — apresentação: marca Engine e a execução da despesa de ponta a ponta

Pedido recebido em 2026-09-28, executado no worktree `gestao-publica-apresentacao` (branch
`apresentacao/contabilidade`, a partir de `3cf102a`), com banco próprio `gestao_publica_local`
(cópia de `gestao_publica_apresentacao`), sem colidir com a sessão que trabalha em
`gestao-publica-v21`.

## O pedido, como veio

> o outro agente esta trabalhando mas voce executar as funcoes e criacoes abaixo sem colidir com ele:
> aplicar visual de marca da MSFrota "C:\Users\winer\OneDrive\Área de Trabalho\MS Frotas"
> em empenhos ao aperecer o dropdown da ficha (dotacao) aplicar mascara real em dispovel hoje esta 10000.00
> em credor ao inserir cpf ou cnpj listar os fornecedores para selecionar ja criar para teste.
> criar uma ordem de compra para listar, e tambem opcao de ao inserir o numero filtrar por ela, em contrato tambem e reserva dotacao tambem, criar textos para o historico puxar e autopreencer. Os empenhos criados e listados abaixo, a opcao de clicar e abrir o empenho com informacoes, opcao de exportar pdf e excel e tambem layout de impressao.
> Em liquidacoes, opcoes de incluir comprovante do banco para consultar, ao clicar abrir modal igual em empenhos.
> confirmar que conseguimos apresentar este fluxo abaixo, confirmas, telas, botoes, modal ao clicar, impresses layout, para apresentarmos a solucao: SISTEMA DE CONTABILIDADE PÚBLICA. [segue o texto do termo de referência: registro contábil, demonstrações, Módulo 1 Planejamento, Módulo 2 Alterações do Orçamento, Módulo 3 Execução Orçamentária, Módulo 4 Extraorçamentário — truncado em "Retenções a Recolher: ... permitindo o controle da composicao"]

## Decisão tomada no pedido

Marca: **sistema inteiro** (resposta de Winner em 2026-09-28). A cor de ação passa a ser o laranja
forte da marca (`#C24F00`, único que aceita texto branco); barra lateral grafite com o laranja
oficial; títulos em Exo 2. A instituição continua vindo do cadastro.

## Em que módulo entra

| Parte | Módulo |
|---|---|
| marca | casca de UI (`app/globals.css`, `components/ui/`) |
| ficha formatada, vínculos com busca, histórico composto, modal, Excel, impressão | M05 despesa (telas) |
| busca de credor por CPF/CNPJ | M19 pessoas (catálogo de opções) |
| comprovante bancário na liquidação | M22 documentos (anexo com dono `liquidacaoId`, já no schema) |

---

## Checkpoint — 2026-09-28 (worktree `gestao-publica-apresentacao`, branch `apresentacao/contabilidade`)

Commits: `1e67ab6` (marca + emissão do empenho), `693d464` (liquidação + anexos no Windows), e o
deste checkpoint. `ESTADO-EXECUCAO.md` **não** foi tocado nesta branch, de propósito: a sessão
paralela em `gestao-publica-v21` o edita, e o conflito se resolve na reconciliação; o registro
desta unidade é este arquivo.

Regime: **superfície** (telas, catálogos de opções, exportação), com três pontos em profundidade
declarados: a guarda da raiz de armazenamento (M22), a autorização de leitura do anexo por
unidade, e o gerador `.xlsx` (dinheiro como texto decimal).

### O que passou a funcionar, e a rota

| O quê | Rota |
|---|---|
| marca Engine: cor de ação `#C24F00`, barra grafite, Exo 2, símbolo e assinatura na entrada | todas; `/login` |
| ficha com "disponível R$ 10.000,00" | `/despesa/empenhos` |
| credor por CPF/CNPJ ou nome, do cadastro (e "credor sem cadastro") | `/despesa/empenhos` |
| ordem de compra, contrato e reserva com busca pelo número; a origem preenche ficha, credor, valor, tipo, categoria e histórico | `/despesa/empenhos` |
| lista com nome do credor; modal no número (resumo, NE em PDF, dossiê, imprimir); Excel; imprimir lista | `/despesa/empenhos`, `/despesa/empenhos/xlsx` |
| dossiê imprimível (`?imprimir=1` imprime ao abrir) | `/despesa/empenhos/[id]` |
| modal da liquidação (nota fiscal, atesto, valores, comprovantes) e anexo do comprovante do banco | `/despesa/liquidacoes` |
| Excel e impressão da lista de liquidações | `/despesa/liquidacoes/xlsx` |

### Medido

- typecheck dirigido dos arquivos alterados: exit 0 (três rodadas).
- `packages/planilha/escrever-xlsx.test.ts` 7/7 contra o leitor independente `lerPlanilha`;
  mutação: coluna deslocada, `&` e `<` sem escape ficam vermelhos.
- `modules/m22-documentos/armazenamento-caminho.test.ts` 3/3; mutação: guarda antiga vermelha
  no Windows, guarda que aceita `..` vermelha nos dois sistemas. `m22-documentos.test.ts` 21/21
  (banco `gestao_publica_local_test`).
- UI: campo-referenciado + moeda 14/14; marca/identidade/componentes/campos 43/43;
  leitura-exige-acao + lote-ent02 8/8; fronteira-ui só com as 6 acusações herdadas da V21.
- percurso `scripts/demonstracao/percurso-execucao-da-despesa.ts` contra a 3011: **33/33**,
  com emissão real, releitura após recarregar, anexo, download íntegro, negação com motivo
  (almoxarife: tela recusa por acesso; download 404 sem conteúdo; sem a checagem por unidade ele
  baixa — vermelho) e estorno do próprio empenho (a ordem volta a ser oferecida).

### Defeitos achados e corrigidos

1. Guarda da raiz dos anexos com `startsWith(raiz + "/")`: no Windows nenhum anexo gravava.
2. Download de anexo de liquidação/empenho caía em "não encontrado" para todos.
3. `--color-acento` usado em 8 telas sem definição.
4. Seletor com escolha feita emendava o texto digitado no fim do rótulo.
5. Modal: botão principal branco sobre branco (duas utilitárias de fundo).

### Conferência das telas do roteiro da apresentação (`conferir-telas-da-apresentacao.ts`, 3011)

25/34 abrem com conteúdo pela medida automática. As 9 restantes, lidas uma a uma:

| Tela | Situação real |
|---|---|
| Razão | funciona; pede a conta antes de mostrar (medida automática estreita) |
| Retenções a recolher | funciona; lista "ISS a recolher 200,00" e "Compor a guia" |
| Balanço Financeiro | **recusa**: o caixa derivado (−19.500,00) não fecha com as partidas de disponibilidade (200,00) — dado da base de demonstração |
| Balanço Patrimonial, DVP | **recusa**: conta 1.1.1.1.1.19.00 sem indicador de superávit (FINANCEIRO/PERMANENTE) — parametrização do ente |
| RREO anexo 8, anexo 12; RGF anexo 1 | abrem **vazias**: a base não tem receita de impostos, despesa de educação/saúde nem pessoal |
| Alterações de PPA/LDO | abre **vazia**: não há PPA nem LDO cadastrados |

A base de demonstração (`gestao_publica_apresentacao`) é a origem do clone; as três recusas e os
quatro vazios valem para ela também (nada da V22 toca caixa, plano de contas, receita ou PPA).

### Pendências nomeadas

- `ROTEIRO-RESERVA-SEM-CONTA`: reservar dotação é recusado ("roteiro orçamentário não
  parametrizado para RESERVA"); a escolha entre 6.2.2.1.2.01/.02/.99 é decisão contábil do ente.
  Sem ela, o seletor de reservas do empenho fica vazio.
- Material de serviço na classe `OUTROS` (1.1.5.6.1.99.00) no semeador: decisão a confirmar.
- Os três documentos de credor dos empenhos da POC (12345678000199, 98765432000188,
  11222333000144) têm DV inválido e não viram cadastro; a lista mostra só o documento.
- Ausentes em tela (levantamento por leitura de código): DFC; MSC/SICONFI e MANAD (motor existe,
  sem rota); remanejamento/transposição/transferência; vínculo empenho→convênio; solicitação de
  empenho como etapa própria; LOA como tela própria (hoje fichas/QDD).
- Cada corrida do percurso emite e estorna um empenho: a lista acumula pares
  "2026NE9xxxxx / Anulado" no banco local.

### Próximo ponto exato

Decidir com a contabilidade (1) a conta da reserva, (2) o indicador F/P da 1.1.1.1.1.19.00 e
(3) a origem da diferença de caixa do Balanço Financeiro; depois semear PPA/LDO e receitas de
impostos/despesas por função para os anexos do RREO/RGF saírem com número na apresentação.

---

## Checkpoint 2 — 2026-09-28, fim da rodada "deixar tudo pronto conforme o texto"

Commits desta rodada (branch `apresentacao/contabilidade`): `0f4ccf6` menu e parametrização,
`8a804b5` BF no exercício aberto + DFC + arquivos federais, `5637db4` e `0358ea1` textos
profissionais (cerca de 470 arquivos), `581cf4c` LOA com anexos, `a0b5a97` solicitação de
empenho + convênio no empenho + ementário da receita + responsáveis do MANAD + anexos 8/12 +
BO, e o deste checkpoint.

### Medido em PRODUÇÃO (build próprio, `next start` na 3011, banco gestao_publica_local)
- `npm run tipos:conferir`: APROVADO nos dois recortes (app-sem-rotas 160 s, rotas-geradas 192 s).
- `next build` (com a aprovação de tipos pelo digesto): exit 0.
- `conferir-telas-da-apresentacao.ts`: 41/41 telas abrem com conteúdo. Ressalva: o RGF anexo 1
  abre mostrando "sem despesa de pessoal" — conta como tela que abre, NÃO como dado pronto.
- `percurso-execucao-da-despesa.ts`: 33/33.
- Zero erro no servidor de produção. O 500 "frame.join is not a function" da primeira
  navegação era do `next dev` (corrida de compilação), não se reproduz em produção.

### Defeitos corrigidos nesta rodada
1. BF recusava durante todo o exercício aberto (restos a pagar só lidos após o encerramento).
2. BO somava anulação parcial em vez de subtrair.
3. Anexos 8 e 12 decidiam "atingiu o mínimo" pelo percentual arredondado.
4. PDFs em 500 no worktree: o Chrome do Puppeteer não era achado (junção `.cache-puppeteer`).
5. Histórico sugerido com travessão (inexportável no MANAD) e corte do "s" final.
6. Link quebrado /receita/arrecadacao no CMD/MBA; token --color-acento ausente.

### Demonstração (dados de teste, banco local)
Parametrização: roteiro da reserva (6.2.2.1.2.02), F/P de 6 contas com fundamento, natureza da
fonte 500, roteiro do crédito especial. Dados: 9 credores, 10 ordens de compra, processo e 2
contratos, 3 reservas, PPA 2026–2029 + alteração, LDO 2026, fichas de educação/saúde/pessoal,
8 naturezas de receita do extrato oficial, arrecadações de IPTU/ITBI/ISS, previsão de receita
que equilibra a LOA (`prever-receita-da-loa.ts`), contador e empresa do MANAD.

### Pendências nomeadas (não bloqueiam a apresentação da contabilidade)
- RGF anexo 1 sem dados: exige a folha (tabelas INSS/IRRF, folha fechada, grupo de empenho).
- MANAD recusa: classificações de unidade/ação/natureza exigidas pelo leiaute sem tela e sem
  grant de UPDATE; 8 históricos antigos com travessão (decidir se o gerador translitera
  pontuação tipográfica para o equivalente aceito pelo leiaute).
- Indicador de centralização do MANAD só por script (EnteConfig sem grant de UPDATE).
- `m12-depara-orgao-poder` não aplicado: mapeia órgão 01 como Legislativo, e aqui 01 é a
  Prefeitura — decisão do ente.
- Remanejamento/transposição/transferência: em construção na outra sessão (realocação).
- Vigência do convênio no empenho; campanha publicitária sem modelo; dimensões nas anulações
  (dívida na anulação total, obra/ordem no estorno da parcial).
- A natureza 11130211 está rotulada "IPTU - Principal" mas não é IPTU pelo extrato oficial.
