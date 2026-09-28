import "dotenv/config";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";

/**
 * ═══ A CLASSIFICAÇÃO FINANCEIRO/PERMANENTE (art. 105) DAS CONTAS DO AMBIENTE DE DEMONSTRAÇÃO ═══
 *
 * ⚠️ POR QUE ESTE ARQUIVO EXISTE, E O QUE ELE **NÃO** É.
 *
 * O Balanço Patrimonial RECUSA emitir quando uma conta patrimonial COM SALDO não está classificada
 * como FINANCEIRO ou PERMANENTE, e a recusa está certa: sem o indicador não há como dizer se o
 * superávit financeiro conta com aquela conta — e é com esse superávit que se abre crédito
 * adicional. Medido neste banco: o Anexo 14 não saía, com a mensagem nomeando a conta.
 *
 * A LACUNA REAL, NOMEADA: o atributo F/P **não existe em nenhuma fonte local**. O
 * `Pcasp_2025.xlsx` do TCE-PB não o traz (o próprio `seed:pcasp-oficial` registra isso e deixa a
 * coluna nula de propósito, porque "uma letra chutada aqui classificaria errado o superávit
 * financeiro"), e a STN publica o PCASP num sistema interativo, não em arquivo conferível por
 * hash. Além disso o produto **não tem tela** para o operador classificar conta: a de
 * `/contabilidade/plano-de-contas` apenas EXIBE o indicador, e mostra "—" quando ele é nulo.
 * Essa ausência de superfície é pendência de produto, registrada no checkpoint, não resolvida aqui.
 *
 * ⚠️ E POR QUE NÃO UMA REGRA POR PREFIXO. Seria uma linha de código e estaria errado: o módulo do
 * Anexo 14 avisa que o indicador é PARÂMETRO do ente e não derivação do código — "o `1.1.3` de um
 * ente pode ser crédito a curto prazo e o de outro pode não ser". Classificar 7.864 contas por
 * padrão de código seria inventar o plano de um município inteiro.
 *
 * ═══ O QUE ELE FAZ, ENTÃO ═══
 * Classifica SÓ as contas que têm saldo neste ambiente sintético, uma a uma, cada uma com o
 * dispositivo que sustenta a escolha. É o ato que o contador do ente faria na tela que falta —
 * aqui declarado como configuração de DEMONSTRAÇÃO, e identificado como tal.
 *
 * ⚠️ FAIL-CLOSED: se aparecer conta com saldo que este arquivo não classifica, ele PARA nomeando a
 * conta, em vez de deixá-la nula (o balanço não sairia) ou de chutar uma letra. Nova conta com
 * saldo é decisão de classificação, e decisão de classificação não se toma por omissão.
 *
 * Uso:  npx tsx prisma/seed/m12-indicador-superavit-demo.ts
 */

/**
 * O critério do art. 105 da Lei 4.320/64, aplicado conta a conta:
 *
 *   § 1º e § 3º — FINANCEIRO: realizável (ativo) ou exigível (passivo) INDEPENDENTEMENTE de
 *                 autorização orçamentária;
 *   § 2º e § 4º — PERMANENTE: cuja mobilização (ativo) ou amortização (passivo) DEPENDE de
 *                 autorização legislativa.
 */
const CLASSIFICACAO: readonly {
  readonly codigo: string;
  readonly indicador: "F" | "P";
  readonly fundamento: string;
}[] = [
  {
    codigo: "1.1.1.1.1.19.00",
    indicador: "F",
    fundamento:
      "disponibilidade em conta bancária — realizável independentemente de autorização " +
      "orçamentária (art. 105, § 1º)",
  },
  {
    codigo: "1.1.1.1.1.50.00",
    indicador: "F",
    fundamento:
      "aplicação financeira de liquidez imediata — disponibilidade, realizável " +
      "independentemente de autorização orçamentária (art. 105, § 1º)",
  },
  {
    codigo: "2.1.3.1.1.01.01",
    indicador: "F",
    fundamento:
      "fornecedor a pagar por despesa já empenhada e liquidada — o pagamento não depende de " +
      "nova autorização orçamentária; é a dívida flutuante do art. 92 (art. 105, § 3º)",
  },
  {
    codigo: "2.1.1.1.1.01.01",
    indicador: "F",
    fundamento:
      "salários e remunerações a pagar da folha já empenhada e liquidada — o pagamento não " +
      "depende de nova autorização orçamentária; é a dívida flutuante do art. 92 (art. 105, § 3º)",
  },
  {
    codigo: "1.2.3.1.1.01.01",
    indicador: "P",
    fundamento:
      "bem móvel do imobilizado — a mobilização depende de autorização legislativa " +
      "(art. 105, § 2º)",
  },
  {
    codigo: "1.2.3.8.1.01.01",
    indicador: "P",
    fundamento:
      "depreciação acumulada: conta RETIFICADORA do imobilizado, e acompanha a natureza da " +
      "conta que reduz — classificá-la como financeira tiraria do permanente a redução do " +
      "próprio permanente (art. 105, § 2º)",
  },
  {
    codigo: "2.1.1.4.3.01.01",
    indicador: "F",
    fundamento:
      "contribuição patronal ao RGPS a recolher sobre a folha já empenhada e liquidada — o " +
      "recolhimento não depende de nova autorização orçamentária; é a dívida flutuante do art. 92 " +
      "(art. 105, § 3º)",
  },
  {
    codigo: "2.1.8.8.1.02.00",
    indicador: "F",
    fundamento:
      "garantia/caução recebida de terceiro: passivo extraorçamentário, exigível " +
      "independentemente de autorização orçamentária — devolver a caução não pede dotação " +
      "(art. 105, § 3º)",
  },
];

