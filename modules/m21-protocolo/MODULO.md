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

**V7 M1 U1 — "gestor" deixou de ser qualquer permissão global.** Até V6.2, uma conta com
`EMPENHAR` no ente enxergava todos os processos (os sigilosos inclusive) e despachava sem lotação.
A decisão agora é explícita, em `escopo-do-protocolo.ts`, e é a MESMA para caixa, detalhe, anexo,
lote, mesa e contagens (`podeVerProcesso` / `recorteDaCaixa`):

| Ordem | Regra | Código |
|---|---|---|
| 1 | Sem `CONSULTAR_PROTOCOLO` em escopo nenhum → não alcança (nem o processo que abriu pela carta) | `SEM-CONSULTA-DO-PROTOCOLO` |
| 2 | Abriu, movimentou ou está lotado em setor por onde passou → alcança, sigiloso inclusive | `PARTICIPANTE` |
| 3 | Sigiloso sem participação → não alcança, **também o gestor** | `SIGILO-PREVALECE` |
| 4a | `CONSULTAR_PROTOCOLO` no ente → não sigilosos do ente | `CONSULTA-NO-ENTE` |
| 4b | `CONSULTAR_PROTOCOLO` na UG → não sigilosos abertos por setor da UG | `CONSULTA-NA-UG` |
| 5 | Qualquer outra coisa | `FORA-DO-ESCOPO` |

**Agir sem lotação** exige a PRÓPRIA ação do ato concedida no ente e processo não sigiloso
(`podeAgirNoSetor`, chamado por `exigirLotacao` em cada ato e pela projeção da mesa). Prova:
`m21-escopo.test.ts` (7 cenários com alvo existente; mutações "qualquer global é gestor" e "gestor
levanta sigilo" acusadas). Pendência: `ACESSO-ESPECIAL-A-SIGILOSO` (concessão nominal a quem não
participa) não existe; `GESTOR-NO-COMUNICADO` — `podeVerComunicado` (M22/M23) ainda trata qualquer
permissão global como gestor.

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

## 7. A carta de serviços e as solicitações do requerente — V6.2 P3

**Não é outro engine.** `ServicoDaCarta` aponta para um `Assunto`; a solicitação protocolada É um
processo deste módulo, criado pela mesma `criarProcessoNaTransacao` da abertura interna; exigência,
resposta e encerramento são `READEQUACAO_SOLICITADA`, `READEQUACAO_ATENDIDA` e `ENCERRAMENTO`.

- **Versão publicada, imutável.** O conteúdo (descrição, requisitos, documentos, canais, custo, prazo
  só com fundamento) e o formulário (vocabulário fechado: texto, texto longo, data, e-mail, telefone)
  vivem em `VersaoDoServico`; a publicação (`PublicacaoDoServico.etapas`) COPIA o roteiro real. A
  solicitação guarda a versão em que foi feita. Todo serviço desta versão exige login.
- **Titular pela conta.** Por si: a pessoa vinculada à conta (M16). Por outra pessoa: representação
  VIGENTE hoje (M19). CPF/CNPJ digitado não identifica ninguém. Complemento de fornecedor só por
  representação de pessoa jurídica.
- **Três tipos.** Requerimento administrativo; atualização cadastral (a proposta grava a versão base;
  só DEFERIR cria a versão nova do cadastro, cobra `ALTERAR_PESSOA`, valida por `zAlterarPessoa` e
  recusa `CADASTRO-MUDOU-DESDE-A-PROPOSTA`); complemento documental de fornecedor.
- **Predicados em `carta.ts`, na tela e na transação.** Exigência pendente trava decisão e nova
  exigência; em trâmite não recebido trava; parecer pendente trava decidir. Trinco
  `SolicitacaoDeServico` (posto 24). Quem é titular ou representa o titular não decide (`AUTODECISAO`).
- **O requerente vê projeção, não processo.** Situação derivada, exigências e as próprias respostas,
  documentos em `AnexoDaSolicitacao` (enviados por ele e respostas liberadas) e a mensagem da decisão.
  Fundamento interno, parecer, despacho e anexos internos NÃO chegam. Outra pessoa ou representação
  revogada: 404 igual a id inexistente.
- **Append-only para o runtime.** Etapas e versão deferida gravadas por INSERT (migration
  `20260914120200`); as colunas antigas ficaram sem escritor.

Ações: `CONFIGURAR_CARTA_DE_SERVICOS`, `SOLICITAR_SERVICO`, `DECIDIR_SOLICITACAO_DE_SERVICO`,
`REGISTRAR_REPRESENTACAO` e a leitura `CONSULTAR_MEUS_SERVICOS` (permissões v15 não concede pedir nem
decidir). Rotas: `/servicos`, `/servicos/[slug]` (públicas), `/meus-servicos/**`,
`/protocolo/solicitacoes/**`, `/protocolo/servicos/**`, `/cadastros/representacoes/**`.
Testes: `m21-carta.test.ts` (13), `test/carta-de-servicos.test.ts` (5); percurso
`scripts/smoke-carta-de-servicos.ts`.

