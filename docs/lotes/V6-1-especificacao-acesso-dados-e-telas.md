# Gestao Publica - acesso, dados compartilhados e experiencia de uso

> Recebido em 2026-09-13 junto de `V6-1-continuacao-p2-p3.md`. Guardado como veio, sem edicao.

## 1. Natureza deste documento

Especificacao de produto que complementa o V6. Nao e inventario de funcionalidades ja entregues, parecer sobre toda a legislacao municipal nem autorizacao para disponibilizar dados reais.

Fonte funcional: Termo de Referencia de Anita Garibaldi, especialmente 5.8, 5.12, 5.17, 5.21, 5.26, 5.37 a 5.43. As decisoes tecnicas abaixo explicam como construir essas capacidades; os caminhos propostos devem ser reconciliados com as rotas reais, e nao afirmados como existentes.

Nao criar outro catalogo de status a partir desta tabela. O inventario de implementacao deve ser derivado das rotas/contratos e referenciar o catalogo unico ja utilizado.

## 2. Matriz de canais

| Canal | Autenticacao | Pode consultar | Pode alterar | Fronteira obrigatoria |
|---|---|---|---|---|
| Institucional | Nao para leitura | Paginas, estrutura, noticias, agenda, contatos, carta de servicos | Somente editor interno autorizado publica | Rascunhos e configuracao privada nao entram no payload publico |
| Transparencia | Nao para leitura publica | Projecoes publicaveis de planejamento, receitas/despesas, contratos/licitacoes, obras, pessoal, demonstrativos e documentos | Nao altera o dominio; filtros/exports sao leitura | Campos/anexos publicaveis explicitos, atualidade e origem identificadas |
| Consulta/verificacao limitada | Conforme servico; chave de verificacao nao e login global | Autenticidade e extrato minimo que o servico permita | Nenhuma transicao de negocio em GET | Chave imprevisivel e escopo minimo; sem enumeracao de CPF/processos |
| Cidadao | Identidade confiavel para acervo pessoal e atos que a exijam | Proprios pedidos, respostas, dados e obrigacoes; servicos genericos antes de login | Criar pedidos e complementar/requerer alteracoes permitidas | Pedido de correcao nao sobrescreve cadastro mestre sem analise |
| Servidor (autosservico) | Conta propria vinculada corretamente | Ficha permitida, documentos de folha liberados, pedidos e historico proprios | Pedidos/solicitacoes e operacoes de autosservico suportadas | Nao recebe poder de operador de RH |
| Fornecedor/contador/representante | Humano + representacao explicita vigente | Dados do representado no escopo do mandato | Propostas, documentos, requerimentos e atos autorizados | CNPJ sozinho nao autentica; revogacao vale para consulta, download e integracao |
| Gestao interna | Usuario ativo + autorizacao por acao/escopo/registro | Dados de sua atribuicao | Atos permitidos e validos para o estado | Separar operador, aprovador, fiscal, liquidante, ordenador e tesouraria |
| Administracao tecnica | Perfil tecnico especifico | Diagnostico sanitizado, execucoes, versoes e configuracao permitida | Atos tecnicos autorizados | Nao implica acesso a folha detalhada, segredo fiscal ou prontuario |
| Integracao | Principal tecnico e credencial apropriada | Somente contratos e escopos pactuados | Comandos previstos e auditados | Sem cookies humanos universais; minimo privilegio e segredo fora da UI |

Excecoes de canal precisam de politica propria: ouvidoria anonima; pedido de acesso a informacao com identificacao simples; consulta publica por codigo. Nao instalar uma unica barreira de login que as elimine.

A classificacao de cada campo pode ser publica, pessoal/restrita ao titular, operacional por atribuicao, fiscal protegida, sigilosa por regra pertinente ou segredo tecnico. Classificacao nao e somente uma flag no registro inteiro: um contrato publicavel pode conter anexo parcialmente protegido.

## 3. Telas de alimentacao e suas projecoes

