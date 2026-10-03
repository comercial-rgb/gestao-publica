import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "./banco.js";
import { limparBanco } from "./limpar-banco.js";
import { semearSagresPoc } from "../prisma/seed/sagres-poc.js";
import { cadastrarUnidadeGestora, ugDasUnidadesOrcamentarias, vincularUnidadeOrcamentariaAUg } from "../modules/m01-core-contabil/unidade-gestora.js";
import { empenhar } from "../modules/m05-despesa/servico.js";
import { roteiroEmpenho } from "../modules/m05-despesa/dominio.js";
import { registrarMovimentoDotacao } from "../modules/m05-despesa/dotacao-razao.js";
import { recalcularCache } from "../modules/m05-despesa/adapter-prisma.js";
import { criarM05DepsComAlmoxarifado } from "../modules/m10-patrimonial/adapter-m05-almox.js";
import { CONTA_CREDITO_DISPONIVEL } from "../modules/m01-core-contabil/roteiros.js";
import { gerarEmpenhos } from "../adapters/tribunais/tce-pb/sagres/gerador.js";
import { aplicarAbrangencia, posicaoDoCampo } from "../adapters/tribunais/tce-pb/sagres/abrangencia.js";
import { cliente } from "../lib/portas/cliente.js";
import { contextoDasUgs } from "../lib/portas/sagres.js";
import { toMoney } from "../packages/contracts/index.js";

