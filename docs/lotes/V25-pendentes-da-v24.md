# V25 — os pendentes da V24

Pedido, como veio (01/10/2026, depois do relatório final da V24):

> Siga por estes Pendntes.

"Estes pendentes" são os nomeados no fechamento da V24:

1. A verificação automática de datas (`test/ui/data-civil.test.ts`) com a falha vinda de 27 e 28/09 — 32 sítios.
2. O IR retido pelo município não conferido contra o manual de contabilidade (pode ser receita própria).
3. O FAP vale para um único CNPJ empregador.
4. O SAGRES com 31 das 58 tabelas por gerar.

Fora deste lote, por decisão do usuário (reinicia o sistema da apresentação): levar a V24 à 3010 —
migrations no banco da apresentação, carga das tabelas oficiais, build novo, ente Esperança e contas
das consignações.

Restrições que continuam: sem push, deploy, transmissão ou pagamento; nada de `doador/`; nenhuma norma,
alíquota ou conta inventada; sem jargão nem emoji em tela; migration aditiva; percurso que grava nunca na
3010; dinheiro em Decimal; data civil do ente; commit local; sem suítes completas.

## Checkpoint (01/10/2026)

| Pendente | Situação | Commit |
|---|---|---|
| 1. Guarda de data civil | Verde. Dois defeitos reais que ela escondia: o exercício da retenção de 31/12 à noite ia para o ano seguinte (M07); o cadastro do contrato gravava a vigência ao meio-dia e o empenho da manhã do primeiro dia e da tarde do último caíam fora (M11). Cinco telas somavam e imprimiam dinheiro por `Number`. MANAD: exceção de formato externo declarada. | `a55caca` |
| 2. IR retido pelo ente | Levantado com a fonte oficial (MCASP 11ª ed., Parte I 3.6.2 e Parte III 6.2.6): é receita tributária do ente, não consignação. O ISS retido pelo município também. Duas cadeias possíveis; **decisão do contador**. Nada mudou no código da retenção. | `64b2f6f` |
| 3. FAP com mais de um CNPJ | Feito: estabelecimento por lotação (append-only, por competência), FAP por CNPJ, tela e percurso 12/12. | `6071a7f`, `c88cff3` |
| 4. SAGRES 31 tabelas | 5 geradas (§4.24, §4.35, §4.37, §4.46, §4.58) → 32 de 58. Das 26 restantes: 8 de frota e farmácia (sem módulo), 18 dependem de decisão ou cadastro que não existe (ver `adapters/tribunais/tce-pb/sagres/MODULO.md`). | `19c4bdf` |

Regime: profundidade nas quatro frentes (cálculo de encargos, remessa ao tribunal, datas de domínio).
Achado de instrumento: o censo t5 ficou vermelho na V24 (17 leituras de restos sem classificação) — o
checkpoint da V24 não o rodou depois do grupo dos restos.

## Fechamento (01/10/2026)

- **Defeito anterior achado conferindo a prévia na 3011:** o pacote MENSAL pedido pela tela saía como o
  mês seguinte — nome (`…102026…` para setembro) e conteúdo (o saldo somava o extrato até o fim de
  outubro). A porta ancorava o mês no fim do dia civil e o gerador lê o mês em UTC; desde a ENT03c (11/09).
  Corrigido com `competenciaDoLeiaute` (`12ee77b`); conferido na tela: dotação, saldo, conciliação e os
  relacionamentos mensais saem `…092026…`.
- **Percursos no build da rodada (worktree, 3011, cópia limpa do modelo):** FAP 12/12; SAGRES receita
  extra 13/13 ("32 de 58"); dinheiro nas telas 8/8 (restos não executado: o banco da apresentação não tem
  resto inscrito). Os percursos antigos de recolhimento, guia repartida e restos não rodam neste banco
  (usuário e massa de outro conjunto; o de restos caiu por perfil do Chrome travado) — não contam como prova.
- **Intermitência registrada, causa não identificada:** a rodada do adaptador SAGRES (15 arquivos, 181
  testes) falhou duas vezes por espera — `sagres-poc.test.ts` com hook de 10 s; `m15-sagres-gerador.test.ts`
  com um teste parado 40 min — e passou na terceira (181/181, 229 s). Nenhuma sessão presa no banco de teste
  quando inspecionado; saída bruta em `~/.gestao-publica-local/v25-sagres-rodada2-intermitente.txt`.
- 3011 parada, worktree removida (junção desfeita antes; dependências conferidas), banco de ensaio apagado.
  A 3010 não foi tocada: continua com a versão anterior à V24.
