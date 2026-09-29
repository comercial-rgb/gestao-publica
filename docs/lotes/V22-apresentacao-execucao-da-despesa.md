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

## O pedido da rodada 4, como veio (2026-09-28)

> "nao vou apresentar hoje mais, pode fazer e criar tudo que ficou pendente para testarmos"

## Checkpoint 4 — 2026-09-28, os pendentes fechados

Commits: `4c4f47d` catálogo, `fdcd63d` campanha publicitária, `c8c462d` vigência do convênio,
`fca6b9e` dígito verificador no MANAD, `2c16b12` detalhe do empenho + percurso + seletores,
`bf5d372` folha (redução do IRRF, simplificado, encargos patronais), `f4d71f8` roteiro, e o deste.

- **Vigência do convênio:** fonte achada — Portaria Conjunta MGI/MF/CGU 33/2023, art. 44, I e IX.
  O empenho do convenente fora da vigência é recusado, por dia civil, com a norma na mensagem.
- **Campanha publicitária:** estava no termo de referência do pedido (o catálogo é de outro TR). Cadastro,
  vínculo no empenho como dimensão, detalhe, percurso.
- **Folha:** redução do IRRF 2026 com o teto da faixa isenta (Lei 9.250, art. 3º-A); simplificado sem o
  INSS (art. 4º, § 2º); CHECK do banco corrigido; encargos patronais RGPS (Lei 8.212, art. 22) na
  demonstração — RGF 1 do 2º quadrimestre: 6.344,00 (2,23%).
- **Catálogo:** marcado com evidência (436 verificadas).
- **Credores da prova de conceito:** CNPJs com dígito inválido — não se cadastram (o cadastro recusa,
  com razão); o MANAD passou a nomeá-los como pendência.
- **Conferidor de ações:** passa a acionar os seletores de período e o "Aplicar" dos filtros.
- **Defeitos achados no caminho:** o t20 do molde (5 selects de parâmetros do 13º e do adiantamento sem
  rol declarado, herdado da v21) e o t3 com a mensagem antiga; ambos corrigidos.

Medições em produção: ver a seção V22 do `ESTADO-EXECUCAO.md` (tipos APROVADO, build 0, telas 45/45,
ações 156 sem falha real, percurso 35/35).

## O pedido da rodada 5, como veio (2026-09-28)

> "Pendente, com motivo, agora avance por estes que ficaram abertos."

## Checkpoint 5 — 2026-09-28, os abertos da rodada 4

Commits: `1e877a8` folha, `5acea63` LOA, `73d2210` dígito verificador, `11cf7dc` e `ffa22b6` fronteira e
instrumentos, `900962d` telas e percursos, e o deste.

- **IRRF pela tabela da lei:** base × alíquota − parcela a deduzir (Lei 11.482/2007 art. 1º, conferida no
  Planalto: 908,73 em 27,5%), um arredondamento só — o motor dá os números da Receita (562,63; 1.016,27).
  Parcela que não fecha com as faixas é recusada no cadastro e no cálculo; tabela sem parcelas segue faixa a
  faixa.
- **Parcela isenta dos 65 anos:** só provento de aposentadoria ou pensão (IN RFB 1.500/2014 art. 6º I, redação
  da IN RFB 2.299/2025), limitada ao provento de inatividade, e fora da renda que a tabela de redução lê
  (rendimento isento não é "rendimento tributável", Lei 9.250 art. 3º-A). Defeito achado: o motor dava a
  isenção a servidor ATIVO com 65 anos.
- **Redução no 13º:** Lei 9.250 art. 3º-A § 3º (texto conferido); teste N=2.
- **LOA:** cadastro do projeto, da lei que o aprovou e dos anexos; ação CADASTRAR_LOA (v40). Catálogo 5.9.3.1
  de AUSENTE_CONFIRMADO para VALIDADO_LOCALMENTE (percurso 15/15).
- **Dígito verificador no empenho:** o empenho e a solicitação novos recusam; o legado segue nomeado pelo
  portal e pelo MANAD. Fixtures trocadas pelo mesmo número com o dígito certo; o importador de folha deixou
  de usar credor fictício fixo no código (o credor passa a ser informado na tela).
- **Achados no caminho:** seis violações da fronteira tela × domínio herdadas da V11–V21; quatro instrumentos
  de teste que no Windows falhavam por caminho sem examinar nada (e, consertados, acharam dois pontos reais);
  o seed da POC dependia de conta que só existe no plano oficial.

**Continua pendente, com motivo:** FAP real do ente (dado do ente; a demonstração usa 1,0000, declarado); a
natureza 319013 das contribuições patronais (confirmar com a contabilidade); push e conciliação com a linha
do Mac (só com pedido).

