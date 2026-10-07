import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { anularEmpenhoParcial } from "../m05-despesa/anulacao-parcial.js";
import { roteiroEmpenho } from "../m05-despesa/dominio.js";
import { empenhar } from "../m05-despesa/servico.js";
import { anexarArquivo } from "../m22-documentos/anexos.js";
import {
  cadastrarParceriaPublicoPrivada,
  empenhosDaParceria,
  informarParcelasDaParceria,
  lerLinhasDeParcelas,
  parcelasVigentesDaPpp,
  registrarSituacaoDaParceria,
  situacaoVigenteDaPpp,
} from "./parcerias-publico-privadas.js";

/**
 * V36 — AS PARCERIAS PÚBLICO-PRIVADAS (TR 5.10.1.87-89). N=2 parcerias. Cadastro com a primeira situação; situação
 * append-only; parcelas por exercício, substituíveis e dentro da vigência; o empenho vinculado (e a anulação parcial,
 * que leva o vínculo) aparece só na sua parceria com o líquido; o documento da parceria entra pelo M22. Recusas com o
 * motivo e nada gravado; quem só consulta licitações não cadastra.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const POR = "orcamento@cg.pb.gov.br";
const D = (s: string): Date => new Date(`${s}T15:00:00.000Z`);
const R_EMPENHO = roteiroEmpenho({ creditoDisponivel: "6.2.2.1.1.00.00", creditoEmpenhado: "6.2.2.1.3.01.00" });
const deps = () => criarM05Deps(prisma);

async function recusa(f: () => Promise<unknown>): Promise<string> {
  try {
    await f();
    return "gravou";
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

const base = (numero: string) => ({
  numero, objeto: "Iluminação pública em LED com manutenção", parceiroPrivado: `Concessionária ${numero}`, tipo: "ADMINISTRATIVA" as const,
  vigenciaInicio: D("2026-01-01"), vigenciaFim: D("2030-12-31"), valorGlobal: "12000000.00", contraprestacaoAnual: "2400000.00", criadoPor: POR,
});

let ppp1 = "";
let ppp2 = "";

describe("M11 V36 — parcerias público-privadas", () => {
  beforeEach(async () => {
    await limparBanco(prisma);
    ppp1 = (await cadastrarParceriaPublicoPrivada(prisma, base("PPP-01/2026"))).contratoPppId;
    ppp2 = (await cadastrarParceriaPublicoPrivada(prisma, { ...base("PPP-02/2026"), tipo: "PATROCINADA" })).contratoPppId;
  }, 60000);

  it("t1: o cadastro grava o tipo e a primeira situação; repetido, tipo inválido e vigência invertida são recusados", async () => {
    const p = await prisma.contratoPPP.findUniqueOrThrow({ where: { id: ppp2 }, select: { tipo: true, situacoes: { select: { id: true, situacao: true, data: true, criadoEm: true } } } });
    expect([p.tipo, situacaoVigenteDaPpp(p.situacoes)]).toEqual(["PATROCINADA", "EM_EXECUCAO"]);
    expect(await recusa(() => cadastrarParceriaPublicoPrivada(prisma, base("PPP-01/2026")))).toMatch(/Já existe parceria com o contrato PPP-01\/2026/);
    expect(await recusa(() => cadastrarParceriaPublicoPrivada(prisma, { ...base("PPP-03"), tipo: "OUTRA" as "PATROCINADA" }))).toMatch(/concessão patrocinada ou administrativa/);
    expect(await recusa(() => cadastrarParceriaPublicoPrivada(prisma, { ...base("PPP-04"), vigenciaFim: D("2025-12-31") }))).toMatch(/fim da vigência é anterior ao início/);
    expect(await prisma.contratoPPP.count()).toBe(2);
  });

  it("t1b: dois cadastros simultâneos do mesmo contrato — um só grava (o número é único no banco)", async () => {
    const rs = await Promise.allSettled([cadastrarParceriaPublicoPrivada(prisma, base("PPP-77")), cadastrarParceriaPublicoPrivada(prisma, base("PPP-77"))]);
    expect(rs.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.contratoPPP.count({ where: { numero: "PPP-77" } })).toBe(1);
  });

  it("t2: a situação muda com data e motivo; a mesma, a retroativa e a sem motivo são recusadas", async () => {
    await registrarSituacaoDaParceria(prisma, { contratoPppId: ppp1, situacao: "SUSPENSA", data: D("2026-06-01"), motivo: "Suspensão determinada pelo Tribunal de Contas", criadoPor: POR });
    expect(await recusa(() => registrarSituacaoDaParceria(prisma, { contratoPppId: ppp1, situacao: "SUSPENSA", data: D("2026-07-01"), motivo: "repetição da suspensão", criadoPor: POR }))).toMatch(/já está suspensa/);
    expect(await recusa(() => registrarSituacaoDaParceria(prisma, { contratoPppId: ppp1, situacao: "EM_EXECUCAO", data: D("2026-05-01"), motivo: "retomada com data anterior", criadoPor: POR }))).toMatch(/anterior à da situação vigente \(01\/06\/2026\)/);
    expect(await recusa(() => registrarSituacaoDaParceria(prisma, { contratoPppId: ppp1, situacao: "RESCINDIDA", data: D("2026-08-01"), motivo: "curto", criadoPor: POR }))).toMatch(/Diga o motivo/);
    const s = await prisma.situacaoDaPpp.findMany({ where: { contratoPppId: ppp1 }, select: { id: true, situacao: true, data: true, criadoEm: true } });
    expect([s.length, situacaoVigenteDaPpp(s)]).toEqual([2, "SUSPENSA"]);
    const outra = await prisma.situacaoDaPpp.findMany({ where: { contratoPppId: ppp2 }, select: { id: true, situacao: true, data: true, criadoEm: true } });
    expect(situacaoVigenteDaPpp(outra)).toBe("EM_EXECUCAO");
    // data futura é recusada: valeria já e travaria a correção
    expect(await recusa(() => registrarSituacaoDaParceria(prisma, { contratoPppId: ppp2, situacao: "ENCERRADA", data: D("2099-01-01"), motivo: "encerramento digitado com o ano errado", criadoPor: POR }))).toMatch(/é futura/);
  });

  it("t2b: a mudança no MESMO dia civil do cadastro vale, ainda que gravada com hora anterior (régua do dia, não do instante)", async () => {
    // cadastro com início às 15:00 UTC (12:00 civil); suspensão do mesmo dia às 10:00 UTC (07:00 civil)
    await registrarSituacaoDaParceria(prisma, { contratoPppId: ppp2, situacao: "SUSPENSA", data: new Date("2026-01-01T10:00:00.000Z"), motivo: "suspensa no mesmo dia da assinatura", criadoPor: POR });
    const s = await prisma.situacaoDaPpp.findMany({ where: { contratoPppId: ppp2 }, select: { id: true, situacao: true, data: true, criadoEm: true } });
    expect(situacaoVigenteDaPpp(s)).toBe("SUSPENSA");
    expect(await recusa(() => registrarSituacaoDaParceria(prisma, { contratoPppId: ppp2, situacao: "SUSPENSA", data: D("2026-02-01"), motivo: "suspensão repetida no mês seguinte", criadoPor: POR }))).toMatch(/já está suspensa/);
  });

  it("t3: parcelas por exercício — informar de novo substitui; fora da vigência e ano repetido no lote recusam o lote inteiro", async () => {
    await informarParcelasDaParceria(prisma, { contratoPppId: ppp1, parcelas: [{ ano: 2026, valor: "2000000.00" }, { ano: 2027, valor: "2400000.00" }], criadoPor: POR });
    await informarParcelasDaParceria(prisma, { contratoPppId: ppp1, parcelas: [{ ano: 2027, valor: "2500000.50" }], criadoPor: POR });
    expect(await recusa(() => informarParcelasDaParceria(prisma, { contratoPppId: ppp1, parcelas: [{ ano: 2028, valor: "1.00" }, { ano: 2031, valor: "1.00" }], criadoPor: POR }))).toMatch(/parcela de 2031 está fora da vigência do contrato PPP-01\/2026 \(2026 a 2030\)/);
    expect(await recusa(() => informarParcelasDaParceria(prisma, { contratoPppId: ppp1, parcelas: [{ ano: 2028, valor: "1.00" }, { ano: 2028, valor: "2.00" }], criadoPor: POR }))).toMatch(/2028 aparece mais de uma vez/);
    const linhas = await prisma.parcelaDaPpp.findMany({ where: { contratoPppId: ppp1 }, select: { id: true, ano: true, valor: true, criadoEm: true } });
    expect(linhas).toHaveLength(3);
    const vigentes = parcelasVigentesDaPpp(linhas.map((l) => ({ ...l, valor: l.valor as never })));
    expect(vigentes.map((v) => [v.ano, String(v.valor)])).toEqual([[2026, "2000000"], [2027, "2500000.5"]]);
    expect(await prisma.parcelaDaPpp.count({ where: { contratoPppId: ppp2 } })).toBe(0);
  });

  it("t4: as linhas de parcela coladas — formatos aceitos e todas as ruins nomeadas", () => {
    expect(lerLinhasDeParcelas("2027; 1.250.000,00\n2028\t1300000.5\n\n2029 R$ 7,10\n2030;1.250")).toEqual({
      parcelas: [{ ano: 2027, valor: "1250000.00" }, { ano: 2028, valor: "1300000.5" }, { ano: 2029, valor: "7.10" }, { ano: 2030, valor: "1250" }],
      erros: [],
    });
    const ruim = lerLinhasDeParcelas("2027; abc\n2028; 10,00\n27; 5,00");
    expect(ruim.parcelas).toEqual([{ ano: 2028, valor: "10.00" }]);
    expect(ruim.erros).toHaveLength(2);
    // malformados que antes mudavam de escala em silêncio ("1.250.00" virava 125.000,00) são recusados
    const malformados = lerLinhasDeParcelas("2027; 1.250.00\n2028; 1.2.3\n2029; .5\n2030; 12.50.000,00");
    expect([malformados.parcelas, malformados.erros.length]).toEqual([[], 4]);
    expect(ruim.erros[0]).toMatch(/^linha 1 /);
    expect(ruim.erros[1]).toMatch(/^linha 3 /);
  });

  it("t5: quem só consulta licitações não cadastra nem muda a parceria", async () => {
    const u = await prisma.usuario.create({ data: { identificador: "so.le.ppp@cg.pb.gov.br", nome: "Só lê", criadoPor: "TESTE" }, select: { id: true } });
    const p = await prisma.perfil.create({ data: { nome: "SO_LE_PPP", descricao: "x", criadoPor: "TESTE", permissoes: { create: [{ acao: "CONSULTAR_LICITACOES" as never, criadoPor: "TESTE" }] } }, select: { id: true } });
    await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "TESTE" } });
    expect(await recusa(() => cadastrarParceriaPublicoPrivada(prisma, { ...base("PPP-09"), criadoPor: "so.le.ppp@cg.pb.gov.br" }))).toMatch(/CADASTRAR_CONTRATO/);
    expect(await recusa(() => informarParcelasDaParceria(prisma, { contratoPppId: ppp1, parcelas: [{ ano: 2026, valor: "1.00" }], criadoPor: "so.le.ppp@cg.pb.gov.br" }))).toMatch(/CADASTRAR_CONTRATO/);
    expect(await recusa(() => registrarSituacaoDaParceria(prisma, { contratoPppId: ppp1, situacao: "SUSPENSA", data: D("2026-02-01"), motivo: "tentativa de quem só consulta", criadoPor: "so.le.ppp@cg.pb.gov.br" }))).toMatch(/CADASTRAR_CONTRATO/);
    expect([await prisma.contratoPPP.count(), await prisma.parcelaDaPpp.count()]).toEqual([2, 0]);
  });

  it("t6: o empenho com a parceria (e a anulação parcial, que leva o vínculo) aparece só nela, com o líquido; o documento tem dono único", async () => {
    await prisma.contaPcasp.createMany({
      data: [
        { id: "c-disp", codigo: "6.2.2.1.1.00.00", nome: "Crédito Disponível", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
        { id: "c-emp", codigo: "6.2.2.1.3.01.00", nome: "Crédito Empenhado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      ],
    });
    await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
    await prisma.unidadeOrcamentaria.create({ data: { id: "uo-01", codigo: "01001", descricao: "Obras", orgaoId: "org-01" } });
    await prisma.funcao.create({ data: { id: "fun-25", codigo: "25", nome: "Energia" } });
    await prisma.subfuncao.create({ data: { id: "sub-752", codigo: "752", nome: "Energia elétrica" } });
    await prisma.programa.create({ data: { id: "prg", codigo: "0025", descricao: "P" } });
    await prisma.acao.create({ data: { id: "aca", codigo: "2025", descricao: "M", tipo: "ATIVIDADE" } });
    await prisma.naturezaDespesa.create({ data: { id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Serviços PJ" } });
    await prisma.fonteRecurso.create({ data: { id: "fnt-500", codigo: "500", descricao: "Não vinculados", codigoTce: "500" } });
    await criarFichaDeTeste(prisma, { id: "ficha", exercicio: 2026, numero: 1, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-25", subfuncaoId: "sub-752", programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd", fonteId: "fnt-500", valorDotado: "100000.00" });
    const emp = (numero: string, valor: string, ppp?: string) =>
      empenhar({ fichaId: "ficha", numero, tipo: "ORDINARIO", valor, data: D("2026-03-10"), credorCpfCnpj: "12345678000195", historico: "contraprestação", categoriaOrdemCronologica: "PRESTACAO_SERVICOS", ...(ppp !== undefined ? { contratoPppId: ppp } : {}), criadoPor: POR }, R_EMPENHO, deps());
    const e1 = (await emp("NE-1", "1000.00", ppp1)).empenhoId;
    await emp("NE-2", "500.00", ppp2);
    await emp("NE-3", "50.00");
    await anularEmpenhoParcial({ originalId: e1, numero: "NE-1-A", valor: "300.00", data: D("2026-03-20"), motivo: "redução da contraprestação por desempenho abaixo da meta", criadoPor: POR }, deps());
    expect(await prisma.empenho.count({ where: { contratoPppId: ppp1 } })).toBe(2);
    expect((await empenhosDaParceria(prisma, ppp1)).map((e) => [e.numero, e.valor.toFixed(2), e.liquido.toFixed(2)])).toEqual([["NE-1", "1000.00", "700.00"]]);
    expect((await empenhosDaParceria(prisma, ppp2)).map((e) => [e.numero, e.liquido.toFixed(2)])).toEqual([["NE-2", "500.00"]]);
    expect(await recusa(() => emp("NE-4", "10.00", "nao-existe"))).toMatch(/Parceria público-privada nao-existe não existe/);
    // fora da vigência da parceria (que começa em maio): recusado, como o empenho de contrato
    const tardia = (await cadastrarParceriaPublicoPrivada(prisma, { ...base("PPP-05"), vigenciaInicio: D("2026-05-01") })).contratoPppId;
    expect(await recusa(() => emp("NE-5", "10.00", tardia))).toMatch(/fora da vigência da parceria PPP-05 \(01\/05\/2026 a 31\/12\/2030\)/);

    const pdf = new TextEncoder().encode("%PDF-1.4\n% contrato\n");
    await anexarArquivo(prisma, { nomeOriginal: "contrato.pdf", mimeType: "application/pdf", conteudo: pdf, contratoPppId: ppp1, criadoPor: POR });
    expect(await prisma.anexo.count({ where: { contratoPppId: ppp1 } })).toBe(1);
    expect(await recusa(() => anexarArquivo(prisma, { nomeOriginal: "x.pdf", mimeType: "application/pdf", conteudo: pdf, contratoPppId: "nao-existe", criadoPor: POR }))).toMatch(/Parceria público-privada nao-existe não existe/);
    expect(await recusa(() => anexarArquivo(prisma, { nomeOriginal: "x.pdf", mimeType: "application/pdf", conteudo: pdf, contratoPppId: ppp1, pessoaId: "p", criadoPor: POR }))).toMatch(/EXATAMENTE UM registro/);
  });
});
