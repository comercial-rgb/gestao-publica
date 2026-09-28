# Varredura V20 — a virada das contas de controle (classes 5 e 6)

Levantada em 2026-09-28, antes de escrever codigo. Numeros medidos no banco de apresentacao
(`gestao_publica_apresentacao`), nao lembrados.

## A pendencia, como ela estava escrita

`ESTADO-EXECUCAO.md`, desde a V19:

> ⚠️ **`VIRADA-DAS-CLASSES-DE-CONTROLE-SEM-BORDA`** — `encerrarControlesOrcamentarios` (classes 5 e 6)
> existe, e censado, e nao tem borda; e ele depende de uma classificacao ENCERRA/TRANSFERE por conta
> de controle com saldo, que e decisao contabil do ente e nenhum seed pode adivinhar. Sem ela,
> dotacao inicial e credito disponivel seguem acumulando entre exercicios.

## O que JA existe, e e MUITO

| Peca | Onde | Estado |
|---|---|---|
| o servico | `modules/m08-restos-a-pagar/encerramento-controles.ts:140` | **completo**, com lock por exercicio, idempotencia derivada do saldo, perna derivada do SINAL, recusa de conta sintetica e fail-closed em conta sem destino |
| o estorno | mesmo arquivo, `zEstornarEncerramentoControlesInput` | existe |
| a tabela-parametro | `ContaNaVirada` (`m08-restos-a-pagar.prisma:207`) — `contaId` unico, `destino`, `justificativa` OBRIGATORIA | **existe no schema** |
| a acao no censo | `ENCERRAR_CONTROLES_ORCAMENTARIOS` | censada |
| a suite | `m08-encerramento-controles.test.ts` | existe, com t4d provando o lock por mutacao |

## O que NAO existe — medido

1. **Nenhum servico escreve `ContaNaVirada`.** Busca por `contaNaVirada.create|upsert|createMany` em
   `modules/`, `lib/`, `scripts/` e `prisma/`: **quatro ocorrencias, TODAS em arquivos de teste**
   (`m08-encerramento-controles.test.ts`, `m16-travamento.test.ts`, `m14-msc.test.ts`). A tabela e
   populada por fixture e por mais ninguem — logo, em instalacao real, ela esta VAZIA para sempre.
2. **Nenhuma porta e nenhuma tela** alcancam `encerrarControlesOrcamentarios` nem a classificacao.
3. **Nenhuma consulta** responde "quais contas de controle tem saldo em 31/12 e ainda nao foram
   classificadas" — que e a lista curta de que a tela precisa. Sem ela, o formulario ofereceria as
   **7.864 contas do plano**, que e o `select` inutil que a regra de interface proibe.

## O estado do banco de apresentacao, medido

`ContaNaVirada`: **0 linhas**. Exercicio 2026: **NAO encerrado** (`encerramento: null`).

Contas das classes 5 e 6 com saldo diferente de zero no corte de 31/12/2026 — **seis**:

| Conta | Natureza | Saldo | O que e |
|---|---|---|---|
| `5.2.2.1.1.01.00` | DEVEDORA | 660.000,00 | dotacao inicial fixada pela LOA |
| `6.2.1.1.0.00.00` | CREDORA | **-80.000,00** | saldo NEGATIVO — uma conta credora que ficou devedora |
| `6.2.1.2.0.00.00` | CREDORA | 80.000,00 | |
| `6.2.2.1.1.00.00` | CREDORA | 567.500,00 | credito disponivel |
| `6.2.2.1.3.03.00` | CREDORA | 12.500,00 | credito liquidado (a fila do art. 141: 8.000 + 4.500) |
| `6.2.2.1.3.04.00` | CREDORA | 80.000,00 | credito pago |

⚠️ **O SALDO NEGATIVO NAO E DEFEITO, E ELE E A PROVA DE QUE O SERVICO ESTA CERTO.** A perna que zera
uma conta sai do SINAL do saldo, nao de uma tabela de "qual lado essa conta costuma ter": credora com
saldo positivo morre com DEBITO, credora com saldo NEGATIVO morre com CREDITO. Conferido a mao, com
as seis contas todas como ENCERRA:

    ΣCREDITO = 660.000,00 (a 5.2.2, devedora positiva) + 80.000,00 (a 6.2.1.1, credora negativa) = 740.000,00
    ΣDEBITO  =  80.000,00 + 567.500,00 + 12.500,00 + 80.000,00                                   = 740.000,00

**Fecha.** E e `validarLancamento` do M01 que cobra isso: se alguem classificar uma perna do espelho
como TRANSFERE e a outra como ENCERRA, a soma deixa de fechar e o lancamento inteiro e recusado.

## As contas de RESTOS A PAGAR no plano oficial — o caso TRANSFERE

Medido: **33 contas** sob `5.3` e `6.3` no plano carregado. As analiticas que um ente usa na virada:

- `5.3.1.1.0.00.00` RP NAO PROCESSADOS INSCRITOS, `5.3.2.1.0.00.00` RP PROCESSADOS - INSCRITOS;
- `6.3.1.1.0.00.00` RP NAO PROCESSADOS A LIQUIDAR, `6.3.2.1.0.00.00` RP PROCESSADOS A PAGAR.

Essas **TRANSFEREM**: o resto a pagar inscrito em 31/12 e obrigacao viva em 1º/01, e o controle dele
atravessa a virada por construcao. Nenhuma delas tem saldo no banco de apresentacao **porque o
exercicio nao foi encerrado** — a inscricao e o que as move.

## A decisao de desenho desta unidade

### O que se constroi

1. **`classificarContaNaVirada`** — o servico que escreve `ContaNaVirada`, com acao PROPRIA no censo
   (`PARAMETRIZAR_VIRADA_DOS_CONTROLES`). ⚠️ **NAO se reusa `ENCERRAR_CONTROLES_ORCAMENTARIOS`**: e a
   mesma segregacao de C05 e do roteiro orcamentario — dizer que a dotacao CADUCA e decisao normativa
   do ente, e enterrar o orcamento e o ato de execucao. Quem executa nao deve poder reescrever a regua.
2. **`contasDaViradaComSaldo`** — a consulta que devolve a lista CURTA: as contas das classes 5 e 6
   com saldo no corte, cada uma com a classificacao que ja tem (ou a ausencia dela) e o destino
   SUGERIDO pela doutrina, que o operador confirma ou troca. ⚠️ Sugerir nao e decidir: o campo nasce
   preenchido e editavel, e a justificativa continua obrigatoria e vazia.
3. **A porta e a tela**, com os dois atos lado a lado.
4. O estorno do encerramento ganha borda no mesmo lugar (ele existe no dominio e nao tinha caminho).

### O que NAO se constroi, e por que

- **Nenhum seed classifica contas.** A ordem e explicita: "nenhum seed pode adivinhar". Um seed que
  classificasse as seis contas do banco de apresentacao daria uma demonstracao bonita e uma mentira
  de produto — o municipio receberia o sistema com a decisao contabil dele ja tomada por nos.
  ⚠️ **A CONSEQUENCIA ACEITA:** na demonstracao, a tela abre com as seis contas pendentes de
  classificacao e o ato recusado por duas razoes verdadeiras (falta classificacao; o exercicio nao
  esta encerrado). Classificar as seis pela tela e um passo de ~1 min, e ele DEMONSTRA a decisao em
  vez de escondê-la.
- **A virada nao entra no banco de apresentacao ja feita.** Encerrar o exercicio 2026 ali travaria a
  competencia e inutilizaria todos os outros passos da demonstracao (foi medido na V19). O percurso
  roda em clone.
