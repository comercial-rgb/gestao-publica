import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { toMoney } from "../../packages/contracts/index.js";
import { meioDiaCivil } from "../../packages/datas/index.js";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { admitirServidor, cadastrarCargo, cadastrarLotacao, cadastrarServidor } from "../m32-pessoal/servico.js";
import { abrirFolha, cadastrarRubrica, cadastrarTabelaDeContribuicao, cadastrarTabelaIrrf, calcularFolha, fecharFolha, lancarNaFolha } from "./servico.js";
import {
  ApropriacaoInterrompidaError,
  FolhaNaoFechadaError,
  SemGrupoDeEmpenhoError,
  apropriacaoDaFolha,
  apropriarFolha,
  cadastrarGrupoDeEmpenhoDaFolha,
  numeroDoEmpenhoDaFolha,
} from "./apropriacao.js";

/**
 * ═══ A APROPRIAÇÃO CONTÁBIL DA FOLHA (V6 P2.3b; TR 5.12.71) — PROFUNDIDADE ═══
 *
 * A folha fechada vira DESPESA pelo caminho de sempre: o `empenhar` do M05, com o roteiro
 * contábil, o saldo da ficha travado e o exercício conferido. Nada aqui reimplementa despesa.
 *
 * FIXTURE N=2: dois servidores, duas rubricas de provento em dois grupos (um por servidor, um
 * único para o grupo), duas fichas.
 *
 * O que este arquivo existe para impedir:
 *  · que o LÍQUIDO seja empenhado no lugar do BRUTO — empenhar o líquido esconderia da despesa a
 *    parte retida, e o empenhado do ente ficaria menor do que a folha custou;
 *  · que reexecutar a apropriação DUPLIQUE a despesa (é o que a numeração determinística impede);
 *  · que uma folha ainda ABERTA vire empenho;
 *  · que uma rubrica de provento sem grupo passe em silêncio — empenharia menos do que se paga;
 *  · que a falta de saldo apague os empenhos que já tinham dado certo.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const POR = "contabilidade@cg.pb.gov.br"; // fixture com todas as ações
const SEM_PODER = "estagiario.rh@cg.pb.gov.br";
const D = (a: number, m: number, d: number): Date => meioDiaCivil(`${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
const FICHA = "ficha-folha";
const FICHA_MINGUADA = "ficha-curta";
const DATA_EMPENHO = D(2026, 5, 30);

let folhaId = "";
let rubricaVenc = "";
let rubricaGrat = "";
let rubricaHext = "";
let rubricaPrev = "";
let credorId = "";

async function pessoa(documento: string, nome: string): Promise<string> {
  const p = await prisma.pessoa.create({ data: { documento, tipo: "FISICA", criadoPor: POR, versoes: { create: { nome, criadoPor: POR } } }, select: { id: true } });
  return p.id;
}

async function semear(): Promise<void> {
  await limparBanco(prisma);

  // ── o plano de contas que o roteiro do empenho exige (fail-closed: sem ele, não se empenha) ──
  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-disp", codigo: "6.2.2.1.1.00.00", nome: "Crédito disponível", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-emp", codigo: "6.2.2.1.3.01.00", nome: "Crédito empenhado a liquidar", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-ddr", codigo: "8.2.1.1.1.00.00", nome: "DDR disponível", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-ddr-emp", codigo: "8.2.1.1.2.01.00", nome: "DDR comprometida por empenho", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      // V6.1 — as duas contas patrimoniais que o GRUPO declara para a sua liquidação.
      { id: "c-vpd-pessoal", codigo: "3.1.1.1.1.01.00", nome: "Vencimentos e vantagens fixas - pessoal civil", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-pessoal-pagar", codigo: "2.1.1.1.1.01.01", nome: "Salarios, remuneracoes e beneficios", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
    ],
  });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({ data: { id: "uo-01", codigo: "01001", descricao: "Administração", orgaoId: "org-01" } });
  await prisma.funcao.create({ data: { id: "fun-04", codigo: "04", nome: "Administração" } });
  await prisma.subfuncao.create({ data: { id: "sub-122", codigo: "122", nome: "Adm" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0004", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.createMany({
    data: [
      { id: "nd-11", codCategoria: "3", codNatureza: "1", codModalidade: "90", codElemento: "11", codigoCompleto: "319011", descricao: "Vencimentos e vantagens fixas" },
      // ⚠️ A SEGUNDA FICHA PRECISA DE OUTRA DIMENSÃO: a unicidade da ficha é a TUPLA
      // (exercício, unidade, função, subfunção, programa, ação, natureza, fonte) — duas fichas
      // idênticas com números diferentes não existem, e é assim que o M02 impede a ficha duplicada.
      { id: "nd-13", codCategoria: "3", codNatureza: "1", codModalidade: "90", codElemento: "13", codigoCompleto: "319013", descricao: "Obrigações patronais" },
    ],
  });
  await prisma.fonteRecurso.create({ data: { id: "fonte-500", codigo: "500", descricao: "Livre", codigoTce: "500" } });
  const base = { exercicio: 2026, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-04", subfuncaoId: "sub-122", programaId: "prg", acaoId: "aca", fonteId: "fonte-500", naturezaDespesaId: "nd-11" };
  await criarFichaDeTeste(prisma, { ...base, id: FICHA, numero: 1, valorDotado: "500000.00" });
  await criarFichaDeTeste(prisma, { ...base, id: FICHA_MINGUADA, numero: 2, naturezaDespesaId: "nd-13", valorDotado: "100.00" });

  // ── o pessoal: dois servidores ──
  const { cargoId } = await cadastrarCargo(prisma, { codigo: "PROF", denominacao: "Professor", tipo: "EFETIVO", vagasFixadas: 5, leiAutorizativa: "Lei 1/2010", dataPublicacaoLei: D(2010, 1, 1), criadoPor: POR });
  const { lotacaoId } = await cadastrarLotacao(prisma, { codigo: "SEDUC", nome: "Educacao", criadoPor: POR });
  const p1 = await pessoa("11144477735", "Ana Servidora");
  const p2 = await pessoa("52998224725", "Bia Servidora");
  credorId = await pessoa("39053344705", "Sindicato dos Servidores");
  const { servidorId: s1 } = await cadastrarServidor(prisma, { pessoaId: p1, dataNascimento: D(1985, 7, 20), sexo: "FEMININO", criadoPor: POR });
  const { servidorId: s2 } = await cadastrarServidor(prisma, { pessoaId: p2, dataNascimento: D(1990, 3, 10), sexo: "FEMININO", criadoPor: POR });
  const v1 = (await admitirServidor(prisma, { servidorId: s1, matricula: "MAT-A", tipo: "EFETIVO", regimeJuridico: "Estatutario", regimePrevidenciario: "RGPS", dataAdmissao: D(2026, 1, 1), cargoId, lotacaoId, salarioBase: "3000.00", criadoPor: POR })).vinculoId;
  await admitirServidor(prisma, { servidorId: s2, matricula: "MAT-B", tipo: "EFETIVO", regimeJuridico: "Estatutario", regimePrevidenciario: "RGPS", dataAdmissao: D(2026, 1, 1), cargoId, lotacaoId, salarioBase: "2000.00", criadoPor: POR });

  // ── as tabelas e as rubricas ──
  await cadastrarTabelaDeContribuicao(prisma, { regime: "RGPS", competenciaInicio: "2026-01", teto: "8000.00", fundamentacaoLegal: "FIXTURE de teste", faixas: [{ ordem: 1, ate: null, aliquota: "0.10" }], criadoPor: POR });
  await cadastrarTabelaIrrf(prisma, { competenciaInicio: "2026-01", deducaoPorDependente: "200.00", fundamentacaoLegal: "FIXTURE de teste", faixas: [{ ordem: 1, ate: "10000.00", aliquota: "0" }, { ordem: 2, ate: null, aliquota: "0.15", parcelaADeduzir: "1500.00" }], criadoPor: POR });
  rubricaVenc = (await cadastrarRubrica(prisma, { codigo: "VENC", descricao: "Vencimento", tipo: "PROVENTO", natureza: "VENCIMENTO_BASE", incideContribuicao: true, incideIrrf: true, proporcionalAosDias: true, ordem: 1, fundamentacaoLegal: "fixture", criadoPor: POR })).rubricaId;
  rubricaGrat = (await cadastrarRubrica(prisma, { codigo: "GRAT", descricao: "Gratificações", tipo: "PROVENTO", natureza: "GRATIFICACOES_DO_VINCULO", incideContribuicao: true, incideIrrf: true, proporcionalAosDias: false, ordem: 2, fundamentacaoLegal: "fixture", criadoPor: POR })).rubricaId;
  rubricaHext = (await cadastrarRubrica(prisma, { codigo: "HEXT", descricao: "Horas extras", tipo: "PROVENTO", natureza: "VALOR_INFORMADO", incideContribuicao: true, incideIrrf: true, proporcionalAosDias: false, ordem: 3, fundamentacaoLegal: "fixture", criadoPor: POR })).rubricaId;
  rubricaPrev = (await cadastrarRubrica(prisma, { codigo: "PREV", descricao: "Contribuicao", tipo: "DESCONTO", natureza: "CONTRIBUICAO_PREVIDENCIARIA", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 90, fundamentacaoLegal: "fixture", criadoPor: POR })).rubricaId;
  await cadastrarRubrica(prisma, { codigo: "IRRF", descricao: "IRRF", tipo: "DESCONTO", natureza: "IMPOSTO_DE_RENDA", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 91, fundamentacaoLegal: "fixture", criadoPor: POR });
  await lancarNaFolha(prisma, { vinculoId: v1, rubricaId: rubricaHext, tipo: "VARIAVEL", competenciaInicio: "2026-05", valor: "500.00", criadoPor: POR });

  folhaId = (await abrirFolha(prisma, { competencia: "2026-05", criadoPor: POR })).folhaId;
  await calcularFolha(prisma, { folhaId, criadoPor: POR });
}

/** O grupo padrão: vencimento e gratificações, POR SERVIDOR, na ficha cheia. */
async function grupoPorServidor(fichaId = FICHA): Promise<string> {
  return (
    await cadastrarGrupoDeEmpenhoDaFolha(prisma, {
      codigo: "FOLHA-VENC", descricao: "Vencimentos e vantagens fixas", fichaId,
      categoriaOrdemCronologica: "PRESTACAO_SERVICOS", tipoEmpenho: "ORDINARIO", serie: "FP",
      porServidor: true, contaVariacaoId: "c-vpd-pessoal", contaObrigacaoId: "c-pessoal-pagar", rubricaIds: [rubricaVenc, rubricaGrat], criadoPor: POR,
    })
  ).grupoId;
}

