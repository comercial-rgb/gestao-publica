# V23 — SIOPE, retenções, SAGRES e encargos (pedido como veio, 2026-09-29)

Recebido em 2026-09-29, HEAD `acad4b1` (branch `apresentacao/contabilidade`).

---

ORDEM DE CONSTRUÇÃO — SIOPE, RETENÇÕES, SAGRES E ENCARGOS

Continue a construção no repositório atual. Entregue capacidades operáveis:
cadastro, domínio, persistência, serviço, autorização, tela e integração.
Não encerre a rodada apenas com inventário ou documentação.

COORDENAÇÃO

- No máximo dois agentes: gerente full stack como único escritor e auxiliar
  para pesquisa, leitura e revisão.
- Uma árvore de trabalho. Preserve alterações alheias, scripts do operador
  e stash. Não faça push nem transmissão a órgãos externos.
- Verificações somente dos comportamentos alterados e consumidores diretos.
  Não executar suítes completas, test:fuso ou portão.
- Serialize processos pesados pelo mecanismo existente. Enquanto uma
  verificação aguarda, avance em leitura, construção e revisão.
- Frontend sem referências ao TR, códigos de pendência, prosa de engenharia
  ou instruções de desenvolvimento. Preserve referências técnicas nos
  comentários e documentos internos.
- Reutilize os motores existentes. Não crie contabilidade paralela.

PRIMEIRO PASSO

Confira HEAD, instruções do repositório e implementação atual destas quatro
frentes. Use os relatórios anteriores como pistas, não como prova do código.

Para cada lacuna, identifique:
1. regra pública que pode ser pesquisada;
2. informação que precisa existir no modelo;
3. dado específico do ente;
4. evidência necessária para considerar a capacidade concluída.

Ausência de dado do ente não impede construir cadastro, validação e fluxo.
Ausência de modelo é tarefa de desenvolvimento.

FONTES INICIAIS

SIOPE:
https://www.fnde.gov.br/siope/download.do
https://www.gov.br/fnde/pt-br/assuntos/sistemas/siope/manuais-do-siope
https://www.gov.br/fnde/pt-br/assuntos/sistemas/siope/media/Tutorial_Bsico_Siope_2024_v2.pdf

IRRF — conferir texto consolidado e alterações:
https://normas.receita.fazenda.gov.br/sijut2consulta/link.action?idAto=37200

Código Tributário de Esperança/PB — LC 80/2017:
https://www.esperanca.pb.gov.br/storage/content/publicacoes/quinzenario-oficial/324/arquivos/file_202006151846rBFQ.pdf

Publicação contendo alteração posterior — não presumir consolidação completa:
https://www.esperanca.pb.gov.br/storage/content/publicacoes/quinzenarios/2805/arquivos/69c3f567d8fdbeq5li.pdf

SAGRES TCE-PB:
https://docs.tcepb.tc.br/books/dados-da-contabilidade/page/versao-11-12122025

FAP:
https://www.gov.br/previdencia/pt-br/assuntos/previdencia-social/saude-e-seguranca-do-trabalhador/fap/fator-acidentario-de-prevencao-fap

Classificação orçamentária — referência inicial, conferir aplicação municipal:
https://www1.siop.planejamento.gov.br/mto/lib/exe/fetch.php/mto2026:mto_2026_-_versao_4_.pdf

Registre fonte, versão, exercício, vigência e data da consulta para cada regra
incorporada. Não use resultados de busca como substitutos do texto normativo.

1. SAGRES — CONSTRUIR AS TRÊS ENTIDADES AUSENTES

Identifique seus nomes reais no adaptador. Não presuma quais são.

Para cada entidade:
- compare os campos obrigatórios do leiaute com os dados efetivamente gravados;
- diferencie campo existente sem exportação de fato que ainda não é capturado;
- construa o fato ausente com entrada pelo fluxo operacional correspondente;
- implemente integridade, autorização, consulta e exportação;
- preserve origem, vínculos e estornos;
- respeite versão, periodicidade, nomenclatura, codificação e formato;
- não preencha desconhecidos com zeros, identificadores fictícios ou strings
  vazias quando o leiaute não permitir.

Exercite criar pela tela → consultar → exportar → conferir campo e origem.
Teste também ausência de obrigatório, vínculo inválido e estorno aplicável.

A contagem interna de 13 entidades não prova cobertura de todo o SAGRES:
reconcilie essa lista com o escopo contratado antes de declarar completude.

2. RETENÇÃO AUTOMÁTICA DE FORNECEDOR

Construa regras versionadas e explicáveis por tributo. Separe:
- IRRF;
- ISS;
- retenção previdenciária;
- outras contribuições somente quando houver fundamento aplicável.

