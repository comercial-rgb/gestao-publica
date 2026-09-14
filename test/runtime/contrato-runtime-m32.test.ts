import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, criarPrismaDoPapelDeRuntime, exigirBanco } from "../banco.js";
import { limparBanco } from "../limpar-banco.js";
import { admitirServidor, baixarFinalidadeDependente, cadastrarCargo, cadastrarDependente, cadastrarLotacao, cadastrarServidor } from "../../modules/m32-pessoal/servico.js";
import { abrirFolha, cadastrarRubrica, cadastrarTabelaDeContribuicao, cadastrarTabelaIrrf, cadastrarTabelaSalarioFamilia, calcularFolha, fecharFolha } from "../../modules/m33-folha/servico.js";

/**
 * ═══ O DEPENDENTE ENCERRADO COM HISTÓRICO, PELO PAPEL DE RUNTIME (V7 M1 U2) ═══
 *
 * O DONO só limpa e cria as linhas que nenhuma tela cria (pessoa, conta sem perfil). TODO ATO de
 * negócio roda com a conexão `gestao_app` — a mesma conta, sem superusuário e sem posse, com que a
 * aplicação fala com o banco. Até V6.2 a baixa caía aqui em `permission denied for table
 * FinalidadeDependente` (log da reprodução no pacote V7 M1).
 *
 * Aceite do pedido: cadastro → uso na competência → encerramento → nova competência; folha antiga
 * intacta; repetição e concorrência sem dois encerramentos; acesso indevido recusado.
 */
const dono = criarPrismaDeTeste();
const app = criarPrismaDoPapelDeRuntime();
await exigirBanco(dono);
await exigirBanco(app);
afterAll(async () => { await dono.$disconnect(); await app.$disconnect(); });

const RH = "contabilidade@cg.pb.gov.br"; // fixture com as ações
const SEM_ACAO = "sem.baixa@cg.pb.gov.br";
const D = (a: number, m: number, d: number): Date => new Date(Date.UTC(a, m - 1, d, 12));
let finalidadeSf = "";
let finalidadeIr = "";
let vinculoId = "";
let maio = { folhaId: "", sha: "", memoria: "" };

async function contracheque(folhaId: string): Promise<{ readonly sha256: string; readonly memoria: unknown; readonly proventos: string }> {
  const f = await dono.fechamentoDaFolha.findUnique({ where: { folhaId }, select: { calculoId: true } });
  const calculoId = f?.calculoId ?? (await dono.calculoDaFolha.findFirstOrThrow({ where: { folhaId }, orderBy: { numero: "desc" }, select: { id: true } })).id;
  const c = await dono.contracheque.findUniqueOrThrow({ where: { calculoId_vinculoId: { calculoId, vinculoId } }, select: { sha256: true, memoria: true, totalProventos: true } });
  return { sha256: c.sha256, memoria: c.memoria, proventos: c.totalProventos.toFixed(2) };
}

