import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarM04Deps } from "../m04-receita/adapter-prisma.js";
import { roteiroArrecadacao } from "../m04-receita/dominio.js";
import { registrarArrecadacao } from "../m04-receita/servico.js";
import { destravar } from "../m16-travamento/servico.js";
import { fecharCompetenciaConferida, situacaoDoFechamento } from "./fechamento-mensal.js";

/**
 * V32 — O FECHAMENTO MENSAL CONFERIDO.
 *
 * N=2 competências com guias (março e abril). Fechar março: março FECHADO, abril ABERTO; a guia com fato
 * em março é recusada pela trava, a de abril passa. Reabrir março com motivo: volta a ABERTO.
 * Divergência: uma partida avulsa (fora do motor) desequilibra o balancete de abril — fechar abril é
 * recusado nomeando a verificação, e nenhuma trava nasce.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const POR = "contabilidade@cg.pb.gov.br";
const LEITOR = "so.consulta.fechamento@cg.pb.gov.br";
const NAT = "11180111";
const CAIXA = "1.1.1.1.2.00.00";
const VPA = "4.1.1.2.1.01.00";
const R_A_REALIZAR = "6.2.1.1.0.00.00";
const R_REALIZADA = "6.2.1.2.0.00.00";
const ROTEIRO = roteiroArrecadacao({ disponibilidade: CAIXA, variacaoAumentativa: VPA, receitaARealizar: R_A_REALIZAR, receitaRealizada: R_REALIZADA });

let n = 0;
async function guia(data: string, criadoPor = POR): Promise<void> {
  n += 1;
  await registrarArrecadacao(
    { exercicio: 2026, naturezaReceita: NAT, fonte: "500", valor: "100.00", dataArrecadacao: new Date(`${data}T15:00:00Z`), numeroReceita: `G-${n}`, criadoPor },
    ROTEIRO,
    criarM04Deps(prisma)
  );
}

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-caixa", codigo: CAIXA, nome: "Bancos", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-vpa", codigo: VPA, nome: "VPA", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-rar", codigo: R_A_REALIZAR, nome: "Receita a realizar", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-rr", codigo: R_REALIZADA, nome: "Receita realizada", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
    ],
  });
  await prisma.naturezaReceita.create({ data: { id: "nr", codigo: NAT, descricao: "IPTU" } });
  await prisma.fonteRecurso.create({ data: { id: "f500", codigo: "500", descricao: "Livre", codigoTce: "500" } });
  const perfil = await prisma.perfil.create({
    data: { nome: "SO_CONSULTA_FECHAMENTO", descricao: "so consulta", criadoPor: POR, permissoes: { create: [{ acao: "CONSULTAR_CONTABILIDADE", criadoPor: POR }] } },
    select: { id: true },
  });
  const u = await prisma.usuario.create({ data: { identificador: LEITOR, nome: LEITOR, criadoPor: POR }, select: { id: true } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: perfil.id, criadoPor: POR } });
}

const situacao = async (competencia: string): Promise<string> =>
  (await situacaoDoFechamento(prisma, 2026)).find((m) => m.competencia === competencia)!.situacao;

describe("V32 — fechar o mês pela tela, depois de conferir", () => {
  beforeEach(semear);

  it("t1: N=2 meses — fechar março tranca só março; reabrir com motivo devolve", async () => {
    await guia("2026-03-10");
    await guia("2026-04-10");
    const r = await fecharCompetenciaConferida(prisma, { competencia: "2026-03", criadoPor: POR });
    expect(r.verificacoes.some((v) => v.chave === "BALANCETE_FECHA" && v.resultado === "OK")).toBe(true);
    expect(await situacao("2026-03")).toBe("FECHADO");
    expect(await situacao("2026-04")).toBe("ABERTO");

    await expect(guia("2026-03-20")).rejects.toThrow(/COMPETÊNCIA TRAVADA/);
    await guia("2026-04-20");

    await destravar(prisma, { competencia: "2026-03", motivo: "Correção da guia de março autorizada pelo controle interno", criadoPor: POR });
    expect(await situacao("2026-03")).toBe("ABERTO");
    await guia("2026-03-20");
  });

  it("t2: balancete que não fecha — recusa nomeando a verificação e a diferença, e nenhuma trava nasce", async () => {
    await guia("2026-04-10");
    const l = await prisma.lancamentoContabil.findFirstOrThrow({ select: { id: true } });
    // Partida avulsa, fora do motor: só um banco adulterado chega aqui — é o que a conferência existe para acusar.
    await prisma.partidaContabil.create({ data: { lancamentoId: l.id, contaId: "c-caixa", tipo: "DEBITO", valor: "7.00", subsistema: "PATRIMONIAL" } });
    await expect(fecharCompetenciaConferida(prisma, { competencia: "2026-04", criadoPor: POR })).rejects.toThrow(/2026-04 não foi fechado[\s\S]*Balancete fecha[\s\S]*diferença 7\.00/);
    expect(await prisma.movimentoTravamento.count()).toBe(0);
    expect(await situacao("2026-04")).toBe("ABERTO");
  });

  it("t3: quem só consulta não fecha — recusa nomeando a ação, sem conferir nem travar", async () => {
    await expect(fecharCompetenciaConferida(prisma, { competencia: "2026-03", criadoPor: LEITOR })).rejects.toThrow(/TRAVAR_COMPETENCIA/);
    await expect(fecharCompetenciaConferida(prisma, { competencia: "2026-13", criadoPor: POR })).rejects.toThrow(/inválida/);
    expect(await prisma.movimentoTravamento.count()).toBe(0);
  });
});