Pendências: ~~`CARTA-SEM-SERVICO-ANONIMO`~~ (a manifestação sem conta chegou em V7 M1 U4, §7.1; o
reCAPTCHA continua ausente: `ANTIABUSO-EXTERNO-NAO-CONECTADO`), ~~`AVALIACAO-DO-SERVICO`~~ (V7 M1 U4,
§7.2), `CANAL-DA-CARTA-SEM-ATIVACAO-NA-APRESENTACAO` (a entrada não
oferece o link), ~~`GESTOR-POR-QUALQUER-PERMISSAO-GLOBAL`~~ (resolvida em V7 M1 U1, §2), `ALTERACAO-CADASTRAL-CONCORRENTE-SEM-TRINCO`
(`alterarPessoa` não trava; a conferência da versão base fecha a janela só entre leituras),
`NOTIFICACAO-EXTERNA-AO-REQUERENTE` (as notificações são registradas no sistema; nada sai por e-mail).

### 7.1 A manifestação de ouvidoria sem conta — V7 M1 U4

**A entrada é da natureza do serviço.** `MANIFESTACAO_ANONIMA` é o único tipo com
`exigeAutenticacao = false`, e só sobre assunto que aceita anônimo E é sigiloso por padrão
(`ASSUNTO-INADEQUADO-PARA-OUVIDORIA`); os outros tipos continuam exigindo conta, e o protocolo
autenticado recusa o serviço anônimo.

- **Nenhuma Pessoa fictícia.** `registrarManifestacaoAnonima` cria o processo sem requerente, SIGILOSO
  pelo ato (mesmo que o assunto seja rebaixado depois), no setor de entrada da versão; autor técnico
  `OUVIDORIA-SEM-CONTA`. Contato é opcional e só a ouvidoria vê.
- **Segredo por hash.** 20 caracteres de 32 bytes aleatórios, mostrados uma vez; o banco guarda o sha256.
  `acompanharManifestacao(protocolo, segredo)` devolve só situação e respostas liberadas; protocolo ou
  segredo errados respondem `null`, igual. A tela consulta por POST (nunca na URL) e declara
  `referrer: no-referrer`.
- **Quota local.** `EnvioPublicoSemConta` com chave sha256(dia civil + origem + finalidade), 5 por hora.
  Nenhum captcha está conectado, e a tela diz isso.
- **Triagem e resposta** (`TRIAR_MANIFESTACAO_DE_OUVIDORIA`) exigem lotação no setor em que a
  manifestação está (sigilosa: a ação no ente não dispensa lotação). Uma triagem por manifestação
  (anotação interna); resposta exige triagem; a conclusiva encerra o processo e os apensos. Trinco
  `ManifestacaoDeOuvidoria` (posto 25) ANTES de ler — sem ele, duas conclusivas simultâneas passaram.
- **Escopo.** A consulta do protocolo no ente não lê manifestação (`SIGILO-PREVALECE`).

### 7.2 A avaliação dos serviços — V7 M1 U4 (`avaliacao.ts`)

- **Metodologia versionada** (`CONFIGURAR_CARTA_DE_SERVICOS`): escala com rótulo em todo ponto, método
  descrito e período em meses. A vigente é a de maior versão.
- **Duas origens que não se somam.** `ATENDIMENTO_COMPROVADO`: solicitação DECIDIDA, pela conta do
  titular ou de quem o representa hoje (`SOLICITAR_SERVICO`). `OPINIAO_GERAL`: sem conta, token httpOnly
  do navegador guardado por sha256, quota de 10 por hora por origem.
- **Revisar é linha nova** (`revisaoDeId` único); a raiz é única por (serviço, avaliador) em índice
  parcial. O resultado conta só a última da cadeia.
- **Resultado público** (`resultadoPublicoDasAvaliacoes`): por origem, número de respostas, média de
  satisfação, atendimento e prazos com uma casa (inteiros, meio-para-cima), período, método, removidas e
  quantas ficaram de fora por serem de outra versão da escala. Sem autor, sem descrição.
- **Moderação** (`MODERAR_AVALIACAO_DE_SERVICO`): remoção por abuso ou dado pessoal, com justificativa.

Rotas: `/ouvidoria`, `/ouvidoria/[slug]`, `/ouvidoria/acompanhar` (públicas), resultado e opinião em
`/servicos/[slug]`, avaliação do atendimento em `/meus-servicos/[id]`, `/protocolo/ouvidoria`,
`/protocolo/avaliacoes`. Permissões v17. Testes: `test/ouvidoria-e-avaliacao.test.ts` (10).

Pendências: `ANTIABUSO-EXTERNO-NAO-CONECTADO`, `OUVIDORIA-ENCAMINHAMENTO-A-OUTRO-SETOR` (a
triagem registra; o trâmite a outro setor é o do processo, sem projeção própria ao manifestante),
`OUVIDORIA-REENVIO-DUPLICA` (ato público sem o envelope da chave de comando: duplo envio antes da resposta registra duas manifestações; a quota limita), `AVALIACAO-SEM-LIMIAR-DE-PUBLICACAO` (com poucas respostas a média é publicada assim mesmo, com o
número de respostas ao lado).

## 8. Onde olhar

| Arquivo | O que é |
|---|---|
| `prisma/schema/m21-protocolo.prisma` | os modelos, e o porquê de cada ausência de coluna |
| `dominio.ts` | puro: derivação da situação, prazo, taxa, apensamento, código verificador, Zod |
| `servico.ts` | os 14 casos de uso, com todos os guards dentro da transação |
| `m21-dominio.test.ts` | 16 testes sem banco — a aritmética da situação |
| `m21-protocolo.test.ts` | 17 testes contra banco — a cadeia, os bloqueios, a concorrência |
