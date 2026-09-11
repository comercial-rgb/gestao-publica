import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "./banco.js";
import { limparBanco } from "./limpar-banco.js";
import { criarFichaDeTeste } from "./ficha-teste.js";
import { raizesExistentes } from "./raizes-dominio.js";
import { criarM05Deps } from "../modules/m05-despesa/adapter-prisma.js";
import {
  roteiroEmpenho,
  roteiroLiquidacao,
  roteiroPagamento,
  type RoteiroContabil,
} from "../modules/m05-despesa/dominio.js";
import { empenhar } from "../modules/m05-despesa/servico.js";
import { liquidar, pagar } from "../modules/m05-despesa/servico-bloco2.js";
import {
  comOperacaoRegistrada,
  criarRegistroDeOperacaoPrisma,
} from "../modules/m16-travamento/operacao.js";
import type { M05Deps } from "../modules/m05-despesa/ports.js";

/**
 * A UNIDADE DE TRABALHO — o teste 14 do incremento.
 *
 * *"Falha no meio da unidade de trabalho reverte fato operacional, ledger, auditoria de
 * sucesso e outbox juntos. Registro separado de tentativa falha pode existir, sem simular
 * fato efetivado."*
 *
 * ═══ ⚠️ O QUE FAZ ESTE TESTE VALER ALGUMA COISA ═══
 * "Depois da falha não há Pagamento no banco" é uma afirmação que passa num sistema que
 * nunca grava nada. Por isso cada asserção tem PAR: primeiro o caminho feliz prova que
 * aquela escrita EXISTE, e só então a falha prova que ela SOME. Sem o par, o teste
 * certifica o vazio.
 *
 * ═══ A FALHA É NO MEIO, DE PROPÓSITO ═══
 * A retenção é gravada DEPOIS do lançamento contábil e DEPOIS do pagamento, dentro da
 * mesma transação. Uma retenção recusada (conta divergente do cadastro) derruba o ato
 * quando o razão JÁ FOI ESCRITO — que é exatamente o instante em que uma transação mal
 * costurada deixaria o lançamento de pé sem o fato que o explica.
 *
 * Falhar na primeira linha não provaria nada: aí não há o que reverter.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const RAIZ = fileURLToPath(new URL("..", import.meta.url));

const CAIXA = "1.1.1.1.1.19.00";
const P_INSS = "2.1.8.8.1.01.00";
const P_OUTRO = "2.1.8.8.1.02.00";
const POR = "ent01@cg.pb.gov.br";
const FICHA = "ficha-udt";

const CONTAS = [
  { id: "u-disp", codigo: "6.2.2.1.1.00.00", nome: "Crédito Disponível", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "u-emp", codigo: "6.2.2.1.3.01.00", nome: "Crédito Empenhado", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "u-liq", codigo: "6.2.2.1.3.03.00", nome: "Crédito Liquidado", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "u-pago", codigo: "6.2.2.1.3.04.00", nome: "Crédito Pago", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "u-vpd", codigo: "3.3.2.1.1.01.00", nome: "VPD - Serviços", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "u-forn", codigo: "2.1.3.1.1.00.00", nome: "Fornecedores a Pagar", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "u-banco", codigo: CAIXA, nome: "Bancos", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "u-inss", codigo: P_INSS, nome: "Consignações INSS", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "u-outro", codigo: P_OUTRO, nome: "Consignações ISS", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
];

const R_EMPENHO: RoteiroContabil = roteiroEmpenho({
  creditoDisponivel: "6.2.2.1.1.00.00",
  creditoEmpenhado: "6.2.2.1.3.01.00",
});
const R_LIQUIDACAO: RoteiroContabil = roteiroLiquidacao({
  variacaoDiminutiva: "3.3.2.1.1.01.00",
  obrigacaoAPagar: "2.1.3.1.1.00.00",
  creditoEmpenhado: "6.2.2.1.3.01.00",
  creditoLiquidado: "6.2.2.1.3.03.00",
});
const R_PAGAMENTO: RoteiroContabil = roteiroPagamento({
  obrigacaoAPagar: "2.1.3.1.1.00.00",
  disponibilidade: CAIXA,
  creditoLiquidado: "6.2.2.1.3.03.00",
  creditoPago: "6.2.2.1.3.04.00",
});

let deps: M05Deps;
let liquidacaoId: string;
let fonteDoTeste: string;
let contaDoTeste: string;
let n = 0;

/**
 * ⚠️ CADA TESTE GANHA FONTE, CONTA E FICHA PRÓPRIAS — e isto NÃO é zelo excessivo.
 *
 * A fila do art. 141 é por (fonte, categoria). Compartilhando a fonte, a liquidação de
 * cada teste entra ATRÁS das que os testes anteriores deixaram sem pagar — e o pagamento
 * passa a ser recusado por QUEBRA DE ORDEM, não pelo motivo que o teste queria medir.
 *
 * A primeira versão deste arquivo caiu nisso: o teste 4 acusou a quebra de ordem, e ao
 * investigar ficou claro que o teste 3 já vinha passando **pelo motivo errado** — ele
 * usava um `rejects.toThrow()` sem padrão, então qualquer recusa o satisfazia. Um teste
 * verde pela razão errada é indistinguível de um teste que funciona, e some na próxima
 * leitura. Daí a regra deste arquivo: **toda recusa é conferida pela mensagem**.
 */
