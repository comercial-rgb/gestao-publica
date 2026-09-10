# M27 — Ajuda contextual e chamados de suporte

Seção 2.8 do prompt do ENT02.

---

## 1. A ajuda não abre chamado

O catálogo pede as duas coisas **separadas**, e a separação é o valor: quem não sabe
onde clicar não precisa de um protocolo aberto no seu nome, e o suporte não precisa de
uma fila cheia de perguntas que a própria tela responderia.

### Editar a ajuda é acrescentar uma versão

`AjudaDeRota` é append-only; a vigente é a mais recente daquela rota. Editar no lugar
exigiria UPDATE e apagaria a resposta que o servidor leu ontem — e *"quem mudou este
texto, e quando?"* é pergunta legítima no dia em que alguém **seguiu a instrução antiga
e errou** (`t1`).

### Rota sem ajuda devolve `null`

E a tela simplesmente não mostra o painel. Um texto genérico de reserva ("Ajuda não
disponível") ensinaria o usuário a ignorar o ícone — e ele deixaria de olhar justamente
nas rotas onde a ajuda existe (`t2`).

### A rota é interna, e o formato é cobrado

Um texto de ajuda vindo do banco e renderizado como link numa tela autenticada é
**redirecionamento aberto** esperando acontecer (`t3`).

---

## 2. Severidade é dado de configuração, não texto fixo

O prompt é explícito. Um `enum BAIXA|MEDIA|ALTA` obrigaria migration a cada entidade que
quisesse a sua escala — e escala de severidade é justamente o que cada contratante
negocia no contrato de suporte.

`NivelDeSeveridade` tem código, nome, **ordem** (que é a fila) e prazo em horas.
Severidade inexistente ou desativada é recusada na abertura (`t6`), e a fila ordena pela
ordem cadastrada (`t11`).

---

## 3. Número único no produto inteiro

O catálogo pede "número único, multi-entidade". Quem atende olha **uma fila só**, e dois
chamados "42" de entidades diferentes na mesma tela é o começo de uma resposta enviada
para o cliente errado (`t4`).

O trinco (`packages/locks`, posto `SequenciaDeChamado`) é tomado antes da soma, como em
todo sequencial do repositório. Aqui a colisão dói mais que noutros lugares: o `@unique`
faria a segunda pessoa **perder o texto que acabou de escrever** descrevendo um problema
(`t5`).

---

## 4. Responder não encerra

São ações separadas, com permissões separadas. **Quem abriu o chamado é quem sabe se o
problema acabou**; deixar o suporte encerrar junto com a resposta faria a métrica de
resolução medir a velocidade de digitar, não a de resolver (`t7`).

E encerrado não aceita resposta — a mensagem ensina a reabrir, e a reabertura é um
movimento registrado com autor e motivo (`t9`).

**Não há coluna de situação**: aberto é a ausência de movimento; respondido, encerrado e
reaberto são movimentos. Mesma doutrina do processo (M21) e da ordem de pagamento (M05).

---

## 5. A pesquisa de satisfação

| Regra | Por quê |
|---|---|
| Só **depois** do encerramento | Perguntar "ficou satisfeito?" com o problema em aberto mede impaciência, não satisfação |
| Só por **quem abriu** | Deixar quem atendeu responder transformaria a medida do atendimento numa autoavaliação |
| **Uma só, e não editável** | Uma nota que muda depois de o suporte ver o resultado não é pesquisa: é negociação. O `@unique` do banco garante |

O `t8` cobre as três.

---

## 6. Quem vê o quê

O catálogo pede "histórico consultável **pelo usuário**" — pelo usuário, e não pela
unidade inteira: um chamado costuma descrever o que a pessoa **não conseguiu fazer**, e
isso não é assunto do setor dela.

- quem abriu vê o seu;
- quem tem permissão global (o atendente) vê todos;
- `detalheDoChamado` devolve `null` a quem não pode ver — nunca uma mensagem que
  diferencie "não existe" de "não pode".

O `t10` cria o próprio usuário com perfil escopado numa UG, porque as identidades das
fixtures têm permissão global e um teste escrito com elas não provaria nada.

---

## 7. Pendências declaradas

| Pendência | O que falta | Por quê |
|---|---|---|
| `SUPORTE-PRAZO-SLA` | alerta quando o prazo da severidade estoura | `prazoHoras` está cadastrado e exibido; falta quem o vigie por tempo — a mesma dependência de agendador do designer (`DESIGNER-AGENDAMENTO`). |
| `AJUDA-EDITOR` | edição da ajuda pela própria tela em que ela aparece | O caso de uso existe e é autorizado; falta a superfície de edição contextual. Hoje se escreve pela tela de ajuda. |
| `SUPORTE-BASE-DE-CONHECIMENTO` | artigos pesquisáveis além da ajuda por rota | A ajuda é ancorada em rota, que é o que o catálogo pede. Uma base pesquisável é capacidade adjacente, sem consumidor real ainda. |

---

## 8. Onde olhar

| Arquivo | O que é |
|---|---|
| `prisma/schema/m27-suporte.prisma` | os modelos, e o porquê de severidade ser cadastro |
| `servico.ts` | os 7 casos de uso, com os guards dentro da transação |
| `consultas.ts` | a ajuda vigente, a fila de chamados e o detalhe |
| `m27-suporte.test.ts` | 11 testes contra banco de verdade |
