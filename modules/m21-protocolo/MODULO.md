# M21 — Protocolo e processo digital

Bloco 5.42 do catálogo (75 cláusulas), frente ENT02. Era `AUSENTE_CONFIRMADO`: nenhuma
linha de código em nenhum dos dois repositórios. O mapa de lacunas registra que ele é
**dependência** de compras, construção civil, ouvidoria, serviços públicos e portal do
cidadão — e é por isso que entra cedo, e não na frente 8.

---

## 1. As três decisões que governam o módulo

### 1.1 Não existe coluna `situacao`

A situação de um processo é **derivada** dos movimentos (`situacaoDoProcesso`, em
`dominio.ts`), como o `statusDoEmpenho` sai dos SUMs do razão e o `estadoDaOrdem` sai
dos movimentos da ordem de pagamento (M05).

Uma coluna mutável seria a segunda verdade sobre o mesmo fato. O dia em que divergisse
do histórico — e ela diverge, porque alguém sempre esquece de atualizá-la em um caminho
— a tela diria "encerrado" sobre um processo cujo último movimento é um trâmite.

Consequência prática: o papel de runtime **não precisa de UPDATE** em nenhuma tabela de
movimento. As únicas colunas mutáveis do módulo são os `ativo` dos cadastros.

### 1.2 O roteiro é COPIADO para o processo na abertura

`EtapaDoRoteiro` pertence ao assunto e muda quando a entidade o reconfigura.
`EtapaDoProcesso` é a cópia feita no instante da abertura.

Sem a cópia, mudar hoje o prazo de uma etapa reescreveria o prazo de todo processo
aberto no ano passado — e um processo que estava no prazo passaria a estar **atrasado
retroativamente**, sem que nada tivesse acontecido com ele. É a mesma doutrina de
`Empenho.credorCpfCnpj` (M19): o fato guarda o valor que valia quando aconteceu; o
cadastro descreve como as coisas são agora.

O `t1` de `m21-protocolo.test.ts` prova isso alterando o roteiro DEPOIS da abertura e
conferindo que o processo não se mexeu.

### 1.3 "Excluir trâmite" é um movimento, não um DELETE

**Divergência deliberada com o catálogo, e ela está aqui para ser lida antes de alguém
"corrigir".**

As cláusulas 5.42.40 e 5.42.42 pedem exclusão do último trâmite ou complemento. Aqui
isso é um movimento `TORNADO_SEM_EFEITO` que aponta para o movimento anulado — a mesma
doutrina do estorno do razão.

O efeito para o usuário é o pedido: o trâmite deixa de contar para a situação e para o
prazo. O que **não** acontece é o histórico esquecer que ele existiu.

A diferença aparece no caso que interessa a uma auditoria: alguém tramita para o setor
errado, percebe e desfaz. Com `DELETE`, não houve nada. Aqui houve, e está escrito quem
desfez e por quê.

Restrição adicional: **só o último**. Anular um trâmite do meio deixaria a cadeia de
setores inconsistente — o processo teria "chegado" a um lugar de onde nunca saiu.

---

## 2. Autorização: duas perguntas, e nenhuma substitui a outra

| Pergunta | Quem responde | Onde |
|---|---|---|
| "Ele PODE tramitar?" | M16, por ação e por unidade gestora | `autorizarNo(tx, ..., { setor })` |
| "O documento está na MESA dele?" | `UsuarioDoSetor` (lotação) | `exigirLotacao` |

O setor pendura numa `UnidadeOrcamentaria`, e é isso que faz a permissão por UG (o eixo
que o ENT01 construiu) valer para a tramitação **sem inventar um segundo eixo de
acesso**. O resolvedor é `ugDoSetor`, em `m16-travamento/escopo.ts`, na mesma família
dos outros resolvedores: a UG sai do ALVO do fato, nunca do contexto ambiente.

