import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { toMoney } from "../../packages/contracts/index.js";
import { validarLancamento, type Partida } from "../../packages/ledger/index.js";
import { saldosDeControle } from "../m01-core-contabil/adapter-prisma.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { criarM04Deps } from "../m04-receita/adapter-prisma.js";
import { roteiroArrecadacao } from "../m04-receita/dominio.js";
import { registrarArrecadacao } from "../m04-receita/servico.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import {
  roteiroEmpenho,
  roteiroLiquidacao,
  roteiroPagamento,
} from "../m05-despesa/dominio.js";
import { empenhar } from "../m05-despesa/servico.js";
import { liquidar, pagar } from "../m05-despesa/servico-bloco2.js";
import { apurarResultadoDoExercicio } from "./apuracao.js";
import {
  encerrarControlesOrcamentarios,
  estornarEncerramentoControles,
} from "./encerramento-controles.js";
import { encerrarExercicioComRestos } from "./encerramento.js";
import type { M05Deps } from "../m05-despesa/ports.js";
import { fimDoDiaCivil, janelaCivilDoAno } from "../../packages/datas/index.js";

/**
 * M08 — O ENCERRAMENTO DAS CONTAS DE CONTROLE ORÇAMENTÁRIO (a pendência de eada7b5).
 *
 * ⚠️ TODOS OS LITERAIS FEITOS À MÃO, ANTES DO CÓDIGO, a partir dos ROTEIROS REAIS do
 * repositório. Nada foi copiado da saída do programa.
 *
 * ═══ O CICLO CHEIO DE 2026 ═══
 *   01/01  LOA           100.000   D 5.2.2.1.1 dotação inicial / C 6.2.2.1.1 disponível
 *   10/01  arrecadação     8.000   D 6.2.1.1.0 a realizar      / C 6.2.1.2.0 realizada
 *                                  (+ a perna patrimonial: D CAIXA / C VPA)
 *   01/02  empenho         6.000   D 6.2.2.1.1 disponível      / C 6.2.2.1.3 empenhado
 *   10/02  liquidação      2.500   D 6.2.2.1.3 empenhado       / C 6.2.2.1.3.03 liquidado
 *          (parcial!)              (+ patrimonial: D VPD / C FORNECEDOR)
 *   20/02  pagamento       1.000   D 6.2.2.1.3.03 liquidado    / C 6.2.2.1.3.04 pago
 *                                  (+ patrimonial: D FORNECEDOR / C CAIXA)
 *
 * ═══ OS SALDOS DAS 5/6 EM 31/12/2026, UM A UM (ΣD − ΣC, com a natureza do PLANO) ═══
 *
 *   conta            nat.   ΣD        ΣC        saldo        destino
 *   5.2.2.1.1        D    100.000         0   D 100.000,00   ENCERRA
 *   6.2.2.1.1        C      6.000   100.000   C  94.000,00   ENCERRA
 *   6.2.2.1.3        C      2.500     6.000   C   3.500,00   ENCERRA
 *   6.2.2.1.3.03     C      1.000     2.500   C   1.500,00   ENCERRA
 *   6.2.2.1.3.04     C          0     1.000   C   1.000,00   ENCERRA
 *   6.2.1.1.0        D      8.000         0   D   8.000,00   ENCERRA
 *   6.2.1.2.0        C          0     8.000   C   8.000,00   ENCERRA
 *   6.3.1.1.0        C          0     5.000   C   5.000,00   TRANSFERE  ← controle de RP
 *   5.3.1.1.0        D      5.000         0   D   5.000,00   TRANSFERE  ← o espelho dele
 *
 * ⚠️ A CONFRONTAÇÃO DE DUAS FONTES — e ela cai de graça:
 *   6.2.2.1.3    (empenhado − liquidado)  C 3.500  ==  RP NÃO PROCESSADO inscrito 3.500
 *   6.2.2.1.3.03 (liquidado − pago)       C 1.500  ==  RP PROCESSADO      inscrito 1.500
 * O razão e a `InscricaoRestosAPagar` são fontes INDEPENDENTES (o M08 inscreve por SUM
 * dos fatos; o razão soma partidas). Elas TÊM de dar o mesmo número — e é isso que o t1
 * confere. É a mesma leitura que pegou o furo de 46dfd5d: *só a confrontação de duas
 * fontes pega lançamento que não existe*.
 *
 * ═══ O LANÇAMENTO DE ENCERRAMENTO (31/12/2026, natureza ENCERRAMENTO) ═══
 * Cada conta ENCERRA recebe a perna que a ZERA. E ele FECHA SOZINHO — a classe 5 é a
 * contrapartida da 6 (ver o cabeçalho de `encerramento-controles.ts`):
 *
 *   C 5.2.2.1.1     100.000,00        D 6.2.2.1.1      94.000,00
 *   C 6.2.1.1.0       8.000,00        D 6.2.2.1.3       3.500,00
 *                                     D 6.2.2.1.3.03    1.500,00
 *                                     D 6.2.2.1.3.04    1.000,00
 *                                     D 6.2.1.2.0       8.000,00
 *   ─────────────────────────         ─────────────────────────
 *   ΣC = 108.000,00                   ΣD = 108.000,00   ✓ FECHA
 *
 * 7 pernas. As 5.3/6.3 (RP) NÃO entram: elas TRANSFEREM, e transferir é não lançar.
 */

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula. Uma suíte
// inteiramente PULADA o Vitest reporta como PASSANDO (exit 0). Ver test/banco.ts.
await exigirBanco(prisma);