## O pedido da rodada 6, como veio (2026-09-28)

> "o sistema no modulo contabilidade esta pronto para apresentarmos ?"
>
> "quero que deixe o sistema pronto, codigo, telas, linhas, condigo, nao precisa subir nada agora, queor
> tudo pronto para iniciarmos localmente e executarmos as funcoes"

## Checkpoint 6 — 2026-09-28, pronto para iniciar localmente

Regime: **superfície** (dados de demonstração, telas, instrumentos) e **profundidade** só na leitura dos
defeitos (tesouraria e SAGRES), que ficaram nomeados e NÃO foram alterados no domínio.

- **Banco da apresentação refeito do zero** com a versão atual (247 migrations): o antigo foi PRESERVADO
  renomeado (`gestao_publica_apresentacao_v21_2026_09_28`), nada apagado. A demonstração da contabilidade,
  que só existia no banco local (misturada com o que os percursos gravaram), passou a ser reproduzível:
  `npm run demonstracao:preparar`, onze passos em ordem de dependência. Os cadastros que no local tinham
  sido digitados pela tela (8 naturezas de receita, contador e empresa do MANAD) ganharam script pelo mesmo
  serviço da tela. Cópia intocada: `gestao_publica_apresentacao_modelo`.
- **Defeitos achados pelo banco limpo, corrigidos:**
  1. o seed da fila (`poc-fila`) e três percursos usavam CNPJ com dígito inválido — a regra da rodada 5
     os recusava; varredura por propriedade (todo CPF/CNPJ literal em seeds e scripts), não por lista;
  2. o Balanço Patrimonial e a DVP recusavam: faltava a classificação F/P da demonstração
     (`m12-indicador-superavit-demo`, que já existia e não estava na sequência);
  3. a conciliação recusava ("não fecha"): os dados da V22 movimentavam a CC-500-01, que divide a contábil
     1.1.1.1.1.19.00 com a conta do extrato. Passaram a movimentar a conta do extrato; o que não está no
     extrato aparece nomeado como pendência. **A falha de 6 itens do `poc:conferir` no banco local não era
     "falta de massa", como eu tinha dito — era isto.**
  4. o SAGRES recusava os dias dos dados da V22: números `2026NE000101`/`2026NL…`/`2026OB…` (o leiaute
     reserva 7 dígitos numéricos). Dados renumerados; os quatro formulários (empenho, liquidação, pagamento,
     anulação) deixaram de sugerir `2026NE000001` e dizem "só números, até 7 dígitos";
  5. o pacote de contingência parava inteiro na primeira recusa; agora grava `RECUSA.txt` com o motivo no
     período recusado e segue (o manifesto lista as recusas).
- **Nomeado, não corrigido (decisão):** `FOLHA-NUMERO-DE-EMPENHO-FORA-DO-SAGRES` (o dia 31/08, da folha, é
  recusado pelo SAGRES — MODULO do adaptador); `CONTAS-BANCARIAS-COM-MESMA-CONTABIL` não é só seed: o plano
  oficial tem uma analítica de movimento e a partida não guarda a conta bancária (MODULO do M09);
  `CONCILIACAO-VINCULO-DEPOIS-DO-CORTE` — vínculo feito depois do fim do extrato não aparece no painel, e
  não há tela para vincular (MODULO do M09).

**Medições (build de produção novo, banco `gestao_publica_apresentacao` na 3010):**

| Comando | Resultado |
|---|---|
| `tipos:conferir` + `next build` | APROVADO, build 0 |
| `typecheck:scripts` (heap 14 GB; com 5,3 GB estoura) | **0 erros** — primeira medição completa desde a V21 |
| `poc-conferir` | **89/89, PODE COMEÇAR, sem aviso** (massa 18, rotas 37, conteúdo 30, contingência 4) |
| `conferir-telas-da-apresentacao` | **48/48** |
| `conferir-acoes-das-telas` (4 grupos em paralelo) | **48/48 telas, 160 ações, 0 falhas** |
| `poc-contingencia` | 560 artefatos; 1 período recusado com motivo (2026-08-31, folha) |
| percursos que GRAVAM, numa cópia (`gestao_publica_ensaio`, 3011, apagada depois) | despesa **35/35**, LOA **15/15**, tabelas da folha **6/6** |
| `test/ui` | 262/262 (um estouro de tempo com o build rodando junto; o arquivo passa sozinho) |

Não rodados: `portao`, `test:tudo`, `test:fuso`. Nada no ar ao fechar (3010 e 3011 desligadas).

## Como iniciar a demonstração localmente (Windows, pasta única)

O banco `gestao_publica_apresentacao` está pronto e conferido. A cópia `gestao_publica_apresentacao_modelo`
é o mesmo estado, intocado, para voltar a ele depois de uma apresentação em que se gravou pela tela.

