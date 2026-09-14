# V7 - Experiencia de uso, documentos e criterios de qualidade

Este documento e especificacao de produto. Nao comprova que o layout atual ja cumpra seus criterios. Aplicar incrementalmente ao design system e ao molde existentes, sem criar outra biblioteca concorrente.

## 1. Cinco experiencias sobre os mesmos dominios

| Experiencia | Entrada e prioridades | Fronteira |
|---|---|---|
| Gestao interna | Minha mesa, busca contextual, pendencias e modulos autorizados | acao + escopo + registro + estado |
| Servidor | meus vinculos, competencias, comprovantes liberados e pedidos | titular e politica de acesso historico |
| Cidadao/requerente | carta de servicos, solicitar, acompanhar, complementar e receber resposta | servico publico ou titular segundo a modalidade |
| Fornecedor/representante | representacao selecionada, propostas/documentos, entregas e valores permitidos | mandato vigente, entidade e objeto |
| Transparencia | categorias, filtros e documentos publicaveis | projecao publica explicita |

Um login nao transforma seu titular em operador de todos os canais. Um CNPJ identifica organizacao, nao autentica humano. Um papel global fora do dominio nao concede gerencia dentro dele.

A pagina publica de um contrato e o dossie interno compartilham origem, mas nao o mesmo payload. Relatorio, cache, busca, sugestoes, arquivos e metadados respeitam a mesma separacao. Nenhum total privado pode vazar por contador ou mensagem de erro.

## 2. Identidade e estrutura

Produto: Gestao Publica. Instituicao e unidade: configuracao confiavel. Ambiente: desenvolvimento/demonstracao, sem se apresentar como operacao oficial. Identificadores tecnicos completos ficam na area tecnica e evidencias, nao sobrepostos a tabelas.

Cabecalho interno: contexto municipal/institucional, exercicio quando pertinente, pesquisa, tarefas/notificacoes e conta. Contexto aberto em duas abas nao pode reinterpretar silenciosamente um formulario ja preenchido.

Menu: tarefas e dominios reconheciveis, busca/favoritos/recentes autorizados, sem uma entrada para cada tabela. Preserve rotas existentes; mude organizacao sem quebrar links salvos ou as chaves de segmentos dinamicos.

Home publica: pesquisa e servicos prioritarios visiveis antes de grandes banners. Home interna: tarefas que exigem uma acao, nao propaganda nem indicadores sinteticos apresentados como fatos municipais.

## 3. Linguagem visual compartilhada

Reutilizar tokens existentes para cores, espacamento, tipografia, bordas e densidade. Complementar somente as lacunas. Nao espalhar CSS novo por dezenas de telas nem trocar cores em cada modulo.

Alvos de desenho propostos:
- espacamento em escala consistente, por exemplo 4/8, respeitando tokens atuais;
- corpo legivel, com modo denso opcional para tabelas e sem textos pequenos como padrao;
- formularios agrupados por assunto; uma coluna em telas estreitas e agrupamento em duas quando ajudar;
- acoes principais inequivocas, secundarias separadas e destrutivas com consequencia explicada;
- estado por texto e semantica, nao somente verde/vermelho;
- iconografia com nome acessivel; tooltip nao e unica explicacao;
- contraste, foco visivel, zoom e responsividade medidos.

Referencia de engenharia: WCAG 2.2 AA, sem declarar certificacao por usar uma biblioteca. Testar teclado e reflow em 320 CSS px onde aplicavel, incluindo tabelas/documentos com excecoes e alternativas pertinentes. As capturas 360/768/1366/1440 sao amostras, nao substituem os criterios de acessibilidade.

## 4. Listagem que permite trabalhar

Acima da tabela: titulo de negocio, contexto, descricao apenas se util, acao primaria autorizada, filtros relevantes e resumo. Filtros avancados podem ficar recolhidos, com indicacao dos filtros ativos.

Tabela: colunas importantes primeiro, alinhamento numerico, datas/valores consistentes, identificador humano, estado e proxima acao. Descricoes extensas quebram linha ou abrem detalhe; hashes tem apresentacao curta com acesso completo autorizado.

Paginar no servidor. Selecionar registros e selecionar todo o resultado filtrado sao atos diferentes e devem ser explicitos. Exibir universo e total de selecao corretamente; uma pagina nao e a totalidade da consulta.

Ordenacao, filtro salvo, export e favoritos mantem escopo. Alterar permissao ou contexto exige revalidar e nao reutilizar resultado privado de outro usuario.

Estados: carregando, vazio sem registros, vazio por filtro, acesso negado, falha de consulta, dado desatualizado. Erro nunca vira zero.

## 5. Detalhe e comando

Resumo no topo: identificador, situacao, entidade, datas, valores pertinentes, responsavel e proxima acao. Depois, abas por necessidade: dados, itens, valores, documentos, relacionados e historico. Evitar abas vazias obrigatorias.

Acoes usam o contrato de elegibilidade ja entregue. Estado concluido vira evidencia/consulta, nao um botao que o servidor recusara. Pre-condicao faltante apresenta causa e atalho permitido. Foco nao deve desaparecer apos feedback.

Operacoes complexas usam pagina ou passo-a-passo curto, nao modais dentro de modais. Confirmacao mostra o efeito real: itens, valores, destinatario e irreversibilidade/ato de correcao. Nao solicitar confirmacoes em excesso para digitacao simples.

Retorno estruturado: acao, referencia autorizada, resultado, parcialidade, proxima providencia e correlacao. Sem 'sucesso' antes do commit. Timeout com resultado desconhecido exige consulta/idempotencia, nao orientacao para clicar novamente a esmo.

