import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { criarM04Deps } from "../m04-receita/adapter-prisma.js";
import { registrarArrecadacao } from "../m04-receita/servico.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { empenhar } from "../m05-despesa/servico.js";
import { liquidar } from "../m05-despesa/servico-bloco2.js";
import type { M05Deps } from "../m05-despesa/ports.js";
import { arrecadarIngressoOperacaoCredito } from "../m10-patrimonial/adapter-m04.js";
import { cadastrarDivida } from "../m10-patrimonial/divida.js";
import { roteiroArrecadacao, roteiroEmpenho } from "../m01-core-contabil/roteiros.js";
// ⚠️ A liquidação de PESSOAL (elem 11) usa o roteiro do M05 com contas EXPLÍCITAS — o do M01 só
// conhece 30/39/71 (MAPA-ELEMENTO-CONTA). Mesmo padrão do teste do RGF Anexo 1.
import { roteiroLiquidacao } from "../m05-despesa/dominio.js";
import { semearPcasp } from "../../prisma/seed/pcasp.js";
import { rgfAnexo1 } from "./rgf-anexo1.js";
import { rgfAnexo2 } from "./rgf-anexo2.js";
import { rgfAnexo3 } from "./rgf-anexo3.js";
import { rgfAnexo4 } from "./rgf-anexo4.js";
import { rgfAnexo5 } from "./rgf-anexo5.js";
import { rgfAnexo6 } from "./rgf-anexo6.js";
import { situacaoDePessoal, situacaoDeTeto } from "./simplificado.js";