async function prepararLiquidacao(): Promise<string> {
  n += 1;
  const suf = String(n).padStart(3, "0");
  fonteDoTeste = `fnt-udt-${suf}`;
  contaDoTeste = `CC-UDT-${suf}`;

  // ⚠️ `codigo` é VarChar(3) — a fonte de recursos tem três dígitos por norma, e o
  // schema a segura. Um sufixo de quatro caracteres estourava a coluna.
  const codigoDaFonte = String(500 + n);
  await prisma.fonteRecurso.create({
    data: { id: fonteDoTeste, codigo: codigoDaFonte, descricao: `Fonte do teste ${suf}`, codigoTce: codigoDaFonte },
  });
  await prisma.contaBancaria.create({
    data: { id: `cb-udt-${suf}`, codigo: contaDoTeste, descricao: "Movimento", fonteId: fonteDoTeste },
  });
  const fichaId = `${FICHA}-${suf}`;
  await criarFichaDeTeste(prisma, {
    id: fichaId, exercicio: 2026, numero: 100 + n,
    orgaoId: "u-org", unidadeOrcId: "u-uo", funcaoId: "u-fun", subfuncaoId: "u-sub",
    programaId: "u-prg", acaoId: "u-aca", naturezaDespesaId: "u-nd", fonteId: fonteDoTeste,
    valorDotado: "100000.00",
  });

  const e = await empenhar(
    {
      fichaId, numero: `2026NE${suf}`, tipo: "ORDINARIO", valor: "1000.00",
      data: new Date("2026-04-10T12:00:00Z"), credorCpfCnpj: "12345678000199",
      historico: "empenho da unidade de trabalho",
      categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: POR,
    },
    R_EMPENHO,
    deps
  );
  const l = await liquidar(
    {
      empenhoId: e.empenhoId, numero: `2026NL${suf}`, valor: "1000.00",
      data: new Date("2026-05-01T12:00:00Z"), responsavelAtesto: "Fulano",
      historico: "liquidação da unidade de trabalho", criadoPor: POR,
    },
    R_LIQUIDACAO,
    deps
  );
  return l.liquidacaoId;
}

function pagamento(sufixo: string, contaDaRetencao: string) {
  return {
    entrada: {
      liquidacaoId, numero: `2026OP${sufixo}`, valor: "1000.00",
      data: new Date("2026-06-01T12:00:00Z"), contaBancaria: contaDoTeste,
      fonteId: fonteDoTeste, historico: "pagamento da unidade de trabalho", criadoPor: POR,
    },
    retencoes: {
      contaDisponibilidade: CAIXA,
      retencoes: [
        {
          tipoConsignacaoId: "tc-udt", credorConsignatario: "INSS",
          valor: "100.00", contaConsignacaoAPagar: contaDaRetencao,
        },
      ],
    },
  };
}

/** O retrato de TUDO que um pagamento com retenção escreve. */
async function retrato(): Promise<Record<string, number>> {
  return {
    pagamento: await prisma.pagamento.count(),
    lancamentoDoPagamento: await prisma.lancamentoContabil.count({
      where: { origemTipo: "PAGAMENTO" },
    }),
    partidaDoPagamento: await prisma.partidaContabil.count({
      where: { lancamento: { origemTipo: "PAGAMENTO" } },
    }),
    movimentoExtra: await prisma.movimentoExtraorcamentario.count(),
    outbox: await prisma.eventoFiscalOutbox.count(),
    auditoriaDeSucesso: await prisma.registroDeOperacao.count({
      where: { acao: "PAGAR", resultado: "SUCESSO" },
    }),
  };
}

