import { cliente } from "./cliente";
import { exigirSessao } from "./sessao";
import { autorizarLeituraDoRegistroPara } from "./leitura";
import { lerDebitosDosCredores, type DebitoDoCredor } from "./debitos-do-credor";
import { subempenhosParaLiquidar } from "./subempenhos";

/**
 * V37 — O QUE A LIQUIDAÇÃO PRECISA SABER DO EMPENHO ESCOLHIDO, lido só para ele. Antes a página calculava o aviso de
 * débito do credor e os subempenhos de TODOS os empenhos liquidáveis do recorte, para um `select` com todos eles; o
 * empenho passou a ser escolhido por busca (`empenhos-para-liquidar`), e estes dois dados vêm na escolha.
 *
 * Autoriza a leitura da despesa na unidade da ficha do empenho (o mesmo crivo do registro). Só lê; quem soma o débito é
 * o M10 e quem reparte o saldo é o M05.
 */
export interface ExtrasDoEmpenhoParaLiquidar {
  readonly debito: DebitoDoCredor | null;
  readonly repartido: { readonly livre: string; readonly subempenhos: readonly { readonly id: string; readonly rotulo: string; readonly saldo: string }[] } | null;
}

export async function lerExtrasDoEmpenhoParaLiquidar(empenhoId: string): Promise<ExtrasDoEmpenhoParaLiquidar | null> {
  const sessao = await exigirSessao();
  const e = await cliente().empenho.findUnique({
    where: { id: empenhoId },
    select: { id: true, numero: true, credorCpfCnpj: true, ficha: { select: { unidadeOrc: { select: { codigo: true } } } } },
  });
  if (e === null) return null;
  await autorizarLeituraDoRegistroPara(sessao, "CONSULTAR_DESPESA", e.ficha.unidadeOrc.codigo);
  const [debitos, repartidos] = await Promise.all([lerDebitosDosCredores([e.credorCpfCnpj]), subempenhosParaLiquidar([{ id: e.id, numero: e.numero }])]);
  return { debito: debitos[e.credorCpfCnpj] ?? null, repartido: repartidos[e.id] ?? null };
}
