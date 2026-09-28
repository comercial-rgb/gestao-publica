import { cliente } from "./cliente";
import { toMoney } from "../../packages/contracts/index.js";
import {
  anexoAlienacaoBens,
  anexoDividaConsolidada,
  anexoMargemExpansao,
  anexoMetasAnuais,
  anexoPrioridades,
  anexoProjecaoRpps,
  anexoRenunciaReceita,
  anexoRiscosFiscais,
  type ChaveAnexoLdo,
} from "../../modules/m02b-plurianual/anexos/ldo.js";
import type { AnexoLdo } from "../../modules/m02b-plurianual/anexos/tipos.js";
import { metasAnuaisVigentes } from "../../modules/m02b-plurianual/comparativo.js";

export { ANEXOS_DA_LDO, ehChaveDeAnexo } from "../../modules/m02b-plurianual/anexos/ldo.js";
export type { ChaveAnexoLdo } from "../../modules/m02b-plurianual/anexos/ldo.js";
export type {
  AnexoLdo,
  ColunaAnexo,
  LinhaAnexo,
} from "../../modules/m02b-plurianual/anexos/tipos.js";

/**
 * PORTA — OS ANEXOS DA LDO (M02b, conciliada do siafic-cg c04ad5a na V4 §8).
 *
 * ⚠️ ELA LÊ E ENTREGA AO GERADOR. Nenhuma aritmética aqui: resultado primário, dívida
 * líquida e margem saem das funções do domínio, dentro do gerador. Esta camada converte
 * `Decimal` do Prisma em `Money` (decimal.js) e chama.
 *
 * ⚠️ `Decimal.toFixed(2)` → `toMoney` É A CONVERSÃO EXATA, não um arredondamento. O
 * `Decimal` do Prisma e o `Money` do repositório são ambos decimal.js; a string decimal no
 * meio é a fronteira que garante que nenhum `number` apareça no caminho.
 */

async function exigirLdo(
  id: string
): Promise<{ readonly id: string; readonly exercicio: number }> {
  const l = await cliente().leiDiretrizesOrcamentarias.findUnique({
    where: { id },
    select: { id: true, exercicio: true },
  });
  if (l === null) throw new Error(`LDO ${id} não existe.`);
  return l;
}

/**
 * MONTA UM ANEXO — o despacho por chave.
 *
 * ⚠️ O `switch` É EXAUSTIVO sobre `ChaveAnexoLdo`, e o TypeScript cobra: acrescentar um
 * anexo ao rol sem tratá-lo aqui não compila. É o mesmo mecanismo dos `Record` exaustivos
 * do M10 — o compilador aponta quem esqueceu, em vez de a rota devolver 404 em produção.
 */
