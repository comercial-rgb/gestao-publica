import { cliente, PortaSemBancoError } from "./cliente";
import {
  composicaoDoRecolhimento,
  conferirComposicaoExtra,
  listarTiposConsignacao,
  listarSaldosExtra,
  listarRetencoes,
  listarDispendios,
  retencoesComSaldo,
} from "../../modules/m07-extraorcamentario/consultas";
import { estornarMovimentoExtra, registrarDispendioExtra, registrarIngressoExtra } from "../../modules/m07-extraorcamentario/extraorcamentario";
import { roteiroDispendioExtra, roteiroIngressoExtra } from "../../modules/m07-extraorcamentario/dominio";
import { toMoney } from "../../packages/contracts/index";
import { meioDiaCivil } from "../../packages/datas/index";
import { comEscritaAutenticada } from "./sessao";

/**
 * PORTA — EXTRAORÇAMENTÁRIO (M07, TR 5.39–5.49). A tela consome ISTO (grep trivalente): o domínio
 * (modules/m07-extraorcamentario) nunca é importado por app/ direto. LEITURA: os saldos por
 * consignatário, as retenções (com drill ao pagamento/empenho, TR 5.25) e as despesas extra. O
 * cadastro/lançamento é do domínio (M07/M05) — esta fatia expõe a consulta.
 *
 * ⚠️ E DESDE A V15 ELA TAMBÉM ESCREVE UMA COISA: o RECOLHIMENTO com a sua composição por origem
 * (C34). Não por ampliação de escopo — porque o vínculo que o C34 pede só existe no ato de
 * recolher, e recolher não existia em nenhuma tela. Entregar a tabela de alocação sem o ato que a
 * alimenta repetiria o defeito que a unidade dos restos a pagar existiu para consertar.
 */

export { PortaSemBancoError };
export type {
  TipoConsignacaoNaLista,
  SaldoConsignatarioNaLista,
  RetencaoNaLista,
  DispendioNaLista,
} from "../../modules/m07-extraorcamentario/consultas";

export async function lerEventosExtra() {
  return listarTiposConsignacao(cliente());
}

export async function lerSaldosExtra() {
  return listarSaldosExtra(cliente());
}

export async function lerRetencoes(p: { readonly exercicio: number }) {
  return listarRetencoes(cliente(), { exercicio: p.exercicio });
}

export async function lerDispendiosExtra(p: { readonly exercicio: number }) {
  return listarDispendios(cliente(), { exercicio: p.exercicio });
}

// ═══════════════════════════════════════════════════════════════════════════
// C34/C37 — A COMPOSIÇÃO DO RECOLHIMENTO, E O RECOLHIMENTO PELA TELA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ POR QUE A ESCRITA DO RECOLHIMENTO NASCE AQUI, E NÃO NUMA UNIDADE SEPARADA.
 *
 * O C34 pede vincular o recolhimento às retenções que ele quita. O vínculo só existe no ato de
 * recolher — e recolher não existia na interface: a tela de extraorçamentário era leitura, e a de
 * consignações só cadastra TIPOS. Entregar a tabela de alocação sem o ato que a alimenta repetiria
 * exatamente o que a unidade dos restos a pagar existiu para consertar: motor maduro que nenhuma
 * tela alcança.
 *
 * ⚠️ E AQUI A COMPOSIÇÃO É OBRIGATÓRIA, ao contrário do domínio. No domínio ela é opcional porque
 * há recolhimentos gravados antes dela existir. Pela tela, a partir de agora, todo recolhimento
 * diz de onde saiu — e a consulta NOMEIA os antigos sem composição em vez de escondê-los.
 */

/** A conta de passivo VIGENTE do tipo de consignação. Recusa nomeando, nunca supõe. */
async function contaDoPassivoVigente(tipoConsignacaoId: string): Promise<string> {
  const t = await cliente().tipoConsignacao.findUnique({
    where: { id: tipoConsignacaoId },
    select: {
      codigo: true,
      descricao: true,
      ativo: true,
      contaPassivo: { select: { codigo: true } },
      // A DECISÃO versionada vence o campo antigo: a vigente é a última.
      decisoes: {
        orderBy: { criadoEm: "desc" },
        take: 1,
        select: { contaPassivo: { select: { codigo: true } } },
      },
    },
  });
  if (t === null) throw new Error("O tipo de consignação informado não existe. Nada foi gravado.");
  const conta = t.decisoes[0]?.contaPassivo ?? t.contaPassivo;
  if (conta === null || conta === undefined) {
    throw new Error(
      `A consignação ${t.codigo} ("${t.descricao}") não tem conta de passivo informada, e sem ela o ` +
        `recolhimento não sabe que obrigação está baixando. Informe a conta em Financeiro / ` +
        `Consignações antes de recolher. Nada foi gravado.`
    );
  }
  return conta.codigo;
}

