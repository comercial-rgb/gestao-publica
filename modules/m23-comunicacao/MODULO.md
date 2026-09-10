# M23 — Comunicação interna

Bloco 5.43 do catálogo (53 cláusulas), frente ENT02. Era `AUSENTE_CONFIRMADO`.
Memorandos, ofícios e circulares — com caixas, numeração, leitura registrada,
assinatura por tipo, A/C e tags.

---

## 1. As caixas não são estado. São ponto de vista.

Entrada, saída, rascunhos, favoritos e arquivados **não** são cinco tabelas nem uma
coluna `caixa`. O mesmo comunicado está, ao mesmo tempo, na **saída** de quem enviou e
na **entrada** de quem recebeu — uma coluna teria de valer duas coisas de uma vez.

`caixaDoComunicado(comunicado, usuario, meusSetores)` recebe **quem olha** e responde
onde aquele documento aparece para **aquela** pessoa. O `t10` prova a ponta que importa:
o mesmo `id` sai como `SAIDA` para um e `ENTRADA` para o outro.

### Arquivar e favoritar são por usuário

Uma coluna `arquivado` no comunicado o esconderia de **todo mundo** porque uma pessoa o
arquivou. Aqui os dois são movimentos com autor, e a derivação lê o último movimento
**daquele** usuário. O `t11` arquiva para o destinatário e confere que, para o
remetente, nada mudou.

### Rascunho é a ausência do movimento `ENVIO`

Não há coluna `enviadoEm`. A primeira versão do schema tinha, e ela era a segunda
verdade sobre o mesmo fato: o movimento `ENVIO` já carrega quem enviou, quando e com
qual assinatura. Duas fontes para "isto foi enviado?" divergem, e a tela mostraria
"rascunho" sobre um documento que os destinatários já leram.

---

## 2. Responder alcança quem já estava. Encaminhar é que inclui.

| Ato | Alcance | Registro |
|---|---|---|
| Responder | **apenas** os setores já envolvidos, menos quem responde | comunicado novo, com `respondeAId` |
| Encaminhar | qualquer setor | destinatário marcado `porEncaminhamento: true` + movimento |

Se responder pudesse alcançar qualquer setor, **"responder" seria "encaminhar" sem o
registro** — e o setor novo receberia a conversa inteira sem que nenhum ato tivesse
decidido incluí-lo. O `t7` prova que o Gabinete não entra na resposta e não pode nem
responder; o `t8` prova que, depois de encaminhado, ele passa a poder.

### Circular não aceita resposta

Regra do **caso de uso**, não botão escondido. Uma circular é comunicação de um para
muitos: se cada destinatário respondesse a todos, viraria lista de discussão — que é
exatamente o que ela não é. O `t6` chama `responderComunicado` direto e recebe a recusa.

### O A/C destaca, não restringe

Um memorando endereçado ao setor **é do setor**, mesmo quando alguém é nomeado nele.
Tratar o A/C como restrição faria o documento sumir para o resto do setor. O `t9` põe um
colega no mesmo setor e confere que ele vê o documento, com `aosCuidadosDeMim: false`.

---

## 3. Numeração por ano, tipo e setor — três eixos

`@@unique([exercicioId, tipoId, setorRemetenteId, numero])`.

O memorando 1/2026 da Saúde e o memorando 1/2026 da Educação são documentos diferentes e
legítimos; uma sequência única no ente obrigaria os dois setores a disputarem a mesma
fila. O `t1` prova os três eixos.

O trinco (`packages/locks`, posto `SequenciaDeComunicado`) é sobre a **tríplice**, não
sobre o exercício: travar o exercício inteiro faria a Educação esperar a Saúde para
numerar um documento que não disputa numeração nenhuma com ela. O `t2` emite dois
concorrentes e confere que saem 1 e 2.

### O rascunho já nasce numerado

Numerar só no envio pareceria mais limpo, mas faria o número mudar de lugar na fila
conforme a ordem em que as pessoas terminassem de escrever — e um memorando já impresso
para assinatura mudaria de número antes de sair.

---

## 4. O único UPDATE de conteúdo do repositório, e o que o vigia

Um rascunho **precisa** ser editável. Por isso o papel de runtime tem
`UPDATE ("assunto","corpo")` em `Comunicado` — grant por coluna, declarado no censo do
`papel-runtime.ts`.

O grant **não sabe** dizer "só antes de enviar". Quem diz é `editarRascunho`, que recusa
editar o que já foi enviado (`t3`).

