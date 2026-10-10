import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { importarLdo, previaDaImportacaoDaLdo } from "./importacao-da-ldo.js";
import { importarPpa, previaDaImportacaoDoPpa } from "./importacao-do-ppa.js";

/**
 * V39-R2 (R2-021, R2-022) — A IMPORTAÇÃO DA LDO PARA UM RASCUNHO E A PREPARAÇÃO DO PPA SEGUINTE.
 *
 * LDO: a de 2026 (sancionada, com protocolo) tem duas prioridades, metas de 2026, 2027 e 2028 (a de 2027 alterada por
 * ato: receita total +100,00, de 1.000,00 para 1.100,00), uma alienação com aplicações em 2026 e 2027 e um risco. A de
 * 2027 nasce em rascunho. Mapa dos anos: 2027→2027 e 2028→2028 (2026 fica de fora, com o motivo).
 * PPA: o de 2022–2025 tem dois programas (o 0012 alterado por ato: 5.000,00 → 5.500,00), ações (uma sem unidade
 * executora, que fica de fora) e previsões de 2024 e 2025. O de 2026–2029 recebe; o de 2024–2027 se sobrepõe.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
const POR = "planejamento@cg.pb.gov.br";

beforeEach(async () => limparBanco(prisma), 60000);
afterAll(async () => prisma.$disconnect());

async function usuarioCom(identificador: string, acoes: readonly string[]): Promise<string> {
  const u = await prisma.usuario.create({ data: { identificador, nome: identificador, criadoPor: "TESTE" }, select: { id: true } });
  const p = await prisma.perfil.create({
    data: { nome: `PERFIL-${identificador}`, descricao: "perfil restrito do teste", criadoPor: "TESTE", permissoes: { create: acoes.map((acao) => ({ acao: acao as "CADASTRAR_LDO", criadoPor: "TESTE" })) } },
    select: { id: true },
  });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "TESTE" } });
  return identificador;
}

const vig = (ano: number) => ({ inicioVigencia: new Date(Date.UTC(ano, 0, 1, 12)), fimVigencia: new Date(Date.UTC(ano, 11, 31, 12)), criadoPor: POR });
const meta = (ldoId: string, ano: number, receitaTotal: string) => ({
  ldoId, ano, receitaTotal, receitaPrimaria: "900.00", despesaTotal: "950.00", despesaPrimaria: "850.00", resultadoNominal: "10.00",
  dividaPublicaConsolidada: "300.00", dividaConsolidadaLiquida: "200.00", receitaPrimariaPpp: "0", despesaPrimariaPpp: "0", impactoSaldoPpp: "0", criadoPor: POR,
});

async function semearLdo(): Promise<{ origem: string; destino: string }> {
  await prisma.acao.create({ data: { id: "aca-2001", codigo: "2001", descricao: "Manutenção do ensino", tipo: "ATIVIDADE" } });
  const origem = (await prisma.leiDiretrizesOrcamentarias.create({
    data: { exercicio: 2026, ...vig(2026), dataEnvioLegislativo: new Date("2025-04-15T12:00:00Z"), numeroProtocolo: "PROT-77/2025", dataSancao: new Date("2025-07-10T12:00:00Z") },
    select: { id: true },
  })).id;
  await prisma.prioridadeLdo.createMany({
    data: [
      { ldoId: origem, acaoId: "aca-2001", descricaoAcao: "Manter as escolas", produto: "Escola mantida", unidadeMedida: "escola", meta: "12", criadoPor: POR },
      { ldoId: origem, descricaoAcao: "Construir creche", produto: "Creche construída", unidadeMedida: "unidade", meta: "2", criadoPor: POR },
    ],
  });
  await prisma.metaAnualLdo.createMany({ data: [meta(origem, 2026, "1000.00"), meta(origem, 2027, "1000.00"), meta(origem, 2028, "1200.00")] });
  const m27 = await prisma.metaAnualLdo.findFirstOrThrow({ where: { ldoId: origem, ano: 2027 }, select: { id: true } });
  await prisma.atoDeAlteracaoDoPlanejamento.create({
    data: { ldoId: origem, numero: "15", ano: 2025, data: new Date("2025-09-01T12:00:00Z"), dataPublicacao: new Date("2025-09-02T12:00:00Z"), fundamento: "Lei que altera a LDO (fixture)", criadoPor: POR,
      itens: { create: [{ metaAnualLdoId: m27.id, grandeza: "receitaTotal", valorAjuste: "100.00", criadoPor: POR }] } },
  });
  await prisma.alienacaoBemLdo.create({
    data: { ldoId: origem, descricaoBem: "Terreno do antigo matadouro", valorAlienacao: "50000.00", numeroLaudo: "L-3/2025", criadoPor: POR,
      aplicacoes: { create: [{ tipoAplicacao: "1", anoAplicacao: 2026, descricao: "Obra da creche", valor: "20000.00", criadoPor: POR }, { tipoAplicacao: "1", anoAplicacao: 2027, descricao: "Obra da creche, 2ª etapa", valor: "30000.00", criadoPor: POR }] } },
  });
  await prisma.riscoFiscal.create({ data: { ldoId: origem, codigoPassivo: "1", descricaoPassivo: "Demandas judiciais", valorPassivo: "10000.00", descricaoProvidencia: "Reserva de contingência", valorProvidencia: "10000.00", criadoPor: POR } });
  const destino = (await prisma.leiDiretrizesOrcamentarias.create({ data: { exercicio: 2027, ...vig(2027) }, select: { id: true } })).id;
  return { origem, destino };
}

const ANOS = [{ de: 2027, para: 2027 }, { de: 2028, para: 2028 }];

describe("V39-R2 (R2-021) — importar a LDO para um rascunho", { timeout: 120000 }, () => {
  it("prévia por bloco com o que fica de fora e o motivo; a confirmação copia o vigente, registra a origem e não leva o trâmite", async () => {
    const { origem, destino } = await semearLdo();
    const blocos = ["PRIORIDADES", "METAS_ANUAIS", "ALIENACOES"] as const;
    const previa = await previaDaImportacaoDaLdo(prisma, { origemId: origem, destinoId: destino, blocos: [...blocos], anos: ANOS });
    expect(previa.recusas).toEqual([]);
    expect(previa.copias.map((c) => [c.bloco, c.descricao, c.anoDeDestino, c.alterada]).sort()).toEqual([
      ["ALIENACOES", "Terreno do antigo matadouro", null, false],
      ["METAS_ANUAIS", "metas de 2027", 2027, true],
      ["METAS_ANUAIS", "metas de 2028", 2028, false],
      ["PRIORIDADES", "Construir creche", null, false],
      ["PRIORIDADES", "Manter as escolas", null, false],
    ]);
    expect(previa.fora.map((f) => [f.bloco, f.descricao, f.motivo])).toEqual([
      ["METAS_ANUAIS", "metas de 2026", "o ano 2026 não tem correspondência no mapa dos anos"],
      ["ALIENACOES", "aplicação de Terreno do antigo matadouro em 2026", "o ano 2026 não tem correspondência no mapa dos anos"],
    ]);

    const r = await importarLdo(prisma, { origemId: origem, destinoId: destino, blocos: [...blocos], anos: ANOS, versaoDaPrevia: previa.versao, criadoPor: POR });
    expect(r.copiadas).toBe(5);
    const nova = await prisma.leiDiretrizesOrcamentarias.findUniqueOrThrow({
      where: { id: destino },
      select: { dataEnvioLegislativo: true, dataDevolucaoExecutivo: true, numeroProtocolo: true, dataSancao: true, prioridades: { select: { descricaoAcao: true, acaoId: true } }, metasAnuais: { orderBy: { ano: "asc" }, select: { ano: true, receitaTotal: true } }, alienacoes: { select: { aplicacoes: { select: { anoAplicacao: true, valor: true } } } }, riscos: { select: { id: true } } },
    });
    // o trâmite não vem: a nova LDO segue rascunho
    expect([nova.dataEnvioLegislativo, nova.dataDevolucaoExecutivo, nova.numeroProtocolo, nova.dataSancao]).toEqual([null, null, null, null]);
    expect(nova.prioridades.map((p) => [p.descricaoAcao, p.acaoId]).sort()).toEqual([["Construir creche", null], ["Manter as escolas", "aca-2001"]]);
    // a meta de 2027 vai pelo VIGENTE (1.000,00 + 100,00 do ato), e o ato não é copiado
    expect(nova.metasAnuais.map((m) => [m.ano, m.receitaTotal.toFixed(2)])).toEqual([[2027, "1100.00"], [2028, "1200.00"]]);
    expect(await prisma.atoDeAlteracaoDoPlanejamento.count({ where: { ldoId: destino } })).toBe(0);
    expect(nova.alienacoes[0]?.aplicacoes.map((a) => [a.anoAplicacao, a.valor.toFixed(2)])).toEqual([[2027, "30000.00"]]);
    expect(nova.riscos).toEqual([]); // bloco não escolhido
    const imp = await prisma.importacaoDaLdo.findUniqueOrThrow({ where: { id: r.importacaoId }, select: { origemId: true, blocos: true, itens: { select: { bloco: true } } } });
    expect([imp.origemId, imp.blocos]).toEqual([origem, [...blocos]]);
    expect(imp.itens.map((i) => i.bloco).sort()).toEqual(["ALIENACOES", "APLICACOES", "METAS_ANUAIS", "METAS_ANUAIS", "PRIORIDADES", "PRIORIDADES"]);
    // a origem não mudou
    expect(await prisma.metaAnualLdo.count({ where: { ldoId: origem } })).toBe(3);
  });

  it("NEGAÇÃO: destino com trâmite, bloco já preenchido e prévia que mudou são recusados com o motivo, e nada é gravado", async () => {
    const { origem, destino } = await semearLdo();
    // prévia que mudou: entre a prévia e a confirmação, a origem ganhou uma prioridade
    const previa = await previaDaImportacaoDaLdo(prisma, { origemId: origem, destinoId: destino, blocos: ["PRIORIDADES"], anos: [] });
    await prisma.prioridadeLdo.create({ data: { ldoId: origem, descricaoAcao: "Pavimentar ruas", produto: "Rua pavimentada", unidadeMedida: "km", meta: "3", criadoPor: POR } });
    await expect(importarLdo(prisma, { origemId: origem, destinoId: destino, blocos: ["PRIORIDADES"], anos: [], versaoDaPrevia: previa.versao, criadoPor: POR }))
      .rejects.toThrow(/O que seria importado mudou desde a prévia .* Nada foi gravado\./);
    // bloco já preenchido no destino
    await prisma.riscoFiscal.create({ data: { ldoId: destino, codigoPassivo: "99", descricaoPassivo: "Outros", valorPassivo: "1.00", descricaoProvidencia: "Reserva", valorProvidencia: "1.00", criadoPor: POR } });
    const p2 = await previaDaImportacaoDaLdo(prisma, { origemId: origem, destinoId: destino, blocos: ["RISCOS_FISCAIS"], anos: [] });
    expect(p2.recusas).toEqual(["A LDO de 2027 já tem riscos fiscais (1): a importação não mistura nem substitui."]);
    await expect(importarLdo(prisma, { origemId: origem, destinoId: destino, blocos: ["RISCOS_FISCAIS"], anos: [], versaoDaPrevia: p2.versao, criadoPor: POR })).rejects.toThrow(/já tem riscos fiscais \(1\): a importação não mistura nem substitui\. Nada foi gravado\./);
    // destino com trâmite (a origem, que tem envio, protocolo e sanção, como destino de outra)
    const p3 = await previaDaImportacaoDaLdo(prisma, { origemId: destino, destinoId: origem, blocos: ["PRIORIDADES"], anos: [] });
    expect(p3.recusas).toContain("A LDO de 2026 já tem envio ao Legislativo, protocolo, sanção, ato de alteração: a importação só grava em LDO em rascunho.");
    expect([await prisma.importacaoDaLdo.count(), await prisma.prioridadeLdo.count({ where: { ldoId: destino } })]).toEqual([0, 0]);
    // mapa com dois anos indo para o mesmo destino
    await expect(previaDaImportacaoDaLdo(prisma, { origemId: origem, destinoId: destino, blocos: ["METAS_ANUAIS"], anos: [{ de: 2027, para: 2028 }, { de: 2028, para: 2028 }] }))
      .rejects.toThrow(/Dois anos de origem não podem ir para o mesmo ano de destino/);
  });

  it("CONCORRÊNCIA: duas confirmações simultâneas da mesma prévia — uma grava, a outra é recusada pelo bloco já preenchido", async () => {
    const { origem, destino } = await semearLdo();
    const previa = await previaDaImportacaoDaLdo(prisma, { origemId: origem, destinoId: destino, blocos: ["PRIORIDADES"], anos: [] });
    const r = await Promise.allSettled([1, 2].map(() => importarLdo(prisma, { origemId: origem, destinoId: destino, blocos: ["PRIORIDADES"], anos: [], versaoDaPrevia: previa.versao, criadoPor: POR })));
    expect(r.map((x) => x.status).sort()).toEqual(["fulfilled", "rejected"]);
    const recusa = r.find((x) => x.status === "rejected") as PromiseRejectedResult;
    expect(String(recusa.reason)).toMatch(/A LDO de 2027 já tem prioridades \(2\): a importação não mistura nem substitui/);
    expect([await prisma.importacaoDaLdo.count(), await prisma.prioridadeLdo.count({ where: { ldoId: destino } })]).toEqual([1, 2]);
  });

  it("NEGAÇÃO: quem cadastra a LDO mas não as metas fiscais não importa as metas; o motivo nomeia a ação", async () => {
    const { origem, destino } = await semearLdo();
    const so = await usuarioCom("so-ldo@cg.pb.gov.br", ["CADASTRAR_LDO", "CADASTRAR_PRIORIDADE_LDO"]);
    const previa = await previaDaImportacaoDaLdo(prisma, { origemId: origem, destinoId: destino, blocos: ["PRIORIDADES", "METAS_ANUAIS"], anos: ANOS });
    await expect(importarLdo(prisma, { origemId: origem, destinoId: destino, blocos: ["PRIORIDADES", "METAS_ANUAIS"], anos: ANOS, versaoDaPrevia: previa.versao, criadoPor: so }))
      .rejects.toThrow(/ACESSO NEGADO: o usuário "so-ldo@cg\.pb\.gov\.br" não tem permissão para CADASTRAR_METAS_FISCAIS_LDO/);
    // só as prioridades, ele importa
    const p2 = await previaDaImportacaoDaLdo(prisma, { origemId: origem, destinoId: destino, blocos: ["PRIORIDADES"], anos: [] });
    await importarLdo(prisma, { origemId: origem, destinoId: destino, blocos: ["PRIORIDADES"], anos: [], versaoDaPrevia: p2.versao, criadoPor: so });
    expect([await prisma.prioridadeLdo.count({ where: { ldoId: destino } }), await prisma.metaAnualLdo.count({ where: { ldoId: destino } })]).toEqual([2, 0]);
  });
});

async function semearPpa(): Promise<{ origem: string; destino: string; sobreposto: string; ato: string }> {
  await prisma.orgao.create({ data: { id: "org-02", codigo: "02", nome: "Secretaria de Educação" } });
  await prisma.unidadeOrcamentaria.create({ data: { id: "uo-02", codigo: "02001", descricao: "Secretaria de Educação", orgaoId: "org-02" } });
  await prisma.funcao.create({ data: { id: "fun-12", codigo: "12", nome: "Educação" } });
  await prisma.subfuncao.create({ data: { id: "sub-361", codigo: "361", nome: "Ensino Fundamental" } });
  await prisma.programa.createMany({ data: [{ id: "prg-12", codigo: "0012", descricao: "Educação Básica" }, { id: "prg-50", codigo: "0050", descricao: "Primeira Infância" }] });
  await prisma.acao.createMany({ data: [{ id: "aca-2001", codigo: "2001", descricao: "Manutenção do ensino", tipo: "ATIVIDADE" }, { id: "aca-1001", codigo: "1001", descricao: "Construção de creche", tipo: "PROJETO" }] });
  const eixo = await prisma.eixoEstruturante.create({ data: { codigo: "E1", descricao: "Desenvolvimento social", criadoPor: POR }, select: { id: true } });
  const area = await prisma.areaTematica.create({ data: { codigo: "A1", descricao: "Educação", eixoId: eixo.id, criadoPor: POR }, select: { id: true } });
  await prisma.naturezaReceita.create({ data: { id: "nr-iptu", codigo: "11125001", descricao: "IPTU - Principal" } });
  await prisma.fonteRecurso.create({ data: { id: "fnt-500", codigo: "500", descricao: "Recursos não vinculados", codigoTce: "500" } });
  const plano = (anoInicio: number) => prisma.planoPlurianual.create({ data: { anoInicio, anoFim: anoInicio + 3, leiRef: `Lei do PPA ${String(anoInicio)} (fixture)`, dataPublicacao: new Date(Date.UTC(anoInicio - 1, 11, 20, 12)), criadoPor: POR }, select: { id: true } });
  const origem = (await plano(2022)).id;
  const destino = (await plano(2026)).id;
  const sobreposto = (await plano(2024)).id;
  const p12 = await prisma.programaPpa.create({ data: { planoId: origem, programaId: "prg-12", areaTematicaId: area.id, valorPrevisto: "5000.00", criadoPor: POR }, select: { id: true } });
  const p50 = await prisma.programaPpa.create({ data: { planoId: origem, programaId: "prg-50", areaTematicaId: area.id, valorPrevisto: "3000.00", criadoPor: POR }, select: { id: true } });
  await prisma.indicadorPrograma.create({ data: { programaPpaId: p12.id, descricao: "Taxa de aprovação", unidadeMedida: "%", situacaoInicial: "80", situacaoModificada: "90", criadoPor: POR } });
  const loc = { unidadeExecutoraId: "uo-02", funcaoId: "fun-12", subfuncaoId: "sub-361" };
  await prisma.acaoPpa.create({ data: { programaPpaId: p12.id, acaoId: "aca-2001", ...loc, produto: "Escola mantida", unidadeMedida: "escola", metaFisica: "12", metaFinanceira: "4000.00", criadoPor: POR } });
  await prisma.acaoPpa.create({ data: { programaPpaId: p50.id, acaoId: "aca-1001", ...loc, produto: "Creche construída", unidadeMedida: "unidade", metaFisica: "2", metaFinanceira: "2500.00", criadoPor: POR } });
  await prisma.acaoPpa.create({ data: { programaPpaId: p50.id, acaoId: "aca-2001", produto: "Atendimento", unidadeMedida: "criança", metaFisica: "300", metaFinanceira: "500.00", criadoPor: POR } });
  await prisma.previsaoReceitaPpa.createMany({ data: [2023, 2024, 2025].map((ano) => ({ planoId: origem, naturezaReceitaId: "nr-iptu", fonteId: "fnt-500", ano, valor: String(ano - 2023 + 6) + "00.00", criadoPor: POR })) });
  const ato = (await prisma.atoDeAlteracaoDoPlanejamento.create({
    data: { planoId: origem, numero: "40", ano: 2023, data: new Date("2023-06-01T12:00:00Z"), dataPublicacao: new Date("2023-06-02T12:00:00Z"), fundamento: "Revisão do PPA (fixture)", criadoPor: POR,
      itens: { create: [{ programaPpaId: p12.id, grandeza: "valorPrevisto", valorAjuste: "500.00", criadoPor: POR }] } },
    select: { id: true },
  })).id;
  return { origem, destino, sobreposto, ato };
}

describe("V39-R2 (R2-022) — preparar o PPA seguinte; revisar o vigente é outra coisa", { timeout: 120000 }, () => {
  it("copia programas (vigente), indicadores e ações com código reduzido no plano novo, e a previsão pelo mapa; registra a origem e a versão", async () => {
    const { origem, destino, ato } = await semearPpa();
    // N=2 no mapa: 2024→2026 e 2025→2027 (troca que só valesse para um ano não passa); 2023 fica de fora
    const anos = [{ de: 2024, para: 2026 }, { de: 2025, para: 2027 }];
    const previa = await previaDaImportacaoDoPpa(prisma, { origemId: origem, destinoId: destino, blocos: ["PROGRAMAS", "PREVISOES_RECEITA"], anos });
    expect(previa.recusas).toEqual([]);
    expect(previa.versaoDaOrigem).toEqual({ atoId: ato, descricao: "ato 40/2023" });
    expect(previa.programas.map((p) => [p.descricao, p.dados.valorPrevisto, p.alterado, p.acoes.length])).toEqual([["0012 Educação Básica", "5500.00", true, 1], ["0050 Primeira Infância", "3000.00", false, 1]]);
    expect(previa.fora.map((f) => [f.bloco, f.descricao])).toEqual([["PROGRAMAS", "ação 2001 do programa 0050"], ["PREVISOES_RECEITA", "11125001 / fonte 500 em 2023"]]);

    const r = await importarPpa(prisma, { origemId: origem, destinoId: destino, blocos: ["PROGRAMAS", "PREVISOES_RECEITA"], anos, versaoDaPrevia: previa.versao, criadoPor: POR });
    expect([r.programas, r.acoes, r.previsoes]).toEqual([2, 2, 2]);
    const novo = await prisma.planoPlurianual.findUniqueOrThrow({
      where: { id: destino },
      select: { programas: { orderBy: { programa: { codigo: "asc" } }, select: { valorPrevisto: true, indicadores: { select: { descricao: true } }, acoes: { select: { metaFinanceira: true } } } }, previsoes: { orderBy: { ano: "asc" }, select: { ano: true, valor: true } }, codigosReduzidos: { orderBy: { numero: "asc" }, select: { numero: true } }, _count: { select: { atosDeAlteracao: true } } },
    });
    expect(novo.programas.map((p) => [p.valorPrevisto.toFixed(2), p.indicadores.length, p.acoes.map((a) => a.metaFinanceira.toFixed(2))])).toEqual([["5500.00", 1, ["4000.00"]], ["3000.00", 0, ["2500.00"]]]);
    expect(novo.previsoes.map((x) => [x.ano, x.valor.toFixed(2)])).toEqual([[2026, "700.00"], [2027, "800.00"]]);
    expect(novo.codigosReduzidos.map((c) => c.numero)).toEqual([1, 2]);
    expect(novo._count.atosDeAlteracao).toBe(0); // o ato da origem não vem; o valor dele já está no vigente
    const imp = await prisma.importacaoDoPpa.findUniqueOrThrow({ where: { id: r.importacaoId }, select: { origemId: true, versaoDaOrigemAtoId: true, itens: { select: { bloco: true } } } });
    expect([imp.origemId, imp.versaoDaOrigemAtoId]).toEqual([origem, ato]);
    expect(imp.itens.map((i) => i.bloco).sort()).toEqual(["ACOES", "ACOES", "INDICADORES", "PREVISOES_RECEITA", "PREVISOES_RECEITA", "PROGRAMAS", "PROGRAMAS"]);
  });

  it("NEGAÇÃO: quem prepara o plano e cadastra programas, mas não a receita, não importa as previsões; o motivo nomeia a ação", async () => {
    const { origem, destino } = await semearPpa();
    const so = await usuarioCom("so-programas@cg.pb.gov.br", ["CADASTRAR_PPA", "CADASTRAR_PROGRAMA_PPA"]);
    const anos = [{ de: 2025, para: 2026 }];
    const p = await previaDaImportacaoDoPpa(prisma, { origemId: origem, destinoId: destino, blocos: ["PROGRAMAS", "PREVISOES_RECEITA"], anos });
    await expect(importarPpa(prisma, { origemId: origem, destinoId: destino, blocos: ["PROGRAMAS", "PREVISOES_RECEITA"], anos, versaoDaPrevia: p.versao, criadoPor: so }))
      .rejects.toThrow(/ACESSO NEGADO: o usuário "so-programas@cg\.pb\.gov\.br" não tem permissão para CADASTRAR_RECEITA_PPA/);
    expect([await prisma.importacaoDoPpa.count(), await prisma.programaPpa.count({ where: { planoId: destino } })]).toEqual([0, 0]);
  });

  it("NEGAÇÃO: plano que se sobrepõe à origem é revisão (ato de alteração), não importação; ano fora do quadriênio é recusado; nada é gravado", async () => {
    const { origem, destino, sobreposto } = await semearPpa();
    const p = await previaDaImportacaoDoPpa(prisma, { origemId: origem, destinoId: sobreposto, blocos: ["PROGRAMAS"], anos: [] });
    expect(p.recusas).toEqual(["O plano 2024–2027 não começa depois do fim do plano 2022–2025: isto seria revisar o ciclo em vigor, e a revisão se faz por ato de alteração no próprio plano (que preserva a versão anterior). A importação só prepara o plano seguinte."]);
    await expect(importarPpa(prisma, { origemId: origem, destinoId: sobreposto, blocos: ["PROGRAMAS"], anos: [], versaoDaPrevia: p.versao, criadoPor: POR })).rejects.toThrow(/isto seria revisar o ciclo em vigor.*Nada foi gravado\./);
    const p2 = await previaDaImportacaoDoPpa(prisma, { origemId: origem, destinoId: destino, blocos: ["PREVISOES_RECEITA"], anos: [{ de: 2025, para: 2030 }] });
    expect(p2.recusas).toEqual(["O ano 2030 do mapa dos anos está fora do quadriênio do destino (2026–2029)."]);
    expect([await prisma.importacaoDoPpa.count(), await prisma.programaPpa.count({ where: { planoId: { in: [destino, sobreposto] } } })]).toEqual([0, 0]);
  });
});
