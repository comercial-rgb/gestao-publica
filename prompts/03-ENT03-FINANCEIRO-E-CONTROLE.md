# ENT03 — completar o financeiro, abrir a tesouraria e entregar o controle interno

> Executar depois do gate de ENT02. Leia antes: `PROMPT-MESTRE-IMPLEMENTACAO.md`,
> `MAPA-DE-LACUNAS.md`, `ESTADO-EXECUCAO.md` e, no destino, os `MODULO.md` de
> M01, M02, M03, M04, M05, M06, M07, M08, M12 e M14. Leia o `MODULO.md` antes do
> código: no `siafic-cg` ele frequentemente explica por que o código não é o que
> se espera.

## 1. Situação de partida

Esta é a frente com mais código pronto e, por isso, a que mais corre risco de
falso positivo. O mapa de lacunas classifica 5.9 e 5.10 como base forte — 285
cláusulas com módulo no disco — mas o handoff registra que **a suíte do
`siafic-cg` nunca foi executada nesta máquina**.

Ordem obrigatória do lote: **caracterizar, depois ampliar.** Não escreva
funcionalidade nova em M01, M05 ou M12 antes de ter a suíte desses módulos
verde e o comportamento atual registrado.

Duas afirmações do handoff que precisam ser tratadas como fato de projeto:

- **M09 tesouraria existe só como schema `.prisma`, sem módulo.** Conciliação
  bancária, borderô, lotes de pagamento e movimentação bancária precisam ser
  verificados um a um: parte pode estar dentro de M05, M07 ou M17. Complete a
  lacuna sem criar um segundo caminho para os mesmos fatos.
- **M16 não é controle interno administrativo.** É autenticação, autorização e
  auditoria técnica. As 14 cláusulas de 5.11 são um módulo novo.

## 2. Escopo

### 2.1 Caracterização — primeiro passo, sem exceção

1. Executar a suíte de M01, M04, M05, M06, M07, M08, M12 e M14 e registrar o
   resultado real, inclusive falhas.
2. Registrar em `docs/caracterizacao/` o comportamento atual dos pontos que este
   lote vai tocar: saldo de dotação por data, geração de lançamentos por evento,
   regra de estorno por perna, ordem cronológica, encerramento de exercício.
3. Confirmar os quatro invariantes com teste que os viole de propósito e espere
   rejeição: dinheiro sem `Decimal`, `UPDATE` em lançamento, entrada duplicada
   sem idempotência, lançamento desbalanceado por subsistema.
4. Confirmar o guard de subsistema contra o primeiro dígito do PCASP. Ele já
   revelou 85 falhas em 12 arquivos quando entrou — trate qualquer falha nova
   como fixture errada até prova em contrário, não como guard errado.

Se a caracterização encontrar falha, ela é o primeiro item do lote. Não construa
sobre suíte vermelha e não silencie teste com `skip`.

### 2.2 Tesouraria e conciliação — a maior lacuna do bloco financeiro

- Contas bancárias com vínculo de uma ou mais fontes de recurso, observado em
  toda movimentação.
- Movimentação bancária: depósito, transferência, resgate e aplicação, com
  controle de saldo **por fonte** no momento da operação e lançamento contábil
  simultâneo, sem lapso.
- Lote de pagamento com data de vencimento, composto por liquidações e notas
  extraorçamentárias.
- Borderô: geração, controle de assinaturas exigidas antes do envio, envio,
  retorno do banco e baixa. O envio real depende de convênio; sem configuração,
  o estado é indisponível com motivo, nunca sucesso local.
- Conciliação bancária com importação OFX e OFC — verificar `packages/ofx` antes
  de escrever parser —, pendências criadas manualmente e automaticamente,
  conciliação parcial, cópia de pendências não baixadas para o período seguinte,
  seleção múltipla com soma e consulta de períodos anteriores.
