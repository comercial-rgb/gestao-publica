import { z } from "zod";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { toMoney } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { comporPartidas, TIPOS_BASE } from "./dominio.js";
import type { TipoMovimentoPatrimonial } from "./dominio.js";
import type { AcaoDoSistema } from "../m16-travamento/acoes.js";
import { TEM_ROTEIRO_ALMOXARIFADO } from "./almoxarifado.js";
import type { TipoMovimentoAlmoxarifado } from "./almoxarifado.js";

const zCodigoDeConta = z.string().min(1);

// ═══════════════════════════════════════════════════════════════════════════
// ORQUESTRAÇÃO V3 (4.5) — AS VERSÕES DO ROTEIRO, APPEND-ONLY
//
// ⚠️ O QUE ISTO CORRIGE. Até aqui `RoteiroPatrimonial` tinha UMA linha por evento, e a
// reparametrização a atualizava em silêncio: versão anterior, autor e motivo se perdiam,
// e um lançamento antigo não sabia dizer com que par de contas tinha sido feito. Agora
// cada parametrização é uma LINHA NOVA em `VersaoDeRoteiro`, com motivo obrigatório;
// PROPOR (validação estrutural pelo motor) e PUBLICAR (a aprovação, que põe em vigor)
// são atos separados, com crachás separados; a vigência é DERIVADA (a PUBLICADA mais
// recente vale, e a anterior termina onde a seguinte começa); e o movimento grava a
// versão que usou (`MovimentoPatrimonial.versaoDeRoteiroId`). Nenhum lançamento
// anterior é reescrito. As tabelas legadas ficam só-leitura, como origem.
//
// ⚠️ CONCORRÊNCIA E REPETIÇÃO, sem sobrescrita silenciosa: o número da versão nasce de
// max + 1 dentro da transação e é ÚNICO por (família, chave) — duas propostas ao mesmo
// tempo não se sobrescrevem, a segunda estoura no índice e é recusada nomeando; repetir
// o mesmo comando (a proposta idêntica à pendente, ou o par já vigente) é recusado
// nomeando também. Publicar é `updateMany` guardado pela situação: dois cliques no mesmo
// "publicar" — o segundo encontra a versão já publicada e é recusado.
// ═══════════════════════════════════════════════════════════════════════════

export type FamiliaDeRoteiro = "PATRIMONIAL" | "RESULTADO_ALIENACAO" | "ALMOXARIFADO";
const zFamilia = z.enum(["PATRIMONIAL", "RESULTADO_ALIENACAO"]);

/** A ação de PUBLICAR — separada de parametrizar. Constante (ver a nota no parametrizar). */
const A_ACAO_DE_PUBLICAR: AcaoDoSistema = "PUBLICAR_ROTEIRO_PATRIMONIAL";

export const zProporVersaoDeRoteiroInput = z.object({
  familia: zFamilia,
  chave: z.string().min(1),
  contaDebitoId: zCodigoDeConta,
  contaCreditoId: zCodigoDeConta,
  motivo: z
    .string()
    .trim()
    .min(8, "O motivo da versão é obrigatório e precisa dizer POR QUE as contas mudam — quem ler o histórico daqui a um ano não terá a quem perguntar."),
  criadoPor: z.string().min(1),
});
export type ProporVersaoDeRoteiroInput = z.input<typeof zProporVersaoDeRoteiroInput>;

export const zPublicarVersaoDeRoteiroInput = z.object({
  versaoId: z.string().min(1),
  criadoPor: z.string().min(1),
});
export type PublicarVersaoDeRoteiroInput = z.input<typeof zPublicarVersaoDeRoteiroInput>;