export async function montarAnexoDaLdo(
  ldoId: string,
  chave: ChaveAnexoLdo
): Promise<AnexoLdo> {
  const prisma = cliente();
  const ldo = await exigirLdo(ldoId);
  const ex = ldo.exercicio;

  switch (chave) {
    // ⚠️ AS METAS VÊM PELO DONO DA DERIVAÇÃO (V18/C13), e não por `findMany` direto: quando uma
    // lei altera a meta fiscal, o ajuste é gravado ao lado da linha e o valor vigente é
    // `original + soma dos ajustes`. Ler a linha crua aqui faria o Anexo de Metas Fiscais
    // imprimir a meta REVOGADA enquanto o comparativo mostra a vigente — duas verdades sobre o
    // número que o Prefeito assina. Com zero atos o resultado é idêntico ao de antes.
    case "metas-anuais": {
      const linhas = await metasAnuaisVigentes(prisma, { ldoId });
      return anexoMetasAnuais(
        ex,
        linhas.map((m) => ({
          ano: m.ano,
          receitaTotal: m.vigente.receitaTotal,
          receitaPrimaria: m.vigente.receitaPrimaria,
          despesaTotal: m.vigente.despesaTotal,
          despesaPrimaria: m.vigente.despesaPrimaria,
          resultadoNominal: m.vigente.resultadoNominal,
          dividaPublicaConsolidada: m.vigente.dividaPublicaConsolidada,
          dividaConsolidadaLiquida: m.vigente.dividaConsolidadaLiquida,
        }))
      );
    }

    case "riscos-fiscais": {
      const linhas = await prisma.riscoFiscal.findMany({
        where: { ldoId },
        orderBy: [{ codigoPassivo: "asc" }, { id: "asc" }],
      });
      return anexoRiscosFiscais(
        ex,
        linhas.map((r) => ({
          codigoPassivo: r.codigoPassivo,
          descricaoPassivo: r.descricaoPassivo,
          valorPassivo: toMoney(r.valorPassivo.toFixed(2)),
          descricaoProvidencia: r.descricaoProvidencia,
          valorProvidencia: toMoney(r.valorProvidencia.toFixed(2)),
        }))
      );
    }

    case "renuncia-receita": {
      const linhas = await prisma.renunciaReceitaLdo.findMany({
        where: { ldoId },
        orderBy: { id: "asc" },
      });
      return anexoRenunciaReceita(
        ex,
        linhas.map((r) => ({
          descricao: r.descricao,
          valor: toMoney(r.valor.toFixed(2)),
          descricaoCompensacao: r.descricaoCompensacao,
          valorCompensacao: toMoney(r.valorCompensacao.toFixed(2)),
        }))
      );
    }

    case "alienacao-bens": {
      const linhas = await prisma.alienacaoBemLdo.findMany({
        where: { ldoId },
        orderBy: { id: "asc" },
        include: { aplicacoes: { orderBy: [{ anoAplicacao: "asc" }, { id: "asc" }] } },
      });
      return anexoAlienacaoBens(
        ex,
        linhas.map((a) => ({
          descricaoBem: a.descricaoBem,
          valorAlienacao: toMoney(a.valorAlienacao.toFixed(2)),
          numeroLaudo: a.numeroLaudo,
          aplicacoes: a.aplicacoes.map((ap) => ({
            tipoAplicacao: ap.tipoAplicacao,
            anoAplicacao: ap.anoAplicacao,
            descricao: ap.descricao,
            valor: toMoney(ap.valor.toFixed(2)),
          })),
        }))
      );
    }

    case "projecao-rpps": {
      const linhas = await prisma.projecaoAtuarialRpps.findMany({
        where: { ldoId },
        orderBy: { ano: "asc" },
      });
      return anexoProjecaoRpps(
        ex,
        linhas.map((p) => ({
          ano: p.ano,
          receitasPrevidenciarias: toMoney(p.receitasPrevidenciarias.toFixed(2)),
          despesasPrevidenciarias: toMoney(p.despesasPrevidenciarias.toFixed(2)),
          resultadoPrevidenciario: toMoney(p.resultadoPrevidenciario.toFixed(2)),
          saldoFinanceiro: toMoney(p.saldoFinanceiro.toFixed(2)),
        }))
      );
    }

    case "divida-consolidada": {
      const linhas = await prisma.dividaConsolidadaLdo.findMany({
        where: { ldoId },
        orderBy: { ano: "asc" },
      });
      return anexoDividaConsolidada(
        ex,
        linhas.map((d) => ({
          ano: d.ano,
          dividaConsolidada: toMoney(d.dividaConsolidada.toFixed(2)),
          deducoes: toMoney(d.deducoes.toFixed(2)),
          receitaCorrenteLiquida: toMoney(d.receitaCorrenteLiquida.toFixed(2)),
          // ⚠️ 6 casas: é ÍNDICE, não dinheiro. Ver o schema.
          percentualRcl: toMoney(d.percentualRcl.toFixed(6)),
        }))
      );
    }

    case "margem-expansao": {
      const linhas = await prisma.margemExpansaoLdo.findMany({
        where: { ldoId },
        orderBy: { ano: "asc" },
      });
      return anexoMargemExpansao(
        ex,
        linhas.map((m) => ({
          ano: m.ano,
          aumentoPermanenteReceita: toMoney(m.aumentoPermanenteReceita.toFixed(2)),
          reducaoPermanenteDespesa: toMoney(m.reducaoPermanenteDespesa.toFixed(2)),
          novasDespesasObrigatorias: toMoney(m.novasDespesasObrigatorias.toFixed(2)),
        }))
      );
    }

    case "prioridades": {
      const linhas = await prisma.prioridadeLdo.findMany({
        where: { ldoId },
        orderBy: { id: "asc" },
      });
      return anexoPrioridades(
        ex,
        linhas.map((p) => ({
          descricaoAcao: p.descricaoAcao,
          produto: p.produto,
          unidadeMedida: p.unidadeMedida,
          // ⚠️ 6 casas: meta FÍSICA. "3,5 km" e "0,25 do sistema" são metas legítimas.
          meta: toMoney(p.meta.toFixed(6)),
        }))
      );
    }
  }
}

/** O rol de anexos de uma LDO, para a tela oferecer os links. */
export async function anexosDisponiveis(
  ldoId: string
): Promise<readonly { readonly chave: string; readonly titulo: string }[]> {
  const ldo = await exigirLdo(ldoId);
  void ldo;
  // ⚠️ Os títulos vêm dos próprios geradores, chamados com lista VAZIA: assim o rótulo da
  // tela e o do documento nunca divergem. Duas listas de títulos divergiriam no dia em que
  // alguém renomeasse um anexo num lugar só.
  return [
    anexoMetasAnuais(0, []),
    anexoRiscosFiscais(0, []),
    anexoRenunciaReceita(0, []),
    anexoAlienacaoBens(0, []),
    anexoProjecaoRpps(0, []),
    anexoDividaConsolidada(0, []),
    anexoMargemExpansao(0, []),
    anexoPrioridades(0, []),
  ].map((a) => ({ chave: a.chave, titulo: a.titulo }));
}

