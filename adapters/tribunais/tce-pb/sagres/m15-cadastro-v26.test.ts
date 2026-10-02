import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../../../test/banco.js";
import { criarFichaDeTeste } from "../../../../test/ficha-teste.js";
import { meioDiaCivil } from "../../../../packages/datas/index.js";
import { criarM05Deps } from "../../../../modules/m05-despesa/adapter-prisma.js";
import { empenharDe2026, semearM08, POR } from "../../../../modules/m08-restos-a-pagar/fixture-m08.js";
import { declararDadosDaAcao, declararDadosDoPrograma } from "../../../../modules/m02-planejamento/declaracao-do-programa.js";
import { declararResponsavelSiafic, designarOrdenador, encerrarDesignacaoDeOrdenador, ordenadorNaData } from "../../../../modules/m05-despesa/ordenador.js";
import { OBJETIVO_MILENIO_2026 } from "./dominios-2026v11.js";
import { gerarAcao, gerarArquivosDaV26, gerarOrdenador, gerarProgramas, gerarReceitaPrevista, gerarRelacionamentoEmpenhoLicitacao, gerarResponsavelSiafic, gerarSaldoInicial } from "./gerador-v26.js";
import { detalharReceitaPrevista } from "../../../../modules/m02-planejamento/detalhe-da-receita-prevista.js";
import { identificarNoTramita } from "../../../../modules/m11-licitacoes/identificacao-no-tramita.js";
import { lerFatosEmpenhos } from "./gerador.js";
import { gerarAtualizacaoOrcamentaria, gerarDecretosEOficios, gerarNormasOrcamentarias } from "./gerador-v26.js";
import { criarM03Deps } from "../../../../modules/m03-creditos/adapter-prisma.js";
import { criarDecreto, criarLei, executarCredito } from "../../../../modules/m03-creditos/servico.js";
import { informarProtocoloDaNorma, registrarNormaNoTce } from "../../../../modules/m03-creditos/norma-no-tce.js";
import { anexarArquivo } from "../../../../modules/m22-documentos/anexos.js";