/**
 * V33 — O RECORTE POR UG, DE PONTA A PONTA: fatos reais no banco, o gerador real, a porta real.
 *
 * Duas UGs operadas (Prefeitura e Câmara), duas unidades orçamentárias de órgãos diferentes, um empenho em cada no
 * MESMO dia, credores diferentes. O arquivo de Empenhos do dia sai do gerador com as duas linhas; recortado pela
 * Prefeitura fica a linha da 99001, pela Câmara a da 98001 com o código da Câmara — e a soma dos dois arquivos é o
 * empenhado do dia no banco. Sem o vínculo da 98001, o arquivo inteiro fica fora, nomeando a unidade.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "tesouraria@cg.pb.gov.br"; // identidade semeada pelo limparBanco, com o perfil de administrador do teste
const D = (mes: number, dia: number): Date => new Date(Date.UTC(2026, mes - 1, dia, 12, 0, 0));
const DIA = D(7, 10);
const PREF = "201001";
const CAM = "201002";
let ugPref = "";
let ugCam = "";

async function entidade(id: string, codigo: string, nome: string): Promise<void> {
  await prisma.entidadeContabil.create({ data: { id, codigo, criadoPor: POR } });
  await prisma.versaoDaEntidadeContabil.create({
    data: { entidadeId: id, versao: 1, nome, tipoManad: codigo === "0001" ? "01" : "02", atoTipo: "LEI", atoNumero: "1", atoAno: 2000, atoDispositivo: "art. 1", atoCitacao: "Lei orgânica", criadoPor: POR },
  });
}

const base = { cnpj: null, vigenteDesde: D(1, 1), fundamento: "Cadastro de UG do Tribunal (fixture do teste)", criadoPor: POR };
const linhasDe = (b: Buffer): string[] => b.toString("utf8").split("\r\n").filter((l) => l !== "");

beforeEach(async () => {
  await limparBanco(prisma);
  await semearSagresPoc(prisma, { criadoPor: POR });
  await entidade("ent-pref", "0001", "Prefeitura Municipal");
  await entidade("ent-cam", "0002", "Câmara Municipal");
  ugPref = (await cadastrarUnidadeGestora(prisma, { ...base, codigoTce: PREF, nome: "Prefeitura Municipal", naturezaJuridica: "PREFEITURA_OU_SECRETARIA", entidadeContabilId: "ent-pref" })).id;
  ugCam = (await cadastrarUnidadeGestora(prisma, { ...base, codigoTce: CAM, nome: "Câmara Municipal", naturezaJuridica: "CAMARA_MUNICIPAL", entidadeContabilId: "ent-cam" })).id;

  // A segunda unidade: outro órgão, a mesma classificação da ficha da POC, um empenho no mesmo dia.
  const poc = await prisma.fichaOrcamentaria.findUniqueOrThrow({ where: { id: "ficha-poc" } });
  const sub = await prisma.subelemento.findFirstOrThrow({ where: { naturezaId: poc.naturezaDespesaId, codigo: "040" }, select: { id: true } });
  await prisma.orgao.create({ data: { id: "org-cam", codigo: "98", nome: "CÂMARA MUNICIPAL - TESTE" } });
  await prisma.unidadeOrcamentaria.create({ data: { id: "uo-cam", codigo: "98001", descricao: "CÂMARA MUNICIPAL - TESTE", orgaoId: "org-cam" } });
  await prisma.$transaction(async (tx) => {
    await tx.fichaOrcamentaria.create({
      data: {
        id: "ficha-cam", exercicio: 2026, numero: 9801, orgaoId: "org-cam", unidadeOrcId: "uo-cam", funcaoId: poc.funcaoId, subfuncaoId: poc.subfuncaoId,
        programaId: poc.programaId, acaoId: poc.acaoId, naturezaDespesaId: poc.naturezaDespesaId, fonteId: poc.fonteId, exercicioFonte: 1, valorDotado: "30000.00",
      },
    });
    await registrarMovimentoDotacao(tx, { fichaId: "ficha-cam", tipo: "DOTACAO_INICIAL", valor: "30000.00", origemTipo: "LOA", origemId: "ficha-cam", criadoPor: POR, data: D(1, 1), historico: "Dotacao inicial da ficha da Camara (teste)" });
    await recalcularCache(tx, "ficha-cam");
  });
  await empenhar(
    { fichaId: "ficha-cam", numero: "980", tipo: "ORDINARIO", valor: "1234.56", data: DIA, credorCpfCnpj: "11222333000181", historico: "Empenho da Camara (teste)", categoriaOrdemCronologica: "PRESTACAO_SERVICOS", subelementoId: sub.id, criadoPor: POR },
    roteiroEmpenho({ creditoDisponivel: CONTA_CREDITO_DISPONIVEL, creditoEmpenhado: "6.2.2.1.3.01.00" }),
    criarM05DepsComAlmoxarifado(prisma)
  );
}, 180000);

async function vincular(uo: string, ugId: string, desde = D(1, 1)): Promise<void> {
  const u = await prisma.unidadeOrcamentaria.findUniqueOrThrow({ where: { codigo: uo }, select: { id: true } });
  await vincularUnidadeOrcamentariaAUg(prisma, { unidadeOrcId: u.id, ugId, vigenteDesde: desde, fundamento: "Quadro de unidades da LOA 2026 (fixture)", criadoPor: POR });
}

describe("recorte por UG dos empenhos do dia, pelo gerador real", () => {
  it("t1: cada UG recebe só as linhas das suas unidades, com o próprio código, e a soma reconcilia com o banco", async () => {
    await vincular("99001", ugPref);
    await vincular("98001", ugCam);
    const pUo = posicaoDoCampo("Empenhos", "codUnidadeOrcamentaria");
    const pValor = posicaoDoCampo("Empenhos", "valor");
    if (pUo === null || pValor === null) throw new Error("leiaute sem o campo");
    const doDia = await prisma.empenho.findMany({ where: { data: DIA, estornoDeId: null, anulacaoParcialDeId: null }, select: { valor: true } });
    expect(doDia.length).toBe(2);

    const lados = await Promise.all(
      [PREF, CAM].map(async (ug) => {
        const bruto = await gerarEmpenhos(prisma, { codUnidadeGestora: ug, dia: DIA });
        expect(bruto.registros).toBe(2); // o gerador lê o ente inteiro; quem recorta é a abrangência
        const r = aplicarAbrangencia([bruto], await contextoDasUgs(cliente(), DIA, ug));
        expect(r.fora).toEqual([]);
        const a = r.arquivos[0];
        if (a === undefined) throw new Error("o arquivo não saiu");
        return linhasDe(a.conteudo);
      })
    );
    const [daPref, daCam] = lados as [string[], string[]];
    expect(daPref.map((l) => `${l.slice(0, 6)}|${l.slice(pUo.ini - 1, pUo.fim)}`)).toEqual([`${PREF}|99001`]);
    expect(daCam.map((l) => `${l.slice(0, 6)}|${l.slice(pUo.ini - 1, pUo.fim)}`)).toEqual([`${CAM}|98001`]);
    const soma = [...daPref, ...daCam].reduce((s, l) => s.plus(l.slice(pValor.ini - 1, pValor.fim).replace(",", ".")), toMoney("0"));
    const doBanco = doDia.reduce((s, e) => s.plus(e.valor.toFixed(2)), toMoney("0"));
    expect(soma.toFixed(2)).toBe(doBanco.toFixed(2));
  });

  it("t2: sem o vínculo de uma unidade, o arquivo inteiro fica fora para as duas UGs, nomeando a unidade", async () => {
    await vincular("99001", ugPref);
    for (const ug of [PREF, CAM]) {
      const r = aplicarAbrangencia([await gerarEmpenhos(prisma, { codUnidadeGestora: ug, dia: DIA })], await contextoDasUgs(cliente(), DIA, ug));
      expect(r.arquivos).toEqual([]);
      expect(r.fora[0]).toMatchObject({ arquivo: "Empenhos", regra: "UNIDADE_SEM_UG_DECLARADA" });
      expect(r.fora[0]?.detalhe).toMatch(/98001/);
    }
  });

  it("t3: o vínculo é declarado e versionado — a troca vale do dia dela em diante; repetir não duplica", async () => {
    await vincular("98001", ugPref);
    await vincular("98001", ugCam, D(7, 1));
    await vincular("98001", ugCam, D(7, 1));
    expect(await prisma.vinculoDaUnidadeOrcamentariaComUg.count({ where: { unidadeOrc: { codigo: "98001" } } })).toBe(2);
    expect((await ugDasUnidadesOrcamentarias(prisma, D(6, 30))).get("98001")).toBe(PREF);
    expect((await ugDasUnidadesOrcamentarias(prisma, D(7, 1))).get("98001")).toBe(CAM);
    // No mesmo dia, outra UG: recusa nomeando a primeira.
    await expect(vincular("98001", ugPref, D(7, 1))).rejects.toThrow(/já foi declarada da unidade gestora 201002/);
  });

  it("t4: recusas com motivo — UG de fora não recebe unidade; quem não tem a ação não declara", async () => {
    const fora = (await cadastrarUnidadeGestora(prisma, { ...base, codigoTce: "301001", nome: "Consórcio de fora", naturezaJuridica: "AUTARQUIA", entidadeContabilId: null })).id;
    await expect(vincular("98001", fora)).rejects.toThrow(/escriturada fora deste sistema/);
    await prisma.usuario.create({ data: { identificador: "v33.sem.acao", nome: "v33.sem.acao", criadoPor: "seed-teste" } });
    const u = await prisma.unidadeOrcamentaria.findUniqueOrThrow({ where: { codigo: "98001" }, select: { id: true } });
    await expect(
      vincularUnidadeOrcamentariaAUg(prisma, { unidadeOrcId: u.id, ugId: ugCam, vigenteDesde: D(1, 1), fundamento: "Quadro de unidades da LOA 2026 (fixture)", criadoPor: "v33.sem.acao" })
    ).rejects.toThrow(/CADASTRAR_ENTIDADE_CONTABIL/);
    expect(await prisma.vinculoDaUnidadeOrcamentariaComUg.count()).toBe(0);
  });
});
