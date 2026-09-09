import { Badge } from "../../../../components/ui/Badge";
import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { listarPerfis, PortaSemBancoError, type PerfilAdmin } from "../../../../lib/portas/administracao";

/** ADMINISTRAÇÃO · Perfis e permissões (TR 4.56) — leitura: o censo do M16 vira tela. */
export const dynamic = "force-dynamic";

export default async function PerfisPage(): Promise<React.ReactElement> {
  const cabecalho = <PageHeader titulo="Perfis e Permissões" subtitulo="O que cada perfil concede — as ações do censo, por perfil" />;
  let perfis: readonly PerfilAdmin[];
  try {
    perfis = await listarPerfis();
  } catch (erro) {
    return <div>{cabecalho}<EstadoVazio titulo={erro instanceof PortaSemBancoError ? "Banco de dados não configurado" : "Não foi possível listar os perfis"} descricao={erro instanceof Error ? erro.message : "Erro."} /></div>;
  }
  if (perfis.length === 0) return <div>{cabecalho}<EstadoVazio titulo="Sem perfis" descricao="Nenhum perfil cadastrado." /></div>;

  return (
    <div className="space-y-4">
      {cabecalho}
      {perfis.map((p) => {
        const global = p.permissoes.some((perm) => perm.unidadeOrc === null);
        return (
          <Card key={p.nome}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">{p.nome}</h2>
                <p className="text-xs text-[color:var(--color-ink-3)]">{p.descricao}</p>
              </div>
              <Badge status="neutro">{p.permissoes.length} ação(ões)</Badge>
            </div>
            <p className="mt-2 text-xs text-[color:var(--color-ink-2)]">
              {global ? "Concessão GLOBAL (todas as unidades). " : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {p.permissoes.map((perm) => (
                <span key={`${perm.acao}-${perm.unidadeOrc ?? "G"}`} className="rounded-[var(--radius-md)] bg-[color:var(--color-surface-2)] px-2 py-0.5 text-[11px] text-[color:var(--color-ink-2)]" title={perm.unidadeOrc === null ? "todas as UGs" : `UG ${perm.unidadeOrc}`}>
                  {perm.acao}{perm.unidadeOrc !== null ? ` · ${perm.unidadeOrc}` : ""}
                </span>
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
