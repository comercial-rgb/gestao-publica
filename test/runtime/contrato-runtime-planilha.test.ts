import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, criarPrismaDoPapelDeRuntime, exigirBanco } from "../banco.js";
import { limparBanco } from "../limpar-banco.js";
import { xlsxDeTeste } from "../fixtures/planilhas.js";
import { confirmarPreviaDePlanilha, gerarPreviaDePlanilha, planilhaOrcamentaria, revogarVinculoDaPlanilha, vincularItemDaPlanilhaAoContrato } from "../../modules/m11-licitacoes/planilha-orcamentaria.js";

/**
 * ═══ A PLANILHA ORÇAMENTÁRIA PELO PAPEL DE RUNTIME (V7 M2 U6 — RT02) ═══
 * Prévia (com o arquivo em bytea), confirmação, vínculo e revogação pela conexão `gestao_app`; e nenhum desses fatos se
 * reescreve nem se apaga.
 */
const dono = criarPrismaDeTeste();
const app = criarPrismaDoPapelDeRuntime();
await exigirBanco(dono);
await exigirBanco(app);
afterAll(async () => { await dono.$disconnect(); await app.$disconnect(); });

const ENG = "engenharia.rt-planilha@teste.local";
const negado = /permission denied|permissão negada/i;

beforeAll(async () => {
  await limparBanco(dono);
  const p = await dono.perfil.create({ data: { nome: "RT-planilha", descricao: "rt", criadoPor: "SEED", permissoes: { create: [{ acao: "GERIR_PLANILHA_DA_OBRA", criadoPor: "SEED" }] } }, select: { id: true } });
  const u = await dono.usuario.create({ data: { identificador: ENG, nome: ENG, criadoPor: "SEED" }, select: { id: true } });
  await dono.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "SEED" } });
  await dono.obra.create({ data: { id: "obra-rt", identificador: "OBRA-RT", descricao: "Obra do runtime", tipoObraServico: "EDIFICACOES_EM_GERAL", criadoPor: "SEED" } as never });
  await dono.processoLicitatorio.create({ data: { id: "proc-rt", numeroProcesso: "RT/PLAN", modalidade: "CONCORRENCIA", objeto: "Obra", valorLicitado: "1000.00", criadoPor: "SEED" } as never });
  await dono.contrato.create({ data: { id: "ctr-rt", numeroContrato: "CT-RT-PLAN", processoId: "proc-rt", contratadoDocumento: "12345678000199", contratadoNome: "Construtora", valorInicial: "1000.00", vigenciaInicio: new Date("2026-01-01T15:00:00Z"), vigenciaFimInicial: new Date("2026-12-31T15:00:00Z"), categoriaOrdemCronologica: "REALIZACAO_OBRAS", criadoPor: "SEED" } as never });
  await dono.itemDoContrato.create({ data: { id: "ctr-rt-item", contratoId: "ctr-rt", numero: 1, descricao: "Execução da obra", unidade: "serviço", quantidade: "1", valorUnitario: "1000", criadoPor: "SEED" } });
}, 120_000);

describe("planilha orçamentária pelo papel de runtime", () => {
  it("prévia, confirmação, vínculo e revogação pela conexão gestao_app, sem reescrita", async () => {
    // 1.1: 10 × 12,50 = 125,00; 1.2: 3 × 40 = 120,00; total 245,00.
    const arquivo = xlsxDeTeste("Orçamento", [["Item", "Descrição", "Unidade", "Quantidade", "Preço unitário", "Total"], ["1", "PINTURA", null, null, null, null], ["1.1", "Pintura acrílica", "m²", 10, 12.5, 125], ["1.2", "Emassamento", "m²", 3, 40, 120]]);
    const r = await gerarPreviaDePlanilha(app, { obraId: "obra-rt", nomeDoArquivo: "orcamento.xlsx", conteudo: arquivo, criadoPor: ENG });
    expect(r).toMatchObject({ erros: 0, divergencias: 0, totalCalculado: "245.00" });
    const v = await confirmarPreviaDePlanilha(app, { previaId: r.previaId, descricao: "Orçamento do runtime", dataBaseDosPrecos: "2026-07-01", referenciaDePrecos: "Tabela sintética 07/2026", vigenciaInicio: "2026-08-01", motivo: "Planilha do projeto aprovado", numeroDoContrato: "CT-RT-PLAN", cienteDasDivergencias: false, criadoPor: ENG });
    expect(v).toMatchObject({ versao: 1, valorTotal: "245.00", itens: 3 });
    const item = (await planilhaOrcamentaria(app, v.planilhaId))!.itens.find((i) => i.codigo === "1.1")!;
    const { vinculoId } = await vincularItemDaPlanilhaAoContrato(app, { itemDaPlanilhaId: item.id, itemDoContratoId: "ctr-rt-item", motivo: "Serviço dentro do item único", criadoPor: ENG });
    await revogarVinculoDaPlanilha(app, { vinculoId, motivo: "Vínculo feito por engano no runtime", criadoPor: ENG });
    for (const sql of [
      `UPDATE "PreviaDePlanilhaOrcamentaria" SET "totalCalculado" = 1`,
      `UPDATE "PlanilhaOrcamentariaDaObra" SET "valorTotal" = 1`,
      `DELETE FROM "ItemDaPlanilhaOrcamentaria"`,
      `UPDATE "VinculoDeItemDaPlanilhaAoContrato" SET "motivo" = 'x'`,
      `DELETE FROM "RevogacaoDeVinculoDaPlanilha"`,
    ]) {
      await expect(app.$executeRawUnsafe(sql), sql).rejects.toThrow(negado);
    }
  });
});
