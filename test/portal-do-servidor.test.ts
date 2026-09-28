import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "./banco.js";
import { limparBanco } from "./limpar-banco.js";
import { meuContrachequePara, minhaFichaPara } from "../lib/portas/portal-do-servidor.js";
import { vincularPessoaAoUsuario, desvincularPessoaDoUsuario } from "../modules/m16-travamento/servico-pessoa-do-usuario.js";
import { admitirServidor, cadastrarCargo, cadastrarDependente, cadastrarLotacao, cadastrarServidor, registrarMovimentacao } from "../modules/m32-pessoal/servico.js";
import { abrirFolha, cadastrarRubrica, cadastrarTabelaDeContribuicao, cadastrarTabelaIrrf, calcularFolha, fecharFolha } from "../modules/m33-folha/servico.js";

/**
 * ═══ O PORTAL DO SERVIDOR (V6 P2.4) — O RECORTE É A PESSOA DA SESSÃO ═══
 *
 * FIXTURE N=2 em tudo o que importa: DUAS pessoas HOMÔNIMAS (o vínculo é pelo documento, nunca
 * pelo nome), DOIS servidores, DOIS usuários, DUAS folhas (uma fechada e uma aberta).
 *
 * O que este arquivo existe para impedir:
 *  · que o portal mostre a ficha de OUTRA pessoa — a porta não recebe id de servidor;
 *  · que o contracheque de outro servidor apareça ao pedir a folha certa com a conta errada;
 *  · que uma folha AINDA ABERTA vire comprovante na mão do servidor — o cálculo vivo pode ser
 *    cancelado e refeito, e o portal só mostra o que o fechamento congelou;
 *  · que o desvínculo do usuário deixe a ficha visível.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const RH = "contabilidade@cg.pb.gov.br"; // fixture com todas as ações
const ADMIN = "orcamento@cg.pb.gov.br";
const CPF_A = "11144477735";
const CPF_B = "52998224725";
const D = (a: number, m: number, d: number): Date => new Date(Date.UTC(a, m - 1, d, 12, 0, 0));

let usuarioA = "";
let usuarioB = "";
let usuarioSemPessoa = "";
let vinculoA = "";
let folhaFechada = "";
let folhaAberta = "";

async function pessoa(documento: string, nome: string): Promise<string> {
  const p = await prisma.pessoa.create({ data: { documento, tipo: "FISICA", criadoPor: RH, versoes: { create: { nome, criadoPor: RH } } }, select: { id: true } });
  return p.id;
}
/**
 * ⚠️ O USUÁRIO DA FIXTURE JÁ EXISTE (`test/usuarios-teste.ts` semeia-o a cada limpeza) — criar
 * de novo cai na unicidade do identificador. Reusar é o certo: identidade de teste não se
 * inventa, senão toda escrita cai em "USUÁRIO NÃO CADASTRADO" por outro motivo.
 */
async function usuario(identificador: string, nome: string): Promise<string> {
  const ja = await prisma.usuario.findUnique({ where: { identificador }, select: { id: true } });
  if (ja !== null) return ja.id;
  const u = await prisma.usuario.create({ data: { identificador, nome, criadoPor: ADMIN }, select: { id: true } });
  return u.id;
}

