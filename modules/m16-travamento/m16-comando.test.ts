import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { semearPcasp } from "../../prisma/seed/pcasp.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { empenhar } from "../m05-despesa/servico.js";
import { roteiroEmpenho } from "../m01-core-contabil/roteiros.js";
import { exigirAcaoEmAlgumEscopo } from "./autorizacao.js";
import {
  ComandoEmAndamentoError,
  ComandoEmConflitoError,
  ComandoJaConcluidoError,
  ComandoRetomadoError,
  ComandoSemChaveError,
  comoComandoCorrente,
  comOperacaoRegistrada,
  concluirComandoNaTransacao,
  criarRegistroDeOperacaoPrisma,
  PRAZO_DE_ABANDONO_MS,
  type FalhaDeTelemetria,
  type RegistroDeOperacaoPort,
} from "./operacao.js";

/**
 * ═══ O CONTRATO DE COMANDO (sessão noturna V4, 3) — os cenários da auditoria, com a
 * expectativa CORRETA e banco real ═══
 *
 * A auditoria do snapshot 77cbcc9 reproduziu, com portas em memória, seis fragilidades do
 * envelope (achados A01, A02, A03). Aqui cada cenário vira regressão contra o Postgres — com
 * DUAS CONEXÕES quando o cenário é de concorrência, porque duas Promises sobre uma porta
 * falsa não provam exclusão mútua no banco. Os asserts afirmam o comportamento que o
 * contrato exige, não o defeito observado; e cada um mostra os FATOS e a AUDITORIA
 * persistidos, não só o erro que subiu.
 */

const prisma = criarPrismaDeTeste();
const prismaB = criarPrismaDeTeste(); // a SEGUNDA conexão — outro pool, outro backend do Postgres
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
  await prismaB.$disconnect();
});

