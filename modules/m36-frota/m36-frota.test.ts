import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { meioDiaCivil } from "../../packages/datas/index.js";
import { cadastrarUnidadeGestora } from "../m01-core-contabil/unidade-gestora.js";
import {
  anularAbastecimento,
  anularSituacaoDaFrota,
  cadastrarMaquina,
  cadastrarVeiculo,
  publicarVersaoDoVeiculo,
  registrarAbastecimento,
  registrarSituacaoDaFrota,
} from "./servico.js";
import { cadastrarFarmacia, informarEstoqueDaFarmacia, publicarVersaoDaFarmacia } from "../m37-farmacia/servico.js";
import { lerInformeDeEstoque } from "../m37-farmacia/dominio.js";
import { situacoesDoMes } from "./dominio.js";
import { derivarFrotaEFarmacia } from "../m16-travamento/atualizacoes-de-permissoes.js";
import { gerarArquivosDaFrotaEFarmacia } from "../../adapters/tribunais/tce-pb/sagres/gerador-frota-farmacia.js";

/**
 * V27 — M36 FROTA e M37 FARMÁCIA PÚBLICA, e os arquivos do SAGRES §4.50 a §4.57.
 *
 * ⚠️ AS LINHAS ESPERADAS SÃO MONTADAS À MÃO, posição a posição do leiaute oficial (não pelo serializador): conferir o
 * gerador com ele mesmo passaria com qualquer posição errada. Fixture N=2 em tudo que é por conjunto: dois veículos, dois
 * abastecimentos que se somam, duas farmácias, dois informes do mesmo mês.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
const POR = "patrimonio@cg.pb.gov.br";
const UG = "201001";
const CNPJ_UG = "11222333000181";
const DONO = "11444777000161"; // locadora (PJ)
const LOCADOR = "52998224725"; // motorista prestador (PF)
const linhas = (b: Buffer): string[] => b.toString("utf8").split("\r\n").filter((l) => l !== "");
const MARCO = new Date(Date.UTC(2026, 2, 1));
const FEVEREIRO = new Date(Date.UTC(2026, 1, 1));

let ugId = "";

async function pessoa(documento: string, nome: string): Promise<void> {
  const p = await prisma.pessoa.create({ data: { documento, tipo: documento.length === 14 ? "JURIDICA" : "FISICA", criadoPor: POR } });
  await prisma.versaoDePessoa.create({ data: { pessoaId: p.id, nome, criadoPor: POR } });
}

beforeEach(async () => {
  await limparBanco(prisma);
  await prisma.entidadeContabil.create({ data: { id: "ent-pref", codigo: "0001", criadoPor: POR } });
  ugId = (await cadastrarUnidadeGestora(prisma, { codigoTce: UG, nome: "Prefeitura Municipal", cnpj: CNPJ_UG, naturezaJuridica: "PREFEITURA_OU_SECRETARIA", entidadeContabilId: "ent-pref", vigenteDesde: meioDiaCivil("2026-01-01"), fundamento: "Cadastro de UG do Tribunal (fixture do teste)", criadoPor: POR })).id;
  await pessoa(DONO, "Locadora Exemplo Ltda");
  await pessoa(LOCADOR, "José Prestador");
}, 120000);
afterAll(async () => prisma.$disconnect());

const base = { fundamento: "Documento do veículo (fixture)", criadoPor: POR };
const proprio = (placa: string, desde: string, extra: Record<string, unknown> = {}) =>
  cadastrarVeiculo(prisma, { ugId, placa, anoModelo: 2022, renavam: "123456789", numeroModelo: "1234", tipoFrota: "PROPRIO", combustivelPrincipal: "GASOLINA", vigenteDesde: desde, situacaoInicial: "EM_USO", ...base, ...extra });

describe("V27 — o cadastro da frota", () => {
  it("formato, dono e locador pelo tipo, pessoa do cadastro e UG escriturada aqui: cada recusa diz por quê e nada grava", async () => {
    await expect(proprio("AB-12", "2026-03-01")).rejects.toThrow(/não está no formato de placa/);
    await expect(proprio("ABC1234", "2026-03-01", { proprietarioDocumento: DONO })).rejects.toThrow(/o dono é a própria unidade gestora/);
    await expect(proprio("ABC1234", "2026-03-01", { tipoFrota: "LOCADO", proprietarioDocumento: DONO })).rejects.toThrow(/Informe o CPF ou CNPJ do locador/);
    await expect(proprio("ABC1234", "2026-03-01", { tipoFrota: "CEDIDO", proprietarioDocumento: "11.222.333/0001-81" })).rejects.toThrow(/não está no cadastro de pessoas\. Cadastre-o em Cadastros › Pessoas/);
    await expect(proprio("ABC1234", "2026-03-01", { renavam: "1234" })).rejects.toThrow(/RENAVAM "1234" deve ter de 9 a 11 dígitos/);
    const fora = await cadastrarUnidadeGestora(prisma, { codigoTce: "101001", nome: "Câmara", cnpj: null, naturezaJuridica: "CAMARA_MUNICIPAL", entidadeContabilId: null, vigenteDesde: meioDiaCivil("2026-01-01"), fundamento: "Cadastro de UG do Tribunal (fixture do teste)", criadoPor: POR });
    await expect(proprio("ABC1234", "2026-03-01", { ugId: fora.id })).rejects.toThrow(/não é escriturada neste sistema/);
    expect(await prisma.veiculoDaFrota.count()).toBe(0);

    await proprio("abc-1234", "2026-03-01");
    await expect(proprio("ABC1234", "2026-03-02")).rejects.toThrow(/placa ABC1234 já está cadastrado/);
    const v = await prisma.versaoDoVeiculo.findFirstOrThrow({ select: { renavam: true } });
    expect(v.renavam).toBe("00123456789"); // 9 dígitos completados até 11, como o leiaute mostra
  });

  it("situação: não antes da entrada, uma por dia, não depois da baixa; a primeira não se anula; a anulada sai do mês", async () => {
    const { id } = await proprio("ABC1234", "2026-02-10");
    await expect(registrarSituacaoDaFrota(prisma, { veiculoId: id, situacao: "EM_MANUTENCAO", desde: "2026-02-09", motivo: "Ordem de serviço 1", criadoPor: POR })).rejects.toThrow(/só passou a ser da frota em 10\/02\/2026/);
    await expect(registrarSituacaoDaFrota(prisma, { veiculoId: id, situacao: "EM_USO", desde: "2026-03-01", motivo: "Sem mudança", criadoPor: POR })).rejects.toThrow(/já está em uso/);
    const manut = await registrarSituacaoDaFrota(prisma, { veiculoId: id, situacao: "EM_MANUTENCAO", desde: "2026-03-15", motivo: "Ordem de serviço 7", criadoPor: POR });
    await expect(registrarSituacaoDaFrota(prisma, { veiculoId: id, situacao: "BAIXADA", desde: "2026-03-15", motivo: "Laudo", criadoPor: POR })).rejects.toThrow(/já tem situação começando em 15\/03\/2026/);
    const primeira = await prisma.mudancaDeSituacaoDaFrota.findFirstOrThrow({ where: { veiculoId: id }, orderBy: { desde: "asc" } });
    await expect(anularSituacaoDaFrota(prisma, { id: primeira.id, motivo: "tentativa", criadoPor: POR })).rejects.toThrow(/situação com que o veículo ABC1234 entrou na frota/);
    await anularSituacaoDaFrota(prisma, { id: manut.id, motivo: "Ordem de serviço cancelada", criadoPor: POR });
    await registrarSituacaoDaFrota(prisma, { veiculoId: id, situacao: "BAIXADA", desde: "2026-03-20", motivo: "Ato de baixa 3/2026", criadoPor: POR });
    await expect(registrarSituacaoDaFrota(prisma, { veiculoId: id, situacao: "EM_USO", desde: "2026-03-25", motivo: "Volta", criadoPor: POR })).rejects.toThrow(/está baixado/);
    const r = await gerarArquivosDaFrotaEFarmacia(prisma, { codUnidadeGestora: UG, cnpjGerenciadora: CNPJ_UG, competencia: MARCO });
    const sit = r.arquivos.find((a) => a.arquivo.nome.includes("SituacaoFrota"));
    expect(linhas(sit!.arquivo.conteudo)).toEqual([`${UG}01032026` + "11ABC1234", `${UG}20032026` + "31ABC1234"]);
  });

  it("abastecimento: só de bem na frota e não baixado, quantidade com até 2 casas; anulado não conta", async () => {
    const { id } = await proprio("ABC1234", "2026-03-01");
    const ab = { veiculoId: id, combustivel: "GASOLINA" as const, documento: "Cupom 1", criadoPor: POR };
    await expect(registrarAbastecimento(prisma, { ...ab, data: "2026-02-28", quantidade: "10" })).rejects.toThrow(/não estava na frota em 28\/02\/2026/);
    await expect(registrarAbastecimento(prisma, { ...ab, data: "2026-03-02", quantidade: "10,123" })).rejects.toThrow(/no máximo 2 casas/);
    await expect(registrarAbastecimento(prisma, { ...ab, data: "2026-03-02", quantidade: "0" })).rejects.toThrow(/deve ser positiva/);
    const errado = await registrarAbastecimento(prisma, { ...ab, data: "2026-03-02", quantidade: "999" });
    await anularAbastecimento(prisma, { id: errado.id, motivo: "Cupom digitado errado", criadoPor: POR });
    await expect(anularAbastecimento(prisma, { id: errado.id, motivo: "De novo", criadoPor: POR })).rejects.toThrow(/já foi anulado/);
    expect(await prisma.abastecimentoDaFrota.count({ where: { anulacao: null } })).toBe(0);
  });
});

/** O cadastro vai no mês do registro: a fixture registra cada versão no dia em que ela começa (como na operação). */
async function registradoNoDiaDoInicio(): Promise<void> {
  await prisma.$executeRawUnsafe('UPDATE "VersaoDoVeiculo" SET "criadoEm" = "vigenteDesde"');
  await prisma.$executeRawUnsafe('UPDATE "VersaoDaMaquina" SET "criadoEm" = "vigenteDesde"');
}

