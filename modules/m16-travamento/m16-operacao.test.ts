import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { semearPcasp } from "../../prisma/seed/pcasp.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { empenhar } from "../m05-despesa/servico.js";
import { roteiroEmpenho } from "../m01-core-contabil/roteiros.js";
import { autorizar } from "./autorizacao.js";
import { ehFalhaDeCredencial, CREDENCIAIS_INVALIDAS } from "./autenticacao.js";
import {
  AuditoriaIndisponivelError,
  ComandoJaConcluidoError,
  comandoCorrente,
  comOperacaoRegistrada,
  criarRegistroDeOperacaoPrisma,
  registrarSucessoNaTransacao,
  type FalhaDeTelemetria,
  type RegistroDeOperacaoPort,
} from "./operacao.js";

/**
 * ═══ A RESPOSTA VERDADEIRA (orquestração V3, 4.3) — a falha reproduzida, depois fechada ═══
 *
 * O pedido manda REPRODUZIR: "o ato conclui, o log posterior falha e a interface recebe
 * erro". A primeira descrição de cada teste é o defeito; o corpo prova o comportamento
 * novo. As três naturezas do registro são separadas aqui como o desenho promete:
 *   1. fato + SUCESSO na MESMA transação (pelo funil), e o SUCESSO cai com o rollback;
 *   2. a negação registrada fora da tx, com o erro ORIGINAL subindo mesmo que o registro
 *      falhe;
 *   3. a telemetria posterior (CONCLUIDA) que não altera o resultado — falhou, o chamador
 *      recebe o resultado assim mesmo, e a falha vai para a telemetria.
 * E o replay: mesma chave + mesmo fingerprint responde SEM repetir o fato; fingerprint
 * diferente é outro comando; sem chave, não há replay.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const IDENT = "orcamento@cg.pb.gov.br"; // fixture ADMIN
const FONTE = "fnt-op";
const FICHA = "ficha-op";
const CREDOR = "12345678000199";
const R_EMPENHO = roteiroEmpenho();

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await semearPcasp(prisma);
  await prisma.orgao.create({ data: { id: "org-op", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({
    data: { id: "uo-op", codigo: "01001", descricao: "Administração", orgaoId: "org-op" },
  });
  await prisma.funcao.create({ data: { id: "fun-op", codigo: "04", nome: "Administração" } });
  await prisma.subfuncao.create({ data: { id: "sub-op", codigo: "122", nome: "Adm" } });
  await prisma.programa.create({ data: { id: "prg-op", codigo: "0004", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca-op", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({
    data: { id: "nd-op", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Serviços" },
  });
  await prisma.fonteRecurso.create({ data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" } });
  await criarFichaDeTeste(prisma, {
    id: FICHA, numero: 1, exercicio: 2026, orgaoId: "org-op", unidadeOrcId: "uo-op",
    funcaoId: "fun-op", subfuncaoId: "sub-op", programaId: "prg-op", acaoId: "aca-op",
    naturezaDespesaId: "nd-op", fonteId: FONTE, valorDotado: "500000.00",
  });
}

function empenho(numero: string, valor = "1000.00") {
  return () =>
    empenhar(
      {
        fichaId: FICHA, numero, tipo: "ORDINARIO", valor, data: new Date("2026-02-01T12:00:00Z"),
        credorCpfCnpj: CREDOR, historico: `empenho ${numero}`, categoriaOrdemCronologica: "PRESTACAO_SERVICOS",
        criadoPor: IDENT,
      },
      R_EMPENHO,
      criarM05Deps(prisma)
    );
}

/** Uma porta que FALHA nas fases pedidas — o instrumento da reprodução. */
function portaQueFalhaEm(fases: readonly string[]): RegistroDeOperacaoPort {
  const real = criarRegistroDeOperacaoPrisma(prisma);
  return {
    registrar: (op, agora) => {
      if (fases.includes(op.resultado)) return Promise.reject(new Error(`auditoria indisponível na fase ${op.resultado}`));
      return real.registrar(op, agora);
    },
    conclusaoAnterior: (p) => real.conclusaoAnterior(p),
  };
}

const telemetria: FalhaDeTelemetria[] = [];
const captar = (f: FalhaDeTelemetria): void => {
  telemetria.push(f);
};

