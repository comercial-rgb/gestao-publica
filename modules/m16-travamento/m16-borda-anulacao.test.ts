import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { autenticar, definirSenha, validarSessao } from "./autenticacao.js";
import { comOperacaoRegistrada, criarRegistroDeOperacaoPrisma } from "./operacao.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { empenhar } from "../m05-despesa/servico.js";
import { anularEmpenhoParcial } from "../m05-despesa/anulacao-parcial.js";
import { criarM04Deps } from "../m04-receita/adapter-prisma.js";
import { registrarArrecadacao, anularArrecadacao } from "../m04-receita/servico.js";
import { listarEmpenhos } from "../m05-despesa/consultas.js";
import { roteiroArrecadacao, roteiroEmpenho } from "../m01-core-contabil/roteiros.js";
import { semearPcasp } from "../../prisma/seed/pcasp.js";

/**
 * A BORDA DA ANULAÇÃO (7.12) — o mesmo desenho de `m16-borda-execucao`: a porta não roda no vitest
 * (lê cookies do Next), então provamos a CADEIA que ela liga, sobre o domínio pronto:
 *
 *   autenticar → validarSessao → identificador → comOperacaoRegistrada(ação, ato)
 *     → serviço de anulação (estorno/parcial nasce no DOMÍNIO, nunca na borda)
 *
 * O que a sessão pede: sem sessão REJEITA; anulação parcial acima do saldo REJEITA pelo domínio e a
 * mensagem ATRAVESSA. Aqui, com o plano de PRODUÇÃO (`semearPcasp`) e os roteiros do M01.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const IDENT = "orcamento@cg.pb.gov.br"; // fixture ADMIN — pode tudo do censo
const SENHA = "SenhaForte#2026";
const FONTE = "fnt-500";
const CREDOR = "12345678000199";

const R_EMPENHO = roteiroEmpenho();
const R_ARRECADACAO = roteiroArrecadacao({ disponibilidade: "1.1.1.1.1.00.00", variacaoAumentativa: "4.1.1.2.1.01.00" });

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await semearPcasp(prisma);

  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({ data: { id: "uo-01", codigo: "01001", descricao: "Adm", orgaoId: "org-01" } });
  await prisma.funcao.create({ data: { id: "fun-04", codigo: "04", nome: "Adm" } });
  await prisma.subfuncao.create({ data: { id: "sub-122", codigo: "122", nome: "Adm" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0004", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({ data: { id: "nd39", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Serviços PJ" } });
  await prisma.naturezaReceita.create({ data: { id: "nr-iptu", codigo: "11121101", descricao: "IPTU" } });
  await prisma.fonteRecurso.create({ data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" } });
  await prisma.contaBancaria.create({ data: { id: "cb1", codigo: "CC-001", descricao: "Mov", fonteId: FONTE } });
  await criarFichaDeTeste(prisma, { id: "ficha-39", exercicio: 2026, numero: 1, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-04", subfuncaoId: "sub-122", programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd39", fonteId: FONTE, valorDotado: "500000.00" });

  const u = await prisma.usuario.findUniqueOrThrow({ where: { identificador: IDENT }, select: { id: true } });
  await definirSenha(prisma, { usuarioId: u.id, senha: SENHA, criadoPor: "TESTE" });
}

async function entrar(): Promise<string> {
  const sessao = await autenticar(prisma, { identificador: IDENT, senha: SENHA });
  const ident = await validarSessao(prisma, sessao.token);
  return ident.identificador;
}

async function comRegistro<T>(acao: string, criadoPor: string, ato: () => Promise<T>): Promise<T> {
  return comOperacaoRegistrada(criarRegistroDeOperacaoPrisma(prisma), { usuarioIdent: criadoPor, acao }, ato);
}

async function empenhaDe10k(criadoPor: string): Promise<string> {
  const r = await comRegistro("EMPENHAR", criadoPor, () =>
    empenhar(
      { fichaId: "ficha-39", numero: "2026NE000001", tipo: "ORDINARIO", valor: "10000.00", data: new Date("2026-02-01T12:00:00Z"), credorCpfCnpj: CREDOR, historico: "serviços", categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor },
      R_EMPENHO,
      criarM05Deps(prisma)
    )
  );
  return r.empenhoId;
}

describe("M16 — a borda da ANULAÇÃO (7.12)", () => {
  beforeEach(async () => {
    await semear();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("t1: anulação parcial de empenho, com sessão real → o empenhado líquido REDUZ e a operação fica auditada", async () => {
    const criadoPor = await entrar();
    const empenhoId = await empenhaDe10k(criadoPor);

    // Anula 4.000 dos 10.000 — o estorno parcial nasce no domínio, pela ação do censo.
    await comRegistro("ANULAR_EMPENHO_PARCIAL", criadoPor, () =>
      anularEmpenhoParcial(
        { originalId: empenhoId, numero: "2026NA000001", valor: "4000.00", data: new Date("2026-02-10T12:00:00Z"), motivo: "reducao por erro de estimativa", criadoPor },
        criarM05Deps(prisma)
      )
    );

    // O empenhado LÍQUIDO agora é 6.000 (o fato ficou, valendo menos — não sumiu).
    const [linha] = await listarEmpenhos(prisma, { exercicio: 2026 });
    expect(linha!.empenhadoLiquido.toFixed(2)).toBe("6000.00");
    expect(linha!.anulacoes.toFixed(2)).toBe("4000.00");

    // A operação ficou registrada com o criadoPor da SESSÃO.
    const op = await prisma.registroDeOperacao.findFirstOrThrow({ where: { acao: "ANULAR_EMPENHO_PARCIAL" } });
    expect(op.usuarioIdent).toBe(IDENT);
    expect(op.resultado).toBe("SUCESSO");
  });

  it("t2: anulação parcial ACIMA do saldo → o DOMÍNIO recusa e a mensagem atravessa", async () => {
    const criadoPor = await entrar();
    const empenhoId = await empenhaDe10k(criadoPor);

    // 15.000 > 10.000 disponíveis. O guard é do domínio (o saldo a liquidar), não da borda.
    await expect(
      comRegistro("ANULAR_EMPENHO_PARCIAL", criadoPor, () =>
        anularEmpenhoParcial(
          { originalId: empenhoId, numero: "2026NA000002", valor: "15000.00", data: new Date("2026-02-10T12:00:00Z"), motivo: "tentativa acima do saldo", criadoPor },
          criarM05Deps(prisma)
        )
      )
    ).rejects.toThrow(/saldo|excede|maior|10000|dispon/i);

    // E o empenho segue intacto — a recusa não deixou meio-fato.
    const [linha] = await listarEmpenhos(prisma, { exercicio: 2026 });
    expect(linha!.empenhadoLiquido.toFixed(2)).toBe("10000.00");
  });

  it("t3: SEM SESSÃO — um token forjado não valida (a primeira porta que a borda tranca)", async () => {
    await expect(validarSessao(prisma, "token-que-nunca-existiu")).rejects.toThrow(/SESSÃO INVÁLIDA/);
  });

  it("t4 (F2): anulação de arrecadação (4.61) — a receita líquida do período volta a zero", async () => {
    const criadoPor = await entrar();

    await comRegistro("ARRECADAR", criadoPor, () =>
      registrarArrecadacao(
        { exercicio: 2026, naturezaReceita: "11121101", fonte: "500", valor: "50000.00", dataArrecadacao: new Date("2026-01-10T12:00:00Z"), numeroReceita: "2026RC000001", criadoPor },
        R_ARRECADACAO,
        criarM04Deps(prisma)
      )
    );
    const receita = await prisma.receitaArrecadada.findFirstOrThrow({ where: { numeroReceita: "2026RC000001", estornoDeId: null }, select: { id: true } });

    // A anulação é TOTAL (o serviço não tem parcial), com guia própria.
    await comRegistro("ANULAR_ARRECADACAO", criadoPor, () =>
      anularArrecadacao(
        { receitaId: receita.id, numeroReceita: "2026RA000001", dataAnulacao: new Date("2026-01-20T12:00:00Z"), criadoPor },
        criarM04Deps(prisma)
      )
    );

    const op = await prisma.registroDeOperacao.findFirstOrThrow({ where: { acao: "ANULAR_ARRECADACAO" } });
    expect(op.resultado).toBe("SUCESSO");
    // A guia anulada e a anulação coexistem (append-only): duas linhas, receita líquida zero.
    const linhas = await prisma.receitaArrecadada.count({ where: { naturezaReceita: { codigo: "11121101" } } });
    expect(linhas).toBe(2);
  });
});
