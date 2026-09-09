import { cliente, PortaSemBancoError } from "./cliente";
import {
  listarContasPcasp,
  type ContaDoPlano,
} from "../../modules/m01-core-contabil/consultas";

/**
 * PORTA — CONTABILIDADE (o cadastro do M01 visto pela área "Contabilidade").
 *
 * Mesma disciplina das outras portas: `app/` NUNCA importa `modules/` nem `prisma` direto; o
 * cliente é o singleton compartilhado; `PortaSemBancoError` é reexportado para a tela nomear o
 * estado "sem banco" em vez de estourar um erro genérico. Zero regra de negócio aqui — a borda
 * só liga a consulta do domínio à tela.
 *
 * ⚠️ POR QUE UMA PORTA NOVA, E NÃO UM EXPORT A MAIS EM `livros.ts`. `livros.ts` é a porta dos
 * LIVROS OBRIGATÓRIOS (Diário/Razão/Balancete — o M12). O plano de contas é CADASTRO (o M01), e
 * misturar os dois faria a tela de plano depender do módulo de relatórios sem precisar dele. As
 * duas portas continuam separadas mesmo quando UMA tela consome as duas — é o caso do plano de
 * contas com saldo, que junta `listarPlanoDeContas` (daqui) com `gerarBalancete` (de lá) por
 * `codigo`, na TELA, que é onde a junção de duas verdades independentes pode ser explicada.
 */

export { PortaSemBancoError };

/**
 * O PLANO DE CONTAS PCASP inteiro, em ordem de código.
 *
 * ⚠️ SEM SALDO — de propósito. O saldo é do razão e vem do balancete (`gerarBalancete` em
 * `./livros`). Esta porta devolve o CADASTRO: código, nome, `naturezaSaldo` (devedora/credora),
 * nível, analítica e o pai. A "natureza da informação" do MSC (patrimonial/orçamentária/controle)
 * NÃO está aqui porque não é atributo da conta — ela vive em `PartidaContabil.subsistema`. Ver o
 * cabeçalho de `ContaDoPlano` no M01.
 */
export async function listarPlanoDeContas(): Promise<readonly ContaDoPlano[]> {
  return listarContasPcasp(cliente());
}

export type { ContaDoPlano };
