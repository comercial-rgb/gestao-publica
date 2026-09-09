import "dotenv/config";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";

/**
 * SEED DO PLANO DE CONTAS PCASP — MÍNIMO, E COM A PROCEDÊNCIA DE CADA LINHA.
 *
 * ═══ ⚠️ O QUE ESTE ARQUIVO CONSERTA ═══
 * Até a 7.2, `ContaPcasp` NÃO TINHA ORIGEM DE PRODUÇÃO: nascia em 55 arquivos, todos
 * `*.test.ts`. O banco da aplicação tinha três contas avulsas. Como `resolverContas`
 * é fail-closed, toda escrita da execução morria em "Conta(s) inexistente(s) no plano
 * PCASP" — foi o BLOQUEIO que a 7.1 nomeou e que este seed quita.
 *
 * ═══ ⚠️ A PROCEDÊNCIA MORA AQUI, NÃO NO BANCO ═══
 * `ContaPcasp` não tem coluna `origem`, e schema é intocável nesta sessão. Então a
 * procedência é ESTRUTURAL: duas listas exportadas, com nomes que dizem de onde cada
 * conta veio. Quem quiser auditar lê este arquivo — não um campo que precisaria de
 * migração para existir.
 *
 * `CONTAS_PCASP_STN` ......... extrato oficial STN/MCASP. São verdade.
 * `CONTAS_FIXTURE_A_CONFIRMAR` códigos herdados das FIXTURES. São a melhor
 *                              informação disponível, e podem estar errados.
 *
 * Pendência `PCASP-COMPLETO`: o xlsx PCASP Estendido 2026 da STN confirma ou corrige
 * a segunda lista e faz a primeira crescer.
 *
 * ═══ IDEMPOTENTE ═══
 * `upsert` por código. Rodar duas vezes não duplica nem reescreve o que já está certo
 * — o append-only vale para o NEGÓCIO; o plano de contas é CADASTRO.
 *
 * ⚠️ NÃO RODA EM TESTE. `test/limpar-banco.ts` trunca `ContaPcasp`; as fixtures são
 * donas do banco de teste e semeiam as próprias contas. Este seed é para dev/prod.
 */

export type NaturezaSaldo = "DEVEDORA" | "CREDORA";
export type IndicadorSuperavit = "F" | "P";

export interface ContaSeed {
  readonly codigo: string;
  readonly nome: string;
  readonly naturezaSaldo: NaturezaSaldo;
  readonly nivel: number;
  readonly analitica: boolean;
  readonly indicadorSuperavit?: IndicadorSuperavit;
  /** O código da conta PAI. `undefined` = raiz da árvore semeada. */
  readonly pai?: string;
}

/**
 * ═══ LISTA 1 — EXTRATO OFICIAL STN/MCASP ═══
 *
 * As sintéticas ancestrais entram porque a hierarquia (`contaPaiId`) precisa delas —
 * e porque uma analítica órfã é uma conta que nenhum balancete consegue agregar.
 * Sintética NÃO recebe partida (o adapter recusa, INVARIANTE 5).
 */
