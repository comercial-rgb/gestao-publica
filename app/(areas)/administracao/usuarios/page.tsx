import { Badge } from "../../../../components/ui/Badge";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { TabelaDeDados, type ColunaTabela } from "../../../../components/ui/TabelaDeDados";
import {
  listarPerfisOpcoes,
  listarUsuarios,
  PortaSemBancoError,
  type PerfilOpcao,
  type UsuarioAdmin,
} from "../../../../lib/portas/administracao";
import { FormCriarUsuario } from "./FormCriarUsuario";
import { AcoesUsuario } from "./AcoesUsuario";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";

import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
/** ADMINISTRAÇÃO · Usuários (TR 4.55/4.56) — leitura + escrita (7.14). Server Component. */
export const dynamic = "force-dynamic";

export default async function UsuariosPage(): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_ADMINISTRACAO");
  const cabecalho = <PageHeader titulo="Usuários" subtitulo="Contas de acesso, situação e perfis atribuídos" />;
  let usuarios: readonly UsuarioAdmin[];
  let perfis: readonly PerfilOpcao[];
  try {
    [usuarios, perfis] = await Promise.all([listarUsuarios(), listarPerfisOpcoes()]);
  } catch (erro) {
    return <div>{cabecalho}<EstadoVazio titulo={erro instanceof PortaSemBancoError ? "Usuários indisponíveis no momento" : "Não foi possível listar os usuários"} descricao={erro instanceof Error ? mensagemDoErro(erro, "") : "Tente novamente em alguns instantes."} /></div>;
  }

  return (
    <div className="space-y-4">
      {cabecalho}

      {/* ⚠️ INTERRUPTOR: a troca-obrigatória no primeiro acesso ainda não é forçada (é campo de
          schema, e o schema segue nomeado). O admin ENTREGA a senha; o servidor deve trocá-la. */}
      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-status-alerta-fg)] bg-[color:var(--color-status-alerta-bg)] p-3 text-xs text-[color:var(--color-status-alerta-fg)]">
        <div className="mb-1"><strong>Entrega da senha inicial</strong></div>
        A senha inicial ou redefinida é exibida <strong>uma única vez</strong>; entregue-a ao usuário.
        O sistema ainda não exige a troca no primeiro acesso: oriente o usuário a alterá-la em{" "}
        <strong>Administração → Senha</strong>.
      </div>

      <FormCriarUsuario perfis={perfis} />

      {usuarios.length === 0 ? (
        <EstadoVazio titulo="Sem usuários" descricao="Nenhum usuário cadastrado." />
      ) : (
        <TabelaDeDados<UsuarioAdmin>
          colunas={colunas(perfis)}
          linhas={usuarios}
          keyDe={(u) => u.id}
          legenda={`${usuarios.length} usuário(s).`}
        />
      )}
    </div>
  );
}

function colunas(perfis: readonly PerfilOpcao[]): readonly ColunaTabela<UsuarioAdmin>[] {
  return [
    { chave: "ident", cabecalho: "Identificador", alinhamento: "esquerda", celula: (u) => u.identificador },
    { chave: "nome", cabecalho: "Nome", alinhamento: "esquerda", celula: (u) => u.nome },
    { chave: "ativo", cabecalho: "Situação", alinhamento: "esquerda", largura: "6rem", celula: (u) => <Badge status={u.ativo ? "ok" : "erro"}>{u.ativo ? "ativo" : "inativo"}</Badge> },
    { chave: "perfis", cabecalho: "Perfis", alinhamento: "esquerda", celula: (u) => (u.perfis.length > 0 ? u.perfis.join(", ") : "—") },
    // V3 (pacote 2): a pessoa que o usuário É. Sem vínculo = PENDENTE, nomeado — nunca inferido do nome.
    { chave: "pessoa", cabecalho: "Pessoa do cadastro", alinhamento: "esquerda", celula: (u) => (u.pessoa === null ? <Badge status="alerta">não vinculado</Badge> : <span title={u.pessoa.documento}>{u.pessoa.nome}</span>) },
    {
      chave: "acoes",
      cabecalho: "Ações",
      alinhamento: "esquerda",
      largura: "8rem",
      celula: (u) => <AcoesUsuario usuario={{ id: u.id, identificador: u.identificador, ativo: u.ativo, vinculos: u.vinculos, pessoa: u.pessoa }} perfis={perfis} />,
    },
  ];
}