describe("a resposta verdadeira — o ato conclui, o registro posterior falha", () => {
  beforeEach(async () => {
    await semear();
    telemetria.length = 0;
  });

  it("DEFEITO REPRODUZIDO E FECHADO: o registro CONCLUIDA falha DEPOIS do commit — o chamador recebe o resultado, o fato existe UMA vez, e a falha vai para a telemetria", async () => {
    const porta = portaQueFalhaEm(["CONCLUIDA"]);
    const r = await comOperacaoRegistrada(
      porta,
      { usuarioIdent: IDENT, acao: "EMPENHAR", chave: "k1", fingerprint: "f1" },
      empenho("NE-1"),
      undefined,
      captar
    );
    // ⚠️ ANTES: aqui subia "auditoria indisponível", e o operador repetia o empenho.
    expect(r.empenhoId).toBeTruthy();
    expect(await prisma.empenho.count()).toBe(1);

    // O SUCESSO do funil está lá (mesma transação do fato); a CONCLUIDA não; a tentativa sim.
    const ops = await prisma.registroDeOperacao.findMany({ where: { acao: "EMPENHAR" } });
    expect(ops.map((o) => o.resultado).sort()).toEqual(["INICIADA", "SUCESSO"]);
    expect(telemetria).toHaveLength(1);
    expect(telemetria[0]).toMatchObject({ fase: "CONCLUIDA", acao: "EMPENHAR", usuarioIdent: IDENT });

    // E O REPLAY DA RESPOSTA PERDIDA NÃO DUPLICA O FATO: o SUCESSO do funil basta para recusar.
    await expect(
      comOperacaoRegistrada(porta, { usuarioIdent: IDENT, acao: "EMPENHAR", chave: "k1", fingerprint: "f1" }, empenho("NE-1"), undefined, captar)
    ).rejects.toThrow(ComandoJaConcluidoError);
    expect(await prisma.empenho.count()).toBe(1);
  });

  it("a NEGAÇÃO: o registro NEGADO falha — o erro que sobe é o ORIGINAL (ACESSO NEGADO), não o do log", async () => {
    const porta = portaQueFalhaEm(["NEGADO"]);
    const semPerfil = await prisma.usuario.create({
      data: { identificador: "op.sem.perfil", nome: "x", criadoPor: "TESTE" },
      select: { identificador: true },
    });
    let erro: unknown;
    try {
      await comOperacaoRegistrada(
        porta,
        { usuarioIdent: semPerfil.identificador, acao: "PAGAR" },
        () => autorizar(prisma, semPerfil.identificador, "PAGAR"),
        undefined,
        captar
      );
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeInstanceOf(Error);
    expect((erro as Error).message).toMatch(/ACESSO NEGADO — SEM PERFIL/);
    expect((erro as Error).message).not.toMatch(/auditoria indisponível/);
    expect(telemetria).toEqual([expect.objectContaining({ fase: "NEGADO", acao: "PAGAR" })]);
    // A tentativa (INICIADA) sobreviveu — ela é gravada fora de qualquer transação.
    const ops = await prisma.registroDeOperacao.findMany({ where: { acao: "PAGAR" } });
    expect(ops.map((o) => o.resultado)).toEqual(["INICIADA"]);
  });

  it("a NEGAÇÃO registrada não desaparece: o rollback do ato não leva a linha NEGADO embora", async () => {
    const porta = criarRegistroDeOperacaoPrisma(prisma);
    const semPerfil = await prisma.usuario.create({
      data: { identificador: "op.sem.perfil2", nome: "x", criadoPor: "TESTE" },
      select: { identificador: true },
    });
    await expect(
      comOperacaoRegistrada(porta, { usuarioIdent: semPerfil.identificador, acao: "EMPENHAR" }, () =>
        prisma.$transaction(async () => {
          await autorizar(prisma, semPerfil.identificador, "EMPENHAR");
        })
      )
    ).rejects.toThrow(/ACESSO NEGADO/);
    const ops = (await prisma.registroDeOperacao.findMany({ where: { acao: "EMPENHAR" } })).map((o) => o.resultado).sort();
    expect(ops).toEqual(["INICIADA", "NEGADO"]);
  });

  it("a auditoria indisponível ANTES do ato impede o ato — e diz que é a auditoria, não a senha nem o saldo", async () => {
    const porta = portaQueFalhaEm(["INICIADA"]);
    await expect(
      comOperacaoRegistrada(porta, { usuarioIdent: IDENT, acao: "EMPENHAR" }, empenho("NE-X"))
    ).rejects.toThrow(AuditoriaIndisponivelError);
    expect(await prisma.empenho.count()).toBe(0);
  });
});

describe("o SUCESSO na MESMA transação do fato — pelo funil", () => {
  beforeEach(async () => {
    await semear();
  });

  it("o funil grava SUCESSO com o lançamento, dentro da tx; fora de um comando, não grava nada", async () => {
    const porta = criarRegistroDeOperacaoPrisma(prisma);
    const r = await comOperacaoRegistrada(porta, { usuarioIdent: IDENT, acao: "EMPENHAR", chave: "k2", fingerprint: "f2" }, empenho("NE-2"));
    const emp = await prisma.empenho.findUniqueOrThrow({ where: { id: r.empenhoId }, select: { lancamentoId: true } });
    const sucesso = await prisma.registroDeOperacao.findFirstOrThrow({ where: { acao: "EMPENHAR", resultado: "SUCESSO" } });
    expect(sucesso.lancamentoId).toBe(emp.lancamentoId);
    expect(sucesso.chave).toBe("k2");

    // Fora do envelope o funil não sabe de comando nenhum: o empenho direto não gera SUCESSO.
    await empenho("NE-3")();
    expect(await prisma.registroDeOperacao.count({ where: { resultado: "SUCESSO" } })).toBe(1);
    expect(comandoCorrente()).toBeUndefined();
  });

  it("o rollback do fato leva o SUCESSO junto — e deixa a tentativa e o ERRO", async () => {
    const porta = criarRegistroDeOperacaoPrisma(prisma);
    await expect(
      comOperacaoRegistrada(porta, { usuarioIdent: IDENT, acao: "EMPENHAR", chave: "k3", fingerprint: "f3" }, () =>
        prisma.$transaction(async (tx) => {
          await registrarSucessoNaTransacao(tx, "lanc-que-nao-vai-existir");
          throw new Error("estourou DEPOIS do lançamento, DENTRO da transação");
        })
      )
    ).rejects.toThrow(/estourou DEPOIS/);
    const ops = (await prisma.registroDeOperacao.findMany({ where: { acao: "EMPENHAR" } })).map((o) => o.resultado).sort();
    expect(ops).toEqual(["ERRO", "INICIADA"]);
    // ...e por isso o replay NÃO recusa: não há SUCESSO nem CONCLUIDA — o fato não aconteceu.
    const r = await comOperacaoRegistrada(porta, { usuarioIdent: IDENT, acao: "EMPENHAR", chave: "k3", fingerprint: "f3" }, empenho("NE-4"));
    expect(r.empenhoId).toBeTruthy();
  });
});

describe("o replay idempotente — chave e fingerprint no escopo do usuário e da ação", () => {
  beforeEach(async () => {
    await semear();
  });

  it("mesma chave + mesmo fingerprint: recusa nomeando, sem executar o ato", async () => {
    const porta = criarRegistroDeOperacaoPrisma(prisma);
    let execucoes = 0;
    const ato = async (): Promise<{ readonly id: string }> => {
      execucoes += 1;
      return { id: "resultado-1" };
    };
    const r1 = await comOperacaoRegistrada(porta, { usuarioIdent: IDENT, acao: "CADASTRAR_BEM", chave: "k4", fingerprint: "f4" }, ato);
    expect(r1).toEqual({ id: "resultado-1" });
    await expect(
      comOperacaoRegistrada(porta, { usuarioIdent: IDENT, acao: "CADASTRAR_BEM", chave: "k4", fingerprint: "f4" }, ato)
    ).rejects.toThrow(/COMANDO JÁ CONCLUÍDO.*resultado-1.*Nada foi gravado de novo/s);
    expect(execucoes).toBe(1);
  });

  it("mesma chave com OUTRO fingerprint é outro comando; outra ação ou outro usuário também", async () => {
    const porta = criarRegistroDeOperacaoPrisma(prisma);
    let execucoes = 0;
    const ato = async (): Promise<string> => {
      execucoes += 1;
      return "ok";
    };
    await comOperacaoRegistrada(porta, { usuarioIdent: IDENT, acao: "CADASTRAR_BEM", chave: "k5", fingerprint: "f5" }, ato);
    await comOperacaoRegistrada(porta, { usuarioIdent: IDENT, acao: "CADASTRAR_BEM", chave: "k5", fingerprint: "f5-corrigido" }, ato);
    await comOperacaoRegistrada(porta, { usuarioIdent: IDENT, acao: "CADASTRAR_CLASSE_DE_BENS", chave: "k5", fingerprint: "f5" }, ato);
    await comOperacaoRegistrada(porta, { usuarioIdent: "despesa@cg.pb.gov.br", acao: "CADASTRAR_BEM", chave: "k5", fingerprint: "f5" }, ato);
    expect(execucoes).toBe(4);
  });

  it("sem chave não há replay: o mesmo comando executa de novo (degradação declarada)", async () => {
    const porta = criarRegistroDeOperacaoPrisma(prisma);
    let execucoes = 0;
    const ato = async (): Promise<string> => {
      execucoes += 1;
      return "ok";
    };
    await comOperacaoRegistrada(porta, { usuarioIdent: IDENT, acao: "CADASTRAR_BEM", fingerprint: "f6" }, ato);
    await comOperacaoRegistrada(porta, { usuarioIdent: IDENT, acao: "CADASTRAR_BEM", fingerprint: "f6" }, ato);
    expect(execucoes).toBe(2);
  });
});

describe("o login: credencial errada × serviço indisponível", () => {
  it("só as duas mensagens do domínio são de credencial; o resto é infraestrutura", () => {
    expect(ehFalhaDeCredencial(new Error(CREDENCIAIS_INVALIDAS))).toBe(true);
    expect(ehFalhaDeCredencial(new Error("ACESSO BLOQUEADO: houve 5 tentativas falhas para \"x\" nos últimos 15 minutos"))).toBe(true);
    // ⚠️ O DEFEITO: estas viravam "usuário ou senha inválidos".
    expect(ehFalhaDeCredencial(new Error("Can't reach database server at localhost:5436"))).toBe(false);
    expect(ehFalhaDeCredencial(new Error("permission denied for table TentativaDeLogin"))).toBe(false);
    expect(ehFalhaDeCredencial("string solta")).toBe(false);
  });
});
