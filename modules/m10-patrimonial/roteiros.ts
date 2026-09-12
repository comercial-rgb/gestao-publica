import { z } from "zod";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { toMoney } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { comporPartidas } from "./dominio.js";
import type { TipoMovimentoPatrimonial } from "./dominio.js";

/**
 * ═══ M10 — A PARAMETRIZAÇÃO DO ROTEIRO CONTÁBIL DO PATRIMÔNIO (TR 5.10.1.71) ═══
 *
 * ⚠️ POR QUE ESTE ARQUIVO EXISTE, COM NÚMERO. `RoteiroPatrimonial` tinha **zero linhas** no
 * banco de desenvolvimento, e `RoteiroResultadoAlienacao` também. `MovimentoPatrimonial`
 * tinha zero. Não é coincidência: `roteiroDoTipo` é fail-closed e RECUSA todo movimento de
 * um tipo sem roteiro, com a mensagem "o M10 não inventa conta". O eixo financeiro do
 * patrimônio — avaliação, reavaliação, depreciação, baixa, alienação — estava **inteiro
 * inalcançável**, e não por falta de domínio: o domínio está provado desde o ENT05. Faltava
 * o ato de PARAMETRIZAR, e ele não existia em serviço nenhum.
 *
 * Quem escrevia essas tabelas, até aqui: os testes (por `createMany` cru) e o seed da POC,
 * que parametriza TRÊS dos treze tipos. O seed `roteiros-patrimoniais.ts` **não** as toca —
 * apesar do nome, ele semeia dívida ativa, dívida fundada e provisão.
 *
 * ═══ ⚠️ A CONFERÊNCIA DA CONTA CHAMA O MOTOR, E NÃO REESCREVE A REGRA ═══
 *
 * Um roteiro só presta se o lançamento que ele produz for aceito. Em vez de repetir aqui
 * "as duas pernas têm de ser de classe 1 a 4", este serviço COMPÕE o lançamento com
 * `comporPartidas` — a mesma função que `registrarMovimentoPatrimonial` chama — e deixa o
 * motor do M01 julgar. Se o motor recusar, o roteiro é recusado, com a mensagem DELE.
 *
 * A alternativa seria uma segunda verdade sobre a natureza de informação, e ela divergiria
 * no dia em que o MCASP mudasse uma classe: a tela aceitaria um roteiro que todo movimento
 * depois recusaria — e a recusa chegaria meses adiante, longe de quem a causou.
 *
 * ═══ ⚠️ O QUE ESTE SERVIÇO **NÃO** FAZ, E ESTÁ NOMEADO ═══
 *
 * **Ele não escolhe as contas.** Qual par débito/crédito corresponde a cada evento é
 * doutrina contábil do ente, não dado que o arquivo do TCE forneça — é a mesma distinção que
 * `prisma/seed/roteiros-patrimoniais.ts` já faz entre FATO e ESCOLHA. O sistema oferece as
 * analíticas do PCASP oficial e recusa o que o motor recusaria; quem decide é o contador.
 *
 * **Ele não versiona o roteiro.** Substituir um par perde o anterior: a tabela não tem
 * histórico, e inventar um aqui seria migration nova num lote de superfície. O ato fica
 * registrado em `RegistroDeOperacao` (TR 6.3), por `comEscritaAutenticada` — quem trocou e
 * quando se responde por lá. Pendência **`ROTEIRO-SEM-HISTORICO-PROPRIO`**.
 *
 * **E substituir NÃO remexe lançamento já gravado.** O razão é append-only: o roteiro novo
 * vale para os movimentos seguintes, e os anteriores continuam apontando para onde
 * apontavam. A tela diz isso a quem clica, porque a expectativa oposta — "corrigi o roteiro,
 * logo corrigi o passado" — é a que faz alguém deixar de emitir o lançamento de correção.
 */

const zCodigoDeConta = z.string().min(1);

export const zParametrizarRoteiroPatrimonialInput = z.object({
  tipo: z.string().min(1),
  contaDebitoId: zCodigoDeConta,
  contaCreditoId: zCodigoDeConta,
  /**
   * ⚠️ SUBSTITUIR É ATO EXPLÍCITO. Sem esta bandeira, parametrizar um tipo que já tem
   * roteiro é RECUSADO nomeando o par vigente. Sobrescrever em silêncio pelo formulário de
   * criação mudaria a contabilidade futura de um evento sem que ninguém tivesse pedido —
   * e o operador que digitou o tipo errado nem saberia o que desfez.
   */
  substituir: z.boolean().default(false),
  criadoPor: z.string().min(1),
});
export type ParametrizarRoteiroPatrimonialInput = z.input<
  typeof zParametrizarRoteiroPatrimonialInput
