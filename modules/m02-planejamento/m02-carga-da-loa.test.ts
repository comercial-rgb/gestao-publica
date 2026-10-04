import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { toMoney } from "../../packages/contracts/index.js";
import { saldoDasContas } from "../m01-core-contabil/adapter-prisma.js";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { semearRoteiroOrcamentario } from "../../test/roteiro-orcamentario.js";
import { descricaoOficialDaNatureza, lerEmentarioDaReceita } from "../m04-receita/ementario-oficial.js";
import { carregarQddDaLoa, carregarReceitaDaLoa, lerQdd, lerReceitaDaLoa, tipoDaAcao } from "./carga-da-loa.js";

/**
 * ═══ A CARGA DO QDD DA LOA (V35, onda A2) ═══
 *
 * ⚠️ O VALOR À MÃO VEM DA LEI, não do leitor: R$ 245.000.000,00 é o "Total do Orçamento" impresso no QDD, no art. 3º
 * e nos Anexos II e IX da Lei 613/2025 (docs/oficial/esperanca-pb/QDD-2026-CONFERENCIA.md). Um leitor que perdesse
 * uma linha, lesse a coluna errada ou arredondasse centavos não chegaria a ele.
 *
 * ⚠️ N=2 em tudo que o conjunto revela: dois órgãos, três unidades, ações dos quatro tipos, duas fontes. Uma carga que
 * pusesse todas as unidades no mesmo órgão, ou todas as ações no mesmo tipo, passaria com uma de cada.
 */

const RAIZ = resolve(import.meta.dirname, "../..");
const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "orcamento@cg.pb.gov.br";
const SO_EMPENHA = "so.empenha.loa@cg.pb.gov.br";
const ORGAOS = new Map([["01", "CAMARA MUNICIPAL"], ["02", "PREFEITURA MUNICIPAL"]]);
const PROGRAMAS = new Map([["1001", "PROCESSO LEGISLATIVO"], ["2005", "GESTAO ADMINISTRATIVA"], ["9000", "RESERVA DE CONTINGENCIA"]]);

const EMENTARIO = lerEmentarioDaReceita(readFileSync(resolve(RAIZ, "docs/oficial/stn-sof/ementario-2026/ementario-receita-tabela-de-codigos-2026.xlsx")));
const RECEITA = [
  "natureza;descricao;fonte;valor;deducao;tipo_deducao;natureza_lei",
  "17115111;Cota FPM;500;1000.00;200.00;3;1.7.1.1.51.1.1.00",
  "17115121;FPM 1% dezembro;500;1200.00;0.00;;1.7.1.1.51.2.1.01",
  "17115121;FPM 1% setembro;500;1000.00;0.00;;1.7.1.1.51.2.1.02",
  "72150211;\"Contribuição \"\"patronal\"\"\";800;2000.00;0.00;;7.2.1.5.02.1.1.00",
  "17199901;Sem valor;500;0.00;0.00;;1.7.1.9.99.0.1.00",
].join("\n");

