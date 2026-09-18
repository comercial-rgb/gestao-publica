import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { meioDiaCivil } from "../packages/datas/index.js";
import { criarPrismaDeTeste, exigirBanco } from "./banco.js";
import { limparBanco } from "./limpar-banco.js";
import { admitirServidor, cadastrarCargo, cadastrarDependente, cadastrarLotacao, cadastrarServidor } from "../modules/m32-pessoal/servico.js";
import {
  abrirFolha, cadastrarRubrica, cadastrarTabelaDeContribuicao, cadastrarTabelaIrrf,
  cadastrarTabelaSalarioFamilia, calcularFolha, fecharFolha,
} from "../modules/m33-folha/servico.js";
import {
  aprovarPoliticaDePessoal, cadastrarPoliticaDePessoal, revogarPoliticaDePessoal,
  AprovacaoPeloProprioAutorError,
} from "../modules/m13-transparencia/servico-politica-de-pessoal.js";
import { NUNCA_PUBLICAVEL, TODAS_AS_COLUNAS } from "../modules/m13-transparencia/publicacao-de-pessoal.js";
import { demonstrativoDePessoal } from "../lib/portas/pessoal-publico.js";

/**
 * ═══ O DEMONSTRATIVO PÚBLICO DE PESSOAL (V11 V4.2) ═══
 *
 * ⚠️ ESTE ARQUIVO EXISTE PARA IMPEDIR UMA EXPOSIÇÃO, NÃO UM ERRO DE CONTA. O defeito que ele vigia
 * não faz nenhum número ficar errado: ele publica, num portal aberto e sem cadastro, o nome de um
 * dependente, uma pensão alimentícia ou um plano de saúde. Não há como desfazer.
 *
 * ⚠️ A FIXTURE TEM DEPENDENTE DE PROPÓSITO, com nome próprio, plano de saúde e pensão. Um teste de
 * negação sobre um servidor SEM dependentes passaria por vacuidade — não haveria o que vazar.
 *
 * ⚠️ E O CASO P5 DECLARA **TODAS** AS COLUNAS. Provar a negação com a política mínima seria fácil
 * e inútil: o que precisa ser verdade é que, mesmo com o ente autorizando o máximo que o sistema
 * permite, os campos proibidos continuam inalcançáveis — porque eles não estão no tipo.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const AUTOR = "portal@cg.pb.gov.br";
const REVISOR = "controle.interno@cg.pb.gov.br";
const POR = "contabilidade@cg.pb.gov.br";
const D = (a: number, m: number, d: number): Date => meioDiaCivil(`${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);

const NOME_DO_SERVIDOR = "Marina Albuquerque Terto";
const NOME_DO_DEPENDENTE = "Tomás Albuquerque Terto";

async function semearFolhaFechada(): Promise<void> {
  await cadastrarTabelaDeContribuicao(prisma, { regime: "RPPS", competenciaInicio: "2026-01", fundamentacaoLegal: "FIXTURE lei municipal", faixas: [{ ordem: 1, ate: null, aliquota: "0.10" }], criadoPor: POR });
  await cadastrarTabelaIrrf(prisma, { competenciaInicio: "2026-01", deducaoPorDependente: "200.00", descontoSimplificado: "600.00", isencaoMaior65: "1900.00", redutorBase: "1000.00", redutorFator: "0.2", redutorRendaMaxima: "5000.00", fundamentacaoLegal: "FIXTURE", faixas: [{ ordem: 1, ate: null, aliquota: "0" }], criadoPor: POR });
  await cadastrarTabelaSalarioFamilia(prisma, { competenciaInicio: "2026-01", rendaMaxima: "9000.00", valorPorDependente: "60.00", idadeLimite: 14, fundamentacaoLegal: "FIXTURE", criadoPor: POR });

  const r = async (i: Parameters<typeof cadastrarRubrica>[1]): Promise<void> => { await cadastrarRubrica(prisma, i); };
  await r({ codigo: "VENC", descricao: "Vencimento", tipo: "PROVENTO", natureza: "VENCIMENTO_BASE", incideContribuicao: true, incideIrrf: true, proporcionalAosDias: true, ordem: 1, fundamentacaoLegal: "fixture", criadoPor: POR });
  await r({ codigo: "PREV", descricao: "Contribuição", tipo: "DESCONTO", natureza: "CONTRIBUICAO_PREVIDENCIARIA", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 90, fundamentacaoLegal: "fixture", criadoPor: POR });
  await r({ codigo: "IRRF", descricao: "IRRF", tipo: "DESCONTO", natureza: "IMPOSTO_DE_RENDA", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 91, fundamentacaoLegal: "fixture", criadoPor: POR });
  await r({ codigo: "SFAM", descricao: "Salário-família", tipo: "PROVENTO", natureza: "SALARIO_FAMILIA", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 50, fundamentacaoLegal: "fixture", criadoPor: POR });

  const { cargoId } = await cadastrarCargo(prisma, { codigo: "PROF", denominacao: "Professor", tipo: "EFETIVO", vagasFixadas: 10, leiAutorizativa: "Lei 1/2010", dataPublicacaoLei: D(2010, 1, 1), criadoPor: POR });
  const { lotacaoId } = await cadastrarLotacao(prisma, { codigo: "SEDUC", nome: "Educacao", criadoPor: POR });
  const pessoa = await prisma.pessoa.create({ data: { documento: "52998224725", tipo: "FISICA", criadoPor: POR, versoes: { create: { nome: NOME_DO_SERVIDOR, criadoPor: POR } } }, select: { id: true } });
  const { servidorId } = await cadastrarServidor(prisma, { pessoaId: pessoa.id, dataNascimento: D(1985, 7, 20), sexo: "FEMININO", criadoPor: POR });
  await admitirServidor(prisma, { servidorId, matricula: "M-001", tipo: "EFETIVO", regimeJuridico: "Estatutario", regimePrevidenciario: "RPPS", dataAdmissao: D(2026, 1, 1), cargoId, lotacaoId, salarioBase: "4000.00", criadoPor: POR });

  // ⚠️ O DEPENDENTE EXISTE PARA QUE HAJA O QUE VAZAR. Nome próprio, salário-família (entra na
  // memória do contracheque NOMINADO) e, em seguida, plano de saúde — o fato de saúde.
  const { dependenteId } = await cadastrarDependente(prisma, {
    servidorId, nome: NOME_DO_DEPENDENTE, dataNascimento: D(2020, 5, 10),
    grauParentesco: "FILHO", finalidade: "SALARIO_FAMILIA", dataInicio: D(2026, 1, 1), criadoPor: POR,
  });
  await prisma.finalidadeDependente.create({ data: { dependenteId, finalidade: "PLANO_SAUDE", dataInicio: D(2026, 1, 1), criadoPor: POR } });

  const { folhaId } = await abrirFolha(prisma, { competencia: "2026-05", criadoPor: POR });
  await calcularFolha(prisma, { folhaId, criadoPor: POR });
  await fecharFolha(prisma, { folhaId, criadoPor: POR });
}

/** Cria a política e a aprova com OUTRA pessoa. */
async function politicaAprovada(colunas: readonly string[], competenciaInicio = "2026-01"): Promise<string> {
  const { politicaId } = await cadastrarPoliticaDePessoal(prisma, {
    competenciaInicio,
    fundamentacaoLegal: "Lei municipal sintetica 12/2026, art. 4 — publicidade da folha",
    colunas: colunas as never,
    criadoPor: AUTOR,
  });
  await aprovarPoliticaDePessoal(prisma, { politicaId, aprovadoPor: REVISOR });
  return politicaId;
}

