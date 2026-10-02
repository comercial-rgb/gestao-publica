import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { importarLicitacoesDoTribunal, lerLicitacoesDoTribunal, licitacoesCandidatas, numeroDaLicitacaoNoLeiaute } from "./licitacoes-do-tribunal.js";
import { identificarNoTramita, identificarPelaLicitacaoDoTribunal } from "./identificacao-no-tramita.js";

/**
 * V27 — A LISTA DE LICITAÇÕES DO TRIBUNAL (dados abertos do TCE-PB) e a identificação no Tramita a partir dela.
 *
 * ⚠️ O LEITOR SE CONFERE CONTRA OUTRA IMPLEMENTAÇÃO: o derivado em `docs/oficial/tce-pb/esperanca-078/` foi gerado pelo
 * script `scripts/fontes/derivar-licitacoes-tce-pb.mjs` a partir do arquivo oficial, e as contagens abaixo (130
 * licitações; 118/6/3/3 por UG; 125 protocolos do ano 26 — 113 com 5 dígitos e 12 com 6 — e 5 do ano 25) foram medidas com `cut | sort | uniq -c`, sem
 * este leitor.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
const POR = "licitacoes@cg.pb.gov.br";
const DERIVADO = readFileSync(resolve(import.meta.dirname, "../../docs/oficial/tce-pb/esperanca-078/licitacoes-2026-protocolos-DERIVADO.csv"), "utf8");

// O formato do arquivo oficial: uma linha por proposta, objeto com quebra de linha e com ponto e vírgula.
const OFICIAL = [
  "﻿nome_municipio;codigo_unidade_gestora;descricao_unidade_gestora;numero_licitacao;numero_protocolo_tce;ano_licitacao;modalidade;objeto_licitacao;data_homologacao;nome_proponente;cpf_cnpj_proponente;valor_ofertado;situacao_proposta",
  "Esperança;201078;Prefeitura Municipal de Esperança;00001/2026;Doc. 00660/26;2026;Pregão (Lei Nº 14.133/2021);AQUISIÇÃO DE MATERIAL",
  "DE EXPEDIENTE; ITENS DIVERSOS;10/02/2026;Empresa A;11222333000181;100,00;Vencedora",
  "Esperança;201078;Prefeitura Municipal de Esperança;00001/2026;Doc. 00660/26;2026;Pregão (Lei Nº 14.133/2021);AQUISIÇÃO DE MATERIAL;10/02/2026;Empresa B;11444777000161;120,00;Perdedora",
  "Esperança;201078;Prefeitura Municipal de Esperança;00031/2026;Doc. 110021/26;2026;Dispensa (Lei Nº 14.133/2021);SERVIÇO;10/03/2026;Empresa C;11222333000181;50,00;Vencedora",
  "Esperança;101078;Câmara Municipal de Esperança;00001/2026;Doc. 30542/26;2026;Leilão (Lei Nº 14.133/2021);VEÍCULO;10/03/2026;Fulano;52998224725;9,00;Vencedora",
].join("\r\n");

describe("V27 — o leitor do arquivo de licitações do Tribunal", () => {
  it("o derivado oficial de Esperança 2026: as contagens medidas por fora batem, e toda modalidade tem correspondência", () => {
    const l = lerLicitacoesDoTribunal(DERIVADO);
    expect(l.erros).toEqual([]);
    expect(l.licitacoes).toHaveLength(130);
    const porUg = (ug: string): number => l.licitacoes.filter((x) => x.codUnidadeGestora === ug).length;
    expect([porUg("201078"), porUg("301078"), porUg("101078"), porUg("601078")]).toEqual([118, 6, 3, 3]);
    expect(l.licitacoes.filter((x) => /^Doc\. \d{5}\/26$/.test(x.protocoloTce))).toHaveLength(113);
    expect(l.licitacoes.filter((x) => /^Doc\. \d{6}\/26$/.test(x.protocoloTce))).toHaveLength(12);
    expect(l.licitacoes.filter((x) => x.protocoloTce.endsWith("/25"))).toHaveLength(5); // protocolos de 2025 em licitações listadas em 2026
    expect(l.licitacoes.filter((x) => x.modalidadeSagres === null)).toEqual([]);
  });

  it("o formato oficial: a linha quebrada continua o registro, a proposta repetida vira uma licitação, texto sem correspondência fica sem código", () => {
    const l = lerLicitacoesDoTribunal(OFICIAL);
    expect(l.erros).toEqual([]);
    expect(l.licitacoes.map((x) => `${x.codUnidadeGestora} ${x.numeroLicitacao} ${x.protocoloTce} ${x.modalidadeSagres ?? "-"}`)).toEqual([
      "201078 00001/2026 Doc. 00660/26 24",
      "201078 00031/2026 Doc. 110021/26 21",
      "101078 00001/2026 Doc. 30542/26 -",
    ]);
    expect(lerLicitacoesDoTribunal("a;b\n1;2").erros[0]).toMatch(/faltam as colunas codigo_unidade_gestora/);
  });

  it("o número do leiaute tem 9 posições: os 5 dígitos e o ano", () => {
    expect(numeroDaLicitacaoNoLeiaute("00001/2026")).toBe("000012026");
    expect(numeroDaLicitacaoNoLeiaute("31/2026")).toBe("000312026");
    expect(() => numeroDaLicitacaoNoLeiaute("1/26")).toThrow(/NNNNN\/AAAA/);
  });
});

describe("V27 — identificar o processo pela lista do Tribunal", () => {
  let pregao = "";
  let dispensa = "";
  beforeEach(async () => {
    await limparBanco(prisma);
    pregao = (await prisma.processoLicitatorio.create({ data: { numeroProcesso: "PE-1/2026", modalidade: "PREGAO_ELETRONICO", objeto: "Material de expediente", valorLicitado: "10000.00", criadoPor: POR }, select: { id: true } })).id;
    dispensa = (await prisma.processoLicitatorio.create({ data: { numeroProcesso: "DL-31/2026", modalidade: "DISPENSA", hipoteseDispensa: "POR_VALOR_COMPRAS", objeto: "Serviço", valorLicitado: "500.00", criadoPor: POR }, select: { id: true } })).id;
  }, 120000);
  afterAll(async () => prisma.$disconnect());

  it("importa uma vez; a lista do processo só traz modalidade compatível; a escolha grava número de 9 posições, UG e protocolo", async () => {
    const r = await importarLicitacoesDoTribunal(prisma, { conteudo: OFICIAL, criadoPor: POR });
    expect(r).toEqual({ licitacoes: 3, semCodigo: ["Leilão (Lei Nº 14.133/2021)"] });
    await expect(importarLicitacoesDoTribunal(prisma, { conteudo: OFICIAL, criadoPor: POR })).rejects.toThrow(/já foi importado/);

    const doPregao = await licitacoesCandidatas(prisma, pregao);
    expect(doPregao.map((c) => c.rotulo)).toEqual(["UG 201078 · 00001/2026 · Pregão (Lei 14.133/21) · Doc. 00660/26"]);
    const daDispensa = await licitacoesCandidatas(prisma, dispensa);
    expect(daDispensa.map((c) => c.rotulo)).toEqual(["UG 201078 · 00031/2026 · Dispensa (Lei 14.133/21) · Doc. 110021/26"]);

    // A licitação de dispensa não serve ao pregão: a modalidade do processo é conferida no serviço.
    await expect(identificarPelaLicitacaoDoTribunal(prisma, { processoId: pregao, licitacaoNoTribunalId: daDispensa[0]!.id, criadoPor: POR })).rejects.toThrow(/modalidade do Tribunal para ele é 24/);
    await identificarPelaLicitacaoDoTribunal(prisma, { processoId: pregao, licitacaoNoTribunalId: doPregao[0]!.id, criadoPor: POR });
    const id = await prisma.identificacaoNoTramita.findFirstOrThrow({ where: { processoId: pregao }, select: { numeroNoTramita: true, codUnidadeGestora: true, modalidadeSagres: true, protocoloNoTribunal: true, fundamento: true, licitacaoNoTribunalId: true } });
    expect(id).toMatchObject({ numeroNoTramita: "000012026", codUnidadeGestora: "201078", modalidadeSagres: "24", protocoloNoTribunal: "Doc. 00660/26", licitacaoNoTribunalId: doPregao[0]!.id });
    expect(id.fundamento).toMatch(/^Dados abertos do TCE-PB \(licitações\), arquivo SHA-256 [0-9a-f]{16}…, licitação 00001\/2026 da UG 201078, protocolo Doc\. 00660\/26$/);

    // A modalidade sem correspondência não se usa pela lista: a recusa diz o texto e manda informar à mão.
    const leilao = await prisma.licitacaoNoTribunal.findFirstOrThrow({ where: { codUnidadeGestora: "101078" }, select: { id: true } });
    await expect(identificarPelaLicitacaoDoTribunal(prisma, { processoId: pregao, licitacaoNoTribunalId: leilao.id, criadoPor: POR })).rejects.toThrow(/A modalidade "Leilão \(Lei Nº 14\.133\/2021\)" do arquivo do Tribunal não tem correspondência/);
  });

  it("à mão: o número como o Tribunal publica vira 9 posições; protocolo fora do formato é recusado", async () => {
    const base = { processoId: dispensa, codUnidadeGestora: "201078", modalidadeSagres: "21", fundamento: "Consulta ao Tramita em 01/10/2026", criadoPor: POR };
    await expect(identificarNoTramita(prisma, { ...base, numeroNoTramita: "00031/2026", protocoloNoTribunal: "110021/26" })).rejects.toThrow(/O protocolo do Tramita tem a forma/);
    await identificarNoTramita(prisma, { ...base, numeroNoTramita: "00031/2026", protocoloNoTribunal: "Doc. 110021/26" });
    expect((await prisma.identificacaoNoTramita.findFirstOrThrow({ select: { numeroNoTramita: true } })).numeroNoTramita).toBe("000312026");
  });
});
