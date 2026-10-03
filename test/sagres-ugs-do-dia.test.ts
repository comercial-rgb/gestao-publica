import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "./banco.js";
import { limparBanco } from "./limpar-banco.js";
import { meioDiaCivil } from "../packages/datas/index.js";
import { cadastrarUnidadeGestora, encerrarUnidadeGestora } from "../modules/m01-core-contabil/unidade-gestora.js";
import { cliente } from "../lib/portas/cliente.js";
import { contextoDasUgs } from "../lib/portas/sagres.js";
import { decidirArquivo } from "../adapters/tribunais/tce-pb/sagres/abrangencia.js";

/**
 * V33 — O QUE A REMESSA SABE DAS UGS NO DIA, lido do banco pela MESMA função que a prévia e o download usam.
 *
 * N=2 UGs operadas (Prefeitura e Câmara), e as bordas que mudam a decisão: a Câmara encerrada antes do dia volta a
 * deixar uma só; uma segunda UG com natureza de Prefeitura torna "qual é a Prefeitura" ambíguo, e o arquivo do ente
 * fica fora para as duas (fail-closed, sem escolher por ordem de cadastro).
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "tesouraria@cg.pb.gov.br";
const D = (dia: string): Date => meioDiaCivil(dia);
let ugCam = "";

async function entidade(id: string, codigo: string, nome: string): Promise<void> {
  await prisma.entidadeContabil.create({ data: { id, codigo, criadoPor: POR } });
  await prisma.versaoDaEntidadeContabil.create({
    data: { entidadeId: id, versao: 1, nome, tipoManad: codigo === "0001" ? "01" : "02", atoTipo: "LEI", atoNumero: "1", atoAno: 2000, atoDispositivo: "art. 1", atoCitacao: "Lei orgânica", criadoPor: POR },
  });
}

const base = { cnpj: null, vigenteDesde: D("2026-01-01"), fundamento: "Cadastro de UG do Tribunal (fixture do teste)", criadoPor: POR };

beforeEach(async () => {
  await limparBanco(prisma);
  await entidade("ent-pref", "0001", "Prefeitura Municipal");
  await entidade("ent-cam", "0002", "Câmara Municipal");
  await cadastrarUnidadeGestora(prisma, { ...base, codigoTce: "201001", nome: "Prefeitura Municipal", naturezaJuridica: "PREFEITURA_OU_SECRETARIA", entidadeContabilId: "ent-pref" });
  ugCam = (await cadastrarUnidadeGestora(prisma, { ...base, codigoTce: "201002", nome: "Câmara Municipal", naturezaJuridica: "CAMARA_MUNICIPAL", entidadeContabilId: "ent-cam" })).id;
// O limparBanco frio passa de 10 s; o mesmo teto do teste vizinho (m09-transferencia-entre-ugs).
}, 120000);

describe("as UGs do dia, para a abrangência do SAGRES", () => {
  it("t1: duas operadas — a Prefeitura é a pedida só quando é ela; os extras ficam fora para as duas", async () => {
    const pref = await contextoDasUgs(cliente(), D("2026-09-14"), "201001");
    const cam = await contextoDasUgs(cliente(), D("2026-09-14"), "201002");
    expect(pref).toMatchObject({ operadas: 2, pedidaEhAPrefeitura: true, ugPedida: "201001" });
    expect(cam).toMatchObject({ operadas: 2, pedidaEhAPrefeitura: false, ugPedida: "201002" });
    expect(decidirArquivo("DespesaExtra", pref)).toMatchObject({ incluir: false, regra: "RECORTE_POR_UG_INDISPONIVEL" });
    expect(decidirArquivo("NormasOrcamentarias", pref)).toEqual({ incluir: true });
    expect(decidirArquivo("NormasOrcamentarias", cam)).toMatchObject({ incluir: false, regra: "ARQUIVO_SO_DA_PREFEITURA" });
  });

  it("t2: a Câmara encerrada antes do dia — volta a uma operada, e tudo entra inteiro", async () => {
    await encerrarUnidadeGestora(prisma, { ugId: ugCam, vigenteAte: D("2026-06-30"), ato: "Resolução 1/2026", criadoPor: POR });
    const depois = await contextoDasUgs(cliente(), D("2026-09-14"), "201001");
    expect(depois).toMatchObject({ operadas: 1, pedidaEhAPrefeitura: true });
    expect(decidirArquivo("Empenhos", depois)).toEqual({ incluir: true });
    // Antes do encerramento, ainda eram duas.
    expect((await contextoDasUgs(cliente(), D("2026-06-15"), "201001")).operadas).toBe(2);
  });

  it("t3: duas UGs com natureza de Prefeitura — nenhuma é tratada como a Prefeitura (sem escolher pela ordem)", async () => {
    await entidade("ent-sec", "0003", "Secretaria cadastrada como UG");
    await cadastrarUnidadeGestora(prisma, { ...base, codigoTce: "201003", nome: "Secretaria de Saúde", naturezaJuridica: "PREFEITURA_OU_SECRETARIA", entidadeContabilId: "ent-sec" });
    const pref = await contextoDasUgs(cliente(), D("2026-09-14"), "201001");
    expect(pref).toMatchObject({ operadas: 3, pedidaEhAPrefeitura: false });
    expect(decidirArquivo("NormasOrcamentarias", pref)).toMatchObject({ incluir: false, regra: "ARQUIVO_SO_DA_PREFEITURA" });
  });
});