/**
 * RGF — ANEXO 6: DEMONSTRATIVO SIMPLIFICADO. O teste é de IDENTIDADE, não de aritmética: cada linha
 * do simplificado tem de ser IGUAL ao campo do anexo analítico dono dele. Se o simplificado lesse o
 * campo errado (o limite no lugar do valor, a coluna errada), este teste cai.
 *
 * ═══ O CENÁRIO (2026) — só o bastante para os campos ficarem distinguíveis ═══
 *   IPTU corrente ...... 1.000.000  → RCL
 *   pessoal (grupo 1) .... 200.000  empenhado e liquidado (Poder Executivo)
 *   op. crédito → dívida MOBILIÁRIA . 300.000  (composto 4.64: receita origem 21 + ingresso)
 *   garantias: nenhuma (interruptor)
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "orcamento@cg.pb.gov.br";
const DIVIDA = "2.2.1.1.1.00.00";
const R_ARR_IPTU = roteiroArrecadacao({ disponibilidade: "1.1.1.1.1.00.00", variacaoAumentativa: "4.1.1.2.1.01.00" });
const R_ARR_OPCRED = roteiroArrecadacao({ disponibilidade: "1.1.1.1.1.00.00", variacaoAumentativa: DIVIDA });
const R_EMP = roteiroEmpenho();
const R_LIQ_PESSOAL = roteiroLiquidacao({ variacaoDiminutiva: "3.3.2.1.1.01.00", obrigacaoAPagar: "2.1.3.1.1.00.00", creditoEmpenhado: "6.2.2.1.3.01.00", creditoLiquidado: "6.2.2.1.3.03.00" });

let deps: M05Deps;

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await semearPcasp(prisma);
  deps = criarM05Deps(prisma);

  await prisma.orgao.create({ data: { id: "org-02", codigo: "02", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({ data: { id: "uo", codigo: "02001", descricao: "Adm", orgaoId: "org-02" } });
  await prisma.funcao.create({ data: { id: "fun", codigo: "04", nome: "Adm" } });
  await prisma.subfuncao.create({ data: { id: "sub", codigo: "122", nome: "Adm" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0004", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.deParaOrgaoPoder.create({ data: { orgaoCodigo: "02", poder: "EXECUTIVO", criadoPor: "T" } });

  await prisma.naturezaDespesa.create({ data: { id: "nd-pessoal", codCategoria: "3", codNatureza: "1", codModalidade: "90", codElemento: "11", codigoCompleto: "319011", descricao: "Vencimentos" } });
  await prisma.naturezaReceita.createMany({
    data: [
      { id: "nr-iptu", codigo: "11130111", descricao: "IPTU" },
      { id: "nr-opc", codigo: "21110000", descricao: "Operações de crédito internas" },
    ],
  });
  await prisma.fonteRecurso.create({ data: { id: "fnt-500", codigo: "500", descricao: "Livre", codigoTce: "500" } });
  await prisma.contaBancaria.create({ data: { id: "cb1", codigo: "CC-001", descricao: "Mov", fonteId: "fnt-500" } });
  for (const ano of [2025, 2026]) await prisma.exercicio.upsert({ where: { ano }, update: {}, create: { ano, criadoPor: "T" } });

  const passivo = await prisma.contaPcasp.findUniqueOrThrow({ where: { codigo: DIVIDA }, select: { id: true } });
  await cadastrarDivida(prisma, { identificador: "TIT-1", credorNome: "Mercado", credorDocumento: "00000000000191", tipo: "MOBILIARIA", leiAutorizativa: "Lei 1/2026", objeto: "emissão de títulos públicos", contaContabilId: passivo.id, criadoPor: POR });

  await criarFichaDeTeste(prisma, { id: "f-pessoal", exercicio: 2026, numero: 1, orgaoId: "org-02", unidadeOrcId: "uo", funcaoId: "fun", subfuncaoId: "sub", programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd-pessoal", fonteId: "fnt-500", valorDotado: "500000.00" });
}

async function cenario(): Promise<void> {
  await registrarArrecadacao(
    { exercicio: 2026, naturezaReceita: "11130111", fonte: "500", valor: "1000000.00", dataArrecadacao: new Date("2026-02-10T12:00:00Z"), numeroReceita: "IPTU-1", criadoPor: POR },
    R_ARR_IPTU, criarM04Deps(prisma)
  );

  const e = await empenhar({ fichaId: "f-pessoal", numero: "NE-P", tipo: "ORDINARIO", valor: "200000.00", data: new Date("2026-02-01T12:00:00Z"), credorCpfCnpj: "12345678000199", historico: "pessoal", categoriaOrdemCronologica: "FORNECIMENTO_BENS", criadoPor: POR }, R_EMP, deps);
  await liquidar({ empenhoId: e.empenhoId, numero: "NL-P", valor: "200000.00", data: new Date("2026-02-15T12:00:00Z"), responsavelAtesto: "F", historico: "l", criadoPor: POR }, R_LIQ_PESSOAL, deps);

  const dMob = await prisma.dividaConsolidada.findFirstOrThrow({ where: { tipo: "MOBILIARIA" }, select: { id: true } });
  await arrecadarIngressoOperacaoCredito(prisma, {
    arrecadacao: { exercicio: 2026, naturezaReceita: "21110000", fonte: "500", valor: "300000.00", dataArrecadacao: new Date("2026-02-10T12:00:00Z"), numeroReceita: "OPC-1", criadoPor: POR },
    roteiro: R_ARR_OPCRED, dividaId: dMob.id, motivo: "emissão de títulos",
  });
}

const linha = (a6: Awaited<ReturnType<typeof rgfAnexo6>>, chave: string) => a6.linhas.find((l) => l.chave === chave)!;

describe("M12 — RGF Anexo 6 (Demonstrativo Simplificado)", () => {
  beforeEach(async () => {
    await semear();
    await cenario();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("t1 (identidade): PESSOAL — cada poder repete o campo do Anexo 1, não recalcula", async () => {
    const a6 = await rgfAnexo6(prisma, { exercicio: 2026, quadrimestre: 3 });
    const a1 = await rgfAnexo1(prisma, { exercicio: 2026, quadrimestre: 3 });

    expect(a1.poderes.length).toBeGreaterThan(0);
    for (const poder of a1.poderes) {
      const l = linha(a6, `PESSOAL_${poder.poder}`);
      expect(l.valor).toBe(poder.dtp);
      expect(l.percentual).toBe(poder.percentDtp);
      expect(l.limite).toBe(poder.limiteMaximo);
      expect(l.situacao).toBe(situacaoDePessoal(poder.situacao));
    }
  });

  it("t2 (identidade): DÍVIDA, GARANTIAS, OP. CRÉDITO — cada linha == o campo do anexo dono", async () => {
    const a6 = await rgfAnexo6(prisma, { exercicio: 2026, quadrimestre: 3 });
    const [a2, a3, a4] = await Promise.all([
      rgfAnexo2(prisma, { exercicio: 2026, quadrimestre: 3 }),
      rgfAnexo3(prisma, { exercicio: 2026, quadrimestre: 3 }),
      rgfAnexo4(prisma, { exercicio: 2026, quadrimestre: 3 }),
    ]);
    const dv = a2.colunas[a2.colunas.length - 1]!.valores;
    const gv = a3.colunas[a3.colunas.length - 1]!.valores;

    const ld = linha(a6, "DIVIDA_CONSOLIDADA");
    expect(ld.valor).toBe(dv.dividaConsolidadaLiquida);
    expect(ld.percentual).toBe(dv.percentDclSobreRcl);
    expect(ld.limite).toBe(a2.limiteSenado);
    expect(ld.situacao).toBe(situacaoDeTeto(dv.excedeuLimite, dv.emAlerta));

    const lg = linha(a6, "GARANTIAS");
    expect(lg.valor).toBe(gv.totalGarantias);
    expect(lg.limite).toBe(a3.limiteSenado);
    expect(lg.interruptor).toBe(true); // sem cadastro de garantia

    const lo = linha(a6, "OPERACOES_CREDITO");
    expect(lo.valor).toBe(a4.totalSujeitoAoLimite.ateQuadrimestre);
    expect(lo.percentual).toBe(a4.percentSobreRcl);
    expect(lo.limite).toBe(a4.limiteSenado);

    const la = linha(a6, "ARO");
    expect(la.limite).toBe(a4.aro.limitePercent);
    expect(la.valor).toBe(a4.aro.valores.ateQuadrimestre);
  });

  it("t3 (só no 3º quadrimestre): o bloco de disponibilidade == a consolidação do Anexo 5", async () => {
    const a6 = await rgfAnexo6(prisma, { exercicio: 2026, quadrimestre: 3 });
    const corte = new Date(Date.UTC(2026, 12, 0, 23, 59, 59));
    const a5 = await rgfAnexo5(prisma, { exercicio: 2026, corte });

    expect(a6.blocoDisponibilidade).not.toBeNull();
    // O "após" consolidado É o `totalLiquidaDepois` do dono (identidade direta).
    expect(a6.blocoDisponibilidade!.disponibilidadeApos).toBe(a5.totalLiquidaDepois);
    // O "antes" e o "g" não têm total no Anexo 5 (são por fonte) — consolidar é SOMAR, não recalcular.
    let antes = 0, g = 0;
    for (const l of a5.linhas) { antes += Number.parseFloat(l.disponibilidadeLiquidaAntes); g += Number.parseFloat(l.rpnpInscritosNoExercicio); }
    expect(a6.blocoDisponibilidade!.disponibilidadeAntesRpnp).toBe(antes.toFixed(2));
    expect(a6.blocoDisponibilidade!.rpnpDoExercicio).toBe(g.toFixed(2));
  });

  it("t4 (condicional): os quadrimestres 1 e 2 OMITEM o bloco do Anexo 5", async () => {
    const q1 = await rgfAnexo6(prisma, { exercicio: 2026, quadrimestre: 1 });
    const q2 = await rgfAnexo6(prisma, { exercicio: 2026, quadrimestre: 2 });
    expect(q1.blocoDisponibilidade).toBeNull();
    expect(q2.blocoDisponibilidade).toBeNull();
    // E a ausência é NOMEADA, não silenciosa.
    expect(q1.notas.some((n) => n.startsWith("DISPONIBILIDADE-SO-NO-3O-QUADRIMESTRE"))).toBe(true);

    // As linhas de limite continuam presentes nos quadrimestres 1/2.
    expect(linha(q1, "DIVIDA_CONSOLIDADA")).toBeDefined();
    expect(linha(q1, "OPERACOES_CREDITO")).toBeDefined();
  });
});