const IDENT = "orcamento@cg.pb.gov.br"; // fixture ADMIN
const POR = IDENT;
const FONTE = "fnt-cmd";
const FICHA = "ficha-cmd";
const CREDOR = "12345678000199";
const R_EMPENHO = roteiroEmpenho();
const AGORA = new Date("2026-03-10T12:00:00Z");

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await semearPcasp(prisma);
  await prisma.orgao.create({ data: { id: "org-cmd", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({ data: { id: "uo-cmd", codigo: "01001", descricao: "Administração", orgaoId: "org-cmd" } });
  await prisma.funcao.create({ data: { id: "fun-cmd", codigo: "04", nome: "Administração" } });
  await prisma.subfuncao.create({ data: { id: "sub-cmd", codigo: "122", nome: "Adm" } });
  await prisma.programa.create({ data: { id: "prg-cmd", codigo: "0004", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca-cmd", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({
    data: { id: "nd-cmd", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Serviços" },
  });
  await prisma.fonteRecurso.create({ data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" } });
  await criarFichaDeTeste(prisma, {
    id: FICHA, numero: 1, exercicio: 2026, orgaoId: "org-cmd", unidadeOrcId: "uo-cmd",
    funcaoId: "fun-cmd", subfuncaoId: "sub-cmd", programaId: "prg-cmd", acaoId: "aca-cmd",
    naturezaDespesaId: "nd-cmd", fonteId: FONTE, valorDotado: "500000.00",
  });
}

function empenhoPor(db: typeof prisma, numero: string) {
  return () =>
    empenhar(
      {
        fichaId: FICHA, numero, tipo: "ORDINARIO", valor: "1000.00", data: new Date("2026-02-01T12:00:00Z"),
        credorCpfCnpj: CREDOR, historico: `empenho ${numero}`, categoriaOrdemCronologica: "PRESTACAO_SERVICOS",
        criadoPor: IDENT,
      },
      R_EMPENHO,
      criarM05Deps(db)
    );
}

/** Uma porta que FALHA nas primitivas pedidas — o instrumento da reprodução. */
function portaQueFalhaEm(fases: readonly ("CONCLUIDA" | "concluir")[]): RegistroDeOperacaoPort {
  const real = criarRegistroDeOperacaoPrisma(prisma);
  return {
    registrar: (op, agora) =>
      fases.includes(op.resultado as "CONCLUIDA") ? Promise.reject(new Error(`auditoria indisponível na fase ${op.resultado}`)) : real.registrar(op, agora),
    reservar: (p, agora) => real.reservar(p, agora),
    retomar: (p, agora) => real.retomar(p, agora),
    concluir: (p, agora) => (fases.includes("concluir") ? Promise.reject(new Error("reserva indisponível para concluir")) : real.concluir(p, agora)),
    liberar: (p, agora) => real.liberar(p, agora),
  };
}

const telemetria: FalhaDeTelemetria[] = [];
const captar = (f: FalhaDeTelemetria): void => {
  telemetria.push(f);
};

async function auditoria(acao: string): Promise<readonly string[]> {
  // ORDENADA POR NOME, nao por tempo: o SUCESSO do funil usa o relogio real e as demais linhas o `agora` do teste.
  const ops = await prisma.registroDeOperacao.findMany({ where: { acao } });
  return ops.map((o) => o.resultado).sort();
}

describe("A01 — duas requisições CONCORRENTES, duas conexões, UM efeito", () => {
  beforeEach(async () => {
    await semear();
    telemetria.length = 0;
  });

  it("t1: mesma chave e mesmo comando em duas conexões ao mesmo tempo: um empenho, uma reserva, e o perdedor recebe 'em andamento' ou 'já concluído'", async () => {
    const ctx = { usuarioIdent: IDENT, acao: "EMPENHAR", chave: "k-conc", fingerprint: "f-conc" };
    const [a, b] = await Promise.allSettled([
      comOperacaoRegistrada(criarRegistroDeOperacaoPrisma(prisma), ctx, empenhoPor(prisma, "NE-1"), AGORA, captar),
      comOperacaoRegistrada(criarRegistroDeOperacaoPrisma(prismaB), ctx, empenhoPor(prismaB, "NE-1"), AGORA, captar),
    ]);
    const cumpridas = [a, b].filter((r) => r.status === "fulfilled");
    const recusadas = [a, b].filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(cumpridas).toHaveLength(1);
    expect(recusadas).toHaveLength(1);
    const erro = recusadas[0]!.reason as Error;
    expect(erro instanceof ComandoEmAndamentoError || erro instanceof ComandoJaConcluidoError, erro.message).toBe(true);

    // OS FATOS: um empenho, uma reserva CONCLUÍDA pelo funil, duas tentativas registradas.
    expect(await prisma.empenho.count()).toBe(1);
    const reservas = await prisma.comandoDeBorda.findMany({ where: { chave: "k-conc" } });
    expect(reservas).toHaveLength(1);
    expect(reservas[0]!.estado).toBe("CONCLUIDO");
    expect(reservas[0]!.tipoDoResultado).toBe("resultado"); // refinada pela conclusão do ato (a do funil veio antes)
    const ops = await auditoria("EMPENHAR");
    expect(ops.filter((r) => r === "INICIADA")).toHaveLength(2);
    expect(ops.filter((r) => r === "SUCESSO")).toHaveLength(1);
  });
});

describe("A02 — replay, ato não financeiro, A→B→A, revogação e retomada", () => {
  beforeEach(async () => {
    await semear();
    telemetria.length = 0;
  });

  it("t2: commit concluído e resposta perdida: o replay devolve a referência TIPADA sem executar; sem revalidação não revela nada", async () => {
    const porta = criarRegistroDeOperacaoPrisma(prisma);
    const r = await comOperacaoRegistrada(porta, { usuarioIdent: IDENT, acao: "EMPENHAR", chave: "k2", fingerprint: "f2" }, empenhoPor(prisma, "NE-2"), AGORA, captar);
    const revalidar = (): Promise<void> => exigirAcaoEmAlgumEscopo(prisma, IDENT, "EMPENHAR");

    let erro: unknown;
    try {
      await comOperacaoRegistrada(porta, { usuarioIdent: IDENT, acao: "EMPENHAR", chave: "k2", fingerprint: "f2", revalidar }, empenhoPor(prisma, "NE-2"), AGORA, captar);
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeInstanceOf(ComandoJaConcluidoError);
    const ja = erro as ComandoJaConcluidoError;
    expect(ja.tipoDoResultado).toBe("resultado");
    expect(ja.resultadoRef).toContain(r.empenhoId); // o id do EMPENHO — não o id do lançamento fingindo ser ele
    expect(await prisma.empenho.count()).toBe(1);
    expect(await auditoria("EMPENHAR")).toEqual(["CONCLUIDA", "INICIADA", "INICIADA", "REPLAY", "SUCESSO"]);

    // Sem `revalidar` o envelope é fail-closed: diz que já concluiu, e NÃO revela a referência.
    let erro2: unknown;
    try {
      await comOperacaoRegistrada(porta, { usuarioIdent: IDENT, acao: "EMPENHAR", chave: "k2", fingerprint: "f2" }, empenhoPor(prisma, "NE-2"), AGORA, captar);
    } catch (e) {
      erro2 = e;
    }
    expect(erro2).toBeInstanceOf(ComandoJaConcluidoError);
    expect((erro2 as ComandoJaConcluidoError).resultadoRef).toBeNull();
  });

  it("t3: ato NÃO financeiro cuja conclusão falha: o chamador recebe o resultado, a repetição imediata NÃO executa ('em andamento'); concluído na própria tx, o replay responde", async () => {
    const porta = portaQueFalhaEm(["CONCLUIDA", "concluir"]);
    let execucoes = 0;
    const cadastro = async (): Promise<{ readonly id: string }> => {
      execucoes += 1;
      return { id: `bem-${execucoes}` };
    };
    const r = await comOperacaoRegistrada(porta, { usuarioIdent: IDENT, acao: "CADASTRAR_BEM", chave: "k3", fingerprint: "f3" }, cadastro, AGORA, captar);
    expect(r).toEqual({ id: "bem-1" });
    expect(telemetria.map((t) => t.fase).sort()).toEqual(["CONCLUIDA", "CONCLUIDA"]);
    // ⚠️ ANTES: a repetição executava o cadastro de novo. AGORA: a reserva continua RESERVADO e a repetição recebe "em andamento".
    await expect(
      comOperacaoRegistrada(porta, { usuarioIdent: IDENT, acao: "CADASTRAR_BEM", chave: "k3", fingerprint: "f3" }, cadastro, AGORA, captar)
    ).rejects.toThrow(ComandoEmAndamentoError);
    expect(execucoes).toBe(1);

    // A JANELA FECHADA: o ato conclui a reserva DENTRO da própria transação — a falha posterior não importa.
    const cadastroNaTx = (): Promise<{ readonly id: string }> =>
      prisma.$transaction(async (tx) => {
        execucoes += 1;
        await concluirComandoNaTransacao(tx, "resultado", `bem-${execucoes}`, AGORA);
        return { id: `bem-${execucoes}` };
      });
    await comOperacaoRegistrada(porta, { usuarioIdent: IDENT, acao: "CADASTRAR_BEM", chave: "k3b", fingerprint: "f3b" }, cadastroNaTx, AGORA, captar);
    let erro: unknown;
    try {
      await comOperacaoRegistrada(
        porta,
        { usuarioIdent: IDENT, acao: "CADASTRAR_BEM", chave: "k3b", fingerprint: "f3b", revalidar: () => exigirAcaoEmAlgumEscopo(prisma, IDENT, "CADASTRAR_BEM") },
        cadastroNaTx,
        AGORA,
        captar
      );
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeInstanceOf(ComandoJaConcluidoError);
    expect((erro as ComandoJaConcluidoError).resultadoRef).toBe("bem-2");
    expect(execucoes).toBe(2);
    const reserva = await prisma.comandoDeBorda.findFirstOrThrow({ where: { chave: "k3b" } });
    expect(reserva).toMatchObject({ estado: "CONCLUIDO", tipoDoResultado: "resultado", resultadoRef: "bem-2" });
  });

  it("t4: A → B → A com a mesma chave: A executa, B é CONFLITO, a repetição de A é replay — UMA execução", async () => {
    const porta = criarRegistroDeOperacaoPrisma(prisma);
    let execucoes = 0;
    const ato = async (): Promise<string> => {
      execucoes += 1;
      return `r${execucoes}`;
    };
    await comOperacaoRegistrada(porta, { usuarioIdent: IDENT, acao: "CADASTRAR_BEM", chave: "k4", fingerprint: "A" }, ato, AGORA, captar);
    await expect(comOperacaoRegistrada(porta, { usuarioIdent: IDENT, acao: "CADASTRAR_BEM", chave: "k4", fingerprint: "B" }, ato, AGORA, captar)).rejects.toThrow(
      ComandoEmConflitoError
    );
    await expect(comOperacaoRegistrada(porta, { usuarioIdent: IDENT, acao: "CADASTRAR_BEM", chave: "k4", fingerprint: "A" }, ato, AGORA, captar)).rejects.toThrow(
      ComandoJaConcluidoError
    );
    expect(execucoes).toBe(1);
    const ops = await prisma.registroDeOperacao.findMany({ where: { acao: "CADASTRAR_BEM", resultado: "ERRO" } });
    expect(ops).toHaveLength(1);
    expect(ops[0]!.detalhe).toMatch(/COMANDO EM CONFLITO/);
  });

  it("t5: o mesmo comando em escopos DISTINTOS são dois comandos — e o escopo não vem do cliente (é parâmetro do envelope)", async () => {
    const porta = criarRegistroDeOperacaoPrisma(prisma);
    let execucoes = 0;
    const ato = async (): Promise<string> => {
      execucoes += 1;
      return "ok";
    };
    await comOperacaoRegistrada(porta, { usuarioIdent: IDENT, acao: "CADASTRAR_BEM", chave: "k5", fingerprint: "f5", escopo: "ente-a" }, ato, AGORA, captar);
    await comOperacaoRegistrada(porta, { usuarioIdent: IDENT, acao: "CADASTRAR_BEM", chave: "k5", fingerprint: "f5", escopo: "ente-b" }, ato, AGORA, captar);
    await expect(
      comOperacaoRegistrada(porta, { usuarioIdent: IDENT, acao: "CADASTRAR_BEM", chave: "k5", fingerprint: "f5", escopo: "ente-a" }, ato, AGORA, captar)
    ).rejects.toThrow(ComandoJaConcluidoError);
    expect(execucoes).toBe(2);
    expect((await prisma.comandoDeBorda.findMany({ where: { chave: "k5" } })).map((c) => c.escopo).sort()).toEqual(["ente-a", "ente-b"]);
  });

  it("t6: permissão REVOGADA depois do fato: o replay revalida e NEGA — não revela a referência só porque ela existe", async () => {
    const porta = criarRegistroDeOperacaoPrisma(prisma);
    const perfil = await prisma.perfil.create({
      data: { nome: "CADASTRADOR", descricao: "cadastra bens", criadoPor: POR, permissoes: { create: [{ acao: "CADASTRAR_BEM", criadoPor: POR }] } },
      select: { id: true },
    });
    const u = await prisma.usuario.create({ data: { identificador: "cadastrador@cg.pb.gov.br", nome: "c", criadoPor: POR }, select: { id: true, identificador: true } });
    await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: perfil.id, criadoPor: POR } });
    const revalidar = (): Promise<void> => exigirAcaoEmAlgumEscopo(prisma, u.identificador, "CADASTRAR_BEM");
    let execucoes = 0;
    const ato = async (): Promise<string> => {
      execucoes += 1;
      return "bem-x";
    };
    await comOperacaoRegistrada(porta, { usuarioIdent: u.identificador, acao: "CADASTRAR_BEM", chave: "k6", fingerprint: "f6", revalidar }, ato, AGORA, captar);
    // Com a permissão: o replay revela.
    await expect(
      comOperacaoRegistrada(porta, { usuarioIdent: u.identificador, acao: "CADASTRAR_BEM", chave: "k6", fingerprint: "f6", revalidar }, ato, AGORA, captar)
    ).rejects.toThrow(/COMANDO JÁ CONCLUÍDO.*bem-x/s);

    // REVOGA (a concessão é o fato; apagar é revogar — doutrina do censo de escrita).
    await prisma.permissaoDePerfil.deleteMany({ where: { perfilId: perfil.id, acao: "CADASTRAR_BEM" } });
    await expect(
      comOperacaoRegistrada(porta, { usuarioIdent: u.identificador, acao: "CADASTRAR_BEM", chave: "k6", fingerprint: "f6", revalidar }, ato, AGORA, captar)
    ).rejects.toThrow(/ACESSO NEGADO — SEM A PERMISSÃO/);
    expect(execucoes).toBe(1);
    const negadas = await prisma.registroDeOperacao.findMany({ where: { usuarioIdent: u.identificador, resultado: "NEGADO" } });
    expect(negadas).toHaveLength(1);
    expect(negadas[0]!.detalhe).toMatch(/^replay recusado: ACESSO NEGADO/);

    // E o usuário INATIVO também não recebe replay.
    await prisma.usuario.update({ where: { id: u.id }, data: { ativo: false } });
    await expect(
      comOperacaoRegistrada(porta, { usuarioIdent: u.identificador, acao: "CADASTRAR_BEM", chave: "k6", fingerprint: "f6", revalidar }, ato, AGORA, captar)
    ).rejects.toThrow(/USUÁRIO INATIVO/);
  });

  it("t7: erro SEM commit libera a reserva — a repetição legítima executa, e a reserva conta a segunda tentativa", async () => {
    const porta = criarRegistroDeOperacaoPrisma(prisma);
    let tentativas = 0;
    const ato = async (): Promise<string> => {
      tentativas += 1;
      if (tentativas === 1) throw new Error("VALIDAÇÃO: falhou antes de gravar");
      return "ok";
    };
    await expect(comOperacaoRegistrada(porta, { usuarioIdent: IDENT, acao: "CADASTRAR_BEM", chave: "k7", fingerprint: "f7" }, ato, AGORA, captar)).rejects.toThrow(/VALIDAÇÃO/);
    expect((await prisma.comandoDeBorda.findFirstOrThrow({ where: { chave: "k7" } })).estado).toBe("LIBERADO");
    const r = await comOperacaoRegistrada(porta, { usuarioIdent: IDENT, acao: "CADASTRAR_BEM", chave: "k7", fingerprint: "f7" }, ato, AGORA, captar);
    expect(r).toBe("ok");
    expect(await prisma.comandoDeBorda.findFirstOrThrow({ where: { chave: "k7" } })).toMatchObject({ estado: "CONCLUIDO", tentativas: 2, resultadoRef: "ok" });
    expect(await auditoria("CADASTRAR_BEM")).toEqual(["CONCLUIDA", "ERRO", "INICIADA", "INICIADA"]);
  });

  it("t8: queda antes do commit: dentro do prazo é 'em andamento'; passado o prazo a intenção é RETOMADA, e o detentor tardio é derrubado dentro da transação", async () => {
    const porta = criarRegistroDeOperacaoPrisma(prisma);
    // A reserva de um detentor que caiu: RESERVADO, sem conclusão nem liberação.
    const velha = await porta.registrar({ usuarioIdent: IDENT, acao: "CADASTRAR_BEM", chave: "k8", fingerprint: "f8", resultado: "INICIADA" }, new Date(AGORA.getTime() - 60_000));
    await prisma.comandoDeBorda.create({
      data: { escopo: "ente", usuarioIdent: IDENT, acao: "CADASTRAR_BEM", chave: "k8", fingerprint: "f8", estado: "RESERVADO", operacaoId: velha, reservadoEm: new Date(AGORA.getTime() - 60_000) },
    });
    let execucoes = 0;
    const ato = async (): Promise<string> => {
      execucoes += 1;
      return "ok";
    };
    // Um minuto depois: ainda em andamento.
    await expect(comOperacaoRegistrada(porta, { usuarioIdent: IDENT, acao: "CADASTRAR_BEM", chave: "k8", fingerprint: "f8" }, ato, AGORA, captar)).rejects.toThrow(
      ComandoEmAndamentoError
    );
    expect(execucoes).toBe(0);
    // Passado o prazo de abandono: retomada, e o ato executa.
    const depois = new Date(AGORA.getTime() + PRAZO_DE_ABANDONO_MS);
    const r = await comOperacaoRegistrada(porta, { usuarioIdent: IDENT, acao: "CADASTRAR_BEM", chave: "k8", fingerprint: "f8" }, ato, depois, captar);
    expect(r).toBe("ok");
    expect(execucoes).toBe(1);
    const reserva = await prisma.comandoDeBorda.findFirstOrThrow({ where: { chave: "k8" } });
    expect(reserva.estado).toBe("CONCLUIDO");
    expect(reserva.tentativas).toBe(2);
    expect(reserva.operacaoId).not.toBe(velha);

    // O DETENTOR TARDIO acorda e tenta concluir na sua transação: a reserva já não é dele — estoura, e a tx cai.
    await expect(
      comoComandoCorrente({ operacaoId: velha, usuarioIdent: IDENT, acao: "CADASTRAR_BEM", escopo: "ente", chave: "k8", fingerprint: "f8" }, () =>
        prisma.$transaction(async (tx) => {
          await tx.usuario.create({ data: { identificador: "nao-deve-existir", nome: "x", criadoPor: POR } });
          await concluirComandoNaTransacao(tx, "resultado", "tardio", depois);
        })
      )
    ).rejects.toThrow(ComandoRetomadoError);
    expect(await prisma.usuario.count({ where: { identificador: "nao-deve-existir" } })).toBe(0);
  });

  it("t9: sem chave o envelope RECUSA nomeando e não executa; o chamador que não é formulário declara o motivo e ele fica na auditoria", async () => {
    const porta = criarRegistroDeOperacaoPrisma(prisma);
    let execucoes = 0;
    const ato = async (): Promise<string> => {
      execucoes += 1;
      return "ok";
    };
    await expect(comOperacaoRegistrada(porta, { usuarioIdent: IDENT, acao: "CADASTRAR_BEM", fingerprint: "f9" }, ato, AGORA, captar)).rejects.toThrow(
      /COMANDO SEM CHAVE.*Recarregue a página/s
    );
    expect(execucoes).toBe(0);
    expect(await auditoria("CADASTRAR_BEM")).toEqual(["ERRO", "INICIADA"]);
    await comOperacaoRegistrada(porta, { usuarioIdent: IDENT, acao: "CADASTRAR_BEM", fingerprint: "f9", semChave: "job noturno" }, ato, AGORA, captar);
    expect(execucoes).toBe(1);
    const iniciada = await prisma.registroDeOperacao.findFirstOrThrow({ where: { acao: "CADASTRAR_BEM", resultado: "INICIADA", detalhe: { not: null } } });
    expect(iniciada.detalhe).toBe("sem chave: job noturno");
    expect(await prisma.comandoDeBorda.count()).toBe(0); // sem chave, sem reserva
  });
});
