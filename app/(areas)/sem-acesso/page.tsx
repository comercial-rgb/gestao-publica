import Link from "next/link";
import { EstadoVazio } from "../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../components/ui/PageHeader";
import {
  EscopoDeLeituraError,
  ehAcaoDeLeitura,
  exigirLeituraDoEntePara,
  exigirLeituraEmAlgumEscopoPara,
} from "../../../lib/portas/leitura";
import { exigirSessao } from "../../../lib/portas/sessao";

/**
 * SEM ACESSO — a recusa de leitura, com o motivo e quem resolve.
 *
 * ═══ ⚠️ A DECISÃO É RECALCULADA AQUI, A PARTIR DA SESSÃO ═══
 * A tela recusada redireciona para cá com a AÇÃO e o NÍVEL pedidos — nunca com o motivo.
 * Um motivo viajando na URL seria texto que qualquer um forja e compartilha; a ação é o
 * próprio pedido do usuário, e o escopo dele sai do banco, de novo, agora. Se entre o
 * redirecionamento e esta leitura o administrador concedeu a ação, a tela diz isso e
 * oferece o caminho de volta — em vez de repetir uma recusa que já não vale.
 *
 * ⚠️ `de` É CONFERIDO: só caminho interno (começa com "/" e não com "//"), o mesmo
 * cuidado do `retorno` do login contra open-redirect.
 */
export const dynamic = "force-dynamic";

function primeiro(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export default async function SemAcessoPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const sessao = await exigirSessao();
  const sp = await searchParams;
  const acao = primeiro(sp["acao"]);
  const nivel = primeiro(sp["nivel"]) === "algum" ? "algum" : "ente";
  const deBruto = primeiro(sp["de"]);
  const de = deBruto.startsWith("/") && !deBruto.startsWith("//") ? deBruto : "/";

  const cabecalho = (
    <PageHeader
      titulo="Acesso a esta consulta"
      subtitulo="O que o seu perfil concede, e quem pode ampliá-lo."
    />
  );

  if (!ehAcaoDeLeitura(acao)) {
    return (
      <div className="space-y-4">
        {cabecalho}
        <EstadoVazio
          titulo="Pedido malformado"
          descricao="O endereço não nomeia uma consulta conhecida. Volte ao início e use o menu."
          acao={<Link className="text-sm underline" href="/">Ir para o início</Link>}
        />
      </div>
    );
  }

  let motivo: string | null = null;
  try {
    if (nivel === "ente") await exigirLeituraDoEntePara(sessao, acao);
    else await exigirLeituraEmAlgumEscopoPara(sessao, acao);
  } catch (e) {
    if (!(e instanceof EscopoDeLeituraError)) throw e;
    motivo = e.message;
  }

  if (motivo === null) {
    return (
      <div className="space-y-4">
        {cabecalho}
        <EstadoVazio
          titulo="Você já tem acesso a esta consulta"
          descricao="A permissão foi concedida depois do último acesso. Volte à tela pedida."
          acao={<Link className="text-sm underline" href={de}>Voltar para a tela</Link>}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {cabecalho}
      <EstadoVazio
        titulo="Esta consulta não está no seu acesso"
        descricao={motivo}
        acao={<Link className="text-sm underline" href="/">Ir para o início</Link>}
      />
    </div>
  );
}
