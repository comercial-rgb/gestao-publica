# ENT02 — capacidades transversais exercitadas por documentos reais

> Executar somente depois do gate de `01-CONTEXTO-E-PRIMEIRA-ENTREGA.md`.
> Leia antes: `PROMPT-MESTRE-IMPLEMENTACAO.md`, `MAPA-DE-LACUNAS.md`,
> `ESTADO-EXECUCAO.md`, e no repositório de destino `PROJETO.md`,
> `packages/contracts/`, `modules/M16/MODULO.md`, `components/MODULO-UI.md`.

## 1. Por que este lote existe

A frente ENT02 do prompt mestre reúne pessoas, formulários, anexos, documentos,
relatórios configuráveis, assinatura, notificações, protocolo, comunicações,
ajuda e suporte. O mapa de lacunas mostra que protocolo (75 cláusulas) e
comunicação interna (53) estão ausentes por inteiro e são **dependência** de
compras, construção civil, serviços públicos, ouvidoria e do portal do cidadão.

Este lote entrega essas capacidades **em corte vertical**, cada uma exercitada
por um documento que existe de verdade no sistema — não como biblioteca abstrata
esperando o primeiro consumidor.

Regra que governa o lote: **nenhuma capacidade é declarada pronta sem um caso de
uso real do produto consumindo-a e um teste cobrindo esse consumo.** Um serviço
de anexos sem tela que anexa não conta. Um designer de relatórios sem relatório
gerado por ele não conta.

## 2. Escopo

### 2.1 Processo digital e protocolo

Cadeia mínima navegável: abertura pelo servidor e pelo requerente externo →
tramitação entre setores → complemento → parecer → readequação pelo requerente →
encerramento → arquivamento → reabertura.

- Assunto e subassunto com roteiro configurável e prazo por etapa.
- Numeração sequencial reiniciada por exercício, com o exercício resolvido pelo
  contexto autorizado.
- Requerente do cadastro único, requerentes adicionais e requerente anônimo
  quando o assunto permitir.
- Situação com indicação visual de prazo, prioridade e sigilo. Processo sigiloso
  só é visível aos envolvidos.
- Histórico em linha do tempo com autor, setor, instante e o que foi assinado.
- Apensamento com efeito real sobre a movimentação conjunta.
- Anexos aceitos nos formatos declarados pela cláusula, preservados na
  tramitação, com download individual e em lote.
- Taxa vinculada ao assunto quando aplicável, com bloqueio de tramitação
  configurável — o bloqueio deve existir no caso de uso, não apenas no botão.

Não implemente o motor de fluxograma visual completo neste lote. Implemente o
roteiro configurável com etapas, prazos e responsáveis, e registre o fluxograma
gráfico como lote posterior identificado.

### 2.2 Comunicação interna

Memorando, ofício e circular, com tipos criáveis pela entidade e privilégio por
setor.

- Caixas de entrada, saída, rascunhos, favoritos e arquivados, gerenciadas sem
  troca de tela.
- Numeração por ano, tipo e setor.
- Resposta restrita aos setores já envolvidos; encaminhamento aberto aos demais.
- Circular não aceita resposta.
- Aos cuidados de um usuário, com filtro e destaque próprios.
- Marcação de leitura com consulta de quem visualizou, quando e por qual origem.
- Assinatura eletrônica configurável por tipo de comunicado, nos termos da
  Lei 14.063/2020 — simples, avançada ou qualificada, obrigatória ou opcional.
- Relacionamento com processo digital e com processo judicial.

### 2.3 Pessoas, papéis e campos adicionais

Amplia T02 da primeira entrega, não a substitui.

- Papéis que o produto passa a exigir: contribuinte, fornecedor, servidor,
  requerente, tabelião, profissional externo. Cada papel com vigência e dados
  próprios.
- Dados bancários e dados sensíveis com permissão separada da leitura cadastral.
- **Campos adicionais de verdade**: definição por entidade e por cadastro, com os
  tipos exigidos pela cláusula 5.29.7 — valor, lista, alfanumérico, data, lista
  dinâmica, hora e booleano. Persistidos, filtráveis na listagem, exibidos no
  detalhe, versionados e auditados.