E o que denuncia uma edição feita por **qualquer outro caminho** é o `hashConteudo`
carimbado no movimento de `ENVIO`. O `t4` edita a linha direto pelo Prisma — o cenário
que o grant permite — e mostra `integridadeDoEnvio` virando `integro: false`.

> Sem esse carimbo, alterar o texto de um documento já lido seria **invisível**.

---

## 5. Assinatura por tipo (Lei 14.063/2020)

`TipoDeComunicado.modoDeAssinaturaExigido` — nulo = não exige.

Quando exige, `enviarComunicado` recusa o envio sem assinatura **e** recusa o modo
errado: os modos da lei não são intercambiáveis. `QUALIFICADA` é recusada com o mesmo
motivo do M22 — não há provedor ICP-Brasil (`ASSINATURA-ICP-HSM`).

Um tipo que declara exigir assinatura e um envio que passa sem ela é **configuração
decorativa**. O `t5` cobre as três pontas.

---

## 6. Privilégio por setor: a exceção declarada ao fail-closed

`TipoDeComunicadoPorSetor` restringe quais setores podem emitir cada tipo. **Ausência de
linhas = liberado a todos** — o oposto do fail-closed do resto do repositório.

A escolha é deliberada e está no schema: aqui não se protege dinheiro nem dado sigiloso;
o pior caso é um setor emitir um memorando que não devia. Fail-closed obrigaria a
cadastrar N×M linhas antes do primeiro comunicado, e o efeito prático seria alguém
liberar tudo para destravar — que é pior que a regra frouxa e honesta.

---

## 7. As nove ações, e por que quatro serviços dividem uma

`CRIAR_TIPO_DE_COMUNICADO` · `RASCUNHAR_COMUNICADO` · `EDITAR_RASCUNHO_DE_COMUNICADO` ·
`ENVIAR_COMUNICADO` · `RESPONDER_COMUNICADO` · `ENCAMINHAR_COMUNICADO` ·
`MARCAR_LEITURA_DE_COMUNICADO` · `GERIR_MINHA_CAIXA` · `ETIQUETAR_COMUNICADO`

Arquivar, desarquivar, favoritar e desfavoritar compartilham `GERIR_MINHA_CAIXA`: são o
**mesmo poder** — organizar a própria caixa — e nenhum deles muda o documento para outra
pessoa. Quatro crachás separados para "guardar" e "desguardar" o próprio e-mail seriam
quatro linhas de permissão que ninguém negaria uma sem negar as outras.

**Etiquetar fica fora dessa fusão** porque a tag é visível a todos os envolvidos (`t14`)
— não é organização pessoal.

---

## 8. Quem não participa não age, e não consulta

`setorDoUsuarioNoComunicado` recusa quem não está lotado em nenhum setor envolvido nem
emitiu o documento (`t13`). Sem isso, qualquer usuário do ente poderia encaminhar,
etiquetar ou marcar como lido um documento que nunca lhe foi endereçado.

`leiturasDoComunicado` devolve `null` a quem não participa. Um relatório de leitura
aberto a qualquer usuário do ente **diria quem está trabalhando em quê**.

E a primeira leitura é a que vale: um registro por abertura afogaria o dado que o
catálogo pede — *quando aquela pessoa tomou ciência* — num histórico de ruído (`t12`).

---

## 9. Pendências declaradas

| Pendência | O que falta | Por quê |
|---|---|---|
| `COMUNICADO-PROCESSO-JUDICIAL` | relacionar comunicado a processo judicial | A procuradoria (5.41) é `AUSENTE_CONFIRMADO`, frente ENT08. Uma FK para uma tabela que não existe seria uma promessa de integridade que ninguém pode cumprir. O relacionamento com **processo digital** existe (`Comunicado.processoId`). |
| `COMUNICADO-MODELO` | repositório de modelos de documento (5.42.34, aplicável aqui) | Depende do designer de relatórios, outro corte deste mesmo lote. |
| `COMUNICADO-EMAIL` | espelhar o comunicado por e-mail | Sem provedor e fora da autorização de trabalho. A notificação interna é real; ver `m24-notificacoes`. |

---

## 10. Onde olhar

| Arquivo | O que é |
|---|---|
| `prisma/schema/m23-comunicacao.prisma` | os modelos, e o porquê de cada coluna ausente |
| `dominio.ts` | puro: a caixa por ponto de vista, favorito, setores envolvidos, hash |
| `servico.ts` | os 12 casos de uso, com os guards dentro da transação |
| `consultas.ts` | a caixa, a consulta de leitura e a conferência de integridade |
| `m23-comunicacao.test.ts` | 14 testes contra banco de verdade |