export const CONTAS_PCASP_STN: readonly ContaSeed[] = [
  // ── classe 5: controle da APROVAÇÃO do planejamento e orçamento ──
  { codigo: "5.0.0.0.0.00.00", nome: "Controles da Aprovação do Planejamento e Orçamento", naturezaSaldo: "DEVEDORA", nivel: 1, analitica: false },
  { codigo: "5.2.0.0.0.00.00", nome: "Orçamento Aprovado", naturezaSaldo: "DEVEDORA", nivel: 2, analitica: false, pai: "5.0.0.0.0.00.00" },
  { codigo: "5.2.2.0.0.00.00", nome: "Fixação da Despesa", naturezaSaldo: "DEVEDORA", nivel: 3, analitica: false, pai: "5.2.0.0.0.00.00" },
  { codigo: "5.2.2.1.0.00.00", nome: "Dotação Orçamentária", naturezaSaldo: "DEVEDORA", nivel: 4, analitica: false, pai: "5.2.2.0.0.00.00" },
  { codigo: "5.2.2.1.1.00.00", nome: "Dotação Inicial", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, pai: "5.2.2.1.0.00.00" },

  // ── classe 6: controle da EXECUÇÃO do planejamento e orçamento ──
  { codigo: "6.0.0.0.0.00.00", nome: "Controles da Execução do Planejamento e Orçamento", naturezaSaldo: "CREDORA", nivel: 1, analitica: false },
  { codigo: "6.2.0.0.0.00.00", nome: "Execução do Planejamento e Orçamento", naturezaSaldo: "CREDORA", nivel: 2, analitica: false, pai: "6.0.0.0.0.00.00" },

  // receita
  { codigo: "6.2.1.0.0.00.00", nome: "Execução da Receita", naturezaSaldo: "CREDORA", nivel: 3, analitica: false, pai: "6.2.0.0.0.00.00" },
  { codigo: "6.2.1.1.0.00.00", nome: "Receita a Realizar", naturezaSaldo: "CREDORA", nivel: 4, analitica: true, pai: "6.2.1.0.0.00.00" },
  { codigo: "6.2.1.2.0.00.00", nome: "Receita Realizada", naturezaSaldo: "DEVEDORA", nivel: 4, analitica: true, pai: "6.2.1.0.0.00.00" },

  // despesa
  { codigo: "6.2.2.0.0.00.00", nome: "Execução da Despesa", naturezaSaldo: "CREDORA", nivel: 3, analitica: false, pai: "6.2.0.0.0.00.00" },
  { codigo: "6.2.2.1.0.00.00", nome: "Disponibilidades por Destinação de Recursos", naturezaSaldo: "CREDORA", nivel: 4, analitica: false, pai: "6.2.2.0.0.00.00" },
  { codigo: "6.2.2.1.1.00.00", nome: "Crédito Disponível", naturezaSaldo: "CREDORA", nivel: 5, analitica: true, pai: "6.2.2.1.0.00.00" },
  { codigo: "6.2.2.1.3.00.00", nome: "Crédito Empenhado", naturezaSaldo: "CREDORA", nivel: 5, analitica: false, pai: "6.2.2.1.0.00.00" },
  { codigo: "6.2.2.1.3.01.00", nome: "Crédito Empenhado a Liquidar", naturezaSaldo: "CREDORA", nivel: 6, analitica: true, pai: "6.2.2.1.3.00.00" },
  // ⚠️ DORMENTE — SEM-ESTAGIO-EM-LIQUIDACAO. Uso facultativo no MCASP; este sistema
  // não a usa. Existe no PLANO (é oficial) e não em roteiro nenhum.
  { codigo: "6.2.2.1.3.02.00", nome: "Crédito Empenhado em Liquidação", naturezaSaldo: "CREDORA", nivel: 6, analitica: true, pai: "6.2.2.1.3.00.00" },
  { codigo: "6.2.2.1.3.03.00", nome: "Crédito Empenhado Liquidado a Pagar", naturezaSaldo: "CREDORA", nivel: 6, analitica: true, pai: "6.2.2.1.3.00.00" },
  { codigo: "6.2.2.1.3.04.00", nome: "Crédito Empenhado Liquidado Pago", naturezaSaldo: "CREDORA", nivel: 6, analitica: true, pai: "6.2.2.1.3.00.00" },

  // ── classe 7: o par DEVEDOR do controle de disponibilidade ──
  // ⚠️ Só a ARRECADAÇÃO a move (D 7.2.1.1 / C 8.2.1.1.1): é o único ato que traz
  // recurso novo. Nota do extrato: "detalhamento fino a confirmar no xlsx".
  { codigo: "7.0.0.0.0.00.00", nome: "Controles Devedores", naturezaSaldo: "DEVEDORA", nivel: 1, analitica: false },
  { codigo: "7.2.0.0.0.00.00", nome: "Execução da Programação Financeira", naturezaSaldo: "DEVEDORA", nivel: 2, analitica: false, pai: "7.0.0.0.0.00.00" },
  { codigo: "7.2.1.0.0.00.00", nome: "Disponibilidade de Recursos", naturezaSaldo: "DEVEDORA", nivel: 3, analitica: false, pai: "7.2.0.0.0.00.00" },
  { codigo: "7.2.1.1.0.00.00", nome: "Controle da Disponibilidade de Recursos", naturezaSaldo: "DEVEDORA", nivel: 4, analitica: true, pai: "7.2.1.0.0.00.00" },

  // ── classe 8: controle de DISPONIBILIDADE (DDR) ──
  { codigo: "8.0.0.0.0.00.00", nome: "Controles Credores", naturezaSaldo: "CREDORA", nivel: 1, analitica: false },
  { codigo: "8.2.0.0.0.00.00", nome: "Execução da Programação Financeira", naturezaSaldo: "CREDORA", nivel: 2, analitica: false, pai: "8.0.0.0.0.00.00" },
  { codigo: "8.2.1.0.0.00.00", nome: "Disponibilidade por Destinação de Recursos", naturezaSaldo: "CREDORA", nivel: 3, analitica: false, pai: "8.2.0.0.0.00.00" },
  { codigo: "8.2.1.1.0.00.00", nome: "DDR — Controle", naturezaSaldo: "CREDORA", nivel: 4, analitica: false, pai: "8.2.1.0.0.00.00" },
  { codigo: "8.2.1.1.1.00.00", nome: "DDR Disponível", naturezaSaldo: "CREDORA", nivel: 5, analitica: true, pai: "8.2.1.1.0.00.00" },
  { codigo: "8.2.1.1.2.01.00", nome: "DDR Comprometida por Empenho — a Liquidar", naturezaSaldo: "CREDORA", nivel: 6, analitica: true, pai: "8.2.1.1.0.00.00" },
  { codigo: "8.2.1.1.3.01.00", nome: "DDR Comprometida por Liquidação", naturezaSaldo: "CREDORA", nivel: 6, analitica: true, pai: "8.2.1.1.0.00.00" },
  { codigo: "8.2.1.1.4.01.00", nome: "DDR Utilizada — Execução Orçamentária", naturezaSaldo: "CREDORA", nivel: 6, analitica: true, pai: "8.2.1.1.0.00.00" },

  // ── patrimoniais confirmadas nesta sessão ──
  // PCASP 4.6.4: "compreende a contrapartida da desincorporação de passivos,
  // INCLUSIVE as baixas de passivo decorrentes do cancelamento de restos a pagar".
  { codigo: "4.0.0.0.0.00.00", nome: "Variações Patrimoniais Aumentativas", naturezaSaldo: "CREDORA", nivel: 1, analitica: false },
  { codigo: "4.6.0.0.0.00.00", nome: "Valorização e Ganhos com Ativos e Desincorporação de Passivos", naturezaSaldo: "CREDORA", nivel: 2, analitica: false, pai: "4.0.0.0.0.00.00" },
  { codigo: "4.6.4.0.0.00.00", nome: "Ganhos com Desincorporação de Passivos", naturezaSaldo: "CREDORA", nivel: 3, analitica: false, pai: "4.6.0.0.0.00.00" },
  { codigo: "4.6.4.1.1.00.00", nome: "Ganhos com Desincorporação de Passivos — Consolidação", naturezaSaldo: "CREDORA", nivel: 5, analitica: true, pai: "4.6.4.0.0.00.00" },

  { codigo: "1.0.0.0.0.00.00", nome: "Ativo", naturezaSaldo: "DEVEDORA", nivel: 1, analitica: false },
  { codigo: "1.1.0.0.0.00.00", nome: "Ativo Circulante", naturezaSaldo: "DEVEDORA", nivel: 2, analitica: false, pai: "1.0.0.0.0.00.00" },
  { codigo: "1.1.2.0.0.00.00", nome: "Créditos a Curto Prazo", naturezaSaldo: "DEVEDORA", nivel: 3, analitica: false, pai: "1.1.0.0.0.00.00" },
  { codigo: "1.1.2.2.0.00.00", nome: "Créditos Tributários a Receber", naturezaSaldo: "DEVEDORA", nivel: 4, analitica: false, pai: "1.1.2.0.0.00.00" },
  // ⚠️ ANALÍTICO A CONFIRMAR no xlsx PCASP Estendido — fonte secundária estadual
  // diverge no 4º dígito. A hierarquia (1.1.2 → 1.1.2.2) é firme; a folha, não.
  { codigo: "1.1.2.2.1.00.00", nome: "Créditos Tributários a Receber — Consolidação", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, indicadorSuperavit: "P", pai: "1.1.2.2.0.00.00" },
];