describe("V27 — os arquivos da frota no SAGRES (§4.50 a §4.55), montados à mão", () => {
  async function montarMarco(): Promise<void> {
    const v1 = await proprio("ABC1234", "2026-02-10");
    await registrarSituacaoDaFrota(prisma, { veiculoId: v1.id, situacao: "EM_MANUTENCAO", desde: "2026-03-15", motivo: "Ordem de serviço 7", criadoPor: POR });
    await registrarSituacaoDaFrota(prisma, { veiculoId: v1.id, situacao: "EM_USO", desde: "2026-03-21", motivo: "Ordem de serviço 7 concluída", criadoPor: POR });
    const ab = { veiculoId: v1.id, combustivel: "GASOLINA" as const, documento: "Cupom", criadoPor: POR };
    await registrarAbastecimento(prisma, { ...ab, data: "2026-02-20", quantidade: "30" }); // fevereiro: não entra em março
    await registrarAbastecimento(prisma, { ...ab, data: "2026-03-02", quantidade: "40,50" });
    await registrarAbastecimento(prisma, { ...ab, data: "2026-03-31", quantidade: "10.25" });
    // Locado, cadastrado no meio de março, sem abastecimento: registro de quantidade zero no combustível principal.
    await cadastrarVeiculo(prisma, { ugId, placa: "BRA2E19", anoModelo: 2024, renavam: "01234567890", numeroModelo: "123456", tipoFrota: "LOCADO", proprietarioDocumento: DONO, locadorDocumento: LOCADOR, combustivelPrincipal: "DIESEL", vigenteDesde: "2026-03-05", situacaoInicial: "EM_USO", ...base });
    // Máquina própria baixada desde fevereiro: situação sim, abastecimento não.
    const m = await cadastrarMaquina(prisma, { ugId, codigo: "retro1", anoFabricacao: 2015, descricao: "Retroescavadeira", tipoFrota: "PROPRIO", combustivelPrincipal: "DIESEL", vigenteDesde: "2026-01-10", situacaoInicial: "EM_USO", ...base });
    await registrarSituacaoDaFrota(prisma, { maquinaId: m.id, situacao: "BAIXADA", desde: "2026-02-01", motivo: "Ato de baixa 1/2026", criadoPor: POR });
    await registradoNoDiaDoInicio();
  }

  it("março: cadastro só do que mudou no mês; situação de todos; abastecimento somado por combustível e o zero do locado", async () => {
    await montarMarco();
    const r = await gerarArquivosDaFrotaEFarmacia(prisma, { codUnidadeGestora: UG, cnpjGerenciadora: CNPJ_UG, competencia: MARCO });
    expect(r.recusas).toEqual([]);
    const arq = (e: string): string[] => linhas(r.arquivos.find((a) => a.arquivo.nome.includes(e))!.arquivo.conteudo);

    // §4.50 proprietário (1-6 UG, 7-20 CNPJ, 21-100 nome) — só o dono do veículo cadastrado em março.
    expect(arq("ProprietarioFrota")).toEqual([`${UG}${DONO}${"Locadora Exemplo Ltda".padEnd(80, " ")}`]);
    // §4.51 locador — CPF em campo de 14, zeros à esquerda.
    expect(arq("LocadorPrestador")).toEqual([`${UG}000${LOCADOR}${"José Prestador".padEnd(80, " ")}`]);
    // §4.52 veículos: 1-6 UG, 7-13 placa, 14-17 ano, 18-28 renavam, 29-34 modelo, 35 tipo, 36-49 dono, 50-63 locador.
    expect(arq("Veiculos")).toEqual([`${UG}BRA2E192024012345678901234562${DONO}000${LOCADOR}`]);
    expect(arq("Maquinas")).toEqual([]); // a máquina é de janeiro
    // §4.54 situação: 1-6 UG, 7-14 data, 15 tipo, 16 categoria, 17-23 código.
    expect(arq("SituacaoFrota")).toEqual([
      `${UG}01032026` + "11ABC1234",
      `${UG}15032026` + "21ABC1234",
      `${UG}21032026` + "11ABC1234",
      `${UG}05032026` + "11BRA2E19",
      `${UG}01032026` + "32RETRO1 ",
    ]);
    // §4.55 abastecimento: 1-6 UG, 7-10 ano, 11-12 mês, 13-28 quantidade (13 int, vírgula, 2 dec), 29 combustível, 30 categoria, 31-37 código.
    expect(arq("Abastecimento")).toEqual([`${UG}202603${"50,75".padStart(16, "0")}11ABC1234`, `${UG}202603${"0,00".padStart(16, "0")}21BRA2E19`]);
  });

  it("fevereiro: o bem próprio sai com o CNPJ e o nome da UG como dono; a máquina de janeiro não volta", async () => {
    await montarMarco();
    const r = await gerarArquivosDaFrotaEFarmacia(prisma, { codUnidadeGestora: UG, cnpjGerenciadora: CNPJ_UG, competencia: FEVEREIRO });
    const arq = (e: string): string[] => linhas(r.arquivos.find((a) => a.arquivo.nome.includes(e))!.arquivo.conteudo);
    expect(arq("ProprietarioFrota")).toEqual([`${UG}${CNPJ_UG}${"Prefeitura Municipal".padEnd(80, " ")}`]);
    expect(arq("Veiculos")).toEqual([`${UG}ABC1234202200123456789001234` + `1${CNPJ_UG}${"0".repeat(14)}`]);
    expect(arq("Maquinas")).toEqual([]);
    // A máquina baixada desde 01/02 não tem registro de abastecimento em fevereiro (baixada o mês inteiro).
    expect(arq("Abastecimento")).toEqual([`${UG}202602${"30,00".padStart(16, "0")}11ABC1234`]);
  });

  it("veículo sem o número do modelo: SÓ o arquivo de veículos fica fora, nomeando a placa; nova versão com o modelo resolve", async () => {
    const v = await proprio("QWE9876", "2026-03-03", { numeroModelo: "" });
    await registradoNoDiaDoInicio();
    const r = await gerarArquivosDaFrotaEFarmacia(prisma, { codUnidadeGestora: UG, cnpjGerenciadora: CNPJ_UG, competencia: MARCO });
    expect(r.recusas.map((x) => x.arquivo)).toEqual(["Veiculos"]);
    expect(r.recusas[0]!.detalhe).toMatch(/sem o número do modelo da tabela do Tribunal: QWE9876\. Informe-o publicando uma versão do veículo/);
    expect(r.arquivos.map((a) => a.arquivo.nome).some((n) => n.includes("SituacaoFrota"))).toBe(true);
    await publicarVersaoDoVeiculo(prisma, { veiculoId: v.id, anoModelo: 2022, renavam: "123456789", numeroModelo: "777", tipoFrota: "PROPRIO", combustivelPrincipal: "GASOLINA", vigenteDesde: "2026-03-10", ...base });
    await registradoNoDiaDoInicio();
    const r2 = await gerarArquivosDaFrotaEFarmacia(prisma, { codUnidadeGestora: UG, cnpjGerenciadora: CNPJ_UG, competencia: MARCO });
    expect(r2.recusas).toEqual([]);
    expect(linhas(r2.arquivos.find((a) => a.arquivo.nome.includes("Veiculos"))!.arquivo.conteudo)).toEqual([`${UG}QWE9876202200123456789000777` + `1${CNPJ_UG}${"0".repeat(14)}`]);
  });

  it("implantação: o veículo em uso desde janeiro e cadastrado em março vai no cadastro de março; a versão programada para abril vai em abril", async () => {
    const v = await proprio("OLD2019", "2026-01-15"); // em uso desde janeiro, cadastrado só em março
    await prisma.$executeRawUnsafe('UPDATE "VersaoDoVeiculo" SET "criadoEm" = $1', meioDiaCivil("2026-03-20"));
    let r = await gerarArquivosDaFrotaEFarmacia(prisma, { codUnidadeGestora: UG, cnpjGerenciadora: CNPJ_UG, competencia: MARCO });
    expect(linhas(r.arquivos.find((a) => a.arquivo.nome.includes("Veiculos"))!.arquivo.conteudo)).toEqual([`${UG}OLD2019202200123456789001234` + `1${CNPJ_UG}${"0".repeat(14)}`]);
    expect(linhas(r.arquivos.find((a) => a.arquivo.nome.includes("ProprietarioFrota"))!.arquivo.conteudo)).toHaveLength(1);
    // Versão registrada em março para valer em abril: não vai em março, vai em abril.
    await publicarVersaoDoVeiculo(prisma, { veiculoId: v.id, anoModelo: 2022, renavam: "123456789", numeroModelo: "4321", tipoFrota: "PROPRIO", combustivelPrincipal: "GASOLINA", vigenteDesde: "2026-04-01", ...base });
    await prisma.$executeRawUnsafe('UPDATE "VersaoDoVeiculo" SET "criadoEm" = $1 WHERE versao = 2', meioDiaCivil("2026-03-25"));
    r = await gerarArquivosDaFrotaEFarmacia(prisma, { codUnidadeGestora: UG, cnpjGerenciadora: CNPJ_UG, competencia: MARCO });
    expect(linhas(r.arquivos.find((a) => a.arquivo.nome.includes("Veiculos"))!.arquivo.conteudo)[0]).toContain("001234");
    const abril = await gerarArquivosDaFrotaEFarmacia(prisma, { codUnidadeGestora: UG, cnpjGerenciadora: CNPJ_UG, competencia: new Date(Date.UTC(2026, 3, 1)) });
    expect(linhas(abril.arquivos.find((a) => a.arquivo.nome.includes("Veiculos"))!.arquivo.conteudo)).toEqual([`${UG}OLD2019202200123456789004321` + `1${CNPJ_UG}${"0".repeat(14)}`]);
  });

  it("baixa retroativa: não começa antes de um abastecimento já registrado (o arquivo levaria litros de bem baixado)", async () => {
    const { id } = await proprio("ABC1234", "2026-03-01");
    await registrarAbastecimento(prisma, { veiculoId: id, data: "2026-03-20", combustivel: "GASOLINA", quantidade: "15", documento: "Cupom 9", criadoPor: POR });
    await expect(registrarSituacaoDaFrota(prisma, { veiculoId: id, situacao: "BAIXADA", desde: "2026-03-10", motivo: "Ato de baixa 4/2026", criadoPor: POR })).rejects.toThrow(/tem abastecimento registrado a partir de 10\/03\/2026 \(20\/03\/2026, Cupom 9\)/);
    await registrarSituacaoDaFrota(prisma, { veiculoId: id, situacao: "BAIXADA", desde: "2026-03-21", motivo: "Ato de baixa 4/2026", criadoPor: POR });
  });

  it("domínio: a situação do dia 1 vem do mês anterior; a mudança no dia 1 não duplica", () => {
    expect(situacoesDoMes([{ dia: "2026-02-10", situacao: "EM_USO" }, { dia: "2026-03-01", situacao: "EM_MANUTENCAO" }], "2026-03")).toEqual([{ dia: "2026-03-01", situacao: "EM_MANUTENCAO" }]);
    expect(situacoesDoMes([{ dia: "2026-04-02", situacao: "EM_USO" }], "2026-03")).toEqual([]);
  });
});