## 6. Campos cruzados e cadastro unico

Select pequeno: controle simples acessivel. Lista extensa: combobox com busca/paginacao, identificador humano, descricao e informacao de elegibilidade. Fonte e autoridade continuam no servidor.

Exemplos: contrato -> fornecedor/itens/vigencia; ordem -> solicitacao/parcelas; nota -> itens conferidos; folha -> grupos/fichas/regimes; obra -> contrato/fiscais/etapas; servico -> formulario/fluxo publicado.

Ao mudar o campo pai, revalidar filhos, informar o que mudou e preservar o restante do rascunho. Requisicao antiga de autocomplete nao pode sobrescrever a selecao nova. Nunca selecionar banco, fonte, beneficiario ou conta contabil so por serem a primeira opcao.

Pre-preenchimento indica origem e possibilidade de alteracao. Documento emitido guarda snapshot; dados historicos nao sao simplesmente refeitos consultando o cadastro atual.

Cadastro relacionado em contexto e permitido apenas ao papel autorizado. Ao concluir, volta a referencia do novo registro, sem recriar pessoa duplicada.

## 7. Mesa, carta e area do requerente

Mesa: filas e prazos, atribuicao, devolvidos, aguardando requerente e decisoes. Contadores derivam da mesma consulta autorizada dos itens. Prazos sem regra nao sao inventados; a falta de configuracao precisa ser resolvida pelo responsavel competente.

Carta: requisitos, etapas reais, documentos, custo quando houver, prazo/fonte, setor e como solicitar. Um prazo informado ao usuario deve ser compromisso/estimativa corretamente classificado. 'Nao declarado' nao e compromisso legal e nao autoriza marcar todos os criterios como atendidos.

Requerente: linha do tempo apenas com marcos liberados, exigencias dirigidas a ele, documentos que enviou, resposta e decisao divulgaveis. Razoes internas e sigilo seguem politica por documento/evento, nao apenas por processo.

Avaliacao: dimensoes, escala/metodo e periodo. Nao condicionar a resposta do servico a avaliacao. A nota publica sem respostas e 'sem avaliacoes', nao zero; autoria/comentarios privados nao entram automaticamente no portal.

## 8. Relatorios e documentos

Uma consulta autorizada alimenta tela, relatorio e exportacao. Nao repetir formula financeira no template. Congelar recorte ou indicar claramente a posicao temporal; documentos emitidos conservam dados/modelo da emissao.

PDF: identificacao institucional, numero/situacao, emissor autorizado quando pertinente, contexto, dados/itens, fontes, filtros, totais, memoria quando necessaria, paginacao e tabelas multipagina. Hash de integridade nao e assinatura digital.

Separar segunda via do documento, relatorio de posicao atual, demonstrativo interno e guia oficial. Nenhum documento local recebe codigo de pagamento, protocolo externo ou marca de assinatura nao existentes.

Formatos: suportar os exigidos por cada clausula; nao trocar extensao para simular DOC/XLS/CSV. Conferir documentos com texto longo, acentos, ausencia de dados e muitas paginas. Exportar documentos como texto para preservar zeros/letras, e neutralizar formulas maliciosas em texto de terceiros.

Gerador de PDF usa conteudo seguro, assets autorizados, limites, browser provisionado e filas/recursos controlados. Nao buscar URL arbitraria, dados de rede privada ou metadados cloud para montar o documento.

## 9. Quatro exercicios completos de design e teste neste marco

1. Operador de folha: consulta competencia, entende o patronal, executa ajuste valido e chega ao documento/obrigacoes. Conta sem permissao nao ve dados privados.
2. Servidor: consulta documento pessoal liberado, entende diferenca entre disponibilidade do comprovante e pagamento; outro titular nao acessa.
3. Requerente: encontra servico, envia, acompanha exigencia, complementa e recebe resposta sem ver anotacao interna.
4. Operador de protocolo: encontra tarefa, decide validamente, entende bloqueio e verifica historico; permissao global alheia nao libera setor proibido.

Cada exercicio deve ser testado com dados novos, nao somente com o ID que o desenvolvedor sabe procurar.

## 10. Medicao do resultado

Para a mesma tarefa, guardar baseline e resultado: conclusao sem ajuda de script, campos redigitados, mudancas de contexto, erros recuperados, perda de rascunho, tempo observado, acessibilidade e integridade do documento. Nao inventar percentual de melhoria sem medir.

Aceite por familia inclui capturas antes/depois, teclado, telas estreitas, negativas e estado apos recarga. Imagem bonita e HTTP 200 nao substituem a acao persistida.

O produto sera comparado com concorrentes por casos e resultados observaveis, nao por quantidade de menus. Nao copiar marcas, brasoes, codigo ou bases externas. As capturas recebidas mostram organizacao visual; nao sao prova de funcionamento de suas areas autenticadas.

## 11. Fontes

Fonte funcional: TR da conversa, especialmente 5.8, 5.37-5.43 e os blocos de cada dominio. Decisoes visuais e criterios adicionais: proposta V7.

- W3C, WCAG 2.2: https://www.w3.org/TR/WCAG22/
- W3C, foco nao oculto: https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html
- W3C, reflow: https://www.w3.org/WAI/WCAG22/Understanding/reflow.html
- Puppeteer, configuracao: https://pptr.dev/guides/configuration
- PostgreSQL, privilegios: https://www.postgresql.org/docs/current/ddl-priv.html

Consultar as versoes pertinentes ao produto; a pagina de documentacao atual nao e ordem de upgrade da dependencia instalada.
