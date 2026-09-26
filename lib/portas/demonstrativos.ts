import { cliente, PortaSemBancoError } from "./cliente";
import {
  balancoFinanceiro,
  balancoOrcamentario,
  balancoPatrimonial,
  demonstracaoVariacoesPatrimoniais,
  type BalancoFinanceiro,
  type BalancoOrcamentario,
  type BalancoPatrimonial,
  type DemonstracaoVariacoesPatrimoniais,
} from "../../modules/m12-relatorios/index";

/**
 * PORTA — AS DEMONSTRAÇÕES CONTÁBEIS (Anexos 12, 13, 14 e 15 da Lei 4.320).
 *
 * Os quatro motores já existiam no M12, com teste; nenhuma porta e nenhuma tela os alcançava —
 * o Balanço Patrimonial e a DVP não estavam nem reexportados pelo `index.ts` do módulo. Esta borda
 * só os liga à tela: zero aritmética aqui, zero regra de negócio, dinheiro em `Money` até a borda.
 *
 * ⚠️ POR QUE ESTA PORTA RESOLVE O ROL DE CAIXA, E DE ONDE ELE VEM
 * O Balanço Financeiro (art. 103) e o quadro por fonte do Patrimonial (art. 43, § 1º, III) não
 * adivinham quais contas do PCASP são caixa — os dois motores exigem o rol por PARÂMETRO, e o do
 * Financeiro LANÇA sem ele. Isso é correto e não se contorna com uma constante no código: qual
 * conta contábil é caixa é decisão do ente, não da engenharia.
 *
 * A fonte legítima do rol já existe no produto e é TABELA: `ContaBancaria.contaContabil` — a conta
 * do PCASP que cada conta bancária movimenta, informada pelo operador. É a MESMA amarração que a
 * conciliação bancária já exige e pela qual ela já falha nomeando quando falta. Derivar o rol dela
 * não inventa plano de contas: lê o que o ente declarou.
 *
 * ⚠️ E A LIMITAÇÃO DISSO, NOMEADA em vez de encoberta: uma disponibilidade SEM conta bancária
 * correspondente — o caixa em espécie, tipicamente — não entra no rol, porque não há nada no
 * cadastro que a declare. O efeito não é um número errado em silêncio: o saldo em espécie do
 * Balanço Financeiro é conferido pelo próprio motor contra as partidas do razão, e a divergência
 * aparece. O que a porta não pode fazer é adivinhar a conta que ninguém cadastrou.
 */

export { PortaSemBancoError };

/**
 * Erro nomeado: nenhuma conta bancária declarou a sua conta contábil, então não existe rol de
 * disponibilidades a apurar. Fail-closed — ver a nota do cabeçalho.
 */
export class RolDeDisponibilidadeAusenteError extends Error {
  constructor() {
    super(
      "Nenhuma conta bancária tem a conta contábil informada. Informe a conta contábil de cada " +
        "conta bancária em Financeiro / Contas bancárias antes de emitir esta demonstração."
    );
    this.name = "RolDeDisponibilidadeAusenteError";
  }
}

/**
 * O ROL DE CONTAS DE DISPONIBILIDADE — distinto, ordenado, lido do cadastro de contas bancárias.
 *
 * Ordenado por código porque o rol entra em mensagem de divergência do motor: rol em ordem instável
 * faria a mesma divergência mudar de texto entre duas emissões iguais.
 */
export async function contasDeDisponibilidade(): Promise<readonly string[]> {
  // ⚠️ SEM `orderBy` AQUI, E A AUSÊNCIA SUSTENTA UM TESTE. A ordenação é feita em JS, no `.sort()`
  // abaixo, e o teste que a vigia prova isso porque a fixture insere as contas em ordem
  // CONTRÁRIA à pedida e a consulta não ordena — então a ordem certa só pode ter vindo do
  // `.sort()`. Acrescentar `orderBy` aqui tornaria o `.sort()` redundante e o teste passaria a
  // ficar verde mesmo sem ele: o instrumento pararia de acusar sem ninguém notar. Medido por
  // mutação (remover o `.sort()` → vermelho na asserção sensível à ordem).
  const contas = await cliente().contaBancaria.findMany({
    where: { contaContabilId: { not: null } },
    select: { contaContabil: { select: { codigo: true } } },
  });
  const codigos = new Set<string>();
  for (const c of contas) {
    if (c.contaContabil !== null) codigos.add(c.contaContabil.codigo);
  }
  return [...codigos].sort();
}

