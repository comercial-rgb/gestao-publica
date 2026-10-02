import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";
import { lerUnidadesGestoras, ROTULO_DA_NATUREZA_DA_UG } from "../../../../lib/portas/unidades-gestoras";
import { FormCadastrarUg, FormEncerrarUg } from "./Forms";

/**
 * V26 — AS UNIDADES GESTORAS DO MUNICÍPIO, como estão no cadastro do Tribunal: as escrituradas aqui e as de fora,
 * que aparecem como o outro lado de uma transferência.
 *
 * ⚠️ `force-dynamic`: depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

const TITULO = "Unidades gestoras";
const SUBTITULO = "As unidades do município que prestam contas ao Tribunal";

export default async function UnidadesGestorasPage(): Promise<React.ReactElement> {
  let dados: Awaited<ReturnType<typeof lerUnidadesGestoras>>;
  try {
    await telaExigeLeituraDoEnte("CONSULTAR_CONTABILIDADE");
    dados = await lerUnidadesGestoras();
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
        Prefeitura e Câmara prestam contas como unidades distintas, cada uma com o seu código no Tribunal. Cadastre só o que
        consta no cadastro do Tribunal: secretaria ou fundo não vira unidade gestora sozinho. A unidade escriturada fora
        deste sistema fica cadastrada para identificar o outro lado das transferências.
      </div>
      <FormCadastrarUg entidades={dados.entidades} naturezas={ROTULO_DA_NATUREZA_DA_UG} />
      <Card>
        <h2 className="mb-2 text-sm font-semibold text-[color:var(--color-ink)]">Unidades cadastradas</h2>
        {dados.ugs.length === 0 ? (
          <p className="text-xs text-[color:var(--color-ink-3)]" data-teste="sem-unidade-gestora">Nenhuma unidade gestora cadastrada. A remessa ao Tribunal usa o código de demonstração até o cadastro.</p>
        ) : (
          <table className="w-full text-sm" data-lista="unidades-gestoras">
            <tbody>
              {dados.ugs.map((u) => (
                <tr key={u.id} className="border-b border-[color:var(--color-border)] align-top" data-unidade-gestora={u.codigo}>
                  <td className="py-1.5 pr-4"><strong className="font-mono">{u.codigo}</strong><span className="block">{u.nome}</span></td>
                  <td className="py-1.5 pr-4 text-xs">{u.natureza}<span className="block text-[color:var(--color-ink-3)]">{u.escrituracao}</span></td>
                  <td className="py-1.5 pr-4 text-xs">desde {u.desde}{u.ate !== null ? <span className="block">até {u.ate}</span> : null}<span className="block text-[color:var(--color-ink-3)]">{u.fundamento}</span></td>
                  <td className="py-1.5 text-xs">{u.ate === null ? <FormEncerrarUg ugId={u.id} codigo={u.codigo} /> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