describe("V27 — farmácia pública e os arquivos §4.56 e §4.57", () => {
  const farm = (codigo: string, descricao: string) =>
    cadastrarFarmacia(prisma, { ugId, codigo, descricao, endereco: "Rua Antenor Navarro, 837", nomeResponsavel: "Maria Farmacêutica", cpfResponsavel: "111.444.777-35", crfResponsavel: "PB-1234", vigenteDesde: "2026-01-01", fundamento: "Portaria de designação 5/2026 (fixture)", criadoPor: POR });

  it("CPF do responsável conferido; estoque digitado ou por arquivo; o informe novo do mês substitui o anterior; sem informe, só o estoque fica fora", async () => {
    await expect(cadastrarFarmacia(prisma, { ugId, codigo: "1", descricao: "Farmácia X", endereco: "Rua 1, centro", nomeResponsavel: "Fulana", cpfResponsavel: "111.444.777-36", crfResponsavel: "PB-1", vigenteDesde: "2026-01-01", fundamento: "Portaria (fixture)", criadoPor: POR })).rejects.toThrow(/CPF do responsável técnico \(11144477736\) não é válido/);
    const f1 = await farm("1234", "Farmácia Básica Central");
    const f2 = await farm("77", "Farmácia do Hospital");
    const arquivo = "codigoProduto;descricao;unidade;quantidade\n7891234567895;Dipirona 500 mg;COMPRIMIDO;1.200,50\n7896004700011;Amoxicilina 500 mg;CAPSULA;300\n";
    await informarEstoqueDaFarmacia(prisma, { farmaciaId: f1.id, ano: 2026, mes: 3, arquivo: arquivo.replace("300", "999"), fundamento: "Relatório do sistema da farmácia (primeiro envio)", criadoPor: POR });
    await informarEstoqueDaFarmacia(prisma, { farmaciaId: f1.id, ano: 2026, mes: 3, arquivo, fundamento: "Relatório do sistema da farmácia (corrigido)", criadoPor: POR });
    await expect(informarEstoqueDaFarmacia(prisma, { farmaciaId: f2.id, ano: 2026, mes: 3, arquivo: "codigoProduto;descricao;unidade;quantidade\nABC;Soro;FRASCO;1\n", fundamento: "Relatório", criadoPor: POR })).rejects.toThrow(/Linha 2: código do produto "ABC"/);

    let r = await gerarArquivosDaFrotaEFarmacia(prisma, { codUnidadeGestora: UG, cnpjGerenciadora: CNPJ_UG, competencia: MARCO });
    expect(r.recusas.map((x) => x.arquivo)).toEqual(["EstoqueFarmacia"]);
    expect(r.recusas[0]!.detalhe).toMatch(/sem o estoque de 03\/2026: 77 \(Farmácia do Hospital\)\. Informe o estoque do mês/);
    // §4.56: 1-6 UG, 7-13 código, 14-73 descrição, 74-193 endereço, 194-253 responsável, 254-264 CPF, 265-274 CRF.
    const farmacias = linhas(r.arquivos.find((a) => a.arquivo.nome.includes("Farmacia"))!.arquivo.conteudo);
    expect(farmacias[0]).toBe(`${UG}0001234${"Farmácia Básica Central".padEnd(60, " ")}${"Rua Antenor Navarro, 837".padEnd(120, " ")}${"Maria Farmacêutica".padEnd(60, " ")}11144477735${"PB-1234".padEnd(10, " ")}`);
    expect(farmacias).toHaveLength(2);

    await informarEstoqueDaFarmacia(prisma, { farmaciaId: f2.id, ano: 2026, mes: 3, itens: [{ codigoProduto: "7891234567895", descricao: "Dipirona 500 mg", unidadeMedida: "COMPRIMIDO", quantidade: "10" }], fundamento: "Inventário de 31/03 (digitado)", criadoPor: POR });
    r = await gerarArquivosDaFrotaEFarmacia(prisma, { codUnidadeGestora: UG, cnpjGerenciadora: CNPJ_UG, competencia: MARCO });
    expect(r.recusas).toEqual([]);
    // §4.57: 1-6 UG, 7-8 mês, 9-15 farmácia, 16-29 produto, 30-89 descrição, 90-99 unidade, 100-115 quantidade.
    expect(linhas(r.arquivos.find((a) => a.arquivo.nome.includes("EstoqueFarmacia"))!.arquivo.conteudo)).toEqual([
      `${UG}030001234${"07891234567895"}${"Dipirona 500 mg".padEnd(60, " ")}${"COMPRIMIDO"}${"1200,50".padStart(16, "0")}`,
      `${UG}030001234${"07896004700011"}${"Amoxicilina 500 mg".padEnd(60, " ")}${"CAPSULA".padEnd(10, " ")}${"300,00".padStart(16, "0")}`,
      `${UG}030000077${"07891234567895"}${"Dipirona 500 mg".padEnd(60, " ")}${"COMPRIMIDO"}${"10,00".padStart(16, "0")}`,
    ]);

    // Encerrada em março: no fim de abril não é ativa, não sai e não cobra estoque.
    await publicarVersaoDaFarmacia(prisma, { farmaciaId: f2.id, ativa: false, descricao: "Farmácia do Hospital", endereco: "Rua Antenor Navarro, 837", nomeResponsavel: "Maria Farmacêutica", cpfResponsavel: "11144477735", crfResponsavel: "PB-1234", vigenteDesde: "2026-03-31", fundamento: "Decreto de encerramento (fixture)", criadoPor: POR });
    const abril = await gerarArquivosDaFrotaEFarmacia(prisma, { codUnidadeGestora: UG, cnpjGerenciadora: CNPJ_UG, competencia: new Date(Date.UTC(2026, 3, 1)) });
    expect(abril.recusas[0]!.detalhe).toMatch(/1234 \(Farmácia Básica Central\)/);
    expect(abril.recusas[0]!.detalhe).not.toMatch(/Hospital/);
  });

  it("leitor do arquivo de estoque: cabeçalho, colunas, duplicidade e quantidade, cada erro com a linha", () => {
    expect(lerInformeDeEstoque("produto;nome\n1;x").erros[0]).toMatch(/primeira linha deve ser o cabeçalho/);
    const l = lerInformeDeEstoque("codigoProduto;descrição;unidade;quantidade\n1;Soro;FR;1\n1;Soro;FR;2\n2;Gaze;UN;-1\n3;Luva\n");
    expect(l.erros).toEqual(["Linha 3: o produto 1 já está na linha 2.", 'Linha 4: quantidade "-1" deve ser zero ou positiva, com até 2 casas.', "Linha 5: são 4 colunas separadas por ponto e vírgula."]);
  });

  it("estoque digitado com vários produtos (um por linha, a linha errada nomeada); farmácia encerrada não recebe informe", async () => {
    const f = await farm("55", "Farmácia do Posto");
    await expect(informarEstoqueDaFarmacia(prisma, { farmaciaId: f.id, ano: 2026, mes: 3, texto: "7891234567895;Dipirona 500 mg;COMPRIMIDO;10\nX;Gaze;UN;1", fundamento: "Inventário digitado", criadoPor: POR })).rejects.toThrow(/Linha 2: código do produto "X"/);
    const r = await informarEstoqueDaFarmacia(prisma, { farmaciaId: f.id, ano: 2026, mes: 3, texto: "7891234567895;Dipirona 500 mg;COMPRIMIDO;10\n7896004700011;Amoxicilina 500 mg;CAPSULA;20,5", fundamento: "Inventário digitado", criadoPor: POR });
    expect(r.itens).toBe(2);
    expect((await prisma.informeDeEstoqueDaFarmacia.findFirstOrThrow({ select: { origem: true, arquivoHash: true } }))).toEqual({ origem: "DIGITADO", arquivoHash: null });
    await publicarVersaoDaFarmacia(prisma, { farmaciaId: f.id, ativa: false, descricao: "Farmácia do Posto", endereco: "Rua Antenor Navarro, 837", nomeResponsavel: "Maria Farmacêutica", cpfResponsavel: "11144477735", crfResponsavel: "PB-1234", vigenteDesde: "2026-03-31", fundamento: "Decreto de encerramento (fixture)", criadoPor: POR });
    await expect(informarEstoqueDaFarmacia(prisma, { farmaciaId: f.id, ano: 2026, mes: 4, texto: "1;Soro;FR;1", fundamento: "Inventário", criadoPor: POR })).rejects.toThrow(/estava encerrada no fim de 04\/2026/);
  });
});

