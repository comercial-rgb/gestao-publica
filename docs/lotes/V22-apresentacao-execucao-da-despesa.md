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

## O pedido da rodada 3, como veio (2026-09-28)

> "siga para proximo e tambem finalize o que falta os 5 pontos"

(O "próximo" era o percurso que clica nas ações de cada tela; os 5 pontos: RGF de pessoal, MANAD,
remanejamento/transposição/transferência, as lacunas menores e as três decisões do usuário.)

No meio da rodada: "tinha varios arquivos criados soltos na pagina downloads apaguei todos ... tem
duas pastas gestao publica no desktop e download deixar so uma" — e, perguntado, "unificar todos
existem somente em um ... manter na area de trabalho o atual e vinculado ao git".

## Checkpoint 3 — 2026-09-28, pasta única e os 5 pontos

Commits: `c2508cf` merge da v21-windows (remanejamento, transposição e transferência; dados da
unidade orçamentária), `a00323b` dimensões nas anulações, `8b5fead` classificação do MANAD +
históricos + folha de demonstração, `5596c9b` MANAD gerado (retenção no L150, fornecedor pelo
cadastro de pessoas), `26dea9e` salários a pagar F e RGF no 2º quadrimestre, e o deste checkpoint.

### Pasta única
O repositório passou a ser `OneDrive\Área de Trabalho\gestao-publica` (com o `.git`); as pastas
de Downloads foram removidas depois de conferir que a cópia do OneDrive era idêntica ao commit
`a17dfbd` e que a outra sessão não tinha nada sem commit. `node_modules`, `.cache-puppeteer` e
`.next` ficam fora do OneDrive em `C:\Users\winer\.gestao-publica-local`, por junção.

### Medido em PRODUÇÃO (build desta pasta, `next start` na 3011, banco gestao_publica_local)
- `npm run tipos:conferir`: APROVADO nos dois recortes, também sobre os 309 tipos de rota que o
  build escreveu (a primeira aprovação usou o `next typegen`, que gera só 2).
- `next build`: exit 0.
- `conferir-telas-da-apresentacao.ts`: 44/44 (entraram unidades orçamentárias, realocações e a
  classificação do MANAD; o RGF anexo 1 agora com números: 5.200,00, 1,83% da RCL).
- `conferir-acoes-das-telas.ts` (novo): 44/44 telas sem falha, 130 ações verificadas (links,
  arquivos PDF/planilha/CSV, janelas de detalhe e filtros), 0 falha. Provado que acusa: rota
  inexistente sai FALHA com código 1. Limite declarado: formulários que gravam não são enviados
  (o percurso da despesa cobre os de empenho/liquidação), e o filtro de data dos demonstrativos,
  que troca a URL no navegador sem formulário, não é exercitado.
- `percurso-execucao-da-despesa.ts`: 33/33.
- MANAD 2026 gerado no banco de demonstração: 127 linhas, 10 L150, 10 L750 (7 com nome).

### Os 5 pontos
1. RGF anexo 1: folha de agosto/2026 com 2 servidores (tabelas oficiais de IRRF e RGPS 2026),
   calculada, fechada, apropriada, certificada e liquidada por três pessoas.
2. MANAD: tela de classificação (unidade, ação, naturezas) e da forma de escrituração, grants
   coluna a coluna no censo; pontuação tipográfica só nos históricos; pagamento com retenção em um
   L150 por perna; fornecedor pelo cadastro de pessoas.
3. Remanejamento, transposição e transferência: da outra sessão, mesclado.
4. Lacunas: dimensões das anulações por propriedade (teste contra as colunas do modelo); natureza
   11130211 rotulada pela tabela oficial (IRPJ); descrições do ementário com hífen.
5. Decisões: órgão 01 e 99 no Executivo; centralização gravável pela tela; histórico com
   pontuação tipográfica convertido no arquivo.

### Pendências nomeadas
- Vigência do convênio no empenho: a regra depende do regulamento da transferência (Portaria
  424/2016 revogada pela Portaria Conjunta 33/2023, que desde 2024 vale só acima de R$ 1,5 mi); o
  artigo não foi confirmado na fonte oficial. Não implementada.
- Campanha publicitária: não há cláusula no catálogo do termo de referência; sem modelo.
- Redutor do IRRF 2026: o modelo não representa o teto "até R$ 312,89" da faixa até R$ 5.000.
- Desconto simplificado: o motor desconta a contribuição junto com o simplificado — conferir com
  quem responde pela folha (Lei 9.250, art. 4º).
- Encargos patronais da folha de demonstração não semeados (alíquota patronal sem fonte).
- MANAD L750: 3 documentos antigos da prova de conceito sem cadastro de pessoa saem sem nome.
