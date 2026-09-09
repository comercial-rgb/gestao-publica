import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { autenticar, definirSenha, revogarSessao, validarSessao } from "./autenticacao.js";
import { criarM02Deps } from "../m02-planejamento/adapter-prisma.js";
import { reprevisarReceita } from "../m02-planejamento/servico.js";

/**
 * A BORDA DE SESSÃO — o FLUXO que `lib/portas/sessao.ts` liga (a porta em si usa cookies/headers do
 * Next e não roda no vitest; aqui provamos a cadeia que ela orquestra, sobre o domínio pronto):
 *   autenticar → token → validarSessao → identificador → criadoPor que o FUNIL aceita.
 *   sessão inválida/revogada BARRA; trocar senha revoga as outras.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const IDENT = "orcamento@cg.pb.gov.br"; // usuário de fixtures (ADMIN — pode reprevisar)
const SENHA = "SenhaForte#2026";
const N_IPTU = "11121101";

async function semear(): Promise<string> {
  await limparBanco(prisma); // cria os usuários de fixtures (com ADMIN), sem credencial
  await prisma.naturezaReceita.create({ data: { id: "nr-iptu", codigo: N_IPTU, descricao: "IPTU" } });
  await prisma.fonteRecurso.create({ data: { id: "fnt-500", codigo: "500", descricao: "Livre", codigoTce: "500" } });
  await prisma.exercicio.upsert({ where: { ano: 2026 }, update: {}, create: { ano: 2026, criadoPor: "TESTE" } });
  const u = await prisma.usuario.findUniqueOrThrow({ where: { identificador: IDENT }, select: { id: true } });
  await definirSenha(prisma, { usuarioId: u.id, senha: SENHA, criadoPor: "TESTE" });
  return u.id;
}

let usuarioId: string;
describe("M16 — a borda de sessão (fluxo login → criadoPor → funil)", () => {
  beforeEach(async () => {
    usuarioId = await semear();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("t1: sessão VÁLIDA injeta o criadoPor que o funil ACEITA (reprevisão passa)", async () => {
    const sessao = await autenticar(prisma, { identificador: IDENT, senha: SENHA });
    const ident = await validarSessao(prisma, sessao.token);
    expect(ident.identificador).toBe(IDENT);

    // o criadoPor da escrita é o identificador da sessão — e o funil/autz o aceita.
    const id = await reprevisarReceita(
      { exercicio: 2026, naturezaReceita: N_IPTU, fonte: "500", tipoReceita: "ORCAMENTARIA", valorAjuste: "10000.00", motivo: "reestimativa autenticada", data: new Date("2026-03-01T12:00:00Z"), criadoPor: ident.identificador },
      criarM02Deps(prisma)
    );
    expect(id).toBeTruthy();
  });

  it("t2: token FORJADO/INVÁLIDO barra (fail-closed)", async () => {
    await expect(validarSessao(prisma, "token-que-nunca-existiu")).rejects.toThrow(/SESSÃO INVÁLIDA/);
  });

  it("t3: LOGOUT (revogação) derruba a sessão — validar depois barra", async () => {
    const sessao = await autenticar(prisma, { identificador: IDENT, senha: SENHA });
    await revogarSessao(prisma, { token: sessao.token, motivo: "Logout", criadoPor: IDENT });
    await expect(validarSessao(prisma, sessao.token)).rejects.toThrow(/SESSÃO REVOGADA/);
  });

  it("t4: TROCAR SENHA revoga as OUTRAS sessões (o ladrão perde o token que já tinha)", async () => {
    const antiga = await autenticar(prisma, { identificador: IDENT, senha: SENHA });
    await validarSessao(prisma, antiga.token); // viva antes

    // troca de senha → derruba as sessões vigentes.
    const r = await definirSenha(prisma, { usuarioId, senha: "OutraSenha#2026", criadoPor: "TESTE" });
    expect(r.sessoesRevogadas).toBeGreaterThanOrEqual(1);
    await expect(validarSessao(prisma, antiga.token)).rejects.toThrow(/SESSÃO REVOGADA/);
  });
});
