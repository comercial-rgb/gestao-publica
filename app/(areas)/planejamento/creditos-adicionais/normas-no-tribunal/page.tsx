import { Card } from "../../../../../components/ui/Card";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../../components/ui/SincronizarContexto";
import { telaExigeLeituraDoEnte } from "../../../../../lib/portas/leitura";
import { lerNormasNoTce } from "../../../../../lib/portas/normas-no-tce";
import { FormDaNorma } from "./FormDaNorma";

/**
 * V26 — AS LEIS ORÇAMENTÁRIAS COM O PROTOCOLO DO TRIBUNAL: o cadastro do protocolo e a lista do que falta.
 *
 * ⚠️ `force-dynamic`: depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

const TITULO = "Leis no Tribunal de Contas";
const SUBTITULO = "O protocolo de cada lei orçamentária no banco de legislação do Tribunal";

export default async function NormasNoTribunalPage(): Promise<React.ReactElement> {
  let dados: Awaited<ReturnType<typeof lerNormasNoTce>>;
  try {
    await telaExigeLeituraDoEnte("CONSULTAR_PLANEJAMENTO");
    dados = await lerNormasNoTce();
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader titulo={TITULO} subtitulo={SUBTITULO} />
        <EstadoVazio titulo="Não foi possível carregar" descricao={erro instanceof Error ? erro.message : "Erro desconhecido."} />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <SincronizarContexto />
      <PageHeader titulo={TITULO} subtitulo={SUBTITULO} />
      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        A prestação de contas do dia em que uma lei orçamentária é publicada leva o protocolo dela no Tribunal. Enquanto
        a lei não estiver registrada aqui, o arquivo das leis daquele dia fica fora da remessa, e os demais seguem.{" "}
        <a href="/planejamento/creditos-adicionais" className="underline">Voltar aos créditos adicionais</a>
      </div>
      <Card>
        <h2 className="mb-2 text-sm font-semibold text-[color:var(--color-ink)]">Leis publicadas sem o protocolo</h2>
        {dados.semProtocolo.length === 0 ? (
          <p className="text-xs text-[color:var(--color-ink-3)]" data-teste="sem-pendencia">Todas as leis do cadastro têm o protocolo registrado.</p>
        ) : (
          <ul className="space-y-1 text-sm" data-lista="leis-sem-protocolo">
            {dados.semProtocolo.map((l) => (
              <li key={`${l.tipo}-${l.lei}`} data-lei-sem-protocolo={l.lei}>
                <strong>Lei {l.lei}</strong> <span className="text-xs text-[color:var(--color-ink-3)]">· {l.tipo} · publicada em {l.publicacao}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <FormDaNorma leis={dados.leis} />
      <Card>
        <h2 className="mb-2 text-sm font-semibold text-[color:var(--color-ink)]">Leis registradas</h2>
        {dados.normas.length === 0 ? (
          <p className="text-xs text-[color:var(--color-ink-3)]">Nenhuma lei registrada.</p>
        ) : (
          <table className="w-full text-sm" data-lista="normas-no-tribunal">
            <thead>
              <tr className="border-b border-[color:var(--color-border)] text-left text-xs text-[color:var(--color-ink-2)]">
                <th className="py-1.5 pr-4">Lei</th><th className="py-1.5 pr-4">Tipo</th><th className="py-1.5 pr-4">Publicação</th>
                <th className="py-1.5 pr-4">Protocolo</th><th className="py-1.5">Autorização</th>
              </tr>
            </thead>
            <tbody>
              {dados.normas.map((n) => (
                <tr key={n.id} className="border-b border-[color:var(--color-border)] align-top" data-norma={n.lei}>
                  <td className="py-1.5 pr-4"><strong>{n.lei}</strong></td>
                  <td className="py-1.5 pr-4 text-xs">{n.tipo}</td>
                  <td className="py-1.5 pr-4 text-xs">{n.publicacao}</td>
                  <td className="py-1.5 pr-4 font-mono text-xs">{n.protocolo}</td>
                  <td className="py-1.5 text-xs">{n.autorizacao}<span className="block text-[color:var(--color-ink-3)]">{n.fundamento}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
