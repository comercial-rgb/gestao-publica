import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anoCivil, diaCivil } from "../../packages/datas/index.js";
import { criarPrismaDeTeste, criarPrismaDoPapelDeRuntime, exigirBanco } from "../banco.js";
import { limparBanco } from "../limpar-banco.js";
import { criarFichaDeTeste } from "../ficha-teste.js";
import { criarM05DepsComContratos } from "../../modules/m11-licitacoes/adapter-m05.js";
import { roteiroEmpenho, roteiroLiquidacao } from "../../modules/m05-despesa/dominio.js";
import { empenhar } from "../../modules/m05-despesa/servico.js";
import { liquidar } from "../../modules/m05-despesa/servico-bloco2.js";
import { anularSaldoDoSubempenho, emitirSubempenho } from "../../modules/m05-despesa/subempenho.js";

/**
 * ═══ O SUBEMPENHO PELO PAPEL DE RUNTIME (V36) ═══
 *
 * Emitir, liquidar informando o subempenho e anular o saldo, pela conexão `gestao_app` (sem posse, sem UPDATE nas
 * tabelas insert-only). E as negativas: o subempenho, a anulação dele e o vínculo da liquidação não se reescrevem nem se
 * apagam.
 */
const dono = criarPrismaDeTeste();
const app = criarPrismaDoPapelDeRuntime();
await exigirBanco(dono);
await exigirBanco(app);
afterAll(async () => {
  await dono.$disconnect();
  await app.$disconnect();
});

const POR = "despesa.rt-subempenho@teste.local";
const EX = anoCivil(new Date());
const HOJE = new Date(`${diaCivil(new Date())}T15:00:00.000Z`);
const negado = /permission denied|permissão negada/i;
const C = { disponivel: "6.2.2.1.1.00.00", empenhado: "6.2.2.1.3.01.00", liquidado: "6.2.2.1.3.03.00", fornecedor: "2.1.3.1.1.00.00", vpd: "3.3.2.1.1.01.00" };

beforeAll(async () => {
  await limparBanco(dono);
  const p = await dono.perfil.create({
    data: { nome: "RT-SUBEMPENHO", descricao: "rt", criadoPor: "SEED", permissoes: { create: ["EMPENHAR", "LIQUIDAR", "ANULAR_EMPENHO_PARCIAL"].map((acao) => ({ acao: acao as never, criadoPor: "SEED" })) } },
    select: { id: true },
  });
  const u = await dono.usuario.create({ data: { identificador: POR, nome: POR, criadoPor: "SEED" }, select: { id: true } });
  await dono.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "SEED" } });
  await dono.contaPcasp.createMany({
    data: [
      { codigo: C.disponivel, nome: "Crédito Disponível", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { codigo: C.empenhado, nome: "Crédito Empenhado a Liquidar", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { codigo: C.liquidado, nome: "Crédito Empenhado Liquidado a Pagar", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { codigo: C.fornecedor, nome: "Fornecedores", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { codigo: C.vpd, nome: "Serviços de terceiros", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
    ],
  });
  await dono.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await dono.unidadeOrcamentaria.create({ data: { id: "uo-01", codigo: "01001", descricao: "Administração", orgaoId: "org-01" } });
  await dono.funcao.create({ data: { id: "fun-04", codigo: "04", nome: "Administração" } });
  await dono.subfuncao.create({ data: { id: "sub-122", codigo: "122", nome: "Adm" } });
  await dono.programa.create({ data: { id: "prg", codigo: "0004", descricao: "P" } });
  await dono.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await dono.naturezaDespesa.create({ data: { id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Serviços" } });
  await dono.fonteRecurso.create({ data: { id: "f500", codigo: "500", descricao: "Livre", codigoTce: "500" } });
  await criarFichaDeTeste(dono, {
    id: "F1", exercicio: EX, numero: 1, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-04", subfuncaoId: "sub-122",
    programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd", fonteId: "f500", valorDotado: "10000.00",
  });
}, 180_000);

describe("subempenho pelo papel de runtime", () => {
  it("emitir, liquidar pelo subempenho e anular o saldo pela conexão gestao_app; e nada se reescreve", async () => {
    const deps = criarM05DepsComContratos(app);
    const { empenhoId } = await empenhar(
      { fichaId: "F1", numero: "NE-RT", tipo: "ESTIMATIVO", valor: "1000.00", data: HOJE, credorCpfCnpj: "11144477735", historico: "runtime", categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: POR },
      roteiroEmpenho({ creditoDisponivel: C.disponivel, creditoEmpenhado: C.empenhado }),
      deps
    );
    const s = await emitirSubempenho(app, { empenhoId, valor: "300.00", data: HOJE, historico: "Parcela pelo runtime", criadoPor: POR });
    const { liquidacaoId } = await liquidar(
      { empenhoId, numero: "NL-RT", valor: "100.00", data: HOJE, responsavelAtesto: "Fulano", historico: "runtime", subempenhoId: s.subempenhoId, criadoPor: POR },
      roteiroLiquidacao({ variacaoDiminutiva: C.vpd, obrigacaoAPagar: C.fornecedor, creditoEmpenhado: C.empenhado, creditoLiquidado: C.liquidado }),
      deps
    );
    expect((await anularSaldoDoSubempenho(app, { subempenhoId: s.subempenhoId, valor: "200.00", data: HOJE, motivo: "Saldo pelo runtime", criadoPor: POR })).saldo).toBe("0.00");
    expect((await dono.liquidacao.findUniqueOrThrow({ where: { id: liquidacaoId }, select: { subempenhoId: true } })).subempenhoId).toBe(s.subempenhoId);

    await expect(app.subempenho.update({ where: { id: s.subempenhoId }, data: { valor: "999.00" } })).rejects.toThrow(negado);
    await expect(app.subempenho.deleteMany({ where: { empenhoId } })).rejects.toThrow(negado);
    await expect(app.anulacaoDeSubempenho.deleteMany({ where: { subempenhoId: s.subempenhoId } })).rejects.toThrow(negado);
    await expect(app.liquidacao.update({ where: { id: liquidacaoId }, data: { subempenhoId: null } })).rejects.toThrow(negado);
  }, 180_000);
});
