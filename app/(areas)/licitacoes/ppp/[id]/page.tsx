import Link from "next/link";
import { notFound } from "next/navigation";
import { FormsDoRecurso } from "../../../../../components/molde/FormsDoRecurso";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { ListaDeAnexos } from "../../../../../components/ui/ListaDeAnexos";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { EXTENSOES_ACEITAS, lerAnexosDaPpp, TAMANHO_MAXIMO_BYTES } from "../../../../../lib/portas/documentos";
import { acoesPermitidas, exigirLeitura } from "../../../../../lib/portas/molde";
import { PARCERIAS_PUBLICO_PRIVADAS } from "../../../../../lib/portas/recursos/ppp";
import { verPpp } from "../../../../../lib/portas/recursos/ppp-dados";
import { FormAnexo } from "../../../documentos/FormAnexo";
import { pppAction } from "../actions";

/**
 * V36 — O DETALHE DA PARCERIA PÚBLICO-PRIVADA (TR 5.10.1.87-89): os dados, as parcelas vigentes por exercício, os
 * empenhos vinculados com o líquido de cada um, as ações (situação e parcelas) e os documentos na aba Anexos.
 */
export const dynamic = "force-dynamic";

const celula = "border-b border-[color:var(--color-border)] px-2 py-1.5 align-top";

export default async function Detalhe({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly id: string }>;
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_LICITACOES");
  const { id } = await params;
  const consulta = lerConsulta(PARCERIAS_PUBLICO_PRIVADAS, await searchParams);
  const [detalhe, permitidas] = await Promise.all([
    verPpp(id),
    acoesPermitidas([...PARCERIAS_PUBLICO_PRIVADAS.acoes.map((a) => a.acaoDoCenso), "ANEXAR_ARQUIVO"]),
  ]);
  if (detalhe === null) notFound();
  const anexos = consulta.aba === "anexos" ? await lerAnexosDaPpp(id) : [];
  return (
    <DetalheDeRecurso
      definicao={PARCERIAS_PUBLICO_PRIVADAS}
      id={id}
      titulo={detalhe.titulo}
      subtitulo={detalhe.subtitulo}
      selos={detalhe.selos}
      abaAtiva={consulta.aba as AbaDoMolde}
      dados={detalhe.dados}
      historico={detalhe.historico}
      resumo={
        <div className="grid gap-4 lg:grid-cols-2">
          <section aria-label="Parcelas por exercício" className="overflow-x-auto" data-parcelas-da-ppp>
            <h2 className="mb-2 text-sm font-semibold">Parcelas por exercício</h2>
            {detalhe.parcelas.length === 0 ? (
              <p className="text-sm text-[color:var(--color-ink-2)]">Nenhuma parcela informada.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th className={celula}>Exercício</th>
                    <th className={`${celula} text-right`}>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {detalhe.parcelas.map((p) => (
                    <tr key={p.ano} data-parcela={p.ano}>
                      <td className={celula}>{p.ano}</td>
                      <td className={`${celula} text-right`}><ValorMonetario valor={p.valor} /></td>
                    </tr>
                  ))}
                  <tr>
                    <td className={`${celula} font-semibold`}>Total</td>
                    <td className={`${celula} text-right font-semibold`} data-total-das-parcelas><ValorMonetario valor={detalhe.totalDasParcelas} /></td>
                  </tr>
                </tbody>
              </table>
            )}
          </section>
          <section aria-label="Empenhos da parceria" className="overflow-x-auto" data-empenhos-da-ppp>
            <h2 className="mb-2 text-sm font-semibold">Empenhos vinculados</h2>
            {detalhe.motivoSemEmpenhos !== null ? (
              <p className="text-sm text-[color:var(--color-ink-2)]" data-sem-empenhos>{detalhe.motivoSemEmpenhos}</p>
            ) : detalhe.empenhos.length === 0 ? (
              <p className="text-sm text-[color:var(--color-ink-2)]">Nenhum empenho vinculado a esta parceria.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th className={celula}>Empenho</th>
                    <th className={celula}>Data</th>
                    <th className={celula}>Credor</th>
                    <th className={`${celula} text-right`}>Líquido de anulações</th>
                  </tr>
                </thead>
                <tbody>
                  {detalhe.empenhos.map((e) => (
                    <tr key={e.id} data-empenho-da-ppp={e.numero}>
                      <td className={celula}><Link className="underline" href={`/despesa/empenhos/${e.id}`}>{e.numero}</Link></td>
                      <td className={celula}>{e.data}</td>
                      <td className={celula}>{e.credor}</td>
                      <td className={`${celula} text-right`}><ValorMonetario valor={e.liquido} /></td>
                    </tr>
                  ))}
                  <tr>
                    <td className={`${celula} font-semibold`} colSpan={3}>Total empenhado</td>
                    <td className={`${celula} text-right font-semibold`} data-total-empenhado><ValorMonetario valor={detalhe.totalEmpenhado} /></td>
                  </tr>
                </tbody>
              </table>
            )}
            {detalhe.motivoSemEmpenhos !== null ? null : <p className="mt-2 text-xs"><Link className="text-[color:var(--color-primary)] underline" href={`/relatorios/gerenciais?ppp=${id}`}>Ver os empenhos desta parceria na consulta gerencial</Link></p>}
          </section>
        </div>
      }
      anexos={
        <>
          <ListaDeAnexos anexos={anexos} />
          {permitidas.has("ANEXAR_ARQUIVO") ? (
            <div className="mt-3">
              <FormAnexo accept={EXTENSOES_ACEITAS} dono={{ contratoPppId: id }} rotulo="Anexar documento da parceria" tamanhoMaximoBytes={TAMANHO_MAXIMO_BYTES} />
            </div>
          ) : null}
        </>
      }
      acoes={<FormsDoRecurso definicao={PARCERIAS_PUBLICO_PRIVADAS} permitidas={[...permitidas]} opcoes={{}} registroId={id} action={pppAction} modo="acoes" />}
    />
  );
}
