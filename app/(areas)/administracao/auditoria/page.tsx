import Link from "next/link";
import { Badge, type StatusBadge } from "../../../../components/ui/Badge";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { TabelaDeDados, type ColunaTabela } from "../../../../components/ui/TabelaDeDados";
import { listarOperacoes, PortaSemBancoError, type OperacaoAuditada, type PaginaDeAuditoria } from "../../../../lib/portas/auditoria";
import { FiltroAuditoria } from "./FiltroAuditoria";

/** ADMINISTRAÇÃO · Auditoria (RegistroDeOperacao, TR 6.1-6.3) — leitura com filtros e paginação. */
export const dynamic = "force-dynamic";

const BADGE: Record<OperacaoAuditada["resultado"], StatusBadge> = { SUCESSO: "ok", NEGADO: "alerta", ERRO: "erro" };

export default async function AuditoriaPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const sp = await searchParams;
  const um = (k: string): string => { const v = sp[k]; return (Array.isArray(v) ? v[0] : v) ?? ""; };
  const usuario = um("usuario"), acao = um("acao"), resultadoStr = um("resultado"), desdeStr = um("desde"), ateStr = um("ate");
  const pagina = Math.max(1, Number.parseInt(um("pagina") || "1", 10) || 1);
  const resultado = (["SUCESSO", "NEGADO", "ERRO"] as const).includes(resultadoStr as "SUCESSO") ? (resultadoStr as OperacaoAuditada["resultado"]) : undefined;

  const cabecalho = <PageHeader titulo="Auditoria" subtitulo="Registro de operações da borda — quem, quando, qual ação e resultado" acoes={<FiltroAuditoria usuario={usuario} acao={acao} resultado={resultadoStr} desde={desdeStr} ate={ateStr} />} />;

  let dados: PaginaDeAuditoria;
  try {
    dados = await listarOperacoes({
      ...(usuario !== "" ? { usuario } : {}), ...(acao !== "" ? { acao } : {}), ...(resultado !== undefined ? { resultado } : {}),
      ...(desdeStr !== "" ? { desde: new Date(`${desdeStr}T00:00:00.000Z`) } : {}), ...(ateStr !== "" ? { ate: new Date(`${ateStr}T23:59:59.000Z`) } : {}),
      pagina,
    });
  } catch (erro) {
    return <div>{cabecalho}<EstadoVazio titulo={erro instanceof PortaSemBancoError ? "Banco de dados não configurado" : "Não foi possível ler a auditoria"} descricao={erro instanceof Error ? erro.message : "Erro."} /></div>;
  }

  if (dados.total === 0) return <div>{cabecalho}<EstadoVazio titulo="Nenhuma operação" descricao="Não há registro de operação para os filtros selecionados." /></div>;

  const linhas = dados.operacoes.map((o) => ({ ...o, quando: o.criadoEm.toISOString().slice(0, 19).replace("T", " ") }));
  const qs = (p: number): string => {
    const params = new URLSearchParams();
    for (const [k, v] of [["usuario", usuario], ["acao", acao], ["resultado", resultadoStr], ["desde", desdeStr], ["ate", ateStr]] as const) if (v !== "") params.set(k, v);
    params.set("pagina", String(p));
    return `?${params.toString()}`;
  };

  return (
    <div className="space-y-4">
      {cabecalho}
      <TabelaDeDados
        colunas={COLUNAS}
        linhas={linhas}
        keyDe={(l) => l.id}
        legenda={`${dados.total} operação(ões) · página ${dados.pagina} de ${dados.paginas}.`}
      />
      {dados.paginas > 1 ? (
        <div className="flex items-center justify-between text-sm">
          {dados.pagina > 1 ? <Link href={qs(dados.pagina - 1)} className="text-[color:var(--color-primary)] hover:underline">← anterior</Link> : <span />}
          <span className="text-[color:var(--color-ink-3)]">página {dados.pagina} de {dados.paginas}</span>
          {dados.pagina < dados.paginas ? <Link href={qs(dados.pagina + 1)} className="text-[color:var(--color-primary)] hover:underline">próxima →</Link> : <span />}
        </div>
      ) : null}
    </div>
  );
}

type LinhaA = OperacaoAuditada & { quando: string };
const COLUNAS: readonly ColunaTabela<LinhaA>[] = [
  { chave: "quando", cabecalho: "Quando (UTC)", alinhamento: "esquerda", largura: "11rem", celula: (l) => l.quando },
  { chave: "usuario", cabecalho: "Usuário", alinhamento: "esquerda", celula: (l) => l.usuarioIdent },
  { chave: "acao", cabecalho: "Ação", alinhamento: "esquerda", largura: "12rem", celula: (l) => l.acao },
  { chave: "res", cabecalho: "Resultado", alinhamento: "esquerda", largura: "7rem", celula: (l) => <Badge status={BADGE[l.resultado]}>{l.resultado.toLowerCase()}</Badge> },
  { chave: "ip", cabecalho: "IP", alinhamento: "esquerda", largura: "8rem", celula: (l) => l.ip ?? "—" },
  { chave: "detalhe", cabecalho: "Detalhe", alinhamento: "esquerda", celula: (l) => l.detalhe ?? "" },
];
