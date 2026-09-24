# V12 — Consolidação e construção integrada do gestao-publica

> Pedido como veio, em 2026-09-24. Base relatada: `c9e3423`.
> Registrado antes de começar, conforme `CLAUDE.md`.

CONTINUIDADE — CONSOLIDAÇÃO E CONSTRUÇÃO INTEGRADA DO GESTAO-PUBLICA

O usuário determinou:
- unificar as worktrees em uma única árvore de trabalho;
- continuar construindo o sistema completo conforme os TRs;
- manter tudo integrado para a futura publicação;
- validar alterações e impactos diretos, sem suítes/gates completos.

Base relatada: c9e3423. Confirme o estado efetivo.
Esta ordem autoriza a consolidação local e a continuidade de construção.
Não autoriza push, publicação ou operações externas reais.

1. ORGANIZAÇÃO: DOIS AGENTES, UM ESCRITOR

Gerente full stack:
único escritor da árvore, schema, migrations, código, documentação,
staging e commits. Implementa, integra e executa verificações.

Auxiliar:
leitura do código e TR, levantamento de lacunas, contratos de tarefa,
revisão de diff e resultados. Não altera arquivos nem disputa o índice.
Entregue suas conclusões ao gerente para implementação.

Não criar subagentes adicionais nem novas worktrees por rotina.
Uma execução pesada por vez.

2. CONSOLIDAR AS WORKTREES SEM PERDER TRABALHO

Inventariar as worktrees existentes:
caminho, branch, HEAD, estado do diff, arquivos não rastreados,
commits exclusivos e finalidade.

Escolher a árvore principal atual como destino, salvo impedimento
concreto. Não usar a cópia ENT12 como substituta da linha atual.

Classificar cada worktree:
A. Apenas cópia de percurso, sem trabalho exclusivo.
B. Contém alterações já incorporadas.
C. Contém trabalho exclusivo ainda pertinente.
D. Contém trabalho divergente que exige comparação.

Para C/D, preservar o conteúdo antes de qualquer remoção.
Comparar comportamento e contratos, não apenas hashes de commits.
Integrar seletivamente o que falta, adaptando à implementação atual.
Não reaplicar funcionalidade equivalente nem trazer schema antigo
por merge indiscriminado.

Para a linha Windows, se estiver acessível:
reconciliar especialmente correções do importador, roteiros,
retomada e apresentação contra a implementação atual.
Se não estiver acessível, registrar a pendência sem fingir integração.

Após comprovar que não há conteúdo exclusivo sem destino:
remover as worktrees redundantes pelo procedimento normal do Git.
Não usar remoção forçada para ignorar arquivos ou alterações.
Preservar referências necessárias à recuperação.

Manter stash e os três scripts do operador intactos.
Não apagar os 26 bancos nesta operação: bancos não são worktrees.
Identificar quais bancos pertencem aos ambientes ainda utilizados.

Resultado: uma árvore ativa de desenvolvimento, com trabalho integrado
e divergências remanescentes explicitamente registradas.

3. FECHAR AS LACUNAS DA UNIDADE ATUAL

Recuperar no checkpoint a descrição exata dos quatro itens:
Ibema, segunda complementar, instrução de validate no CLAUDE.md
e apresentação de dinheiro.
Não adivinhar o conteúdo pelo título.

Resolver, em incrementos:

A. Mensal complementar
Distinguir uma duplicata indevida de uma nova complementar legítima
após outra já fechada. Confrontar o requisito e o contrato existente.
Quando cabível, recalcular a diferença contra o acumulado reconhecido,
sem relançar valores anteriores.

Corrigir APURADO-A-REPOR-ENCOBERTO-POR-FOLHA-SEM-VINCULOS:
a ordem das guardas deve apresentar o motivo verdadeiro e preservar
a pendência financeira, sem transformar diferença negativa em crédito.

B. Seleção de cálculo
Executar o percurso ainda pendente com seleção explícita:
selecionar -> calcular -> conferir abrangência e memória -> fechar.
Exercitar a recusa de exclusão involuntária de vínculos já calculados
e a decisão explícita de recompor a seleção.

Construir SELECAO-NO-13-NAO-CONSTRUIDA reutilizando o contrato comum.
Conferir a relação entre seleções das parcelas, elegibilidade ao
abatimento e histórico individual. Não copiar cegamente a seleção
mensal nem permitir omissão silenciosa de adiantamento pertinente.

C. Cadastro e consulta
Executar /pessoal/funcoes com cadastro, vínculo, vigência e consulta.
Conferir a ponta de entrada de centro de custo e os consumidores
afetados. Formatar dinheiro na interface/documentos preservando
Decimal e precisão no domínio.

D. Instrumentos diretamente relacionados
Resolver o censo t5c vermelho pela causa concreta.
Corrigir a instrução de validate para o comando efetivo do projeto,
preservando código de saída e leitura do resultado.
Não ampliar isso para campanha geral de instrumentação.

4. CONTINUAR A CONSTRUÇÃO DO ECOSSISTEMA

A consolidação não encerra a rodada.
Depois das lacunas acima, continuar pela próxima capacidade executável.

Usar o catálogo existente para distinguir:
- exigência literal;
- desenho de engenharia;
- regra dependente de fonte;
- melhoria adicional.

Manter uma fila integrada das frentes:
- pessoal, modalidades restantes da folha e eSocial;
- planejamento, contabilidade, receita, despesa e tesouraria;
- tributação, arrecadação, cobrança e dívida;
- compras, contratos, fiscalização e obras;
- almoxarifado, patrimônio e frota;
- atendimento, processos, portais e transparência;
- fiscalização tributária, licenciamento e jurídico;
- serviços setoriais previstos nos TRs;
- integrações, implantação e sustentação.

Não reiniciar o levantamento inteiro nem abrir todos os módulos
como esqueletos. O auxiliar prepara a próxima unidade enquanto
o gerente conclui a atual.

Na folha, identificar nominalmente os tipos ainda ausentes entre
os nove exigidos e escolher a próxima modalidade com dependências
disponíveis. Não inferir conclusão pela contagem "quatro de nove".

Se uma unidade depender realmente de fonte ou acesso externo,
registrar o ponto exato e avançar outra unidade independente.
Ausência de modelo ou tela é trabalho de construção, não bloqueio
externo.

5. DEFINIÇÃO DE ENTREGA

Cada capacidade deve chegar a:
entrada encontrável -> dados e seleção -> validação/autorização ->
motor -> efeito persistido -> consulta/documento -> correção pertinente.

Reutilizar Pessoa, ledger, comandos, documentos e demais motores.
Não criar cadastros ou saldos paralelos para acelerar uma frente.

Manter migrations ordenadas, permissões coerentes e navegação
integrada na árvore única. Não misturar dados de outros projetos.

Validar somente o incremento e os consumidores afetados:
regra com resultado independente, persistência/concorrência pertinente,
recusa de acesso e percurso da operação alterada.
Sem suíte completa, portão ou repetição global dos percursos.

6. RELATÓRIO DE CONTINUIDADE

Informar:
- árvore única adotada;
- trabalho exclusivo recuperado e worktrees removidas;
- divergências ainda não reconciliadas;
- funcionalidades novas que o operador consegue executar;
- evidências e limitações por capacidade;
- próxima unidade já selecionada.

Não declarar sistema completo por terminar a fila local de defeitos.
Não parar somente na consolidação se houver condições de construir.
Ao atingir o limite da sessão, deixar checkpoint preciso para retomada,
sem processos pesados órfãos.