const CSV = [
  "orgao;unidade_orcamentaria;descricao_unidade;funcao;subfuncao;programa;acao;descricao_acao;natureza_despesa;fonte;valor;ficha;natureza_qdd",
  "01;01001;CAMARA MUNICIPAL;01;031;1001;1001;AQUISICAO DE EQUIPAMENTOS;449052;500;217150.00;10919;4.4.90.52.00.00",
  "01;01001;CAMARA MUNICIPAL;01;031;1001;2002;MANUTENCAO DA CAMARA;339039;500;100.10;10920;3.3.90.39.00.00",
  "02;02005;SECRETARIA DE FINANCAS;04;123;2005;2010;MANUTENCAO DA SECRETARIA;339039;500;50000.00;11001;3.3.90.39.00.00",
  "02;02016;FUNDO MUNICIPAL DE SAUDE;10;301;2005;0015;SENTENCAS JUDICIAIS;339091;600;1000.01;11002;3.3.90.91.00.00",
  "02;02019;RESERVA DE CONTINGENCIA;99;999;9000;9003;RESERVA DE CONTIGENCIA PME;999099;500;2044968.34;11446;9.9.90.99.00.00",
].join("\n");

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await semearRoteiroOrcamentario(prisma);
  await prisma.exercicio.create({ data: { ano: 2026, criadoPor: "TESTE" } });
  await prisma.funcao.createMany({ data: [{ codigo: "01", nome: "Legislativa" }, { codigo: "04", nome: "Administração" }, { codigo: "10", nome: "Saúde" }, { codigo: "99", nome: "Reserva de Contingência" }] });
  await prisma.subfuncao.createMany({ data: [{ codigo: "031", nome: "Ação Legislativa" }, { codigo: "123", nome: "Administração Financeira" }, { codigo: "301", nome: "Atenção Básica" }, { codigo: "999", nome: "Reserva de Contingência" }] });
  await prisma.fonteRecurso.createMany({ data: [{ codigo: "500", descricao: "Recursos não Vinculados de Impostos", codigoTce: "500" }, { codigo: "600", descricao: "SUS Federal - Manutenção", codigoTce: "600" }, { codigo: "800", descricao: "RPPS - Fundo em Capitalização", codigoTce: "800" }] });
  const p = await prisma.perfil.create({ data: { nome: "SO_EMPENHA_LOA", descricao: "x", criadoPor: "SEED", permissoes: { create: [{ acao: "EMPENHAR" as never, criadoPor: "SEED" }] } }, select: { id: true } });
  const u = await prisma.usuario.create({ data: { identificador: SO_EMPENHA, nome: SO_EMPENHA, criadoPor: "SEED" }, select: { id: true } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "SEED" } });
}