- Ordem cronológica de pagamento: confirmar o que M06 já garante e completar o
  que faltar. Nenhuma rota alternativa pode contornar a regra.

### 2.3 Diárias, adiantamentos e prestação de contas

- Solicitação integrada a roteiro de processo — usa o protocolo entregue em ENT02.
- Emissão automática do empenho ao fim do fluxo aprovado.
- Prestação de contas com lançamentos contábeis na concessão e na prestação.
- Prestação de contas online pela entidade beneficiária, com usuário próprio,
  envio de documentos digitalizados, solicitação de revisão pelo município,
  aprovação e conclusão com lançamento automático.
- Controle de prazo com situação por faixa e bloqueio de novo adiantamento a
  quem está em atraso.

### 2.4 Cadastros financeiros que faltam

Convênios de repasse, precatórios, dívida fundada, parcerias público-privadas,
consórcios, cadastro de obras e multas de trânsito. Todos com o mesmo padrão:

- Vínculo automático com os empenhos correspondentes, sem exigir a conta na
  movimentação depois de configurada no cadastro.
- Movimentações próprias com lançamento contábil simultâneo — atualização,
  cancelamento, correção, transferência de longo para curto prazo, acréscimo de
  juros, baixa por pagamento do tribunal.
- Anexos e consulta dos empenhos relacionados.
- Cadastro de obras com localização, tipo, conta de incorporação, contrato,
  licitação, medições, situação e percentual executado, publicável na
  transparência.

Não modele isto como tabela genérica com campo JSON. Cada um tem regra própria e
efeito contábil distinto.

### 2.5 Planejamento — completar 5.9

- Audiências públicas com solicitações da comunidade, bairro, contato,
  órgão responsável, situação e anexos.
- Emendas parlamentares em PPA, LDO e LOA: cadastro com autor e texto jurídico,
  bloqueio de dotações que não podem receber emenda, e sancionamento total,
  parcial ou reprovação.
- Prévia de alteração orçamentária que bloqueia o valor na dotação a anular,
  imprime decreto ou projeto de lei e, ao ser efetivada, gera a alteração e os
  lançamentos sem redigitação.
- Cotas de despesa por período configurável, com cálculo por realizado do ano
  anterior, média de três anos, divisão por doze ou percentual informado;
  atualização automática nas alterações; remoção de cota não usada em mês
  fechado e redistribuição nos meses abertos.
- Contingenciamento por percentual, geral ou por dotação, com liberação.
- Metas de arrecadação e cronograma de desembolso mensais por fonte e entidade.
- Renúncia de receita com compensação.
- Compatibilização PPA↔LDO↔LOA e rotina de consistência por peça.
- Versionamento de peça orçamentária, com consultas e relatórios por versão.

### 2.6 Controle interno — módulo novo

- Auditoria com auditor, responsável, processo digital vinculado e instruções
  normativas.
- Checklist configurável por grupos e itens, com respostas e enquadramento;
  seleção parcial de itens ao instaurar; duplicação de checklist.
- Vínculo a órgão, unidade e centro de custo, com visibilidade por tipo.
- Agendamento com notificação, monitoramento e cancelamento justificado.
- Irregularidades com parecer e providência; instauração de auditoria a partir
  de irregularidade apontada em evento.
- Relatório circunstanciado com quadros gerenciáveis e anexos.
- Repositório de arquivos por ano, tipo, título, descrição e busca.

### 2.7 Assinatura no fluxo financeiro

Empenho, liquidação, ordem de pagamento, nota extraorçamentária e comprovante de
pagamento entram na fila de assinaturas construída em ENT02. O documento só se
conclui com todos os signatários configurados. Consulta gerencial deve permitir
filtrar o que foi assinado.

### 2.8 Consulta externa do fornecedor

Serviço autenticado onde o fornecedor consulta empenhos emitidos, pagos, a pagar,
retenções e saldos. É a primeira fatia do portal de serviços e nasce aqui, não
em ENT09 — mas usando a mesma base de dados, sem tabela paralela.

