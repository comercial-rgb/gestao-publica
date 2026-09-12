# Instrução de continuação — construir as funcionalidades ausentes

> Cole o bloco da seção 2 no Claude Code depois que o gate de
> `01-CONTEXTO-E-PRIMEIRA-ENTREGA.md` estiver aprovado.
>
> Se ENT00 e ENT01 ainda não foram executados, execute-os primeiro. Esta
> instrução **não os substitui**: ela continua o pacote a partir de ENT02.

---

## 1. O que este complemento acrescenta ao pacote

Três arquivos, para colocar dentro de `gestao_publica_execucao/`:

| Arquivo | Onde colocar | Para que serve |
|---|---|---|
| `MAPA-DE-LACUNAS.md` | raiz do pacote | Cruza as 2.037 cláusulas com o código real dos dois repositórios. Diz de onde parte cada bloco: base forte, base parcial ou ausente confirmado |
| `prompts/02-ENT02-CAPACIDADES-TRANSVERSAIS.md` | `prompts/` | Próximo lote executável |
| `prompts/03-ENT03-FINANCEIRO-E-CONTROLE.md` | `prompts/` | Lote seguinte |
| `prompts/GABARITO-DE-LOTE-E-FRENTES-04-11.md` | `prompts/` | Molde para escrever os prompts restantes, mais o briefing de cada frente de ENT04 a ENT11 |

O número que orienta a continuação: **1.274 das 2.037 cláusulas não têm código em
nenhum dos dois repositórios** — 62,5% do catálogo. O bloco fazendário e
tributário responde por 562 delas e é o caminho crítico real. Canais e
atendimento somam 340 e são a superfície pela qual qualquer demonstração começa.

---

## 2. Texto para colar

```
Continue a execução do pacote gestao_publica_execucao a partir de ENT02.

Leia, nesta ordem:
1. ESTADO-EXECUCAO.md — o checkpoint do último gate
2. PROMPT-MESTRE-IMPLEMENTACAO.md — invariantes e regras que continuam valendo
3. MAPA-DE-LACUNAS.md — de onde parte cada bloco
4. prompts/02-ENT02-CAPACIDADES-TRANSVERSAIS.md — o lote a executar agora

Bases:
- /Users/winnervinicius/Developer/siafic-cg      (núcleo autoritativo)
- /Users/winnervinicius/Developer/saas-municipal (doador seletivo)
- /Users/winnervinicius/Developer/gestao-publica (destino)

Confirme os caminhos e o estado real no disco antes de modificar qualquer
coisa. Divergência entre o que o mapa afirma e o que existe no disco é
registrada como divergência, não corrigida em silêncio.

Execute o lote ENT02 inteiro: processo digital e protocolo, comunicação
interna, pessoas e papéis com campos adicionais reais, anexos, assinatura com
fila, notificações, fundação do designer de relatórios, ajuda e chamados.

Regras do lote:

Entregue cadeias completas e navegáveis, não telas de demonstração. Um processo
digital precisa percorrer abertura, tramitação, parecer, readequação pelo
requerente, encerramento e arquivamento pela interface, com dado persistido e
visível após recarregar a página. O mesmo vale para o comunicado interno.

Cada capacidade transversal precisa de um consumidor real no produto e um teste
cobrindo esse consumo. Serviço de anexo sem tela que anexa não conta. Designer
de relatório sem relatório gerado por ele não conta. Campo adicional não é um
campo de observação fixo.

Nada de botão sem handler, link vazio, contador estático, aviso de sucesso sem
persistência ou tela cuja única prova seja um seed.

Reaproveite antes de escrever: M16 para autenticação, autorização e auditoria;
lib/pdf e M12 para emissão; packages/contracts para Decimal e helpers;
components/ e MODULO-UI.md para o padrão de tela; o mecanismo de idempotência
e outbox já existente. Não copie adapter Drizzle para o núcleo Prisma.

Preserve os invariantes: Decimal em todo valor monetário, ledger append-only,
período aberto verificado no caso de uso, tenant e entidade resolvidos no
servidor a partir de membership confiável, fail-closed na dúvida.

Sem provedor de HSM definido, o modo de custódia A1 fica indisponível com
motivo declarado. Não armazene A1 no banco chamando isso de HSM e não bloqueie
o restante do lote por essa dependência.

Nenhuma referência de conformidade pode aparecer em tela, mensagem,
notificação, documento operacional, rota ou atributo acessível: nada de número
de cláusula como rótulo de atendimento, selo de conformidade, percentual de
cobertura ou identificador do catálogo. Vocabulário de negócio permanece
disponível: edital, licitação, pregão, contrato, termo de referência de uma
compra. Comentário @req serve para rastrear, nunca para declarar atendimento.

Sem emoji em código, interface, documento ou mensagem de commit.

Execute os 22 testes mínimos listados no prompt do lote, mais a regressão de
ENT00 e ENT01. Registre o comando, o ambiente, a data e o resultado real de
cada execução, inclusive as falhas.

Ao concluir, atualize ESTADO-EXECUCAO.md com: arquivos alterados, o que passou
a funcionar e como navegar até lá, migrações e SQL manual aplicados, testes
executados com resultado, invariantes verificadas, pendências reais, e o
próximo lote. Depois pare e aguarde revisão antes de iniciar ENT03.

Não avance sobre falha de integridade contábil, segurança ou isolamento. Não
apague bancos originais, não faça push externo, não faça deploy e não transmita
documento fiscal ou pagamento real.
```

---

## 3. Depois do gate de ENT02

Execute `prompts/03-ENT03-FINANCEIRO-E-CONTROLE.md` com a mesma disciplina. Ele
tem uma exigência que não pode ser pulada: **caracterizar antes de ampliar.** A
suíte do `siafic-cg` nunca foi executada nesta máquina; até que esteja verde e o
comportamento atual esteja registrado, nada de novo entra em M01, M05 ou M12.

Para ENT04 em diante, use `prompts/GABARITO-DE-LOTE-E-FRENTES-04-11.md`: o molde
da seção 1 gera o prompt do lote, e o briefing da frente correspondente dá o
escopo, o que reaproveitar, as armadilhas conhecidas e o critério de conclusão.

Peça ao agente para escrever o prompt do lote **antes** de executá-lo, e revise-o.
É mais barato corrigir um prompt do que uma frente inteira construída torta.

---

## 4. Três decisões que continuam abertas

Nenhuma delas bloqueia ENT02, mas todas mudam prioridade daqui a alguns lotes:

1. **Situação do certame.** A sessão pública do pregão de Anita Garibaldi ocorreu
   em 17/08/2026 e o resultado não está confirmado. Se houver contrato assinado,
   o prazo de adequação ao tribunal muda a ordem das frentes. Se não houver, o
   catálogo é especificação de produto e a ordem por dependência técnica prevalece.
2. **Portabilidade do `folha-engine`.** A decisão de reimplementar em `Decimal`
   com golden fixtures está no briefing de ENT04, mas o custo real só aparece
   depois da caracterização. Reavalie ao abrir a frente.
3. **Escopo multi-município real.** O modelo alvo é `tenant_id` mais
   `entidade_id`, com a prova pequena nos adapters antes de qualquer migração
   ampla. Enquanto a prova não estiver feita, não habilite município novo.