async function semear(): Promise<void> {
  await limparBanco(prisma);
  const { cargoId } = await cadastrarCargo(prisma, { codigo: "PROF", denominacao: "Professor", tipo: "EFETIVO", vagasFixadas: 5, leiAutorizativa: "Lei 1/2010", dataPublicacaoLei: D(2010, 1, 1), criadoPor: RH });
  const { lotacaoId } = await cadastrarLotacao(prisma, { codigo: "SEDUC", nome: "Educacao", criadoPor: RH });

  // ⚠️ HOMÔNIMAS: o vínculo usuário → pessoa é pelo DOCUMENTO. Se algum dia alguém o fizer por
  // nome, estas duas trocam de contracheque e este arquivo cai.
  const pessoaA = await pessoa(CPF_A, "Maria Souza");
  const pessoaB = await pessoa(CPF_B, "Maria Souza");
  const { servidorId: servA } = await cadastrarServidor(prisma, { pessoaId: pessoaA, dataNascimento: D(1985, 7, 20), sexo: "FEMININO", criadoPor: RH });
  const { servidorId: servB } = await cadastrarServidor(prisma, { pessoaId: pessoaB, dataNascimento: D(1990, 3, 10), sexo: "FEMININO", criadoPor: RH });
  vinculoA = (await admitirServidor(prisma, { servidorId: servA, matricula: "MAT-A", tipo: "EFETIVO", regimeJuridico: "Estatutario", regimePrevidenciario: "RGPS", dataAdmissao: D(2026, 1, 1), cargoId, lotacaoId, salarioBase: "3000.00", criadoPor: RH })).vinculoId;
  await admitirServidor(prisma, { servidorId: servB, matricula: "MAT-B", tipo: "EFETIVO", regimeJuridico: "Estatutario", regimePrevidenciario: "RGPS", dataAdmissao: D(2026, 1, 1), cargoId, lotacaoId, salarioBase: "9000.00", criadoPor: RH });
  await cadastrarDependente(prisma, { servidorId: servA, nome: "Filho de Maria", dataNascimento: D(2020, 1, 15), grauParentesco: "FILHO", finalidade: "SALARIO_FAMILIA", dataInicio: D(2026, 1, 1), criadoPor: RH });

  usuarioA = await usuario("maria.a@cg.pb.gov.br", "Maria A");
  usuarioB = await usuario("maria.b@cg.pb.gov.br", "Maria B");
  usuarioSemPessoa = await usuario("integracao@cg.pb.gov.br", "Conta de integracao");

  // As tabelas do ente e as rubricas mínimas — valores sintéticos, conferíveis à mão.
  await cadastrarTabelaDeContribuicao(prisma, { regime: "RGPS", competenciaInicio: "2026-01", teto: "8000.00", fundamentacaoLegal: "FIXTURE de teste", faixas: [{ ordem: 1, ate: "1000.00", aliquota: "0.075" }, { ordem: 2, ate: null, aliquota: "0.09" }], criadoPor: RH });
  await cadastrarTabelaIrrf(prisma, { competenciaInicio: "2026-01", deducaoPorDependente: "200.00", fundamentacaoLegal: "FIXTURE de teste", faixas: [{ ordem: 1, ate: "2000.00", aliquota: "0" }, { ordem: 2, ate: null, aliquota: "0.15", parcelaADeduzir: "300.00" }], criadoPor: RH });
  await cadastrarRubrica(prisma, { codigo: "VENC", descricao: "Vencimento", tipo: "PROVENTO", natureza: "VENCIMENTO_BASE", incideContribuicao: true, incideIrrf: true, proporcionalAosDias: true, ordem: 1, fundamentacaoLegal: "fixture", criadoPor: RH });
  await cadastrarRubrica(prisma, { codigo: "PREV", descricao: "Contribuicao", tipo: "DESCONTO", natureza: "CONTRIBUICAO_PREVIDENCIARIA", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 90, fundamentacaoLegal: "fixture", criadoPor: RH });
  await cadastrarRubrica(prisma, { codigo: "IRRF", descricao: "IRRF", tipo: "DESCONTO", natureza: "IMPOSTO_DE_RENDA", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 91, fundamentacaoLegal: "fixture", criadoPor: RH });

  // Uma folha FECHADA (maio) e uma ABERTA (junho) — a segunda é o que o portal NÃO pode mostrar.
  folhaFechada = (await abrirFolha(prisma, { competencia: "2026-05", criadoPor: RH })).folhaId;
  await calcularFolha(prisma, { folhaId: folhaFechada, criadoPor: RH });
  await fecharFolha(prisma, { folhaId: folhaFechada, criadoPor: RH });
  folhaAberta = (await abrirFolha(prisma, { competencia: "2026-06", criadoPor: RH })).folhaId;
  await calcularFolha(prisma, { folhaId: folhaAberta, criadoPor: RH });
}