| Recurso/fato | Quem alimenta internamente | Visao publica | Visao pessoal/restrita | Nao confundir |
|---|---|---|---|---|
| Conteudo e carta | Editor e aprovador quando previsto | Pagina/servico publicado e vigente | Rascunho/editor interno | Pagina de orientacao vs execucao do servico |
| PPA/LDO/LOA | Planejamento autorizado | Pecas/versoes e execucao publicaveis | Elaboracao, revisao e historicos permitidos | Proposta de peca vs lei/versao aprovada |
| Processo licitatorio | Compras/agentes designados | Editais, atos, resultados e docs na fase publicavel | Propostas protegidas antes da abertura, analises e dados conforme permissao | Link de consulta vs poder de homologar |
| Contrato/ata | Gestao contratual | Objeto, fornecedor, valor/vigencia, aditivos e documentos devidos | Operacao, garantias e documentos restritos quando pertinentes | Expor contrato nao expor todo cadastro do fornecedor |
| Obra e medicao | Gestor/fiscal competente | Local, objeto, cronograma, situacao, valores e evidencias publicaveis | Diario, analise tecnica, medicoes e documentos completos autorizados | Progresso fisico, valor medido e valor pago |
| Receita | Tributario/financeiro | Receita por natureza/fonte, transferencias e execucao publicavel | Conta fiscal individual, declaracoes e detalhes protegidos | Arrecadacao publica vs sigilo fiscal individual |
| Despesa | Compras, fiscal, contabilidade e tesouraria | Empenhos/liquidacoes/pagamentos e documentos publicaveis | Dossie interno e suportes restritos | Compromisso, obrigacao liquidada e saida de caixa |
| Folha | RH + certificacao + contabilidade/tesouraria | Remuneracao e demais campos cuja publicacao seja devida | Contracheque completo e ficha do titular; operadores autorizados | Remuneracao nominal publica vs deducoes particulares e dados bancarios |
| Documento fiscal recebido | Fornecedor autorizado ou operador, conferido por responsavel | Extrato ou copia publicavel pertinente a despesa | XML/original e dados protegidos por politica | Receber nota nao autoriza fiscalmente nem paga |
| NFS-e/nota avulsa | Emissor/representante e fisco em suas competencias | Verificacao limitada de autenticidade quando prevista | Documentos do emissor/tomador e dados do fisco conforme regras | PDF gerado vs documento autorizado; emissor vs municipio supervisor |
| Processo digital | Requerente + setores competentes | Servico e consulta limitada/publicavel | Inteiro teor conforme titularidade/participacao/sigilo | CPF conhecido nao libera anexos privados |
| Auditoria de negocio | Sistema registra fatos/atores | Relatorios oficiais publicaveis de controle, quando devidos | Historico tecnico/de negocio por atribuicao | Relatorio de auditoria publicado vs logs crus do sistema |
| Logs tecnicos | Sistema | Somente disponibilidade/aviso publicos aprovados, sem detalhes sensiveis | Correlacao, causa sanitizada, versao e tratamento | Erro publico orientador vs stack/segredos |

Os recursos declarados publicos continuam consultaveis mesmo com uma sessao interna sem permissao naquele modulo, pois a projecao publica nao e ampliada por essa sessao. A mesma identidade nao pode usar essa entrada para obter o serializer administrativo.

Nao ofereca um botao administrativo para suspender indiscriminadamente publicacao obrigatoria. A regra de publicacao precisa representar fundamento, campos, evento de disponibilidade e tratamento de sigilo. Lacunas e conflitos com requisitos ficam registrados e sao resolvidos por fonte aplicavel, nao por conveniencia do implementador.

O TR menciona dados nominais de pessoal e motivos de desligamento. Nao publique texto livre de historico medico/judicial sob esse campo. Mapeie informacao publicavel de acordo com a regra aplicavel e preserve o detalhamento restrito. Do mesmo modo, sigilo fiscal tem excecoes legais: nao impor uma proibicao absoluta de toda informacao relativa a divida ativa.

## 4. Contrato de uma tela e de um seletor integrado

