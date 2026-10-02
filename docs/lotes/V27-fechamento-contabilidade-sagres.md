# V27 — fechamento das pendências de contabilidade/SAGRES (pedido como veio, 2026-10-01)

Execute o fechamento das pendências de contabilidade/SAGRES com base
no estado real do repositório. Conclua todas as tarefas independentes
dos documentos e decisões ainda ausentes.

Não encerre a rodada apenas repetindo a lista de pendências.

COORDENAÇÃO
- Uma árvore e um escritor. Até dois agentes auxiliares, apenas para
  pesquisa e revisão em frentes distintas.
- Preserve alterações alheias, stash e scripts do operador.
- Sem push, transmissão ao Tribunal ou suítes/gates completos.
- Verificações dirigidas às alterações e aos consumidores afetados.
- Serialize processos pesados pelo mecanismo existente.
- Percursos que gravam dados somente na 3011.
- Nenhum texto de TR, código de pendência ou narrativa de engenharia
  nas telas. Mensagens de recusa devem orientar a ação do operador.

1. IDENTIFICAÇÃO E DOCUMENTO JÁ LOCALIZADOS

Ente: Município de Esperança/PB.
Identificação institucional: Prefeitura Municipal de Esperança.
IBGE: 2506004.
CNPJ: 08.993.909/0001-08.

Fonte pública do CNPJ:
https://snc.cultura.gov.br/adesao/detalhar/2506004

Não reutilize esse CNPJ automaticamente para Câmara, fundos ou autarquias.
Se o cadastro distinguir razão social cadastral de nome de exibição,
preserve essa distinção e confira a razão social no comprovante oficial.
Não importe autoridades e contatos antigos da página do SNC.

Lei Ordinária 613, de 19/12/2025 — LOA do exercício 2026:
https://www.esperanca.pb.gov.br/storage/content/publicacoes/quinzenarios/2720/arquivos/695513b45a3998q4tg.pdf

SHA256 dos bytes baixados nesta pesquisa:
43e84beacbc5f4de47949d2fac4356c40ecbca7a5f4a2bb38df0bff7e982b236

Baixe, confira e guarde o documento em docs/oficial, com origem,
data de obtenção e hash calculado localmente. Se o hash divergir,
compare as versões antes de aceitar ou rejeitar o documento.
A data correta consta no PDF; a descrição da página tem erro.

Vincule o documento ao cadastro da norma, reutilizando a infraestrutura
existente. Não confunda anexar a lei com conhecer seu protocolo TCE.

2. RECONCILIAR AS OITO TABELAS RESTANTES

Antes de construir, identifique nominalmente as oito tabelas e confronte
a contagem “58” com o leiaute 2026 v1.1 e o catálogo do repositório.

Para cada tabela, registre:
nome; requisito; aplicabilidade; modelo; serviço; entrada pela tela;
exportador; evidência executada; dado externo faltante.

Não presuma que são as mesmas oito de frota/farmácia mencionadas antes.
Ausência de módulo não comprova inaplicabilidade.
Arquivo vazio não comprova implementação.

Construa as lacunas de software efetivamente encontradas, incluindo
entrada de dados, autorização, validação e exportação. Reutilize o pronto.
Separe implementação concluída de remessa real impedida por documento.

Leiaute:
https://docs.tcepb.tc.br/books/dados-da-contabilidade/page/versao-11-12122025

3. UGs, PROTOCOLOS E TRAMITA

Procure primeiro nas fontes oficiais acessíveis e nos documentos já
presentes no projeto. Não exponha credenciais existentes.

Para UG, registre código oficial, entidade vinculada e evidência temporal.
Não derive código TCE de IBGE, CNPJ ou unidade orçamentária.
Não invente início de vigência em 01/01/2026.

Para normas, protocoloTCE deve corresponder ao comprovante de entrega
daquela norma no banco de legislação do Tribunal, no formato exigido.

Para licitações, confira o identificador exigido no Tramita por processo,
UG, modalidade e exercício. Não substitua por identificador PNCP nem
aceite número interno sem comprovar correspondência.

Deixe completas as telas/importações para receber esses dados.
Permita preparação e consulta; impeça a geração como remessa pronta
quando faltar campo obrigatório. Identifique precisamente os registros
afetados, sem bloquear funções independentes.

Se o acesso oficial exigir chave indisponível, registre esse bloqueio
específico e continue as demais tarefas.

4. OFÍCIOS 14/15

Leia os dispositivos pertinentes da Lei 613/2025 e eventuais alterações.
A regra do TCE exige autorização na LOA para essa hipótese.

Sem fundamento comprovado:
- mantenha indisponível a efetivação por ofício para esse recorte;
- preserve os demais caminhos legalmente configurados;
- não converta ofício em decreto automaticamente;
- não transforme ausência de autorização em “funcionalidade concluída”.

Se houver fundamento, vincule artigo, documento e exercício, e valide
também o alcance da movimentação entre elementos de despesa.
Não conclua pela simples presença ou ausência da palavra “ofício”.

5. DIVERGÊNCIA DE R$ 200,00

Localize a ocorrência exata no código, dados, documentos e checkpoint.
Produza uma memória curta: origem, valores comparados, registros
afetados, cálculo reproduzível e efeito contábil.

Se for defeito demonstrável de software, corrija e teste.
Se for decisão contábil ou divergência no documento de origem, prepare
a questão concreta para o contador, com alternativas e consequências.

Não crie lançamento de ajuste, tolerância ou arredondamento para
“fechar” o total. Não atribua ao contador uma decisão não recebida.
Não associe essa diferença a outras divergências apenas pelo contexto.

6. PROJETO DA LOA 2026

Faça busca delimitada no arquivo oficial da Câmara, proposições,
protocolo de encaminhamento e cópias já disponíveis no projeto.

Se recuperar o original, preserve documento, data e versão enviada.
Se não recuperar, registre “original não localizado”, com as buscas feitas.
Não copie a LOA aprovada para fingir o projeto original.

Conclua a capacidade de preservar projetos futuros, suas versões,
encaminhamento e diferenças para a lei aprovada, sem sobrescrever fatos.

7. PREPARAR A APRESENTAÇÃO NA 3010

A janela do operador ainda não foi definida. Isso não impede concluir:
artefato identificado por commit, migrations conferidas em banco isolado,
carga revisada, procedimento de backup/restauração e roteiro de promoção.

Não reinicie nem altere a 3010 nesta ordem.
Não renomeie dados históricos de Campina Grande como se fossem Esperança.
Prepare a separação correta dos dados e a configuração do ente.

Entregue a promoção pronta para execução, com interrupção estimada e
verificação posterior. A janela será a decisão final do operador.

8. CRITÉRIO DE FECHAMENTO

Execute verificações dirigidas e os percursos necessários ao que mudou.
Investigue a intermitência SAGRES; repetir até ficar verde não a resolve.

Relate separadamente:
- implementado;
- verificado por tipos/testes;
- exercitado em tela;
- pronto para apresentação;
- dependente de documento ou decisão externa.

Para cada dependência externa restante, entregue uma solicitação objetiva:
qual registro, qual documento/dado, quem o fornece e qual operação depende dele.

Não declare 58/58 nem sistema completo sem reconciliar escopo e evidência.
Avance até concluir todo o trabalho de software permitido pelas fontes.
