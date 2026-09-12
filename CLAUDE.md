# gestao-publica

Sistema integrado de gestão pública municipal. **Uma repo, um sistema.**

Todo requisito que chegar é funcionalidade nova dentro deste repositório, em
módulo nomeado. Nunca sistema novo, nunca repositório novo. Os requisitos vêm
de termos de referência de licitação municipal, que pedem o mesmo conjunto com
recortes diferentes — a repetição é o ativo do produto.

SIAFIC não é produto separado: M01 a M14 são módulos daqui. RH e saúde entram
pelo mesmo caminho quando chegarem — e quando já houver código pronto em outra
repo, ele entra como módulo daqui, não se reescreve do zero.

Antes de escrever código num lote novo, diga **em que módulo** o requisito entra.

---

## Por onde começar

1. Este arquivo — carregado sozinho em toda sessão.
2. `ESTADO-EXECUCAO.md`, a seção "O próximo passo" — onde paramos.
3. `docs/lotes/` — o pedido do lote em execução.
4. O `MODULO.md` de cada módulo que o lote toca.
5. `docs/LEIA-ME.md` — índice de todo o resto, e a precedência entre documentos.

**Frente não é lote.** No prompt mestre, ENT04 a ENT11 são **frentes** (pessoal,
suprimentos, arrecadação...). No `ESTADO-EXECUCAO.md` e em `docs/lotes/`, "ENTnn" é o
**número do lote**. Os dois se separaram no ENT04: o lote ENT06 não é a frente ENT06.
A tabela de correspondência está em `docs/LEIA-ME.md`.

---

## Onde as coisas estão

| Caminho | O que é |
|---|---|
| `ESTADO-EXECUCAO.md` | checkpoint entre lotes |
| `docs/LEIA-ME.md` | índice de todos os documentos, ordem de leitura e precedência |
| `docs/lotes/` | o pedido de cada lote, como veio |
| `docs/instrucoes/` | prompt mestre, mapa de lacunas, gabarito de lote, especificações, arquitetura técnica |
| `docs/edital/` | termo de referência, catálogo de cláusulas e a auditoria do catálogo |
| `modules/mNN-*/` | domínio puro por módulo, com `MODULO.md` próprio |
| `lib/portas/` | portas — o que precisa do servidor |
| `lib/molde/` | descritor declarativo de recurso (dado puro) |
| `components/molde/` | a superfície que o molde monta |
| `components/ui/MODULO-UI.md` | o padrão de tela |
| `adapters/tribunais/` | leiautes de tribunal, com `MODULO.md` por adaptador |
| `packages/` | contracts, datas, documento, estornaveis, ledger, locks, ofx, planilha, tribunais-core, zip |
| `prisma/sql/` | índices parciais e checks que o Prisma não representa |
| `docs/adr/` | decisões de arquitetura aceitas |
| `docs/caracterizacao/` | comportamento medido antes de ampliar |
| `docs/varreduras/` | decisões de modelo levantadas antes de construir |
| `docs/dependencias-externas.md` | inventário de integrações |
| `docs/historico/` | documentos superados — **não se seguem** |
| `doador/saas-municipal/` | código antigo, **inerte** — nada importa dele |

**Leia o `MODULO.md` antes do código.** Ele frequentemente explica por que o
código não é o que se espera.

---

## Invariantes — não negociáveis

1. **Dinheiro é `Decimal`**, sempre, com os helpers de `packages/contracts`.
   Nunca `number`, nunca `float`.
2. **Razão append-only.** Correção é lançamento novo referenciando o original.
   Se um requisito parece exigir `UPDATE` em lançamento, o requisito foi lido
   errado ou o desenho está errado.
3. **Período aberto verificado no caso de uso**, não na tela. Bloqueio vale por
   API, por worker e por rota alternativa.
4. **Balanceamento por subsistema**, não só no total. O guard confere o
   subsistema contra o primeiro dígito do PCASP.
5. **Idempotência de entrada e saída externa**, com o escopo dentro da chave.
6. **Autorização no servidor**, por ação nomeada. Botão oculto não é proteção.
7. **Tenant e entidade resolvidos no servidor** a partir de membership
   confiável. URL, cabeçalho e campo de formulário não conferem permissão.
8. **Na dúvida, fail-closed.**

O papel `gestao_app` não tem superusuário, `BYPASSRLS`, posse de tabela nem
DDL. `UPDATE`/`DELETE` só num censo assinado de tabelas. Não afrouxe o grant
para fazer um teste passar — use a primitiva certa.

---

## Regras aprendidas — cada uma custou um defeito real

**Nenhum código no código.** Conta do PCASP, alíquota, roteiro contábil e
parâmetro normativo vêm de tabela, fail-closed. Fabricar um código de conta
para um teste passar é inventar norma da STN dentro de um teste.

**Fixture mínima N=2** em toda regra que só se manifesta em conjunto: fila,
lote, rateio, parcelamento, consolidação, estorno parcial, preço médio. Com
N=1 a regra passa por vacuidade e vai para produção.

**Parser se testa contra implementação independente.** Se o teste usa o seu
parser para conferir o seu parser, ele passa com qualquer interpretação errada
consistente.

**Teste de negação afirma o motivo**, não só o resultado. "Não completou" é
compatível com o servidor entregando o dado a qualquer um.

**Instrumento nasce com a prova de que acusa.** Guard, tripwire, gate: mute o
que ele diz vigiar, confirme vermelho, reverta — nas duas direções. Já houve
quatro defeitos dentro de instrumentos de medição neste repositório.

**Propriedade, não padrão.** Guarda que enumera formas acha só aquelas formas.
Duas vezes uma estimativa de cinco sítios virou trinta e cinco, e de dez virou
cinquenta e sete. Afirme a propriedade: suíte sob `TZ` deslocado, fixture em
hora de borda.