Não aplique a soma de tributos federais a todo pagamento municipal.
Confira os arts. 2º-A e 3º-A e o Anexo I da IN RFB 1.234 consolidada.
Não trate 15% como percentual universal sobre a nota.

Para ISS, confirme primeiro o município configurado. Se for Esperança/PB,
use a LC 80/2017 e suas alterações. Não copie tabela de outro município.
Examine serviço, local de incidência, responsabilidade pela retenção,
regime tributário, base, deduções e vigência.

Implemente:
- cadastro/importação das regras comprovadas, com fundamento;
- classificação fiscal necessária do fornecedor e da operação;
- seleção inequívoca da regra na data pertinente;
- cálculo Decimal e arredondamento conforme a regra aplicável;
- prévia por tributo com base, percentual e valor;
- confirmação revalidada no servidor;
- memória imutável da regra efetivamente utilizada;
- ligação da retenção ao pagamento e à obrigação/receita correspondente;
- recolhimento parcial, saldo e estorno pelos motores existentes;
- proteção contra duplicação em reenvio e concorrência.

Diferencie explicitamente:
"não incide", "dispensado/isento com fundamento" e "não configurado".
Falta de configuração não pode produzir retenção zero silenciosa.

Critérios de fechamento:
pagamento enquadrado calcula e registra corretamente; exceção fundamentada
não retém; operação sem informação necessária recusa antes de fatos parciais;
alterar regra futura não muda memória passada; estorno recompõe os saldos.

3. FAP E NATUREZA 319013 — DUAS ENTREGAS SEPARADAS

FAP:
- identifique o estabelecimento, exercício e regime previdenciário aplicável;
- construa configuração versionada com valor, vigência e comprovante;
- preserve a precisão exigida e a memória usada no cálculo;
- aplique FAP ao componente correspondente do RAT, não à contribuição
  patronal inteira;
- diferencie RGPS, RPPS e hipóteses de não aplicação;
- não use 1,0000 como fallback silencioso;
- trate decisões ou suspensões apenas com fundamento e período explícitos.

O valor real do FAP pode depender de consulta autorizada do ente.
Construa e teste toda a capacidade com dados sintéticos identificados,
sem apresentar esses valores como parâmetro municipal oficial.

Natureza 319013:
- localize a causa exata da pendência no fluxo de encargos;
- separe natureza da despesa, conta PCASP, credor, regime e roteiro;
- confira a classificação aplicável ao fato e ao exercício;
- não trate 319013 e 319113 como intercambiáveis;
- não derive modalidade intraorçamentária apenas da sigla RPPS;
- complete o vínculo entre encargo apurado, dotação, empenho, liquidação,
  obrigação e pagamento pelos serviços existentes;
- configure contas analíticas oficiais e válidas para cada fato;
- não invente conta para fazer instalação ou teste passar.

Prove apuração → apropriação → obrigação → pagamento e estorno,
incluindo ausência de parâmetro, mudança de exercício e prevenção de duplicação.

4. SIOPE — CONTRATO REAL, EXTRAÇÃO E EXPORTAÇÃO

Identifique o escopo exigido: receitas, despesas e/ou remuneração.
Não entregue CSV de remuneração como se cobrisse toda a contabilidade.

Obtenha o contrato de importação da versão oficial do exercício:
manual correspondente, esquema publicado ou modelo exportado pelo aplicativo
oficial em ambiente de teste, sem transmissão.

Não adapte cabeçalhos por intuição. Modelo antigo serve como referência,
não como prova de aceitação na versão atual.

Implemente:
- adaptador versionado por exercício/formato;
- mapeamentos explícitos para os códigos oficiais;
- consultas dos fatos existentes, com tratamento correto de estornos;
- recorte de período conforme a declaração;
- prévia reconciliável com as origens;
- validação de campos, totais, formato e obrigatoriedade;
- download autorizado e registro da geração.

Mapeamento ausente deve aparecer como pendência específica, sem exclusão
silenciosa de valores. Não classifique despesa como MDE/Fundeb apenas
porque pertence à Secretaria de Educação.

Valide arquivo no importador oficial quando disponível, sem enviar declaração.
Se essa validação não puder ser executada, registre exatamente o limite:
exportador implementado/testado localmente não equivale a arquivo aceito pelo FNDE.

ENTREGA E CONTINUIDADE

Execute unidades completas, começando pelas que já possuem fonte e modelo
mais próximos da conclusão. Uma dependência externa não paralisa as demais.

No fechamento, informe por frente:
- o que o operador consegue fazer e em qual rota;
- quais regras/fontes foram incorporadas;
- quais testes e percursos efetivamente rodaram;
- quais arquivos foram aceitos por validador oficial, se houver;
- qual dado externo ainda falta, para qual estabelecimento/período;
- commits e limitações reais.

