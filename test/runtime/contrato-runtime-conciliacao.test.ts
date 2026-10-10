import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, criarPrismaDoPapelDeRuntime, exigirBanco } from "../banco.js";
import { limparBanco } from "../limpar-banco.js";
import { registrarMovimentoBancario } from "../../modules/m09-tesouraria/movimentacao.js";
import { abrirConciliacao, encerrarConciliacao, justificarPendencia, lerConciliacao } from "../../modules/m09-tesouraria/servico-conciliacao.js";

/**
 * V39 — A CONCILIAÇÃO POR PERÍODO COM O PAPEL DE RUNTIME (o mesmo da aplicação em produção).
 *
 * Medido em produção em 10/10/2026: justificar uma pendência dava "permission denied for table
 * JustificativaDePendencia" — o `upsert` pede UPDATE, e a tabela não estava no censo de escrita. A suíte semeava e
 * chamava o domínio como dono, e o defeito nunca apareceu aqui. N=2: a mesma pendência justificada duas vezes (o
 * segundo salvamento é o UPDATE do upsert), e depois o encerramento, tudo pelo papel de runtime.
 */

const dono = criarPrismaDeTeste();
await exigirBanco(dono);
const app = criarPrismaDoPapelDeRuntime();
const POR = "tesouraria@cg.pb.gov.br";

beforeAll(async () => {
  await limparBanco(dono);
  await dono.contaPcasp.createMany({
    data: [
      { id: "cp-bancos", codigo: "1.1.1.1.2.00.00", nome: "Bancos", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" },
      { id: "cp-rec", codigo: "4.4.1.1.1.00.00", nome: "Receitas Financeiras", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
    ],
  });
  await dono.fonteRecurso.create({ data: { id: "fnt", codigo: "500", descricao: "Livre", codigoTce: "500" } });
  await dono.exercicio.create({ data: { ano: 2026, criadoPor: POR } });
  await dono.contaBancaria.create({ data: { id: "cb", codigo: "CC-RT", descricao: "Movimento", fonteId: "fnt", contaContabilId: "cp-bancos" } });
  await dono.fonteDaContaBancaria.create({ data: { contaBancariaId: "cb", fonteId: "fnt", criadoPor: POR } });
  await registrarMovimentoBancario(dono, { contaBancariaId: "cb", fonteId: "fnt", tipo: "DEPOSITO", valor: "300.00", data: new Date("2026-06-10T12:00:00Z"), historico: "depósito 300", contaContrapartidaId: "cp-rec", criadoPor: POR });
}, 60_000);

afterAll(async () => {
  await app.$disconnect();
  await dono.$disconnect();
});

describe("V39 — conciliação por período com o papel de runtime", () => {
  it("abre, justifica (duas vezes: criar e corrigir) e encerra, sem 'permission denied'", async () => {
    const { conciliacaoId } = await abrirConciliacao(app, { contaBancariaId: "cb", diaInicio: "2026-06-01", diaFim: "2026-06-30", criadoPor: POR });
    const pendente = (await lerConciliacao(app, conciliacaoId)).relatorio.internoSemVinculo[0];
    if (pendente === undefined) throw new Error("esperava a pendência do depósito");
    await justificarPendencia(app, { conciliacaoId, lado: "MOVIMENTO_BANCARIO", referencia: pendente.id, motivo: "depósito de 10/06 não creditado no período", criadoPor: POR });
    await justificarPendencia(app, { conciliacaoId, lado: "MOVIMENTO_BANCARIO", referencia: pendente.id, motivo: "depósito de 10/06 creditado pelo banco só em julho", criadoPor: POR });
    const lida = await lerConciliacao(app, conciliacaoId);
    expect(lida.justificativas.map((j) => j.motivo)).toEqual(["depósito de 10/06 creditado pelo banco só em julho"]);
    await encerrarConciliacao(app, { conciliacaoId, criadoPor: POR });
    expect((await lerConciliacao(app, conciliacaoId)).estado).toBe("ENCERRADA");
  });
});