/**
 * V26 — o cadastro que o SAGRES pede: programas (§4.2), ações (§4.3), ordenadores (§4.36 e o cpfOrdenador do §4.8) e
 * o responsável pelo sistema (§4.48). As posições dos leiautes contra o HTML estão em `m15-leiaute-oficial.test.ts`.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
const UG = "999001";
const linhas = (b: Buffer): string[] => b.toString("utf8").split("\r\n").filter((l) => l !== "");
const D = (dia: string): Date => meioDiaCivil(dia);
const MARCO = new Date(Date.UTC(2026, 2, 31));
const FEVEREIRO = new Date(Date.UTC(2026, 1, 28));
const CPF_A = "11144477735";
const CPF_B = "52998224725";

beforeEach(async () => {
  await semearM08();
  // N=2: um segundo programa (o 5000, da Primeira Infância) e uma segunda ação (projeto), com ficha em 2026.
  await prisma.programa.create({ data: { id: "prg-5000", codigo: "5000", descricao: "Primeira Infância" } });
  await prisma.acao.create({ data: { id: "aca-1001", codigo: "1001", descricao: "Construção de creche", tipo: "PROJETO" } });
  await criarFichaDeTeste(prisma, { id: "ficha-2", exercicio: 2026, numero: 2, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-12", subfuncaoId: "sub-361", programaId: "prg-5000", acaoId: "aca-1001", naturezaDespesaId: "nd", fonteId: "fnt-500", valorDotado: "1000.00" });
}, 120000);
afterAll(async () => prisma.$disconnect());

describe("§5.27 — a tabela do objetivo da Agenda 2030 é a do HTML oficial", () => {
  it("leitor independente do HTML: os 18 códigos e descrições", () => {
    const html = readFileSync(resolve(import.meta.dirname, "../../../../docs/oficial/tce-pb/layout-contabilidade-2026-v1.1-12122025.html"), "utf8");
    const texto = html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
    const trecho = texto.slice(texto.indexOf("5.27. TipoObjetivoMilenio"), texto.indexOf("5.28. PlanoDeContas"));
    const pares = [...trecho.matchAll(/\b(\d{2}) ([^0-9]+?)(?= \d{2} | $)/g)].map((m) => [m[1], (m[2] ?? "").trim()]);
    // As chaves "10".."99" são índices inteiros para o JS e vêm antes de "01".."09": a ordem é a do código.
    const nossa = Object.entries(OBJETIVO_MILENIO_2026)
      .map(([c, d]) => [c, d.replace(/\s+/g, " ")])
      .sort((x, y) => (x[0] ?? "").localeCompare(y[0] ?? ""));
    expect(pares).toEqual(nossa);
  });
});

describe("V26 — programas e ações do orçamento", { timeout: 120000 }, () => {
  it("sem declaração, a recusa nomeia os programas; declarados, sai um por programa (N=2), com a versão vigente no mês", async () => {
    await expect(gerarProgramas(prisma, { codUnidadeGestora: UG, competencia: MARCO })).rejects.toThrow(/programa\(s\) do orçamento de 2026 sem objetivo.*0012, 5000/);
    await declararDadosDoPrograma(prisma, { programaId: "prg", descricao: "Educação Básica", objetivo: "Ampliar o acesso ao ensino fundamental", tipoObjetivoMilenio: "04", fundamento: "PPA 2026-2029, programa 0012", vigenteDesde: D("2026-01-01"), criadoPor: POR });
    await declararDadosDoPrograma(prisma, { programaId: "prg-5000", descricao: "Primeira Infância", objetivo: "Atender as crianças de 0 a 6 anos", tipoObjetivoMilenio: "99", fundamento: "PPA 2026-2029, programa 5000", vigenteDesde: D("2026-01-01"), criadoPor: POR });
    // Uma nova versão do 0012 a partir de março: fevereiro sai com a antiga, março com a nova.
    await declararDadosDoPrograma(prisma, { programaId: "prg", descricao: "Educação Básica de Qualidade", objetivo: "Ampliar o acesso e a qualidade do ensino fundamental", tipoObjetivoMilenio: "04", fundamento: "Lei 650/2026, que altera o PPA", vigenteDesde: D("2026-03-01"), criadoPor: POR });
    const fev = linhas((await gerarProgramas(prisma, { codUnidadeGestora: UG, competencia: FEVEREIRO })).conteudo);
    const mar = linhas((await gerarProgramas(prisma, { codUnidadeGestora: UG, competencia: MARCO })).conteudo);
    expect(mar.map((l) => [l.length, l.slice(6, 10), l.slice(10, 80).trim(), l.slice(230, 232)])).toEqual([
      [238, "0012", "Educação Básica de Qualidade", "04"],
      [238, "5000", "Primeira Infância", "99"],
    ]);
    expect(fev[0]!.slice(10, 80).trim()).toBe("Educação Básica");
  });

  it("o objetivo 99 é só do programa 5000; código fora da tabela é recusado — nada é gravado", async () => {
    await expect(declararDadosDoPrograma(prisma, { programaId: "prg", descricao: "Educação", objetivo: "Objetivo qualquer do programa", tipoObjetivoMilenio: "99", fundamento: "PPA 2026-2029", vigenteDesde: D("2026-01-01"), criadoPor: POR })).rejects.toThrow(/reservado a ele pelo Tribunal/);
    await expect(declararDadosDoPrograma(prisma, { programaId: "prg", descricao: "Educação", objetivo: "Objetivo qualquer do programa", tipoObjetivoMilenio: "18", fundamento: "PPA 2026-2029", vigenteDesde: D("2026-01-01"), criadoPor: POR })).rejects.toThrow(/tabela do Tribunal/);
    expect(await prisma.declaracaoDoPrograma.count()).toBe(0);
  });

  it("ações: o tipo pelo §5.12, meta e unidade opcionais; meta sem unidade é recusada", async () => {
    await expect(declararDadosDaAcao(prisma, { acaoId: "aca-1001", descricao: "Construção de creche", descMeta: "2 creches", fundamento: "LOA 2026, anexo", vigenteDesde: D("2026-01-01"), criadoPor: POR })).rejects.toThrow(/unidade de medida/);
    await declararDadosDaAcao(prisma, { acaoId: "aca", descricao: "Manutenção do ensino fundamental", fundamento: "LOA 2026, anexo", vigenteDesde: D("2026-01-01"), criadoPor: POR });
    await declararDadosDaAcao(prisma, { acaoId: "aca-1001", descricao: "Construção de creche", descMeta: "Construir 2 creches", unidadeMedida: "unidade", fundamento: "LOA 2026, anexo", vigenteDesde: D("2026-01-01"), criadoPor: POR });
    const l = linhas((await gerarAcao(prisma, { codUnidadeGestora: UG, competencia: MARCO })).conteudo);
    expect(l.map((x) => [x.length, x.slice(6, 10), x.slice(80, 81), x.slice(81, 231).trim(), x.slice(231, 281).trim()])).toEqual([
      [287, "1001", "1", "Construir 2 creches", "unidade"],
      [287, "2001", "2", "", ""],
    ]);
  });
});

describe("V26 — ordenadores e responsável pelo sistema", { timeout: 120000 }, () => {
  it("o ordenador da unidade vence o do ente; encerrado, volta o do ente; dois no mesmo escopo é recusado (N=2)", async () => {
    await designarOrdenador(prisma, { cpf: CPF_A, nome: "Prefeita Municipal", escopo: "ENTE", unidadeOrcId: null, tipoDoAto: "NOMEACAO", ato: "Termo de posse 01/2025", vigenteDesde: D("2025-01-01"), criadoPor: POR });
    const sec = await designarOrdenador(prisma, { cpf: CPF_B, nome: "Secretária de Educação", escopo: "UNIDADE_ORCAMENTARIA", unidadeOrcId: "uo-01", tipoDoAto: "DELEGACAO", ato: "Decreto 15/2026", vigenteDesde: D("2026-02-01"), criadoPor: POR });
    expect((await ordenadorNaData(prisma, { data: D("2026-01-15"), unidadeOrcId: "uo-01" }))?.cpf).toBe(CPF_A);
    expect((await ordenadorNaData(prisma, { data: D("2026-02-10"), unidadeOrcId: "uo-01" }))?.cpf).toBe(CPF_B);
    await encerrarDesignacaoDeOrdenador(prisma, { designacaoId: sec.id, vigenteAte: D("2026-02-28"), ato: "Decreto 22/2026", criadoPor: POR });
    expect((await ordenadorNaData(prisma, { data: D("2026-03-02"), unidadeOrcId: "uo-01" }))?.cpf).toBe(CPF_A);
    await designarOrdenador(prisma, { cpf: CPF_B, nome: "Vice-prefeita em exercício", escopo: "ENTE", unidadeOrcId: null, tipoDoAto: "SUBSTITUICAO", ato: "Portaria 3/2026", vigenteDesde: D("2026-03-01"), criadoPor: POR });
    await expect(ordenadorNaData(prisma, { data: D("2026-03-02"), unidadeOrcId: "uo-01" })).rejects.toThrow(/2 ordenadores vigentes/);
  });

  it("o empenho sai com o CPF do ordenador da data; o arquivo do ordenador traz a designação do dia", async () => {
    await designarOrdenador(prisma, { cpf: CPF_A, nome: "Prefeita Municipal", escopo: "ENTE", unidadeOrcId: null, tipoDoAto: "NOMEACAO", ato: "Termo de posse 01/2025", vigenteDesde: D("2026-01-02"), criadoPor: POR });
    await empenharDe2026(criarM05Deps(prisma), "11", "1000.00");
    const e = await prisma.empenho.findFirstOrThrow({ select: { data: true } });
    const fatos = await lerFatosEmpenhos(prisma, { codUnidadeGestora: UG, dia: new Date(`${e.data.toISOString().slice(0, 10)}T00:00:00Z`) });
    expect(fatos.map((f) => f.cpfOrdenador)).toEqual([CPF_A]);
    const o = linhas((await gerarOrdenador(prisma, { codUnidadeGestora: UG, dia: new Date(Date.UTC(2026, 0, 2)) })).conteudo);
    expect(o.map((l) => [l.length, l.slice(6, 17), l.slice(17, 67).trim()])).toEqual([[73, CPF_A, "Prefeita Municipal"]]);
    expect((await gerarOrdenador(prisma, { codUnidadeGestora: UG, dia: new Date(Date.UTC(2026, 0, 3)) })).registros).toBe(0);
  });

  it("o responsável pelo sistema: recusa sem declaração; só no pacote de janeiro; a linha tem 283 posições", async () => {
    await expect(gerarResponsavelSiafic(prisma, { codUnidadeGestora: UG, exercicio: 2026 })).rejects.toThrow(/não há responsável pelo sistema declarado até 31\/01\/2026/);
    await declararResponsavelSiafic(prisma, {
      modalidade: "TERCEIRIZADA", cnpjEmpresa: "11222333000181", nomeEmpresa: "Empresa de Sistemas Ltda", telefoneEmpresa: "(83) 3333-4444", emailEmpresa: "contato@empresa.com.br",
      denominacaoSiafic: "Gestao Publica", cpfResponsavelTecnico: CPF_B, nomeResponsavelTecnico: "Responsável Técnico", emailResponsavelTecnico: "tecnico@empresa.com.br", telefoneResponsavelTecnico: "",
      fundamento: "Contrato 10/2026, cláusula do responsável técnico", vigenteDesde: D("2026-01-02"), criadoPor: POR,
    });
    const l = linhas((await gerarResponsavelSiafic(prisma, { codUnidadeGestora: UG, exercicio: 2026 })).conteudo);
    expect(l.map((x) => [x.length, x.slice(6, 20), x.slice(100, 111), x.slice(171, 182), x.slice(272, 283)])).toEqual([[283, "11222333000181", "08333334444", CPF_B, "00000000000"]]);
    const jan = await gerarArquivosDaV26(prisma, { codUnidadeGestora: UG, cnpjGerenciadora: "11222333000181", dia: new Date(Date.UTC(2026, 0, 31)), competencia: new Date(Date.UTC(2026, 0, 31)) });
    const mar = await gerarArquivosDaV26(prisma, { codUnidadeGestora: UG, cnpjGerenciadora: "11222333000181", dia: MARCO, competencia: MARCO });
    expect(jan.arquivos.some((a) => a.layout.entidade === "ResponsavelSiafic")).toBe(true);
    expect(mar.arquivos.some((a) => a.layout.entidade === "ResponsavelSiafic")).toBe(false);
  });
});

describe("V26 — a receita prevista com o subtipo da dedução (§4.7)", { timeout: 120000 }, () => {
  it("dedução sem subtipo recusa nomeando; com o detalhe, sai tipo 3; a linha zero não vai; detalhe de dedução em linha que não é dedução é recusado (N=2)", async () => {
    const fpm = await prisma.naturezaReceita.create({ data: { codigo: "17115111", descricao: "Cota-Parte do FPM - Cota Mensal - Principal" } });
    const icms = await prisma.naturezaReceita.create({ data: { codigo: "17215001", descricao: "Cota-Parte do ICMS - Principal" } });
    const itr = await prisma.naturezaReceita.create({ data: { codigo: "17115201", descricao: "Cota-Parte do ITR - Principal" } });
    const linha = (naturezaReceitaId: string, tipoReceita: "ORCAMENTARIA" | "DEDUCAO", valorPrevisto: string) =>
      prisma.receitaPrevista.create({ data: { exercicio: 2026, naturezaReceitaId, fonteId: "fnt-500", exercicioFonte: 1, tipoReceita, valorPrevisto }, select: { id: true } });
    const fpmReceita = await linha(fpm.id, "ORCAMENTARIA", "50737500.00");
    const fpmDeducao = await linha(fpm.id, "DEDUCAO", "10147500.00");
    const icmsDeducao = await linha(icms.id, "DEDUCAO", "2940300.00");
    await linha(itr.id, "DEDUCAO", "0.00");
    await expect(gerarReceitaPrevista(prisma, { codUnidadeGestora: UG, exercicio: 2026 })).rejects.toThrow(/sem o subtipo.*17115111\/500, 17215001\/500/);
    await expect(detalharReceitaPrevista(prisma, { receitaPrevistaId: fpmReceita.id, tipoDeducaoSagres: "3", codigoNoDocumento: null, documento: "Lei 613/2025, Anexo II", criadoPor: POR })).rejects.toThrow(/não é uma dedução/);
    await expect(detalharReceitaPrevista(prisma, { receitaPrevistaId: fpmDeducao.id, tipoDeducaoSagres: "3", codigoNoDocumento: "1.7.2.1.50.0.1.00", documento: "Lei 613/2025, Anexo II", criadoPor: POR })).rejects.toThrow(/não é desdobramento da natureza 17115111/);
    await detalharReceitaPrevista(prisma, { receitaPrevistaId: fpmDeducao.id, tipoDeducaoSagres: "3", codigoNoDocumento: "1.7.1.1.51.1.1.00", documento: "Lei 613/2025, Anexo II", criadoPor: POR });
    await detalharReceitaPrevista(prisma, { receitaPrevistaId: icmsDeducao.id, tipoDeducaoSagres: "3", codigoNoDocumento: "1.7.2.1.50.0.1.00", documento: "Lei 613/2025, Anexo II", criadoPor: POR });
    const l = linhas((await gerarReceitaPrevista(prisma, { codUnidadeGestora: UG, exercicio: 2026 })).conteudo);
    expect(l.map((x) => [x.length, x.slice(6, 10), x.slice(10, 18), x.slice(19, 22), x.slice(22, 23)])).toEqual([
      [45, "2026", "17115111", "500", "1"],
      [45, "2026", "17115111", "500", "3"],
      [45, "2026", "17215001", "500", "3"],
    ]);
  });
});

describe("V26 — a licitação no Tramita (§4.8 e §4.38)", { timeout: 120000 }, () => {
  async function processoEContrato(numero: string, modalidade: "PREGAO_ELETRONICO" | "DISPENSA"): Promise<{ processoId: string; contratoId: string }> {
    const p = await prisma.processoLicitatorio.create({ data: { numeroProcesso: numero, modalidade, hipoteseDispensa: modalidade === "DISPENSA" ? "POR_VALOR_COMPRAS" : null, objeto: "Material de expediente", valorLicitado: "10000.00", criadoPor: POR }, select: { id: true } });
    const c = await prisma.contrato.create({
      data: { numeroContrato: `CT-${numero}`, processoId: p.id, contratadoDocumento: "12345678000195", contratadoNome: "Fornecedor", valorInicial: "10000.00", vigenciaInicio: D("2026-01-01"), vigenciaFimInicial: D("2026-12-31"), categoriaOrdemCronologica: "FORNECIMENTO_BENS", criadoPor: POR },
      select: { id: true },
    });
    return { processoId: p.id, contratoId: c.id };
  }

  it("o pregão da Lei 14.133 é 24 — 10 é recusado; a dispensa aceita 21 ou 33", async () => {
    const pe = await processoEContrato("001/2026", "PREGAO_ELETRONICO");
    const di = await processoEContrato("002/2026", "DISPENSA");
    const base = { numeroNoTramita: "000012026", codUnidadeGestora: UG, fundamento: "Consulta ao Tramita em 01/10/2026", criadoPor: POR };
    await expect(identificarNoTramita(prisma, { ...base, processoId: pe.processoId, modalidadeSagres: "10" })).rejects.toThrow(/modalidade do Tribunal para ele é 24/);
    await identificarNoTramita(prisma, { ...base, processoId: pe.processoId, modalidadeSagres: "24" });
    await expect(identificarNoTramita(prisma, { ...base, processoId: di.processoId, modalidadeSagres: "6" })).rejects.toThrow(/21 \(Dispensa \(Lei 14\.133\/21\)\) ou 33/);
    await identificarNoTramita(prisma, { ...base, numeroNoTramita: "000022026", processoId: di.processoId, modalidadeSagres: "21" });
    expect(await prisma.identificacaoNoTramita.count()).toBe(2);
  });

  it("o empenho de contrato sai com a modalidade e o número do Tramita; sem eles, a recusa nomeia o processo; o §4.38 do mês os relaciona", async () => {
    const pe = await processoEContrato("003/2026", "PREGAO_ELETRONICO");
    const e = await empenharDe2026(criarM05Deps(prisma), "11", "1000.00");
    await prisma.empenho.update({ where: { id: e }, data: { contratoId: pe.contratoId } });
    const emp = await prisma.empenho.findUniqueOrThrow({ where: { id: e }, select: { data: true } });
    const dia = new Date(`${emp.data.toISOString().slice(0, 10)}T00:00:00Z`);
    const mes = new Date(Date.UTC(emp.data.getUTCFullYear(), emp.data.getUTCMonth() + 1, 0));
    await expect(lerFatosEmpenhos(prisma, { codUnidadeGestora: UG, dia })).rejects.toThrow(/processo 003\/2026, que ainda não tem o número da licitação no Tramita/);
    await expect(gerarRelacionamentoEmpenhoLicitacao(prisma, { codUnidadeGestora: UG, competencia: mes })).rejects.toThrow(/sem o número da licitação no Tramita: empenho 11 \(processo 003\/2026\)/);
    await identificarNoTramita(prisma, { processoId: pe.processoId, numeroNoTramita: "000032026", codUnidadeGestora: "201139", modalidadeSagres: "24", fundamento: "Consulta ao Tramita em 01/10/2026", criadoPor: POR });
    const f = await lerFatosEmpenhos(prisma, { codUnidadeGestora: UG, dia });
    expect(f.map((x) => [x.modalidadeLicitacao, x.numLicitacao])).toEqual([["24", "000032026"]]);
    const r = linhas((await gerarRelacionamentoEmpenhoLicitacao(prisma, { codUnidadeGestora: UG, competencia: mes })).conteudo);
    expect(r.map((x) => [x.length, x.slice(11, 18), x.slice(18, 24), x.slice(24, 33), x.slice(33, 35)])).toEqual([[41, "0000011", "201139", "000032026", "24"]]);
  });
});

describe("V26 — o saldo inicial conciliado (§4.25)", { timeout: 120000 }, () => {
  it("sem a conciliação de dezembro encerrada, a recusa nomeia as contas", async () => {
    await expect(gerarSaldoInicial(prisma, { codUnidadeGestora: UG, cnpjGerenciadora: "11222333000181", exercicio: 2027 })).rejects.toThrow(/sem a conciliação de 31\/12\/2026 encerrada: CC-001, CC-002/);
  });
});

describe("V26 — as alterações orçamentárias do dia (§4.5, §4.6 com o PDF, §4.49 com o protocolo)", { timeout: 120000 }, () => {
  const DIA = new Date(Date.UTC(2026, 2, 10));
  const PDF_A = new TextEncoder().encode("%PDF-1.4\n% decreto 15\n");
  const PDF_B = new TextEncoder().encode("%PDF-1.4\n% decreto 16\n");

  async function leiComDoisDecretos(): Promise<{ leiId: string; d15: string; d16: string }> {
    const deps = criarM03Deps(prisma);
    const leiId = await criarLei({ numero: "650", ano: 2026, tipoCredito: "SUPLEMENTAR", valorAutorizado: "5000.00", dataPublicacao: D("2026-03-10"), criadoPor: POR }, deps);
    // N=2: dois decretos no mesmo dia, cada um com uma anulação e uma suplementação (tipos 11 e 4).
    const d15 = await criarDecreto({ leiId, numero: "15", ano: 2026, data: D("2026-03-10"), origemRecurso: "ANULACAO", criadoPor: POR }, deps);
    await executarCredito({ decretoId: d15, itens: [{ fichaId: "ficha-1", tipo: "ANULACAO", valor: "500.00", fonteId: "fnt-500" }, { fichaId: "ficha-2", tipo: "SUPLEMENTACAO", valor: "500.00", fonteId: "fnt-500" }], criadoPor: POR }, deps);
    const d16 = await criarDecreto({ leiId, numero: "16", ano: 2026, data: D("2026-03-10"), origemRecurso: "ANULACAO", criadoPor: POR }, deps);
    await executarCredito({ decretoId: d16, itens: [{ fichaId: "ficha-1", tipo: "ANULACAO", valor: "120.00", fonteId: "fnt-500" }, { fichaId: "ficha-2", tipo: "SUPLEMENTACAO", valor: "120.00", fonteId: "fnt-500" }], criadoPor: POR }, deps);
    return { leiId, d15, d16 };
  }

  it("§4.5: cada item do decreto do dia sai com o tipo da tabela (4 suplementação por anulação, 11 a anulação), N=2 decretos", async () => {
    await leiComDoisDecretos();
    const l = linhas((await gerarAtualizacaoOrcamentaria(prisma, { codUnidadeGestora: UG, dia: DIA })).conteudo);
    expect(l.map((x) => [x.length, x.slice(10, 15), x.slice(34, 43), x.slice(43, 44), x.slice(44, 46)]).sort()).toEqual(
      [
        [78, "01001", "000152026", "1", "04"],
        [78, "01001", "000152026", "1", "11"],
        [78, "01001", "000162026", "1", "04"],
        [78, "01001", "000162026", "1", "11"],
      ].sort()
    );
    // O dia seguinte não tem decreto: o arquivo sai vazio, sem herdar os do dia 10.
    expect((await gerarAtualizacaoOrcamentaria(prisma, { codUnidadeGestora: UG, dia: new Date(Date.UTC(2026, 2, 11)) })).registros).toBe(0);
  });

  it("§4.5: o decreto das 22h do dia 9 (01h UTC do dia 10) é do dia 9 do município, não do dia 10", async () => {
    const { leiId } = await leiComDoisDecretos();
    const deps = criarM03Deps(prisma);
    const d17 = await criarDecreto({ leiId, numero: "17", ano: 2026, data: new Date("2026-03-10T01:00:00.000Z"), origemRecurso: "ANULACAO", criadoPor: POR }, deps);
    await executarCredito({ decretoId: d17, itens: [{ fichaId: "ficha-1", tipo: "ANULACAO", valor: "10.00", fonteId: "fnt-500" }, { fichaId: "ficha-2", tipo: "SUPLEMENTACAO", valor: "10.00", fonteId: "fnt-500" }], criadoPor: POR }, deps);
    const dez = linhas((await gerarAtualizacaoOrcamentaria(prisma, { codUnidadeGestora: UG, dia: DIA })).conteudo);
    expect(new Set(dez.map((x) => x.slice(34, 43)))).toEqual(new Set(["000152026", "000162026"]));
    const nove = linhas((await gerarAtualizacaoOrcamentaria(prisma, { codUnidadeGestora: UG, dia: new Date(Date.UTC(2026, 2, 9)) })).conteudo);
    expect(new Set(nove.map((x) => x.slice(34, 43)))).toEqual(new Set(["000172026"]));
  });

  it("§4.6: sem o PDF, a recusa nomeia SÓ o decreto que falta; com os dois, sai o arquivo e cada PDF com o nome do Tribunal e o conteúdo íntegro", async () => {
    const { d15, d16 } = await leiComDoisDecretos();
    await anexarArquivo(prisma, { nomeOriginal: "decreto-15.pdf", mimeType: "application/pdf", conteudo: PDF_A, decretoCreditoId: d15, criadoPor: POR });
    await expect(gerarDecretosEOficios(prisma, { codUnidadeGestora: UG, dia: DIA })).rejects.toThrow(/sem o PDF anexado[^:]*: de crédito 16\/2026 \(anexe em Planejamento › Créditos adicionais\)\./);
    await anexarArquivo(prisma, { nomeOriginal: "decreto-16.pdf", mimeType: "application/pdf", conteudo: PDF_B, decretoCreditoId: d16, criadoPor: POR });
    const [txt, ...pdfs] = await gerarDecretosEOficios(prisma, { codUnidadeGestora: UG, dia: DIA });
    expect(linhas(txt!.conteudo).map((x) => [x.length, x.slice(10, 19), x.slice(19, 27), x.slice(35, 36)])).toEqual([
      [42, "000152026", "06502026", "1"],
      [42, "000162026", "06502026", "1"],
    ]);
    expect(pdfs.map((p) => [p.nome, Buffer.from(p.conteudo).toString("utf8")])).toEqual([
      [`Decreto${UG}000152026.pdf`, "%PDF-1.4\n% decreto 15\n"],
      [`Decreto${UG}000162026.pdf`, "%PDF-1.4\n% decreto 16\n"],
    ]);
    // No grupo, o arquivo e os PDFs entram juntos.
    const g = await gerarArquivosDaV26(prisma, { codUnidadeGestora: UG, cnpjGerenciadora: "11222333000181", dia: DIA, competencia: DIA });
    expect(g.arquivos.map((a) => a.arquivo.nome).filter((n) => n.startsWith("Decreto"))).toEqual([`Decreto${UG}000152026.pdf`, `Decreto${UG}000162026.pdf`]);
  });

  it("§4.49: a lei publicada no dia sem protocolo é nomeada; o protocolo fora do formato e a lei que não confere são recusados com o motivo; registradas (N=2), saem com o tipo e o protocolo", async () => {
    const { leiId } = await leiComDoisDecretos();
    const especial = await criarLei({ numero: "651", ano: 2026, tipoCredito: "ESPECIAL", valorAutorizado: "800.00", dataPublicacao: D("2026-03-10"), criadoPor: POR }, criarM03Deps(prisma));
    await expect(gerarNormasOrcamentarias(prisma, { codUnidadeGestora: UG, dia: DIA })).rejects.toThrow(/sem o protocolo do banco de legislação do TCE-PB: 650\/2026, 651\/2026/);
    const base = { ano: 2026, dataPublicacao: D("2026-03-10"), autorizacaoPercentual: false, fundamento: "Comprovante do envio ao TCE-PB", criadoPor: POR };
    await expect(registrarNormaNoTce(prisma, { ...base, tipo: "CREDITO_SUPLEMENTAR", numero: "650", protocoloTce: "12345/26", valor: "5000.00", leiCreditoId: leiId })).rejects.toThrow(/formato 000000\/00/);
    await expect(registrarNormaNoTce(prisma, { ...base, tipo: "CREDITO_ESPECIAL", numero: "650", protocoloTce: "001234/26", valor: "5000.00", leiCreditoId: leiId })).rejects.toThrow(/é de crédito suplementar; a norma não pode ser de outro tipo/);
    await expect(registrarNormaNoTce(prisma, { ...base, tipo: "CREDITO_SUPLEMENTAR", numero: "652", protocoloTce: "001234/26", valor: "5000.00", leiCreditoId: leiId })).rejects.toThrow(/é a 650\/2026, não a 652\/2026/);
    await registrarNormaNoTce(prisma, { ...base, tipo: "CREDITO_SUPLEMENTAR", numero: "650", protocoloTce: "001234/26", valor: "5000.00", leiCreditoId: leiId });
    // Com uma das duas registrada, a recusa passa a nomear só a outra.
    await expect(gerarNormasOrcamentarias(prisma, { codUnidadeGestora: UG, dia: DIA })).rejects.toThrow(/TCE-PB: 651\/2026\./);
    await registrarNormaNoTce(prisma, { ...base, tipo: "CREDITO_ESPECIAL", numero: "651", protocoloTce: "001235/26", valor: "800.00", leiCreditoId: especial });
    const l = linhas((await gerarNormasOrcamentarias(prisma, { codUnidadeGestora: UG, dia: DIA })).conteudo);
    expect(l.map((x) => [x.length, x.slice(10, 19), x.slice(27, 28), x.slice(28, 37), x.slice(37, 38)])).toEqual([
      [54, "006502026", "1", "001234/26", "0"],
      [54, "006512026", "2", "001235/26", "0"],
    ]);
    await expect(registrarNormaNoTce(prisma, { ...base, tipo: "CREDITO_ESPECIAL", numero: "651", protocoloTce: "009999/26", valor: "800.00", leiCreditoId: especial })).rejects.toThrow(/já está registrada com o protocolo 001235\/26/);
  });

  it("V27 §4.49: a lei registrada antes do comprovante (com o PDF) é nomeada sem protocolo; o protocolo informado depois a completa, uma vez só", async () => {
    const { leiId } = await leiComDoisDecretos();
    const base = { ano: 2026, dataPublicacao: D("2026-03-10"), autorizacaoPercentual: false, fundamento: "Lei 650/2026, art. 1º (publicação)", criadoPor: POR };
    const n = await registrarNormaNoTce(prisma, { ...base, tipo: "CREDITO_SUPLEMENTAR", numero: "650", protocoloTce: "", valor: "5000.00", leiCreditoId: leiId });
    await anexarArquivo(prisma, { nomeOriginal: "lei-650.pdf", mimeType: "application/pdf", conteudo: new TextEncoder().encode("%PDF-1.4\n% lei 650\n"), normaOrcamentariaId: n.id, criadoPor: POR });
    await expect(gerarNormasOrcamentarias(prisma, { codUnidadeGestora: UG, dia: DIA })).rejects.toThrow(/TCE-PB: 650\/2026 \(registrada, sem o protocolo\)/);
    await expect(registrarNormaNoTce(prisma, { ...base, tipo: "CREDITO_SUPLEMENTAR", numero: "650", protocoloTce: "001234/26", valor: "5000.00", leiCreditoId: leiId })).rejects.toThrow(/já está registrada, sem o protocolo do Tribunal \(informe-o na lista\)/);
    await expect(informarProtocoloDaNorma(prisma, { normaId: n.id, protocoloTce: "1234/26", fundamento: "Comprovante do envio ao TCE-PB", criadoPor: POR })).rejects.toThrow(/formato 000000\/00/);
    await informarProtocoloDaNorma(prisma, { normaId: n.id, protocoloTce: "001234/26", fundamento: "Comprovante do envio ao TCE-PB", criadoPor: POR });
    await expect(informarProtocoloDaNorma(prisma, { normaId: n.id, protocoloTce: "001235/26", fundamento: "Comprovante do envio ao TCE-PB", criadoPor: POR })).rejects.toThrow(/já tem o protocolo 001234\/26/);
    const l = linhas((await gerarNormasOrcamentarias(prisma, { codUnidadeGestora: UG, dia: DIA })).conteudo);
    expect(l.map((x) => [x.slice(10, 19), x.slice(28, 37)])).toEqual([["006502026", "001234/26"]]);
    expect(await prisma.anexo.count({ where: { normaOrcamentariaId: n.id } })).toBe(1);
  });
});