beforeAll(async () => {
  await limparBanco(prisma);

  await prisma.contaPcasp.createMany({ data: CONTAS });
  await prisma.orgao.create({ data: { id: "u-org", codigo: "03", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({
    data: { id: "u-uo", codigo: "03001", descricao: "Administração", orgaoId: "u-org" },
  });
  await prisma.funcao.create({ data: { id: "u-fun", codigo: "04", nome: "Administração" } });
  await prisma.subfuncao.create({ data: { id: "u-sub", codigo: "122", nome: "Administração Geral" } });
  await prisma.programa.create({ data: { id: "u-prg", codigo: "0001", descricao: "Gestão" } });
  await prisma.acao.create({
    data: { id: "u-aca", codigo: "2001", descricao: "Manutenção", tipo: "ATIVIDADE" },
  });
  await prisma.naturezaDespesa.create({
    data: {
      id: "u-nd", codCategoria: "3", codNatureza: "3", codModalidade: "90",
      codElemento: "39", codigoCompleto: "339039", descricao: "Serviços PJ",
    },
  });
  await prisma.tipoConsignacao.create({
    data: {
      id: "tc-udt", codigo: "INSS", descricao: "INSS",
      contaPassivoId: "u-inss", criadoPor: POR,
    },
  });
  deps = criarM05Deps(prisma);
});

beforeEach(async () => {
  liquidacaoId = await prepararLiquidacao();
});

describe("unidade de trabalho — o que a falha no meio tem de levar junto", () => {
  it("PAR 1/2 — o caminho feliz ESCREVE tudo (senão a asserção de baixo é vazia)", async () => {
    const antes = await retrato();
    const p = pagamento("F001", P_INSS);

    await comOperacaoRegistrada(
      criarRegistroDeOperacaoPrisma(prisma),
      { usuarioIdent: POR, acao: "PAGAR" },
      () => pagar(p.entrada, R_PAGAMENTO, deps, p.retencoes)
    );

    const depois = await retrato();
    expect(depois.pagamento).toBe(antes.pagamento! + 1);
    expect(depois.lancamentoDoPagamento).toBe(antes.lancamentoDoPagamento! + 1);
    // 5 pernas: obrigação, caixa (líquido), consignação, crédito liquidado, crédito pago,
    // mais as de CONTROLE (DDR). O que importa é que CRESCEU.
    expect(depois.partidaDoPagamento!).toBeGreaterThan(antes.partidaDoPagamento!);
    expect(depois.movimentoExtra).toBe(antes.movimentoExtra! + 1);
    expect(depois.auditoriaDeSucesso).toBe(antes.auditoriaDeSucesso! + 1);
  });

  it("PAR 2/2 — a falha no meio reverte fato, razão e retenção JUNTOS", async () => {
    const antes = await retrato();
    // ⚠️ A conta da retenção diverge do cadastro. A recusa acontece DEPOIS de o
    // lançamento e o pagamento já terem sido escritos na transação — que é o instante
    // que interessa.
    const p = pagamento("F002", P_OUTRO);

    await expect(
      comOperacaoRegistrada(
        criarRegistroDeOperacaoPrisma(prisma),
        { usuarioIdent: POR, acao: "PAGAR" },
        () => pagar(p.entrada, R_PAGAMENTO, deps, p.retencoes)
      )
    ).rejects.toThrow(/cadastro diz/);

    const depois = await retrato();
    expect(depois, "nada do ato sobreviveu — nem meia perna do razão").toEqual(antes);
  });

  it("a auditoria de SUCESSO não é escrita para um fato que não aconteceu", async () => {
    const sucessosAntes = await prisma.registroDeOperacao.count({
      where: { acao: "PAGAR", resultado: "SUCESSO" },
    });
    const p = pagamento("F003", P_OUTRO);

    // ⚠️ A MENSAGEM É CONFERIDA. Um `toThrow()` sem padrão aceita QUALQUER recusa — e
    // este teste já passou uma vez pelo motivo errado (quebra de ordem cronológica).
    await expect(
      comOperacaoRegistrada(
        criarRegistroDeOperacaoPrisma(prisma),
        { usuarioIdent: POR, acao: "PAGAR" },
        () => pagar(p.entrada, R_PAGAMENTO, deps, p.retencoes)
      )
    ).rejects.toThrow(/cadastro diz/);

    expect(
      await prisma.registroDeOperacao.count({
        where: { acao: "PAGAR", resultado: "SUCESSO" },
      }),
      "um SUCESSO gravado para um pagamento que não existe é pior que auditoria nenhuma: " +
        "ele é a prova documental de um fato que ninguém consegue achar no razão."
    ).toBe(sucessosAntes);
  });

  it("a tentativa FALHA fica registrada, e como ERRO — não como sucesso", async () => {
    // O incremento admite isto explicitamente: *"registro separado de tentativa falha
    // pode existir, sem simular fato efetivado"*. É o que o controle interno procura.
    const p = pagamento("F004", P_OUTRO);
    const antes = await prisma.registroDeOperacao.count({
      where: { acao: "PAGAR", resultado: "ERRO" },
    });

    await expect(
      comOperacaoRegistrada(
        criarRegistroDeOperacaoPrisma(prisma),
        { usuarioIdent: POR, acao: "PAGAR" },
        () => pagar(p.entrada, R_PAGAMENTO, deps, p.retencoes)
      )
    ).rejects.toThrow(/cadastro diz/);

    const registros = await prisma.registroDeOperacao.findMany({
      where: { acao: "PAGAR", resultado: "ERRO" },
      orderBy: { criadoEm: "desc" },
      take: 1,
    });
    expect(
      await prisma.registroDeOperacao.count({ where: { acao: "PAGAR", resultado: "ERRO" } })
    ).toBe(antes + 1);
    // O detalhe é o que responde "por quê" a quem for auditar meses depois.
    expect(registros[0]?.detalhe ?? "").toMatch(/cadastro diz/);
  });

  /**
   * ⚠️ O OUTBOX HOJE NÃO TEM PRODUTOR — e dizer isso é o teste.
   *
   * `EventoFiscalOutbox` existe no schema desde o início (a saída fiscal do R-2010/S-1200
   * passaria por lá), mas NENHUM código o alimenta. Um teste que afirmasse "o outbox foi
   * revertido junto" estaria certificando o vazio.
   *
   * O que dá para garantir hoje, e é o que importa para o dia em que o produtor nascer:
   * quem enfileirar TEM de fazê-lo dentro da transação do fato. Um `create` fora dela
   * publicaria evento de um fato que a transação ainda pode desfazer — e o consumidor
   * teria emitido documento fiscal de uma despesa que não existe.
   */
  it("o outbox não tem produtor hoje; se ganhar um, ele nasce DENTRO da transação", () => {
    const produtores: string[] = [];

    const varrer = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name === "node_modules" || e.name === "generated" || e.name === ".git") continue;
          varrer(p);
          continue;
        }
        if (!e.name.endsWith(".ts") || e.name.endsWith(".test.ts")) continue;
        const fonte = readFileSync(p, "utf8");
        if (!/eventoFiscalOutbox\s*\.\s*create/.test(fonte)) continue;

        const rel = p.slice(RAIZ.length).replace(/^[\\/]/, "").replace(/\\/g, "/");
        // Heurística deliberadamente grosseira: o produtor tem de estar num arquivo que
        // recebe uma transação. Um `create` num arquivo sem `tx` é certamente solto.
        const dentroDeTransacao = /\btx\b/.test(fonte) || /\$transaction/.test(fonte);
        if (!dentroDeTransacao) produtores.push(rel);
      }
    };
    for (const r of raizesExistentes(RAIZ)) varrer(r);
    varrer(join(RAIZ, "lib"));

    expect(
      produtores,
      "\n\n⚠️ EVENTO DE OUTBOX ENFILEIRADO FORA DE UMA TRANSAÇÃO.\n\n" +
        "O outbox existe para que a saída fiscal seja atômica com o fato. Enfileirar " +
        "fora da transação publica evento de um fato que ainda pode ser desfeito — e o " +
        "consumidor emite documento fiscal de uma despesa que não existe.\n\nArquivos:\n"
    ).toEqual([]);
  });
});
