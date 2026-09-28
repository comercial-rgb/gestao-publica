import Link from "next/link";
import { Badge } from "../../../../components/ui/Badge";
import { BarraFiltros } from "../../../../components/ui/BarraFiltros";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { Paginacao } from "../../../../components/ui/Paginacao";
import {
  TabelaDeDados,
  type ColunaTabela,
} from "../../../../components/ui/TabelaDeDados";
import {
  CLASSE_CAMPO as CAMPO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import {
  listarPessoasDaTela,
  PortaSemBancoError,
  type PapelDePessoa,
  type PessoaDaTela,
} from "../../../../lib/portas/pessoas";
import { FormPessoa } from "./FormPessoa";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";

/**
 * PESSOAS E CREDORES — o cadastro compartilhado.
 *
 * ⚠️ A LISTA MOSTRA O CADASTRO DE HOJE. Ele é append-only: cada alteração é uma versão
 * nova, e a anterior fica. O que aparece aqui é a versão VIGENTE — a busca por nome
 * também cai sobre ela, e não sobre nomes antigos (ver `m19-pessoas/consultas.ts`).
 *
 * ⚠️ OS PAPÉIS SÃO DERIVADOS dos movimentos, não uma coluna. "É credor?" se responde pelo
 * último movimento daquele papel, e por isso um papel encerrado some da lista sem que o
 * histórico dele desapareça.
 */
export const dynamic = "force-dynamic";

const TAMANHO_PAGINA = 25;

const PAPEIS: readonly { readonly valor: PapelDePessoa; readonly rotulo: string }[] = [
  { valor: "CREDOR", rotulo: "Credor" },
  { valor: "CONSIGNATARIO", rotulo: "Consignatário" },
  { valor: "SERVIDOR", rotulo: "Servidor" },
  { valor: "REPRESENTANTE", rotulo: "Representante" },
];

const ROTULO_DO_PAPEL: Record<PapelDePessoa, string> = {
  CREDOR: "Credor",
  CONSIGNATARIO: "Consignatário",
  SERVIDOR: "Servidor",
  REPRESENTANTE: "Representante",
};

function primeiroValor(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

const COLUNAS: readonly ColunaTabela<PessoaDaTela>[] = [
  {
    chave: "nome",
    cabecalho: "Nome / razão social",
    celula: (p) => (
      <Link
        href={`/cadastros/pessoas/${p.id}`}
        className="font-medium text-[color:var(--color-ink)] underline-offset-2 hover:underline"
      >
        {p.nome}
      </Link>
    ),
  },
  {
    chave: "documento",
    cabecalho: "Documento",
    // Tabular para que os documentos alinhem coluna a coluna e a leitura seja de varredura.
    celula: (p) => <span className="tabular-nums">{p.documentoFormatado}</span>,
  },
  {
    chave: "tipo",
    cabecalho: "Tipo",
    celula: (p) => (p.tipo === "FISICA" ? "Física" : "Jurídica"),
  },
  {
    chave: "papeis",
    cabecalho: "Papéis",
    celula: (p) =>
      p.papeis.length === 0 ? (
        <span className="text-[color:var(--color-ink-3)]">—</span>
      ) : (
        <span className="flex flex-wrap gap-1">
          {p.papeis.map((papel) => (
            <Badge key={papel} status="neutro">
              {ROTULO_DO_PAPEL[papel]}
            </Badge>
          ))}
        </span>
      ),
  },
  {
    chave: "situacao",
    cabecalho: "Situação",
    celula: (p) => (
      <Badge status={p.ativa ? "ok" : "neutro"}>{p.ativa ? "Ativa" : "Inativa"}</Badge>
    ),
  },
];

export default async function PessoasPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_CADASTROS");
  const params = await searchParams;

  const busca = primeiroValor(params["busca"]).trim();
  const papelBruto = primeiroValor(params["papel"]);
  const situacao = primeiroValor(params["situacao"]);
  const paginaBruta = Number.parseInt(primeiroValor(params["pagina"]), 10);
  const pagina = Number.isFinite(paginaBruta) && paginaBruta > 0 ? paginaBruta : 1;

  const papel = PAPEIS.some((p) => p.valor === papelBruto)
    ? (papelBruto as PapelDePessoa)
    : undefined;
  // ⚠️ Três estados, e o vazio é "todas" — não "ativas". Um default silencioso esconderia
  // os cadastros desativados de quem foi procurar exatamente por eles.
  const ativa = situacao === "ativas" ? true : situacao === "inativas" ? false : undefined;

  const cabecalho = (
    <PageHeader
      titulo="Pessoas e credores"
      subtitulo="Cadastro único de pessoas físicas e jurídicas, com papéis e histórico de alterações"
    />
  );

  let resultado: Awaited<ReturnType<typeof listarPessoasDaTela>>;
  try {
    resultado = await listarPessoasDaTela({
      busca: busca === "" ? undefined : busca,
      papel,
      ativa,
      limite: TAMANHO_PAGINA,
      deslocamento: (pagina - 1) * TAMANHO_PAGINA,
    });
  } catch (erro) {
    return (
      <div className="space-y-4">
        {cabecalho}
        <EstadoVazio
          titulo={
            erro instanceof PortaSemBancoError
              ? "Cadastro indisponível no momento"
              : "Não foi possível consultar o cadastro de pessoas"
          }
          descricao={erro instanceof Error ? erro.message : "Tente novamente em alguns instantes."}
        />
      </div>
    );
  }

  const queryDaPagina = (destino: number): string => {
    const q = new URLSearchParams();
    if (busca !== "") q.set("busca", busca);
    if (papel !== undefined) q.set("papel", papel);
    if (situacao !== "") q.set("situacao", situacao);
    if (destino > 1) q.set("pagina", String(destino));
    const s = q.toString();
    return s === "" ? "/cadastros/pessoas" : `/cadastros/pessoas?${s}`;
  };

  return (
    <div className="space-y-4">
      {cabecalho}

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        Cada alteração gera uma <strong>nova versão</strong> do cadastro, e a anterior permanece no
        histórico com autor, data e motivo. A desativação também é registrada como uma nova versão.
      </div>

      <FormPessoa />

      <BarraFiltros hrefLimpar="/cadastros/pessoas">
        <label className="text-xs text-[color:var(--color-ink-2)] md:col-span-2">
          <span className={ROTULO}>Nome ou documento</span>
          <input
            name="busca"
            defaultValue={busca}
            placeholder="Alfa Ltda  ·  11.222.333/0001-81"
            className={CAMPO}
          />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Papel</span>
          <select name="papel" defaultValue={papel ?? ""} className={CAMPO}>
            <option value="">Todos</option>
            {PAPEIS.map((p) => (
              <option key={p.valor} value={p.valor}>
                {p.rotulo}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Situação</span>
          <select name="situacao" defaultValue={situacao} className={CAMPO}>
            <option value="">Todas</option>
            <option value="ativas">Ativas</option>
            <option value="inativas">Inativas</option>
          </select>
        </label>
      </BarraFiltros>

      {resultado.itens.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma pessoa encontrada"
          descricao={
            busca !== "" || papel !== undefined || situacao !== ""
              ? "Nenhum registro corresponde aos filtros aplicados. Limpe os filtros para ver todo o cadastro."
              : "O cadastro está vazio. Use o formulário acima para incluir a primeira pessoa."
          }
        />
      ) : (
        <>
          <TabelaDeDados
            colunas={COLUNAS}
            linhas={resultado.itens}
            keyDe={(p) => p.id}
            legenda={`${resultado.total} pessoa(s) encontrada(s).`}
          />
          <Paginacao
            pagina={pagina}
            tamanhoPagina={TAMANHO_PAGINA}
            total={resultado.total}
            hrefDePagina={queryDaPagina}
            rotuloItens="pessoas"
          />
        </>
      )}
    </div>
  );
}
