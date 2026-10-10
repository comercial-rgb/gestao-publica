import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { detalharPropostaOrcamentaria, elaborarPropostaOrcamentaria } from "../modules/m02-planejamento/proposta-orcamentaria.js";
import { conferirProposta, levantarFatosDoPlanejamento } from "../modules/m02-planejamento/conferencia-da-proposta.js";
import { baseAdmiteEnsaio, naturezaDaBase } from "../modules/m16-travamento/natureza-da-base.js";
import { entrar, lancarNavegadorDoPercurso, type Navegador } from "./percursos-navegador.js";

/**
 * V39-013 — MEDIR A PROPOSTA GRANDE ANTES DE MEXER. Mede, para uma proposta:
 *   · servidor: o tempo de `detalharPropostaOrcamentaria` (frio e quente), o tamanho do objeto em JSON, e o tempo da
 *     conferência (os fatos do planejamento) — as duas leituras que a página faz;
 *   · navegador (com BASE): o tempo até o HTML chegar e até a página ficar carregada, os bytes do HTML, o número de
 *     nós do DOM e de formulários.
 *
 *   MODO=gerar ORIGEM=2026 DESTINO=2099 EXTRAS=9000   — cria a proposta sintética (importa a origem e acrescenta linhas
 *       novas copiando a classificação de uma ficha da origem). SÓ em base declarada DEMONSTRACAO ou ENSAIO.
 *   MODO=medir PROPOSTA=<id>                            — mede (sem gravar nada).
 * Banco por PERCURSO_BANCO (ou DATABASE_URL). Não imprime URL nem senha.
 */
const prisma = criarPrismaClient(process.env["PERCURSO_BANCO"] ?? process.env["DATABASE_URL"] ?? "");
const modo = process.env["MODO"] ?? "medir";
const ms = (t0: bigint): number => Number((process.hrtime.bigint() - t0) / 1_000_000n);

try {
  if (modo === "gerar") {
    const n = await naturezaDaBase(prisma);
    if (!baseAdmiteEnsaio(n.natureza)) throw new Error(`Recusado: a base está declarada ${n.natureza}; dados sintéticos só em DEMONSTRACAO ou ENSAIO.`);
    const origem = Number(process.env["ORIGEM"] ?? "2026");
    const destino = Number(process.env["DESTINO"] ?? "2099");
    const extras = Number(process.env["EXTRAS"] ?? "0");
    const por = process.env["MEDICAO_POR"] ?? "admin@cg.pb.gov.br";
    const p = await elaborarPropostaOrcamentaria(prisma, {
      exercicioDeOrigem: origem, exercicio: destino, descricao: `Medição V39-013 (sintética, ${String(extras)} linhas extras)`,
      aproveitaReceitas: true, aproveitaFichas: true, baseDaReceita: "PREVISAO_ATUALIZADA", percentualDaReceita: "0",
      baseDaDespesa: "DOTACAO_AUTORIZADA", percentualDaDespesa: "0", reajustaProjetos: true, incluiFichasAbertasPorCredito: false, criadoPor: por,
    });
    console.log(`proposta sintética ${p.id}: ${String(p.linhasDeDespesa)} fichas e ${String(p.linhasDeReceita)} receitas importadas de ${String(origem)}`);
    if (extras > 0) {
      const f = await prisma.fichaOrcamentaria.findFirstOrThrow({ where: { exercicio: origem }, orderBy: { numero: "asc" }, select: { orgaoId: true, unidadeOrcId: true, funcaoId: true, subfuncaoId: true, programaId: true, acaoId: true, naturezaDespesaId: true, fonteId: true, coId: true, exercicioFonte: true } });
      const t0 = process.hrtime.bigint();
      for (let feitos = 0; feitos < extras; feitos += 1000) {
        const lote = Math.min(1000, extras - feitos);
        await prisma.linhaDeDespesaDaProposta.createMany({
          data: Array.from({ length: lote }, () => ({ propostaOrcamentariaId: p.id, ...f, valorNaLeiDeOrigem: "0", valorBase: "100.00", valorProjetado: "100.00", motivo: "linha sintética de medição (V39-013)", criadoPor: por, criadoEm: new Date() })),
        });
      }
      console.log(`${String(extras)} linhas novas sintéticas em ${String(ms(t0))} ms`);
    }
  } else {
    const id = process.env["PROPOSTA"] ?? "";
    if (id === "") throw new Error("Informe PROPOSTA=<id>.");
    const tempos: number[] = [];
    let tamanho = 0;
    let linhas = 0;
    for (let i = 0; i < 3; i += 1) {
      const t0 = process.hrtime.bigint();
      const d = await detalharPropostaOrcamentaria(prisma, id);
      tempos.push(ms(t0));
      if (d === null) throw new Error("proposta não encontrada");
      tamanho = JSON.stringify(d).length;
      linhas = d.despesas.length + d.receitas.length;
    }
    const d = (await detalharPropostaOrcamentaria(prisma, id))!;
    const t1 = process.hrtime.bigint();
    conferirProposta(d, await levantarFatosDoPlanejamento(prisma, d.exercicio));
    const tConf = ms(t1);
    console.log(`servidor: ${String(linhas)} linhas; detalhar ${tempos.map(String).join(" / ")} ms (frio / quente / quente); objeto ${String(Math.round(tamanho / 1024))} KiB; conferência ${String(tConf)} ms`);

    const base = process.env["BASE"];
    if (base !== undefined && base !== "") {
      const nav = await lancarNavegadorDoPercurso();
      try {
        const page = await nav.newPage();
        page.setDefaultTimeout(600000);
        await entrar({ base } as Navegador, page, process.env["PERCURSO_USUARIO"] ?? "admin@cg.pb.gov.br", process.env["PERCURSO_SENHA"] ?? process.env["SEED_ADMIN_SENHA"] ?? "");
        for (const rodada of ["fria", "quente"]) {
          const t0 = process.hrtime.bigint();
          const resp = await page.goto(`${base}/planejamento/proposta-orcamentaria/${id}`, { waitUntil: "load", timeout: 600000 });
          const tLoad = ms(t0);
          // O corpo da navegação sai do cache de inspeção quando é grande: o tamanho vem de um fetch da mesma página.
          const t2 = process.hrtime.bigint();
          const html = await page.evaluate(async (u: string) => (await (await fetch(u)).text()).length, `${base}/planejamento/proposta-orcamentaria/${id}`);
          console.log(`   resposta do servidor (fetch): ${String(ms(t2))} ms`);
          const dom = await page.evaluate(() => ({ nos: document.getElementsByTagName("*").length, forms: document.forms.length }));
          console.log(`navegador (${rodada}): HTTP ${String(resp?.status())}, até carregar ${String(tLoad)} ms, HTML ${String(Math.round(html / 1024))} KiB, ${String(dom.nos)} nós, ${String(dom.forms)} formulários`);
        }
      } finally {
        await nav.close();
      }
    }
  }
} finally {
  await prisma.$disconnect();
}