/**
 * ANEXO 12 — BALANÇO ORÇAMENTÁRIO. Receita prevista/realizada e despesa fixada/executada do
 * exercício. O motor é fail-closed em exercício inexistente (lança, em vez de emitir zerado).
 */
export async function gerarBalancoOrcamentario(p: {
  readonly exercicio: number;
}): Promise<BalancoOrcamentario> {
  return balancoOrcamentario(cliente(), p.exercicio);
}

/**
 * ANEXO 13 — BALANÇO FINANCEIRO. Ingressos e dispêndios por fonte, com o saldo em espécie
 * conferido contra as partidas do razão pelo próprio motor.
 *
 * Recusa NOMEADA quando o rol de disponibilidades não existe: sem saber quais contas são caixa,
 * não há saldo em espécie a apurar — e um Anexo 13 sem saldo em espécie não é um Anexo 13.
 */
export async function gerarBalancoFinanceiro(p: {
  readonly exercicio: number;
}): Promise<BalancoFinanceiro> {
  const rol = await contasDeDisponibilidade();
  if (rol.length === 0) throw new RolDeDisponibilidadeAusenteError();
  return balancoFinanceiro(cliente(), p.exercicio, rol);
}

/**
 * ANEXO 14 — BALANÇO PATRIMONIAL, na data de corte, com o quadro do art. 105 (financeiro e
 * permanente) e o superávit financeiro por fonte.
 *
 * ⚠️ AQUI A AUSÊNCIA DO ROL **NÃO** RECUSA O RELATÓRIO, e a diferença em relação ao Anexo 13 é de
 * propósito: o balanço patrimonial inteiro não depende do rol — só o quadro por fonte depende. O
 * motor devolve `superavitPorFonte: null` sem o parâmetro, e a tela diz que aquele quadro não foi
 * apurado. Recusar o balanço todo por causa de um quadro seria esconder o ativo, o passivo e o
 * patrimônio líquido que estão apurados.
 */
export async function gerarBalancoPatrimonial(p: {
  readonly corte: Date;
}): Promise<BalancoPatrimonial> {
  const rol = await contasDeDisponibilidade();
  return balancoPatrimonial(
    cliente(),
    p.corte,
    rol.length > 0 ? { contasCaixa: rol } : undefined
  );
}

/**
 * ANEXO 15 — DEMONSTRAÇÃO DAS VARIAÇÕES PATRIMONIAIS. VPA e VPD do período, pelo MOVIMENTO das
 * contas de resultado (não pelo saldo), e o resultado patrimonial do período.
 */
export async function gerarDvp(p: {
  readonly inicio: Date;
  readonly fim: Date;
}): Promise<DemonstracaoVariacoesPatrimoniais> {
  return demonstracaoVariacoesPatrimoniais(cliente(), p.inicio, p.fim);
}

export type {
  BalancoFinanceiro,
  BalancoOrcamentario,
  BalancoPatrimonial,
  DemonstracaoVariacoesPatrimoniais,
};
export type { LinhaFinanceira, SaldoEmEspecie } from "../../modules/m12-relatorios/index";
export type {
  ContaDoQuadroFP,
  GrupoBalanco,
  IndicadorSuperavit,
  LinhaDoBalanco,
  QuadroDoGrupo,
  QuadroFinanceiroPermanente,
} from "../../modules/m12-relatorios/index";
export type { LinhaDaDvp, QuadroDaDvp } from "../../modules/m12-relatorios/index";
export { INDICADOR_SUPERAVIT } from "../../modules/m12-relatorios/index";