beforeEach(semear);

describe("minha ficha — sem id na entrada, o recorte é a pessoa da sessão", () => {
  it("usuário SEM vínculo com pessoa: a ficha diz pessoa nula e não vaza nada — nada é inferido do nome", async () => {
    const r = await minhaFichaPara({ usuarioId: usuarioSemPessoa, identificador: "integracao@cg.pb.gov.br" });
    expect(r.pessoa).toBeNull();
    expect(r.semFicha).toBe(false);
    expect(r.vinculos).toEqual([]);
    expect(r.contracheques).toEqual([]);
  });

  it("pessoa vinculada SEM ficha de servidor: diz semFicha, com o nome certo, e nenhuma matrícula", async () => {
    const semServidor = await pessoa("39053344705", "Fornecedor Pessoa Fisica");
    const u = await usuario("fornecedor@cg.pb.gov.br", "Fornecedor");
    await vincularPessoaAoUsuario(prisma, { usuarioId: u, documento: "39053344705", motivo: "é o fornecedor", criadoPor: ADMIN });
    void semServidor;
    const r = await minhaFichaPara({ usuarioId: u, identificador: "fornecedor@cg.pb.gov.br" });
    expect(r.semFicha).toBe(true);
    expect(r.pessoa?.nome).toBe("Fornecedor Pessoa Fisica");
    expect(r.vinculos).toEqual([]);
  });

  it("⚠️ HOMÔNIMAS (N=2): a ficha é a da pessoa do DOCUMENTO vinculado, e a da outra Maria não aparece", async () => {
    await vincularPessoaAoUsuario(prisma, { usuarioId: usuarioA, documento: CPF_A, motivo: "é a servidora", criadoPor: ADMIN });
    await vincularPessoaAoUsuario(prisma, { usuarioId: usuarioB, documento: CPF_B, motivo: "é a outra servidora", criadoPor: ADMIN });
    const a = await minhaFichaPara({ usuarioId: usuarioA, identificador: "maria.a@cg.pb.gov.br" });
    const b = await minhaFichaPara({ usuarioId: usuarioB, identificador: "maria.b@cg.pb.gov.br" });
    expect(a.vinculos.map((v) => v.matricula)).toEqual(["MAT-A"]);
    expect(b.vinculos.map((v) => v.matricula)).toEqual(["MAT-B"]);
    expect(a.vinculos[0]).toMatchObject({ situacao: "ativo", cargo: "PROF — Professor", lotacao: "SEDUC — Educacao", salarioBase: "3000.00", regimePrevidenciario: "RGPS" });
    expect(a.dependentes.map((d) => d.nome)).toEqual(["Filho de Maria"]);
    expect(b.dependentes).toEqual([]);
  });

  it("a ficha deriva cargo e situação de HOJE: depois do afastamento, a situação muda sem coluna nenhuma", async () => {
    await vincularPessoaAoUsuario(prisma, { usuarioId: usuarioA, documento: CPF_A, motivo: "é a servidora", criadoPor: ADMIN });
    await registrarMovimentacao(prisma, { vinculoId: vinculoA, tipo: "AFASTAMENTO", data: D(2026, 2, 1), motivo: "licenca", criadoPor: RH });
    const r = await minhaFichaPara({ usuarioId: usuarioA, identificador: "maria.a@cg.pb.gov.br" });
    expect(r.vinculos[0]?.situacao).toBe("afastado");
  });

  it("desvinculada a pessoa, a ficha some — o portal não guarda o que a sessão deixou de ser", async () => {
    await vincularPessoaAoUsuario(prisma, { usuarioId: usuarioA, documento: CPF_A, motivo: "é a servidora", criadoPor: ADMIN });
    expect((await minhaFichaPara({ usuarioId: usuarioA, identificador: "maria.a@cg.pb.gov.br" })).vinculos).toHaveLength(1);
    await desvincularPessoaDoUsuario(prisma, { usuarioId: usuarioA, motivo: "saiu do quadro", criadoPor: ADMIN });
    const depois = await minhaFichaPara({ usuarioId: usuarioA, identificador: "maria.a@cg.pb.gov.br" });
    expect(depois.pessoa).toBeNull();
    expect(depois.contracheques).toEqual([]);
  });
});

