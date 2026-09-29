import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { criarM05Deps } from "../modules/m05-despesa/adapter-prisma.js";
import { empenhar } from "../modules/m05-despesa/servico.js";
import { liquidar } from "../modules/m05-despesa/servico-bloco2.js";
import { roteiroEmpenho, roteiroLiquidacao } from "../modules/m05-despesa/dominio.js";
import { encerrarExercicioComRestos } from "../modules/m08-restos-a-pagar/encerramento.js";

/**
 * ═══ A FIXTURE QUE O PERCURSO DOS RESTOS A PAGAR EXIGE (V15) ═══
 *
 * `scripts/smoke-restos-a-pagar-operacoes.ts` precisa de um exercício ENCERRADO e de DUAS
 * inscrições — uma PROCESSADA e uma NÃO PROCESSADA. O banco de percursos não tem nenhuma das duas:
 * `preparar-banco-de-percursos.ts` deixa 2026 ABERTO e os três empenhos dele estão integralmente
 * liquidados e pagos, de modo que encerrar o exercício produziria ZERO inscrições.
 *
 * ⚠️ FIXTURE N=2, E AQUI ELA NÃO É FORMALIDADE. Com uma inscrição só, a distinção entre
 * `CANCELAMENTO_PROCESSADO` e `CANCELAMENTO_NAO_PROCESSADO` passaria por vacuidade: qualquer
 * implementação que ignorasse o tipo acertaria. São os DOIS tipos que fazem o percurso medir.
 *
 * ⚠️ OS FATOS VÊM DOS COMANDOS DE DOMÍNIO, não de INSERT. `empenhar`, `liquidar` e
 * `encerrarExercicioComRestos` são chamados como a tela os chamaria — com autorização, roteiro e
 * transação. Um seed que gravasse `InscricaoRestosAPagar` direto produziria inscrições que nenhum
 * encerramento criou, e o percurso passaria sobre dado que o sistema não sabe produzir.
 *
 * ⚠️ E ELE NÃO RODA NO BANCO BASE DE PERCURSOS, de propósito. Encerrar 2026 em
 * `gestao_publica_percursos` quebraria percursos de outras frentes que ninguém está olhando, e o
 * estrago apareceria como vermelho de outra pessoa, dias depois, sem causa visível. Clonar custa
 * segundos. Este script RECUSA se o banco alvo for o base.
 *
 * Uso:  DATABASE_URL=<clone dos percursos> npx tsx scripts/preparar-restos-de-percursos.ts
 */

/** Os valores são os que o percurso afirma. Mudá-los aqui exige mudá-los lá. */
const PROCESSADO = "40000.00";
const NAO_PROCESSADO = "25000.00";

const POR = process.env["SEED_IDENTIDADE"] ?? "admin@cg.pb.gov.br";
const ANO = 2026;
const ANO_SEGUINTE = 2027;

/** Exige uma pré-condição em vez de inventá-la. */
function exigir<T>(valor: T | null | undefined, oQue: string): T {
  if (valor === null || valor === undefined) {
    throw new Error(
      `${oQue} não existe neste banco. Rode primeiro o preparador do banco de percursos; esta ` +
        `fixture compõe sobre ele e não cria cadastro que não é dela.`
    );
  }
  return valor;
}

