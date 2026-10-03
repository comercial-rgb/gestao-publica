import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { saldoDasContas } from "./adapter-prisma.js";
import { declararRoteiroPatrimonial, listarRoteirosPatrimoniais } from "./roteiro-patrimonial-declarado.js";
import { cadastrarPrecatorio, inscreverPrecatorio } from "../m29-precatorios/servico.js";
import { aprovarPrestacaoDeContas, cadastrarConvenio, liberarParcela } from "../m28-convenios/servico.js";

/**
 * V32 — O ROTEIRO DE PRECATÓRIO E DE CONVÊNIO DECLARADO PELA TELA.
 *
 * Sem `RoteiroPrecatorio`/`RoteiroConvenio` (instalação limpa), inscrever precatório e aprovar prestação de
 * convênio são recusados. Declarado pela tela, os dois lançam com as contas declaradas.
 *
 * À mão, precatório, N=2 precatórios e duas versões do roteiro da inscrição:
 *   v1  D VPD-A × C PASSIVO   → precatório P1 de 10.000
 *   v2  D VPD-B × C PASSIVO   → precatório P2 de  4.000
 *   VPD-A 10.000 · VPD-B 4.000 · PASSIVO 14.000 (a v2 não reescreve o lançamento da P1)
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const POR = "contabilidade@cg.pb.gov.br";
const LEITOR = "so.consulta.roteiro@cg.pb.gov.br";
const PASSIVO = "2.1.9.2.1.00.00";
const VPD_A = "3.5.1.1.1.00.00";
const VPD_B = "3.5.1.1.2.00.00";
const CTRL_A = "8.1.1.1.1.00.00";
const CTRL_B = "8.1.1.2.1.00.00";
const FUNDAMENTO = "Plano de contas do Tribunal: precatório reconhecido no passivo contra a VPD de sentenças.";

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-prec", codigo: PASSIVO, nome: "Precatórios a pagar", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-vpd-a", codigo: VPD_A, nome: "VPD sentenças A", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-vpd-b", codigo: VPD_B, nome: "VPD sentenças B", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-vpd-s", codigo: "3.5.1.0.0.00.00", nome: "VPD sintética", naturezaSaldo: "DEVEDORA", nivel: 4, analitica: false },
      { id: "c-ctrl-a", codigo: CTRL_A, nome: "Convênios a prestar contas", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-ctrl-b", codigo: CTRL_B, nome: "Convênios — execução", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
    ],
  });
  await prisma.fonteRecurso.create({ data: { id: "f500", codigo: "500", descricao: "Livre", codigoTce: "500" } });
  const perfil = await prisma.perfil.create({
    data: { nome: "SO_CONSULTA_ROTEIRO", descricao: "so consulta", criadoPor: POR, permissoes: { create: [{ acao: "CONSULTAR_CONTABILIDADE", criadoPor: POR }] } },
    select: { id: true },
  });
  const u = await prisma.usuario.create({ data: { identificador: LEITOR, nome: LEITOR, criadoPor: POR }, select: { id: true } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: perfil.id, criadoPor: POR } });
}

const declarar = (o: { familia?: "PRECATORIO" | "CONVENIO"; chave?: string; d?: string; c?: string; h?: string; por?: string } = {}) =>
  declararRoteiroPatrimonial(prisma, {
    familia: o.familia ?? "PRECATORIO", chave: o.chave ?? "INSCRICAO",
    contaDebitoCodigo: o.d ?? VPD_A, contaCreditoCodigo: o.c ?? PASSIVO,
    historicoPadrao: o.h ?? "Inscrição de precatório", fundamento: FUNDAMENTO, criadoPor: o.por ?? POR,
  });

async function precatorio(numero: string, valor: string): Promise<void> {
  const { precatorioId } = await cadastrarPrecatorio(prisma, {
    numeroProcesso: numero, tribunal: "TJPB", beneficiarioNome: `Beneficiário ${numero}`, beneficiarioDocumento: "12345678909",
    natureza: "COMUM", preferencia: "NENHUMA", diaApresentacao: "2026-02-01", exercicioDePagamento: 2026, valorOriginal: valor,
    contaContabilId: "c-prec", criadoPor: POR,
  });
  await inscreverPrecatorio(prisma, { precatorioId, valor, diaMovimento: "2026-02-01", motivo: `Reconhecimento do precatório ${numero}.`, criadoPor: POR });
}

async function saldo(codigo: string, credora = false): Promise<string> {
  const s = await saldoDasContas(prisma, [codigo], null);
  return (credora ? s.negated() : s).toFixed(2);
}

describe("V32 — roteiro de precatório e convênio declarado pela tela", () => {
  beforeEach(semear);

  it("t1: sem roteiro a inscrição recusa dizendo onde declarar; declarado, lança; a v2 vale só para a próxima (N=2)", async () => {
    await expect(precatorio("PROC-0000", "10000.00")).rejects.toThrow(/Roteiros de precatórios e convênios/);
    expect((await listarRoteirosPatrimoniais(prisma)).find((r) => r.chave === "INSCRICAO")!.situacao).toBe("PENDENTE");

    await declarar();
    await precatorio("PROC-0001", "10000.00");
    expect((await declarar({ d: VPD_B })).versao).toBe(2);
    await precatorio("PROC-0002", "4000.00");

    expect(await saldo(VPD_A)).toBe("10000.00");
    expect(await saldo(VPD_B)).toBe("4000.00");
    expect(await saldo(PASSIVO, true)).toBe("14000.00");
    const linha = (await listarRoteirosPatrimoniais(prisma)).find((r) => r.chave === "INSCRICAO")!;
    expect([linha.situacao, linha.versao, linha.contaDebitoCodigo]).toEqual(["DECLARADO", 2, VPD_B]);
  });

  it("t2: convênio — a prestação do convenente lança no controle com o roteiro declarado", async () => {
    const { convenioId } = await cadastrarConvenio(prisma, {
      identificador: "CV-2026-010", objeto: "Recurso estadual para a reforma da escola municipal", papelDoEnte: "CONVENENTE",
      partidaNome: "Governo do Estado", partidaDocumento: "12345678000195", leiAutorizativa: "Lei Municipal 8.100/2025",
      valorRepasse: "50000.00", valorContrapartida: "5000.00", diaVigenciaInicio: "2026-01-01", diaVigenciaFim: "2026-12-31",
      fonteRecursoId: "f500", contaContabilId: "c-ctrl-a", criadoPor: POR,
    });
    await liberarParcela(prisma, { convenioId, valor: "20000.00", parcela: 1, diaMovimento: "2026-03-01", competencia: "2026-03", motivo: "Primeira parcela recebida do Estado.", criadoPor: POR });
    const prestar = () =>
      aprovarPrestacaoDeContas(prisma, { convenioId, valor: "20000.00", diaMovimento: "2026-04-01", competencia: "2026-04", motivo: "Prestação da primeira parcela aprovada.", criadoPor: POR });
    await expect(prestar()).rejects.toThrow(/Roteiros de precatórios e convênios/);
    await declarar({ familia: "CONVENIO", chave: "PRESTACAO_APROVADA/CONVENENTE", d: CTRL_B, c: CTRL_A, h: "Prestação de contas aprovada" });
    await prestar();
    expect(await saldo(CTRL_B)).toBe("20000.00");
    expect(await saldo(CTRL_A, true)).toBe("20000.00");
  });

  it("t3: as recusas nomeiam o motivo e nada é gravado", async () => {
    await expect(declarar({ d: CTRL_A })).rejects.toThrow(/não é do subsistema patrimonial/);
    await expect(declarar({ familia: "CONVENIO", chave: "GLOSA/CONCEDENTE", d: VPD_A, c: CTRL_A })).rejects.toThrow(/não é do subsistema de controle/);
    await expect(declarar({ d: "3.5.1.0.0.00.00" })).rejects.toThrow(/é sintética/);
    await expect(declarar({ d: "3.9.9.9.9.99.99" })).rejects.toThrow(/não está no plano/);
    await expect(declarar({ d: PASSIVO, c: PASSIVO })).rejects.toThrow(/são a mesma/);
    await expect(declarar({ chave: "PAGAMENTO" })).rejects.toThrow(/não existe em Precatórios/);
    expect(await prisma.roteiroPatrimonialDeclarado.count()).toBe(0);
    await declarar();
    await expect(declarar()).rejects.toThrow(/já é este/);
    expect(await prisma.roteiroPatrimonialDeclarado.count()).toBe(1);
  });

  it("t4: quem só consulta não declara — recusa nomeando a ação, e nada nasce", async () => {
    await expect(declarar({ por: LEITOR })).rejects.toThrow(/ACESSO NEGADO[\s\S]*PARAMETRIZAR_ROTEIRO_ORCAMENTARIO/);
    expect(await prisma.roteiroPatrimonialDeclarado.count()).toBe(0);
  });
});
