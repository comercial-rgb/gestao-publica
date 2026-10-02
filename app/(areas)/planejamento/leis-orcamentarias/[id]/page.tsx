import { notFound } from "next/navigation";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { FormsDoRecurso } from "../../../../../components/molde/FormsDoRecurso";
import { ListaDeAnexos } from "../../../../../components/ui/ListaDeAnexos";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { EXTENSOES_ACEITAS, lerAnexosDaLeiOrcamentaria, TAMANHO_MAXIMO_BYTES } from "../../../../../lib/portas/documentos";
import { acoesPermitidas, exigirLeitura } from "../../../../../lib/portas/molde";
import { LEIS_ORCAMENTARIAS } from "../../../../../lib/portas/recursos/leis-orcamentarias";
import { disponibilidadeDaLeiOrcamentaria, verLeiOrcamentaria } from "../../../../../lib/portas/recursos/leis-orcamentarias-dados";
import { FormAnexo } from "../../../documentos/FormAnexo";
import { acaoDasLeisOrcamentariasAction } from "../actions";
import { lerDiferencasDoProjeto, lerVersoesDoProjeto } from "../../../../../lib/portas/projeto-da-loa";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import { FormVersaoDoProjeto } from "./VersoesDoProjeto";

/**
 * O detalhe de uma LOA: o projeto, a lei que o aprovou (ação "Registrar a lei aprovada") e os
 * documentos anexos (o projeto, a lei publicada, os anexos da lei), com a integridade conferida a
 * cada acesso pelo M22. A aba de anexos só é lida quando pedida.
 */
export const dynamic = "force-dynamic";

