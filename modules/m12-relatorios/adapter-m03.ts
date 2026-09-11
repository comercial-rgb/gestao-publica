import { toMoney, type Money } from "../../packages/contracts/index.js";
import type {
  ExcessoArrecadacaoPort,
  M03Deps,
  OperacaoCreditoPort,
  SuperavitFinanceiroPort,
  TxDoCredito,
} from "../m03-creditos/ports.js";
import { criarM03Deps } from "../m03-creditos/adapter-prisma.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { previsaoPorFonte } from "../m02-planejamento/consultas.js";
import { arrecadadoPorFonte } from "../m04-receita/consultas.js";
import { linhasDoSuperavitPorFonte } from "./superavit-por-fonte.js";
import { janelaCivilDoAno } from "../../packages/datas/index.js";

/**
 * M12 × M03 — O ÚNICO LUGAR ONDE OS DOIS SE ENCONTRAM (TR 4.37/4.39).
 *
 * O M03 declara a PERGUNTA (`SuperavitFinanceiroPort`); o M12 — dono da aritmética do
 * superávit por fonte — dá a RESPOSTA. A seta aponta só de m12 → m03, e não há ciclo:
 * o M03 não importa relatório nenhum. Mesmo desenho do `ContaReservadaPort` (M04←M10) e
 * do `ContratoPort` (M05←M11).
 *
 * ⚠️ ZERO SEGUNDA ARITMÉTICA. A resposta sai de `linhasDoSuperavitPorFonte` — a MESMA
 * função que o Anexo 14 usa para publicar o número. Somar receita, pagamento, retenção e
 * restos de novo aqui criaria uma segunda verdade sobre o mesmo dinheiro, e o dia em que
 * ela divergisse o guard autorizaria crédito contra um superávit que o relatório não
 * reconhece.
 */

/**
 * ⚠️ O CORTE É 31/12 DO EXERCÍCIO ANTERIOR — a data do FATO, não a do encerramento.
 *
 * O `EncerramentoExercicio` só tem `criadoEm` (quando alguém apertou o botão), e ele cai
 * em janeiro, fevereiro, às vezes março do ano seguinte. Usar essa data como corte
 * puxaria para dentro do superávit de E-1 a receita de janeiro de E — dinheiro do
 * exercício NOVO lastreando crédito do exercício NOVO, contado duas vezes.
 *
 * O que o encerramento significa aqui é OUTRA coisa: ele é a CONDIÇÃO (o exercício está
 * fechado, logo o superávit dele é apurável), não o CORTE. O corte é o fim do exercício.
 *
 * E o superávit NÃO é congelado numa coluna: ele é relido dos fatos a cada pergunta. Um
 * fato de E-1 lançado DEPOIS do encerramento (o que o append-only permite, e a vida
 * exige) muda o superávit — e o guard tem de enxergar a mudança. É a "redução" que ele
 * pega: o que já se usou pode deixar de caber.
 */
function fimDoExercicio(ano: number): Date {
  return janelaCivilDoAno(ano).fim;
}