describe("meus contracheques — só o que o fechamento congelou, e só o meu", () => {
  beforeEach(async () => {
    await vincularPessoaAoUsuario(prisma, { usuarioId: usuarioA, documento: CPF_A, motivo: "é a servidora", criadoPor: ADMIN });
    await vincularPessoaAoUsuario(prisma, { usuarioId: usuarioB, documento: CPF_B, motivo: "é a outra servidora", criadoPor: ADMIN });
  });

  it("a lista traz a folha FECHADA e NÃO a aberta — o cálculo vivo ainda pode ser cancelado", async () => {
    const r = await minhaFichaPara({ usuarioId: usuarioA, identificador: "maria.a@cg.pb.gov.br" });
    expect(r.contracheques.map((c) => c.competencia)).toEqual(["2026-05"]);
    // 3000 de vencimento: contribuição 1000x7,5% + 2000x9% = 255,00; base do IRRF 2745 → 15% − 300 = 111,75.
    expect(r.contracheques[0]).toMatchObject({ matricula: "MAT-A", proventos: "3000.00", descontos: "366.75", liquido: "2633.25" });
  });

  it("⚠️ pedir a folha CERTA com a conta ERRADA devolve o contracheque DE QUEM PEDE, nunca o do outro", async () => {
    const daA = await meuContrachequePara({ usuarioId: usuarioA, identificador: "maria.a@cg.pb.gov.br" }, folhaFechada);
    const daB = await meuContrachequePara({ usuarioId: usuarioB, identificador: "maria.b@cg.pb.gov.br" }, folhaFechada);
    expect(daA.map((c) => c.matricula)).toEqual(["MAT-A"]);
    expect(daB.map((c) => c.matricula)).toEqual(["MAT-B"]);
    expect(daA[0]?.totais.liquido).not.toBe(daB[0]?.totais.liquido);
    // O sha256 é o da memória daquele contracheque — dois servidores nunca compartilham o mesmo.
    expect(daA[0]?.sha256).not.toBe(daB[0]?.sha256);
    expect(daA[0]?.sha256).toHaveLength(64);
  });

  it("a folha ABERTA não entrega contracheque nenhum, nem para quem tem um nela", async () => {
    expect(await meuContrachequePara({ usuarioId: usuarioA, identificador: "maria.a@cg.pb.gov.br" }, folhaAberta)).toEqual([]);
  });

  it("o contracheque traz a CONTA de cada linha — é o que o servidor confere sem pedir relatório", async () => {
    const [c] = await meuContrachequePara({ usuarioId: usuarioA, identificador: "maria.a@cg.pb.gov.br" }, folhaFechada);
    expect(c?.linhas.map((l) => l.codigo).sort()).toEqual(["IRRF", "PREV", "VENC"]);
    expect(c?.linhas.find((l) => l.codigo === "VENC")?.memoria).toMatch(/vencimento-base vigente 3\.000,00/);
    expect(c?.linhas.find((l) => l.codigo === "PREV")?.memoria).toMatch(/faixas 1\.000,00×0\.0750 \+ 2\.000,00×0\.0900/);
  });

  it("usuário sem vínculo com pessoa não recebe contracheque de folha nenhuma", async () => {
    expect(await meuContrachequePara({ usuarioId: usuarioSemPessoa, identificador: "integracao@cg.pb.gov.br" }, folhaFechada)).toEqual([]);
  });
});
