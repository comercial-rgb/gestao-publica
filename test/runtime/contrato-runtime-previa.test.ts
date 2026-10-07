import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { diaCivil, anoCivil } from "../../packages/datas/index.js";
import { criarPrismaDeTeste, criarPrismaDoPapelDeRuntime, exigirBanco } from "../banco.js";
import { limparBanco } from "../limpar-banco.js";
import { criarFichaDeTeste } from "../ficha-teste.js";
import { criarM03Deps } from "../../modules/m03-creditos/adapter-prisma.js";
import { criarLei } from "../../modules/m03-creditos/servico.js";
import { acrescentarLoteAPrevia, aprovarPrevia, criarPrevia, descartarPrevia, efetivarPrevia } from "../../modules/m03-creditos/previa.js";

/**
 * ═══ A PRÉVIA DE ALTERAÇÃO ORÇAMENTÁRIA PELO PAPEL DE RUNTIME (V36) ═══
 *
 * Todos os atos pela conexão `gestao_app` (sem posse, sem UPDATE nas tabelas insert-only): criar, acrescentar lote,
 * aprovar, efetivar e descartar. É aqui que uma trava de linha (`FOR UPDATE`, que exige UPDATE) seria recusada pelo
 * banco — os testes do módulo rodam com o dono e não a veriam. E as negativas: a prévia não se reescreve nem se apaga.
 */
const dono = criarPrismaDeTeste();
const app = criarPrismaDoPapelDeRuntime();
await exigirBanco(dono);
await exigirBanco(app);
afterAll(async () => {
  await dono.$disconnect();
  await app.$disconnect();
});

const POR = "orcamento.rt-previa@teste.local";
const EX = anoCivil(new Date());
const HOJE = new Date(`${diaCivil(new Date())}T15:00:00.000Z`);
const negado = /permission denied|permissão negada/i;
let lei = "";

beforeAll(async () => {
  await limparBanco(dono);
  const p = await dono.perfil.create({
    data: { nome: "RT-PREVIA", descricao: "rt", criadoPor: "SEED", permissoes: { create: ["CRIAR_DECRETO_DE_CREDITO", "EXECUTAR_CREDITO", "CRIAR_LEI_DE_CREDITO"].map((acao) => ({ acao: acao as never, criadoPor: "SEED" })) } },
    select: { id: true },
  });
  const u = await dono.usuario.create({ data: { identificador: POR, nome: POR, criadoPor: "SEED" }, select: { id: true } });
  await dono.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "SEED" } });
  await dono.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await dono.unidadeOrcamentaria.create({ data: { id: "uo-01", codigo: "01001", descricao: "Educação", orgaoId: "org-01" } });
  await dono.funcao.create({ data: { id: "fun-12", codigo: "12", nome: "Educação" } });
  await dono.subfuncao.createMany({ data: ["361", "362"].map((c) => ({ id: `sub-${c}`, codigo: c, nome: c })) });
  await dono.programa.create({ data: { id: "prg", codigo: "0012", descricao: "P" } });
  await dono.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await dono.naturezaDespesa.create({ data: { id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Serviços PJ" } });
  await dono.fonteRecurso.create({ data: { id: "f500", codigo: "500", descricao: "Livre", codigoTce: "500" } });
  const base = { exercicio: EX, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-12", programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd", valorDotado: "10000.00", fonteId: "f500" };
  await criarFichaDeTeste(dono, { ...base, id: "F1", numero: 1, subfuncaoId: "sub-361" });
  await criarFichaDeTeste(dono, { ...base, id: "F2", numero: 2, subfuncaoId: "sub-362" });
  lei = await criarLei({ numero: "L-RT", ano: EX, tipoCredito: "SUPLEMENTAR", valorAutorizado: "100000.00", dataPublicacao: new Date(`${String(EX)}-02-01T15:00:00Z`), criadoPor: POR }, criarM03Deps(dono));
}, 180_000);

describe("prévia de alteração orçamentária pelo papel de runtime", () => {
  it("criar, acrescentar lote, aprovar e efetivar pela conexão gestao_app; descartar outra; e nada se reescreve", async () => {
    const { previaId } = await criarPrevia(app, {
      exercicio: EX, tipoCredito: "SUPLEMENTAR", origemRecurso: "ANULACAO", descricao: "Prévia pelo runtime", criadoPor: POR,
      itens: [{ fichaId: "F1", tipo: "SUPLEMENTACAO", valor: "100.00" }, { fichaId: "F2", tipo: "ANULACAO", valor: "100.00" }],
    });
    await acrescentarLoteAPrevia(app, { previaId, itens: [{ fichaId: "F1", tipo: "SUPLEMENTACAO", valor: "50.00" }, { fichaId: "F2", tipo: "ANULACAO", valor: "50.00" }], criadoPor: POR });
    await aprovarPrevia(app, { previaId, data: HOJE, criadoPor: POR });
    const { decretoId } = await efetivarPrevia(app, criarM03Deps(app), { previaId, leiId: lei, numeroDecreto: "D-RT", data: HOJE, criadoPor: POR });
    expect(await dono.itemCredito.count({ where: { decretoId } })).toBe(4);
    const f2 = await dono.fichaOrcamentaria.findUniqueOrThrow({ where: { id: "F2" }, select: { saldoAutorizado: true, saldoReservado: true } });
    expect([f2.saldoAutorizado.toFixed(2), f2.saldoReservado.toFixed(2)]).toEqual(["9850.00", "0.00"]);

    const outra = await criarPrevia(app, {
      exercicio: EX, tipoCredito: "SUPLEMENTAR", origemRecurso: "ANULACAO", descricao: "Prévia a descartar pelo runtime", criadoPor: POR,
      itens: [{ fichaId: "F1", tipo: "SUPLEMENTACAO", valor: "10.00" }, { fichaId: "F2", tipo: "ANULACAO", valor: "10.00" }],
    });
    await descartarPrevia(app, { previaId: outra.previaId, motivo: "Descarte pelo runtime", criadoPor: POR });
    expect((await dono.fichaOrcamentaria.findUniqueOrThrow({ where: { id: "F2" }, select: { saldoReservado: true } })).saldoReservado.toFixed(2)).toBe("0.00");

    await expect(app.previaDeAlteracao.update({ where: { id: previaId }, data: { descricao: "reescrita" } })).rejects.toThrow(negado);
    await expect(app.itemDaPrevia.deleteMany({ where: { previaId } })).rejects.toThrow(negado);
    await expect(app.desfechoDaPrevia.deleteMany({ where: { previaId } })).rejects.toThrow(negado);
  }, 180_000);
});