function conferirChave(familia: FamiliaDeRoteiro, chave: string): void {
  if (familia === "PATRIMONIAL") {
    if (chave.startsWith("ESTORNO_")) {
      throw new Error(
        `${chave} é um ESTORNO, e estorno NÃO tem roteiro próprio: o lançamento contrário ` +
          `é gerado invertendo as pernas do movimento original. Parametrize o tipo que ele ` +
          `desfaz. Nada foi gravado.`
      );
    }
    if (!(TIPOS_BASE as readonly string[]).includes(chave)) {
      throw new Error(`${chave} não é um evento patrimonial conhecido. Nada foi gravado.`);
    }
    return;
  }
  if (familia === "ALMOXARIFADO") {
    if (!(TIPOS_DO_ROTEIRO_ALMOXARIFADO as readonly string[]).includes(chave)) {
      throw new Error(`${chave} não é um movimento do almoxarifado com roteiro próprio. Nada foi gravado.`);
    }
    return;
  }
  if (chave !== "GANHO_ALIENACAO" && chave !== "PERDA_ALIENACAO") {
    throw new Error(`${chave} não é uma chave de resultado da alienação. Nada foi gravado.`);
  }
}

export interface VersaoVigente {
  readonly id: string;
  readonly numero: number;
  readonly contaDebito: string;
  readonly contaCredito: string;
}

/**
 * A VERSÃO EM VIGOR de um roteiro — a PUBLICADA de `publicadaEm` mais recente. `null`
 * quando nenhuma versão foi publicada (o resolvedor do M10 então olha a linha legada).
 */
export async function versaoVigente(
  tx: Tx,
  familia: FamiliaDeRoteiro,
  chave: string
): Promise<VersaoVigente | null> {
  const v = await tx.versaoDeRoteiro.findFirst({
    where: { familia, chave, situacao: "PUBLICADA" },
    orderBy: [{ publicadaEm: "desc" }, { numero: "desc" }],
    select: {
      id: true,
      numero: true,
      contaDebito: { select: { codigo: true } },
      contaCredito: { select: { codigo: true } },
    },
  });
  if (v === null) return null;
  return { id: v.id, numero: v.numero, contaDebito: v.contaDebito.codigo, contaCredito: v.contaCredito.codigo };
}

interface ParVigente {
  readonly contaDebito: { readonly id: string; readonly codigo: string; readonly nome: string };
  readonly contaCredito: { readonly id: string; readonly codigo: string; readonly nome: string };
}

/** O par em vigor — a versão publicada, ou a linha legada enquanto não houver versão. */
async function vigenteOuLegado(
  tx: Tx,
  familia: FamiliaDeRoteiro,
  chave: string
): Promise<ParVigente | null> {
  const sel = {
    contaDebito: { select: { id: true, codigo: true, nome: true } },
    contaCredito: { select: { id: true, codigo: true, nome: true } },
  } as const;
  const v = await tx.versaoDeRoteiro.findFirst({
    where: { familia, chave, situacao: "PUBLICADA" },
    orderBy: [{ publicadaEm: "desc" }, { numero: "desc" }],
    select: sel,
  });
  if (v !== null) return v;
  if (familia === "PATRIMONIAL") {
    return tx.roteiroPatrimonial.findUnique({ where: { tipo: chave as TipoMovimentoPatrimonial }, select: sel });
  }
  if (familia === "ALMOXARIFADO") {
    return tx.roteiroAlmoxarifado.findUnique({ where: { tipo: chave as TipoMovimentoAlmoxarifado }, select: sel });
  }
  return tx.roteiroResultadoAlienacao.findUnique({
    where: { chave: chave as "GANHO_ALIENACAO" | "PERDA_ALIENACAO" },
    select: sel,
  });
}