export function criarSuperavitFinanceiroPortPrisma(): SuperavitFinanceiroPort {
  return {
    async superavitDaFonte(
      tx: TxDoCredito,
      fonteId: string,
      exercicioAnterior: number
    ): Promise<Money | null> {
      // Sem exercício anterior aberto, ou sem ENCERRAMENTO dele, não há foto contra a
      // qual conferir. `null` = não há resposta — e o M03 sabe a diferença entre isso e
      // um superávit de zero.
      const exercicio = await tx.exercicio.findUnique({
        where: { ano: exercicioAnterior },
        select: { encerramento: { select: { id: true } } },
      });
      if (exercicio === null || exercicio.encerramento === null) return null;

      const { porFonteId } = await linhasDoSuperavitPorFonte(tx, {
        corte: fimDoExercicio(exercicioAnterior),
      });

      // Fonte SEM fato nenhum em E-1 não aparece nas linhas — e o superávit dela é
      // ZERO, não "desconhecido". Uma fonte que não arrecadou nada não sobrou nada.
      return porFonteId.get(fonteId) ?? toMoney("0.00");
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXCESSO DE ARRECADAÇÃO (TR 4.37)
// ═══════════════════════════════════════════════════════════════════════════

export function criarExcessoArrecadacaoPortPrisma(): ExcessoArrecadacaoPort {
  return {
    async excessoDaFonte(
      tx: TxDoCredito,
      fonteId: string,
      exercicio: number,
      dataDoFato: Date
    ): Promise<Money | null> {
      // ⚠️ ZERO SEGUNDA ARITMÉTICA: os dois lados vêm dos DONOS. O arrecadado é do M04
      // (a mesma função do Anexo 14 e do superávit por fonte); o previsto é do M02
      // (dono da ReceitaPrevista, e é lá que a DEDUÇÃO subtrai).
      const [arrecadado, previsto] = await Promise.all([
        arrecadadoPorFonte(tx, { ate: dataDoFato }),
        previsaoPorFonte(tx, { exercicio }),
      ]);

      // SEM PREVISÃO CADASTRADA = DADO AUSENTE, e isso NÃO é excesso zero. "Excesso" é
      // o que passou DA PREVISÃO; sem ela, a subtração não tem minuendo. Tratar a
      // ausência como previsão zero faria TODO o arrecadado virar excesso — o número
      // mais generoso possível, saído justamente do dado que falta.
      const previsaoDaFonte = previsto.get(fonteId);
      if (previsaoDaFonte === undefined) return null;

      const arrecadadoDaFonte = arrecadado.get(fonteId) ?? toMoney("0.00");
      const diferenca = toMoney(arrecadadoDaFonte.minus(previsaoDaFonte));

      // max(0, ...) — arrecadar MENOS do que se previu não é excesso NEGATIVO (isso
      // seria um crédito a devolver, que não existe): é excesso ZERO. E zero é uma
      // RESPOSTA — ela barra o crédito, e não cai no fail-open.
      return diferenca.greaterThan(0) ? diferenca : toMoney("0.00");
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// OPERAÇÃO DE CRÉDITO (TR 4.37)
// ═══════════════════════════════════════════════════════════════════════════

export function criarOperacaoCreditoPortPrisma(): OperacaoCreditoPort {
  return {
    async arrecadadoOperacaoCredito(
      tx: TxDoCredito,
      fonteId: string,
      dataDoFato: Date
    ): Promise<Money | null> {
      // O RECORTE, não uma soma nova: a MESMA `arrecadadoPorFonte`, filtrada pela
      // ORIGEM da natureza (2º dígito — o classificador de ef6f559). O convênio (2.4)
      // e a alienação (2.2) entram na fonte pelo mesmo caixa, e NÃO lastreiam crédito
      // por operação de crédito: ninguém tem de devolvê-los.
      const porFonte = await arrecadadoPorFonte(tx, {
        ate: dataDoFato,
        origem: "OPERACOES_DE_CREDITO",
      });

      // ⚠️ ZERO, NÃO `null`. A fonte que não recebeu empréstimo nenhum tem uma
      // RESPOSTA: não há o que lastrear. Devolver `null` aqui faria o fail-open
      // liberar crédito por operação de crédito num ente que nunca tomou uma — e o
      // fail-open existe para o dado AUSENTE, não para o dado que diz "não".
      return porFonte.get(fonteId) ?? toMoney("0.00");
    },
  };
}

/**
 * As deps do M03 COM as três amarrações ligadas: a disponibilidade declarada deixa de
 * ser palavra em TODAS as origens de recurso novo (TR 4.37 completo).
 */
export function criarM03DepsAmarrado(prisma: PrismaClient): M03Deps {
  return criarM03Deps(prisma, {
    superavit: criarSuperavitFinanceiroPortPrisma(),
    excesso: criarExcessoArrecadacaoPortPrisma(),
    operacaoCredito: criarOperacaoCreditoPortPrisma(),
  });
}
