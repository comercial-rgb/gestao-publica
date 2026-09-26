# M33 — A cadeia extraorçamentária do vale: o que existe, o que falta, e a decisão que volta ao usuário

> V13 rodada 4, unidade 2. Levantamento feito ANTES de projetar, como o CLAUDE.md manda.
> **Nada foi construído.** O que segue é inventário medido mais a consequência que ninguém
> havia nomeado.

## A decisão de produto que motiva esta unidade

O vale é **extraorçamentário**: não empenha. Debita `1.1.3.1.1.01.01` (SALÁRIOS E ORDENADOS
- ADIANTAMENTOS) contra a saída de caixa; a despesa de pessoal é empenhada **uma** vez, na
folha mensal, pelo bruto; o abatimento **baixa o direito**.

A unidade 1 entregou o lugar onde o ente DECLARA essa conta (parâmetro, versionado,
append-only, com tela). Esta unidade perguntou como o dinheiro SAI. A resposta é que o
caminho não existe, e a razão é mais séria do que "falta escrever o serviço".

---

## (a) O que registra a SAÍDA DE CAIXA do vale — inventário

| Caminho existente | Forma | Serve? |
|---|---|---|
| M05 `pagar` | `Liquidacao → Empenho`; cria `MovimentoDotacao`; perna ORÇAMENTÁRIA | **Não.** É a cadeia orçamentária inteira — exatamente o que a decisão remove. |
| M07 `registrarDispendioExtra` | extraorçamentário; **zero** `MovimentoDotacao`, zero perna orçamentária | **Forma certa, semântica errada.** Ver abaixo. |
| M09 `registrarMovimentoBancario` | saída de caixa com contrapartida declarada, saldo conferido dentro da transação, lançamento simultâneo | **Forma certa, granularidade errada.** Ver abaixo. |
| M09 `LoteDePagamento` / `ItemDoLote` | já **aponta** para `OrdemDePagamento` (M05) **ou** `MovimentoExtraorcamentario` (M07) | **Reaproveitável.** É o gancho: o lote já sabe carregar item extraorçamentário. |

### Por que o M07 não serve sem adaptação

O M07 é **dinheiro de terceiros**: "entra sem ser receita, sai sem ser despesa". Seu
dispêndio é `D consignação a pagar / C disponibilidade` — debita um **PASSIVO**, porque o
ente estava guardando dinheiro alheio. O invariante 4 do módulo é explícito: o saldo é por
`(tipoConsignacao, credorConsignatario)` e significa **o que o ente ainda deve**.

O vale é o **sinal inverso**: `D adiantamento concedido (ATIVO) / C disponibilidade`. O ente
não guarda dinheiro do servidor; o ente tem um **direito a receber** dele. Registrar o vale
como consignação faria o saldo dizer que o município **deve** ao servidor o que ele **tem a
receber** — com o balanço fechando, que é a pior forma de erro (a forma do `345af7d` que o
próprio M07 documenta).

### Por que o M09 não serve sem adaptação

`registrarMovimentoBancario` tem a forma certa da saída de caixa e aceita contrapartida
declarada. Mas seus tipos são **atos do ente** (depósito, saque, aplicação, resgate,
rendimento, tarifa), são **um movimento por operação**, e **não carregam `vinculoId`**. Não
há como dizer "saíram 1.200,00 para a matrícula MAT-A".

---

## ⚠️ A CONSEQUÊNCIA QUE NINGUÉM HAVIA NOMEADO: o critério PAGO perde a fonte

Esta é a descoberta desta unidade, e ela é a razão de nada ter sido construído.

O parâmetro do vale oferece três critérios de abatimento: `FECHADO`, `CERTIFICADO` e
**`PAGO`**. O `PAGO` só é verificável por esta cadeia, e por nenhuma outra:

```
Contracheque → grupo da rubrica → EmpenhoDaFolha → Empenho → Liquidacao → Pagamento
                                  └─ vinculoId, e SÓ quando o grupo empenha POR SERVIDOR
```

`EmpenhoDaFolha.vinculoId` é **o único lugar do banco** onde existe "quanto saiu para esta
matrícula". O próprio serviço diz isso por escrito, em
`EstadoPagoNaoVerificavelNoAdiantamentoSalarialError`, e a tela repete ao operador.

**Se o vale deixa de empenhar, essa cadeia deixa de existir — e `PAGO` deixa de ser
verificável para TODO ente, não só para quem tem `porServidor = false`.** Hoje a recusa é
condicional e tem saída ("empenhe o vale por servidor"). Depois da mudança, a saída some.