beforeEach(semear);


/** V22: o número gravado é numérico (SAGRES); a identidade do documento mora na reserva do numerador. */
async function identidadeDoNumero(numero: string, especie: "EMPENHO" | "LIQUIDACAO" = "EMPENHO"): Promise<string> {
  expect(numero).toMatch(/^\d{1,7}$/);
  const r = await prisma.numeroReservado.findFirstOrThrow({ where: { numero, especie }, select: { chave: true } });
  return r.chave.slice(r.chave.indexOf("|") + 1);
}

describe("(1) o cadastro do grupo — o que ele recusa, e por quê", () => {
  it("recusa rubrica de DESCONTO: desconto é retenção do pagamento, não despesa orçamentária", async () => {
    await expect(
      cadastrarGrupoDeEmpenhoDaFolha(prisma, { codigo: "X", descricao: "Errado", fichaId: FICHA, categoriaOrdemCronologica: "PRESTACAO_SERVICOS", tipoEmpenho: "ORDINARIO", serie: "FP", porServidor: true, contaVariacaoId: "c-vpd-pessoal", contaObrigacaoId: "c-pessoal-pagar", rubricaIds: [rubricaVenc, rubricaPrev], criadoPor: POR })
    ).rejects.toThrow(/RUBRICA-DE-DESCONTO-NO-GRUPO: PREV/);
    expect(await prisma.grupoDeEmpenhoDaFolha.count()).toBe(0);
  });

  it("recusa a rubrica que JÁ está em outro grupo, nomeando o grupo — em dois, a verba viraria despesa duas vezes", async () => {
    await grupoPorServidor();
    await expect(
      cadastrarGrupoDeEmpenhoDaFolha(prisma, { codigo: "OUTRO", descricao: "Outro", fichaId: FICHA, categoriaOrdemCronologica: "PRESTACAO_SERVICOS", tipoEmpenho: "ORDINARIO", serie: "FQ", porServidor: true, contaVariacaoId: "c-vpd-pessoal", contaObrigacaoId: "c-pessoal-pagar", rubricaIds: [rubricaVenc], criadoPor: POR })
    ).rejects.toThrow(/RUBRICA-JA-EM-OUTRO-GRUPO: VENC \(no grupo FOLHA-VENC\)/);
  });

  it("empenho único EXIGE credor, e empenho por servidor o PROÍBE — ignorar em silêncio seria pior", async () => {
    await expect(
      cadastrarGrupoDeEmpenhoDaFolha(prisma, { codigo: "U", descricao: "Único sem credor", fichaId: FICHA, categoriaOrdemCronologica: "PRESTACAO_SERVICOS", tipoEmpenho: "GLOBAL", serie: "FU", porServidor: false, contaVariacaoId: "c-vpd-pessoal", contaObrigacaoId: "c-pessoal-pagar", rubricaIds: [rubricaVenc], criadoPor: POR })
    ).rejects.toThrow(/precisa de um credor declarado/);
    await expect(
      cadastrarGrupoDeEmpenhoDaFolha(prisma, { codigo: "S", descricao: "Por servidor com credor", fichaId: FICHA, categoriaOrdemCronologica: "PRESTACAO_SERVICOS", tipoEmpenho: "ORDINARIO", serie: "FS", porServidor: true, credorId, contaVariacaoId: "c-vpd-pessoal", contaObrigacaoId: "c-pessoal-pagar", rubricaIds: [rubricaVenc], criadoPor: POR })
    ).rejects.toThrow(/o credor é o CPF de cada servidor/);
  });

  it("sem a ação, não cadastra grupo — e nada é gravado", async () => {
    await prisma.usuario.upsert({ where: { identificador: SEM_PODER }, update: {}, create: { identificador: SEM_PODER, nome: "Estagiario", criadoPor: "TESTE" } });
    await expect(
      // ⚠️ A ENTRADA É VÁLIDA DE PROPÓSITO: com `descricao: "Z"` quem recusaria seria o Zod, e o
      // teste passaria sem nunca ter exercitado a permissão — verde por outro motivo.
      cadastrarGrupoDeEmpenhoDaFolha(prisma, { codigo: "Z", descricao: "Grupo do estagiario", fichaId: FICHA, categoriaOrdemCronologica: "PRESTACAO_SERVICOS", tipoEmpenho: "ORDINARIO", serie: "FZ", porServidor: true, contaVariacaoId: "c-vpd-pessoal", contaObrigacaoId: "c-pessoal-pagar", rubricaIds: [rubricaVenc], criadoPor: SEM_PODER })
    ).rejects.toThrow(/CADASTRAR_GRUPO_DE_EMPENHO_DA_FOLHA/);
    expect(await prisma.grupoDeEmpenhoDaFolha.count()).toBe(0);
  });
});

