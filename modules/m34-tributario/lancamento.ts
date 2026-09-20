import { createHash } from "node:crypto";
import { z } from "zod";
import { Decimal, toMoney } from "../../packages/contracts/index.js";
import { diaCivil, meioDiaCivil } from "../../packages/datas/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { cancelarReconhecimento, reconhecerReceita } from "../m04-receita/reconhecimento.js";
import { parsearNaturezaReceita } from "../m04-receita/natureza.js";
import { vinculosDoImovelNoDia } from "./cadastro-imobiliario.js";
import { simularTributo, type TributoMunicipal } from "./simulacao.js";

/**
 * ═══ M34 B2 — O LANÇAMENTO TRIBUTÁRIO (V10 T2 · N5) ═══
 *
 * A cadeia: PREPARAR (revisável, sem crédito) → CONSTITUIR (o crédito nasce no M04) →
 * RETIFICAR ou CANCELAR (por ato motivado, sem apagar o original).
 *
 * ═══ ⚠️ O CRÉDITO CANÔNICO JÁ EXISTIA, E NÃO É DESTE MÓDULO ═══
 * É `ReceitaReconhecida` (M04): nasce no fato gerador, debita o crédito a receber e credita a
 * VPA, tem roteiro contábil por origem da receita, tem vínculo com a arrecadação, tem inscrição
 * em dívida ativa e tem cancelamento por VPD. Ela até já reservou, em 2026, a chave de
 * idempotência `referenciaExterna @unique` com o comentário dizendo que a integração tributária
 * viria em lote. **É esta.** Criar aqui um segundo crédito seria o segundo ledger que a ordem
 * V10 proíbe em uma linha.
 *
 * ═══ ⚠️ PREPARAR NÃO É SIMULAR, E SIMULAR CONTINUA SEM GRAVAR ═══
 * `simularTributo` (B1) é leitura e não grava — essa regra não mudou. `prepararLancamento`
 * chama a MESMA simulação e GRAVA o resultado, por comando explícito. A diferença é o comando,
 * não a conta: usar dois cálculos diferentes faria a prévia mentir sobre o lançamento.
 *
 * ═══ ⚠️ CONSTITUIR NÃO ARRECADA ═══
 * O reconhecimento é D crédito a receber × C VPA. O caixa não é tocado, e não se contabiliza
 * receita arrecadada ao constituir crédito: a arrecadação é outro fato, e ela BAIXA este
 * crédito (permutativa). Lançar as duas contaria a mesma receita duas vezes.
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

const zDia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "A data é um DIA civil AAAA-MM-DD.");
const TRIBUTOS = ["IPTU", "ITBI", "ISS", "TAXA"] as const;

const br = (dia: string): string => dia.split("-").reverse().join("/");

/** O sha256 do JSON canônico — a mesma disciplina da emissão congelada do termo patrimonial. */
export function shaDaMemoria(memoria: unknown): string {
  return createHash("sha256").update(JSON.stringify(memoria)).digest("hex");
}

// ═══════════════════════════════════════════════════════════════════════════
// AS INCONSISTÊNCIAS — dado, não texto solto
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ AS INCONSISTÊNCIAS SÃO UM CONJUNTO FECHADO, e não uma string livre. A revisão do lote é
 * ler isto, e a constituição as usa para RECUSAR — um texto livre não se filtra nem se conta.
 */
export type CodigoDeInconsistencia =
  | "SEM-RESPONSAVEL-VIGENTE"
  | "FRACAO-NAO-FECHA"
  | "VALOR-ZERO";

export interface Inconsistencia {
  readonly codigo: CodigoDeInconsistencia;
  readonly detalhe: string;
}

const EXPLICACAO: Record<CodigoDeInconsistencia, string> = {
  "SEM-RESPONSAVEL-VIGENTE":
    "O imóvel não tem vínculo de pessoa vigente no fato gerador: não há a quem lançar. " +
    "Vincule o responsável tributário no cadastro imobiliário e prepare de novo.",
  "FRACAO-NAO-FECHA":
    "A soma das frações dos responsáveis vigentes não chega a 1 (100%). Parte do imóvel ficaria " +
    "sem responsável declarado. Complete os vínculos no cadastro imobiliário.",
  "VALOR-ZERO":
    "A fórmula da tabela publicada devolveu zero para este imóvel. Um lançamento de zero não " +
    "constitui crédito nenhum; confira a tabela e o cadastro antes de constituir.",
};

export function explicacaoDaInconsistencia(c: CodigoDeInconsistencia): string {
  return EXPLICACAO[c];
}

// ═══════════════════════════════════════════════════════════════════════════
// A PREPARAÇÃO
// ═══════════════════════════════════════════════════════════════════════════

export const zAbrirLote = z
  .object({
    numero: z.string().trim().min(1).max(40),
    tributo: z.enum(TRIBUTOS),
    exercicio: z.number().int().min(2000).max(2100),
    fatoGerador: zDia,
    descricao: z.string().trim().min(5),
    naturezaCodigo: z.string().trim(),
    fonteId: z.string().min(1),
    /**
     * Os dias de vencimento, em ordem. Um só = cota única. ⚠️ Eles vêm do ENTE: um calendário
     * de vencimentos cravado no código seria calendário tributário inventado.
     */
    vencimentos: z.array(zDia).min(1).max(24),
    /**
     * ⚠️ O RECORTE É EXPLÍCITO — os imóveis vêm da tela, um a um. Não existe "preparar todos":
     * um lote que varre o cadastro inteiro sem ninguém escolher é o lote que ninguém revisa.
     */
    imoveisIds: z.array(z.string().min(1)).min(1).max(5000),
    criadoPor: z.string().min(1),
  })
  .strict();
