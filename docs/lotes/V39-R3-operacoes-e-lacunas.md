ORDEM V39-R3 — COMPLETAR OPERAÇÕES, DADOS DE ENSAIO E LACUNAS

Continue a V39. Não reinicie o projeto, não substitua os 97 IDs e
não encerre esta rodada apenas com inventário ou documentação.

O objetivo é tornar demonstráveis os caminhos completos das funções
construídas, corrigir os resíduos de integridade e construir as
capacidades restantes que não dependem de material externo.

1. CONTEXTO E EVIDÊNCIA

Consulte os prompts guardados em Downloads na máquina sempre que
precisar recuperar requisito, critério, decisão, áudio ou referência.
Leia também o checkpoint, a matriz V39 e os documentos dos módulos.

Confira HEAD, remoto e artefato instalado. Verifique se 11babed7
está apenas local ou se a referência informada precisa de correção.

Reconcilie a matriz com o relatório R2, especialmente:
- scripts de login;
- diárias;
- suprimento de fundos;
- transferência patrimonial;
- convênios;
- restauração do backup.

Não marque concluído apenas porque o relatório diz.
Localize código, resultado e evidência correspondente.

Mantenha uma linha por ID. Não reúna pontos distintos em intervalos.
“Instalado” e “operado com sucesso” são estados independentes.

Até dois auxiliares para reconhecimento e revisão; um escritor
e integrador. Processos pesados serializados.

2. PREPARAÇÃO DO AMBIENTE COMPLETO

R3-001 — Massa de ensaio reproduzível

Prepare uma base isolada com todos os pré-requisitos necessários
às jornadas desta ordem.

Inclua entidades, unidades, usuários operacionais, classificações,
documentos sintéticos, parâmetros e saldos iniciais coerentes.

A preparação deve ser repetível sem duplicar fatos.
Registre a origem dos dados e a natureza de ensaio no servidor.
Não inserir fatos diretamente para pular a operação que será testada.

Instalação de schema pode usar papel administrativo.
As operações do sistema devem usar o papel de runtime.

R3-002 — Dados para apresentação

Disponibilize a massa demonstrativa em ambiente de apresentação
explicitamente identificado e autorizado, preservando os dados atuais.

Não é necessário movimentar uma base oficial para provar uma função.
Se o servidor publicado hospeda demonstração, isso não dispensa
confirmar o destino e a autorização antes de carregá-lo.

Não reclassificar uma base oficial como demonstração para liberar testes.

3. CAMINHOS POSITIVOS QUE A R2 NÃO EXECUTOU

R3-003 — Captura do projeto da LOA

Prepare as declarações de ações, programas e unidades no ensaio.
Crie uma proposta com valores e capture sua versão pela tela.

Prove os vínculos com as linhas de origem e que ajustes posteriores
não modificam a versão capturada.

R3-004 — Comparativo das emendas

Use uma versão capturada e emendas com valores.
Exercite separadamente aprovada, rejeitada e pendente.

Confira projeto, efeito das emendas, valor esperado, valor atual
e outros ajustes. Não encerrar pelo caminho “sem versão salva”.

R3-005 — Dispensação com estoque

Prepare recebimento válido de medicamento e estoque por lote.
Dispense pela tela usando profissional autorizado da unidade.

Confira quantidade, lote, destinatário, documento, saldo e efeito
contábil aplicável. Não utilizar dados reais de pacientes.

R3-006 — Recusa de lote vencido

Exercite pela tela com estoque existente.
Confira que não houve saída física nem lançamento.

R3-007 — Perda farmacêutica

Registre perda pela tela com quantidade, motivo e destino.
Confira estoque e razão.

R3-008 — Sobra farmacêutica

Registre sobra pela tela e confira a origem do custo utilizado.
Sem base de valorização válida, não inventar custo para concluir.

4. CORREÇÕES DE INTEGRIDADE

R3-009 — Estorno de dispensação

Construir a correção auditável da dispensação.
Distinguir cancelamento do registro incorreto de devolução física.

O sistema não pode devolver automaticamente ao estoque disponível
um medicamento sem conferir se a devolução permite reaproveitamento.

Preservar o original e impedir estorno repetido.

R3-010 — Mudança do depósito da farmácia

Definir vigência e tratamento de estoque, documentos e inventários
em andamento. Não transferir estoque por simples troca de vínculo.

Histórico deve continuar apontando para o depósito utilizado no fato.

R3-011 — Concorrência nos movimentos patrimoniais

Mapear os movimentos que disputam o mesmo bem.
Aplicar o protocolo adequado e testar combinações incompatíveis,
incluindo transferência e baixa.

Não copiar uma trava sem conferir ordem, estado e demais escritores.

R3-012 — Ajuste do inventário do almoxarifado geral

Expor a capacidade já criada para a farmácia no contexto adequado
do almoxarifado, reutilizando o motor.

Contagem, diferença, autorização e ajuste devem ser rastreáveis.
Testar movimentação concorrente e impedir aplicação repetida.

R3-013 — Categoria ACC

Pesquisar a regra oficial aplicável e corrigir o modelo se necessário.
Não tratar ACC automaticamente como outra categoria.

Conferir validade temporal na ordem e no abastecimento.

5. CAPACIDADES AINDA AUSENTES

R3-014 — Prévia de retenção na liquidação — V39-027