describe("(2) apropriar — a folha fechada vira despesa", () => {
  it("recusa a folha ABERTA: o cálculo vivo ainda pode ser cancelado", async () => {
    await grupoPorServidor();
    await expect(apropriarFolha(prisma, { folhaId, dataDoEmpenho: DATA_EMPENHO, criadoPor: POR })).rejects.toThrow(FolhaNaoFechadaError);
    expect(await prisma.empenho.count()).toBe(0);
  });

  it("recusa quando uma rubrica de provento não está em grupo nenhum — empenharia MENOS do que a folha paga", async () => {
    await fecharFolha(prisma, { folhaId, criadoPor: POR });
    await grupoPorServidor(); // só VENC e GRAT; HEXT ficou de fora
    await expect(apropriarFolha(prisma, { folhaId, dataDoEmpenho: DATA_EMPENHO, criadoPor: POR })).rejects.toThrow(SemGrupoDeEmpenhoError);
    await expect(apropriarFolha(prisma, { folhaId, dataDoEmpenho: DATA_EMPENHO, criadoPor: POR })).rejects.toThrow(/HEXT/);
    expect(await prisma.empenho.count()).toBe(0);
  });

  it("⚠️ empenha o BRUTO, um por servidor, com o CPF de cada um e o número determinístico", async () => {
    await fecharFolha(prisma, { folhaId, criadoPor: POR });
    const grupo = await grupoPorServidor();
    await cadastrarGrupoDeEmpenhoDaFolha(prisma, { codigo: "FOLHA-HEXT", descricao: "Horas extras", fichaId: FICHA, categoriaOrdemCronologica: "PRESTACAO_SERVICOS", tipoEmpenho: "ORDINARIO", serie: "FH", porServidor: true, contaVariacaoId: "c-vpd-pessoal", contaObrigacaoId: "c-pessoal-pagar", rubricaIds: [rubricaHext], criadoPor: POR });

    const r = await apropriarFolha(prisma, { folhaId, dataDoEmpenho: DATA_EMPENHO, criadoPor: POR });
    expect(r.empenhados).toBe(3); // VENC de A e de B, HEXT de A
    expect(r.jaExistiam).toBe(0);

    const empenhos = await prisma.empenho.findMany({ orderBy: { numero: "asc" }, select: { numero: true, valor: true, credorCpfCnpj: true, historico: true, tipo: true, categoriaOrdemCronologica: true } });
    // V22: o número gravado é numérico; a identidade (o texto de antes) mora na reserva.
    const porIdentidade = new Map(await Promise.all(empenhos.map(async (e) => [await identidadeDoNumero(e.numero), e] as const)));
    expect([...porIdentidade.keys()].sort()).toEqual(["FH/2026-05/MAT-A", "FP/2026-05/MAT-A", "FP/2026-05/MAT-B"]);
    // ⚠️ O BRUTO, e não o líquido: Ana recebe 3.000 de vencimento (a contribuição de 350 e o
    // imposto NÃO saem da despesa — são retenções do pagamento).
    const daAna = porIdentidade.get("FP/2026-05/MAT-A")!;
    expect(daAna.valor.toFixed(2)).toBe("3000.00");
    expect(daAna.credorCpfCnpj).toBe("11144477735");
    expect(daAna.historico).toMatch(/Folha mensal de 2026-05 — Vencimentos e vantagens fixas, matrícula MAT-A/);
    expect(porIdentidade.get("FH/2026-05/MAT-A")!.valor.toFixed(2)).toBe("500.00");
    expect(porIdentidade.get("FP/2026-05/MAT-B")!.valor.toFixed(2)).toBe("2000.00");
    // ⚠️ V11 V9.3 — ESTA ASSERÇÃO MUDOU DE SENTIDO SEM MUDAR DE VALOR. Ela fixava só o formato;
    // agora, com o tipo entrando na composição, ela afirma a COMPATIBILIDADE PARA TRÁS: a folha
    // MENSAL continua produzindo byte a byte o mesmo número, e por isso todo empenho mensal já
    // gravado segue sendo reconhecido na reexecução. Se este valor mudar, a idempotência quebrou
    // para trás — que é pior que a colisão que a mudança conserta.
    expect(numeroDoEmpenhoDaFolha("FP", "2026-05", "MAT-A", "MENSAL")).toBe("FP/2026-05/MAT-A");

    // O elo, e a leitura que o detalhe da folha mostra.
    const lida = await apropriacaoDaFolha(prisma, folhaId);
    expect(lida?.empenhos).toHaveLength(3);
    expect(lida?.total.toFixed(2)).toBe("5500.00");
    expect(await prisma.empenhoDaFolha.count({ where: { grupoId: grupo } })).toBe(2);

    // E a ficha: o empenhado bate com o bruto apropriado.
    const ficha = await prisma.fichaOrcamentaria.findUniqueOrThrow({ where: { id: FICHA }, select: { saldoEmpenhado: true } });
    expect(ficha.saldoEmpenhado.toFixed(2)).toBe("5500.00");
  });

  it("⚠️ REEXECUTAR NÃO DUPLICA: a numeração determinística reconhece os que já existem", async () => {
    await fecharFolha(prisma, { folhaId, criadoPor: POR });
    await grupoPorServidor();
    await cadastrarGrupoDeEmpenhoDaFolha(prisma, { codigo: "FOLHA-HEXT", descricao: "Horas extras", fichaId: FICHA, categoriaOrdemCronologica: "PRESTACAO_SERVICOS", tipoEmpenho: "ORDINARIO", serie: "FH", porServidor: true, contaVariacaoId: "c-vpd-pessoal", contaObrigacaoId: "c-pessoal-pagar", rubricaIds: [rubricaHext], criadoPor: POR });
    const primeira = await apropriarFolha(prisma, { folhaId, dataDoEmpenho: DATA_EMPENHO, criadoPor: POR });
    const segunda = await apropriarFolha(prisma, { folhaId, dataDoEmpenho: DATA_EMPENHO, criadoPor: POR });
    expect(primeira.empenhados).toBe(3);
    expect(segunda.empenhados).toBe(0);
    expect(segunda.jaExistiam).toBe(3);
    expect(await prisma.empenho.count()).toBe(3);
    expect((await prisma.fichaOrcamentaria.findUniqueOrThrow({ where: { id: FICHA }, select: { saldoEmpenhado: true } })).saldoEmpenhado.toFixed(2)).toBe("5500.00");
    // A apropriação continua sendo UMA (o ato não se repete; o que se repete é a tentativa).
    expect(await prisma.apropriacaoDaFolha.count({ where: { folhaId } })).toBe(1);
    expect(primeira.apropriacaoId).toBe(segunda.apropriacaoId);
  });

  it("grupo de empenho ÚNICO: um empenho para todos, com o credor declarado e a soma dos proventos", async () => {
    await fecharFolha(prisma, { folhaId, criadoPor: POR });
    await cadastrarGrupoDeEmpenhoDaFolha(prisma, { codigo: "FOLHA-UNICA", descricao: "Folha do mês", fichaId: FICHA, categoriaOrdemCronologica: "PRESTACAO_SERVICOS", tipoEmpenho: "GLOBAL", serie: "FG", porServidor: false, credorId, contaVariacaoId: "c-vpd-pessoal", contaObrigacaoId: "c-pessoal-pagar", rubricaIds: [rubricaVenc, rubricaGrat, rubricaHext], criadoPor: POR });
    const r = await apropriarFolha(prisma, { folhaId, dataDoEmpenho: DATA_EMPENHO, criadoPor: POR });
    expect(r.empenhados).toBe(1);
    const e = await prisma.empenho.findFirstOrThrow({ select: { numero: true, valor: true, credorCpfCnpj: true, tipo: true } });
    expect(await identidadeDoNumero(e.numero)).toBe("FG/2026-05/FOLHA-UNICA");
    expect(e.valor.toFixed(2)).toBe("5500.00"); // 3000 + 2000 + 500
    expect(e.credorCpfCnpj).toBe("39053344705");
    expect(e.tipo).toBe("GLOBAL");
  });

  it("⚠️ SEM SALDO: a apropriação para, DIZ onde parou, e os empenhos que já deram certo continuam", async () => {
    await fecharFolha(prisma, { folhaId, criadoPor: POR });
    // A ficha minguada tem 100,00 — o primeiro empenho (MAT-A, 3.000) já não cabe.
    await cadastrarGrupoDeEmpenhoDaFolha(prisma, { codigo: "FOLHA-VENC", descricao: "Vencimentos", fichaId: FICHA_MINGUADA, categoriaOrdemCronologica: "PRESTACAO_SERVICOS", tipoEmpenho: "ORDINARIO", serie: "FP", porServidor: true, contaVariacaoId: "c-vpd-pessoal", contaObrigacaoId: "c-pessoal-pagar", rubricaIds: [rubricaVenc, rubricaGrat], criadoPor: POR });
    await cadastrarGrupoDeEmpenhoDaFolha(prisma, { codigo: "A-HEXT", descricao: "Horas extras", fichaId: FICHA, categoriaOrdemCronologica: "PRESTACAO_SERVICOS", tipoEmpenho: "ORDINARIO", serie: "FH", porServidor: true, contaVariacaoId: "c-vpd-pessoal", contaObrigacaoId: "c-pessoal-pagar", rubricaIds: [rubricaHext], criadoPor: POR });

    const erro = await apropriarFolha(prisma, { folhaId, dataDoEmpenho: DATA_EMPENHO, criadoPor: POR }).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ApropriacaoInterrompidaError);
    const i = erro as ApropriacaoInterrompidaError;
    // O grupo A-HEXT vem antes na ordem alfabética e cabe; o FOLHA-VENC estoura na ficha curta.
    expect(i.feitos).toBe(1);
    expect(i.ondeParou).toMatch(/FOLHA-VENC \/ MAT-A/);
    expect(i.message).toMatch(/CONTINUAM válidos/);
    expect(await prisma.empenho.count()).toBe(1);
    expect((await apropriacaoDaFolha(prisma, folhaId))?.empenhos).toHaveLength(1);
  });

  it("sem a ação de apropriar, recusa — e o empenho não acontece nem pela porta de trás", async () => {
    await fecharFolha(prisma, { folhaId, criadoPor: POR });
    await grupoPorServidor();
    await prisma.usuario.upsert({ where: { identificador: SEM_PODER }, update: {}, create: { identificador: SEM_PODER, nome: "Estagiario", criadoPor: "TESTE" } });
    await expect(apropriarFolha(prisma, { folhaId, dataDoEmpenho: DATA_EMPENHO, criadoPor: SEM_PODER })).rejects.toThrow(/APROPRIAR_FOLHA/);
    expect(await prisma.empenho.count()).toBe(0);
    expect(await prisma.apropriacaoDaFolha.count()).toBe(0);
  });

  it("a folha sem apropriação lê `null` — a tela diz 'não apropriada' em vez de zero empenhos", async () => {
    expect(await apropriacaoDaFolha(prisma, folhaId)).toBeNull();
  });

  it("o total apropriado é o BRUTO da folha, e não o líquido — a diferença é a retenção", async () => {
    await fecharFolha(prisma, { folhaId, criadoPor: POR });
    await cadastrarGrupoDeEmpenhoDaFolha(prisma, { codigo: "FOLHA-UNICA", descricao: "Folha do mês", fichaId: FICHA, categoriaOrdemCronologica: "PRESTACAO_SERVICOS", tipoEmpenho: "GLOBAL", serie: "FG", porServidor: false, credorId, contaVariacaoId: "c-vpd-pessoal", contaObrigacaoId: "c-pessoal-pagar", rubricaIds: [rubricaVenc, rubricaGrat, rubricaHext], criadoPor: POR });
    const r = await apropriarFolha(prisma, { folhaId, dataDoEmpenho: DATA_EMPENHO, criadoPor: POR });
    const calculo = await prisma.calculoDaFolha.findFirstOrThrow({ where: { folhaId }, select: { totalProventos: true, totalLiquido: true } });
    expect(r.total.toFixed(2)).toBe(toMoney(calculo.totalProventos).toFixed(2));
    expect(r.total.gt(toMoney(calculo.totalLiquido))).toBe(true);
  });
});
