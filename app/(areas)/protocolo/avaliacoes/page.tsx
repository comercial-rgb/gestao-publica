import { Badge } from "../../../../components/ui/Badge";
import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { telaExigeLeituraEmAlgumEscopo } from "../../../../lib/portas/leitura";
import { acoesPermitidas } from "../../../../lib/portas/molde";
import { avaliacoesParaModeracao, metodologiasDaAvaliacao, PortaSemBancoError } from "../../../../lib/portas/ouvidoria";
import { FormMetodologia, FormRemoverAvaliacao } from "./FormulariosDaAvaliacao";

/**
 * A AVALIAÇÃO DOS SERVIÇOS — metodologia versionada e moderação (M21, V7 M1 U4).
 * A lista de avaliações (com a descrição privada) só aparece a quem tem a moderação; quem avaliou não
 * aparece. ⚠️ Imports RELATIVOS na UI.
 */
export const dynamic = "force-dynamic";

const TITULO = "Avaliação dos serviços";
const DESCRICAO = "A escala e o método publicados com o resultado de cada serviço, em versões; e a moderação por abuso ou dado pessoal, com motivo.";

export default async function Pagina(): Promise<React.ReactElement> {
  await telaExigeLeituraEmAlgumEscopo("CONSULTAR_PROTOCOLO");
  try {
    const [metodologias, avaliacoes, permitidas] = await Promise.all([metodologiasDaAvaliacao(), avaliacoesParaModeracao(), acoesPermitidas(["CONFIGURAR_CARTA_DE_SERVICOS"])]);
    return (
      <div className="space-y-4">
        <PageHeader titulo={TITULO} subtitulo={DESCRICAO} />
        <Card>
          <h2 className="mb-2 text-sm font-semibold">Metodologia</h2>
          {metodologias.length === 0 ? (
            <p className="text-sm text-[color:var(--color-ink-2)]" data-metodologia="nenhuma">Nenhuma versão gravada: a avaliação está fechada ao público e aos requerentes.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm" data-metodologias>
                <thead><tr className="text-xs text-[color:var(--color-ink-2)]"><th className="py-1 pr-3">Versão</th><th className="py-1 pr-3">Escala</th><th className="py-1 pr-3">Rótulos</th><th className="py-1 pr-3">Período</th><th className="py-1 pr-3">Avaliações</th><th className="py-1">Gravada em</th></tr></thead>
                <tbody>
                  {metodologias.map((m, i) => (
                    <tr key={m.versao} className="border-t border-[color:var(--color-border)] align-top">
                      <td className="py-2 pr-3">{m.versao}{i === 0 ? <> <Badge status="ok">vigente</Badge></> : null}</td>
                      <td className="py-2 pr-3">{m.escala}</td>
                      <td className="py-2 pr-3">{m.rotulos}</td>
                      <td className="py-2 pr-3">{m.periodoMeses} meses</td>
                      <td className="py-2 pr-3 tabular-nums">{m.avaliacoes}</td>
                      <td className="py-2">{m.criadaEm}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        {permitidas.has("CONFIGURAR_CARTA_DE_SERVICOS") ? <FormMetodologia /> : null}
        <Card>
          <h2 className="mb-2 text-sm font-semibold">Moderação</h2>
          {avaliacoes === null ? (
            <p className="text-sm text-[color:var(--color-ink-2)]" data-moderacao="sem-permissao">Seu perfil não tem a moderação das avaliações: as descrições são privadas e não aparecem aqui.</p>
          ) : avaliacoes.length === 0 ? (
            <p className="text-sm text-[color:var(--color-ink-2)]">Nenhuma avaliação recebida.</p>
          ) : (
            <ul className="space-y-3" data-moderacao="lista">
              {avaliacoes.map((a) => (
                <li key={a.id} data-avaliacao={a.id} className="border-t border-[color:var(--color-border)] pt-3 text-sm">
                  <p className="font-semibold">{a.servico} <span className="font-normal text-[color:var(--color-ink-2)]">· {a.origem} · {a.em} · escala v{a.versaoDaMetodologia}{a.revisada ? " · substituída por revisão" : ""}</span></p>
                  <p className="text-xs">{a.notas}</p>
                  {a.descricao !== null ? <p className="mt-1 whitespace-pre-line">{a.descricao}</p> : null}
                  {a.remocao !== null ? (
                    <p className="mt-1 text-xs" data-removida><Badge status="alerta">removida</Badge> {a.remocao.motivo} em {a.remocao.em}: {a.remocao.justificativa}</p>
                  ) : null}
                  <FormRemoverAvaliacao avaliacaoId={a.id} removida={a.remocao !== null} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo={TITULO} subtitulo={DESCRICAO} />
          <EstadoVazio titulo="Banco de dados indisponível" descricao="Esta tela lê a metodologia e as avaliações." />
        </div>
      );
    }
    throw e;
  }
}
