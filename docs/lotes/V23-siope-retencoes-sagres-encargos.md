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
