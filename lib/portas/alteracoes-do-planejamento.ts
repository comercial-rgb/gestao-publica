import { cliente, PortaSemBancoError } from "./cliente";
import { comEscritaAutenticada } from "./sessao";
import {
  comparativoDaPeca,
  linhasAlteraveisDaPeca,
  type LinhaAlteravel,
  type PecaDoPlanejamento,
} from "../../modules/m02b-plurianual/comparativo";
import {
  acrescentarItemAoAtoDeAlteracao,
  registrarAtoDeAlteracaoDoPlanejamento,
} from "../../modules/m02b-plurianual/servico-alteracao";
import type { ItemDeAlteracaoInput } from "../../modules/m02b-plurianual/alteracao";

/**
 * PORTA — A ALTERAÇÃO VERSIONADA DO PPA E DA LDO (V18/C13).
 *
 * ⚠️ A ESCRITA PASSA POR `comEscritaAutenticada`: ela exige sessão (fail-closed), injeta o
 * `criadoPor` REAL — o usuário logado, nunca um literal — e registra a operação. Foi essa
 * mesma substituição de literal por autor real que a V17 teve de fazer no M02, depois de
 * descobrir que a dotação inicial era assinada com `"LOA"` e estourava em banco real.
 */

export { PortaSemBancoError };
export type { LinhaAlteravel, PecaDoPlanejamento };

/**
 * ⚠️ DINHEIRO ATRAVESSA A FRONTEIRA COMO STRING DECIMAL, e não como `Decimal`. A tela recebe
 * `Dinheiro` (string) e `ValorMonetario` só aceita string — passar `number` nem compila. Um
 * `Decimal` cruzando para o Server Component funcionaria por acidente e quebraria no dia em que a
 * tela virasse ilha client, porque objeto de decimal.js não é serializável.
 */
export interface AtoParaTela {
  readonly id: string;
  readonly numero: string;
  readonly ano: number;
  readonly data: Date;
  readonly dataPublicacao: Date;
  readonly fundamento: string;
  readonly itens: number;
  readonly criadoPor: string;
}

/** Um ajuste da linha, com o ato que o trouxe — o histórico DA LINHA, não o da peça. */
export interface AjusteParaTela {
  readonly ato: string;
  readonly data: Date;
  readonly valorAjuste: string;
  readonly justificativa: string | null;
  readonly fundamento: string;
  readonly criadoPor: string;
}

export interface LinhaParaTela {
  readonly chave: string;
  readonly rotulo: string;
  readonly rotuloDaGrandeza: string;
  readonly original: string;
  readonly ajuste: string;
  readonly atual: string;
  readonly atos: number;
  /**
   * ⚠️ OS AJUSTES DA LINHA, UM A UM. Sem eles a tela mostrava só a SOMA, e duas coisas ficavam
   * invisíveis: "consultar as alterações de uma receita individualmente" — que é requisito — e a
   * JUSTIFICATIVA de cada linha, que o formulário captura e nenhuma tela exibia. Campo gravado
   * que ninguém lê é campo que o operador aprende a deixar em branco.
   */
  readonly ajustes: readonly AjusteParaTela[];
}

export interface TotalParaTela {
  readonly grandeza: string;
  readonly rotuloDaGrandeza: string;
  readonly linhas: number;
  readonly original: string;
  readonly ajuste: string;
  readonly atual: string;
}

export interface ComparativoParaTela {
  readonly peca: PecaDoPlanejamento;
  readonly pecaId: string;
  readonly rotuloDaPeca: string;
  readonly ate: Date | null;
  readonly atos: readonly AtoParaTela[];
  readonly linhas: readonly LinhaParaTela[];
  readonly totais: readonly TotalParaTela[];
}

/** As peças que existem, para o seletor da tela — rol curto por natureza (um PPA por quadriênio). */
export interface PecaDisponivel {
  readonly peca: PecaDoPlanejamento;
  readonly id: string;
  readonly rotulo: string;
}