const POR = "contabilidade@cg.pb.gov.br";
const FONTE = "fnt-500";
const FICHA = "ficha-2026";
const NAT_RECEITA = "11130111";

const CAIXA = "1.1.1.1.2.00.00";
const FORNECEDOR = "2.1.3.1.1.00.00";
const RESULTADOS_ACUM = "2.3.7.1.1.00.00";
const VPD = "3.3.2.1.1.01.00";
const VPA = "4.1.1.2.1.01.00";

const DOT_INICIAL = "5.2.2.1.1.00.00";
const DOT_ADICIONAL = "5.2.2.1.2.00.00";
const R_A_REALIZAR = "6.2.1.1.0.00.00";
const R_REALIZADA = "6.2.1.2.0.00.00";
const C_DISPONIVEL = "6.2.2.1.1.00.00";
const C_RESERVADO = "6.2.2.1.2.00.00";
const C_EMPENHADO = "6.2.2.1.3.01.00";
const C_LIQUIDADO = "6.2.2.1.3.03.00";
const C_PAGO = "6.2.2.1.3.04.00";

/**
 * ⚠️ O CONTROLE DE RESTOS A PAGAR (5.3 / 6.3) — E POR QUE ELE É UM PAR.
 *
 * Ele é o caso CANÔNICO de TRANSFERE: o RP inscrito não morre com o ano — ele é
 * justamente o que sobrevive a ele. E ele TRANSFERE EM PAR: a 6.3 (o RP a pagar) e a 5.3
 * (o lastro dele) se espelham, e por isso tirar as duas do encerramento deixa o resto do
 * lançamento fechando. Classificar SÓ uma delas como TRANSFERE desequilibraria o
 * lançamento e o motor do M01 o recusaria — a rede de graça descrita no serviço.
 *
 * ⚠️ PENDÊNCIA DECLARADA, e ela é o achado do passo 0(b): a INSCRIÇÃO de RP **não tem
 * perna no razão** hoje (o `encerrarExercicioComRestos` só grava `InscricaoRestosAPagar`
 * — o RP tem razão próprio). Logo NADA no sistema alimenta a 6.3 sozinho. O lançamento
 * abaixo é o que o roteiro de inscrição fará quando existir, e ele está aqui porque a
 * TRANSFERE precisa de um saldo REAL para ser provada. Quando a inscrição ganhar o seu
 * roteiro, este lançamento sai da fixture e nada mais muda: a classificação já está certa.
 */
const RP_CONTROLE_ATIVO = "5.3.1.1.0.00.00"; // lastro do RP inscrito (devedora)
const RP_CONTROLE = "6.3.1.1.0.00.00"; // RP inscritos a pagar (credora)

