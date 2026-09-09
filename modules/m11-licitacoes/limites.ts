import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { toMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { LIMITES_OFICIAIS } from "../../prisma/seed/dados/limites-contratacao.js";
import {
  estouraOTeto,
  tetoDaDispensa,
  zCadastrarLimiteInput,
  type CadastrarLimiteInput,
  type HipoteseDispensa,
  type LimiteVigente,
} from "./dominio.js";

/**
 * OS LIMITES DA CONTRATAÇÃO DIRETA (TR 5.106; art. 75, I e II, Lei 14.133/2021).
 *
 * APPEND-ONLY: decreto novo = LINHA NOVA. Nunca um UPDATE — senão o contrato de
 * 2026, ao ser reauditado em 2027, seria julgado por um teto que não existia
 * quando ele foi assinado.
 */

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

export async function cadastrarLimite(
  prisma: Tx,
  input: CadastrarLimiteInput
): Promise<{ readonly limiteId: string }> {
  const d = zCadastrarLimiteInput.parse(input);
  // SEM UG: o limite da contratação direta é NORMA (art. 75 da Lei 14.133) — vale para o ente inteiro.
  await autorizarNo(prisma, d.criadoPor, ACAO_DO_SERVICO.cadastrarLimite, "ENTE");


  const criado = await prisma.limiteContratacao.create({
    data: {
      vigenciaInicio: d.vigenciaInicio,
      fonteLegal: d.fonteLegal,
      limiteObrasEngenharia: d.limiteObrasEngenharia.toFixed(2),
      limiteComprasServicos: d.limiteComprasServicos.toFixed(2),
      limiteControleInternoObras:
        d.limiteControleInternoObras?.toFixed(2) ?? null,
      limiteControleInternoCompras:
        d.limiteControleInternoCompras?.toFixed(2) ?? null,
      criadoPor: d.criadoPor,
    },
    select: { id: true },
  });
  return { limiteId: criado.id };
}

/** Semeia os limites OFICIAIS (dado colado, não digitado — ver o arquivo). */
export async function semearLimitesOficiais(
  prisma: Tx,
  criadoPor: string
): Promise<void> {
  for (const l of LIMITES_OFICIAIS) {
    await cadastrarLimite(prisma, {
      vigenciaInicio: new Date(l.vigenciaInicio),
      fonteLegal: l.fonteLegal,
      limiteObrasEngenharia: l.limiteObrasEngenharia,
      limiteComprasServicos: l.limiteComprasServicos,
      criadoPor,
    });
  }
}

/**
 * O LIMITE VIGENTE NUMA DATA — derivação, nunca coluna "ativo".
 *
 * É o de MAIOR `vigenciaInicio` <= data. Uma flag `ativo` precisaria de alguém para
 * virá-la na virada do ano, e é exatamente a pessoa que esquece.
 */
export async function limiteVigenteEm(
  prisma: Tx,
  data: Date
): Promise<LimiteVigente | null> {
  const l = await prisma.limiteContratacao.findFirst({
    where: { vigenciaInicio: { lte: data } },
    orderBy: { vigenciaInicio: "desc" },
  });
  if (l === null) return null;

  return {
    fonteLegal: l.fonteLegal,
    vigenciaInicio: l.vigenciaInicio,
    obrasEngenharia: toMoney(l.limiteObrasEngenharia.toFixed(2)),
    comprasServicos: toMoney(l.limiteComprasServicos.toFixed(2)),
    controleInternoObras:
      l.limiteControleInternoObras === null
        ? null
        : toMoney(l.limiteControleInternoObras.toFixed(2)),
    controleInternoCompras:
      l.limiteControleInternoCompras === null
        ? null
        : toMoney(l.limiteControleInternoCompras.toFixed(2)),
  };
}

/**
 * O GUARD DO TETO — usado no cadastro do contrato E no aditivo.
 *
 * ⚠️ O LIMITE É O **DA DATA DO FATO**, não o de hoje. Um aditivo assinado em 2027 é
 * julgado pelo decreto de 2027; o contrato de 2026, pelo de 2026. Julgar tudo pelo
 * limite corrente faria um contrato legítimo virar irregular só porque o ano virou
 * — e faria o inverso também, o que é pior.
 *
 * FAIL-CLOSED: sem limite vigente na data, NÃO se aprova a dispensa. Deixar passar
 * "porque o parâmetro não está cadastrado" é o modo mais silencioso de legalizar o
 * que a lei proíbe.
 */
export async function exigirTetoDaDispensa(
  prisma: Tx,
  p: {
    readonly hipotese: HipoteseDispensa;
    readonly data: Date;
    readonly valor: Money;
    readonly identificacao: string;
  }
): Promise<void> {
  const limite = await limiteVigenteEm(prisma, p.data);
  if (limite === null) {
    throw new Error(
      `SEM LIMITE DE CONTRATAÇÃO VIGENTE em ${p.data.toISOString()}: ` +
        `${p.identificacao} é dispensa POR VALOR (art. 75), e não há decreto de ` +
        `limites cadastrado para essa data. Sem o teto não há como dizer se a ` +
        `dispensa é legal — e aprovar "porque o parâmetro falta" é legalizar por ` +
        `omissão. Cadastre o limite vigente na época do fato.`
    );
  }

  const teto = tetoDaDispensa(p.hipotese, limite);
  if (teto === null) return; // hipótese sem teto (OUTRAS) — não é por valor

  if (estouraOTeto(p.valor, teto)) {
    const oficial =
      p.hipotese === "POR_VALOR_OBRAS"
        ? limite.obrasEngenharia
        : limite.comprasServicos;
    const interno =
      p.hipotese === "POR_VALOR_OBRAS"
        ? limite.controleInternoObras
        : limite.controleInternoCompras;

    throw new Error(
      `LIMITE DA DISPENSA ESTOURADO (${p.identificacao}): ` +
        `${p.valor.toFixed(2)} não é INFERIOR ao teto ${teto.toFixed(2)}. ` +
        `O art. 75 autoriza a dispensa para "valores inferiores a" — o valor IGUAL ` +
        `ao teto já não está dispensado. Teto = MIN(oficial ` +
        `${oficial.toFixed(2)}, controle interno ` +
        `${interno === null ? "—" : interno.toFixed(2)}), por ` +
        `${limite.fonteLegal}. Licite, ou reduza o valor.`
    );
  }
}