export async function pecasDisponiveis(): Promise<readonly PecaDisponivel[]> {
  const prisma = cliente();
  const [planos, ldos] = await Promise.all([
    prisma.planoPlurianual.findMany({
      orderBy: { anoInicio: "desc" },
      select: { id: true, anoInicio: true, anoFim: true, leiRef: true },
    }),
    prisma.leiDiretrizesOrcamentarias.findMany({
      orderBy: { exercicio: "desc" },
      select: { id: true, exercicio: true },
    }),
  ]);
  return [
    ...planos.map((p) => ({
      peca: "PPA" as const,
      id: p.id,
      rotulo: `PPA ${p.anoInicio}-${p.anoFim} (${p.leiRef})`,
    })),
    ...ldos.map((l) => ({ peca: "LDO" as const, id: l.id, rotulo: `LDO ${l.exercicio}` })),
  ];
}

export async function lerComparativoDaPeca(p: {
  readonly peca: PecaDoPlanejamento;
  readonly pecaId: string;
  readonly ate?: Date | null;
}): Promise<ComparativoParaTela> {
  const c = await comparativoDaPeca(cliente(), p);
  return {
    peca: c.peca,
    pecaId: c.pecaId,
    rotuloDaPeca: c.rotuloDaPeca,
    ate: c.ate,
    atos: c.atos.map((a) => ({
      id: a.id,
      numero: a.numero,
      ano: a.ano,
      data: a.data,
      dataPublicacao: a.dataPublicacao,
      fundamento: a.fundamento,
      itens: a.itens,
      criadoPor: a.criadoPor,
    })),
    linhas: c.linhas.map((l) => ({
      chave: `${l.alvo}::${l.alvoId}::${l.grandeza}`,
      rotulo: l.rotulo,
      rotuloDaGrandeza: l.rotuloDaGrandeza,
      original: l.original.toFixed(2),
      ajuste: l.ajuste.toFixed(2),
      atual: l.atual.toFixed(2),
      atos: l.ajustes.length,
      ajustes: l.ajustes.map((x) => ({
        ato: `${x.numeroDoAto}/${String(x.anoDoAto)}`,
        data: x.data,
        valorAjuste: x.valorAjuste.toFixed(2),
        justificativa: x.justificativa,
        fundamento: x.fundamento,
        criadoPor: x.criadoPor,
      })),
    })),
    totais: c.totais.map((t) => ({
      grandeza: t.grandeza,
      rotuloDaGrandeza: t.rotuloDaGrandeza,
      linhas: t.linhas,
      original: t.original.toFixed(2),
      ajuste: t.ajuste.toFixed(2),
      atual: t.atual.toFixed(2),
    })),
  };
}

export async function lerLinhasAlteraveis(p: {
  readonly peca: PecaDoPlanejamento;
  readonly pecaId: string;
}): Promise<readonly LinhaAlteravel[]> {
  return linhasAlteraveisDaPeca(cliente(), p);
}

/** REGISTRAR o ato com o primeiro item — ESCRITA AUTENTICADA (`ALTERAR_PLANEJAMENTO`). */
export async function registrarAtoDeAlteracao(input: {
  readonly peca: PecaDoPlanejamento;
  readonly pecaId: string;
  readonly numero: string;
  readonly ano: number;
  readonly data: Date;
  readonly dataPublicacao: Date;
  readonly fundamento: string;
  readonly itens: readonly ItemDeAlteracaoInput[];
}): Promise<string> {
  return comEscritaAutenticada("ALTERAR_PLANEJAMENTO", async (criadoPor) => {
    const r = await registrarAtoDeAlteracaoDoPlanejamento(cliente(), {
      ...input,
      itens: [...input.itens],
      criadoPor,
    });
    return r.atoId;
  });
}

/** ACRESCENTAR item a um ato já registrado — a mesma lei alterando mais uma linha. */
export async function acrescentarItemAoAto(input: {
  readonly atoId: string;
  readonly item: ItemDeAlteracaoInput;
}): Promise<string> {
  return comEscritaAutenticada("ALTERAR_PLANEJAMENTO", async (criadoPor) => {
    const r = await acrescentarItemAoAtoDeAlteracao(cliente(), { ...input, criadoPor });
    return r.itemId;
  });
}