>;

export const zParametrizarRoteiroResultadoAlienacaoInput = z.object({
  chave: z.string().min(1),
  contaDebitoId: zCodigoDeConta,
  contaCreditoId: zCodigoDeConta,
  substituir: z.boolean().default(false),
  criadoPor: z.string().min(1),
});
export type ParametrizarRoteiroResultadoAlienacaoInput = z.input<
  typeof zParametrizarRoteiroResultadoAlienacaoInput
>;

/** O mesmo alias que `patrimonio.ts` e `gestao-do-bem.ts` usam — a `tx` da transação. */
type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

interface ContaConferida {
  readonly id: string;
  readonly codigo: string;
  readonly nome: string;
}

/**
 * A conta existe, é ANALÍTICA e é conhecida — ou a recusa diz qual das três falhou.
 *
 * ⚠️ A SINTÉTICA É RECUSADA AQUI, E NÃO SÓ NO MOVIMENTO. `partidasParaPersistir` já a
 * recusaria na hora de lançar, mas aí a recusa chegaria ao operador do BEM, meses depois,
 * falando de um roteiro que outra pessoa parametrizou. O erro pertence a quem o cometeu.
 */
async function conferirConta(
  tx: Tx,
  contaId: string,
  perna: "débito" | "crédito"
): Promise<ContaConferida> {
  const c = await tx.contaPcasp.findUnique({
    where: { id: contaId },
    select: { id: true, codigo: true, nome: true, analitica: true },
  });
  if (c === null) {
    throw new Error(
      `A conta de ${perna} não existe no plano de contas. O roteiro NÃO foi gravado: ` +
        `um roteiro apontando para conta inexistente faria todo movimento deste evento ` +
        `falhar na hora de lançar.`
    );
  }
  if (!c.analitica) {
    throw new Error(
      `A conta de ${perna} ${c.codigo} — ${c.nome} é SINTÉTICA e não recebe lançamento. ` +
        `O roteiro NÃO foi gravado: escolha a conta do último nível de desdobramento, que ` +
        `é a única que aceita partida.`
    );
  }
  return { id: c.id, codigo: c.codigo, nome: c.nome };
}

/**
 * O ROTEIRO É VÁLIDO SE O LANÇAMENTO QUE ELE PRODUZ FOR ACEITO — pelo motor de verdade.
 *
 * ⚠️ O VALOR DE UM REAL É INSTRUMENTAL e nunca é gravado: `comporPartidas` exige valor > 0
 * para poder validar, e o que se está perguntando é sobre as CONTAS, não sobre o montante.
 * É a mesma anatomia de um `dry-run`: chamar o julgador real com uma entrada mínima em vez
 * de reimplementar o julgamento.
 */