describe("V27 — autorização no servidor: sem a ação, cada ato é recusado nomeando-a, e nada grava", () => {
  const SEM_PERMISSAO = "estagiario@cg.pb.gov.br";
  beforeEach(async () => {
    const perfil = await prisma.perfil.create({ data: { nome: "SEM_PODERES", descricao: "Perfil sem permissão alguma", criadoPor: POR }, select: { id: true } });
    const u = await prisma.usuario.create({ data: { identificador: SEM_PERMISSAO, nome: SEM_PERMISSAO, criadoPor: POR }, select: { id: true } });
    await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: perfil.id, criadoPor: POR } });
  });

  it("CADASTRAR_FROTA, REGISTRAR_ABASTECIMENTO, CADASTRAR_FARMACIA e INFORMAR_ESTOQUE_DA_FARMACIA", async () => {
    await expect(proprio("ABC1234", "2026-03-01", { criadoPor: SEM_PERMISSAO })).rejects.toThrow(/não tem permissão para CADASTRAR_FROTA/);
    const { id } = await proprio("ABC1234", "2026-03-01");
    await expect(registrarSituacaoDaFrota(prisma, { veiculoId: id, situacao: "EM_MANUTENCAO", desde: "2026-03-05", motivo: "Ordem de serviço", criadoPor: SEM_PERMISSAO })).rejects.toThrow(/não tem permissão para CADASTRAR_FROTA/);
    await expect(registrarAbastecimento(prisma, { veiculoId: id, data: "2026-03-02", combustivel: "GASOLINA", quantidade: "10", documento: "Cupom", criadoPor: SEM_PERMISSAO })).rejects.toThrow(/não tem permissão para REGISTRAR_ABASTECIMENTO/);
    const farmacia = { ugId, codigo: "9", descricao: "Farmácia", endereco: "Rua 1, centro", nomeResponsavel: "Maria", cpfResponsavel: "11144477735", crfResponsavel: "PB-1", vigenteDesde: "2026-01-01", fundamento: "Portaria (fixture)" };
    await expect(cadastrarFarmacia(prisma, { ...farmacia, criadoPor: SEM_PERMISSAO })).rejects.toThrow(/não tem permissão para CADASTRAR_FARMACIA/);
    const f = await cadastrarFarmacia(prisma, { ...farmacia, criadoPor: POR });
    await expect(informarEstoqueDaFarmacia(prisma, { farmaciaId: f.id, ano: 2026, mes: 3, texto: "1;Soro;FR;1", fundamento: "Inventário", criadoPor: SEM_PERMISSAO })).rejects.toThrow(/não tem permissão para INFORMAR_ESTOQUE_DA_FARMACIA/);
    expect(await prisma.mudancaDeSituacaoDaFrota.count()).toBe(1);
    expect(await prisma.abastecimentoDaFrota.count()).toBe(0);
    expect(await prisma.informeDeEstoqueDaFarmacia.count()).toBe(0);
  });

  it("a atualização de permissões deriva só da permissão global (os atos são do ente): a concessão por unidade não é derivada", () => {
    const perfis = [
      { id: "p1", nome: "Patrimônio", permissoes: [{ acao: "CADASTRAR_BEM" as const, unidadeOrcId: null }, { acao: "REGISTRAR_ENTRADA_ALMOXARIFADO" as const, unidadeOrcId: "uo-1" }] },
    ];
    const d = derivarFrotaEFarmacia(perfis as never, {} as never);
    expect(d.map((c) => `${c.acao} ${c.unidadeOrcId ?? "G"}`).sort()).toEqual(["CADASTRAR_FROTA G", "REGISTRAR_ABASTECIMENTO G"]);
  });
});