beforeAll(async () => {
  await limparBanco(dono);
  await dono.usuario.create({ data: { identificador: SEM_ACAO, nome: "Sem a ação", criadoPor: "SEED" } });
  const pessoa = await dono.pessoa.create({ data: { documento: "11144477735", tipo: "FISICA", criadoPor: RH, versoes: { create: { nome: "Servidora do contrato", criadoPor: RH } } }, select: { id: true } });

  const { cargoId } = await cadastrarCargo(app, { codigo: "AUX", denominacao: "Auxiliar", tipo: "EFETIVO", vagasFixadas: 5, leiAutorizativa: "Lei 1/2010", dataPublicacaoLei: D(2010, 1, 1), criadoPor: RH });
  const { lotacaoId } = await cadastrarLotacao(app, { codigo: "ADM", nome: "Administração", criadoPor: RH });
  const { servidorId } = await cadastrarServidor(app, { pessoaId: pessoa.id, dataNascimento: D(1985, 1, 1), sexo: "FEMININO", criadoPor: RH });
  vinculoId = (await admitirServidor(app, { servidorId, matricula: "RT-1", tipo: "EFETIVO", regimeJuridico: "Estatutario", regimePrevidenciario: "RGPS", dataAdmissao: D(2026, 1, 1), cargoId, lotacaoId, salarioBase: "1500.00", criadoPor: RH })).vinculoId;
  await cadastrarDependente(app, { servidorId, nome: "Filho SF", dataNascimento: D(2020, 1, 1), grauParentesco: "FILHO", finalidade: "SALARIO_FAMILIA", dataInicio: D(2026, 1, 1), criadoPor: RH });
  await cadastrarDependente(app, { servidorId, nome: "Filho IR", dataNascimento: D(2021, 1, 1), grauParentesco: "FILHO", finalidade: "IMPOSTO_RENDA", dataInicio: D(2026, 1, 1), criadoPor: RH });
  finalidadeSf = (await dono.finalidadeDependente.findFirstOrThrow({ where: { finalidade: "SALARIO_FAMILIA" }, select: { id: true } })).id;
  finalidadeIr = (await dono.finalidadeDependente.findFirstOrThrow({ where: { finalidade: "IMPOSTO_RENDA" }, select: { id: true } })).id;

  await cadastrarTabelaDeContribuicao(app, { regime: "RGPS", competenciaInicio: "2026-01", teto: "8000.00", fundamentacaoLegal: "FIXTURE de teste", faixas: [{ ordem: 1, ate: null, aliquota: "0.075" }], criadoPor: RH });
  await cadastrarTabelaIrrf(app, { competenciaInicio: "2026-01", deducaoPorDependente: "200.00", fundamentacaoLegal: "FIXTURE de teste", faixas: [{ ordem: 1, ate: null, aliquota: "0" }], criadoPor: RH });
  await cadastrarTabelaSalarioFamilia(app, { competenciaInicio: "2026-01", rendaMaxima: "2000.00", valorPorDependente: "60.00", idadeLimite: 14, fundamentacaoLegal: "FIXTURE de teste", criadoPor: RH });
  const rubrica = (i: Parameters<typeof cadastrarRubrica>[1]) => cadastrarRubrica(app, i);
  await rubrica({ codigo: "VENC", descricao: "Vencimento", tipo: "PROVENTO", natureza: "VENCIMENTO_BASE", incideContribuicao: true, incideIrrf: true, proporcionalAosDias: true, ordem: 1, fundamentacaoLegal: "fixture", criadoPor: RH });
  await rubrica({ codigo: "SFAM", descricao: "Salário-família", tipo: "PROVENTO", natureza: "SALARIO_FAMILIA", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 50, fundamentacaoLegal: "fixture", criadoPor: RH });
  await rubrica({ codigo: "PREV", descricao: "Contribuição", tipo: "DESCONTO", natureza: "CONTRIBUICAO_PREVIDENCIARIA", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 90, fundamentacaoLegal: "fixture", criadoPor: RH });
  await rubrica({ codigo: "IRRF", descricao: "IRRF", tipo: "DESCONTO", natureza: "IMPOSTO_DE_RENDA", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 91, fundamentacaoLegal: "fixture", criadoPor: RH });

  // Maio: o dependente É usado (salário-família) e a folha é FECHADA — pelo runtime.
  const folhaMaio = (await abrirFolha(app, { competencia: "2026-05", criadoPor: RH })).folhaId;
  await calcularFolha(app, { folhaId: folhaMaio, criadoPor: RH });
  await fecharFolha(app, { folhaId: folhaMaio, criadoPor: RH });
  const c = await contracheque(folhaMaio);
  maio = { folhaId: folhaMaio, sha: c.sha256, memoria: JSON.stringify(c.memoria) };
}, 180_000);