## 3. O que não fazer neste lote

- Não reescrever o ledger para acomodar uma funcionalidade nova. Se um requisito
  parece exigir `UPDATE` em lançamento, o requisito foi lido errado ou o desenho
  está errado.
- Não recarimbar valor único nas pernas de um estorno. Pagamento com retenção
  tem pernas de valores diferentes; o caixa leva o líquido.
- Não tratar estorno parcial com um booleano.
- Não declarar o designer de relatórios concluído porque M12 emitiu um PDF.
- Não converter o adapter SAGRES do TCE-PB em conector de outro tribunal por
  troca de nome. Preserve os adapters PB e BA; conector novo se constrói contra
  o contrato do estado correspondente, com documento oficial e versão.
- Não colocar chamada a banco, tribunal ou HSM dentro de transação longa.

## 4. Testes mínimos do lote

Além da regressão de ENT00, ENT01 e ENT02:

1. Suíte de M01, M05 e M12 verde, com resultado registrado por comando e data.
2. Violação deliberada de cada um dos quatro invariantes é rejeitada.
3. Movimentação bancária altera saldo por fonte e gera lançamento na mesma unidade de trabalho; falha no meio reverte tudo.
4. Pagamento em lote respeita ordem cronológica; rota alternativa não a contorna.
5. Borderô sem as assinaturas exigidas não é gerado nem enviado.
6. Retorno bancário baixa somente os registros correspondentes; retorno repetido não duplica baixa.
7. Conciliação parcial oculta o conciliado e mantém o saldo pendente correto; pendência não baixada é copiada para o período seguinte.
8. Importação de OFX com o mesmo arquivo duas vezes é idempotente.
9. Adiantamento a beneficiário com prestação de contas em atraso é bloqueado.
10. Prestação de contas online conclui e gera lançamento; revisão solicitada devolve o estado corretamente.
11. Convênio, precatório, dívida fundada e PPP geram lançamento na movimentação e listam os empenhos relacionados.
12. Emenda sancionada parcialmente altera apenas as dotações sancionadas; dotação bloqueada não recebe emenda.
13. Prévia de alteração bloqueia o valor na dotação a anular e desbloqueia ao efetivar, sem duplicar lançamento.
14. Cota de despesa é atualizada na alteração orçamentária; cota não usada em mês fechado é redistribuída somente para meses abertos.
15. Contingenciamento reduz a disponibilidade e a liberação a restitui, com rastro.
16. Compatibilização replica a alteração do PPA para LDO e LOA e a rotina de consistência aponta divergência real.
17. Versão de peça orçamentária não altera relatório emitido por outra versão.
18. Auditoria de controle interno instaurada a partir de irregularidade preserva o vínculo e gera o relatório circunstanciado.
19. Documento financeiro só se conclui com todos os signatários; assinatura parcial mantém o estado pendente.
20. Fornecedor consulta apenas os próprios empenhos, sem acesso a dados de terceiros.
21. Período fechado bloqueia toda escrita por API, worker e rota alternativa.
22. Nenhum rótulo de conformidade aparece em tela, documento ou notificação.

## 5. Definição de concluído

- Suíte pré-existente verde, com evidência de execução.
- Uma despesa percorre empenho, liquidação com retenção, lote de pagamento,
  borderô, retorno bancário e conciliação, pela interface, com saldos e partidas
  conferidos.
- Um adiantamento percorre solicitação, aprovação, empenho automático, prestação
  de contas online e conclusão contábil.
- Uma alteração orçamentária percorre prévia, decreto, efetivação e reflexo em
  cotas.
- Uma auditoria de controle interno percorre checklist, irregularidade, parecer e
  relatório circunstanciado.
- `ESTADO-EXECUCAO.md` atualizado com código, gate, comandos, resultados,
  migrações aplicadas, SQL manual aplicado, pendências e próximo lote.