/** Cria a versão (PROPOSTA), com o número seguinte — a concorrência é do índice único. */
async function criarVersaoNaTx(
  tx: Tx,
  p: {
    readonly familia: FamiliaDeRoteiro;
    readonly chave: string;
    readonly debito: ContaConferida;
    readonly credito: ContaConferida;
    readonly motivo: string;
    readonly criadoPor: string;
  }
): Promise<{ readonly id: string; readonly numero: number }> {
  const ultima = await tx.versaoDeRoteiro.aggregate({
    where: { familia: p.familia, chave: p.chave },
    _max: { numero: true },
  });
  const numero = (ultima._max.numero ?? 0) + 1;
  try {
    return await tx.versaoDeRoteiro.create({
      data: {
        familia: p.familia,
        chave: p.chave,
        numero,
        contaDebitoId: p.debito.id,
        contaCreditoId: p.credito.id,
        motivo: p.motivo,
        criadoPor: p.criadoPor,
      },
      select: { id: true, numero: true },
    });
  } catch (e) {
    const codigo = (e as { code?: string }).code;
    if (codigo === "P2002") {
      throw new Error(
        `CONCORRÊNCIA: outra versão do roteiro de ${p.chave} nasceu enquanto esta era ` +
          `proposta (a versão ${numero} já existe). Nada foi sobrescrito e nada seu foi ` +
          `gravado — recarregue, leia a versão que entrou, e proponha de novo se ainda fizer sentido.`
      );
    }
    throw e;
  }
}

/** Publica a versão — `updateMany` guardado pela situação: o segundo clique é recusado. */
async function publicarNaTx(tx: Tx, versaoId: string, publicadaPor: string, agora = new Date()): Promise<void> {
  const r = await tx.versaoDeRoteiro.updateMany({
    where: { id: versaoId, situacao: "PROPOSTA" },
    data: { situacao: "PUBLICADA", publicadaEm: agora, publicadaPor },
  });
  if (r.count !== 1) {
    throw new Error(
      `A versão ${versaoId} não está mais PROPOSTA — ou já foi publicada (o mesmo comando ` +
        `repetido), ou não existe. Nada foi gravado de novo.`
    );
  }
}

/**
 * PROPÕE uma versão: valida a chave, as contas e o par contra o MOTOR (a validação
 * estrutural), e grava a versão como PROPOSTA. Ninguém lança por ela até a publicação.
 */
export async function proporVersaoDeRoteiro(
  prisma: PrismaClient,
  input: ProporVersaoDeRoteiroInput
): Promise<{ readonly versaoId: string; readonly numero: number }> {
  const d = zProporVersaoDeRoteiroInput.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.proporVersaoDeRoteiro, "ENTE");
    conferirChave(d.familia, d.chave);

    const [debito, credito] = await Promise.all([
      conferirConta(tx, d.contaDebitoId, "débito"),
      conferirConta(tx, d.contaCreditoId, "crédito"),
    ]);
    conferirContraOMotor(debito, credito);

    // ⚠️ REPETIÇÃO DO MESMO COMANDO, recusada nomeando: o par já vigente não é uma versão
    // nova, e uma proposta idêntica à pendente é o mesmo pedido duas vezes.
    const vigente = await vigenteOuLegado(tx, d.familia, d.chave);
    if (vigente !== null && vigente.contaDebito.id === debito.id && vigente.contaCredito.id === credito.id) {
      throw new Error(
        `As contas propostas para ${d.chave} são exatamente as já em vigor (débito ` +
          `${debito.codigo}, crédito ${credito.codigo}). Não há o que versionar. Nada foi gravado.`
      );
    }
    const pendenteIgual = await tx.versaoDeRoteiro.findFirst({
      where: { familia: d.familia, chave: d.chave, situacao: "PROPOSTA", contaDebitoId: debito.id, contaCreditoId: credito.id },
      select: { numero: true },
    });
    if (pendenteIgual !== null) {
      throw new Error(
        `Já há uma proposta idêntica pendente para ${d.chave} (versão ${pendenteIgual.numero}). ` +
          `Publique-a ou proponha outro par. Nada foi gravado de novo.`
      );
    }

    const v = await criarVersaoNaTx(tx, { familia: d.familia, chave: d.chave, debito, credito, motivo: d.motivo, criadoPor: d.criadoPor });
    return { versaoId: v.id, numero: v.numero };
  });
}

/**
 * PUBLICA uma versão proposta — a aprovação. A partir daqui os movimentos FUTUROS do
 * evento lançam por ela; os anteriores continuam apontando para a versão que usaram.
 */
