import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import {
  aprovarFatorAcidentario,
  cadastrarComponenteDeEncargo,
  cadastrarFatorAcidentario,
  cadastrarVersaoDoEncargo,
  fapVigente,
  registrarEstabelecimentoDaLotacao,
} from "./encargos-servico.js";

/**
 * V24 — o FAP no banco: cadastro com as regras do art. 202-A, aprovação por outra pessoa, e o vigente
 * do ano pelo CNPJ do ente. O efeito no cálculo (RAT × FAP) está no teste do motor.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const QUEM_CADASTRA = "alice@cg.pb.gov.br";
const QUEM_APROVA = "bob@cg.pb.gov.br";
const CNPJ_ENTE = "12345678000195";

async function semear(cnpj: string | null = CNPJ_ENTE): Promise<void> {
  await limparBanco(prisma);
  await prisma.enteConfig.create({ data: { id: "unico", codigoIbge: "2506004", poderOrgao: "01", nome: "MUNICIPIO", cnpj, uf: "PB", tribunalCodigo: "TCE-PB", tribunalUf: "PB", planoContasSeed: "pcasp-federal", conferidoPor: QUEM_CADASTRA, conferidoEm: new Date("2026-01-05T12:00:00Z") } });
}

const fap = (o: Partial<Parameters<typeof cadastrarFatorAcidentario>[1]> = {}) =>
  cadastrarFatorAcidentario(prisma, { cnpj: CNPJ_ENTE, ano: 2026, fator: "1.2345", fonte: "Consulta ao FAP 2026 do CNPJ em 10/01/2026", criadoPor: QUEM_CADASTRA, ...o });

describe("V24 — o FAP (Decreto 3.048/1999, art. 202-A)", { timeout: 60000 }, () => {
  beforeEach(async () => semear(), 60000);
  afterAll(async () => prisma.$disconnect());

  it("recusa fora de 0,5 a 2,0 e com mais de quatro casas, dizendo a regra — e nada é gravado", async () => {
    await expect(fap({ fator: "2.0001" })).rejects.toThrow(/entre 0,5000 e 2,0000/);
    await expect(fap({ fator: "0.4999" })).rejects.toThrow(/entre 0,5000 e 2,0000/);
    await expect(fap({ fator: "1.23456" })).rejects.toThrow(/quatro casas/);
    expect(await prisma.fatorAcidentarioDePrevencao.count()).toBe(0);
    await fap({ fator: "0.5" });
    await fap({ fator: "2.0000", ano: 2027 });
    expect(await prisma.fatorAcidentarioDePrevencao.count()).toBe(2);
  });

  it("quem cadastra não aprova; outra pessoa aprova; aprovar de novo é recusado", async () => {
    const { fatorId } = await fap();
    await expect(aprovarFatorAcidentario(prisma, { fatorId, criadoPor: QUEM_CADASTRA })).rejects.toThrow(/AUTOAPROVACAO-DO-FAP/);
    await aprovarFatorAcidentario(prisma, { fatorId, criadoPor: QUEM_APROVA });
    await expect(aprovarFatorAcidentario(prisma, { fatorId, criadoPor: QUEM_APROVA })).rejects.toThrow(/FAP-JA-APROVADO/);
  });

  it("o vigente é o APROVADO mais recente do CNPJ do ente no ano (N=2); o não aprovado e o de outro ano não contam", async () => {
    expect(await fapVigente(prisma, CNPJ_ENTE, 2026)).toEqual({ motivo: `nenhum FAP aprovado para o CNPJ ${CNPJ_ENTE} em 2026` });
    const a = await fap({ fator: "1.1000" });
    await aprovarFatorAcidentario(prisma, { fatorId: a.fatorId, criadoPor: QUEM_APROVA });
    const b = await fap({ fator: "1.2000", fonte: "Recurso deferido, novo FAP publicado" });
    await aprovarFatorAcidentario(prisma, { fatorId: b.fatorId, criadoPor: QUEM_APROVA });
    await fap({ fator: "1.9000", fonte: "Lançado e ainda não conferido" });
    await fap({ fator: "0.7000", ano: 2025 });
    const v = await fapVigente(prisma, CNPJ_ENTE, 2026);
    expect("fator" in v && v.fator.toFixed(4)).toBe("1.2000");
    await fap({ cnpj: "11222333000181", fator: "0.6000" });
    // O de outro CNPJ (outro estabelecimento) não muda o do ente, e o dele, sem aprovação, não vale.
    const w = await fapVigente(prisma, CNPJ_ENTE, 2026);
    expect("fator" in w && w.fator.toFixed(4)).toBe("1.2000");
    expect(await fapVigente(prisma, "11222333000181", 2026)).toEqual({ motivo: "nenhum FAP aprovado para o CNPJ 11222333000181 em 2026" });
  });

  it("V25 — o estabelecimento da lotação: CNPJ com dígito válido, lotação existente, um por competência", async () => {
    await prisma.lotacao.create({ data: { id: "lot-saude", codigo: "SAUDE", nome: "Secretaria de Saúde", criadoPor: "SEED" } });
    const reg = (o: Partial<Parameters<typeof registrarEstabelecimentoDaLotacao>[1]> = {}) =>
      registrarEstabelecimentoDaLotacao(prisma, { lotacaoId: "lot-saude", cnpj: "11222333000181", competenciaInicio: "2026-01", fundamento: "Fundo Municipal de Saúde, cadastro no eSocial", criadoPor: QUEM_CADASTRA, ...o });
    await expect(reg({ cnpj: "11222333000182" })).rejects.toThrow(/CNPJ-INVALIDO/);
    await expect(reg({ lotacaoId: "nao-existe" })).rejects.toThrow(/não existe/);
    await expect(reg({ criadoPor: "ninguem@cg.pb.gov.br" })).rejects.toThrow();
    expect(await prisma.estabelecimentoDaLotacao.count()).toBe(0);
    await reg();
    await expect(reg({ cnpj: "12345678000195" })).rejects.toThrow(/ESTABELECIMENTO-JA-REGISTRADO/);
    await reg({ cnpj: "12345678000195", competenciaInicio: "2026-07" });
    expect(await prisma.estabelecimentoDaLotacao.count()).toBe(2);
  });

  it("a versão que aplica o FAP tem de ser do RAT do regime geral, com alíquota de 1, 2 ou 3%", async () => {
    const pat = await cadastrarComponenteDeEncargo(prisma, { codigo: "RGPS-PATRONAL", descricao: "Patronal", tipo: "PREVIDENCIA_PATRONAL", regime: "RGPS", criadoPor: QUEM_CADASTRA });
    const rat = await cadastrarComponenteDeEncargo(prisma, { codigo: "RGPS-RAT", descricao: "RAT", tipo: "RISCO_AMBIENTAL_DO_TRABALHO", regime: "RGPS", criadoPor: QUEM_CADASTRA });
    const base = { competenciaInicio: "2026-01", fundamentacaoLegal: "Lei 8.212/1991, art. 22, II", sintetica: false, aplicaFap: true, rubricaIds: ["inexistente"], criadoPor: QUEM_CADASTRA };
    await expect(cadastrarVersaoDoEncargo(prisma, { ...base, componenteId: pat.componenteId, aliquota: "0.02" })).rejects.toThrow(/FAP-FORA-DO-RAT/);
    await expect(cadastrarVersaoDoEncargo(prisma, { ...base, componenteId: rat.componenteId, aliquota: "0.0246" })).rejects.toThrow(/FAP-SOBRE-ALIQUOTA-QUE-NAO-E-RAT/);
    // Com 2% a regra do FAP passa, e a recusa seguinte é a da rubrica — a prova de que a do FAP não barrou.
    await expect(cadastrarVersaoDoEncargo(prisma, { ...base, componenteId: rat.componenteId, aliquota: "0.02" })).rejects.toThrow(/Rubrica inexistente/);
  });
});
