import { Badge } from "../../../../components/ui/Badge";
import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import {
  acoesDoCensoPorArea,
  lerDiagnosticoDePermissoes,
  listarPerfis,
  listarUnidadesParaConcessao,
  PortaSemBancoError,
  type DiagnosticoDePermissoes as Diagnostico,
  type PerfilAdmin,
} from "../../../../lib/portas/administracao";
import { instanteCivilBr } from "../../../../packages/datas/index";
import { DiagnosticoDePermissoes } from "./DiagnosticoDePermissoes";
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
    subtitulo="Permissões de cada perfil e unidades em que valem. Toda concessão é registrada com o autor."
  />
);

export default async function PerfisPage(): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_ADMINISTRACAO");

  let perfis: readonly PerfilAdmin[];
  let unidades: readonly { id: string; codigo: string; descricao: string }[];
  let permitidas: ReadonlySet<string>;
  let diagnostico: Diagnostico;
  try {
    [perfis, unidades, permitidas, diagnostico] = await Promise.all([
      listarPerfis(),
      listarUnidadesParaConcessao(),
      acoesPermitidas(["CRIAR_PERFIL", "CONCEDER_ACAO_A_PERFIL", "REVOGAR_ACAO_DE_PERFIL"]),
      lerDiagnosticoDePermissoes(),
    ]);
  } catch (erro) {
    return (
      <div className="space-y-4">
        {CABECALHO}
        <EstadoVazio
          titulo={
            erro instanceof PortaSemBancoError
              ? "Perfis indisponíveis no momento"
              : "Não foi possível listar os perfis"
          }
          descricao={erro instanceof Error ? erro.message : "Tente novamente em alguns instantes."}
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

      <DiagnosticoDePermissoes
        semPerfil={diagnostico.deriva.semPerfil}
        foraDoCenso={diagnostico.deriva.foraDoCenso}
        totalDoCenso={diagnostico.deriva.totalDoCenso}
        atualizacoes={diagnostico.atualizacoes.map((a) => ({
          versao: a.versao,
          nome: a.nome,
          descricao: a.descricao,
          aplicadaEm: a.aplicadaEm === null ? null : instanteCivilBr(a.aplicadaEm),
          aplicadaPor: a.aplicadaPor,
          concessoes: a.concessoes,
          previa: a.previa,
        }))}
        podeAplicar={podeConceder}
      />

      {podeCriar ? <FormCriarPerfil /> : null}

      {perfis.length === 0 ? (
        <EstadoVazio
          titulo="Sem perfis"
          descricao="Nenhum perfil cadastrado. Usuários sem perfil não têm acesso a nenhuma funcionalidade."
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
                  Este perfil ainda não possui permissões. Usuários com este perfil não poderão executar
                  nenhuma ação até que sejam concedidas.
                </p>
              ) : (
                <>
                  <p className="mt-2 text-xs text-[color:var(--color-ink-2)]">
                    {global ? "Possui permissões válidas em todas as unidades gestoras. " : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {p.permissoes.map((perm) => (
                      <span
                        key={`${perm.acao}-${perm.unidadeOrcId ?? "G"}`}
                        className="rounded-[var(--radius-md)] bg-[color:var(--color-surface-2)] px-2 py-0.5 text-[11px] text-[color:var(--color-ink-2)]"
                        title={
                          perm.unidadeOrcId === null
                            ? "Válida em todas as unidades gestoras"
                            : `Válida somente na unidade ${perm.unidadeOrc}`
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