export async function publicarVersaoDeRoteiro(
  prisma: PrismaClient,
  input: PublicarVersaoDeRoteiroInput
): Promise<{ readonly versaoId: string; readonly numero: number; readonly substituiuNumero: number | null }> {
  const d = zPublicarVersaoDeRoteiroInput.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.publicarVersaoDeRoteiro, "ENTE");

    const v = await tx.versaoDeRoteiro.findUnique({
      where: { id: d.versaoId },
      select: { id: true, numero: true, familia: true, chave: true, situacao: true },
    });
    if (v === null) throw new Error(`Não há versão de roteiro com id "${d.versaoId}". Nada foi gravado.`);
    const anterior = await versaoVigente(tx, v.familia, v.chave);
    await publicarNaTx(tx, v.id, d.criadoPor);
    return { versaoId: v.id, numero: v.numero, substituiuNumero: anterior?.numero ?? null };
  });
}

export interface VersaoDeRoteiroLida {
  readonly id: string;
  readonly numero: number;
  readonly contaDebito: { readonly codigo: string; readonly nome: string };
  readonly contaCredito: { readonly codigo: string; readonly nome: string };
  readonly motivo: string;
  readonly situacao: "PROPOSTA" | "PUBLICADA";
  readonly criadoEm: Date;
  readonly criadoPor: string;
  readonly publicadaEm: Date | null;
  readonly publicadaPor: string | null;
  /** Derivada: a publicação da versão seguinte. `null` = em vigor (ou nunca publicada). */
  readonly vigenciaFim: Date | null;
  readonly vigente: boolean;
  /** Quantos movimentos lançaram por esta versão — o vínculo com os fatos. */
  readonly movimentos: number;
}