Construir a saída de caixa sem resolver isto produziria uma das duas coisas que este
repositório já pagou para não repetir:

- um `PAGO` que o cadastro aceita e o cálculo nunca satisfaz — a folha mensal recusaria a
  competência inteira por um fato que o banco não pode mais produzir; ou
- um `PAGO` satisfeito por suposição (o vale foi pago porque a folha foi paga), que é abater
  do salário do servidor dinheiro que talvez não tenha saído para ele.

## O que falta, nomeado — e é decisão do usuário, não escolha técnica local

1. **O fato de saída de caixa do vale precisa carregar `vinculoId`.** Nem o
   `MovimentoExtraorcamentario` (M07) nem o `MovimentoBancario` (M09) o têm.
2. **Qual das duas formas:**
   - **(i)** ampliar o M07 para admitir movimento cuja contrapartida é um **ATIVO** do ente
     (não um passivo com terceiro), com `vinculoId` opcional. Mexe num módulo **concluído** e
     no seu invariante 4 — decisão de arquitetura, provavelmente ADR.
   - **(ii)** um fato próprio do M33 (`PagamentoDoAdiantamentoSalarial`), por servidor,
     reaproveitando `LoteDePagamento`/`ItemDoLote` do M09 para o borderô — que já sabe
     carregar item que não é ordem de pagamento orçamentária.
3. **Se `PAGO` continua oferecido** depois da mudança, e sob qual fato.

**Nenhuma das três é decisão técnica local e reversível**, e por isso nenhuma foi tomada aqui.

## (c) `VALE-NA-MESMA-NATUREZA-DA-REMUNERACAO` — ainda guarda, hoje

Medido: a guarda **não** perdeu o objeto, porque o vale **ainda empenha**.
`exigirTratamentoDoValeDaCompetencia` segue disparando nas duas pontas, e
`m33-adiantamento-salarial-pago.test.ts` prova pelas duas.

**Mas ela morre em silêncio no dia em que (a) for construída**, e isso fica registrado aqui
porque é o tipo de coisa que não se descobre depois: com o vale fora do empenho não há
`RubricaDoGrupoDeEmpenho` para a rubrica do vale, logo `noGrupo.length === 0` e a função
**retorna antes das duas guardas**. As duas — a da contrapartida patrimonial e a da natureza
de despesa — passam a ser código morto que parece vigilância.

A substituição correta, quando (a) chegar, **não** é apagar: é inverter a afirmação. A
rubrica do vale **não pode estar em grupo de empenho nenhum** — e isso é uma guarda com alvo,
porque é exatamente o engano que um ente migrando faria.

Retirá-la **agora** seria retirar guarda que ainda guarda. Ela permanece.

## (b) e (d) — medidos no estado atual, em `m33-adiantamento-salarial-pago.test.ts`

A seção `cX` caracteriza o razão do vale **como ele é hoje**, pelo efeito:

- **cX.1** — hoje o vale **toca** o orçamentário (partidas `ORCAMENTARIO` > 0 e classes de
  controle 5/6 presentes). Enquanto este esperado for verdadeiro, a cadeia extraorçamentária
  **não existe**, e nenhuma marcação de catálogo pode dizer que existe.
- **cX.2** — **INVARIANTE 4** já é verdade e não deve mudar: ΣD == ΣC **dentro de cada
  subsistema presente**, afirmado por propriedade (todo subsistema que aparecer entra na
  conferência sozinho), não por lista de nomes. E o ativo `1.1.3.1.1.01.01` é debitado por
  2.000,00 — 1.200,00 + 800,00, conta feita à mão.

Sobre **(d)**: a caracterização dos **4.200 contra 3.000** já mudou de cor na **rodada 3**, de
forma explicada e sem ser apagada — o bloco de comentário em
`m33-adiantamento-salarial-pago.test.ts` registra que o caso da rodada 2 afirmava o defeito e
virou os três casos que afirmam por que ele não acontece mais. **Nada a fazer nesta rodada.**

⚠️ E esses três casos assentam na premissa de que o vale **empenha**. Quando (a) chegar, eles
mudam de cor uma **segunda** vez, e pela mesma disciplina: transformados com a história
visível, nunca apagados.

## Pendência

`VALE-EXTRAORCAMENTARIO-SEM-FATO-DE-SAIDA-DE-CAIXA` — **bloqueio externo** (depende de
decisão do usuário sobre os três pontos acima), não escopo pendente de execução. A recusa e o
comportamento atuais permanecem de pé enquanto isso: o vale empenha, liquida e paga pela
cadeia orçamentária, e as duas guardas da duplicação continuam ativas e testadas.
