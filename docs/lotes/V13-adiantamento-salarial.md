# V13 — Construir o adiantamento salarial

> Pedido como veio, em 2026-09-25. HEAD relatado: `9654a14`, confirmado efetivo.
> Registrado antes de começar, conforme `CLAUDE.md`.

Continue o gestao-publica na árvore única:
 /Users/winnervinicius/Developer/gestao-publica
HEAD relatado: 9654a14. Confirme o estado efetivo.

Objetivo: construir o adiantamento salarial já levantado.
Não reiniciar o planejamento geral nem abrir outra campanha de guards.

1. RECUPERAR CONDIÇÕES DE TRABALHO

Antes de iniciar agente auxiliar, build ou teste, medir:
processos com maior consumo, pressão de memória, atividade de swap
e consumo dos containers.

Não usar somente "memória livre" como diagnóstico.
Não repetir a mesma execução pesada nas condições que já travaram.

Inspecionar os recursos do próprio gestao-publica.
Pode encerrar processo comprovadamente próprio, dispensável e sem
trabalho ativo. Não parar outros produtos, Docker inteiro ou o banco
necessário à sessão. Se a propriedade/finalidade for incerta, não parar.

Os 26 bancos são bancos persistidos, não 26 processos independentes.
Não apagá-los como tentativa de liberar RAM.

Trabalhar inicialmente com um único agente escritor.
O auxiliar só entra em leitura/revisão se houver capacidade.
Uma execução pesada por vez.

Se a máquina continuar inviável, informar qual recurso impede o avanço.
Preservar o checkpoint e preparar a transferência sanitizada da linha
atual para o Windows, se esse for o ambiente disponível para continuar:
histórico Git, commits locais e instruções de ambiente, sem credenciais.
Não substituir a linha atual pela antiga ENT12.
Não fazer push nem presumir que a transferência já aconteceu.

2. CONSTRUIR A UNIDADE JÁ SELECIONADA

Ler varredura-v12-adiantamento-salarial.md e o checkpoint atual.
Confirmar no código as dependências identificadas e implementar
a menor jornada completa:

configurar -> selecionar vínculos -> calcular -> revisar ->
fechar -> emitir documento -> integrar aos atos financeiros cabíveis ->
reconciliar com a folha posterior.

Reutilizar os motores, comandos, autorização e documentos existentes.
Entregar acesso encontrável pela navegação da folha.

Parâmetro ausente deve impedir a efetivação correspondente, com
orientação clara. Não preencher percentual, base ou regra municipal
silenciosamente.

As duas práticas levantadas podem ser opções suportadas pelo produto;
não presumir que esgotam todas as regras admissíveis.
Cada opção precisa de semântica definida, fundamento aplicável,
vigência e aprovação. Regra não suportada gera pendência explícita.

3. PRESERVAR AS DISTINÇÕES FINANCEIRAS

Separar cálculo, fechamento, apropriação, liquidação e pagamento.
Definir qual fato permite reconhecer o adiantamento na folha posterior,
qual valor será compensado e como corrigir cancelamento ou estorno.

Não chamar fechamento de pagamento.
Não compensar duas vezes nem deixar obrigação já reconhecida desaparecer.

Tratar expressamente as duas interações levantadas:
- adiantamento não pode bloquear indiscriminadamente a complementar;
- vínculo entre parcelas do 13º não pode ser reutilizado como bloqueio
  geral do mês.

Preservar snapshots e memória histórica.
A alteração do parâmetro não reescreve cálculo fechado.

4. VERIFICAR APENAS O INCREMENTO

Executar, conforme a capacidade da máquina:
- tipos dos projetos afetados;
- cálculo com expectativa independente;
- parâmetro ausente;
- repetição e correção pertinente;
- reconciliação com mensal/complementar;
- isolamento em relação ao 13º;
- percurso da nova modalidade pela interface.

Usar banco sintético dedicado já apropriado, quando disponível.
Sem suítes completas, fuso completo, portão ou campanha de mutações.

A prova pendente do instrumento de seleção permanece registrada.
Não repetir seus 31 passos sem mudança ou risco concreto.
Se a construção alterar diretamente esse contrato, verificar então
o trecho afetado e sua recusa.

5. CONCLUIR COM RESULTADO DE PRODUTO

Relatar primeiro o que o operador consegue abrir e executar.
Separar implementado, testado com banco e percorrido na interface.
Não aumentar a cobertura do catálogo apenas porque nasceu outro enum.

Registrar comandos efetivos, resultado e evidência suficiente.
Correções de instrumentos entram somente quando impedirem confiar
na verificação desta unidade.

Preservar stash, scripts do operador e referências de recuperação.
Sem publicação, push ou operações financeiras externas.