/** As versões de um roteiro, do número 1 em diante, com a vigência DERIVADA. */
export async function versoesDoRoteiro(
  tx: Tx,
  familia: FamiliaDeRoteiro,
  chave: string
): Promise<readonly VersaoDeRoteiroLida[]> {
  const linhas = await tx.versaoDeRoteiro.findMany({
    where: { familia, chave },
    orderBy: { numero: "asc" },
    select: {
      id: true, numero: true, motivo: true, situacao: true, criadoEm: true, criadoPor: true,
      publicadaEm: true, publicadaPor: true,
      contaDebito: { select: { codigo: true, nome: true } },
      contaCredito: { select: { codigo: true, nome: true } },
      _count: { select: { movimentos: true } },
    },
  });
  const publicadas = linhas
    .filter((l) => l.situacao === "PUBLICADA" && l.publicadaEm !== null)
    .sort((a, b) => a.publicadaEm!.getTime() - b.publicadaEm!.getTime());
  const vigenteId = publicadas.at(-1)?.id ?? null;
  return linhas.map((l) => {
    const pos = publicadas.findIndex((p) => p.id === l.id);
    const seguinte = pos >= 0 ? publicadas[pos + 1] : undefined;
    return {
      id: l.id,
      numero: l.numero,
      contaDebito: l.contaDebito,
      contaCredito: l.contaCredito,
      motivo: l.motivo,
      situacao: l.situacao as "PROPOSTA" | "PUBLICADA",
      criadoEm: l.criadoEm,
      criadoPor: l.criadoPor,
      publicadaEm: l.publicadaEm,
      publicadaPor: l.publicadaPor,
      vigenciaFim: seguinte?.publicadaEm ?? null,
      vigente: l.id === vigenteId,
      movimentos: l._count.movimentos,
    };
  });
}

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

    // ⚠️ V3 (4.5): PARAMETRIZAR É O ATO COMPOSTO — propõe E publica a versão, e por isso
    // cobra TAMBÉM o crachá de publicar. Quem só propõe usa `proporVersaoDeRoteiro`; quem só
    // aprova usa `publicarVersaoDeRoteiro`. A constante, e não o `ACAO_DO_SERVICO`, pela
    // mesma razão de `A_CHAVE_QUE_REABRE` no M16: o grep-teste do censo trata a ação de
    // OUTRO serviço no corpo como cópia mal-feita.
    await autorizarNo(tx, d.criadoPor, A_ACAO_DE_PUBLICAR, "ENTE");

    const vigente = await vigenteOuLegado(tx, "PATRIMONIAL", d.tipo);
    if (vigente !== null && !d.substituir) {
      throw new Error(
        `O tipo ${d.tipo} JÁ TEM roteiro: débito em ${vigente.contaDebito.codigo} — ` +
          `${vigente.contaDebito.nome}, crédito em ${vigente.contaCredito.codigo} — ` +
          `${vigente.contaCredito.nome}. Nada foi gravado. Para trocar as contas, abra o ` +
          `roteiro e use a reparametrização: ela é um ato à parte porque muda a ` +
          `contabilidade dos movimentos FUTUROS deste evento.`
      );
    }

    const versao = await criarVersaoNaTx(tx, {
      familia: "PATRIMONIAL",
      chave: d.tipo,
      debito,
      credito,
      motivo: vigente === null ? "Parametrização direta (primeira versão)" : "Parametrização direta (substituição das contas)",
      criadoPor: d.criadoPor,
    });
    await publicarNaTx(tx, versao.id, d.criadoPor);
    return { roteiroId: versao.id, substituiu: vigente !== null };
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
    await autorizarNo(tx, d.criadoPor, A_ACAO_DE_PUBLICAR, "ENTE");

    const vigente = await vigenteOuLegado(tx, "RESULTADO_ALIENACAO", chave);
    if (vigente !== null && !d.substituir) {
      throw new Error(
        `${chave} JÁ TEM roteiro: débito em ${vigente.contaDebito.codigo} — ` +
          `${vigente.contaDebito.nome}, crédito em ${vigente.contaCredito.codigo} — ` +
          `${vigente.contaCredito.nome}. Nada foi gravado. Para trocar as contas, use a ` +
          `reparametrização — ela muda o resultado das alienações FUTURAS.`
      );
    }

    const versao = await criarVersaoNaTx(tx, {
      familia: "RESULTADO_ALIENACAO",
      chave,
      debito,
      credito,
      motivo: vigente === null ? "Parametrização direta (primeira versão)" : "Parametrização direta (substituição das contas)",
      criadoPor: d.criadoPor,
    });
    await publicarNaTx(tx, versao.id, d.criadoPor);
    return { roteiroId: versao.id, substituiu: vigente !== null };
  });
}

export const zParametrizarRoteiroAlmoxarifadoInput = z.object({
  /** V37 — trocar as contas de um roteiro já cadastrado é ato explícito: sem ele, o roteiro existente recusa. */
  substituir: z.boolean().default(false),
  tipo: z.string().min(1),
  contaDebitoId: zCodigoDeConta,
  contaCreditoId: zCodigoDeConta,
  criadoPor: z.string().min(1),
});
export type ParametrizarRoteiroAlmoxarifadoInput = z.input<typeof zParametrizarRoteiroAlmoxarifadoInput>;

/**
 * V37 — PARAMETRIZA O ROTEIRO DE UM MOVIMENTO DO ALMOXARIFADO (saída por consumo, ajuste de sobra, ajuste de falta).
 *
 * ⚠️ O QUE ISTO DESTRAVA. `RoteiroAlmoxarifado` não tinha caso de uso nem tela que o escrevesse, e o lançamento da
 * saída é fail-closed ("Não há RoteiroAlmoxarifado cadastrado..."): nenhuma requisição se atendia pela tela, em base
 * nenhuma. As contas são escolha do ente; nada aqui as sugere.
 *
 * ⚠️ SÓ OS TIPOS COM LANÇAMENTO PRÓPRIO (`TEM_ROTEIRO_ALMOXARIFADO`) E QUE NÃO SÃO ESTORNO. A ENTRADA é lançada pelo
 * M05 na liquidação; o estorno inverte as pernas do original. Parametrizar qualquer um deles seria uma segunda fonte.
 *
 * ⚠️ SEM SUBSTITUIÇÃO: o tipo que já tem roteiro é recusado nomeando o par vigente. A troca das contas fica para a
 * versão do roteiro (pendência ROTEIRO-ALMOXARIFADO-SEM-VERSAO), como já é no patrimônio.
 */
