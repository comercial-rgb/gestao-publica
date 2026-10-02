import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { meioDiaCivil } from "../../packages/datas/index.js";
import { cadastrarLeiOrcamentariaAnual, registrarAprovacaoDaLeiOrcamentaria } from "./lei-orcamentaria.js";
import { capturarVersaoDoProjetoDaLoa } from "./projeto-da-loa.js";
import {
  gerarArquivosDaV26,
  gerarPloaAcao,
  gerarPloaDotacao,
  gerarPloaPrograma,
  gerarPloaReceitaPrevista,
  gerarPloaUnidadeOrcamentaria,
} from "../../adapters/tribunais/tce-pb/sagres/gerador-v26.js";

/**
 * V26 (ordem, item 2.1) — O PROJETO DA LOA ENCAMINHADO, SEPARADO DA LEI APROVADA (SAGRES §4.41 a §4.45).
 *
 * Fixture: o planejamento de 2027 com DUAS fichas, dois programas, duas ações e duas linhas de receita (uma dedução);
 * o projeto vai à Câmara em 30/09/2026 e à remessa de setembro de 2026.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
const POR = "planejamento@cg.pb.gov.br";
const D = (dia: string): Date => meioDiaCivil(dia);
const UG = "201001";
const SETEMBRO = new Date(Date.UTC(2026, 8, 30));
const linhas = (b: Buffer): string[] => b.toString("utf8").split("\r\n").filter((l) => l !== "");
let leiId = "";

beforeEach(async () => {
  await limparBanco(prisma);
  await prisma.orgao.create({ data: { id: "org-02", codigo: "02", nome: "Secretaria de Educação" } });
  await prisma.unidadeOrcamentaria.create({ data: { id: "uo-02", codigo: "02001", descricao: "Secretaria de Educação", orgaoId: "org-02" } });
  await prisma.declaracaoDaUnidadeOrcamentaria.create({ data: { unidadeOrcId: "uo-02", naturezaJuridica: "PREFEITURA_OU_SECRETARIA", nomeSecretario: "Maria das Dores Silva", cpfSecretario: "11144477735", atoDeNomeacao: "PORTARIA", vigenteDesde: D("2026-01-02"), criadoPor: POR } });
  await prisma.funcao.create({ data: { id: "fun-12", codigo: "12", nome: "Educação" } });
  await prisma.subfuncao.create({ data: { id: "sub-361", codigo: "361", nome: "Ensino Fundamental" } });
  await prisma.programa.createMany({ data: [{ id: "prg-12", codigo: "0012", descricao: "Educação Básica" }, { id: "prg-5000", codigo: "5000", descricao: "Primeira Infância" }] });
  await prisma.declaracaoDoPrograma.createMany({
    data: [
      { programaId: "prg-12", descricao: "Educação Básica", objetivo: "Ampliar o acesso ao ensino fundamental", tipoObjetivoMilenio: "04", fundamento: "PPA 2026-2029 (fixture)", vigenteDesde: D("2026-01-01"), criadoPor: POR },
      { programaId: "prg-5000", descricao: "Primeira Infância", objetivo: "Atender as crianças de 0 a 6 anos", tipoObjetivoMilenio: "99", fundamento: "PPA 2026-2029 (fixture)", vigenteDesde: D("2026-01-01"), criadoPor: POR },
    ],
  });
  await prisma.acao.createMany({ data: [{ id: "aca-2001", codigo: "2001", descricao: "Manutenção do ensino", tipo: "ATIVIDADE" }, { id: "aca-1001", codigo: "1001", descricao: "Construção de creche", tipo: "PROJETO" }] });
  await prisma.declaracaoDaAcao.createMany({
    data: [
      { acaoId: "aca-2001", descricao: "Manutenção do ensino", descMeta: "Manter 12 escolas em funcionamento", unidadeMedida: "escola", fundamento: "PPA (fixture)", vigenteDesde: D("2026-01-01"), criadoPor: POR },
      { acaoId: "aca-1001", descricao: "Construção de creche", descMeta: "Construir 2 creches", unidadeMedida: "unidade", fundamento: "PPA (fixture)", vigenteDesde: D("2026-01-01"), criadoPor: POR },
    ],
  });
  await prisma.naturezaDespesa.create({ data: { id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "PJ" } });
  await prisma.naturezaDespesa.create({ data: { id: "nd2", codCategoria: "4", codNatureza: "4", codModalidade: "90", codElemento: "51", codigoCompleto: "449051", descricao: "Obras" } });
  await prisma.fonteRecurso.create({ data: { id: "fnt-500", codigo: "500", descricao: "Recursos não vinculados", codigoTce: "500" } });
  const base = { exercicio: 2027, orgaoId: "org-02", unidadeOrcId: "uo-02", funcaoId: "fun-12", subfuncaoId: "sub-361", naturezaDespesaId: "nd", fonteId: "fnt-500" };
  await criarFichaDeTeste(prisma, { ...base, id: "f-a", numero: 1, programaId: "prg-12", acaoId: "aca-2001", valorDotado: "1000.00" });
  await criarFichaDeTeste(prisma, { ...base, id: "f-b", numero: 2, programaId: "prg-5000", acaoId: "aca-1001", valorDotado: "500.00" });
  await prisma.naturezaReceita.createMany({ data: [{ codigo: "11125001", descricao: "IPTU - Principal" }, { codigo: "17115111", descricao: "Cota-Parte do Fundo de Participação dos Municípios - Cota Mensal - Principal" }] });
  const nat = async (c: string): Promise<string> => (await prisma.naturezaReceita.findUniqueOrThrow({ where: { codigo: c }, select: { id: true } })).id;
  await prisma.receitaPrevista.create({ data: { exercicio: 2027, naturezaReceitaId: await nat("11125001"), fonteId: "fnt-500", tipoReceita: "ORCAMENTARIA", valorPrevisto: "800.00" } });
  const ded = await prisma.receitaPrevista.create({ data: { exercicio: 2027, naturezaReceitaId: await nat("17115111"), fonteId: "fnt-500", tipoReceita: "DEDUCAO", valorPrevisto: "200.00" }, select: { id: true } });
  await prisma.detalheDaReceitaPrevista.create({ data: { receitaPrevistaId: ded.id, tipoDeducaoSagres: "3", codigoNoDocumento: "17115111.00", documento: "Projeto de lei, Anexo II (fixture)", criadoPor: POR } });
  leiId = (await cadastrarLeiOrcamentariaAnual(prisma, { exercicio: 2027, numeroDoProjeto: "PL 45/2026", dataDoEnvio: "2026-09-30", ementa: "Estima a receita e fixa a despesa do Município para o exercício de 2027.", criadoPor: POR })).id;
}, 120000);
afterAll(async () => prisma.$disconnect());

const capturar = (extra: Partial<Parameters<typeof capturarVersaoDoProjetoDaLoa>[1]> = {}) =>
  capturarVersaoDoProjetoDaLoa(prisma, { leiId, tipo: "ENCAMINHADO", dataDoEncaminhamento: D("2026-09-30"), competenciaDaRemessa: "2026-09", documento: "Mensagem 12/2026 à Câmara", fundamento: "Ofício de encaminhamento do projeto (fixture)", criadoPor: POR, ...extra });
const P = { codUnidadeGestora: UG, competencia: SETEMBRO };

describe("V26 — o projeto da LOA guardado no encaminhamento", { timeout: 120000 }, () => {
  it("sem versão registrada, setembro recusa nomeando o projeto; o projeto não vem do planejamento vivo", async () => {
    await expect(gerarPloaDotacao(prisma, P)).rejects.toThrow(/nenhuma versão do projeto da LOA de 2027 registrada para a remessa de 2026-09/);
    const g = await gerarArquivosDaV26(prisma, { ...P, cnpjGerenciadora: "11222333000181", dia: SETEMBRO });
    expect(g.recusas.filter((r) => r.arquivo.startsWith("Ploa")).map((r) => r.arquivo).sort()).toEqual(["PloaAcao", "PloaDotacao", "PloaPrograma", "PloaReceitaPrevista", "PloaUnidadeOrcamentaria"]);
  });

  it("o que o projeto exige e falta é nomeado de uma vez (meta da ação, subtipo da dedução), e nada é gravado", async () => {
    await prisma.declaracaoDaAcao.create({ data: { acaoId: "aca-1001", descricao: "Construção de creche", descMeta: null, unidadeMedida: null, fundamento: "Revisão (fixture)", vigenteDesde: D("2026-06-01"), criadoPor: POR } });
    await prisma.detalheDaReceitaPrevista.deleteMany({});
    await expect(capturar()).rejects.toThrow(/ação 1001 sem meta e unidade de medida; dedução 17115111\/500 sem o subtipo/);
    expect(await prisma.versaoDoProjetoDaLoa.count()).toBe(0);
  });

  it("guardado (N=2 fichas), o arquivo sai da CÓPIA: a ficha nova e a dotação mudada depois do encaminhamento não entram", async () => {
    expect((await capturar()).numero).toBe(1);
    // Depois do encaminhamento, o planejamento de 2027 muda: uma ficha a mais.
    await criarFichaDeTeste(prisma, { id: "f-c", exercicio: 2027, numero: 3, orgaoId: "org-02", unidadeOrcId: "uo-02", funcaoId: "fun-12", subfuncaoId: "sub-361", programaId: "prg-12", acaoId: "aca-2001", naturezaDespesaId: "nd2", fonteId: "fnt-500", valorDotado: "999.00" });
    const dot = linhas((await gerarPloaDotacao(prisma, P)).conteudo);
    expect(dot.map((l) => [l.length, l.slice(0, 6), l.slice(6, 10), l.slice(20, 24), l.slice(24, 28), l.slice(34, 35), l.slice(35, 38)]).sort()).toEqual([
      [54, UG, "2027", "0012", "2001", "1", "500"],
      [54, UG, "2027", "5000", "1001", "1", "500"],
    ]);
    const acoes = linhas((await gerarPloaAcao(prisma, P)).conteudo);
    expect(acoes.map((l) => [l.slice(6, 10), l.slice(80, 81), l.slice(81, 231).trim(), l.slice(231, 281).trim()])).toEqual([
      ["1001", "1", "Construir 2 creches", "unidade"],
      ["2001", "2", "Manter 12 escolas em funcionamento", "escola"],
    ]);
    const rec = linhas((await gerarPloaReceitaPrevista(prisma, P)).conteudo);
    expect(rec.map((l) => [l.slice(6, 10), l.slice(10, 18), l.slice(22, 23)])).toEqual([
      ["2027", "11125001", "1"],
      ["2027", "17115111", "3"],
    ]);
    const prg = linhas((await gerarPloaPrograma(prisma, P)).conteudo);
    expect(prg.map((l) => [l.slice(6, 10), l.slice(230, 232)])).toEqual([["0012", "04"], ["5000", "99"]]);
    const uo = linhas((await gerarPloaUnidadeOrcamentaria(prisma, P)).conteudo);
    expect(uo.map((l) => [l.length, l.slice(6, 11), l.slice(121, 132), l.slice(133, 134)])).toEqual([[134, "02001", "11144477735", "2"]]);
  });

  it("a mensagem modificativa substitui o projeto no arquivo; a emenda da Câmara não é o projeto", async () => {
    await capturar();
    await criarFichaDeTeste(prisma, { id: "f-c", exercicio: 2027, numero: 3, orgaoId: "org-02", unidadeOrcId: "uo-02", funcaoId: "fun-12", subfuncaoId: "sub-361", programaId: "prg-12", acaoId: "aca-2001", naturezaDespesaId: "nd2", fonteId: "fnt-500", valorDotado: "999.00" });
    expect((await capturar({ tipo: "MENSAGEM_MODIFICATIVA", dataDoEncaminhamento: D("2026-10-15"), documento: "Mensagem modificativa 1/2026" })).numero).toBe(2);
    await criarFichaDeTeste(prisma, { id: "f-d", exercicio: 2027, numero: 4, orgaoId: "org-02", unidadeOrcId: "uo-02", funcaoId: "fun-12", subfuncaoId: "sub-361", programaId: "prg-5000", acaoId: "aca-1001", naturezaDespesaId: "nd2", fonteId: "fnt-500", valorDotado: "1.00" });
    expect((await capturar({ tipo: "EMENDADO_NA_CAMARA", dataDoEncaminhamento: D("2026-11-20"), documento: "Autógrafo com emendas" })).numero).toBe(3);
    expect(linhas((await gerarPloaDotacao(prisma, P)).conteudo)).toHaveLength(3);
  });

  it("depois da lei aprovada, o projeto não se reconstrói; a remessa é do ano anterior ao exercício", async () => {
    await expect(capturar({ competenciaDaRemessa: "2027-09" })).rejects.toThrow(/remessa do projeto da LOA de 2027 é do ano anterior \(2026\)/);
    await expect(capturar({ tipo: "MENSAGEM_MODIFICATIVA" })).rejects.toThrow(/primeira versão é a do projeto encaminhado/);
    await registrarAprovacaoDaLeiOrcamentaria(prisma, { leiId, numeroDaLei: "1.234/2026", dataDaSancao: "2026-12-18", dataDaPublicacao: "2026-12-19", veiculoDePublicacao: "Diário Oficial do Município", criadoPor: POR });
    await expect(capturar()).rejects.toThrow(/já foi aprovada \(Lei 1\.234\/2026\): o projeto não se reconstrói a partir da lei aprovada/);
    expect(await prisma.versaoDoProjetoDaLoa.count()).toBe(0);
  });

  it("a fonte do exercício anterior na dotação do projeto só vale para unidade gestora previdenciária", async () => {
    await criarFichaDeTeste(prisma, { id: "f-e", exercicio: 2027, numero: 5, orgaoId: "org-02", unidadeOrcId: "uo-02", funcaoId: "fun-12", subfuncaoId: "sub-361", programaId: "prg-12", acaoId: "aca-2001", naturezaDespesaId: "nd", fonteId: "fnt-500", exercicioFonte: 2, valorDotado: "50.00" });
    await capturar();
    await expect(gerarPloaDotacao(prisma, P)).rejects.toThrow(/só a unidade gestora de regime previdenciário pode usar: 02001\.0012\.2001 fonte 500/);
  });
});