async function main(): Promise<void> {
  const url = process.env["DATABASE_URL"];
  if (url === undefined || url === "") throw new Error("DATABASE_URL não definida. Nada foi feito.");
  const prisma = criarPrismaClient(url);

  try {
    // As contas patrimoniais (classes 1 e 2) que de fato têm saldo — a mesma população que o
    // motor do Anexo 14 examina. Conta zerada não precisa de indicador: ela não leva dinheiro
    // nenhum para lado nenhum do balanço.
    const comSaldo = await prisma.$queryRawUnsafe<{ codigo: string; nome: string }[]>(`
      select ct.codigo, ct.nome
      from "PartidaContabil" pc
      join "ContaPcasp" ct on ct.id = pc."contaId"
      where ct.codigo like '1.%' or ct.codigo like '2.%'
      group by ct.codigo, ct.nome
      having sum(case when pc.tipo = 'DEBITO' then pc.valor else -pc.valor end) <> 0
      order by ct.codigo
    `);

    const declaradas = new Set(CLASSIFICACAO.map((c) => c.codigo));
    const semFundamento = comSaldo.filter((c) => !declaradas.has(c.codigo));
    if (semFundamento.length > 0) {
      throw new Error(
        `CONTA COM SALDO E SEM CLASSIFICAÇÃO FUNDAMENTADA neste arquivo:\n` +
          semFundamento.map((c) => `  · ${c.codigo} ${c.nome}`).join("\n") +
          `\nClassificar como FINANCEIRO ou PERMANENTE é decisão do art. 105 e precisa de ` +
          `fundamento por conta — não se resolve por prefixo nem por omissão. Declare cada uma ` +
          `em CLASSIFICACAO, com o dispositivo. Nada foi feito.`
      );
    }

    let aplicadas = 0;
    for (const c of CLASSIFICACAO) {
      const conta = await prisma.contaPcasp.findUnique({
        where: { codigo: c.codigo },
        select: { id: true, nome: true, indicadorSuperavit: true },
      });
      if (conta === null) {
        console.log(`[m12] ${c.codigo} não existe neste plano — ignorada (nada a classificar).`);
        continue;
      }
      if (conta.indicadorSuperavit === c.indicador) {
        console.log(`[m12] ${c.codigo} já é ${c.indicador} — inalterada.`);
        continue;
      }
      if (conta.indicadorSuperavit !== null) {
        // ⚠️ NÃO SOBRESCREVE classificação divergente já declarada: ela pode ser a decisão do
        // ente, e trocá-la em silêncio mudaria o superávit financeiro dele.
        throw new Error(
          `${c.codigo} já está classificada como ${conta.indicadorSuperavit} e este arquivo diz ` +
            `${c.indicador}. Sobrescrever mudaria o superávit financeiro sem ninguém decidir. ` +
            `Resolva a divergência antes. Nada mais foi feito.`
        );
      }
      await prisma.contaPcasp.update({
        where: { id: conta.id },
        data: { indicadorSuperavit: c.indicador },
      });
      aplicadas += 1;
      console.log(`[m12] ${c.codigo} ${conta.nome}\n        -> ${c.indicador} (${c.fundamento})`);
    }

    console.log(
      `[m12] classificação de DEMONSTRAÇÃO aplicada: ${aplicadas} conta(s); ` +
        `${comSaldo.length} conta(s) patrimoniais com saldo neste ambiente.`
    );
  } finally {
    await prisma.$disconnect();
  }
}

await main();