describe("m02 — carga do QDD da LOA (V35)", () => {
  it("t1: o QDD real de Esperança soma o total da lei, R$ 245.000.000,00, em 1.054 fichas de 2 órgãos", () => {
    const linhas = lerQdd(readFileSync(resolve(RAIZ, "docs/oficial/esperanca-pb/qdd-2026-DERIVADO.csv"), "utf8"));
    expect(linhas.length).toBe(1054);
    expect(linhas.reduce((s, l) => toMoney(s.plus(l.valor)), toMoney("0.00")).toFixed(2)).toBe("245000000.00");
    expect([...new Set(linhas.map((l) => l.orgao))].sort()).toEqual(["01", "02"]);
    expect(linhas.every((l) => l.unidade.startsWith(l.orgao))).toBe(true);
  });

  it("t1b: a receita real soma o que a lei imprime: bruto 258.517.240,00, deduções 13.517.240,00, líquido 245.000.000,00", () => {
    const linhas = lerReceitaDaLoa(readFileSync(resolve(RAIZ, "docs/oficial/esperanca-pb/receita-prevista-2026-DERIVADO.csv"), "utf8"));
    const soma = (k: "valor" | "deducao"): string => linhas.reduce((s, l) => toMoney(s.plus(l[k])), toMoney("0.00")).toFixed(2);
    expect([linhas.length, soma("valor"), soma("deducao")]).toEqual([66, "258517240.00", "13517240.00"]);
    expect(linhas.every((l) => descricaoOficialDaNatureza(l.natureza, EMENTARIO) !== null)).toBe(true);
  });

  it("t2: o tipo da ação pelo primeiro dígito", () => {
    expect([tipoDaAcao("0015"), tipoDaAcao("1001"), tipoDaAcao("2002"), tipoDaAcao("9003"), tipoDaAcao("3001"), tipoDaAcao("4001")]).toEqual([
      "OPERACAO_ESPECIAL", "PROJETO", "ATIVIDADE", "OPERACAO_ESPECIAL", "PROJETO", "ATIVIDADE",
    ]);
  });

  describe("contra banco", () => {
    beforeEach(semear, 120000);

    it("t3: cria a estrutura e as fichas; a dotação inicial vai ao razão com o total; a segunda carga não cria nada", async () => {
      const linhas = lerQdd(CSV);
      const r = await carregarQddDaLoa(prisma, { exercicio: 2026, linhas, orgaos: ORGAOS, programas: PROGRAMAS, criadoPor: POR });
      expect(r.cadastrados).toEqual({ orgaos: 2, unidades: 4, programas: 3, acoes: 5, naturezas: 4 });
      expect(r.fichasCriadas).toBe(5);
      expect(r.totalCarregado).toBe("2313218.45");

      const uos = await prisma.unidadeOrcamentaria.findMany({ select: { codigo: true, orgao: { select: { codigo: true } } }, orderBy: { codigo: "asc" } });
      expect(uos.map((u) => `${u.codigo}:${u.orgao.codigo}`)).toEqual(["01001:01", "02005:02", "02016:02", "02019:02"]);
      const acoes = await prisma.acao.findMany({ select: { codigo: true, tipo: true }, orderBy: { codigo: "asc" } });
      expect(acoes.map((a) => `${a.codigo}:${a.tipo}`)).toEqual(["0015:OPERACAO_ESPECIAL", "1001:PROJETO", "2002:ATIVIDADE", "2010:ATIVIDADE", "9003:OPERACAO_ESPECIAL"]);
      expect((await prisma.naturezaDespesa.findUnique({ where: { codigoCompleto: "999099" } }))?.descricao).toBe("Reserva de Contingência");

      const iniciais = await prisma.movimentoDotacao.findMany({ where: { tipo: "DOTACAO_INICIAL" }, select: { valor: true } });
      expect(iniciais.length).toBe(5);
      expect(iniciais.reduce((s, m) => toMoney(s.plus(m.valor.toFixed(2))), toMoney("0.00")).toFixed(2)).toBe("2313218.45");

      const r2 = await carregarQddDaLoa(prisma, { exercicio: 2026, linhas, orgaos: ORGAOS, programas: PROGRAMAS, criadoPor: POR });
      expect(r2).toMatchObject({ fichasCriadas: 0, fichasJaExistentes: 5, divergentes: [], cadastrados: { orgaos: 0, unidades: 0, programas: 0, acoes: 0, naturezas: 0 } });
      expect(await prisma.fichaOrcamentaria.count()).toBe(5);
    });

    it("t4: ficha que já existe com outro valor é divergência nomeada e não muda", async () => {
      const linhas = lerQdd(CSV);
      await carregarQddDaLoa(prisma, { exercicio: 2026, linhas, orgaos: ORGAOS, programas: PROGRAMAS, criadoPor: POR });
      const outra = lerQdd(CSV.replace(";100.10;10920;", ";100.11;10920;"));
      const r = await carregarQddDaLoa(prisma, { exercicio: 2026, linhas: outra, orgaos: ORGAOS, programas: PROGRAMAS, criadoPor: POR });
      expect(r.divergentes).toEqual(["ficha 10920 já existe com outra classificação ou valor"]);
      expect((await prisma.fichaOrcamentaria.findFirst({ where: { numero: 10920 } }))?.valorDotado.toFixed(2)).toBe("100.10");
    });

    it("t5: fonte fora do cadastro e programa sem nome recusam ANTES de gravar, nomeando cada um", async () => {
      const linhas = lerQdd(CSV.replace(";339091;600;", ";339091;601;"));
      const semNome = new Map([["1001", "PROCESSO LEGISLATIVO"], ["2005", "GESTAO ADMINISTRATIVA"]]);
      await expect(carregarQddDaLoa(prisma, { exercicio: 2026, linhas, orgaos: ORGAOS, programas: semNome, criadoPor: POR })).rejects.toThrow(
        /nada foi gravado[\s\S]*programa 9000 sem nome na lei[\s\S]*fonte \(carregue a tabela oficial de fontes antes\) fora do cadastro oficial: 601/
      );
      expect([await prisma.orgao.count(), await prisma.fichaOrcamentaria.count(), await prisma.acao.count()]).toEqual([0, 0, 0]);
    });

    it("t6: quem não cadastra a LOA é recusado com o nome da ação, e nada é gravado", async () => {
      await expect(carregarQddDaLoa(prisma, { exercicio: 2026, linhas: lerQdd(CSV), orgaos: ORGAOS, programas: PROGRAMAS, criadoPor: SO_EMPENHA })).rejects.toThrow(/CADASTRAR_LOA/);
      expect(await prisma.orgao.count()).toBe(0);
    });

    it("t7: a receita — desdobramentos somados, intraorçamentária e dedução como linhas próprias; segunda carga não cria nada", async () => {
      const linhas = lerReceitaDaLoa(RECEITA);
      const r = await carregarReceitaDaLoa(prisma, { exercicio: 2026, linhas, descricaoOficial: (c) => descricaoOficialDaNatureza(c, EMENTARIO), documento: "Lei 613/2025, Anexo II", criadoPor: POR });
      expect(r).toMatchObject({ naturezasCadastradas: 3, previsoesCriadas: 4, divergentes: [], semValor: ["1.7.1.9.99.0.1.00/500"], totalBruto: "5200.00", totalDeducoes: "200.00" });
      const prev = await prisma.receitaPrevista.findMany({ select: { tipoReceita: true, valorPrevisto: true, naturezaReceita: { select: { codigo: true } }, detalhe: { select: { tipoDeducaoSagres: true, documento: true } } }, orderBy: [{ tipoReceita: "asc" }] });
      const v = prev.map((p) => `${p.tipoReceita}:${p.naturezaReceita.codigo}:${p.valorPrevisto.toFixed(2)}:${p.detalhe?.tipoDeducaoSagres ?? "-"}`).sort();
      expect(v).toEqual(["DEDUCAO:17115111:200.00:3", "INTRA_ORCAMENTARIA:72150211:2000.00:-", "ORCAMENTARIA:17115111:1000.00:-", "ORCAMENTARIA:17115121:2200.00:-"]);
      expect(prev.find((p) => p.naturezaReceita.codigo === "17115121")?.detalhe?.documento).toMatch(/soma dos códigos 1\.7\.1\.1\.51\.2\.1\.01, 1\.7\.1\.1\.51\.2\.1\.02/);
      expect((await prisma.naturezaReceita.findUnique({ where: { codigo: "72150211" } }))?.descricao).toMatch(/Intraorçamentária$/);
      // V35 — a previsão no razão: bruta (orçamentária + intra) 5.200,00 em 5.2.1.1.1; a dedução do FUNDEB (tipo 3)
      // 200,00 em 5.2.1.1.2.01.01; a receita a realizar fica com o líquido, 5.000,00 (credora).
      const saldo = async (c: string): Promise<string> => (await saldoDasContas(prisma, [c], null)).toFixed(2);
      expect([await saldo("5.2.1.1.1.00.00"), await saldo("5.2.1.1.2.01.01"), await saldo("6.2.1.1.0.00.00")]).toEqual(["5200.00", "-200.00", "-5000.00"]);
      const r2 = await carregarReceitaDaLoa(prisma, { exercicio: 2026, linhas, descricaoOficial: (c) => descricaoOficialDaNatureza(c, EMENTARIO), documento: "Lei 613/2025, Anexo II", criadoPor: POR });
      expect(r2).toMatchObject({ naturezasCadastradas: 0, previsoesCriadas: 0, previsoesJaExistentes: 4 });
    });

    it("t8: natureza fora do ementário recusa antes de gravar, nomeando o código", async () => {
      const linhas = lerReceitaDaLoa(RECEITA.replace("17115111;Cota", "19999991;Cota"));
      await expect(carregarReceitaDaLoa(prisma, { exercicio: 2026, linhas, descricaoOficial: (c) => descricaoOficialDaNatureza(c, EMENTARIO), documento: "Lei 613/2025, Anexo II", criadoPor: POR })).rejects.toThrow(/nada foi gravado[\s\S]*natureza 19999991 fora do ementário oficial/);
      expect([await prisma.naturezaReceita.count(), await prisma.receitaPrevista.count()]).toEqual([0, 0]);
    });
  });
});