export type AbrirLoteInput = z.input<typeof zAbrirLote>;

/**
 * ABRE o lote e PREPARA os lançamentos dos imóveis indicados.
 *
 * ⚠️ O LOTE É O GRÃO DA REVISÃO, NÃO DA CONSTITUIÇÃO. Preparar trinta mil imóveis e constituir
 * trinta mil créditos no mesmo ato deixaria, num erro no 17.000º, um estado que ninguém sabe
 * descrever. Aqui a preparação é o lote; a constituição é por lançamento, com idempotência
 * própria.
 *
 * ⚠️ IMÓVEL QUE FALHA NA SIMULAÇÃO **NÃO DERRUBA O LOTE**: ele entra como recusa nomeada na
 * lista de resultados. Um lote de vinte mil que aborta no primeiro cadastro incompleto é um
 * lote que ninguém consegue preparar.
 */
export interface ResultadoDaPreparacao {
  readonly loteId: string;
  readonly numero: string;
  readonly preparados: number;
  readonly recusados: readonly { readonly imovelId: string; readonly inscricao: string; readonly motivo: string }[];
  readonly comInconsistencia: number;
}

export async function prepararLoteDeLancamento(
  prisma: PrismaClient,
  input: AbrirLoteInput
): Promise<ResultadoDaPreparacao> {
  const d = zAbrirLote.parse(input);
  const imoveisIds = d.imoveisIds;

  // ⚠️ A NATUREZA É VALIDADA ANTES DE QUALQUER ESCRITA. Um lote inteiro preparado sob uma
  // natureza que o parser recusa só falharia na constituição, um a um, depois da revisão.
  parsearNaturezaReceita(d.naturezaCodigo);

  await autorizarNo(prisma, d.criadoPor, ACAO_DO_SERVICO.prepararLoteDeLancamento, "ENTE");

  const fonte = await prisma.fonteRecurso.findUnique({ where: { id: d.fonteId }, select: { id: true } });
  if (fonte === null) {
    throw new Error(
      `FONTE-INEXISTENTE: não há fonte de recurso com id "${d.fonteId}". A classificação da ` +
        `receita é do ente e não tem padrão no código. Nada foi gravado.`
    );
  }

  const ordenados = [...d.vencimentos].sort();
  if (ordenados.join("|") !== d.vencimentos.join("|")) {
    throw new Error(
      `VENCIMENTOS-FORA-DE-ORDEM: as parcelas ${d.vencimentos.map(br).join(", ")} não estão em ` +
        `ordem crescente. Uma parcela 2 que vence antes da 1 é um carnê que ninguém consegue ` +
        `pagar na ordem. Nada foi gravado.`
    );
  }

  const lote = await prisma.loteDeLancamentoTributario
    .create({
      data: {
        numero: d.numero,
        tributo: d.tributo,
        exercicio: d.exercicio,
        fatoGerador: d.fatoGerador,
        descricao: d.descricao,
        naturezaCodigo: d.naturezaCodigo,
        fonteId: d.fonteId,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    })
    .catch((e: { code?: string }) => {
      if (e.code === "P2002") {
        throw new Error(`LOTE-JA-EXISTE: já há um lote com o número "${d.numero}". Nada foi gravado.`);
      }
      throw e;
    });

  const recusados: { imovelId: string; inscricao: string; motivo: string }[] = [];
  let preparados = 0;
  let comInconsistencia = 0;

  for (const imovelId of imoveisIds) {
    try {
      const r = await prepararUm(prisma, {
        loteId: lote.id,
        imovelId,
        tributo: d.tributo,
        exercicio: d.exercicio,
        fatoGerador: d.fatoGerador,
        vencimentos: d.vencimentos,
        criadoPor: d.criadoPor,
      });
      preparados += 1;
      if (r.inconsistencias.length > 0) comInconsistencia += 1;
    } catch (e) {
      const imovel = await prisma.imovel.findUnique({ where: { id: imovelId }, select: { inscricao: true } });
      recusados.push({
        imovelId,
        inscricao: imovel?.inscricao ?? "(imóvel inexistente)",
        motivo: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { loteId: lote.id, numero: d.numero, preparados, recusados, comInconsistencia };
}

export const zPrepararUm = z
  .object({
    loteId: z.string().min(1),
    imovelId: z.string().min(1),
    tributo: z.enum(TRIBUTOS),
    exercicio: z.number().int().min(2000).max(2100),
    fatoGerador: zDia,
    vencimentos: z.array(zDia).min(1).max(24),
    criadoPor: z.string().min(1),
  })
  .strict();

/**
 * PREPARA UM lançamento — a mesma simulação do B1, congelada.
 *
 * ⚠️ A MEMÓRIA CONGELA A CONTA INTEIRA: versão do cadastro, versão da tabela, fundamento,
 * fórmula e cada variável com o seu valor e origem. É isso que responde "por que deu este
 * valor?" dois anos depois, num recurso — e é isso que o documento de memória repete, em vez de
 * recalcular. Recalcular na segunda via faria o lançamento mudar quando o cadastro mudasse.
 */
export async function prepararLancamentoTributario(
  prisma: PrismaClient,
  input: z.input<typeof zPrepararUm>
): Promise<{ readonly lancamentoId: string; readonly valor: string; readonly inconsistencias: readonly Inconsistencia[] }> {
  const d = zPrepararUm.parse(input);
  await autorizarNo(prisma, d.criadoPor, ACAO_DO_SERVICO.prepararLancamentoTributario, "ENTE");
  return prepararUm(prisma, d);
}

async function prepararUm(
  prisma: PrismaClient,
  d: z.output<typeof zPrepararUm>
): Promise<{ readonly lancamentoId: string; readonly valor: string; readonly inconsistencias: readonly Inconsistencia[] }> {
  const simulacao = await simularTributo(prisma, {
    imovelId: d.imovelId,
    tributo: d.tributo as TributoMunicipal,
    exercicio: d.exercicio,
    dia: d.fatoGerador,
  });

  const versao = await prisma.versaoDoImovel.findFirstOrThrow({
    where: { imovelId: d.imovelId, versao: simulacao.imovel.versao },
    select: { id: true },
  });
  const tabela = await prisma.tabelaDeParametrosTributarios.findFirstOrThrow({
    where: { tributo: d.tributo, exercicio: d.exercicio, versao: simulacao.tabela.versao },
    select: { id: true },
  });

  const vinculos = await vinculosDoImovelNoDia(prisma, d.imovelId, d.fatoGerador);
  const valor = toMoney(new Decimal(simulacao.valor));

  const inconsistencias: Inconsistencia[] = [];
  if (vinculos.length === 0) {
    inconsistencias.push({
      codigo: "SEM-RESPONSAVEL-VIGENTE",
      detalhe: explicacaoDaInconsistencia("SEM-RESPONSAVEL-VIGENTE"),
    });
  } else {
    // ⚠️ A FRAÇÃO SE CONFERE POR PAPEL, e o papel que responde pelo tributo é o que importa.
    // Somar as frações de TODOS os papéis daria 2 num imóvel com proprietário e possuidor — e a
    // inconsistência apareceria onde não há nenhuma.
    const porPapel = new Map<string, Decimal>();
    for (const v of vinculos) {
      porPapel.set(v.papel, (porPapel.get(v.papel) ?? new Decimal(0)).plus(new Decimal(v.fracao)));
    }
    const fecha = [...porPapel.values()].some((soma) => soma.eq(1));
    if (!fecha) {
      inconsistencias.push({
        codigo: "FRACAO-NAO-FECHA",
        detalhe:
          `${explicacaoDaInconsistencia("FRACAO-NAO-FECHA")} Somas por papel: ` +
          [...porPapel.entries()].map(([p, s]) => `${p} ${s.toFixed(6)}`).join(", "),
      });
    }
  }
  if (valor.isZero()) {
    inconsistencias.push({ codigo: "VALOR-ZERO", detalhe: explicacaoDaInconsistencia("VALOR-ZERO") });
  }

  const memoria = {
    imovel: simulacao.imovel,
    tabela: simulacao.tabela,
    dia: simulacao.dia,
    valor: simulacao.valor,
    variaveis: simulacao.memoria,
    avisos: simulacao.avisos,
    responsaveis: simulacao.responsaveis,
  };

  const parcelas = repartir(valor, d.vencimentos.length);

  const criado = await prisma.lancamentoTributario
    .create({
      data: {
        loteId: d.loteId,
        imovelId: d.imovelId,
        versaoDoImovelId: versao.id,
        tabelaId: tabela.id,
        tributo: d.tributo,
        exercicio: d.exercicio,
        fatoGerador: d.fatoGerador,
        valor: valor.toFixed(2),
        memoria,
        memoriaSha256: shaDaMemoria(memoria),
        // ⚠️ O CAST É PARA O PRISMA, e não para o domínio. `Inconsistencia[]` é um tipo NOSSO,
        // estrutural e serializável; `InputJsonValue` é a forma que o Prisma aceita numa coluna
        // `Json`. O compilador não prova que um é o outro, e o `unknown` no meio diz isso em voz
        // alta em vez de esconder. A forma é conferida na LEITURA, pelos testes que a projetam.
        inconsistencias: inconsistencias as unknown as object[],
        situacao: "PREPARADO",
        criadoPor: d.criadoPor,
        responsaveis: {
          create: vinculos.map((v) => ({
            pessoaId: v.pessoaId,
            papel: v.papel as "PROPRIETARIO" | "COMPROMISSARIO" | "POSSUIDOR" | "RESPONSAVEL_TRIBUTARIO",
            fracao: v.fracao,
            valorProporcional: toMoney(valor.times(new Decimal(v.fracao))).toFixed(2),
          })),
        },
        vencimentos: {
          create: d.vencimentos.map((dia, i) => ({
            numero: i + 1,
            vencimento: dia,
            valor: parcelas[i]!.toFixed(2),
          })),
        },
      },
      select: { id: true },
    })
    .catch((e: { code?: string }) => {
      if (e.code === "P2002") {
        throw new Error(
          `LANCAMENTO-JA-PREPARADO: este imóvel já tem lançamento neste lote. Preparar de novo ` +
            `criaria um segundo crédito do mesmo tributo, do mesmo exercício, contra a mesma ` +
            `pessoa. Nada foi gravado.`
        );
      }
      throw e;
    });

  return { lancamentoId: criado.id, valor: valor.toFixed(2), inconsistencias };
}

/**
 * REPARTE o valor em N parcelas, em centavos, **sem perder nem criar centavo**.
 *
 * ⚠️ O RESTO VAI NA PRIMEIRA, e não "se distribui". 100,00 em 3 é 33,34 + 33,33 + 33,33 — e a
 * soma é 100,00. Dividir e arredondar cada parcela daria 33,33 × 3 = 99,99, e o município
 * perderia um centavo por carnê; arredondar para cima daria 100,02. A primeira parcela é a que
 * carrega o resto porque é a que o contribuinte vê primeiro, junto do total.
 */
export function repartir(valor: Decimal, partes: number): readonly Decimal[] {
  const centavos = toMoney(valor).times(100).toDecimalPlaces(0);
  const base = centavos.dividedBy(partes).floor();
  const resto = centavos.minus(base.times(partes));
  return Array.from({ length: partes }, (_, i) =>
    toMoney((i === 0 ? base.plus(resto) : base).dividedBy(100))
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// A CONSTITUIÇÃO
// ═══════════════════════════════════════════════════════════════════════════

export const zConstituir = z
  .object({ lancamentoId: z.string().min(1), historico: z.string().trim().min(5).optional(), criadoPor: z.string().min(1) })
  .strict();

export interface ResultadoDaConstituicao {
  readonly lancamentoId: string;
  readonly reconhecimentoId: string;
  /** `false` quando o crédito já tinha sido constituído com a MESMA memória — nada foi gravado. */
  readonly novo: boolean;
  readonly detalhe: string;
}

/**
 * CONSTITUI o crédito: o lançamento preparado vira `ReceitaReconhecida` (M04).
 *
 * ⚠️ AS QUATRO RECUSAS, e todas ANTES de qualquer escrita:
 *   1. lançamento que não está PREPARADO — constituir duas vezes, ou constituir o que foi
 *      cancelado, criaria crédito do nada;
 *   2. lançamento COM INCONSISTÊNCIA — é para isso que a revisão existe;
 *   3. valor zero — um crédito de zero é uma linha no razão que não significa nada;
 *   4. ROTEIRO CONTÁBIL AUSENTE para a origem da natureza — e esta é a que a ordem V10 nomeia:
 *      "sem roteiro contábil validado, impedir a efetivação e produzir pendência acionável".
 *      Inventar a conta do PCASP para o crédito passar seria inventar norma da STN.
 *
 * ⚠️ IDEMPOTÊNCIA COM O ESCOPO DENTRO DA CHAVE: lote + imóvel + sha256 da memória. Repetir o
 * ato colide no índice e devolve `novo: false`; um lançamento RETIFICADO tem outra memória,
 * outro sha e outra chave — e constitui de novo, como fato novo. A mesma chave viaja no
 * `referenciaExterna` do reconhecimento, que é `@unique` desde 2026 justamente para isto.
 */
export async function constituirCreditoTributario(
  prisma: PrismaClient,
  input: z.input<typeof zConstituir>
): Promise<ResultadoDaConstituicao> {
  const d = zConstituir.parse(input);
  await autorizarNo(prisma, d.criadoPor, ACAO_DO_SERVICO.constituirCreditoTributario, "ENTE");

  const l = await prisma.lancamentoTributario.findUnique({
    where: { id: d.lancamentoId },
    select: {
      id: true, situacao: true, valor: true, fatoGerador: true, memoriaSha256: true,
      inconsistencias: true, exercicio: true, tributo: true,
      imovel: { select: { id: true, inscricao: true } },
      lote: { select: { id: true, numero: true, naturezaCodigo: true, fonteId: true } },
      constituicao: { select: { reconhecimentoId: true } },
    },
  });
  if (l === null) throw new Error(`LANCAMENTO-INEXISTENTE: não há lançamento com id "${d.lancamentoId}". Nada foi gravado.`);

  if (l.constituicao !== null) {
    return {
      lancamentoId: l.id,
      reconhecimentoId: l.constituicao.reconhecimentoId,
      novo: false,
      detalhe: `O crédito do imóvel ${l.imovel.inscricao} já estava constituído. Nada foi gravado.`,
    };
  }
  if (l.situacao !== "PREPARADO") {
    throw new Error(
      `LANCAMENTO-NAO-PREPARADO: o lançamento do imóvel ${l.imovel.inscricao} está ${l.situacao}, ` +
        `e só se constitui o que está PREPARADO. Nada foi gravado.`
    );
  }

  const inconsistencias = (l.inconsistencias ?? []) as unknown as readonly Inconsistencia[];
  if (inconsistencias.length > 0) {
    throw new Error(
      `LANCAMENTO-INCONSISTENTE: o lançamento do imóvel ${l.imovel.inscricao} tem ` +
        `${inconsistencias.length} pendência(s) da preparação, e constituir por cima delas faria ` +
        `nascer um crédito que ninguém consegue cobrar:\n` +
        inconsistencias.map((i) => `  · ${i.codigo}: ${i.detalhe}`).join("\n") +
        `\nCorrija o cadastro e prepare de novo. Nada foi gravado.`
    );
  }

  const valor = toMoney(new Decimal(l.valor.toFixed(2)));
  if (valor.lte(0)) {
    throw new Error(
      `VALOR-NAO-POSITIVO: o lançamento do imóvel ${l.imovel.inscricao} vale ${valor.toFixed(2)}. ` +
        `Um crédito de zero é uma linha no razão que não significa nada. Nada foi gravado.`
    );
  }

  // ⚠️ O ROTEIRO, CONFERIDO AQUI E COM MENSAGEM PRÓPRIA. `reconhecerReceita` também o exige, e
  // a mensagem dele é do M04 ("a origem X não tem roteiro"). Quem está na tela do IPTU precisa
  // ler o que ISSO significa para ELE, e qual é a providência — a pendência acionável que a
  // ordem V10 pede. A conferência aqui não substitui a do M04: ela a antecede.
  const origem = parsearNaturezaReceita(l.lote.naturezaCodigo).origem;
  const roteiro = await prisma.roteiroReconhecimento.findUnique({
    where: { origem },
    select: { id: true },
  });
  if (roteiro === null) {
    throw new Error(
      `ROTEIRO-CONTABIL-AUSENTE: a origem "${origem}" da natureza ${l.lote.naturezaCodigo} não tem ` +
        `roteiro de reconhecimento cadastrado, e sem ele não há em que contas do PCASP lançar o ` +
        `crédito.\n` +
        `  o que NÃO se faz: escolher uma conta parecida para o lançamento passar. Isso seria ` +
        `inventar norma da STN dentro de um lançamento.\n` +
        `  quem resolve: quem responde pela contabilidade, cadastrando o roteiro da origem ` +
        `(crédito a receber, VPA e, para poder cancelar depois, VPD).\n` +
        `  a preparação e a revisão do lote continuam disponíveis: o que fica impedido é a ` +
        `efetivação. Nada foi gravado.`
    );
  }

  const chave = `M34:${l.lote.id}:${l.imovel.id}:${l.memoriaSha256}`;

  const { reconhecimentoId } = await reconhecerReceita(prisma, {
    naturezaCodigo: l.lote.naturezaCodigo,
    fonteId: l.lote.fonteId,
    // ⚠️ A COMPETÊNCIA É O FATO GERADOR, e ela vem do lançamento — não de "hoje". O IPTU de 2026
    // é de 2026 mesmo que o carnê saia em julho.
    // ⚠️ ANCORADA NO MEIO-DIA DO FUSO DO ENTE (a régua), e não num literal `Z` ao lado dela.
    dataFatoGerador: meioDiaCivil(l.fatoGerador),
    valor: valor.toFixed(2),
    // ⚠️ SIGILO FISCAL (CTN art. 198): a referência é a INSCRIÇÃO IMOBILIÁRIA, nunca o CPF.
    contribuinteRef: l.imovel.inscricao,
    historico: d.historico ?? `${l.tributo} ${l.exercicio} — imóvel ${l.imovel.inscricao} (lote ${l.lote.numero})`,
    referenciaExterna: chave,
    criadoPor: d.criadoPor,
  });

  await prisma.$transaction(async (tx) => {
    await tx.constituicaoDoLancamento.create({
      data: { lancamentoId: l.id, reconhecimentoId, chave, criadoPor: d.criadoPor },
    });
    await tx.lancamentoTributario.update({ where: { id: l.id }, data: { situacao: "CONSTITUIDO" } });
  });

  return {
    lancamentoId: l.id,
    reconhecimentoId,
    novo: true,
    detalhe:
      `Crédito de ${valor.toFixed(2)} constituído para o imóvel ${l.imovel.inscricao}, com fato ` +
      `gerador em ${br(l.fatoGerador)}. O caixa não foi tocado: arrecadar é outro fato, e ele ` +
      `baixa este crédito.`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// A CORREÇÃO
// ═══════════════════════════════════════════════════════════════════════════

export const zCorrigir = z
  .object({
    lancamentoId: z.string().min(1),
    motivo: z.string().trim().min(10, "Desfazer um lançamento tributário exige explicação: ao menos 10 caracteres."),
    criadoPor: z.string().min(1),
  })
  .strict();

export interface ResultadoDaCorrecao {
  readonly correcaoId: string;
  readonly substitutoId: string | null;
  readonly detalhe: string;
}

/**
 * CANCELA o lançamento — por ato motivado, sem apagar o original.
 *
 * ⚠️ O CRÉDITO CONSTITUÍDO É CANCELADO POR **VPD**, não por estorno, e a diferença é o número
 * que o controle externo procura: o crédito EXISTIU (a VPA daquele mês foi verdadeira) e depois
 * se perdeu. Estornar apagaria a renúncia fiscal da história. É a doutrina do M04, e este
 * serviço a usa em vez de reescrevê-la.
 *
 * ⚠️ E ELE RECUSA QUANDO O CRÉDITO JÁ FOI TOCADO: arrecadado, inscrito em dívida ativa ou
 * parcialmente cancelado. Cancelar por cima disso recriaria saldo que já saiu, e a sequência
 * permitida vem na mensagem — anular a arrecadação primeiro, ou cancelar a inscrição.
 */
export async function cancelarLancamentoTributario(
  prisma: PrismaClient,
  input: z.input<typeof zCorrigir>
): Promise<ResultadoDaCorrecao> {
  const d = zCorrigir.parse(input);
  await autorizarNo(prisma, d.criadoPor, ACAO_DO_SERVICO.cancelarLancamentoTributario, "ENTE");
  const l = await exigirCorrigivel(prisma, d.lancamentoId);

  let cancelamentoId: string | null = null;
  if (l.constituicao !== null) {
    await exigirCreditoIntocado(prisma, l.constituicao.reconhecimentoId, l.inscricao);
    const r = await cancelarReconhecimento(prisma, {
      reconhecimentoId: l.constituicao.reconhecimentoId,
      valor: l.valor,
      motivo: d.motivo,
      data: new Date(),
      criadoPor: d.criadoPor,
    });
    cancelamentoId = r.cancelamentoId;
  }

  const chave = `M34:CANCELAMENTO:${l.id}`;
  const correcao = await prisma.$transaction(async (tx) => {
    const c = await tx.correcaoDoLancamento.create({
      data: {
        lancamentoId: l.id,
        tipo: "CANCELAMENTO",
        motivo: d.motivo,
        cancelamentoDeReconhecimentoId: cancelamentoId,
        chave,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    await tx.lancamentoTributario.update({ where: { id: l.id }, data: { situacao: "CANCELADO" } });
    return c;
  });

  return {
    correcaoId: correcao.id,
    substitutoId: null,
    detalhe:
      cancelamentoId === null
        ? `Lançamento do imóvel ${l.inscricao} cancelado. Ele não tinha crédito constituído: nada foi ao razão.`
        : `Lançamento do imóvel ${l.inscricao} cancelado, e o crédito baixado por VPD — a renúncia ` +
          `fica registrada. A VPA do fato gerador permanece: ela foi verdadeira quando aconteceu.`,
  };
}

/**
 * RETIFICA — cancela o lançamento errado e PREPARA um novo no mesmo lote, com o cadastro e a
 * tabela de hoje.
 *
 * ⚠️ O SUBSTITUTO NASCE PREPARADO, e não constituído. Retificar é corrigir a conta; constituir o
 * crédito novo continua sendo ato próprio, com a ação própria e a revisão pelo meio. Emendar as
 * duas daria a quem retifica o poder de constituir sem passar por ninguém.
 */
export async function retificarLancamentoTributario(
  prisma: PrismaClient,
  input: z.input<typeof zCorrigir>
): Promise<ResultadoDaCorrecao> {
  const d = zCorrigir.parse(input);
  await autorizarNo(prisma, d.criadoPor, ACAO_DO_SERVICO.retificarLancamentoTributario, "ENTE");
  const l = await exigirCorrigivel(prisma, d.lancamentoId);

  let cancelamentoId: string | null = null;
  if (l.constituicao !== null) {
    await exigirCreditoIntocado(prisma, l.constituicao.reconhecimentoId, l.inscricao);
    const r = await cancelarReconhecimento(prisma, {
      reconhecimentoId: l.constituicao.reconhecimentoId,
      valor: l.valor,
      motivo: d.motivo,
      data: new Date(),
      criadoPor: d.criadoPor,
    });
    cancelamentoId = r.cancelamentoId;
  }

  // ⚠️ O ANTIGO SAI DE CENA ANTES DE O NOVO NASCER: `@@unique([loteId, imovelId])` só admite um
  // lançamento por imóvel por lote, e é essa unicidade que impede dois créditos do mesmo tributo
  // contra a mesma pessoa. O substituto entra num lote de RETIFICAÇÃO próprio, derivado do
  // original — assim a unicidade continua valendo e o histórico mostra os dois.
  const loteDaRetificacao = await loteDeRetificacao(prisma, l.loteId, d.criadoPor);

  const novo = await prepararUm(prisma, {
    loteId: loteDaRetificacao,
    imovelId: l.imovelId,
    tributo: l.tributo,
    exercicio: l.exercicio,
    fatoGerador: l.fatoGerador,
    vencimentos: [...l.vencimentos],
    criadoPor: d.criadoPor,
  });

  const chave = `M34:RETIFICACAO:${l.id}`;
  const correcao = await prisma.$transaction(async (tx) => {
    const c = await tx.correcaoDoLancamento.create({
      data: {
        lancamentoId: l.id,
        tipo: "RETIFICACAO",
        motivo: d.motivo,
        substitutoId: novo.lancamentoId,
        cancelamentoDeReconhecimentoId: cancelamentoId,
        chave,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    await tx.lancamentoTributario.update({ where: { id: l.id }, data: { situacao: "RETIFICADO" } });
    return c;
  });

  return {
    correcaoId: correcao.id,
    substitutoId: novo.lancamentoId,
    detalhe:
      `Lançamento do imóvel ${l.inscricao} retificado: o novo vale ${novo.valor} e nasceu ` +
      `PREPARADO. Constituir o crédito dele é ato próprio — a revisão continua no meio.`,
  };
}

/** O lote de RETIFICAÇÃO do lote original, criado sob demanda e reutilizado. */
async function loteDeRetificacao(prisma: PrismaClient, loteOriginalId: string, criadoPor: string): Promise<string> {
  const original = await prisma.loteDeLancamentoTributario.findUniqueOrThrow({
    where: { id: loteOriginalId },
    select: { numero: true, tributo: true, exercicio: true, fatoGerador: true, naturezaCodigo: true, fonteId: true },
  });
  const numero = `${original.numero}-R`;
  const existente = await prisma.loteDeLancamentoTributario.findUnique({ where: { numero }, select: { id: true } });
  if (existente !== null) return existente.id;
  const criado = await prisma.loteDeLancamentoTributario.create({
    data: {
      numero,
      tributo: original.tributo,
      exercicio: original.exercicio,
      fatoGerador: original.fatoGerador,
      descricao: `Retificações do lote ${original.numero}.`,
      naturezaCodigo: original.naturezaCodigo,
      fonteId: original.fonteId,
      criadoPor,
    },
    select: { id: true },
  });
  return criado.id;
}

interface LancamentoCorrigivel {
  readonly id: string;
  readonly imovelId: string;
  readonly inscricao: string;
  readonly loteId: string;
  readonly tributo: (typeof TRIBUTOS)[number];
  readonly exercicio: number;
  readonly fatoGerador: string;
  readonly valor: string;
  readonly vencimentos: readonly string[];
  readonly constituicao: { readonly reconhecimentoId: string } | null;
}

async function exigirCorrigivel(prisma: Tx, lancamentoId: string): Promise<LancamentoCorrigivel> {
  const l = await prisma.lancamentoTributario.findUnique({
    where: { id: lancamentoId },
    select: {
      id: true, imovelId: true, loteId: true, tributo: true, exercicio: true, fatoGerador: true,
      valor: true, situacao: true,
      imovel: { select: { inscricao: true } },
      vencimentos: { orderBy: { numero: "asc" }, select: { vencimento: true } },
      constituicao: { select: { reconhecimentoId: true } },
    },
  });
  if (l === null) throw new Error(`LANCAMENTO-INEXISTENTE: não há lançamento com id "${lancamentoId}". Nada foi gravado.`);
  if (l.situacao === "CANCELADO" || l.situacao === "RETIFICADO") {
    throw new Error(
      `LANCAMENTO-JA-CORRIGIDO: o lançamento do imóvel ${l.imovel.inscricao} está ${l.situacao}. ` +
        `Corrigir o que já foi corrigido empilharia cancelamentos sobre um crédito que já não ` +
        `existe. Se o substituto também está errado, corrija o SUBSTITUTO. Nada foi gravado.`
    );
  }
  return {
    id: l.id,
    imovelId: l.imovelId,
    inscricao: l.imovel.inscricao,
    loteId: l.loteId,
    tributo: l.tributo as (typeof TRIBUTOS)[number],
    exercicio: l.exercicio,
    fatoGerador: l.fatoGerador,
    valor: l.valor.toFixed(2),
    vencimentos: l.vencimentos.map((v) => v.vencimento),
    constituicao: l.constituicao,
  };
}

/**
 * ⚠️ O CRÉDITO JÁ FOI TOCADO? — arrecadado, inscrito em dívida ativa ou já cancelado em parte.
 *
 * A ordem V10 pede exatamente isto: "mapear dependências de parcelamento, arrecadação e demais
 * atos existentes; recusar correção isolada incompatível, indicar a sequência permitida, sem
 * apagar fatos ou recriar saldo indevido". A mensagem traz a sequência.
 */
async function exigirCreditoIntocado(prisma: Tx, reconhecimentoId: string, inscricao: string): Promise<void> {
  const [arrecadado, inscrito, cancelado] = await Promise.all([
    prisma.vinculoArrecadacaoReconhecimento.count({
      where: { reconhecimentoId, arrecadacao: { estornoDeId: null, estornos: { none: {} } } },
    }),
    prisma.inscricaoDeReconhecimento.count({ where: { reconhecimentoId } }),
    prisma.cancelamentoDeReconhecimento.count({ where: { reconhecimentoId } }),
  ]);
  const travas: string[] = [];
  if (arrecadado > 0) {
    travas.push(
      `há ${arrecadado} arrecadação(ões) VIVA(S) baixando este crédito — anule a arrecadação ` +
        `(M04) antes, senão o dinheiro recebido ficaria sem crédito a que se referir`
    );
  }
  if (inscrito > 0) {
    travas.push(
      `o crédito foi inscrito em dívida ativa (${inscrito} inscrição(ões)) — cancele a inscrição ` +
        `(M10) antes, senão a dívida ativa apontaria para um crédito que deixou de existir`
    );
  }
  if (cancelado > 0) {
    travas.push(
      `já há ${cancelado} cancelamento(s) sobre este crédito — cancelar de novo tiraria por VPD ` +
        `um saldo que já saiu`
    );
  }
  if (travas.length > 0) {
    throw new Error(
      `CREDITO-JA-MOVIMENTADO: o lançamento do imóvel ${inscricao} não pode ser corrigido ` +
        `isoladamente porque ${travas.join("; ")}.\n` +
        `  a sequência permitida está acima, na ordem em que aparece. Nada foi gravado.`
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AS LEITURAS
// ═══════════════════════════════════════════════════════════════════════════

export interface LoteNaTela {
  readonly id: string;
  readonly numero: string;
  readonly tributo: string;
  readonly exercicio: number;
  readonly fatoGerador: string;
  readonly descricao: string;
  readonly naturezaCodigo: string;
  readonly criadoEm: Date;
  readonly criadoPor: string;
  readonly total: string;
  readonly preparados: number;
  readonly constituidos: number;
  readonly corrigidos: number;
  readonly comInconsistencia: number;
}

/** Os lotes, com o placar de cada um. Leitura — não grava nada. */
export async function lotesDeLancamento(prisma: Tx): Promise<readonly LoteNaTela[]> {
  const lotes = await prisma.loteDeLancamentoTributario.findMany({
    orderBy: { criadoEm: "desc" },
    select: {
      id: true, numero: true, tributo: true, exercicio: true, fatoGerador: true, descricao: true,
      naturezaCodigo: true, criadoEm: true, criadoPor: true,
      lancamentos: { select: { valor: true, situacao: true, inconsistencias: true } },
    },
  });
  return lotes.map((l) => {
    let total = new Decimal(0);
    let preparados = 0;
    let constituidos = 0;
    let corrigidos = 0;
    let comInconsistencia = 0;
    for (const x of l.lancamentos) {
      total = total.plus(new Decimal(x.valor.toFixed(2)));
      if (x.situacao === "PREPARADO") preparados += 1;
      if (x.situacao === "CONSTITUIDO") constituidos += 1;
      if (x.situacao === "CANCELADO" || x.situacao === "RETIFICADO") corrigidos += 1;
      if (((x.inconsistencias ?? []) as readonly unknown[]).length > 0) comInconsistencia += 1;
    }
    return {
      id: l.id, numero: l.numero, tributo: l.tributo, exercicio: l.exercicio,
      fatoGerador: l.fatoGerador, descricao: l.descricao, naturezaCodigo: l.naturezaCodigo,
      criadoEm: l.criadoEm, criadoPor: l.criadoPor,
      total: toMoney(total).toFixed(2),
      preparados, constituidos, corrigidos, comInconsistencia,
    };
  });
}

export interface LancamentoNaTela {
  readonly id: string;
  readonly inscricao: string;
  readonly valor: string;
  readonly situacao: string;
  readonly fatoGerador: string;
  readonly inconsistencias: readonly Inconsistencia[];
  readonly responsaveis: readonly { readonly nome: string; readonly documento: string; readonly papel: string; readonly fracao: string; readonly valorProporcional: string }[];
  readonly vencimentos: readonly { readonly numero: number; readonly vencimento: string; readonly valor: string }[];
  readonly memoria: unknown;
  readonly memoriaSha256: string;
  readonly reconhecimentoId: string | null;
  readonly correcoes: readonly { readonly tipo: string; readonly motivo: string; readonly criadoEm: Date; readonly criadoPor: string }[];
}

/** Os lançamentos de um lote. Leitura. */
export async function lancamentosDoLote(prisma: Tx, loteId: string): Promise<readonly LancamentoNaTela[]> {
  const ls = await prisma.lancamentoTributario.findMany({
    where: { loteId },
    orderBy: { imovel: { inscricao: "asc" } },
    select: {
      id: true, valor: true, situacao: true, fatoGerador: true, inconsistencias: true,
      memoria: true, memoriaSha256: true,
      imovel: { select: { inscricao: true } },
      constituicao: { select: { reconhecimentoId: true } },
      responsaveis: {
        select: {
          papel: true, fracao: true, valorProporcional: true,
          pessoa: { select: { documento: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } } },
        },
      },
      vencimentos: { orderBy: { numero: "asc" }, select: { numero: true, vencimento: true, valor: true } },
      correcoes: { orderBy: { criadoEm: "asc" }, select: { tipo: true, motivo: true, criadoEm: true, criadoPor: true } },
    },
  });
  return ls.map((l) => ({
    id: l.id,
    inscricao: l.imovel.inscricao,
    valor: l.valor.toFixed(2),
    situacao: l.situacao,
    fatoGerador: l.fatoGerador,
    inconsistencias: (l.inconsistencias ?? []) as unknown as readonly Inconsistencia[],
    responsaveis: l.responsaveis.map((r) => ({
      nome: r.pessoa.versoes[0]?.nome ?? r.pessoa.documento,
      documento: r.pessoa.documento,
      papel: r.papel,
      fracao: r.fracao.toFixed(6),
      valorProporcional: r.valorProporcional.toFixed(2),
    })),
    vencimentos: l.vencimentos.map((v) => ({ numero: v.numero, vencimento: v.vencimento, valor: v.valor.toFixed(2) })),
    memoria: l.memoria,
    memoriaSha256: l.memoriaSha256,
    reconhecimentoId: l.constituicao?.reconhecimentoId ?? null,
    correcoes: l.correcoes.map((c) => ({ tipo: c.tipo, motivo: c.motivo, criadoEm: c.criadoEm, criadoPor: c.criadoPor })),
  }));
}

/** Os lançamentos VIVOS de um imóvel — a ficha dele, e a base da certidão. */
export async function lancamentosVivosDoImovel(prisma: Tx, imovelId: string): Promise<readonly LancamentoNaTela[]> {
  const ls = await prisma.lancamentoTributario.findMany({
    where: { imovelId, situacao: { in: ["PREPARADO", "CONSTITUIDO"] } },
    select: { loteId: true },
    distinct: ["loteId"],
  });
  const porLote = await Promise.all(ls.map(async (x) => lancamentosDoLote(prisma, x.loteId)));
  return porLote.flat().filter((l) => l.inscricao !== "" && (l.situacao === "PREPARADO" || l.situacao === "CONSTITUIDO"));
}

export { diaCivil };