export async function parametrizarRoteiroAlmoxarifado(
  prisma: PrismaClient,
  input: ParametrizarRoteiroAlmoxarifadoInput
): Promise<{ readonly roteiroId: string; readonly substituiu: boolean }> {
  const d = zParametrizarRoteiroAlmoxarifadoInput.parse(input);
  if (!TIPOS_DO_ROTEIRO_ALMOXARIFADO.includes(d.tipo as TipoMovimentoAlmoxarifado)) {
    throw new Error(
      `O movimento ${d.tipo} não tem roteiro próprio no almoxarifado. A entrada é lançada pela liquidação, e o ` +
        `estorno inverte as contas do movimento original. O roteiro NÃO foi gravado.`
    );
  }
  const tipo = d.tipo as TipoMovimentoAlmoxarifado;
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.parametrizarRoteiroAlmoxarifado, "ENTE");
    // Vigora na hora (não há proposta): cobra também o crachá de publicar, como a parametrização direta do patrimônio.
    await autorizarNo(tx, d.criadoPor, A_ACAO_DE_PUBLICAR, "ENTE");

    const [debito, credito] = await Promise.all([
      conferirConta(tx, d.contaDebitoId, "débito"),
      conferirConta(tx, d.contaCreditoId, "crédito"),
    ]);
    conferirContraOMotor(debito, credito);

    // V37 — a versão publicada, ou a linha gravada antes das versões. Trocar é versão nova, e só com `substituir`:
    // ninguém sobrescreve o roteiro por ter escolhido o movimento errado.
    const vigente = await vigenteOuLegado(tx, "ALMOXARIFADO", tipo);
    if (vigente !== null && !d.substituir) {
      throw new Error(
        `Este movimento JÁ TEM roteiro: débito em ${vigente.contaDebito.codigo} — ${vigente.contaDebito.nome}, ` +
          `crédito em ${vigente.contaCredito.codigo} — ${vigente.contaCredito.nome}. Para trocar as contas, marque ` +
          `"Trocar as contas de um roteiro já cadastrado": a troca vale para os movimentos seguintes. Nada foi gravado.`
      );
    }
    if (vigente !== null && vigente.contaDebito.id === debito.id && vigente.contaCredito.id === credito.id) {
      throw new Error(`O roteiro deste movimento já usa estas duas contas. Nada foi gravado.`);
    }
    const versao = await criarVersaoNaTx(tx, {
      familia: "ALMOXARIFADO",
      chave: tipo,
      debito,
      credito,
      motivo: vigente === null ? "Parametrização direta (primeira versão)" : "Parametrização direta (substituição das contas)",
      criadoPor: d.criadoPor,
    });
    await publicarNaTx(tx, versao.id, d.criadoPor);
    return { roteiroId: versao.id, substituiu: vigente !== null };
  });
}

/**
 * Os movimentos do almoxarifado que têm roteiro próprio e não são estorno — o rol da tela. DERIVADO do mapa que o
 * lançamento usa (`TEM_ROTEIRO_ALMOXARIFADO`): um tipo novo no enum entra aqui sem ninguém lembrar.
 */
export const TIPOS_DO_ROTEIRO_ALMOXARIFADO: readonly TipoMovimentoAlmoxarifado[] = (Object.keys(TEM_ROTEIRO_ALMOXARIFADO) as TipoMovimentoAlmoxarifado[]).filter(
  (t) => TEM_ROTEIRO_ALMOXARIFADO[t] && !t.startsWith("ESTORNO_")
);