async function main(): Promise<void> {
  const url = process.env["DATABASE_URL"] ?? "";
  if (url.endsWith("/gestao_publica_percursos")) {
    throw new Error(
      "Este script ENCERRA o exercício, e encerrar no banco BASE de percursos quebraria percursos " +
        "de outras frentes. Aponte DATABASE_URL para um clone."
    );
  }
  const prisma = criarPrismaClient(url);
  try {
    // ── pré-condições, todas lidas e nenhuma suposta ───────────────────────
    // ⚠️ A FICHA SE ESCOLHE PELO SALDO, NAO PELA ORDEM — e isto custou uma corrida. Um
    // `findFirst` com `orderBy: id` pegou `ac-ficha`, que tinha 10.000,00 disponiveis, e o dominio
    // recusou com "saldo insuficiente". A recusa estava certa; a escolha era minha. Aqui a ficha e
    // a de MAIOR disponivel, e se nenhuma couber a fixture recusa dizendo quanto falta — em vez de
    // empenhar menos e produzir uma inscricao com valor que o percurso nao afirma.
    const necessario = Number(PROCESSADO) + Number(NAO_PROCESSADO);
    const fichas = await prisma.fichaOrcamentaria.findMany({
      where: { exercicio: ANO },
      select: { id: true, fonteId: true, valorDotado: true },
    });
    const comSaldo: { id: string; fonteId: string; disponivel: number }[] = [];
    for (const f of fichas) {
      const agg = await prisma.empenho.aggregate({
        where: { fichaId: f.id, estornoDeId: null },
        _sum: { valor: true },
      });
      const empenhado = Number(agg._sum.valor?.toFixed(2) ?? "0");
      comSaldo.push({
        id: f.id,
        fonteId: f.fonteId,
        disponivel: Number(f.valorDotado.toFixed(2)) - empenhado,
      });
    }
    comSaldo.sort((a, b) => b.disponivel - a.disponivel);
    const melhor = comSaldo[0];
    if (melhor === undefined || melhor.disponivel < necessario) {
      throw new Error(
        `Nenhuma ficha de ${ANO} tem os ${necessario.toFixed(2)} que esta fixture precisa. ` +
          `Disponivel por ficha: ${comSaldo.map((f) => `${f.id} ${f.disponivel.toFixed(2)}`).join("; ") || "nenhuma ficha"}. ` +
          `Nada foi gravado.`
      );
    }
    const ficha = { id: melhor.id, fonteId: melhor.fonteId };
    console.log(`[fixture] ficha ${ficha.id}, disponivel ${melhor.disponivel.toFixed(2)}, necessario ${necessario.toFixed(2)}.`);
    const exercicio = exigir(
      await prisma.exercicio.findUnique({
        where: { ano: ANO },
        select: { id: true, encerramento: { select: { id: true } } },
      }),
      `O exercício ${ANO}`
    );
    if (exercicio.encerramento !== null) {
      console.log(`[fixture] o exercício ${ANO} já está encerrado — nada a fazer.`);
      return;
    }
    // O subelemento vem de um empenho que já existe: o domínio dos empenhos o exige em alguns
    // casos, e inventar um código de subelemento é inventar classificação da despesa.
    const modelo = await prisma.empenho.findFirst({
      where: { subelementoId: { not: null } },
      select: { subelementoId: true },
    });

    // ⚠️ O EXERCÍCIO SEGUINTE EXISTE ANTES DO ENCERRAMENTO. As operações de resto a pagar
    // acontecem NELE, e o percurso liquida e paga em 2027 — sem ele, cada ato falharia por uma
    // razão que não é a que o percurso quer medir.
    await prisma.exercicio.upsert({
      where: { ano: ANO_SEGUINTE },
      update: {},
      create: { ano: ANO_SEGUINTE, criadoPor: POR },
    });
    console.log(`[fixture] exercício ${ANO_SEGUINTE} disponível.`);

    // ⚠️ AS CONTAS SAO CONFERIDAS ANTES DE SEREM USADAS, e isto custou um erro: eu havia posto
    // `2.1.3.1.1.00.00` como obrigacao a pagar, e no plano oficial ela e SINTETICA — a analitica e
    // `2.1.3.1.1.01.01` ("FORNECEDORES NAO PARCELADOS A PAGAR"). O dominio recusaria, mas a recusa
    // chegaria no meio da fixture, e uma fixture que falha pela metade deixa o banco num estado
    // que ninguem projetou. Conferir antes e mais barato que limpar depois.
    const CONTAS = {
      creditoDisponivel: "6.2.2.1.1.00.00",
      creditoEmpenhado: "6.2.2.1.3.01.00",
      creditoLiquidado: "6.2.2.1.3.03.00",
      variacaoDiminutiva: "3.3.2.1.1.01.00",
      obrigacaoAPagar: "2.1.3.1.1.01.01",
    } as const;
    const achadas = await prisma.contaPcasp.findMany({
      where: { codigo: { in: Object.values(CONTAS) } },
      select: { codigo: true, analitica: true },
    });
    const boas = new Set(achadas.filter((c) => c.analitica).map((c) => c.codigo));
    const ruins = Object.entries(CONTAS).filter(([, codigo]) => !boas.has(codigo));
    if (ruins.length > 0) {
      throw new Error(
        `Estas contas da fixture nao existem no plano deste banco, ou nao sao ANALITICAS: ` +
          `${ruins.map(([papel, codigo]) => `${codigo} (${papel})`).join("; ")}. ` +
          `Nada foi gravado — corrija os codigos contra o plano carregado, nunca invente.`
      );
    }

    const deps = criarM05Deps(prisma);
    const rEmpenho = roteiroEmpenho({
      creditoDisponivel: CONTAS.creditoDisponivel,
      creditoEmpenhado: CONTAS.creditoEmpenhado,
    });
    const rLiquidacao = roteiroLiquidacao({
      variacaoDiminutiva: CONTAS.variacaoDiminutiva,
      obrigacaoAPagar: CONTAS.obrigacaoAPagar,
      creditoEmpenhado: CONTAS.creditoEmpenhado,
      creditoLiquidado: CONTAS.creditoLiquidado,
    });

    const sub = modelo?.subelementoId ?? undefined;
    const comum = {
      fichaId: ficha.id,
      tipo: "ORDINARIO" as const,
      credorCpfCnpj: "12345678000195",
      categoriaOrdemCronologica: "PRESTACAO_SERVICOS" as const,
      criadoPor: POR,
      ...(sub !== undefined ? { subelementoId: sub } : {}),
    };

    // ── (A) o que vira PROCESSADO: liquidado e NÃO pago ────────────────────
    const a = await empenhar(
      {
        ...comum,
        numero: "RP-PROC",
        valor: PROCESSADO,
        data: new Date(`${ANO}-11-10T12:00:00Z`),
        historico: "Servico de novembro, a pagar no exercicio seguinte",
      } as never,
      rEmpenho,
      deps
    );
    await liquidar(
      {
        empenhoId: a.empenhoId,
        numero: "RP-PROC-LIQ",
        valor: PROCESSADO,
        data: new Date(`${ANO}-12-05T12:00:00Z`),
        responsavelAtesto: "Fiscal do contrato",
        historico: "Atesto do servico de novembro",
        criadoPor: POR,
      } as never,
      rLiquidacao,
      deps
    );
    console.log(`[fixture] empenho RP-PROC liquidado em ${PROCESSADO} e NAO pago.`);

    // ── (B) o que vira NÃO PROCESSADO: empenhado e NÃO liquidado ───────────
    await empenhar(
      {
        ...comum,
        numero: "RP-NAOPROC",
        valor: NAO_PROCESSADO,
        data: new Date(`${ANO}-12-15T12:00:00Z`),
        historico: "Servico de dezembro, ainda nao atestado",
      } as never,
      rEmpenho,
      deps
    );
    console.log(`[fixture] empenho RP-NAOPROC de ${NAO_PROCESSADO} SEM liquidacao.`);

    // ── (C) o encerramento, que é quem INSCREVE ────────────────────────────
    const r = await encerrarExercicioComRestos(prisma, {
      ano: ANO,
      encerradoPor: POR,
    } as never);
    console.log(`[fixture] exercicio ${ANO} encerrado. Inscricoes criadas: ${r.inscricoes.length}`);
    for (const i of r.inscricoes) {
      console.log(`  ${i.tipo.padEnd(15)} empenho ${i.numeroEmpenho} valor ${i.valorInscrito.toFixed(2)}`);
    }

    const porTipo = new Set(r.inscricoes.map((i) => i.tipo));
    if (!porTipo.has("PROCESSADO") || !porTipo.has("NAO_PROCESSADO")) {
      throw new Error(
        `A fixture exige os DOIS tipos e o encerramento produziu apenas ${[...porTipo].join(", ") || "nenhum"}. ` +
          `Sem os dois, a distinção entre os dois cancelamentos passaria por vacuidade no percurso.`
      );
    }
    console.log("[fixture] pronta: uma inscricao PROCESSADA e uma NAO PROCESSADA, em exercicio encerrado.");
  } finally {
    await prisma.$disconnect();
  }
}

await main();