const CONTAS = [
  { id: "c-caixa", codigo: CAIXA, nome: "Bancos", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true, indicadorSuperavit: "F" as const },
  { id: "c-forn", codigo: FORNECEDOR, nome: "Fornecedores", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true, indicadorSuperavit: "F" as const },
  { id: "c-resacum", codigo: RESULTADOS_ACUM, nome: "Resultados acumulados", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpd", codigo: VPD, nome: "VPD uso de bens", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpa", codigo: VPA, nome: "VPA impostos", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  // as de controle da RECEITA
  { id: "c-rar", codigo: R_A_REALIZAR, nome: "Receita a realizar", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-rr", codigo: R_REALIZADA, nome: "Receita realizada", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  // ⚠️ As fases FINAIS da despesa. As outras cinco (dotação inicial e adicional,
  // disponível, reservado, empenhado) vêm do `semearRoteiroOrcamentario`, que o
  // `criarFichaDeTeste` chama — estas duas são do CHAMADOR, como sempre foram.
  { id: "c-liq", codigo: C_LIQUIDADO, nome: "Crédito liquidado", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-pago", codigo: C_PAGO, nome: "Crédito pago", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  // as de controle do RP (o par que TRANSFERE)
  { id: "c-rp-ativo", codigo: RP_CONTROLE_ATIVO, nome: "Lastro dos RP inscritos", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-rp", codigo: RP_CONTROLE, nome: "RP inscritos a pagar", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
];

const R_ARRECADACAO = roteiroArrecadacao({
  disponibilidade: CAIXA, variacaoAumentativa: VPA,
  receitaARealizar: R_A_REALIZAR, receitaRealizada: R_REALIZADA,
});
const R_EMPENHO = roteiroEmpenho({
  creditoDisponivel: C_DISPONIVEL, creditoEmpenhado: C_EMPENHADO,
});
const R_LIQUIDACAO = roteiroLiquidacao({
  variacaoDiminutiva: VPD, obrigacaoAPagar: FORNECEDOR,
  creditoEmpenhado: C_EMPENHADO, creditoLiquidado: C_LIQUIDADO,
});
const R_PAGAMENTO = roteiroPagamento({
  obrigacaoAPagar: FORNECEDOR, disponibilidade: CAIXA,
  creditoLiquidado: C_LIQUIDADO, creditoPago: C_PAGO,
});

/**
 * ═══ O SEED DA TABELA-PARÂMETRO, COM A JUSTIFICATIVA MCASP DE CADA CONTA ═══
 *
 * Este é o coração do bloco, e ele é DADO, não código. A classificação abaixo é a que o
 * passo 0(a) apurou sobre as contas que o bootstrap deste repositório de fato movimenta.
 */
const DESTINOS: readonly {
  conta: string;
  destino: "ENCERRA" | "TRANSFERE";
  justificativa: string;
}[] = [
  {
    conta: DOT_INICIAL,
    destino: "ENCERRA",
    justificativa:
      "A autorização da LOA é ANUAL (CF art. 165; princípio da anualidade). A dotação " +
      "fixada para 2026 não autoriza nada em 2027 — ela morre com o exercício que a votou.",
  },
  {
    conta: DOT_ADICIONAL,
    destino: "ENCERRA",
    justificativa:
      "Mesma razão da dotação inicial: o crédito adicional é do exercício que o abriu. " +
      "Um decreto de suplementação de 2026 não suplementa o orçamento de 2027.",
  },
  {
    conta: C_DISPONIVEL,
    destino: "ENCERRA",
    justificativa:
      "CF art. 167, II: o crédito NÃO EMPENHADO CADUCA em 31/12. Esta é a conta cujo " +
      "saldo TEM de morrer — e era ela que, viva, fazia o beginning_balance da MSC de " +
      "janeiro trazer o orçamento que já tinha acabado (a pendência de eada7b5).",
  },
  {
    conta: C_RESERVADO,
    destino: "ENCERRA",
    justificativa:
      "A reserva que não virou empenho cai junto com o crédito que a lastreava — ela é " +
      "uma pré-alocação do crédito disponível, e não sobrevive a ele.",
  },
  {
    conta: C_EMPENHADO,
    destino: "ENCERRA",
    justificativa:
      "⚠️ A ÚNICA DÚVIDA CONCEITUAL REAL DESTE BLOCO, e ela está REPORTADA. O saldo " +
      "desta conta em 31/12 É o RP NÃO PROCESSADO (empenhado − liquidado). O MCASP " +
      "ortodoxo o TRANSFERIRIA para o controle de RP (6.3.x). Aqui ele ENCERRA, por dois " +
      "motivos que valem mais que a ortodoxia: (1) NADA em E+1 volta a debitar esta conta " +
      "— o pagamento de RP é D 2.1.3.1.1 / C caixa, e nunca toca as 5/6. Transferi-la " +
      "criaria um saldo de controle que CRESCE PARA SEMPRE e nunca é consumido: uma " +
      "mentira permanente no razão. (2) O saldo de RP tem razão PRÓPRIO neste sistema " +
      "(MovimentoRestosAPagar) — ele não fica sem controle. Quando a inscrição de RP " +
      "ganhar perna no razão (D 6.2.2.1.3 / C 6.3.1.1), esta conta chegará ZERADA ao " +
      "encerramento e a classificação segue valendo: encerrar zero é não lançar nada.",
  },
  {
    conta: C_LIQUIDADO,
    destino: "ENCERRA",
    justificativa:
      "Idem 6.2.2.1.3, e pela mesma dúvida: o saldo desta conta é o RP PROCESSADO " +
      "(liquidado − pago). Ver a justificativa acima — ela vale inteira aqui.",
  },
  {
    conta: C_PAGO,
    destino: "ENCERRA",
    justificativa:
      "Fase CONCLUÍDA do exercício que acabou. O que foi pago em 2026 não é execução " +
      "orçamentária de 2027 — ela começa em zero.",
  },
  {
    conta: R_A_REALIZAR,
    destino: "ENCERRA",
    justificativa:
      "A PREVISÃO de receita é da LOA daquele ano, e morre com ela. Uma receita 'a " +
      "realizar' de 2026 não está a realizar em 2027: ela não vai mais ser realizada.",
  },
  {
    conta: R_REALIZADA,
    destino: "ENCERRA",
    justificativa:
      "O espelho da anterior — a arrecadação de 2026 é do exercício de 2026. Somá-la à " +
      "de 2027 faria o ente publicar dois anos de receita como se fossem um.",
  },
  {
    conta: RP_CONTROLE,
    destino: "TRANSFERE",
    justificativa:
      "O CASO CANÔNICO. O resto a pagar inscrito NÃO morre com o exercício — ele é " +
      "exatamente o que sobrevive a ele (Lei 4.320/64, art. 36). O saldo ATRAVESSA a " +
      "virada por design, e por isso não há nada a lançar: ele já está onde tem de estar.",
  },
  {
    conta: RP_CONTROLE_ATIVO,
    destino: "TRANSFERE",
    justificativa:
      "O ESPELHO do 6.3.1.1 — e ele transfere PORQUE o outro transfere. Uma conta de " +
      "controle só atravessa a virada EM PAR com a sua contrapartida: classificar uma " +
      "perna como TRANSFERE e a outra como ENCERRA desequilibra o lançamento de " +
      "encerramento, e o motor do M01 o recusa.",
  },
];

let deps: M05Deps;
let exercicio2026: string;

async function semear(): Promise<void> {
  await limparBanco(prisma);
  deps = criarM05Deps(prisma);

  await prisma.contaPcasp.createMany({ data: CONTAS });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({
    data: { id: "uo-01", codigo: "01001", descricao: "Educação", orgaoId: "org-01" },
  });
  await prisma.funcao.create({ data: { id: "fun-12", codigo: "12", nome: "Educação" } });
  await prisma.subfuncao.create({ data: { id: "sub-361", codigo: "361", nome: "EF" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0012", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({
    data: {
      id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90",
      codElemento: "39", codigoCompleto: "339039", descricao: "Serviços",
    },
  });
  await prisma.naturezaReceita.create({
    data: { id: "nr", codigo: NAT_RECEITA, descricao: "IPTU" },
  });
  await prisma.fonteRecurso.create({
    data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" },
  });
  await prisma.contaBancaria.create({
    data: {
      id: "cb1", codigo: "CC-001", descricao: "Movimento",
      fonteId: FONTE, contaContabilId: "c-caixa",
    },
  });
  await criarFichaDeTeste(prisma, {
    id: FICHA, exercicio: 2026, numero: 1, orgaoId: "org-01", unidadeOrcId: "uo-01",
    funcaoId: "fun-12", subfuncaoId: "sub-361", programaId: "prg", acaoId: "aca",
    naturezaDespesaId: "nd", fonteId: FONTE, valorDotado: "100000.00",
  });
  exercicio2026 = (
    await prisma.exercicio.findUniqueOrThrow({
      where: { ano: 2026 },
      select: { id: true },
    })
  ).id;

  await prisma.roteiroEncerramento.create({
    data: { contaResultadosAcumuladosId: "c-resacum", criadoPor: POR },
  });
}

/** A tabela-parâmetro. Recebe QUAIS contas classificar — os testes de fail-closed omitem. */
async function semearDestinos(
  contas: readonly string[] = DESTINOS.map((d) => d.conta)
): Promise<void> {
  for (const d of DESTINOS.filter((x) => contas.includes(x.conta))) {
    const conta = await prisma.contaPcasp.findUniqueOrThrow({
      where: { codigo: d.conta },
      select: { id: true },
    });
    await prisma.contaNaVirada.create({
      data: {
        contaId: conta.id,
        destino: d.destino,
        justificativa: d.justificativa,
        criadoPor: POR,
      },
    });
  }
}

/** O ciclo cheio do cabeçalho. */
async function cicloDe2026(): Promise<void> {
  await registrarArrecadacao(
    {
      exercicio: 2026, naturezaReceita: NAT_RECEITA, fonte: "500", valor: "8000.00",
      dataArrecadacao: new Date("2026-01-10T12:00:00Z"), numeroReceita: "GUIA-1",
      criadoPor: POR,
    },
    R_ARRECADACAO,
    criarM04Deps(prisma)
  );

  const e = await empenhar(
    {
      fichaId: FICHA, numero: "NE-1", tipo: "ORDINARIO", valor: "6000.00",
      data: new Date("2026-02-01T12:00:00Z"), credorCpfCnpj: "12345678000199",
      historico: "serviços", categoriaOrdemCronologica: "PRESTACAO_SERVICOS",
      criadoPor: POR,
    },
    R_EMPENHO,
    deps
  );
  const l = await liquidar(
    {
      empenhoId: e.empenhoId, numero: "NL-1", valor: "2500.00",
      data: new Date("2026-02-10T12:00:00Z"), responsavelAtesto: "Fiscal",
      historico: "medição parcial", criadoPor: POR,
    },
    R_LIQUIDACAO,
    deps
  );
  await pagar(
    {
      liquidacaoId: l.liquidacaoId, numero: "NP-1", valor: "1000.00",
      data: new Date("2026-02-20T12:00:00Z"), contaBancaria: "CC-001",
      fonteId: FONTE, historico: "OP parcial", criadoPor: POR,
    },
    R_PAGAMENTO,
    deps
  );
}

/**
 * O CONTROLE DE RP no razão — o que o roteiro de INSCRIÇÃO fará quando existir.
 * Ver a pendência declarada acima. RP total inscrito: 3.500 (NP) + 1.500 (P) = 5.000.
 */
async function lancarControleDeRp(): Promise<void> {
  await prisma.lancamentoContabil.create({
    data: {
      numeroControle: "CTRL-RP-2026",
      dataTransacao: new Date("2026-12-31T23:59:59Z"),
      historico: "Controle dos restos a pagar inscritos em 2026",
      origemTipo: "CONTROLE_RP",
      natureza: "NORMAL",
      criadoPor: POR,
      partidas: {
        create: [
          { contaId: "c-rp-ativo", tipo: "DEBITO", subsistema: "ORCAMENTARIO", valor: "5000.00" },
          { contaId: "c-rp", tipo: "CREDITO", subsistema: "ORCAMENTARIO", valor: "5000.00" },
        ],
      },
    },
  });
}


/**
 * ⚠️ O FIM DO EXERCÍCIO É O DO ENTE, E ISSO VIROU LITERAL AQUI DEPOIS DE UMA ACUSAÇÃO.
 *
 * O corte era `new Date("YYYY-12-31T23:59:59Z")`, que em São Paulo é **31/12 às 20:59:59**.
 * Quando o ENT03b pôs o fato do encerramento no último instante CIVIL do exercício, ele
 * passou a cair TRÊS HORAS DEPOIS deste corte — e o teste acusou. A acusação estava certa:
 * o corte é que estava em Greenwich. Ver `docs/adr/ADR-data-civil-do-ente.md`.
 */
const FIM_2026 = janelaCivilDoAno(2026).fim;

/** Os saldos das 5/6 no corte — a MESMA leitura que o serviço usa. */
async function saldos(): Promise<Map<string, string>> {
  const s = await saldosDeControle(prisma, {
    classes: ["5", "6"],
    ate: FIM_2026,
    campoData: "dataTransacao",
  });
  return new Map(s.map((x) => [x.codigo, x.saldo.toFixed(2)]));
}

/** Conta os lançamentos de encerramento dos controles que existem no banco. */
async function lancamentosDeEncerramento(): Promise<number> {
  return prisma.lancamentoContabil.count({
    where: { origemTipo: { startsWith: "ENCERRAMENTO_CONTROLES" } },
  });
}

async function prepararCicloEncerrado(): Promise<void> {
  await cicloDe2026();
  await lancarControleDeRp();
  await encerrarExercicioComRestos(prisma, { ano: 2026, encerradoPor: POR });
}

describe("M08 — encerramento das contas de controle (a virada)", () => {
  beforeEach(semear);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t1 — O CICLO CHEIO. Os literais do cabeçalho, conta a conta.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t1: ciclo cheio -> apurar -> encerrarControles: ENCERRA zeradas, TRANSFERE intactas", async () => {
    await prepararCicloEncerrado();
    await semearDestinos();

    // ── ANTES: os saldos do cabeçalho, um a um ──
    const antes = await saldos();
    expect(antes.get(DOT_INICIAL)).toBe("100000.00");
    expect(antes.get(C_DISPONIVEL)).toBe("94000.00");
    expect(antes.get(C_EMPENHADO)).toBe("3500.00");
    expect(antes.get(C_LIQUIDADO)).toBe("1500.00");
    expect(antes.get(C_PAGO)).toBe("1000.00");
    expect(antes.get(R_A_REALIZAR)).toBe("8000.00");
    expect(antes.get(R_REALIZADA)).toBe("8000.00");
    expect(antes.get(RP_CONTROLE)).toBe("5000.00");
    expect(antes.get(RP_CONTROLE_ATIVO)).toBe("5000.00");

    // ⚠️ A CONFRONTAÇÃO DE DUAS FONTES: o razão e a InscricaoRestosAPagar são
    // independentes, e TÊM de contar a mesma história sobre o RP.
    const inscricoes = await prisma.inscricaoRestosAPagar.findMany({
      where: { exercicioOrigem: 2026 },
      select: { tipo: true, valorInscrito: true },
    });
    const inscrito = (t: string): string =>
      inscricoes
        .filter((i) => i.tipo === t)
        .reduce((a, i) => toMoney(a.plus(toMoney(i.valorInscrito.toFixed(2)))), toMoney("0.00"))
        .toFixed(2);
    expect(inscrito("NAO_PROCESSADO")).toBe("3500.00"); // == C_EMPENHADO
    expect(inscrito("PROCESSADO")).toBe("1500.00"); // == C_LIQUIDADO

    // ── A APURAÇÃO (classes 3/4) e O ENCERRAMENTO DOS CONTROLES (5/6) ──
    const ap = await apurarResultadoDoExercicio(prisma, {
      exercicioId: exercicio2026,
      criadoPor: POR,
    });
    // VPA 8.000 − VPD 2.500 = 5.500
    expect(ap.resultadoApurado.toFixed(2)).toBe("5500.00");

    const enc = await encerrarControlesOrcamentarios(prisma, {
      exercicioId: exercicio2026,
      criadoPor: POR,
    });

    // 7 contas encerradas — as do cabeçalho, e nenhuma a mais.
    expect(enc.encerradas.map((e) => e.codigo).sort()).toEqual([
      DOT_INICIAL, R_A_REALIZAR, R_REALIZADA,
      C_DISPONIVEL, C_EMPENHADO, C_LIQUIDADO, C_PAGO,
    ].sort());
    // e as 2 que atravessam
    expect(enc.transferidas.map((t) => t.codigo).sort()).toEqual(
      [RP_CONTROLE, RP_CONTROLE_ATIVO].sort()
    );

    // ── AS PERNAS, LITERAIS (o quadro do cabeçalho) ──
    const perna = (c: string) => enc.encerradas.find((e) => e.codigo === c)!;
    expect(perna(DOT_INICIAL)).toMatchObject({ perna: "CREDITO" });
    expect(perna(DOT_INICIAL).saldo.toFixed(2)).toBe("100000.00");
    expect(perna(C_DISPONIVEL)).toMatchObject({ perna: "DEBITO" });
    expect(perna(C_DISPONIVEL).saldo.toFixed(2)).toBe("94000.00");
    expect(perna(R_A_REALIZAR)).toMatchObject({ perna: "CREDITO" });
    expect(perna(R_REALIZADA)).toMatchObject({ perna: "DEBITO" });

    // ── DEPOIS: as ENCERRA sumiram do razão (saldo zero = não aparece na leitura) ──
    const depois = await saldos();
    for (const c of [DOT_INICIAL, C_DISPONIVEL, C_EMPENHADO, C_LIQUIDADO, C_PAGO, R_A_REALIZAR, R_REALIZADA]) {
      expect(depois.get(c) ?? "0.00", `conta ${c}`).toBe("0.00");
    }
    // ── e as TRANSFERE ficaram EXATAMENTE onde estavam ──
    expect(depois.get(RP_CONTROLE)).toBe("5000.00");
    expect(depois.get(RP_CONTROLE_ATIVO)).toBe("5000.00");

    // ⚠️ O LANÇAMENTO É UM SÓ, natureza ENCERRAMENTO, e ele FECHA — 7 pernas.
    const lanc = await prisma.lancamentoContabil.findFirstOrThrow({
      where: { origemTipo: "ENCERRAMENTO_CONTROLES" },
      select: {
        natureza: true, dataTransacao: true,
        partidas: { select: { tipo: true, valor: true, subsistema: true } },
      },
    });
    expect(lanc.natureza).toBe("ENCERRAMENTO");
    // 31/12/2026 às 23:59:59.999 CIVIS. A virada é um fato do ÚLTIMO instante do
    // exercício do ente — que em Greenwich já é 01/01 às 02:59:59.999.
    expect(lanc.dataTransacao.toISOString()).toBe("2027-01-01T02:59:59.999Z");
    expect(lanc.partidas).toHaveLength(7);
    expect(new Set(lanc.partidas.map((p) => p.subsistema))).toEqual(new Set(["ORCAMENTARIO"]));

    const soma = (t: string): string =>
      lanc.partidas
        .filter((p) => p.tipo === t)
        .reduce((a, p) => toMoney(a.plus(toMoney(p.valor.toFixed(2)))), toMoney("0.00"))
        .toFixed(2);
    expect(soma("DEBITO")).toBe("108000.00");
    expect(soma("CREDITO")).toBe("108000.00");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t2 — FAIL-CLOSED: conta com saldo e SEM destino. A operação INTEIRA cai.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t2: conta ENCERRA com saldo e SEM destino classificado -> erro nomeando; SELECT prova ZERO lançamento", async () => {
    await prepararCicloEncerrado();
    // TUDO classificado, MENOS o crédito disponível — a conta mais cara de esquecer.
    await semearDestinos(
      DESTINOS.map((d) => d.conta).filter((c) => c !== C_DISPONIVEL)
    );

    await expect(
      encerrarControlesOrcamentarios(prisma, {
        exercicioId: exercicio2026,
        criadoPor: POR,
      })
    ).rejects.toThrow(/SEM DESTINO NA VIRADA.*6\.2\.2\.1\.1\.00\.00 \(saldo 94000\.00\)/s);

    // ⚠️ ATOMICIDADE DA OPERAÇÃO INTEIRA: nem meia perna foi gravada. As OUTRAS contas
    // (que TINHAM destino) continuam com o saldo intacto — o encerramento não gravou
    // "o que dava" e deixou o resto.
    expect(await lancamentosDeEncerramento()).toBe(0);
    const s = await saldos();
    expect(s.get(DOT_INICIAL)).toBe("100000.00");
    expect(s.get(C_DISPONIVEL)).toBe("94000.00");
    expect(s.get(R_A_REALIZAR)).toBe("8000.00");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t3 — A CONFERÊNCIA PÓS-EVENTO: POR QUE ELA É A ÚNICA REDE.
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // ⚠️ ESTA CONFERÊNCIA NÃO É ALCANÇÁVEL DE FORA DO SERVIÇO — e isso é da natureza dela,
  // não um descuido do teste. Ela defende contra um BUG NO LAÇO que monta as pernas, e
  // nenhuma entrada do chamador produz esse bug. É a mesma situação da conferência da
  // apuração, e o repositório já a documenta assim: PROVADA POR MUTAÇÃO (a mutação foi
  // rodada de verdade neste bloco — ver a nota no fim deste arquivo).
  //
  // O que ESTE teste prova é a METADE LOAD-BEARING da afirmação, e essa metade é
  // automatizável: **o motor do M01 NÃO pega o espelho pulado.** Se o motor pegasse, a
  // conferência seria peso morto e deveria sair. Ele não pega — e é por isso que ela fica.
  it("t3: o motor ACEITA o espelho pulado (ΣD == ΣC) — logo só a conferência de COMPLETUDE o pega", async () => {
    await prepararCicloEncerrado();
    await semearDestinos();

    // As 7 pernas honestas do cabeçalho.
    const HONESTAS: Partida[] = [
      { conta: DOT_INICIAL, tipo: "CREDITO", subsistema: "ORCAMENTARIO", valor: toMoney("100000.00") },
      { conta: C_DISPONIVEL, tipo: "DEBITO", subsistema: "ORCAMENTARIO", valor: toMoney("94000.00") },
      { conta: C_EMPENHADO, tipo: "DEBITO", subsistema: "ORCAMENTARIO", valor: toMoney("3500.00") },
      { conta: C_LIQUIDADO, tipo: "DEBITO", subsistema: "ORCAMENTARIO", valor: toMoney("1500.00") },
      { conta: C_PAGO, tipo: "DEBITO", subsistema: "ORCAMENTARIO", valor: toMoney("1000.00") },
      { conta: R_A_REALIZAR, tipo: "CREDITO", subsistema: "ORCAMENTARIO", valor: toMoney("8000.00") },
      { conta: R_REALIZADA, tipo: "DEBITO", subsistema: "ORCAMENTARIO", valor: toMoney("8000.00") },
    ];
    expect(() => validarLancamento(HONESTAS)).not.toThrow();

    // ⚠️ A MUTAÇÃO QUE ALGUÉM DE FATO ESCREVE: "aqui eu trato o controle da DESPESA; a
    // receita é outro assunto". Ela pula o PAR DA RECEITA — as duas contas de uma vez.
    //
    // E O MOTOR PASSA. O par se lastreia (a realizar C 8.000 / realizada D 8.000), então
    // tirá-lo INTEIRO não desequilibra nada: ΣD 100.000 == ΣC 100.000. O lançamento é
    // perfeitamente válido — e MENTIROSO: o orçamento de receita de 2026 atravessa a
    // virada, e janeiro de 2027 abre com 8.000 a realizar de um ano que acabou.
    const MUTADAS = HONESTAS.filter(
      (p) => p.conta !== R_A_REALIZAR && p.conta !== R_REALIZADA
    );
    expect(MUTADAS).toHaveLength(5);
    expect(() => validarLancamento(MUTADAS)).not.toThrow(); // ← O MOTOR NÃO PEGA.

    // Pular UMA conta só, sim, o motor pega — e é essa a objeção óbvia, que está errada.
    expect(() => validarLancamento(HONESTAS.filter((p) => p.conta !== R_REALIZADA))).toThrow();

    // ── E o caminho HONESTO, pelo serviço, zera TUDO: a conferência é o que garante que
    //    não existe caminho em que ele grave menos que isto. ──
    const enc = await encerrarControlesOrcamentarios(prisma, {
      exercicioId: exercicio2026,
      criadoPor: POR,
    });
    expect(enc.encerradas).toHaveLength(7);
    const fim = await saldos();
    for (const c of [DOT_INICIAL, C_DISPONIVEL, C_EMPENHADO, C_LIQUIDADO, C_PAGO, R_A_REALIZAR, R_REALIZADA]) {
      expect(fim.get(c) ?? "0.00", `conta ${c}`).toBe("0.00");
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t3b — O ESPELHO MEIO-CLASSIFICADO: a rede DE GRAÇA que o motor dá.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t3b: TRANSFERIR só UMA perna do espelho de RP desequilibra o lançamento — o motor recusa", async () => {
    await prepararCicloEncerrado();
    // ⚠️ O ERRO: classificar o 6.3 (RP a pagar) como TRANSFERE e ESQUECER o 5.3 que o
    // lastreia — deixando o 5.3 como ENCERRA. O saldo do 5.3 (D 5.000) entraria no
    // lançamento SEM a sua contrapartida, e ΣD deixaria de ser ΣC.
    await semearDestinos(
      DESTINOS.map((d) => d.conta).filter((c) => c !== RP_CONTROLE_ATIVO)
    );
    const conta = await prisma.contaPcasp.findUniqueOrThrow({
      where: { codigo: RP_CONTROLE_ATIVO },
      select: { id: true },
    });
    await prisma.contaNaVirada.create({
      data: {
        contaId: conta.id,
        destino: "ENCERRA", // ← o erro
        justificativa: "classificação errada, de propósito: o espelho ficou meio dentro",
        criadoPor: POR,
      },
    });

    // O motor do M01 recusa — e nada é gravado. Uma conta de controle só transfere EM PAR.
    await expect(
      encerrarControlesOrcamentarios(prisma, {
        exercicioId: exercicio2026,
        criadoPor: POR,
      })
    ).rejects.toThrow();
    expect(await lancamentosDeEncerramento()).toBe(0);
    expect((await saldos()).get(DOT_INICIAL)).toBe("100000.00");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t4 — O ESTORNO. Cada saldo volta ao seu valor, perna a perna.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t4: estornar o encerramento RESTAURA cada saldo — os literais provam", async () => {
    await prepararCicloEncerrado();
    await semearDestinos();

    const enc = await encerrarControlesOrcamentarios(prisma, {
      exercicioId: exercicio2026,
      criadoPor: POR,
    });
    expect((await saldos()).get(DOT_INICIAL) ?? "0.00").toBe("0.00");

    const est = await estornarEncerramentoControles(prisma, {
      operacaoId: enc.operacaoId,
      motivo: "o encerramento foi feito antes de um crédito adicional de dezembro",
      criadoPor: POR,
    });
    expect(est.lancamentos).toHaveLength(1);

    // ⚠️ CADA PERNA COM O SEU VALOR — nunca um valor recarimbado sobre todas. Os saldos
    // voltam EXATAMENTE aos literais do cabeçalho.
    const s = await saldos();
    expect(s.get(DOT_INICIAL)).toBe("100000.00");
    expect(s.get(C_DISPONIVEL)).toBe("94000.00");
    expect(s.get(C_EMPENHADO)).toBe("3500.00");
    expect(s.get(C_LIQUIDADO)).toBe("1500.00");
    expect(s.get(C_PAGO)).toBe("1000.00");
    expect(s.get(R_A_REALIZAR)).toBe("8000.00");
    expect(s.get(R_REALIZADA)).toBe("8000.00");
    // as que TRANSFERIRAM nunca foram tocadas — nem pelo encerramento, nem pelo estorno
    expect(s.get(RP_CONTROLE)).toBe("5000.00");

    // o estorno é ENCERRAMENTO também — senão a MSC agregada contaria a reversão como
    // movimento do mês, e dezembro ganharia uma dotação que ninguém votou.
    const estorno = await prisma.lancamentoContabil.findFirstOrThrow({
      where: { origemTipo: "ENCERRAMENTO_CONTROLES_ESTORNADO" },
      select: { natureza: true, estornoDeId: true },
    });
    expect(estorno.natureza).toBe("ENCERRAMENTO");
    expect(estorno.estornoDeId).toBe(enc.lancamentoId);

    // e o SALDO governa: estornado, o encerramento pode ser REFEITO.
    const refeito = await encerrarControlesOrcamentarios(prisma, {
      exercicioId: exercicio2026,
      criadoPor: POR,
    });
    expect(refeito.encerradas).toHaveLength(7);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t4b — as guardas de sempre
  // ═══════════════════════════════════════════════════════════════════════════
  it("t4b: exercício ABERTO recusa; segunda chamada morre em 'nada a encerrar'; dupla anulação barrada", async () => {
    await cicloDe2026();
    await lancarControleDeRp();
    await semearDestinos();

    // exercício ainda CORRE — não se enterra o orçamento de um ano vivo
    await expect(
      encerrarControlesOrcamentarios(prisma, { exercicioId: exercicio2026, criadoPor: POR })
    ).rejects.toThrow(/NÃO está encerrado/);
    expect(await lancamentosDeEncerramento()).toBe(0);

    await encerrarExercicioComRestos(prisma, { ano: 2026, encerradoPor: POR });
    const enc = await encerrarControlesOrcamentarios(prisma, {
      exercicioId: exercicio2026, criadoPor: POR,
    });

    // IDEMPOTÊNCIA DERIVADA: o saldo já morreu, então não há o que encerrar.
    await expect(
      encerrarControlesOrcamentarios(prisma, { exercicioId: exercicio2026, criadoPor: POR })
    ).rejects.toThrow(/NADA A ENCERRAR/);

    await estornarEncerramentoControles(prisma, {
      operacaoId: enc.operacaoId, motivo: "estorno legítimo do teste", criadoPor: POR,
    });
    await expect(
      estornarEncerramentoControles(prisma, {
        operacaoId: enc.operacaoId, motivo: "a segunda anulação, que não pode existir",
        criadoPor: POR,
      })
    ).rejects.toThrow(/já foi estornad/);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t4d — A CORRIDA. Duas viradas concorrentes do MESMO exercício.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t4d: dois encerramentos CONCORRENTES do mesmo exercício -> um só grava (o lock do Exercicio)", async () => {
    await prepararCicloEncerrado();
    await semearDestinos();

    // ⚠️ SEM O LOCK, AS DUAS PASSAM. Cada transação lê o razão no estado em que ELA
    // começou, as duas veem D 100.000 na dotação, as duas decidem creditá-la — e o saldo
    // não fica zero: fica C 100.000. O ente "ganharia" 100.000 de dotação do nada. A
    // idempotência derivada do saldo não cobre isto: ela é SEQUENCIAL.
    const resultados = await Promise.allSettled([
      encerrarControlesOrcamentarios(prisma, { exercicioId: exercicio2026, criadoPor: POR }),
      encerrarControlesOrcamentarios(prisma, { exercicioId: exercicio2026, criadoPor: POR }),
    ]);

    const ok = resultados.filter((r) => r.status === "fulfilled");
    const falhou = resultados.filter((r) => r.status === "rejected");

    // Uma grava; a outra ESPERA no lock e, ao somar, já não acha saldo nenhum.
    expect(ok).toHaveLength(1);
    expect(falhou).toHaveLength(1);
    expect((falhou[0] as PromiseRejectedResult).reason.message).toMatch(/NADA A ENCERRAR/);

    // UM lançamento. E os saldos ZERADOS — não invertidos.
    expect(await lancamentosDeEncerramento()).toBe(1);
    const s = await saldos();
    expect(s.get(DOT_INICIAL) ?? "0.00").toBe("0.00");
    expect(s.get(C_DISPONIVEL) ?? "0.00").toBe("0.00");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t4c — 0(d): a apuração e o encerramento dos controles COMUTAM.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t4c: apuração e encerramento dos controles COMUTAM — conjuntos de contas disjuntos", async () => {
    await prepararCicloEncerrado();
    await semearDestinos();

    // ORDEM INVERTIDA: os controles PRIMEIRO, a apuração DEPOIS.
    const enc = await encerrarControlesOrcamentarios(prisma, {
      exercicioId: exercicio2026, criadoPor: POR,
    });
    const ap = await apurarResultadoDoExercicio(prisma, {
      exercicioId: exercicio2026, criadoPor: POR,
    });

    // O resultado apurado é o MESMO do t1 (a ordem não o toca): 8.000 − 2.500.
    expect(ap.resultadoApurado.toFixed(2)).toBe("5500.00");
    expect(enc.encerradas).toHaveLength(7);

    // ⚠️ E CADA UM SÓ TOCOU O SEU CONJUNTO. É isso que faz a ordem não importar.
    const partidasDe = async (origem: string): Promise<string[]> => {
      const l = await prisma.lancamentoContabil.findFirstOrThrow({
        where: { origemTipo: origem },
        select: { partidas: { select: { conta: { select: { codigo: true } } } } },
      });
      return [...new Set(l.partidas.map((p) => p.conta.codigo.charAt(0)))].sort();
    };
    expect(await partidasDe("APURACAO_RESULTADO")).toEqual(["2", "3", "4"]);
    expect(await partidasDe("ENCERRAMENTO_CONTROLES")).toEqual(["5", "6"]);
  });
});