function conferirContraOMotor(
  debito: ContaConferida,
  credito: ContaConferida
): void {
  if (debito.id === credito.id) {
    throw new Error(
      `Débito e crédito apontam para a MESMA conta (${debito.codigo} — ${debito.nome}). ` +
        `O lançamento fecharia — ΣD igual a ΣC — e não moveria nada: o saldo da conta ` +
        `voltaria ao que era. O roteiro NÃO foi gravado.`
    );
  }
  try {
    comporPartidas(toMoney("1.00"), {
      contaDebito: debito.codigo,
      contaCredito: credito.codigo,
    });
  } catch (e) {
    throw new Error(
      `Este par de contas não forma um lançamento patrimonial válido, e o roteiro NÃO foi ` +
        `gravado. O motor contábil recusou: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}

/**
 * PARAMETRIZA O ROTEIRO DE UM TIPO DE MOVIMENTO PATRIMONIAL.
 *
 * ⚠️ ESTORNO NÃO TEM ROTEIRO, e a recusa é nomeada. O lançamento de estorno é gerado pelo
 * motor do M01 invertendo as pernas do original (`gerarEstorno`) — parametrizar um
 * `ESTORNO_*` criaria uma segunda fonte para o mesmo par, e no dia em que as duas
 * divergissem o estorno deixaria de desfazer o que o original fez.
 */
export async function parametrizarRoteiroPatrimonial(
  prisma: PrismaClient,
  input: ParametrizarRoteiroPatrimonialInput
): Promise<{ readonly roteiroId: string; readonly substituiu: boolean }> {
  const d = zParametrizarRoteiroPatrimonialInput.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(
      tx,
      d.criadoPor,
      ACAO_DO_SERVICO.parametrizarRoteiroPatrimonial,
      "ENTE"
    );

    if (d.tipo.startsWith("ESTORNO_")) {
      throw new Error(
        `${d.tipo} é um ESTORNO, e estorno NÃO tem roteiro próprio: o lançamento contrário ` +
          `é gerado invertendo as pernas do movimento original. Parametrize o tipo que ele ` +
          `desfaz. Nada foi gravado.`
      );
    }

    const [debito, credito] = await Promise.all([
      conferirConta(tx, d.contaDebitoId, "débito"),
      conferirConta(tx, d.contaCreditoId, "crédito"),
    ]);
    conferirContraOMotor(debito, credito);

    const vigente = await tx.roteiroPatrimonial.findUnique({
      where: { tipo: d.tipo as TipoMovimentoPatrimonial },
      select: {
        id: true,
        contaDebito: { select: { codigo: true, nome: true } },
        contaCredito: { select: { codigo: true, nome: true } },
      },
    });

    if (vigente !== null && !d.substituir) {
      throw new Error(
        `O tipo ${d.tipo} JÁ TEM roteiro: débito em ${vigente.contaDebito.codigo} — ` +
          `${vigente.contaDebito.nome}, crédito em ${vigente.contaCredito.codigo} — ` +
          `${vigente.contaCredito.nome}. Nada foi gravado. Para trocar as contas, abra o ` +
          `roteiro e use a reparametrização: ela é um ato à parte porque muda a ` +
          `contabilidade dos movimentos FUTUROS deste evento.`
      );
    }

    if (vigente !== null) {
      await tx.roteiroPatrimonial.update({
        where: { id: vigente.id },
        data: {
          contaDebitoId: debito.id,
          contaCreditoId: credito.id,
          criadoPor: d.criadoPor,
        },
      });
      return { roteiroId: vigente.id, substituiu: true };
    }

    const criado = await tx.roteiroPatrimonial.create({
      data: {
        tipo: d.tipo as TipoMovimentoPatrimonial,
        contaDebitoId: debito.id,
        contaCreditoId: credito.id,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { roteiroId: criado.id, substituiu: false };
  });
}

/**
 * PARAMETRIZA O ROTEIRO DO GANHO OU DA PERDA NA ALIENAÇÃO (TR 4.65).
 *
 * ⚠️ ELE NÃO É UM TIPO DE MOVIMENTO, e é por isso que mora em tabela própria: o ganho não
 * muda o ativo — o bem já saiu pela baixa. É um lançamento de RESULTADO, e enfiá-lo no enum
 * dos movimentos poluiria os dois Records exaustivos que seguram a corretude do módulo.
 */
export async function parametrizarRoteiroResultadoAlienacao(
  prisma: PrismaClient,
  input: ParametrizarRoteiroResultadoAlienacaoInput
): Promise<{ readonly roteiroId: string; readonly substituiu: boolean }> {
  const d = zParametrizarRoteiroResultadoAlienacaoInput.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(
      tx,
      d.criadoPor,
      ACAO_DO_SERVICO.parametrizarRoteiroResultadoAlienacao,
      "ENTE"
    );

    const [debito, credito] = await Promise.all([
      conferirConta(tx, d.contaDebitoId, "débito"),
      conferirConta(tx, d.contaCreditoId, "crédito"),
    ]);
    conferirContraOMotor(debito, credito);

    const chave = d.chave as "GANHO_ALIENACAO" | "PERDA_ALIENACAO";
    const vigente = await tx.roteiroResultadoAlienacao.findUnique({
      where: { chave },
      select: {
        id: true,
        contaDebito: { select: { codigo: true, nome: true } },
        contaCredito: { select: { codigo: true, nome: true } },
      },
    });

    if (vigente !== null && !d.substituir) {
      throw new Error(
        `${d.chave} JÁ TEM roteiro: débito em ${vigente.contaDebito.codigo} — ` +
          `${vigente.contaDebito.nome}, crédito em ${vigente.contaCredito.codigo} — ` +
          `${vigente.contaCredito.nome}. Nada foi gravado. Para trocar as contas, abra o ` +
          `roteiro e use a reparametrização.`
      );
    }

    if (vigente !== null) {
      await tx.roteiroResultadoAlienacao.update({
        where: { id: vigente.id },
        data: {
          contaDebitoId: debito.id,
          contaCreditoId: credito.id,
          criadoPor: d.criadoPor,
        },
      });
      return { roteiroId: vigente.id, substituiu: true };
    }

    const criado = await tx.roteiroResultadoAlienacao.create({
      data: {
        chave,
        contaDebitoId: debito.id,
        contaCreditoId: credito.id,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { roteiroId: criado.id, substituiu: false };
  });
}