/** A conta contábil da conta bancária escolhida. Mesma recusa nomeada dos restos a pagar. */
async function contaContabilDaConta(codigo: string): Promise<string> {
  const c = await cliente().contaBancaria.findUnique({
    where: { codigo },
    select: { codigo: true, descricao: true, fonteId: true, contaContabil: { select: { codigo: true } } },
  });
  if (c === null) throw new Error(`A conta bancária "${codigo}" não está cadastrada. Nada foi gravado.`);
  if (c.contaContabil === null) {
    throw new Error(
      `A conta bancária ${c.codigo} ("${c.descricao}") não tem conta contábil informada, e sem ela o ` +
        `recolhimento não sabe de onde o dinheiro saiu. Informe a conta contábil desta conta em ` +
        `Financeiro / Contas bancárias. Nada foi gravado.`
    );
  }
  return c.contaContabil.codigo;
}

export async function lerConferenciaDaComposicao() {
  return conferirComposicaoExtra(cliente());
}

export async function lerRetencoesComSaldo(p: {
  readonly tipoConsignacaoCodigo: string;
  readonly credorConsignatario: string;
}) {
  const tipo = await cliente().tipoConsignacao.findUnique({
    where: { codigo: p.tipoConsignacaoCodigo },
    select: { id: true },
  });
  if (tipo === null) return [];
  return retencoesComSaldo(cliente(), {
    tipoConsignacaoId: tipo.id,
    credorConsignatario: p.credorConsignatario,
  });
}

export async function lerComposicaoDoRecolhimento(recolhimentoId: string) {
  return composicaoDoRecolhimento(cliente(), recolhimentoId);
}

/** As contas bancárias oferecidas no recolhimento — com a fonte, que o ato exige. */
export async function lerContasParaRecolhimento(): Promise<
  readonly { readonly codigo: string; readonly descricao: string; readonly fonteId: string; readonly fonteCodigo: string }[]
> {
  const contas = await cliente().contaBancaria.findMany({
    orderBy: { codigo: "asc" },
    select: { codigo: true, descricao: true, fonteId: true, fonte: { select: { codigo: true } } },
  });
  return contas.map((c) => ({
    codigo: c.codigo,
    descricao: c.descricao,
    fonteId: c.fonteId,
    fonteCodigo: c.fonte.codigo,
  }));
}

export async function registrarRecolhimento(input: {
  readonly tipoConsignacaoCodigo: string;
  readonly credorConsignatario: string;
  readonly contaBancaria: string;
  readonly data: string;
  readonly historico: string;
  /** As parcelas: de quais retenções sai cada centavo. Obrigatórias pela tela. */
  readonly parcelas: readonly { readonly ingressoId: string; readonly valor: string }[];
}): Promise<string> {
  const prisma = cliente();
  const tipo = await prisma.tipoConsignacao.findUnique({
    where: { codigo: input.tipoConsignacaoCodigo },
    select: { id: true },
  });
  if (tipo === null) throw new Error("O tipo de consignação informado não existe. Nada foi gravado.");

  const parcelas = input.parcelas.filter((p) => p.valor.trim() !== "");
  if (parcelas.length === 0) {
    throw new Error(
      "Informe de quais retenções sai este recolhimento. Um recolhimento sem composição não tem " +
        "como ser conciliado por origem. Nada foi gravado."
    );
  }

  // ⚠️ O VALOR DO RECOLHIMENTO É A SOMA DAS PARCELAS, e não um campo à parte. Um total digitado ao
  // lado da composição criaria duas verdades sobre o mesmo dinheiro — e a recusa do domínio ("a
  // composição não fecha") apareceria como erro de digitação em vez de como o que é.
  const valores = parcelas.map((p) => ({
    ingressoId: p.ingressoId,
    valor: dinheiroDoFormularioExtra(p.valor),
  }));
  let total = toMoney("0.00");
  for (const v of valores) total = toMoney(total.plus(toMoney(v.valor)));

  const [consignacaoAPagar, disponibilidade, conta] = await Promise.all([
    contaDoPassivoVigente(tipo.id),
    contaContabilDaConta(input.contaBancaria),
    prisma.contaBancaria.findUnique({ where: { codigo: input.contaBancaria }, select: { fonteId: true } }),
  ]);
  if (conta === null) throw new Error(`A conta bancária "${input.contaBancaria}" não está cadastrada.`);

  await comEscritaAutenticada("REGISTRAR_DISPENDIO_EXTRA", (criadoPor) =>
    registrarDispendioExtra(
      prisma,
      {
        tipoConsignacaoId: tipo.id,
        credorConsignatario: input.credorConsignatario,
        contaBancaria: input.contaBancaria,
        fonteId: conta.fonteId,
        valor: total.toFixed(2),
        data: meioDiaCivil(input.data), // dia civil do ente, nunca meia-noite UTC (caía no dia anterior)
        historico: input.historico,
        criadoPor,
        alocacoes: valores,
      } as never,
      roteiroDispendioExtra({ consignacaoAPagar, disponibilidade })
    )
  );
  return (
    `Recolhimento de ${total.toFixed(2)} registrado, composto de ${valores.length} ` +
    `retenç${valores.length === 1 ? "ão" : "ões"}. O que cada uma ainda tem a recolher já reflete esta guia.`
  );
}