Construir previsão/memória vinculada à liquidação.
O pagamento deve reaproveitar e revalidar os dados sem duplicar
retenção ou lançamento.

Separar previsão de reconhecimento efetivo.

R3-015 — Transcrição manual de extrato — V39-029

Construir entrada com documento de suporte, origem, autoria e revisão.
Distinguir linha transcrita de linha obtida por integração bancária.

Permitir ensaio sem tornar qualquer valor digitado prova bancária
oficial por padrão.

R3-016 — Realizáveis de natureza ativa — V39-030

Construir o modelo configurável, constituição, baixa, saldo e estorno.
Separar ativo de consignação de terceiro.

Usar parâmetros de ensaio onde faltarem decisões municipais;
não criar contas oficiais fictícias nem duplicar motores existentes.

R3-017 — Referência externa no empenho — V39-033

Registrar sistema de origem, identificação, documento e condição
de conferência.

Não apresentar uma referência declarada como protocolo confirmado.
Manter o vínculo interno quando ele existir.

R3-018 — Tanque próprio — V39-068

Construir cadastro, capacidade, recebimento, estoque, abastecimento
interno e inventário, com unidades de medida coerentes.

Abastecimento deve consumir estoque uma única vez.
Separar o fluxo de abastecimento em posto externo.

6. INTEGRAÇÕES INTERNAS QUE AINDA ESTÃO INCOMPLETAS

R3-019 — Solicitação de compra até o processo — V39-039

Consolidar demandas preservando itens, quantidades e unidades
solicitantes. Ligar ao processo sem duplicar consumo da reserva.

R3-020 — Pesquisa de preços — V39-040

Completar método, tipo de fonte, documento e memória do resultado.
Não reduzir a pesquisa a uma média sem origem verificável.

R3-021 — Custos da folha — V39-056

Apropriar custos pelos vínculos e critérios vigentes.
O total apropriado deve reconciliar com a base de custo escolhida.

Sem atribuição, mostrar parcela não atribuída; não ratear silenciosamente.

R3-022 — Informe farmacêutico derivado — V39-072

Derivar a posição mensal dos movimentos operacionais quando esse
modo estiver adotado.

Preservar informes anteriores e distinguir importação histórica
de posição calculada. Não somar as duas fontes em duplicidade.

R3-023 — Preparação do SIOPE — V39-086

Usar o material oficial já disponível para construir correspondências
versionadas e prévia.

Se faltar uma tabela específica, nomear exatamente qual e bloquear
somente o resultado dependente dela. Não manter toda a frente parada.

7. JORNADAS EXISTENTES QUE PRECISAM SER COMPLETADAS

R3-024 — Encerramento anual — V39-036

Preparar exercício isolado com fatos suficientes.
Operar encerramento e abertura pela tela.
Incluir anulação parcial e conferir os restos e os saldos de destino.

R3-025 — Convênio — V39-076

Operar ingresso, vínculo à arrecadação, aplicação e prestação.
Conferir impedimento de usar a mesma receita indevidamente em
mais de um instrumento.

R3-026 — Patrimônio — V39-060 a 062

Manter evidência separada para incorporação, transferência,
depreciação e baixa.

Operar cada uma com dados e conferir origem, responsabilidade,
valor e razão. A tela abrir não conclui o item.

R3-027 — Folha até tesouraria — V39-055

Reaproveitar a evidência 5/5 da R2 onde ela se aplica.
Identificar exatamente o que cobriu.

Completar ordem de pagamento, retorno e tratamento de rejeição
se ainda faltarem; não repetir toda a jornada sem necessidade.

8. RELATÓRIOS E USO POR PERFIL

R3-028 — PDF — V39-092

Inventariar famílias documentais e verificar uma a uma.
Cabeçalho, ente/UG, período, totais, paginação, rodapé e assinatura
aplicável devem corresponder aos dados do documento.

Corrigir cortes, sobreposições e páginas vazias indevidas.

R3-029 — CSV — V39-093

Conferir arquivos com leitor independente.
Preservar precisão, caracteres, colunas e filtros.
Exportar o conjunto solicitado, não apenas a página visível.

R3-030 — Jornadas por perfil — V39-094

Operar com planejador, comprador, agente de contratação, fiscal,
almoxarife, patrimônio, RH, contador e tesoureiro conforme aplicável.

Conferir acesso permitido e recusa pertinente.
Administrador não substitui essas provas.

9. CONTINUIDADE E FECHAMENTO

Após estas unidades, continuar os itens tratáveis da matriz V39.
Não declarar encerrado enquanto “existe” esconder função faltante.

Não rodar suítes ou gates completos.
Executar testes dirigidos, consumidores afetados e percursos das
operações alteradas, com papel de runtime.

Use contraprovas nas regras de risco; falha por ambiente ou ausência
de teste não conta como acusação da regra.

Sem textos de TR, códigos internos ou narrativa de engenharia no
frontend. Manter rótulos claros e mensagens úteis ao operador.

Publicação segue a autorização direta vigente na sessão.
Não inferir autorização para transmissão fiscal ou pagamento real.

Relatório final em português, uma linha por unidade, separando:
construído / testado com runtime / caminho positivo percorrido /
recusa percorrida / instalado / validado externamente.

Não chamar “percurso completo” a uma execução que terminou em estado
vazio ou que não chegou ao efeito pretendido.

Falta de dado sintético tratável na base de ensaio deve virar tarefa
de preparação e ser resolvida nesta rodada.