/**
 * ═══ LISTA 2 — HERDADAS DAS FIXTURES ═══
 *
 * ⚠️ ESTES CÓDIGOS NÃO SÃO OFICIAIS. São os que as fixtures usam desde o M04, e
 * viraram o plano de facto do projeto por falta de um plano de verdade. Entram no
 * seed para que a execução RODE, e ficam marcados para que ninguém os confunda com a
 * lista 1. O xlsx confirma ou corrige.
 *
 * ⚠️ DIVERGÊNCIA CONHECIDA — DUAS DISPONIBILIDADES. O M04 arrecada em
 * `1.1.1.1.1.00.00` (Caixa) e o M05 paga por `1.1.1.1.2.00.00` (Bancos). As duas
 * entram, porque as fixtures das duas rodam; mas o ente tem UM caixa e UM banco, e
 * uma das duas provavelmente está no lugar errado. Não dá para decidir sem o plano
 * oficial — e chutar aqui faria o Balanço Financeiro somar dois saldos que são o
 * mesmo dinheiro.
 */
export const CONTAS_FIXTURE_A_CONFIRMAR: readonly ContaSeed[] = [
  { codigo: "1.1.1.0.0.00.00", nome: "Caixa e Equivalentes de Caixa", naturezaSaldo: "DEVEDORA", nivel: 3, analitica: false, pai: "1.1.0.0.0.00.00" },
  { codigo: "1.1.1.1.1.00.00", nome: "Caixa", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, indicadorSuperavit: "F", pai: "1.1.1.0.0.00.00" },
  { codigo: "1.1.1.1.2.00.00", nome: "Bancos Conta Movimento", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, indicadorSuperavit: "F", pai: "1.1.1.0.0.00.00" },
  { codigo: "1.1.5.0.0.00.00", nome: "Estoques", naturezaSaldo: "DEVEDORA", nivel: 3, analitica: false, pai: "1.1.0.0.0.00.00" },
  { codigo: "1.1.5.1.1.00.00", nome: "Almoxarifado", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, indicadorSuperavit: "P", pai: "1.1.5.0.0.00.00" },

  { codigo: "2.0.0.0.0.00.00", nome: "Passivo e Patrimônio Líquido", naturezaSaldo: "CREDORA", nivel: 1, analitica: false },
  { codigo: "2.1.0.0.0.00.00", nome: "Passivo Circulante", naturezaSaldo: "CREDORA", nivel: 2, analitica: false, pai: "2.0.0.0.0.00.00" },
  { codigo: "2.1.1.0.0.00.00", nome: "Obrigações Trabalhistas e Previdenciárias a Pagar", naturezaSaldo: "CREDORA", nivel: 3, analitica: false, pai: "2.1.0.0.0.00.00" },
  { codigo: "2.1.1.1.0.00.00", nome: "Pessoal a Pagar", naturezaSaldo: "CREDORA", nivel: 4, analitica: true, indicadorSuperavit: "F", pai: "2.1.1.0.0.00.00" },
  { codigo: "2.1.3.0.0.00.00", nome: "Fornecedores e Contas a Pagar", naturezaSaldo: "CREDORA", nivel: 3, analitica: false, pai: "2.1.0.0.0.00.00" },
  { codigo: "2.1.3.1.1.00.00", nome: "Fornecedores a Pagar — Consolidação", naturezaSaldo: "CREDORA", nivel: 5, analitica: true, indicadorSuperavit: "F", pai: "2.1.3.0.0.00.00" },
  { codigo: "2.1.8.0.0.00.00", nome: "Demais Obrigações a Curto Prazo", naturezaSaldo: "CREDORA", nivel: 3, analitica: false, pai: "2.1.0.0.0.00.00" },
  { codigo: "2.1.8.8.1.01.00", nome: "Consignações", naturezaSaldo: "CREDORA", nivel: 6, analitica: true, indicadorSuperavit: "F", pai: "2.1.8.0.0.00.00" },
  { codigo: "2.2.0.0.0.00.00", nome: "Passivo Não Circulante", naturezaSaldo: "CREDORA", nivel: 2, analitica: false, pai: "2.0.0.0.0.00.00" },
  { codigo: "2.2.1.0.0.00.00", nome: "Obrigações a Longo Prazo", naturezaSaldo: "CREDORA", nivel: 3, analitica: false, pai: "2.2.0.0.0.00.00" },
  { codigo: "2.2.1.1.1.00.00", nome: "Dívida Fundada Interna", naturezaSaldo: "CREDORA", nivel: 5, analitica: true, indicadorSuperavit: "P", pai: "2.2.1.0.0.00.00" },

  // RÓTULO adotado do oficial (Pcasp_2025.xlsx, cód. 300000000 = "VARIAÇÃO PATRIMONIAL DIMINUTIVA",
  // singular). Decisão do Winner na S-massa — era divergência de rótulo, não estrutural.
  { codigo: "3.0.0.0.0.00.00", nome: "Variação Patrimonial Diminutiva", naturezaSaldo: "DEVEDORA", nivel: 1, analitica: false },
  { codigo: "3.3.0.0.0.00.00", nome: "Uso de Bens, Serviços e Consumo de Capital Fixo", naturezaSaldo: "DEVEDORA", nivel: 2, analitica: false, pai: "3.0.0.0.0.00.00" },
  { codigo: "3.3.2.0.0.00.00", nome: "Serviços", naturezaSaldo: "DEVEDORA", nivel: 3, analitica: false, pai: "3.3.0.0.0.00.00" },
  { codigo: "3.3.2.1.1.01.00", nome: "Serviços de Terceiros — Pessoa Jurídica", naturezaSaldo: "DEVEDORA", nivel: 6, analitica: true, pai: "3.3.2.0.0.00.00" },

  { codigo: "4.1.0.0.0.00.00", nome: "Impostos, Taxas e Contribuições de Melhoria", naturezaSaldo: "CREDORA", nivel: 2, analitica: false, pai: "4.0.0.0.0.00.00" },
  { codigo: "4.1.1.0.0.00.00", nome: "Impostos", naturezaSaldo: "CREDORA", nivel: 3, analitica: false, pai: "4.1.0.0.0.00.00" },
  { codigo: "4.1.1.2.1.01.00", nome: "VPA — Impostos sobre o Patrimônio", naturezaSaldo: "CREDORA", nivel: 6, analitica: true, pai: "4.1.1.0.0.00.00" },

  // ⚠️ FORA DO EXTRATO: o extrato cobre crédito disponível e empenhado (.01-.04),
  // e NÃO menciona reservado nem dotação adicional. Os códigos vêm das fixtures.
  { codigo: "5.2.2.1.2.00.00", nome: "Dotação Adicional", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, pai: "5.2.2.1.0.00.00" },
  { codigo: "6.2.2.1.2.00.00", nome: "Crédito Reservado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true, pai: "6.2.2.1.0.00.00" },
];

/** As duas listas, na ordem em que a hierarquia se resolve (pai antes de filha). */
export const PLANO_MINIMO: readonly ContaSeed[] = [
  ...CONTAS_PCASP_STN,
  ...CONTAS_FIXTURE_A_CONFIRMAR,
];

export interface ResultadoSeedPcasp {
  readonly criadas: number;
  readonly atualizadas: number;
  readonly total: number;
}

/**
 * Semeia o plano mínimo. Idempotente: `upsert` por código, e o `contaPaiId` é
 * resolvido numa 2ª passada — a árvore não depende da ordem do array.
 */
export async function semearPcasp(
  prisma: ReturnType<typeof criarPrismaClient>
): Promise<ResultadoSeedPcasp> {
  const antes = new Set(
    (await prisma.contaPcasp.findMany({ select: { codigo: true } })).map(
      (c) => c.codigo
    )
  );

  // 1ª passada: as contas, sem o pai (a pai pode ainda não existir).
  for (const c of PLANO_MINIMO) {
    const dados = {
      nome: c.nome,
      naturezaSaldo: c.naturezaSaldo,
      nivel: c.nivel,
      analitica: c.analitica,
      ...(c.indicadorSuperavit !== undefined
        ? { indicadorSuperavit: c.indicadorSuperavit }
        : {}),
    };
    await prisma.contaPcasp.upsert({
      where: { codigo: c.codigo },
      update: dados,
      create: { codigo: c.codigo, ...dados },
    });
  }

  // 2ª passada: a hierarquia, agora que todas existem.
  const porCodigo = new Map(
    (await prisma.contaPcasp.findMany({ select: { id: true, codigo: true } })).map(
      (c) => [c.codigo, c.id]
    )
  );
  for (const c of PLANO_MINIMO) {
    if (c.pai === undefined) continue;
    const paiId = porCodigo.get(c.pai);
    if (paiId === undefined) {
      throw new Error(
        `Conta ${c.codigo} declara pai ${c.pai}, que não está no plano mínimo. ` +
          `Uma analítica órfã não agrega em balancete nenhum.`
      );
    }
    await prisma.contaPcasp.update({
      where: { codigo: c.codigo },
      data: { contaPaiId: paiId },
    });
  }

  const criadas = PLANO_MINIMO.filter((c) => !antes.has(c.codigo)).length;
  return {
    criadas,
    atualizadas: PLANO_MINIMO.length - criadas,
    total: PLANO_MINIMO.length,
  };
}

/** Execução direta: `npm run seed:pcasp`. */
if (process.argv[1]?.includes("pcasp")) {
  const url = process.env["DATABASE_URL"];
  if (url === undefined || url === "") {
    throw new Error("DATABASE_URL não configurada — o seed não tem banco.");
  }
  const prisma = criarPrismaClient(url);
  const r = await semearPcasp(prisma);
  console.log(
    `[seed:pcasp] ${r.total} contas (${CONTAS_PCASP_STN.length} STN + ` +
      `${CONTAS_FIXTURE_A_CONFIRMAR.length} a confirmar) — ` +
      `${r.criadas} criada(s), ${r.atualizadas} já existia(m).`
  );
  await prisma.$disconnect();
}
