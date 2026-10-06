import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";

/**
 * O CADASTRO DE UMA CONTA BANCÁRIA NOVA — V36 (TR 5.10.2.6).
 *
 * ═══ ⚠️ POR QUE ISTO SÓ NASCEU AGORA ═══
 * Até a V36 nenhuma conta bancária nascia pela tela: o semeador da implantação e os testes eram os
 * únicos que a criavam. O titular (V11) e o rol de fontes (V16) ganharam cadastro, mas sobre contas
 * que já existiam — um ente que abrisse uma conta nova no meio do exercício dependia de suporte.
 *
 * ═══ O QUE O CADASTRO EXIGE, E POR QUÊ ═══
 *   1. **a conta contábil do PCASP, analítica e do grupo 1.1.1** (caixa e equivalentes de caixa —
 *      MCASP, Parte IV; o mesmo recorte do termo de conferência de caixa em `demonstrativos-da-pca`).
 *      A coluna é nula no modelo por causa do legado (migration aditiva sem default); na conta NOVA
 *      ela é obrigatória, porque a conciliação falha sem ela e o pagamento não teria onde creditar.
 *      É o operador que escolhe a conta, da tabela — o sistema não sugere nenhuma.
 *   2. **a fonte padrão, do cadastro de fontes.** Ela entra também como primeira linha do ROL,
 *      exatamente como o backfill da ADR multifonte fez com as contas antigas: rol e coluna dizendo
 *      a mesma coisa desde o primeiro dia.
 *   3. **banco (3 dígitos), agência e conta, só dígitos.** É o que o extrato e o arquivo do Tribunal
 *      identificam; a máscara é da tela. Os dígitos verificadores são opcionais aqui — quem exporta
 *      ao Tribunal recusa a conta sem eles, nomeando-a.
 *   4. **a mesma conta física não se cadastra duas vezes.** Banco, agência e conta repetidos sob
 *      outro código fariam o mesmo extrato conciliar duas contas do razão.
 *
 * O titular e a ampliação do rol continuam atos próprios, com as ações deles.
 */

/** Caixa e equivalentes de caixa — o grupo 1.1.1 do PCASP (MCASP, Parte IV). */
const PREFIXO_DAS_DISPONIBILIDADES = "1.1.1.";

const soDigitos = (nome: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .regex(new RegExp(`^\\d{${String(min)},${String(max)}}$`), `${nome}: só dígitos, de ${String(min)} a ${String(max)}`);

const digitoVerificador = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[0-9X]{0,2}$/, "dígito verificador: até dois caracteres, número ou X")
  .optional()
  .transform((v) => (v === undefined || v === "" ? null : v));

const zCadastrarConta = z.object({
  codigo: z.string().trim().min(1, "Informe o código da conta").max(30, "Código com até 30 caracteres"),
  descricao: z.string().trim().min(3, "Descrição com ao menos 3 caracteres").max(120, "Descrição com até 120 caracteres"),
  fonteCodigo: z.string().trim().min(1, "Escolha a fonte padrão"),
  contaContabilCodigo: z.string().trim().min(1, "Escolha a conta contábil"),
  banco: z.string().trim().regex(/^\d{3}$/, "Banco: o código de 3 dígitos"),
  agencia: soDigitos("Agência", 1, 6),
  digitoAgencia: digitoVerificador,
  conta: soDigitos("Conta", 1, 20),
  digitoConta: digitoVerificador,
  criadoPor: z.string().min(1),
});

export type CadastrarContaBancariaInput = z.input<typeof zCadastrarConta>;

export async function cadastrarContaBancaria(
  prisma: PrismaClient,
  input: CadastrarContaBancariaInput
): Promise<{ readonly id: string; readonly codigo: string }> {
  const d = zCadastrarConta.parse(input);

  return prisma.$transaction(async (tx) => {
    // A conta bancária é do ENTE: só a permissão global autoriza.
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cadastrarContaBancaria, "ENTE");

    const repetida = await tx.contaBancaria.findUnique({ where: { codigo: d.codigo }, select: { id: true } });
    if (repetida !== null) {
      throw new Error(`Já existe uma conta bancária com o código ${d.codigo}. Nada foi gravado.`);
    }

    const fonte = await tx.fonteRecurso.findUnique({ where: { codigo: d.fonteCodigo }, select: { id: true } });
    if (fonte === null) {
      throw new Error(`A fonte ${d.fonteCodigo} não está no cadastro de fontes de recurso. Nada foi gravado.`);
    }

    const contabil = await tx.contaPcasp.findUnique({
      where: { codigo: d.contaContabilCodigo },
      select: { id: true, codigo: true, nome: true, analitica: true },
    });
    if (contabil === null) {
      throw new Error(`A conta contábil ${d.contaContabilCodigo} não está no plano de contas. Nada foi gravado.`);
    }
    if (!contabil.codigo.startsWith(PREFIXO_DAS_DISPONIBILIDADES)) {
      throw new Error(
        `A conta contábil ${contabil.codigo} (${contabil.nome}) não é de caixa e equivalentes de caixa (grupo 1.1.1 do PCASP). ` +
          `A conta bancária escritura disponibilidade; em outra conta, a conciliação compararia o extrato com um saldo que não é de banco. Nada foi gravado.`
      );
    }
    if (!contabil.analitica) {
      throw new Error(
        `A conta contábil ${contabil.codigo} (${contabil.nome}) é sintética e não recebe lançamento. Escolha uma conta analítica. Nada foi gravado.`
      );
    }

    const mesmaConta = await tx.contaBancaria.findFirst({
      where: { banco: d.banco, agencia: d.agencia, conta: d.conta },
      select: { codigo: true },
    });
    if (mesmaConta !== null) {
      throw new Error(
        `Banco ${d.banco}, agência ${d.agencia}, conta ${d.conta} já está cadastrada como ${mesmaConta.codigo}. ` +
          `Dois cadastros da mesma conta fariam o mesmo extrato conciliar duas contas do razão. Nada foi gravado.`
      );
    }

    const criada = await tx.contaBancaria.create({
      data: {
        codigo: d.codigo,
        descricao: d.descricao,
        fonteId: fonte.id,
        contaContabilId: contabil.id,
        banco: d.banco,
        agencia: d.agencia,
        digitoAgencia: d.digitoAgencia,
        conta: d.conta,
        digitoConta: d.digitoConta,
      },
      select: { id: true, codigo: true },
    });
    // O rol nasce com a fonte padrão, como o backfill fez com as contas antigas.
    await tx.fonteDaContaBancaria.create({ data: { contaBancariaId: criada.id, fonteId: fonte.id, criadoPor: d.criadoPor } });
    return criada;
  });
}

/** As contas contábeis que podem ser escolhidas para uma conta bancária: analíticas do grupo 1.1.1. */
export async function contasContabeisDeDisponibilidade(
  prisma: PrismaClient
): Promise<readonly { readonly codigo: string; readonly nome: string }[]> {
  return prisma.contaPcasp.findMany({
    where: { analitica: true, codigo: { startsWith: PREFIXO_DAS_DISPONIBILIDADES } },
    orderBy: { codigo: "asc" },
    select: { codigo: true, nome: true },
  });
}