**Não atestar pela papelada que declara.** Três guards já ficaram verdes porque
casavam com o comentário que explicava a exclusão, ou com o censo que nomeia o
serviço. Afirme o efeito.

**Efeito colateral antes da operação guardada envenena a tentativa seguinte.**
Gravar o artefato antes da guarda de unicidade deixa o registro impossível de
processar para sempre. Confira pré-condições antes de gravar.

**Data civil do ente, nunca UTC**, em toda comparação de domínio. `packages/datas`
é a régua, com `Intl`, não com `-3` cravado. Formato externo (SAGRES, SIGA,
MANAD, BB, OFX) permanece em UTC, e cada exceção tem um motivo por linha.

**Timeout se mede e se memoiza, não se aumenta.**

**Falha intermitente só se descarta com o motivo junto.** E grave a saída bruta
em disco antes de qualquer cano — uma intermitência sem o nome do teste não se
investiga.

**Migration é aditiva.** Zero `DROP`. Índice criado por `prisma/sql/` precisa
estar declarado no schema, ou a deriva o remove em silêncio.

---

## Interface

- Nenhum identificador de cláusula, selo de conformidade ou percentual de
  cobertura em tela, mensagem, notificação, documento operacional, rota ou
  atributo acessível. Vocabulário de negócio permanece: edital, licitação,
  pregão, contrato, termo de referência de uma compra. Exceção nomeada: seções
  de leiaute de tribunal, que são normativo externo.
- **Sem emoji** em código, interface, documento ou mensagem de commit.
- Rótulo em todo campo de formulário. Campo sem rótulo é caixa muda para leitor
  de tela.
- O menu mostra só o que o servidor autoriza, pelo mesmo `PermissaoDePerfil`.
- Nada de botão sem handler, contador estático, gráfico com dado semeado ou
  aviso de sucesso sem persistência.
- Lista curta não é exceção: um `select` com 500 itens ordenados por código é
  um formulário bonito e inútil. O descritor declara o recorte.
- `GET` não produz transição de estado.

Use o molde (`lib/molde/`) para superfície. O que não couber, declare e escreva
à mão — o molde não cresce para acomodar exceção, e não carrega regra de
negócio.

---

## Dois regimes de rigor — declare qual no checkpoint

**Profundidade** — razão contábil, tesouraria, cálculo tributário, folha,
remessa a órgão, guards: caracterização antes de ampliar, tripwire provado por
mutação, fixture N=2, negação com motivo.

**Superfície** — cadastros, listagens, consultas, relatórios operacionais:
teste de caso de uso, teste de autorização no servidor, um percurso de
navegador por família de tela.

Rebaixar profundidade para superfície é decisão que precisa aparecer, não
acontecer.

---

## O portão

`npm run portao` — dez passos, saída bruta por passo, não para no primeiro erro.

Passo `pulado` não é passo barato: é passo que não aconteceu. Leia o resultado
contando os pulados como não executados.

**Agendamento:** durante a construção, `npm run test:rapido` (~14 s). Portão
completo só no fim do lote. `test:fuso` roda quando o diff toca `packages/datas`,
guards de período, janelas de relatório ou arquivos que `data-civil.test.ts`
vigia — e sempre no último portão antes de encerrar. É agendamento, não rigor:
nada deixa de rodar antes do lote fechar.

A suíte e os smokes disputam a máquina. `scripts/trinco-de-maquina.ts` serializa;
a trava de banco é outra coisa e vale por banco.

---

## O catálogo

`docs/edital/catalogo-execucao.json` — 2.037 cláusulas do termo de referência.
É a única medida de quanto do edital está atendido. `scripts/marcar-catalogo.ts`
é quem escreve nele.

- Marque só com **comportamento, teste e evidência**. Comentário `@req` serve
  para rastrear, nunca para declarar atendimento.
- **Código que existe não é comportamento provado.** Há tabelas no schema com
  os tipos certos e nenhum leitor escrito à mão.
- `IMPLEMENTADO_NAO_VALIDADO` vira `VALIDADO_LOCALMENTE` quando existe tela e
  percurso de navegador. Sem tela, um servidor municipal não alcança.
- **Marcar ausência vale tanto quanto marcar presença.** Foi uma marcação de
  ausência que trouxe a decisão da conta multifonte antes de alguém construir
  por cima.
- Censo rende cobertura, modelo rende situação, superfície rende validação. A
  meta de um lote vem declarada por natureza.

---

## Proibido

- Push externo, deploy, transmissão fiscal ou pagamento real.
- Apagar banco original ou reescrever migration já aplicada.
- `eval`, `new Function` ou lista negra para fórmula editável pelo usuário —
  `this.constructor.constructor(...)` passa por qualquer lista negra. Use
  interpretador com universo fechado.
- Importar qualquer coisa de `doador/`.
- Inventar descrição, código normativo ou alíquota que não esteja na fonte
  oficial. Pendência vazia é melhor que inventário inventado.
- Substituir integração externa ausente por retorno de sucesso local.
  Sem credencial, o estado é indisponível com motivo declarado.

---

## Ao fechar um lote

Atualize `ESTADO-EXECUCAO.md` com: o que passou a funcionar e a rota real para
chegar lá, comandos executados com resultado real, migrations e SQL aplicados,
invariantes verificadas, contagem do catálogo separada por natureza, pendências
reais separadas do que está bloqueado por terceiro, e o próximo lote.

Guarde o pedido do lote em `docs/lotes/`, como veio, antes de começar.

Pendência nomeada, nunca silenciosa. Recusa com mensagem clara é comportamento
aceitável; silêncio não é.

Pare no gate e aguarde revisão.