- Um campo de observação fixo não satisfaz esta capacidade. Se o incremento
  entregar menos, registre `PARCIAL` com o motivo.

### 2.4 Anexos e documentos

- Autorização de leitura e escrita **por registro**, não por módulo.
- Tipo e tamanho validados no servidor; integridade verificável; sem exposição
  por URL pública adivinhável.
- Origem do arquivo: upload, digitalização e captura por câmera, quando a
  cláusula do domínio consumidor exigir.
- Documento assinado preserva o original e a assinatura verificável em separado.

### 2.5 Assinatura

- Fila de assinaturas: um documento assinado segue para o próximo signatário,
  que recebe notificação dentro do sistema.
- Configuração de quem assina o quê, por tipo de documento e por entidade.
- Assinatura ICP-Brasil e assinatura eletrônica avançada tratadas como modos
  distintos, com o modo visível no documento resultante.
- **Custódia A1 em HSM é adaptador isolado.** Sem provedor definido, o modo fica
  indisponível com motivo declarado. Não armazene A1 no banco e não chame isso de
  HSM. Não bloqueie o restante do lote por essa dependência.

### 2.6 Notificações

Um serviço, três canais: dentro do sistema, e-mail e — quando o aplicativo
existir — push. Eventos deste lote que devem notificar de verdade: tramitação
recebida, parecer solicitado, readequação pedida, documento aguardando
assinatura, comunicado recebido, prazo próximo do fim.

### 2.7 Relatórios configuráveis

Este é o ponto onde o handoff exige mais cuidado. **M12 entrega os relatórios
legais calculados; não entrega o designer.** São coisas separadas e as duas são
exigidas.

Entregue neste lote a fundação do designer, com uso real:

- Copiar um modelo existente sem destruir o original.
- Visibilidade pública ou restrita ao autor.
- Versão e vigência do modelo.
- Execução em segundo plano com notificação ao término e abertura do resultado.
- Distribuição de modelo para outra entidade autorizada, com permissão própria.
- Campos calculados por gramática segura: funções permitidas, limite de execução,
  `Decimal`, sem `eval` e sem SQL livre do usuário.

Prove com pelo menos um relatório operacional do próprio lote — por exemplo, a
relação de processos por assunto e situação — gerado pelo designer, não com um
PDF fixo. Não declare a capacidade completa por causa de uma emissão do M12.

### 2.8 Ajuda e suporte

- Ajuda contextual por rota, editável, sem abrir chamado.
- Chamados com número único, multi-entidade, anexos, histórico consultável pelo
  usuário, notificações e pesquisa de satisfação. Os níveis de severidade são
  dado de configuração, não texto fixo na tela.

## 3. Reaproveitamento obrigatório antes de escrever código novo

| Capacidade | Verificar primeiro | Se existir |
|---|---|---|
| Autenticação, autorização, auditoria | `modules/M16` | Estender, não recriar. Auditoria já é imutável — preserve |
| Emissão de documento e PDF | `lib/pdf`, M12 | Reutilizar o pipeline; o designer é camada acima |
| Contratos e dinheiro | `packages/contracts` | `Decimal` e helpers vêm daqui, sem exceção |
| Componentes de tela | `components/`, `MODULO-UI.md` | Seguir o design existente; não introduzir outra biblioteca de UI |
| Notificação e progresso assíncrono | `saas-municipal` (WebSocket, BullMQ) | Avaliar o padrão como referência. Não importe adapter Drizzle |
| Idempotência e outbox | M01, inbox/outbox com unique | Reutilizar o mecanismo, não inventar um segundo |

## 4. Contratos de rota propostos

Propostas a confrontar com as rotas reais; registre as efetivas no contrato
funcional. Navegação conforme o padrão do prompt mestre:
`/gestao/{entidade}/{exercicio}/{dominio}/{recurso}`.