Para cada capacidade em desenvolvimento, registrar nos contratos/documentacao existentes:
- identificador da capacidade e dono do dado;
- rota/padrao real, metodo e publico;
- autorizacao de consulta, alteracao, emissao e download;
- origem das colunas e filtros; precisao, unidade e semantica de cada valor;
- relacionamentos/pais, dependencias de select e respectivas versoes;
- acao valida por estado, efeitos transacionais e idempotencia;
- conjunto de campos da projecao publica, quando existir;
- testes, dados sinteticos e evidencias de publicacao/isolamento.

Seletor referenciado deve possuir:
1. rotulo acessivel, ajuda curta e busca por codigo/documento/descricao pertinente;
2. resultados paginados e autorizados; indicador de carregamento/nenhum resultado/sem permissao distintos;
3. valor persistido canonico e rotulo humano, com situacao e vigencia quando relevantes;
4. teclado, foco e cancelamento; nao depender so de mouse;
5. invalidacao de filho ao trocar pai e aviso do que mudou;
6. resultado obsoleto de busca descartado;
7. criacao contextual autorizada, sem perder o rascunho;
8. validacao novamente na transacao, inclusive saldo e referencias historicas.

Preenchimento de baixo risco pode sugerir dados com origem visivel. Valores de conta, fonte, beneficiario, incidencias ou periodo que mudam o efeito financeiro nao devem ser escolhidos pela primeira posicao da lista. A ausencia de opcao significa uma causa a resolver, nao permissao para fabricar referencia.

Os selects dos portais publicos so consultam o que aquela superficie pode expor. Um autocomplete universal de Pessoa ou de cadastro fiscal seria vazamento, mesmo sem existir pagina de detalhe publica.

## 5. Arquitetura de informacao e tela-alvo

### Publico

Topo: identidade institucional correta, acesso aos canais ativos, busca e links essenciais. Corpo: servicos por necessidade e consultas de transparencia, filtros claros, descricao do que esta sendo medido e data real de atualizacao. Banner institucional fica subordinado a tarefa; nenhum carrossel de promessas ou indicadores fixos.

Descricao de servico: quem pode solicitar, requisitos, documentos, prazo/fundamento, custo quando houver, etapas, unidade, canais e botao pertinente. Informativo, transacional e integracao externa sao apresentados de maneira diferente.

### Gestao interna

Cabecalho compacto com contexto autorizado. Menu por dominio e papel. Minha mesa mostra tarefas, nao todas as tabelas. Filtros/colunas guardados por usuario sem ampliar a permissao. Buscar registro deve preservar a origem e permitir voltar para a lista no mesmo recorte.

Detalhe com: titulo/status, resumo de valores/prazos, acao principal contextual, abas de dados/itens/documentos/relacionados/historico conforme dominio. Tarefas complexas usam pagina propria ou painel apropriado, nao sucessao de modais aninhados.

Uma obra pode ter resumo fisico/financeiro lado a lado, cronograma, medicoes, contrato e documentos. Um empenho pode exibir bruto, liquidado, pago, saldo e retencoes sem exigir cinco consultas separadas. Os numeros devem usar a mesma aritmetica do dominio.

### Servidor e representante

Servidor inicia na propria ficha, competencias/documentos liberados e pedidos. Conta de operador RH que tambem e servidor pode alternar sua propria experiencia sem receber permissao implicita sobre colegas.

Fornecedor/contador seleciona representacao autorizada, com indicacao clara de por quem esta atuando. Expiracao de mandato invalida novas acoes e acesso restrito. O sistema nao confunde a identidade da pessoa com o CNPJ representado.

### Mensagens e documentos

Feedback de comando deve dizer referencia, efeito, pendencia e proximo passo. Documento fechado/liberado nao pode ser apresentado como pago se o pagamento ainda nao existe. Aviso institucional possui alvo/periodo/editor; alerta de negocio possui causa e relacao com registro.

Exports e PDFs sao produtos da mesma consulta autorizada. Registre criterios e data/versao do recorte. Segunda via preserva o documento emitido, enquanto posicao atual e um novo relatorio. Hash nao e assinatura e marca de agua nao substitui validade fiscal.

## 6. Estados de folha e obrigacoes financeiras

