import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import {
  criarAreaTematica,
  criarEixoEstruturante,
  criarLdo,
  criarMetaAnualLdo,
  criarPlanoPlurianual,
  criarPrevisaoReceitaPpa,
  criarProgramaPpa,
} from "../modules/m02b-plurianual/servico.js";

/**
 * ═══ A PEÇA APROVADA QUE UM ATO VAI ALTERAR (V18/C13) ═══
 *
 * O banco dos percursos não tem PPA nem LDO — medido: zero `PlanoPlurianual`, zero
 * `LeiDiretrizesOrcamentarias`, zero `MetaAnualLdo`. Sem peça aprovada não existe alteração de
 * peça, e o percurso provaria apenas que a tela abre dizendo "nenhum PPA cadastrado".
 *
 * Cada peça daqui existe por um motivo:
 *
 *   · O PPA do quadriênio, com a lei que o instituiu.
 *   · DUAS previsões de receita — ⚠️ DUAS, e é a fixture N=2 do comparativo: com uma linha só, o
 *     total por grandeza seria igual à linha e qualquer leitura que ignorasse a segunda acertaria
 *     o número. Elas usam a MESMA natureza e a MESMA fonte em ANOS diferentes do quadriênio, que
 *     é o que a unicidade `(plano, natureza, fonte, ano)` permite — nada de código inventado.
 *   · UM programa no plano e UMA ação dele, para que o comparativo tenha mais de uma GRANDEZA e a
 *     tabela de totais mostre que valores de grandezas diferentes não se somam.
 *   · A LDO do exercício e UMA linha de metas fiscais — é ela que o percurso usa para a recusa
 *     que importa: a receita primária não pode ultrapassar a total, regra que o banco impõe na
 *     linha aprovada e que o delta ao lado dela deixaria de acionar.
 *
 * ⚠️ TUDO ENTRA POR COMANDO DE DOMÍNIO, com autorização: `criarPlanoPlurianual`,
 * `criarEixoEstruturante`, `criarAreaTematica`, `criarProgramaPpa`, `criarPrevisaoReceitaPpa`,
 * `criarLdo`, `criarMetaAnualLdo`. Nenhum `create` solto.
 *
 * ⚠️ A NATUREZA, A FONTE E O PROGRAMA SÃO OS QUE O BANCO JÁ TEM — lidos, não criados:
 * são tabela de classificação, e inventar código de classificação é inventar norma.
 *
 * Uso:  DATABASE_URL=<clone dos percursos> npx tsx scripts/preparar-alteracoes-do-planejamento-de-percursos.ts
 */

const POR = process.env["SEED_IDENTIDADE"] ?? "admin@cg.pb.gov.br";
const ANO = new Date().getFullYear();

/** O quadriênio começa no exercício corrente — as previsões caem nos dois primeiros anos. */
const ANO_INICIO = ANO;
const ANO_FIM = ANO + 3;

async function main(): Promise<void> {
  const url = process.env["DATABASE_URL"] ?? "";
  if (url.endsWith("/gestao_publica_percursos")) {
    throw new Error(
      "Esta fixture GRAVA PPA, LDO e metas. Aponte DATABASE_URL para um clone — o banco base serve outras frentes."
    );
  }
  const prisma = criarPrismaClient(url);
  try {
    const natureza = await prisma.naturezaReceita.findFirstOrThrow({
      orderBy: { codigo: "asc" },
      select: { id: true, codigo: true },
    });
    const fonte = await prisma.fonteRecurso.findFirstOrThrow({
      orderBy: { codigo: "asc" },
      select: { id: true, codigo: true },
    });
    const programa = await prisma.programa.findFirstOrThrow({
      orderBy: { codigo: "asc" },
      select: { id: true, codigo: true },
    });
    const jaTem = await prisma.planoPlurianual.findUnique({
      where: { anoInicio: ANO_INICIO },
      select: { id: true },
    });
    if (jaTem !== null) {
      console.log(`[ja existe] PPA ${ANO_INICIO}-${ANO_FIM} — nada a fazer.`);
      return;
    }

    const { planoId } = await criarPlanoPlurianual(prisma, {
      anoInicio: ANO_INICIO,
      anoFim: ANO_FIM,
      leiRef: `Lei Municipal 1.000/${String(ANO_INICIO - 1)}`,
      dataPublicacao: new Date(`${String(ANO_INICIO - 1)}-12-20T12:00:00.000-03:00`),
      criadoPor: POR,
    });
    console.log(`[ok] PPA ${ANO_INICIO}-${ANO_FIM}`);

    // ⚠️ DUAS PREVISÕES, MESMA NATUREZA E FONTE, ANOS DIFERENTES — a fixture N=2.
    for (const [i, ano] of [ANO_INICIO, ANO_INICIO + 1].entries()) {
      await criarPrevisaoReceitaPpa(prisma, {
        planoId,
        naturezaReceitaId: natureza.id,
        fonteId: fonte.id,
        ano,
        valor: i === 0 ? "1000000.00" : "400000.00",
        criadoPor: POR,
      });
      console.log(`[ok] previsão ${natureza.codigo} fonte ${fonte.codigo} ${String(ano)}`);
    }

    const { eixoId } = await criarEixoEstruturante(prisma, {
      codigo: "01",
      descricao: "Cidade que administra bem",
      criadoPor: POR,
    });
    const { areaTematicaId } = await criarAreaTematica(prisma, {
      eixoId,
      codigo: "01",
      descricao: "Gestao publica",
      criadoPor: POR,
    });
    await criarProgramaPpa(prisma, {
      planoId,
      programaId: programa.id,
      areaTematicaId,
      estrategia: "Manter os servicos administrativos no quadrienio",
      valorPrevisto: "8000000.00",
      criadoPor: POR,
    });
    console.log(`[ok] programa ${programa.codigo} no plano (teto do quadriênio)`);
    // ⚠️ A AÇÃO DO PLANO (`AcaoPpa`) NÃO ENTRA NESTA FIXTURE, e a ausência é escolha: o serviço
    // dela exige unidade orçamentária, função e subfunção resolvidas, e o que o percurso precisa
    // é de DUAS GRANDEZAS diferentes na mesma peça — a previsão de receita e o teto do programa já
    // dão isso. A ação do plano como alvo está provada no teste dirigido.

    const { ldoId } = await criarLdo(prisma, {
      exercicio: ANO,
      inicioVigencia: new Date(`${String(ANO)}-01-01T12:00:00.000-03:00`),
      fimVigencia: new Date(`${String(ANO)}-12-31T12:00:00.000-03:00`),
      criadoPor: POR,
    });
    // ⚠️ A PRIMÁRIA NASCE IGUAL À TOTAL na receita: é esse estado que torna a recusa do percurso
    // inevitável e mensurável — qualquer acréscimo só na primária a faria exceder a total.
    await criarMetaAnualLdo(prisma, {
      ldoId,
      ano: ANO,
      receitaTotal: "10000000.00",
      receitaPrimaria: "10000000.00",
      despesaTotal: "9800000.00",
      despesaPrimaria: "9500000.00",
      resultadoNominal: "-200000.00",
      dividaPublicaConsolidada: "3000000.00",
      dividaConsolidadaLiquida: "2500000.00",
      receitaPrimariaPpp: "0.00",
      despesaPrimariaPpp: "0.00",
      impactoSaldoPpp: "0.00",
      criadoPor: POR,
    });
    console.log(`[ok] LDO ${String(ANO)} com metas fiscais (primária IGUAL à total, de propósito)`);
  } finally {
    await prisma.$disconnect();
  }
}

await main();