| Operação | Contrato proposto |
|---|---|
| Abrir processo | `POST /api/v1/entidades/{e}/processos` |
| Tramitar | `POST /api/v1/processos/{id}/tramites` |
| Complementar, parecer, readequação | `POST /api/v1/processos/{id}/{movimento}` |
| Encerrar, arquivar, reabrir | `POST /api/v1/processos/{id}/{acao}` |
| Consulta externa por protocolo | `GET /api/v1/publico/processos/{numero}?verificador=` |
| Comunicado | `POST /api/v1/entidades/{e}/comunicados` |
| Responder, encaminhar, arquivar | `POST /api/v1/comunicados/{id}/{acao}` |
| Definição de campo adicional | `POST /api/v1/entidades/{e}/campos-adicionais` |
| Anexo | `POST /api/v1/anexos` com escopo de registro obrigatório |
| Solicitação de assinatura | `POST /api/v1/assinaturas` |
| Modelo de relatório | `POST /api/v1/relatorios/modelos` |
| Execução de relatório | `POST /api/v1/relatorios/execucoes` |

`GET` não produz transição de estado, em nenhuma destas rotas.

## 5. Testes mínimos do lote

Além da regressão de ENT00 e ENT01, que continua obrigatória:

1. Processo aberto no município A não é visível nem tramitável no B.
2. Tramitação para setor sem permissão é rejeitada no servidor, com botão oculto ou não.
3. Processo sigiloso não aparece em listagem, busca, relatório nem exportação de quem não é envolvido.
4. Anexo de um processo não é acessível por URL a quem não tem permissão no registro.
5. Anexo permanece acessível ao setor de origem depois da tramitação.
6. Bloqueio por taxa em aberto impede a tramitação pela API e por qualquer rota alternativa.
7. Apensamento faz os dois processos seguirem a movimentação; desapensar restabelece independência.
8. Numeração reinicia no exercício seguinte sem colidir com a do anterior.
9. Duas aberturas concorrentes não geram o mesmo número.
10. Circular não aceita resposta; resposta a memorando só oferece setores já envolvidos.
11. Consulta de leitura mostra usuário, instante e origem, sem expor segredo.
12. Campo adicional do tipo lista dinâmica persiste, filtra na listagem e aparece no histórico de alterações.
13. Campo adicional de uma entidade não vaza para outra entidade do mesmo município.
14. Documento assinado mantém o original recuperável e a assinatura verificável.
15. Segundo signatário recebe notificação real e o documento só conclui com todas as assinaturas exigidas.
16. Modo HSM indisponível retorna motivo explícito e não produz assinatura simulada.
17. Cópia de modelo de relatório não altera o original; modelo restrito não é visível a terceiros.
18. Relatório em segundo plano notifica ao terminar e o resultado corresponde aos filtros aplicados.
19. Campo calculado com expressão maliciosa é rejeitado pela gramática, sem acesso ao banco.
20. Chamado registra número único e a pesquisa de satisfação é gravada.
21. Recarregar cada tela após a operação encontra o dado persistido.
22. Nenhum rótulo de conformidade, número de cláusula ou identificador do catálogo aparece em tela, mensagem, notificação, PDF operacional ou nome de rota. Vocabulário de negócio — edital, licitação, pregão, contrato, termo de referência de uma compra — permanece disponível.

## 6. Definição de concluído

O lote encerra quando, no ambiente local:

- Um processo digital percorre abertura, tramitação, parecer, readequação pelo
  requerente, encerramento e arquivamento, pela interface, com dados persistidos
  e visíveis após recarga.
- Um comunicado percorre inclusão, resposta, encaminhamento, leitura registrada e
  arquivamento.
- Um cadastro de pessoa recebe campo adicional definido pelo usuário, anexo e
  assinatura, e exibe a linha do tempo no próprio detalhe.
- Um relatório operacional é produzido pelo designer, com modelo copiado,
  visibilidade definida e execução em segundo plano.
- Toda a suíte existente continua verde e os testes deste lote passam.
- `ESTADO-EXECUCAO.md` registra código, gate, comandos executados, resultados
  reais e o próximo lote.

Registre como pendência explícita, sem contorná-la: provedor de HSM, fluxograma
visual do processo, e qualquer capacidade entregue como `PARCIAL`.