/**
 * V22 rodada 7 — O INGRESSO AVULSO (caução, depósito de terceiro, consignação recebida fora da folha).
 *
 * ⚠️ ELE EXISTIA NO DOMÍNIO E NÃO TINHA BORDA, como o estorno tinha deixado de ter na V19: a tela só
 * mostrava a retenção que nascia do pagamento, e um depósito de caução não tinha por onde entrar. As
 * contas vêm do CADASTRO — o passivo do tipo de consignação vigente e a contábil da conta bancária —,
 * no mesmo molde da guia de recolhimento; a fonte é a da conta, e o domínio confere que ela está no rol.
 */
export async function registrarIngressoManual(input: {
  readonly tipoConsignacaoCodigo: string;
  readonly credorConsignatario: string;
  /** V23 — obrigatório na tela: o Tribunal de Contas recebe o CPF/CNPJ de quem entregou o valor. */
  readonly documentoDoContribuinte: string;
  readonly contaBancaria: string;
  readonly valor: string;
  readonly data: string;
  readonly historico: string;
}): Promise<string> {
  const prisma = cliente();
  const tipo = await prisma.tipoConsignacao.findUnique({ where: { codigo: input.tipoConsignacaoCodigo }, select: { id: true } });
  if (tipo === null) throw new Error("O tipo de consignação informado não existe. Nada foi gravado.");
  const [consignacaoAPagar, disponibilidade, conta] = await Promise.all([
    contaDoPassivoVigente(tipo.id),
    contaContabilDaConta(input.contaBancaria),
    prisma.contaBancaria.findUnique({ where: { codigo: input.contaBancaria }, select: { fonteId: true } }),
  ]);
  if (conta === null) throw new Error(`A conta bancária "${input.contaBancaria}" não está cadastrada.`);
  const valor = dinheiroDoFormularioExtra(input.valor);
  await comEscritaAutenticada("REGISTRAR_INGRESSO_EXTRA", (criadoPor) =>
    registrarIngressoExtra(
      prisma,
      { tipoConsignacaoId: tipo.id, credorConsignatario: input.credorConsignatario, documentoDoContribuinte: input.documentoDoContribuinte, contaBancaria: input.contaBancaria, fonteId: conta.fonteId, valor, data: meioDiaCivil(input.data), historico: input.historico, criadoPor },
      roteiroIngressoExtra({ disponibilidade, consignacaoAPagar })
    )
  );
  return `Ingresso de ${toMoney(valor).toFixed(2)} registrado. A obrigação de repassá-lo passa a constar do saldo a recolher.`;
}

/**
 * ESTORNA um movimento extraorçamentário — o ingresso ou o recolhimento, pelo ato inverso.
 *
 * ⚠️ ELE EXISTIA NO DOMÍNIO E NÃO TINHA BORDA (V19). `estornarMovimentoExtra` está no censo desde
 * que nasceu, com ação própria, e nenhuma porta o expunha: a coluna "Estorno" da tela era só
 * EXIBIÇÃO do que um script tivesse feito. O cenário de apresentação pede, com estas palavras,
 * *"estornar somente este recolhimento de 100,00; saldo volta a 300,00"* — e isso não tinha caminho
 * pela interface.
 *
 * ⚠️ O ESTORNO É ATO NOVO, NUNCA APAGAMENTO: o original fica, o estorno referencia, e o saldo a
 * recolher volta pela soma. É a mesma doutrina do estorno no razão — e é ela que faz a composição
 * por origem continuar explicando de onde cada centavo saiu.
 */
export async function estornarMovimentoExtraorcamentario(input: {
  readonly movimentoId: string;
  readonly data: string;
  readonly motivo: string;
}): Promise<string> {
  const r = await comEscritaAutenticada("ESTORNAR_MOVIMENTO_EXTRA", (criadoPor) =>
    estornarMovimentoExtra(cliente(), {
      movimentoId: input.movimentoId,
      data: meioDiaCivil(input.data), // dia civil do ente, nunca meia-noite UTC (caía no dia anterior)
      motivo: input.motivo,
      criadoPor,
    })
  );
  return (
    `Estorno registrado (movimento ${r.movimentoId}). O original continua na lista, e o saldo a ` +
    `recolher da origem voltou a considerar este valor.`
  );
}

/**
 * ⚠️ MESMA CONVERSÃO CONDICIONAL DA PORTA DOS RESTOS A PAGAR, e pelo mesmo motivo medido: tirar
 * todos os pontos sempre transformaria "400.00" em "40000", um erro de fator 100 que balanceia e
 * passa por todo guard. Só há separador de milhar quando há vírgula decimal.
 */
function dinheiroDoFormularioExtra(valor: string): string {
  const t = valor.trim();
  const normalizado = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  if (!/^\d+(\.\d{1,2})?$/.test(normalizado)) {
    throw new Error(
      `O valor "${valor}" não é um valor em reais. Use o formato 1.234,56. Nada foi gravado.`
    );
  }
  return normalizado;
}
