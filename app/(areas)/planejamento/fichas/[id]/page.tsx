import { notFound } from "next/navigation";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { acoesPermitidas, exigirLeitura } from "../../../../../lib/portas/molde";
import { FICHAS } from "../../../../../lib/portas/recursos/fichas";
import { verFicha } from "../../../../../lib/portas/recursos/fichas-dados";
import { lerOperacoesDaFicha } from "../../../../../lib/portas/operacoes-da-ficha";
import { OperacoesDaFichaSecao } from "./OperacoesDaFicha";

/**
 * O DETALHE DA FICHA: a chave completa, a dotação inicial, os saldos (cache) e o HISTÓRICO dos
 * movimentos de dotação — cada um com a competência e o instante do registro.
 *
 * V31 — e as OPERAÇÕES da dotação: as reservas (com o processo de cada uma), os empenhos com o que falta
 * liquidar e pagar, e a reserva avulsa e a liberação para quem tem a ação.
 */
export const dynamic = "force-dynamic";

export default async function Detalhe({ params, searchParams }: { readonly params: Promise<{ readonly id: string }>; readonly searchParams: Promise<ParametrosBrutos> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_PLANEJAMENTO");
  const { id } = await params;
  const consulta = lerConsulta(FICHAS, await searchParams);
  const [detalhe, operacoes, permitidas] = await Promise.all([
    verFicha(id),
    lerOperacoesDaFicha(id),
    acoesPermitidas(["RESERVAR_DOTACAO", "LIBERAR_RESERVA"]),
  ]);
  if (detalhe === null || operacoes === null) notFound();
  const disponivel = detalhe.dados.find((d) => d.rotulo === "Disponível")?.valor ?? "0.00";
  return (
    <div className="space-y-6">
      <DetalheDeRecurso
        definicao={FICHAS}
        id={id}
        titulo={detalhe.titulo}
        subtitulo={detalhe.subtitulo}
        selos={detalhe.selos}
        abaAtiva={consulta.aba as AbaDoMolde}
        dados={detalhe.dados}
        historico={detalhe.historico}
      />
      <OperacoesDaFichaSecao
        o={operacoes}
        disponivel={disponivel}
        podeReservar={permitidas.has("RESERVAR_DOTACAO")}
        podeLiberar={permitidas.has("LIBERAR_RESERVA")}
      />
    </div>
  );
}