describe("M32 × M33 pelo papel de runtime", () => {
  it("a conexão é do papel de runtime: não é superusuário, não é dona e não herda o dono", async () => {
    const [q] = await app.$queryRaw<{ cu: string; su: string; superuser: boolean; herda: boolean; dona: boolean }[]>`
      select current_user as cu, session_user as su,
        (select rolsuper from pg_roles where rolname = current_user) as superuser,
        pg_has_role(current_user, (select tableowner from pg_tables where tablename = 'FinalidadeDependente'), 'MEMBER') as herda,
        (select tableowner = current_user from pg_tables where tablename = 'FinalidadeDependente') as dona`;
    expect(q).toMatchObject({ cu: "gestao_app", su: "gestao_app", superuser: false, herda: false, dona: false });
  });

  it("o banco nega UPDATE na finalidade ao runtime — a baixa antiga NÃO voltaria a funcionar por acaso", async () => {
    await expect(app.$executeRaw`UPDATE "FinalidadeDependente" SET "motivoBaixa" = 'x' WHERE id = ${finalidadeSf}`).rejects.toThrow(/permission denied/);
  });

  it("maio usou o dependente: salário-família no contracheque fechado", async () => {
    expect(maio.memoria).toContain("Filho SF");
    expect((await contracheque(maio.folhaId)).proventos).toBe("1560.00");
  });

  it("NEGATIVA: conta sem a ação não encerra — nada gravado", async () => {
    await expect(baixarFinalidadeDependente(app, { finalidadeId: finalidadeSf, dataBaixa: D(2026, 6, 1), motivoBaixa: "Tentativa sem crachá", criadoPor: SEM_ACAO })).rejects.toThrow();
    expect(await dono.encerramentoDeFinalidadeDependente.count()).toBe(0);
  });

  it("CONCORRÊNCIA: duas baixas simultâneas — exatamente um encerramento; a outra recusa nomeando", async () => {
    const r = await Promise.allSettled([1, 2].map((n) => baixarFinalidadeDependente(app, { finalidadeId: finalidadeSf, dataBaixa: D(2026, 6, 1), motivoBaixa: `Emancipação registrada ${n}`, criadoPor: RH })));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(String((r.find((x) => x.status === "rejected") as PromiseRejectedResult).reason)).toMatch(/FINALIDADE-JA-BAIXADA/);
    expect(await dono.encerramentoDeFinalidadeDependente.count({ where: { finalidadeId: finalidadeSf } })).toBe(1);
    // O encerramento com efeito em junho não atinge maio (fechada) — e a coluna legada seguiu nula.
    const ok = (r.find((x) => x.status === "fulfilled") as PromiseFulfilledResult<{ competenciasFechadasAtingidas: readonly string[] }>).value;
    expect(ok.competenciasFechadasAtingidas).toEqual([]);
    expect((await dono.finalidadeDependente.findUniqueOrThrow({ where: { id: finalidadeSf }, select: { dataBaixa: true } })).dataBaixa).toBeNull();
  });

  it("REPETIÇÃO: encerrar de novo a mesma finalidade é recusado", async () => {
    await expect(baixarFinalidadeDependente(app, { finalidadeId: finalidadeSf, dataBaixa: D(2026, 7, 1), motivoBaixa: "Segunda tentativa", criadoPor: RH })).rejects.toThrow(/FINALIDADE-JA-BAIXADA/);
  });

  it("NOVA COMPETÊNCIA: julho calcula SEM o dependente encerrado; maio fechado continua idêntico (sha256 e memória)", async () => {
    const julho = (await abrirFolha(app, { competencia: "2026-07", criadoPor: RH })).folhaId;
    await calcularFolha(app, { folhaId: julho, criadoPor: RH });
    const cj = await contracheque(julho);
    expect(cj.proventos).toBe("1500.00");
    expect(JSON.stringify(cj.memoria)).not.toMatch(/"valor":\s*"60\.00"/);
    const cm = await contracheque(maio.folhaId);
    expect(cm.sha256).toBe(maio.sha);
    expect(JSON.stringify(cm.memoria)).toBe(maio.memoria);
  });

  it("RETROATIVO: encerrar com efeito anterior a maio é gravado e NOMEIA a competência fechada atingida", async () => {
    const r = await baixarFinalidadeDependente(app, { finalidadeId: finalidadeIr, dataBaixa: D(2026, 4, 30), motivoBaixa: "Decisão judicial com efeito retroativo", criadoPor: RH });
    expect(r.competenciasFechadasAtingidas).toEqual(["2026-05"]);
    expect((await contracheque(maio.folhaId)).sha256).toBe(maio.sha);
  });
});