Não declare "fechado" apenas porque existe tela ou teste verde.
Também não mantenha "bloqueado por fonte" quando a fonte pública foi obtida.
Continue construindo até esgotar o trabalho executável desta ordem.


---

## Pedido complementar, como veio (2026-09-29, no meio da rodada)

> finalize tudo e deixe pronto para apresentar o modulo contabilidade para esperanca

## Checkpoint — 2026-09-29

Regime: profundidade (arquivos de tribunal, estornos, numeração, motivos na entrada); superfície na tela
do plano do Tribunal e no campo do documento do ingresso. Coordenação: um escritor; o auxiliar pesquisou
as fontes e inventariou o código. Registro: antes do aviso do limite de dois agentes ele lançou dois
agentes de busca somente-leitura que não conseguiu parar; refez e conferiu o inventário por conta própria.

**Frente 1 — SAGRES (feita).** As "três entidades ausentes" do relatório anterior (unidade, estorno de
pagamento, conciliação) já saíam desde a V21: o relatório estava desatualizado. Reconciliado com o leiaute
inteiro: 58 tabelas, 13 → **19** geradas. Novas: Estornos §4.9, EstornoLiquidacao §4.11, EstornoRetencao
§4.15, ReceitaExtra §4.19, EstornoReceitaExtra §4.21, EstornoDespesaExtra §4.22. Defeitos corrigidos:
anulações saíam como documentos novos em Empenhos/Liquidacao; "desfazer anulação" saía como estorno de
pagamento; numeração extra renumerava o já exportado; upload de 1,3 MB morria com 413 e a tela ficava muda.
Rotas: `/integracoes/sagres` (prévia, plano do Tribunal, pacote), `/financeiro/extraorcamentario` (ingresso
com CPF/CNPJ), `/despesa/*` (motivo de 10 a 120 na anulação).

**Frentes 2, 3 e 4 — não construídas nesta rodada** (o usuário pediu para finalizar). Fontes obtidas e
guardadas em `docs/oficial/` (relatório `V23-RELATORIO-DE-FONTES.md`); inventário do código em
`scratchpad/fontes/INVENTARIO-CODIGO.md` resumido aqui:
- Retenção de fornecedor: o valor é digitado; não existem Simples Nacional, regime, CNAE, item da LC 116,
  local da prestação nem materiais/deduções. M34 não tem ISS. O ente semeado é Campina Grande (POC), não
  Esperança. A conta do ISS da POC (`2.1.8.8.1.02.00`) é "GARANTIAS" no PCASP oficial.
- FAP: inexistente; alíquota do encargo `Decimal(7,4)` não comporta RAT×FAP. 319013: decisão de
  classificação (RPPS patronal = 3.1.91.13), não falha de código; o pagamento dos encargos pela tela baixa
  fornecedores, e não a obrigação de encargos.
- SIOPE: leiaute CSV obtido do manual do instalador 2026; falta a "Tabela 2" de códigos.

**Medições (build de produção de `d08299d`, banco `gestao_publica_apresentacao` na 3010):**

| Comando | Resultado |
|---|---|
| typecheck app | 0 erros |
| typecheck backend | 18 erros, TODOS pré-existentes em `lib/portas/leitura.ts` e `exportacoes-federais.ts` (testes de `test/` os puxam) |
| testes dos consumidores diretos | 40 arquivos, **405/405**; atualizações e censo 22/22 |
| mutações | 12, todas acusadas e revertidas (filtro de genuínos, "já liquidada", recusa do desfazer, motivo da liquidação, ordem por data, motivo extra, vínculo com retenção, documento, recomposição das linhas quebradas) |
| `poc-conferir` | **89/89 PODE COMEÇAR** |
| `conferir-telas-da-apresentacao` | **66/66** |
| `conferir-acoes-das-telas` nas 5 telas alteradas | 46 ações, 0 falha |
| percursos numa cópia (3011) | despesa **35/35**, lançamento + conciliação **18/18** (build anterior, mesmo código menos o limite de upload), **SAGRES receita extra 13/13** |
| `poc-contingencia` | 841 artefatos; ReceitaExtra de 14/09 fora (plano do Tribunal não importado no banco da apresentação — a importação é passo ao vivo do roteiro); UnidadeOrcamentaria fora nos meses (unidades sem declaração, como antes) |

Migrations aplicadas (aditivas) em test, local, apresentação e modelo: `v23_motivo_da_anulacao_de_liquidacao`,
`v23_plano_do_tribunal_e_contribuinte`, `v23_acao_do_plano_do_tribunal`. Atualização de permissões v41
aplicada nos três bancos. Não rodados: portão, `test:tudo`, `test:fuso`. Nada enviado ao TCE nem ao FNDE;
nenhum arquivo passou por validador oficial.