Nao exigir uma unica coluna linear que misture tudo. Exibir dimensoes derivadas conforme o modelo:
- calculo: preparado, calculado, fechado, retificado;
- certificacao: pendente, certificado, devolvido, superado por nova versao;
- apropriacao: nao iniciada, parcial, concluida por grupos;
- liquidacao: pendente, parcial, concluida ou desfeita pelos atos permitidos;
- pagamento: nao ordenado, autorizado, transmitido quando houver, confirmado, parcial, rejeitado/reconciliacao pendente;
- encargos/retencoes: apurados, obrigacao registrada, recolhimento pendente/confirmado;
- entrega externa: gerado, validado localmente, enviado, aceito/rejeitado segundo o conector.

Estados sao fatos ou derivacoes verificaveis, nao botoes para fingir que etapas ocorreram. As telas podem resumir essas dimensoes, mas os detalhes e a origem devem permanecer consultaveis.

O fechamento mensal do municipio depende do universo esperado: entidades, tipos de folha, servidores/vinculos, lotes e excecoes. 'Fechar este lote' nao pode ser rotulado como 'Encerrar toda a folha municipal' sem essa conferencia.

## 7. Verificacao de publicacao e usabilidade

Para cada recurso com projecao publica, testar em conjunto o operador que alimenta e o visitante que consulta. Criar/alterar um fato permitido internamente e conferir sua publicacao com o recorte correto; conservar dados privados apenas no canal autorizado.

Matriz minima de atores: visitante anonimo, cidadao A/B, servidor A/B, fornecedor representado A/B, operador de um setor, operador de outra entidade, atestador, liquidante, tesouraria e tecnico.

Cobrir HTML/JSON/download/exports, acesso direto por ID, pesquisa/autocomplete, cache apos logout/revogacao, chave invalida, documento alterado e projecao publica atrasada. Nao exigir invisibilidade de informacao que e de fato publica; exigir que ela nunca amplie a visao privada.

Nas telas, medir antes/depois: dados redigitados, etapas para chegar ao relacionado, erros recuperaveis, retorno ao contexto, operacao por teclado e legibilidade. Testar pequeno viewport, zoom e textos longos. Nao afirmar superioridade frente a fornecedor sem ensaio comparavel.

Nao usar quantidade de telas, tamanho do menu, quantidade de linhas de teste ou '368 verificadas' como percentual de completude. Resultado e capacidade executada com atores, dados, efeitos e evidencias.

## 8. Fontes e limites

Fontes funcionais: Termo_de_referencia.pdf (5.8.8-9; 5.12.63-73; 5.21; 5.26; 5.38; 5.39; 5.42-43) e PROMPT-V6-PRODUTO-INTEGRADO.md.

Fontes primarias consultadas em 13/09/2026; conferir o artefato e sua data de vigencia ao implementar:
- Lei 4.320, arts. 62-65: https://www.planalto.gov.br/ccivil_03/leis/l4320compilado.htm
- LAI, publicidade/acesso/informacao pessoal: https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2011/lei/l12527.htm
- CTN, sigilo e excecoes, art. 198: https://www.planalto.gov.br/ccivil_03/leis/l5172compilado.htm
- STF, divulgacao nominal de remuneracao / Tema 483: https://noticias.stf.jus.br/postsnoticias/acao-que-pretendia-evitar-divulgacao-de-remuneracao-identificada-de-juizes-federais-e-julgada-improcedente/
- NFS-e, producao: https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual
- NFS-e, homologacao: https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/producao-restrita
- eSocial, documentacao por versao e implantacao: https://www.gov.br/esocial/pt-br/documentacao-tecnica
- W3C, combobox: https://www.w3.org/WAI/ARIA/apg/patterns/combobox/
- W3C, mensagens: https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html

As fontes legais nao nomeiam aqui o atestador concreto da prefeitura. Sua definicao e um ato do ente. Esta especificacao determina como representar, conferir e testar essa responsabilidade, sem nomear pessoas reais ou conceder poderes administrativos.

As imagens de IPM/Atende.Net e referencias de Essencial ajudam a observar organizacao e experiencia; nao comprovam a implementacao privada do concorrente, nem autorizam copiar marca/codigo/dados. Este documento nao declara superioridade ja obtida.