export default async function Detalhe({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly id: string }>;
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_PLANEJAMENTO");
  const { id } = await params;
  const consulta = lerConsulta(LEIS_ORCAMENTARIAS, await searchParams);
  const [detalhe, permitidas, disponibilidade] = await Promise.all([
    verLeiOrcamentaria(id),
    acoesPermitidas([...LEIS_ORCAMENTARIAS.acoes.map((a) => a.acaoDoCenso), "ANEXAR_ARQUIVO", "CADASTRAR_LOA"]),
    disponibilidadeDaLeiOrcamentaria(id).catch(() => null),
  ]);
  if (detalhe === null) notFound();
  const abaDeAnexos =
    consulta.aba === "anexos" ? (
      <div>
        <p className="mb-3 text-sm text-[color:var(--color-ink-2)]">
          Anexe o projeto de lei, a lei publicada e os anexos da lei. A integridade de cada arquivo é
          verificada a cada acesso; um arquivo alterado após o envio não é disponibilizado.
        </p>
        <ListaDeAnexos anexos={await lerAnexosDaLeiOrcamentaria(id)} />
        {permitidas.has("ANEXAR_ARQUIVO") ? (
          <div className="mt-4 border-t border-[color:var(--color-border)] pt-4">
            <FormAnexo
              dono={{ leiOrcamentariaAnualId: id }}
              accept={EXTENSOES_ACEITAS}
              tamanhoMaximoBytes={TAMANHO_MAXIMO_BYTES}
              rotulo="Anexar documento da lei"
            />
          </div>
        ) : null}
      </div>
    ) : null;

  // V26 — as versões do projeto encaminhado à Câmara, com a cópia dos valores (a prestação de contas lê a cópia).
  const projeto = await lerVersoesDoProjeto(id);
  // V27 — com a lei aprovada, o que mudou do projeto para a lei (a cópia do projeto não é tocada).
  const diferencas = await lerDiferencasDoProjeto(projeto.aprovada ? projeto.versoes.map((v) => v.id) : []);
  const secaoDoProjeto = (
    <section className="space-y-3" data-secao="versoes-do-projeto" aria-label="Versões do projeto encaminhado">
      <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">Versões do projeto encaminhado à Câmara</h2>
      {projeto.versoes.length === 0 ? (
        <p className="text-xs text-[color:var(--color-ink-3)]" data-teste="sem-versao-do-projeto">
          {projeto.aprovada
            ? "Nenhuma versão guardada antes da aprovação: o projeto não pode ser reconstruído a partir da lei aprovada e fica fora da prestação de contas."
            : "Nenhuma versão guardada. Guarde a cópia no dia do encaminhamento."}
        </p>
      ) : (
        <table className="w-full text-sm" data-lista="versoes-do-projeto">
          <tbody>
            {projeto.versoes.map((v) => (
              <tr key={v.id} className="border-b border-[color:var(--color-border)] align-top" data-versao-do-projeto={v.numero}>
                <td className="py-1.5 pr-4"><strong>{v.numero}. {v.tipo}</strong><span className="block text-xs">em {v.encaminhamento} · {v.documento}</span></td>
                <td className="py-1.5 pr-4 text-xs">Despesa <ValorMonetario valor={v.despesa} /><span className="block">Receita líquida <ValorMonetario valor={v.receita} /></span></td>
                <td className="py-1.5 pr-4 text-xs">{v.linhas}</td>
                <td className="py-1.5 text-xs">{v.vaiAoTribunal ? `Vai na prestação de contas de ${v.remessa}` : "Não vai à prestação de contas"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {projeto.versoes.map((v) => {
        const d = diferencas.get(v.id);
        if (d === undefined) return null;
        return (
          <details key={`dif-${v.id}`} className="text-xs" data-diferencas-da-versao={v.numero}>
            <summary className="cursor-pointer text-[color:var(--color-primary)]">
              Versão {v.numero}: o que mudou do projeto para a lei aprovada ({d.diferencas.length === 0 ? "nada" : `${String(d.diferencas.length)} linha(s)`})
            </summary>
            <p className="mt-1">
              Despesa: projeto <ValorMonetario valor={d.totais.despesaProjeto} />, lei <ValorMonetario valor={d.totais.despesaLei} />. Receita (sem descontar deduções): projeto{" "}
              <ValorMonetario valor={d.totais.receitaProjeto} />, lei <ValorMonetario valor={d.totais.receitaLei} />.
            </p>
            {d.diferencas.length > 0 ? (
              <table className="mt-1 w-full">
                <thead><tr className="text-left text-[color:var(--color-ink-2)]"><th className="pr-3">Tipo</th><th className="pr-3">Classificação</th><th className="pr-3 text-right">Projeto</th><th className="pr-3 text-right">Lei</th><th className="text-right">Diferença</th></tr></thead>
                <tbody>
                  {d.diferencas.slice(0, 300).map((x, k) => (
                    <tr key={k} className="border-b border-[color:var(--color-border)]">
                      <td className="pr-3">{x.tipo === "DESPESA" ? "Despesa" : "Receita"}</td>
                      <td className="pr-3 font-mono">{x.linha}</td>
                      <td className="pr-3 text-right"><ValorMonetario valor={x.projeto} /></td>
                      <td className="pr-3 text-right"><ValorMonetario valor={x.lei} /></td>
                      <td className="text-right"><ValorMonetario valor={x.diferenca} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            {d.diferencas.length > 300 ? <p className="mt-1 text-[color:var(--color-ink-3)]">Mostrando as 300 primeiras linhas de {d.diferencas.length}.</p> : null}
          </details>
        );
      })}
      {!projeto.aprovada && projeto.exercicio !== null && permitidas.has("CADASTRAR_LOA") ? <FormVersaoDoProjeto leiId={id} exercicio={projeto.exercicio} /> : null}
    </section>
  );

  return (
    <div className="space-y-6">
    <DetalheDeRecurso
      definicao={LEIS_ORCAMENTARIAS}
      id={id}
      titulo={detalhe.titulo}
      subtitulo={detalhe.subtitulo}
      selos={detalhe.selos}
      abaAtiva={consulta.aba as AbaDoMolde}
      dados={detalhe.dados}
      historico={detalhe.historico}
      anexos={abaDeAnexos}
      acoes={
        <FormsDoRecurso
          definicao={LEIS_ORCAMENTARIAS}
          permitidas={[...permitidas]}
          opcoes={{}}
          registroId={id}
          action={acaoDasLeisOrcamentariasAction}
          modo="acoes"
          disponibilidade={disponibilidade}
        />
      }
    />
    {secaoDoProjeto}
    </div>
  );
}