1. Docker Desktop aberto e o contêiner `pg-gestao-publica-win` ligado (`docker start pg-gestao-publica-win`).
2. Servir (Git Bash, na pasta do projeto):
   `PERCURSO_BANCO=gestao_publica_apresentacao PERCURSO_COMO_RUNTIME=1 PERCURSO_PORTA=3010 AMBIENTE_DE_EXECUCAO=demonstracao npx tsx scripts/servir-percursos.ts`
3. Abrir `http://localhost:3010` e entrar com `admin@cg.pb.gov.br` (a senha é a `SEED_ADMIN_SENHA` do `.env`).
4. Antes de começar, conferir (somente leitura):
   `DATABASE_URL=<o do .env com o banco gestao_publica_apresentacao> npx tsx scripts/poc-conferir.ts --base=http://localhost:3010`
   — tem de dizer "PODE COMEÇAR".
5. Voltar ao estado conferido depois de gravar pela tela (com o servidor parado):
   `docker exec pg-gestao-publica-win psql -U gestao -d postgres -c "drop database gestao_publica_apresentacao" -c "create database gestao_publica_apresentacao template gestao_publica_apresentacao_modelo"`

**Refazer do zero** (≈ 3 min): `scripts/preparar-banco-de-percursos.ts` (a massa da POC; exige
`DATABASE_URL_PERCURSOS`, `LICENCA_NUMERO` e `LICENCA_CLIENTE`) e depois `npm run demonstracao:preparar` com
`DATABASE_URL` no mesmo banco — onze passos em ordem de dependência, idempotentes.

## O pedido da rodada 7, como veio (2026-09-29)

> "Pontos que dependem de decisão sua (registrados, não alterados) te autorizo a resolver"

Os três pontos: `FOLHA-NUMERO-DE-EMPENHO-FORA-DO-SAGRES` (M33/M05 + adaptador SAGRES), a conta corrente
bancária na partida (M01 + M09) e `CONCILIACAO-VINCULO-DEPOIS-DO-CORTE` com a tela de vínculo (M09).
Regime: **profundidade** nos três.

## O pedido complementar da rodada 7, como veio (2026-09-29)

> "ja emendar nesta sessao sua, quero o modulo de contabilidade pronto com as rotas que esperanca pede
> para eu clicar e executar em sessao, deixar o sistema pronto para publicarmos em producao, quero um
> sistema em producao que ao mudar o codigo atualize na hora sem demoras, igual frota manuntencao ja e"

## Checkpoint 7 — 2026-09-29

Regime: **profundidade** (numerador, conciliação, razão manual, datas civis) e **superfície** (telas,
roteiro, publicação).

- **Os três pontos autorizados** (commits `23e6887`, `59ee6bb`): numerador numérico da folha e dos
  encargos, com o número reservado protegido contra digitação (achado da auditoria dos invariantes);
  conciliação atribuída por conta bancária quando a contábil é compartilhada, sem reescrever o razão;
  duas datas na conciliação e o vínculo pela tela (cinco tipos internos).
- **Publicação** (`b7e4490`): `scripts/atualizar-no-servidor.sh` + `.github/workflows/publicar.yml`
  (inerte sem os segredos) + `docs/operacao/ATUALIZACAO-AUTOMATICA.md`. A frota não se atualiza
  sozinha: é `git pull` + recarga do Puma por SSH, e parece instantâneo porque Rails não compila. Aqui,
  3 a 6 min de compilação **com o site no ar** e troca sem queda. Depende do usuário: credencial AWS
  (IAM sem chave nem Lightsail), DNS, deploy key, segredos.
- **Esperança**: o PDF do edital não está nesta máquina; a matriz C01–C40 da V14 foi conferida rota a
  rota (`docs/demonstracao/ROTEIRO-ESPERANCA.md`). Construído: **lançamento contábil manual** (C01/C03,
  o serviço existia sem tela), **ingresso extraorçamentário avulso** (C32, idem). Roteiro da apresentação
  de 48 para 66 telas.
- **Defeito achado no caminho — data civil:** a guia de recolhimento, o estorno extraorçamentário e
  quatro atos de restos a pagar passavam "AAAA-MM-DD" cru ao domínio, que virava meia-noite UTC — o
  DIA ANTERIOR no ente (um pagamento de restos em 01/01 cairia no exercício anterior). Corrigido na
  porta com `meioDiaCivil`; varredura por propriedade em curso.
- **Continua pendente, com motivo:** SIOPE (sem leiaute do FNDE aqui); retenção automática de
  fornecedor (tabela de alíquotas por serviço é do ente e da Receita); três leiautes do SAGRES com
  lacuna de modelo; FAP e natureza 319013 (terceiros).
