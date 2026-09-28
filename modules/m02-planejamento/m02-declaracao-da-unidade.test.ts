import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { declararDadosDaUnidade, unidadesComDeclaracao } from "./declaracao-da-unidade.js";
import {
  gerarUnidadeOrcamentariaOuRecusa,
  lerFatosUnidadeOrcamentaria,
} from "../../adapters/tribunais/tce-pb/sagres/gerador.js";

/**
 * V21 — A DECLARAÇÃO DA UNIDADE ORÇAMENTÁRIA e o SAGRES §4.1.
 *
 * O ponto é o VERSIONAMENTO: o secretário troca em 15/03, e o arquivo de fevereiro tem de sair com o
 * primeiro, o de março com o segundo, e o de janeiro — antes de qualquer declaração — tem de ser
 * RECUSADO nomeando a unidade. N=2 declarações e N=2 unidades (uma declarada, outra não).
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "m03@cg.pb.gov.br";
const SEM_CRACHA = "sem-unidade@cg.pb.gov.br";
const EDU = "uo-edu";
const SAU = "uo-sau";
/** CPFs de teste com dígito verificador válido — não são de ninguém. */
const CPF_1 = "52998224725";
const CPF_2 = "11144477735";

const mes = (m: number) => new Date(Date.UTC(2026, m - 1, 1));

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.orgao.create({ data: { id: "org-02", codigo: "02", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.createMany({
    data: [
      { id: EDU, codigo: "02001", descricao: "Secretaria de Educacao", orgaoId: "org-02" },
      { id: SAU, codigo: "02002", descricao: "Secretaria de Saude", orgaoId: "org-02" },
    ],
  });
  const perfil = await prisma.perfil.create({
    data: { nome: "SO-LEITURA", descricao: "sem a acao", criadoPor: "SEED", permissoes: { create: [{ acao: "CONSULTAR_PLANEJAMENTO", criadoPor: "SEED" }] } },
    select: { id: true },
  });
  const u = await prisma.usuario.create({ data: { identificador: SEM_CRACHA, nome: SEM_CRACHA, criadoPor: "SEED" }, select: { id: true } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: perfil.id, criadoPor: "SEED" } });
}

const declarar = (extra: Partial<Parameters<typeof declararDadosDaUnidade>[1]> = {}) =>
  declararDadosDaUnidade(prisma, {
    unidadeOrcId: EDU,
    naturezaJuridica: "PREFEITURA_OU_SECRETARIA",
    nomeSecretario: "Maria das Dores Silva",
    cpfSecretario: CPF_1,
    atoDeNomeacao: "PORTARIA",
    vigenteDesde: new Date("2026-02-01T15:00:00Z"),
    criadoPor: POR,
    ...extra,
  });

describe("V21 — a declaração versionada da unidade e o SAGRES UnidadeOrcamentaria", () => {
  beforeEach(semear);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("t1 a troca de secretário: fevereiro sai com a primeira, março com a segunda (N=2 declarações)", async () => {
    await declarar();
    await declarar({ nomeSecretario: "Jose Carlos Pereira", cpfSecretario: "111.444.777-35", atoDeNomeacao: "DECRETO", vigenteDesde: new Date("2026-03-15T15:00:00Z") });
    await declarar({ unidadeOrcId: SAU, naturezaJuridica: "FUNDO", nomeSecretario: "Ana Lima", cpfSecretario: CPF_1, vigenteDesde: new Date("2026-01-01T15:00:00Z") });

    const fev = await lerFatosUnidadeOrcamentaria(prisma, { codUnidadeGestora: "999001", competencia: mes(2) });
    expect(fev.map((f) => [f.codigo, f.nomeSecretario, f.cpfSecretario, f.atoAdministrativo, f.tipoNaturezaJuridica])).toEqual([
      ["02001", "Maria das Dores Silva", CPF_1, "3", "2"],
      ["02002", "Ana Lima", CPF_1, "3", "6"],
    ]);
    const mar = await lerFatosUnidadeOrcamentaria(prisma, { codUnidadeGestora: "999001", competencia: mes(3) });
    expect(mar[0]).toMatchObject({ nomeSecretario: "Jose Carlos Pereira", cpfSecretario: CPF_2, atoAdministrativo: "2" });

    // A tela mostra a vigente HOJE, e o histórico fica contado.
    const tela = await unidadesComDeclaracao(prisma, { corte: new Date("2026-06-01T12:00:00Z") });
    expect(tela.find((u) => u.id === EDU)).toMatchObject({ declaracoes: 2, vigente: { nomeSecretario: "Jose Carlos Pereira" } });
  });

  it("t2 janeiro, antes de declarada: o arquivo é RECUSADO nomeando SÓ a unidade que falta", async () => {
    await declarar({ unidadeOrcId: SAU, vigenteDesde: new Date("2026-01-01T15:00:00Z") });
    await declarar({ vigenteDesde: new Date("2026-02-01T15:00:00Z") });
    const r = await gerarUnidadeOrcamentariaOuRecusa(prisma, { codUnidadeGestora: "999001", competencia: mes(1) });
    expect("recusa" in r).toBe(true);
    if ("recusa" in r) {
      expect(r.recusa).toMatch(/02001 Secretaria de Educacao/);
      expect(r.recusa).not.toMatch(/02002/);
    }
  });

  it("t3 a correção no MESMO dia: vale a gravada por último, e a anterior continua registrada", async () => {
    await declarar({ nomeSecretario: "Maria das Dorees Silva" });
    await declarar({ nomeSecretario: "Maria das Dores Silva" });
    await declarar({ unidadeOrcId: SAU, vigenteDesde: new Date("2026-01-01T15:00:00Z") });
    const fev = await lerFatosUnidadeOrcamentaria(prisma, { codUnidadeGestora: "999001", competencia: mes(2) });
    expect(fev[0]!.nomeSecretario).toBe("Maria das Dores Silva");
    expect(await prisma.declaracaoDaUnidadeOrcamentaria.count({ where: { unidadeOrcId: EDU } })).toBe(2);
  });

  it("t3b HORA DE BORDA: a declaração que vale desde HOJE já vale de manhã cedo — o corte é o dia civil", async () => {
    // Gravada como a tela grava: o dia ancorado ao meio-dia civil (15h UTC).
    await declarar({ vigenteDesde: new Date("2026-05-10T15:00:00Z") });
    // Consulta às 00h30 do mesmo dia no fuso do ente (03h30 UTC): antes do meio-dia, mesmo dia civil.
    const tela = await unidadesComDeclaracao(prisma, { corte: new Date("2026-05-10T03:30:00Z") });
    expect(tela.find((x) => x.id === EDU)?.vigente?.nomeSecretario).toBe("Maria das Dores Silva");
    // E às 23h30 do dia ANTERIOR no fuso do ente (02h30 UTC do dia 10): ainda não vale.
    const vespera = await unidadesComDeclaracao(prisma, { corte: new Date("2026-05-10T02:30:00Z") });
    expect(vespera.find((x) => x.id === EDU)?.vigente).toBeNull();
  });

  it("t4 recusa na entrada o que não se exporta, dizendo o motivo — e não grava", async () => {
    await expect(declarar({ cpfSecretario: "52998224726" })).rejects.toThrow(/CPF do secretário inválido/);
    await expect(declarar({ nomeSecretario: "Maria \"Dona Maria\" Silva" })).rejects.toThrow(/aspas/);
    await expect(declarar({ nomeSecretario: "M".repeat(61) })).rejects.toThrow(/60 caracteres/);
    expect(await prisma.declaracaoDaUnidadeOrcamentaria.count()).toBe(0);
  });

  it("t5 quem só consulta o planejamento NÃO declara — e o motivo é a ação", async () => {
    await expect(declarar({ criadoPor: SEM_CRACHA })).rejects.toThrow(/DECLARAR_DADOS_DA_UNIDADE_ORCAMENTARIA/);
    expect(await prisma.declaracaoDaUnidadeOrcamentaria.count()).toBe(0);
  });
});
