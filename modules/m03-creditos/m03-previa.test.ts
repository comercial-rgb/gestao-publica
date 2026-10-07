import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { CONTA_CREDITO_DISPONIVEL, CONTA_CREDITO_EMPENHADO_A_LIQUIDAR } from "../m01-core-contabil/roteiros.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { roteiroEmpenho } from "../m05-despesa/dominio.js";
import { empenhar, liberarReserva } from "../m05-despesa/servico.js";
import { criarM03Deps } from "./adapter-prisma.js";
import { acrescentarLoteAPrevia, aprovarPrevia, criarPrevia, descartarPrevia, detalharPrevia, efetivarPrevia, listarPrevias } from "./previa.js";
import { criarLei } from "./servico.js";
import { anoCivil, diaCivil } from "../../packages/datas/index.js";
import { CONTA_CREDITO_RESERVADO } from "../m01-core-contabil/roteiros.js";
import { travar } from "../../packages/locks/index.js";
import { conferirDotacaoContraRazao } from "../m05-despesa/conferir-dotacao.js";

/**
 * M03 — A PRÉVIA DA ALTERAÇÃO ORÇAMENTÁRIA (TR 5.9.3.23) E O BLOQUEIO DAS ANULAÇÕES (TR 5.9.3.24).
 *
 * Quatro fichas de 10.000,00 (F1 e F2 na fonte 500, F3 e F4 na 540). A prévia por anulação, em dois lotes:
 *   lote 1: +3.000 em F1, −3.000 em F2 (fonte 500)
 *   lote 2: +1.500 em F3, −1.500 em F4 (fonte 540)
 * Bloqueio: F2 fica com 3.000 reservados e 7.000 disponíveis; F4 com 1.500 e 8.500.
 * Efetivada: F1 autorizado 13.000, F2 7.000 (reservado 0), F3 11.500, F4 8.500 (reservado 0).
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "orcamento@cg.pb.gov.br";
const D = (d: string): Date => new Date(`${d}T15:00:00.000Z`);
// A prévia registra a hora real: aprovação e decreto são de HOJE (não podem ser anteriores ao registro nem futuros).
const EX = anoCivil(new Date());
const HOJE = D(diaCivil(new Date()));

const recusa = async (f: () => Promise<unknown>): Promise<string> => {
  try {
    await f();
  } catch (e) {
    const m = (e as Error).message;
    return /invocation in/.test(m) ? `(erro do banco) ${m.trim().split(/\r?\n/).pop() ?? ""}` : m;
  }
  return "(não recusou)";
};

let leiSuplementar = "";
let leiEspecial = "";
let leiPequena = "";

beforeEach(async () => {
  await limparBanco(prisma);
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({ data: { id: "uo-01", codigo: "01001", descricao: "Educação", orgaoId: "org-01" } });
  await prisma.funcao.create({ data: { id: "fun-12", codigo: "12", nome: "Educação" } });
  await prisma.subfuncao.createMany({ data: ["361", "362", "363", "364"].map((c) => ({ id: `sub-${c}`, codigo: c, nome: c })) });
  await prisma.programa.create({ data: { id: "prg", codigo: "0012", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({ data: { id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Serviços PJ" } });
  await prisma.fonteRecurso.createMany({
    data: [
      { id: "f500", codigo: "500", descricao: "Livre", codigoTce: "500" },
      { id: "f540", codigo: "540", descricao: "FUNDEB", codigoTce: "540" },
    ],
  });
  const base = { exercicio: EX, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-12", programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd", valorDotado: "10000.00" };
  await criarFichaDeTeste(prisma, { ...base, id: "F1", numero: 1, subfuncaoId: "sub-361", fonteId: "f500" });
  await criarFichaDeTeste(prisma, { ...base, id: "F2", numero: 2, subfuncaoId: "sub-362", fonteId: "f500" });
  await criarFichaDeTeste(prisma, { ...base, id: "F3", numero: 3, subfuncaoId: "sub-363", fonteId: "f540" });
  await criarFichaDeTeste(prisma, { ...base, id: "F4", numero: 4, subfuncaoId: "sub-364", fonteId: "f540" });
  // A segunda unidade, para o escopo da autoridade (t10b).
  await prisma.unidadeOrcamentaria.create({ data: { id: "uo-02", codigo: "01002", descricao: "Saúde", orgaoId: "org-01" } });
  await criarFichaDeTeste(prisma, { ...base, id: "F5", numero: 5, subfuncaoId: "sub-361", unidadeOrcId: "uo-02", fonteId: "f500" });
  const deps = criarM03Deps(prisma);
  const lei = (numero: string, tipo: "SUPLEMENTAR" | "ESPECIAL", valor: string): Promise<string> =>
    criarLei({ numero, ano: EX, tipoCredito: tipo, valorAutorizado: valor, dataPublicacao: D(`${String(EX)}-02-01`), criadoPor: POR }, deps);
  leiSuplementar = await lei("L-1", "SUPLEMENTAR", "100000.00");
  leiEspecial = await lei("L-2", "ESPECIAL", "100000.00");
  leiPequena = await lei("L-3", "SUPLEMENTAR", "500.00");
});

afterAll(async () => {
  await prisma.$disconnect();
});

const saldos = async (id: string): Promise<string> => {
  const f = await prisma.fichaOrcamentaria.findUniqueOrThrow({ where: { id }, select: { saldoAutorizado: true, saldoReservado: true, saldoDisponivel: true } });
  return `aut ${f.saldoAutorizado.toFixed(2)} res ${f.saldoReservado.toFixed(2)} disp ${f.saldoDisponivel.toFixed(2)}`;
};

async function previaEmDoisLotes(): Promise<string> {
  const { previaId } = await criarPrevia(prisma, {
    exercicio: EX, tipoCredito: "SUPLEMENTAR", origemRecurso: "ANULACAO", descricao: "Reforço do transporte escolar (fictício)", criadoPor: POR,
    itens: [
      { fichaId: "F1", tipo: "SUPLEMENTACAO", valor: "3000.00" },
      { fichaId: "F2", tipo: "ANULACAO", valor: "3000.00" },
    ],
  });
  await acrescentarLoteAPrevia(prisma, {
    previaId, criadoPor: POR,
    itens: [
      { fichaId: "F3", tipo: "SUPLEMENTACAO", valor: "1500.00" },
      { fichaId: "F4", tipo: "ANULACAO", valor: "1500.00" },
    ],
  });
  return previaId;
}

describe("M03 — prévia da alteração orçamentária", () => {
  it("t1: dois lotes; a anulação bloqueia o valor na ficha a anular e a suplementação não mexe em nada", async () => {
    const id = await previaEmDoisLotes();
    expect(await saldos("F1")).toBe("aut 10000.00 res 0.00 disp 10000.00");
    expect(await saldos("F2")).toBe("aut 10000.00 res 3000.00 disp 7000.00");
    expect(await saldos("F4")).toBe("aut 10000.00 res 1500.00 disp 8500.00");
    const p = await detalharPrevia(prisma, id);
    expect(p?.situacao).toBe("EM_ELABORACAO");
    expect(p?.itensDetalhados.map((i) => `${String(i.lote)}:${String(i.fichaNumero)}:${i.tipo}:${i.valor.toFixed(2)}:${i.bloqueio === null ? "-" : i.bloqueio.desfeito ? "desfeito" : "ativo"}`)).toEqual([
      "1:1:SUPLEMENTACAO:3000.00:-",
      "1:2:ANULACAO:3000.00:ativo",
      "2:3:SUPLEMENTACAO:1500.00:-",
      "2:4:ANULACAO:1500.00:ativo",
    ]);
    expect(p?.porFonte.map((f) => `${f.fonte}:${f.suplementado.toFixed(2)}/${f.anulado.toFixed(2)}`)).toEqual(["500:3000.00/3000.00", "540:1500.00/1500.00"]);
    // Com o bloqueio vivo, o razão e os movimentos de dotação continuam fechando: a reserva na conta dela (zero), o
    // bloqueio (4.500,00) na conta do roteiro próprio.
    const conf = await conferirDotacaoContraRazao(prisma, { disponivel: CONTA_CREDITO_DISPONIVEL, reservado: CONTA_CREDITO_RESERVADO, empenhado: CONTA_CREDITO_EMPENHADO_A_LIQUIDAR });
    expect(conf.map((c) => `${c.conta}:${c.pelosMovimentos.toFixed(2)}`)).toContain(`${CONTA_CREDITO_RESERVADO}:0.00`);
    expect(conf.some((c) => c.conta !== CONTA_CREDITO_RESERVADO && c.conta.startsWith("6.2.2.1.2") && c.peloRazao.toFixed(2) === "4500.00" && c.pelosMovimentos.toFixed(2) === "4500.00")).toBe(true);
  });

  it("t2: o bloqueio não serve a empenho e não se libera pela tela de reservas — as duas recusas nomeiam a prévia", async () => {
    const id = await previaEmDoisLotes();
    const reservaF2 = (await prisma.itemDaPrevia.findFirstOrThrow({ where: { previaId: id, fichaId: "F2" }, select: { reservaId: true } })).reservaId!;
    const deps = criarM05Deps(prisma);
    expect(await recusa(() => liberarReserva({ reservaId: reservaF2, historico: "tentativa pela tela", criadoPor: POR }, deps))).toMatch(new RegExp(`é o bloqueio da prévia de alteração orçamentária nº 1\/${String(EX)}: ela se libera ao efetivar ou descartar a prévia`));
    expect(
      await recusa(() =>
        empenhar(
          { fichaId: "F2", numero: "NE-9", tipo: "ORDINARIO", valor: "100.00", data: HOJE, credorCpfCnpj: "12345678000195", historico: "tentativa", categoriaOrdemCronologica: "PRESTACAO_SERVICOS", reservaId: reservaF2, criadoPor: POR },
          roteiroEmpenho({ creditoDisponivel: CONTA_CREDITO_DISPONIVEL, creditoEmpenhado: CONTA_CREDITO_EMPENHADO_A_LIQUIDAR }),
          deps
        )
      )
    ).toMatch(new RegExp(`é o bloqueio da prévia de alteração orçamentária nº 1\/${String(EX)} e não serve a empenho`));
    expect(await saldos("F2")).toBe("aut 10000.00 res 3000.00 disp 7000.00");
    expect(await prisma.empenho.count()).toBe(0);
  });

  it("t3: aprovada e efetivada sem redigitar — o decreto nasce da prévia, os bloqueios se desfazem e a dotação muda", async () => {
    const id = await previaEmDoisLotes();
    await aprovarPrevia(prisma, { previaId: id, data: HOJE, parecer: "De acordo", criadoPor: POR });
    const { decretoId } = await efetivarPrevia(prisma, criarM03Deps(prisma), { previaId: id, leiId: leiSuplementar, numeroDecreto: "D-10", data: HOJE, criadoPor: POR });
    const decreto = await prisma.decretoCredito.findUniqueOrThrow({ where: { id: decretoId }, select: { numero: true, ano: true, origemRecurso: true, itens: { select: { fichaId: true, tipo: true, valor: true }, orderBy: { fichaId: "asc" } } } });
    expect(decreto.numero).toBe("D-10");
    expect(decreto.itens.map((i) => `${i.fichaId}:${i.tipo}:${i.valor.toFixed(2)}`)).toEqual(["F1:SUPLEMENTACAO:3000.00", "F2:ANULACAO:3000.00", "F3:SUPLEMENTACAO:1500.00", "F4:ANULACAO:1500.00"]);
    expect(await saldos("F1")).toBe("aut 13000.00 res 0.00 disp 13000.00");
    expect(await saldos("F2")).toBe("aut 7000.00 res 0.00 disp 7000.00");
    expect(await saldos("F3")).toBe("aut 11500.00 res 0.00 disp 11500.00");
    expect(await saldos("F4")).toBe("aut 8500.00 res 0.00 disp 8500.00");
    const p = await detalharPrevia(prisma, id);
    expect(p?.situacao).toBe("EFETIVADA");
    expect(p?.decreto?.numero).toBe("D-10");
    expect(p?.itensDetalhados.filter((i) => i.bloqueio !== null).every((i) => i.bloqueio!.desfeito)).toBe(true);
    // N=2 prévias na lista, com a situação de cada uma.
    await criarPrevia(prisma, { exercicio: EX, tipoCredito: "SUPLEMENTAR", origemRecurso: "ANULACAO", descricao: "Segunda prévia em elaboração", itens: [{ fichaId: "F1", tipo: "SUPLEMENTACAO", valor: "10.00" }], criadoPor: POR });
    expect((await listarPrevias(prisma, { exercicio: EX })).map((l) => `${String(l.numero)}:${l.situacao}`)).toEqual(["2:EM_ELABORACAO", "1:EFETIVADA"]);
  });

  it("t4: a aprovação confere o balanceamento por fonte e recusa nomeando-o; nada é gravado", async () => {
    const { previaId } = await criarPrevia(prisma, {
      exercicio: EX, tipoCredito: "SUPLEMENTAR", origemRecurso: "ANULACAO", descricao: "Anula FUNDEB para suplementar livre", criadoPor: POR,
      itens: [
        { fichaId: "F1", tipo: "SUPLEMENTACAO", valor: "1000.00" },
        { fichaId: "F4", tipo: "ANULACAO", valor: "1000.00" },
      ],
    });
    expect(await recusa(() => aprovarPrevia(prisma, { previaId, data: HOJE, criadoPor: POR }))).toMatch(/não pode ser aprovada: .*fonte/i);
    expect(await prisma.aprovacaoDaPrevia.count()).toBe(0);
    expect(await recusa(() => efetivarPrevia(prisma, criarM03Deps(prisma), { previaId, leiId: leiSuplementar, numeroDecreto: "D-11", data: HOJE, criadoPor: POR }))).toMatch(/ainda não foi aprovada/);
  });

  it("t5: a efetivação recusada desfaz tudo — lei de outro tipo e teto da lei: os bloqueios continuam, sem decreto nem desfecho", async () => {
    const id = await previaEmDoisLotes();
    await aprovarPrevia(prisma, { previaId: id, data: HOJE, criadoPor: POR });
    expect(await recusa(() => efetivarPrevia(prisma, criarM03Deps(prisma), { previaId: id, leiId: leiEspecial, numeroDecreto: "D-12", data: HOJE, criadoPor: POR }))).toMatch(/autoriza crédito especial, e a prévia é de crédito suplementar/);
    expect(await recusa(() => efetivarPrevia(prisma, criarM03Deps(prisma), { previaId: id, leiId: leiPequena, numeroDecreto: "D-13", data: HOJE, criadoPor: POR }))).toMatch(/SUPLEMENTAÇÃO ACIMA DO TETO DA LEI/);
    expect(await saldos("F2")).toBe("aut 10000.00 res 3000.00 disp 7000.00");
    expect(await prisma.decretoCredito.count()).toBe(0);
    expect(await prisma.desfechoDaPrevia.count()).toBe(0);
    expect((await detalharPrevia(prisma, id))?.situacao).toBe("APROVADA");
    expect(await recusa(() => efetivarPrevia(prisma, criarM03Deps(prisma), { previaId: id, leiId: leiSuplementar, numeroDecreto: "D-14", data: D(diaCivil(new Date(Date.now() - 86_400_000))), criadoPor: POR }))).toMatch(/anterior à aprovação da prévia/);
    expect(await recusa(() => efetivarPrevia(prisma, criarM03Deps(prisma), { previaId: id, leiId: leiSuplementar, numeroDecreto: "D-14", data: D(`${String(EX + 1)}-01-05`), criadoPor: POR }))).toMatch(new RegExp(`não é do exercício ${String(EX)} da prévia`));
  });

  it("t6: o descarte desfaz os bloqueios e encerra a prévia; depois dele não há efetivação nem lote", async () => {
    const id = await previaEmDoisLotes();
    await descartarPrevia(prisma, { previaId: id, motivo: "A Câmara não aprovou o remanejamento", criadoPor: POR });
    expect(await saldos("F2")).toBe("aut 10000.00 res 0.00 disp 10000.00");
    expect(await saldos("F4")).toBe("aut 10000.00 res 0.00 disp 10000.00");
    expect((await detalharPrevia(prisma, id))?.situacao).toBe("DESCARTADA");
    expect(await recusa(() => aprovarPrevia(prisma, { previaId: id, data: HOJE, criadoPor: POR }))).toMatch(/já foi descartada/);
    expect(await recusa(() => acrescentarLoteAPrevia(prisma, { previaId: id, itens: [{ fichaId: "F1", tipo: "SUPLEMENTACAO", valor: "1.00" }], criadoPor: POR }))).toMatch(/já foi descartada: não aceita novo lote/);
    expect(await recusa(() => descartarPrevia(prisma, { previaId: id, motivo: "de novo, por engano", criadoPor: POR }))).toMatch(/já foi descartada/);
  });

  it("t6b: exercício encerrado não recebe o desbloqueio do descarte; o bloqueio fica e a recusa nomeia o encerramento", async () => {
    // A prévia é do exercício ANTERIOR, e o descarte acontece hoje: o fato cai num ano aberto, e só a guarda do exercício
    // DA PRÉVIA impede o desbloqueio em ficha de exercício encerrado.
    const base = { exercicio: EX - 1, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-12", programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd", valorDotado: "10000.00", fonteId: "f500" };
    await criarFichaDeTeste(prisma, { ...base, id: "A1", numero: 101, subfuncaoId: "sub-361" });
    await criarFichaDeTeste(prisma, { ...base, id: "A2", numero: 102, subfuncaoId: "sub-362" });
    const { previaId } = await criarPrevia(prisma, {
      exercicio: EX - 1, tipoCredito: "SUPLEMENTAR", origemRecurso: "ANULACAO", descricao: "Prévia do exercício anterior", criadoPor: POR,
      itens: [{ fichaId: "A1", tipo: "SUPLEMENTACAO", valor: "100.00" }, { fichaId: "A2", tipo: "ANULACAO", valor: "100.00" }],
    });
    const e = await prisma.exercicio.findUniqueOrThrow({ where: { ano: EX - 1 }, select: { id: true } });
    await prisma.encerramentoExercicio.create({ data: { exercicioId: e.id, encerradoPor: "TESTE" } });
    expect(await recusa(() => descartarPrevia(prisma, { previaId, motivo: "descarte depois do encerramento", criadoPor: POR }))).toMatch(new RegExp(`Exercício ${String(EX - 1)} está ENCERRADO`));
    expect(await prisma.desfechoDaPrevia.count()).toBe(0);
    expect(await saldos("A2")).toBe("aut 10000.00 res 100.00 disp 9900.00");
  });

  it("t7: anulação maior que o disponível não nasce; recurso novo não tem anulação; aprovada não recebe lote — e nada é gravado", async () => {
    expect(
      await recusa(() =>
        criarPrevia(prisma, {
          exercicio: EX, tipoCredito: "SUPLEMENTAR", origemRecurso: "ANULACAO", descricao: "Anulação acima do saldo", criadoPor: POR,
          itens: [
            { fichaId: "F1", tipo: "SUPLEMENTACAO", valor: "10000.01" },
            { fichaId: "F2", tipo: "ANULACAO", valor: "10000.01" },
          ],
        })
      )
    ).toMatch(/saldo|disponível/i);
    expect(await prisma.previaDeAlteracao.count()).toBe(0);
    expect(await saldos("F2")).toBe("aut 10000.00 res 0.00 disp 10000.00");
    expect(
      await recusa(() =>
        criarPrevia(prisma, { exercicio: EX, tipoCredito: "SUPLEMENTAR", origemRecurso: "EXCESSO_ARRECADACAO", descricao: "Excesso com anulação, errado", criadoPor: POR, itens: [{ fichaId: "F2", tipo: "ANULACAO", valor: "10.00" }] })
      )
    ).toMatch(/origem em recurso novo: o valor não sai de outra ficha/);
    const id = await previaEmDoisLotes();
    await aprovarPrevia(prisma, { previaId: id, data: HOJE, criadoPor: POR });
    expect(await recusa(() => acrescentarLoteAPrevia(prisma, { previaId: id, itens: [{ fichaId: "F1", tipo: "SUPLEMENTACAO", valor: "1.00" }], criadoPor: POR }))).toMatch(/já foi aprovada: não aceita novo lote/);
    expect(await prisma.itemDaPrevia.count()).toBe(4);
  });

  it("t8: a prévia que mudou depois de aprovada não é efetivada (o que se aprova é o que se efetiva)", async () => {
    const id = await previaEmDoisLotes();
    await aprovarPrevia(prisma, { previaId: id, data: HOJE, criadoPor: POR });
    // A corrida acrescentar × aprovar, encenada: um item entra depois da aprovação (pelo banco, como se tivesse vindo junto).
    await prisma.itemDaPrevia.create({ data: { previaId: id, lote: 3, fichaId: "F1", tipo: "SUPLEMENTACAO", valor: "50.00", criadoPor: POR } });
    expect(await recusa(() => efetivarPrevia(prisma, criarM03Deps(prisma), { previaId: id, leiId: leiSuplementar, numeroDecreto: "D-15", data: HOJE, criadoPor: POR }))).toMatch(/mudou depois de aprovada/);
    expect(await prisma.decretoCredito.count()).toBe(0);
    expect(await saldos("F2")).toBe("aut 10000.00 res 3000.00 disp 7000.00");
  });

  it("t9: efetivar e descartar ao mesmo tempo — um só desfecho, e os bloqueios desfeitos uma vez", async () => {
    const id = await previaEmDoisLotes();
    await aprovarPrevia(prisma, { previaId: id, data: HOJE, criadoPor: POR });
    const rs = await Promise.allSettled([
      efetivarPrevia(prisma, criarM03Deps(prisma), { previaId: id, leiId: leiSuplementar, numeroDecreto: "D-16", data: HOJE, criadoPor: POR }),
      descartarPrevia(prisma, { previaId: id, motivo: "descarte simultâneo", criadoPor: POR }),
    ]);
    expect(rs.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const falha = rs.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect((falha.reason as Error).message).toMatch(/já foi (efetivada|descartada)|ao mesmo tempo/);
    expect(await prisma.desfechoDaPrevia.count()).toBe(1);
    expect(await prisma.reservaDotacao.count({ where: { estornoDeId: { not: null } } })).toBe(2);
    expect(await saldos("F2")).toMatch(/res 0\.00/);
  });

  it("t10: sem a autoridade, cada passo recusa nomeando a ação que faltou", async () => {
    const criar = async (email: string, acoes: readonly string[]): Promise<void> => {
      const u = await prisma.usuario.create({ data: { identificador: email, nome: email, criadoPor: "TESTE" }, select: { id: true } });
      const perfil = await prisma.perfil.create({ data: { nome: email, descricao: "x", criadoPor: "TESTE", permissoes: { create: acoes.map((a) => ({ acao: a as never, criadoPor: "TESTE" })) } }, select: { id: true } });
      await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: perfil.id, criadoPor: "TESTE" } });
    };
    await criar("so.le@cg.pb.gov.br", ["CONSULTAR_PLANEJAMENTO"]);
    await criar("executa@cg.pb.gov.br", ["CONSULTAR_PLANEJAMENTO", "EXECUTAR_CREDITO"]);
    expect(await recusa(() => criarPrevia(prisma, { exercicio: EX, tipoCredito: "SUPLEMENTAR", origemRecurso: "ANULACAO", descricao: "Sem a autoridade", itens: [{ fichaId: "F1", tipo: "SUPLEMENTACAO", valor: "1.00" }], criadoPor: "so.le@cg.pb.gov.br" }))).toMatch(/CRIAR_DECRETO_DE_CREDITO/);
    const id = await previaEmDoisLotes();
    expect(await recusa(() => aprovarPrevia(prisma, { previaId: id, data: HOJE, criadoPor: "so.le@cg.pb.gov.br" }))).toMatch(/EXECUTAR_CREDITO/);
    expect(await recusa(() => descartarPrevia(prisma, { previaId: id, motivo: "sem autoridade", criadoPor: "so.le@cg.pb.gov.br" }))).toMatch(/CRIAR_DECRETO_DE_CREDITO/);
    await aprovarPrevia(prisma, { previaId: id, data: HOJE, criadoPor: "executa@cg.pb.gov.br" });
    expect(await recusa(() => efetivarPrevia(prisma, criarM03Deps(prisma), { previaId: id, leiId: leiSuplementar, numeroDecreto: "D-17", data: HOJE, criadoPor: "executa@cg.pb.gov.br" }))).toMatch(/CRIAR_DECRETO_DE_CREDITO/);
    expect(await prisma.decretoCredito.count()).toBe(0);
    expect(await prisma.desfechoDaPrevia.count()).toBe(0);
  });

  it("t11: o bloqueio vai ao razão pela conta do roteiro próprio, e não pela da reserva (pré-empenho); o desbloqueio, na data do decreto", async () => {
    const id = await previaEmDoisLotes();
    const roteiro = await prisma.roteiroOrcamentario.findFirstOrThrow({ where: { tipo: "BLOQUEIO_DE_PREVIA" }, select: { contaCredito: { select: { codigo: true } } } });
    expect(roteiro.contaCredito.codigo).not.toBe(CONTA_CREDITO_RESERVADO);
    const credito = async (conta: string): Promise<number> =>
      (await prisma.partidaContabil.findMany({ where: { fichaId: "F2", tipo: "CREDITO", conta: { codigo: conta } }, select: { valor: true } })).length;
    expect(await credito(roteiro.contaCredito.codigo)).toBe(1);
    expect(await credito(CONTA_CREDITO_RESERVADO)).toBe(0);
    // A prévia registrada anteontem, aprovada e decretada ontem, efetivada hoje: o desbloqueio tem de cair no dia do
    // decreto, junto com a anulação, e não no dia da efetivação.
    const dia = (atras: number): Date => D(diaCivil(new Date(Date.now() - atras * 86_400_000)));
    await prisma.itemDaPrevia.updateMany({ where: { previaId: id }, data: { criadoEm: dia(2) } });
    expect(await recusa(() => aprovarPrevia(prisma, { previaId: id, data: dia(3), criadoPor: POR }))).toMatch(/anterior ao último movimento da prévia/);
    await aprovarPrevia(prisma, { previaId: id, data: dia(1), criadoPor: POR });
    await efetivarPrevia(prisma, criarM03Deps(prisma), { previaId: id, leiId: leiSuplementar, numeroDecreto: "D-20", data: dia(1), criadoPor: POR });
    const liberado = await prisma.movimentoDotacao.findFirstOrThrow({ where: { fichaId: "F2", tipo: "BLOQUEIO_DE_PREVIA_LIBERADO" }, select: { competencia: true } });
    const anulacao = await prisma.movimentoDotacao.findFirstOrThrow({ where: { fichaId: "F2", tipo: "ANULACAO_CREDITO" }, select: { competencia: true } });
    expect(diaCivil(liberado.competencia)).toBe(diaCivil(anulacao.competencia));
    // Sem o roteiro do bloqueio, a prévia com anulação é recusada nomeando-o, e nada é gravado.
    await prisma.roteiroOrcamentario.deleteMany({ where: { tipo: "BLOQUEIO_DE_PREVIA" } });
    const antes = await prisma.previaDeAlteracao.count();
    expect(await recusa(() => criarPrevia(prisma, { exercicio: EX, tipoCredito: "SUPLEMENTAR", origemRecurso: "ANULACAO", descricao: "Sem o roteiro do bloqueio", criadoPor: POR, itens: [{ fichaId: "F1", tipo: "SUPLEMENTACAO", valor: "1.00" }, { fichaId: "F2", tipo: "ANULACAO", valor: "1.00" }] }))).toMatch(/ainda não definiu em que conta o bloqueio da prévia de alteração orçamentária entra/);
    expect(await prisma.previaDeAlteracao.count()).toBe(antes);
  });

  it("t12: acrescentar lote espera a trava da prévia (um descarte em curso termina antes, e o lote é recusado)", async () => {
    const id = await previaEmDoisLotes();
    let travou = (): void => undefined;
    let liberar = (): void => undefined;
    const pegou = new Promise<void>((r) => (travou = r));
    const segura = new Promise<void>((r) => (liberar = r));
    // Uma transação segura a prévia e a descarta; o lote chega enquanto ela está aberta.
    const descarte = prisma.$transaction(
      async (tx) => {
        await travar(tx, "PreviaDeAlteracao", [id]);
        travou();
        await segura;
        await tx.desfechoDaPrevia.create({ data: { previaId: id, tipo: "DESCARTADA", motivo: "descarte encenado", criadoPor: POR } });
      },
      { timeout: 60000 }
    );
    await pegou;
    const lote = acrescentarLoteAPrevia(prisma, { previaId: id, itens: [{ fichaId: "F3", tipo: "SUPLEMENTACAO", valor: "5.00" }, { fichaId: "F4", tipo: "ANULACAO", valor: "5.00" }], criadoPor: POR }).then(
      () => "(gravou)",
      (e: unknown) => (e as Error).message
    );
    let vista = false;
    for (let i = 0; i < 400 && !vista; i += 1) {
      // Só a espera de uma trava consultiva (a fila de travas), e de uma sessão que não é a que segura: a do lote.
      const [linha] = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND wait_event = 'advisory' AND query LIKE '%pg_advisory_xact_lock%' AND datname = current_database()`;
      vista = (linha?.n ?? 0n) > 0n;
      if (!vista) await new Promise((r) => setTimeout(r, 25));
    }
    liberar();
    await descarte;
    expect(vista, "o lote não esperou a trava da prévia").toBe(true);
    expect(await lote).toMatch(/já foi descartada: não aceita novo lote/);
    expect(await prisma.itemDaPrevia.count({ where: { previaId: id } })).toBe(4);
  }, 60000);

  it("t10b: a autoridade é sobre as fichas da prévia inteira, por unidade; e a efetivação cobra a execução do crédito", async () => {
    const criar = async (email: string, acoes: readonly string[], unidadeOrcId: string | null): Promise<void> => {
      const u = await prisma.usuario.create({ data: { identificador: email, nome: email, criadoPor: "TESTE" }, select: { id: true } });
      const perfil = await prisma.perfil.create({ data: { nome: email, descricao: "x", criadoPor: "TESTE", permissoes: { create: acoes.map((a) => ({ acao: a as never, unidadeOrcId, criadoPor: "TESTE" })) } }, select: { id: true } });
      await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: perfil.id, criadoPor: "TESTE" } });
    };
    await criar("so.educacao@cg.pb.gov.br", ["CRIAR_DECRETO_DE_CREDITO", "EXECUTAR_CREDITO"], "uo-01");
    await criar("prepara@cg.pb.gov.br", ["CRIAR_DECRETO_DE_CREDITO"], null);
    // Criar com uma ficha da outra unidade: recusa.
    expect(await recusa(() => criarPrevia(prisma, { exercicio: EX, tipoCredito: "SUPLEMENTAR", origemRecurso: "ANULACAO", descricao: "Mistura de unidades", criadoPor: "so.educacao@cg.pb.gov.br", itens: [{ fichaId: "F1", tipo: "SUPLEMENTACAO", valor: "1.00" }, { fichaId: "F5", tipo: "ANULACAO", valor: "1.00" }] }))).toMatch(/CRIAR_DECRETO_DE_CREDITO/);
    // Acrescentar lote da própria unidade a uma prévia que já tem ficha da outra: recusa.
    const { previaId } = await criarPrevia(prisma, { exercicio: EX, tipoCredito: "SUPLEMENTAR", origemRecurso: "ANULACAO", descricao: "Prévia da Saúde", criadoPor: POR, itens: [{ fichaId: "F5", tipo: "SUPLEMENTACAO", valor: "1.00" }] });
    expect(await recusa(() => acrescentarLoteAPrevia(prisma, { previaId, itens: [{ fichaId: "F1", tipo: "SUPLEMENTACAO", valor: "1.00" }], criadoPor: "so.educacao@cg.pb.gov.br" }))).toMatch(/CRIAR_DECRETO_DE_CREDITO/);
    expect(await prisma.itemDaPrevia.count({ where: { previaId } })).toBe(1);
    // Efetivar sem EXECUTAR_CREDITO: recusa nomeando-a.
    const id = await previaEmDoisLotes();
    await aprovarPrevia(prisma, { previaId: id, data: HOJE, criadoPor: POR });
    expect(await recusa(() => efetivarPrevia(prisma, criarM03Deps(prisma), { previaId: id, leiId: leiSuplementar, numeroDecreto: "D-21", data: HOJE, criadoPor: "prepara@cg.pb.gov.br" }))).toMatch(/EXECUTAR_CREDITO/);
    expect(await prisma.decretoCredito.count()).toBe(0);
  });
});