beforeEach(async () => {
  await limparBanco(prisma);
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe("V11 V4.2 (P) — o demonstrativo público de pessoal", () => {
  it("P1: SEM política, o agregado publica e o individual NÃO — com a pendência nomeada", async () => {
    await semearFolhaFechada();
    const d = await demonstrativoDePessoal("2026-05");

    expect(d.temFolhaFechada).toBe(true);
    // O agregado não tem dado pessoal: sai sempre.
    expect(d.agregado.length).toBeGreaterThan(0);
    expect(d.total?.vinculos).toBe(1);
    // À MÃO: vencimento 4.000,00 + salário-família 60,00 = 4.060,00 de bruto.
    expect(d.total?.bruto).toBe("4060.00");

    // ⚠️ ZERO LINHAS INDIVIDUAIS, e o motivo dito — nunca "o básico".
    expect(d.politica).toBeNull();
    expect(d.linhas).toEqual([]);
    expect(d.cabecalho).toEqual([]);
    expect(d.pendencia).toContain("não declarou a política de publicação de pessoal");
    // E o nome não aparece em lugar nenhum da resposta.
    expect(JSON.stringify(d)).not.toContain(NOME_DO_SERVIDOR);
  });

  it("P2: com política, saem EXATAMENTE as colunas declaradas — nem uma a mais", async () => {
    await semearFolhaFechada();
    await politicaAprovada(["MATRICULA", "CARGO", "PROVENTOS"]);
    const d = await demonstrativoDePessoal("2026-05");

    expect(d.politica?.versao).toBe(1);
    expect(d.cabecalho).toEqual(["Matrícula", "Cargo", "Proventos"]);
    expect(d.linhas).toHaveLength(1);
    expect(d.linhas[0]?.celulas.map((c) => c.coluna)).toEqual(["MATRICULA", "CARGO", "PROVENTOS"]);
    expect(d.linhas[0]?.celulas.map((c) => c.valor)).toEqual(["M-001", "PROF — Professor", "4060.00"]);

    // ⚠️ O NOME E O LÍQUIDO NÃO FORAM DECLARADOS — logo não existem na resposta, nem vazios.
    expect(JSON.stringify(d.linhas)).not.toContain(NOME_DO_SERVIDOR);
    expect(d.linhas[0]?.celulas.some((c) => c.coluna === "LIQUIDO")).toBe(false);
  });

  it("P3: RASCUNHO não publica nada — a aprovação é que autoriza a exposição", async () => {
    await semearFolhaFechada();
    await cadastrarPoliticaDePessoal(prisma, {
      competenciaInicio: "2026-01",
      fundamentacaoLegal: "Lei municipal sintetica 12/2026, art. 4",
      colunas: ["NOME", "PROVENTOS"],
      criadoPor: AUTOR,
    });
    const d = await demonstrativoDePessoal("2026-05");
    expect(d.politica).toBeNull();
    expect(d.linhas).toEqual([]);
    expect(JSON.stringify(d)).not.toContain(NOME_DO_SERVIDOR);
  });

  it("P4: REVOGAR a política faz o portal parar de publicar — imediatamente", async () => {
    await semearFolhaFechada();
    const politicaId = await politicaAprovada(["NOME", "PROVENTOS"]);
    expect((await demonstrativoDePessoal("2026-05")).linhas).toHaveLength(1);

    await revogarPoliticaDePessoal(prisma, { politicaId, motivo: "recomendacao do controle interno sobre a exposicao do nome", revogadoPor: REVISOR });

    const d = await demonstrativoDePessoal("2026-05");
    expect(d.politica).toBeNull();
    expect(d.linhas).toEqual([]);
    expect(JSON.stringify(d)).not.toContain(NOME_DO_SERVIDOR);
  });

  it("P5: o CONTRATO DE NEGAÇÃO — com TODAS as colunas declaradas, nada proibido alcança a resposta", async () => {
    await semearFolhaFechada();
    await politicaAprovada([...TODAS_AS_COLUNAS]);
    const d = await demonstrativoDePessoal("2026-05");

    expect(d.linhas).toHaveLength(1);
    expect(d.cabecalho).toHaveLength(TODAS_AS_COLUNAS.length);
    // O nome SAI, porque a política o declarou — é a exposição que o ente autorizou.
    expect(JSON.stringify(d)).toContain(NOME_DO_SERVIDOR);

    const achatado = JSON.stringify(d);
    // ⚠️ O DEPENDENTE NÃO SAI, e não há política que o faça sair: ele não está no tipo.
    expect(achatado, "nome de dependente no demonstrativo público").not.toContain(NOME_DO_DEPENDENTE);
    // ⚠️ NEM O FATO DE SAÚDE, nem a memória, nem a tributação individual, nem o CPF.
    for (const proibido of ["PLANO_SAUDE", "PENSAO_ALIMENTICIA", "memoria", "sha256", "baseIrrf", "baseContribuicao", "52998224725", "dataNascimento", "invalidezPermanente"]) {
      expect(achatado, `campo proibido "${proibido}" alcançou o demonstrativo público`).not.toContain(proibido);
    }
    // A lista documentada não é decorativa: ela nomeia o motivo de cada exclusão.
    expect(Object.keys(NUNCA_PUBLICAVEL).length).toBeGreaterThan(15);
    expect(NUNCA_PUBLICAVEL["memoriaDeCalculo"]).toContain("NOMINADOS");
  });

  it("P6: folha NÃO fechada não publica nem o agregado", async () => {
    // Semeia tudo, mas não fecha: o cálculo existe e a folha segue aberta.
    await semearFolhaFechada();
    await prisma.fechamentoDaFolha.deleteMany({});
    await politicaAprovada([...TODAS_AS_COLUNAS]);

    const d = await demonstrativoDePessoal("2026-05");
    expect(d.temFolhaFechada).toBe(false);
    expect(d.agregado).toEqual([]);
    expect(d.linhas).toEqual([]);
    expect(d.pendencia).toContain("Não há folha fechada");
    expect(JSON.stringify(d)).not.toContain(NOME_DO_SERVIDOR);
  });

  it("P7: quem redige a política não a aprova — e nada muda de situação", async () => {
    const { politicaId } = await cadastrarPoliticaDePessoal(prisma, {
      competenciaInicio: "2026-01",
      fundamentacaoLegal: "Lei municipal sintetica 12/2026, art. 4",
      colunas: ["MATRICULA"],
      criadoPor: AUTOR,
    });
    await expect(aprovarPoliticaDePessoal(prisma, { politicaId, aprovadoPor: AUTOR })).rejects.toThrow(AprovacaoPeloProprioAutorError);
    const p = await prisma.politicaDePublicacaoDePessoal.findUniqueOrThrow({ where: { id: politicaId }, select: { situacao: true, aprovadoPor: true } });
    expect(p.situacao).toBe("RASCUNHO");
    expect(p.aprovadoPor).toBeNull();
  });

  it("P8: aprovar a sucessora FECHA a anterior — e a competência antiga continua explicável", async () => {
    await semearFolhaFechada();
    await politicaAprovada(["MATRICULA"], "2026-01");
    await politicaAprovada(["MATRICULA", "NOME"], "2026-06");

    // Maio vale sob a versão 1 (só matrícula); a de junho não alcança maio.
    const maio = await demonstrativoDePessoal("2026-05");
    expect(maio.politica?.versao).toBe(1);
    expect(maio.cabecalho).toEqual(["Matrícula"]);
    expect(JSON.stringify(maio)).not.toContain(NOME_DO_SERVIDOR);

    const v1 = await prisma.politicaDePublicacaoDePessoal.findFirstOrThrow({ where: { versao: 1 }, select: { competenciaFim: true, situacao: true } });
    expect(v1.competenciaFim).toBe("2026-05");
    // Fechar vigência não é revogar: ela continua APROVADA para explicar o que publicou.
    expect(v1.situacao).toBe("APROVADA");
  });

  it("P9: a política sem coluna nenhuma é recusada — ela seria indistinguível de não haver política", async () => {
    await expect(
      cadastrarPoliticaDePessoal(prisma, {
        competenciaInicio: "2026-01",
        fundamentacaoLegal: "Lei municipal sintetica 12/2026, art. 4",
        colunas: [],
        criadoPor: AUTOR,
      }),
    ).rejects.toThrow(/ao menos uma coluna/);
    expect(await prisma.politicaDePublicacaoDePessoal.count()).toBe(0);
  });
});