A lotação não é uma segunda regra de autorização — é a resposta a uma pergunta que o
M16 declara fora do seu escopo desde o ENT01 ("as leituras ficam de fora... a leitura
segregada é camada de APLICAÇÃO"). Um sistema que só perguntasse a primeira deixaria o
servidor do Almoxarifado despachar um processo parado no Gabinete: as duas salas são da
mesma unidade gestora.

**Quem tem permissão global é gestor** e enxerga todos os setores (5.42.54/55), reusando
o mecanismo que já existe em vez de inventar um crachá que ninguém saberia conceder.

> ⚠️ **Armadilha da fixture, e ela já mordeu.** `semearUsuariosDeTeste` dá ADMIN — com
> permissão GLOBAL — a todas as identidades das fixtures. Como global é gestor, um teste
> de lotação escrito com esses usuários passaria **sem testar nada**. Por isso o `t14`
> cria o próprio usuário, com perfil escopado numa UG.

---

## 3. As 14 ações do censo

Uma por ato, e não um `GERIR_PROCESSO` que agrupasse tudo: abrir, tramitar e encerrar
são decisões de peso diferente. O atendente do balcão abre e tramita; quem encerra
responde pelo mérito — e é a data do encerramento que a ouvidoria mede.

`ABRIR_PROCESSO` · `TRAMITAR_PROCESSO` · `RECEBER_PROCESSO` · `COMPLEMENTAR_PROCESSO` ·
`SOLICITAR_PARECER` · `RESPONDER_PARECER` · `SOLICITAR_READEQUACAO` ·
`ATENDER_READEQUACAO` · `ENCERRAR_PROCESSO` · `ARQUIVAR_PROCESSO` · `REABRIR_PROCESSO` ·
`APENSAR_PROCESSO` · `DESAPENSAR_PROCESSO` · `TORNAR_MOVIMENTO_SEM_EFEITO`

---

## 4. O que os guards recusam, e onde

Todos dentro da transação. A tela esconde o botão porque é gentil; o servidor recusa
porque é obrigação.

| Guard | Recusa |
|---|---|
| `exigirAberto` | movimento em processo encerrado, arquivado ou cancelado — e a mensagem ensina a reabrir |
| `exigirTaxasEmDia` | tramitação com taxa em aberto, quando o assunto configura o bloqueio (5.42.20/22) |
| `exigirLotacao` | despacho de quem não trabalha no setor onde o processo está |
| `exigirSetorAtivo` | trâmite para setor desativado |
| `alvosDaMovimentacao` | movimentar um apenso por fora do principal |
| em `arquivarProcesso` | arquivar o que não foi encerrado |
| em `encerrarProcesso` | encerrar com parecer ou readequação pendente |
| em `abrirProcesso` | anônimo onde o assunto não permite; termo de aceite não aceito; exercício encerrado |

### Encerrar e arquivar são dois atos

Encerrar decide o **mérito** ("está resolvido"). Arquivar decide a **guarda** ("sai da
mesa"). Fundi-los faria o histórico perder a data em que o pedido do cidadão foi de fato
respondido — que é justamente o número que a ouvidoria e a transparência publicam.

### Apensamento tem efeito real

Enquanto apensado, o processo **acompanha** a movimentação do principal: os movimentos
de trâmite, recebimento, encerramento, arquivamento e reabertura são gravados também
para ele, na mesma transação. Um vínculo que só desenha uma linha na tela é um rótulo, e
a cláusula 5.42.28 pede que "ambos sigam as mesmas movimentações".

**Cadeia de apensamento é recusada.** Apensar B a A e depois C a B criaria uma corrente
em que a movimentação teria de subir dois níveis — e o elo que falhasse deixaria parte
dela para trás, em silêncio.

---

## 5. O código verificador

É o que autoriza a consulta externa e o atendimento de readequação por quem **não é
usuário do sistema** (5.42.58). Por isso:

- **Aleatório, não derivado do número.** Derivá-lo tornaria toda a base consultável por
  quem descobrisse a fórmula.
- **`randomBytes`, não `Math.random()`.** É um segredo de acesso.
- **Alfabeto sem `0 O 1 I L`.** O código é ditado por telefone e digitado por quem não o
  escolheu; confundir zero com O transforma "consulte seu processo" em "seu processo não
  existe". Custa 5 símbolos de 36 e paga em ligações.

---

## 6. Pendências declaradas — o que este lote NÃO entrega

Nenhuma delas foi contornada com um substituto que pareça pronto.

| Pendência | O que falta | Por quê |
|---|---|---|
| `PROTOCOLO-FLUXOGRAMA` | a ferramenta gráfica de fluxo (5.42.63-65, 5.42.75[h][i]) | O prompt do lote manda explicitamente não implementá-la agora. O que existe é o roteiro linear com etapas, prazos e responsáveis — que é o que o controle de prazo consome. |
| `PROTOCOLO-GUIA-BANCARIA` | emissão de guia FEBRABAN/PIX da taxa (5.42.17/18) | Pertence ao bloco de arrecadação (5.29), que não existe no repositório. O que existe aqui é o **registro** da taxa e a sua situação, que é o que o bloqueio de tramitação consome. Nenhuma tela deste lote imprime guia. |
| `PROTOCOLO-LOTE` | recebimento, movimentação, encerramento e arquivamento **em lote** (5.42.38/39/43/45/46) | Os atos unitários existem e são a base. O lote é interface sobre eles. |
| `PROTOCOLO-PAINEIS` | os nove indicadores do 5.42.75 e os relatórios estatísticos (5.42.66-72) | Dependem do designer de relatórios, que é outro corte deste mesmo lote. |
| `PROTOCOLO-ETIQUETAS` | etiquetas personalizadas (5.42.69) | Emissão física; sem consumidor real ainda. |
| `PROTOCOLO-CADASTRO-IMOBILIARIO` | vínculo com cadastro imobiliário e endereço do processo (5.42.41, 5.42.74) | O cadastro imobiliário é 5.30, `AUSENTE_CONFIRMADO`, frente ENT06. |
| `NOTIFICACAO-EMAIL-PUSH` | envio real por e-mail e push (5.42.47/57) | Não há provedor, e envio externo está fora da autorização de trabalho. As notificações são **registradas** com `entregueEm` nulo e motivo declarado — ver `m24-notificacoes`. |

---

## 7. Onde olhar

| Arquivo | O que é |
|---|---|
| `prisma/schema/m21-protocolo.prisma` | os modelos, e o porquê de cada ausência de coluna |
| `dominio.ts` | puro: derivação da situação, prazo, taxa, apensamento, código verificador, Zod |
| `servico.ts` | os 14 casos de uso, com todos os guards dentro da transação |
| `m21-dominio.test.ts` | 16 testes sem banco — a aritmética da situação |
| `m21-protocolo.test.ts` | 17 testes contra banco — a cadeia, os bloqueios, a concorrência |
