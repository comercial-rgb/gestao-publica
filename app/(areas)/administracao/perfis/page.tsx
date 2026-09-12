import { Badge } from "../../../../components/ui/Badge";
import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import {
  acoesDoCensoPorArea,
  listarPerfis,
  listarUnidadesParaConcessao,
  PortaSemBancoError,
  type PerfilAdmin,
} from "../../../../lib/portas/administracao";
import { acoesPermitidas, exigirLeitura } from "../../../../lib/portas/molde";
import { FormCriarPerfil } from "./FormCriarPerfil";
import { GerenciarPerfil } from "./GerenciarPerfil";

/**
 * ADMINISTRAÇÃO · Perfis e permissões (TR 4.56).
 *
 * ⚠️ ATÉ O ENT06 ESTA TELA SÓ LIA, E ERA ISSO QUE TRANCAVA O SISTEMA. O censo ganha ações a
 * cada lote; os perfis de uma instalação que já existe continuam com as antigas. O efeito não
 * é erro de tela: é a tela nova não existir para quem usa — o molde esconde o formulário de
 * quem não tem a ação, e faz certo. Medido no ENT06: 223 ações no censo, 185 concedidas, e as
 * 38 de diferença eram um lote inteiro invisível, sem mensagem e sem log.
 *
 * O `bootstrap` não resolve e não deve: é ato de instalação e recusa rodar em banco povoado.
 * Quem resolve é esta tela.
 */
export const dynamic = "force-dynamic";

const CABECALHO = (
  <PageHeader
    titulo="Perfis e Permissões"
    subtitulo="O que cada perfil concede — e onde vale. Conceder poder é um ato, e fica com o nome de quem o praticou."
  />
);

export default async function PerfisPage(): Promise<React.ReactElement> {
  await exigirLeitura();

  let perfis: readonly PerfilAdmin[];
  let unidades: readonly { id: string; codigo: string; descricao: string }[];
  let permitidas: ReadonlySet<string>;
  try {
    [perfis, unidades, permitidas] = await Promise.all([
      listarPerfis(),
      listarUnidadesParaConcessao(),
      acoesPermitidas(["CRIAR_PERFIL", "CONCEDER_ACAO_A_PERFIL", "REVOGAR_ACAO_DE_PERFIL"]),
    ]);
  } catch (erro) {
    return (
      <div className="space-y-4">
        {CABECALHO}
        <EstadoVazio
          titulo={
            erro instanceof PortaSemBancoError
              ? "Banco de dados não configurado"
              : "Não foi possível listar os perfis"
          }
          descricao={erro instanceof Error ? erro.message : "Erro."}
        />
      </div>
    );
  }

  const grupos = acoesDoCensoPorArea();
  const podeCriar = permitidas.has("CRIAR_PERFIL");
  const podeConceder = permitidas.has("CONCEDER_ACAO_A_PERFIL");
  const podeRevogar = permitidas.has("REVOGAR_ACAO_DE_PERFIL");

  return (
    <div className="space-y-4">
      {CABECALHO}

      {podeCriar ? <FormCriarPerfil /> : null}

      {perfis.length === 0 ? (
        <EstadoVazio
          titulo="Sem perfis"
          descricao="Nenhum perfil cadastrado. Sem perfil, nenhum usuário pode nada — o sistema nega por omissão."
        />
      ) : (
        perfis.map((p) => {
          const global = p.permissoes.some((perm) => perm.unidadeOrcId === null);
          return (
            // ⚠️ O CARTÃO SE IDENTIFICA. Há um por perfil na mesma página, e sem isto um
            // percurso (ou um leitor automatizado) só consegue dizer "existe em algum lugar
            // da tela" — que é verdadeiro mesmo quando a informação está no cartão errado.
            <div key={p.id} data-perfil={p.id} data-nome={p.nome}>
              <Card>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">{p.nome}</h2>
                  <p className="text-xs text-[color:var(--color-ink-3)]">{p.descricao}</p>
                </div>
                <Badge status="neutro">{p.permissoes.length} ação(ões)</Badge>
              </div>

              {p.permissoes.length === 0 ? (
                <p className="mt-2 text-xs text-[color:var(--color-ink-2)]">
                  Este perfil não concede nada ainda. Quem o tiver não poderá executar ação nenhuma
                  — e isso é o padrão do sistema, não um defeito.
                </p>
              ) : (
                <>
                  <p className="mt-2 text-xs text-[color:var(--color-ink-2)]">
                    {global ? "Tem concessão que vale em TODAS as unidades gestoras. " : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {p.permissoes.map((perm) => (
                      <span
                        key={`${perm.acao}-${perm.unidadeOrcId ?? "G"}`}
                        className="rounded-[var(--radius-md)] bg-[color:var(--color-surface-2)] px-2 py-0.5 text-[11px] text-[color:var(--color-ink-2)]"
                        title={
                          perm.unidadeOrcId === null
                            ? "vale em todas as unidades gestoras"
                            : `vale só na unidade ${perm.unidadeOrc}`
                        }
                      >
                        {perm.acao}
                        {perm.unidadeOrc !== null ? ` · ${perm.unidadeOrc}` : ""}
                      </span>
                    ))}
                  </div>
                </>
              )}

              <GerenciarPerfil
                perfilId={p.id}
                permissoes={p.permissoes}
                grupos={grupos}
                unidades={unidades}
                  podeConceder={podeConceder}
                  podeRevogar={podeRevogar}
                />
              </Card>
            </div>
          );
        })
      )}
    </div>
  );
}
