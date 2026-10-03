import Link from "next/link";
import { formatarMoeda } from "../../../../lib/format/moeda";
import { identidadePublica } from "../../../../lib/portas/identidade";
import { listarDiariasPublicas, PortaSemBancoError, type DiariaPublica } from "../../../../lib/portas/diarias-publicas";
import { anoCivil } from "../../../../packages/datas/index";

/**
 * CONSULTA PÚBLICA DE DIÁRIAS (V32): quem recebeu, para onde, quando, por quê, quanto, por qual norma, e se a
 * prestação de contas foi aprovada. O CPF sai mascarado.
 */
export const dynamic = "force-dynamic";

const brData = (dia: string): string => `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`;

export default async function DiariasPublicasPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const sp = await searchParams;
  const bruto = typeof sp["exercicio"] === "string" ? Number.parseInt(sp["exercicio"], 10) : Number.NaN;
  const exercicio = Number.isInteger(bruto) && bruto >= 2000 && bruto <= 2100 ? bruto : anoCivil(new Date());
  const id = await identidadePublica();
  let dados: { readonly linhas: readonly DiariaPublica[]; readonly total: string } | null = null;
  let erro: string | null = null;
  try {
    dados = await listarDiariasPublicas(exercicio);
  } catch (e) {
    erro = e instanceof PortaSemBancoError ? "Consulta indisponível no momento." : "Não foi possível consultar as diárias.";
  }
  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <nav aria-label="Caminho" className="mb-3 text-xs">
        <Link href="/transparencia" className="underline">Transparência</Link> › Diárias
      </nav>
      <header className="mb-4">
        <h1 className="text-2xl font-semibold text-[color:var(--color-ink)]">Diárias</h1>
        <p className="mt-1 text-sm text-[color:var(--color-ink-2)]">
          {id.ente?.nomeDeExibicao ?? "Ente não configurado"} · diárias concedidas no exercício de {exercicio}.
        </p>
      </header>
      <form method="get" className="mb-4 flex items-end gap-2 text-sm">
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className="mb-1 block">Exercício</span>
          <input name="exercicio" type="number" min={2000} max={2100} defaultValue={exercicio} className="h-9 w-28 rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] px-2" />
        </label>
        <button type="submit" className="h-9 rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] px-3">Consultar</button>
      </form>
      {erro !== null ? (
        <p role="alert" className="text-sm">{erro}</p>
      ) : dados !== null && dados.linhas.length === 0 ? (
        <p className="text-sm text-[color:var(--color-ink-2)]">Nenhuma diária concedida em {exercicio}.</p>
      ) : dados !== null ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs" data-consulta-publica="diarias">
            <caption className="mb-2 text-left text-sm text-[color:var(--color-ink-2)]">
              {dados.linhas.length} diária(s), total de R$ {formatarMoeda(dados.total).texto}
            </caption>
            <thead>
              <tr className="text-[color:var(--color-ink-3)]">
                <th scope="col" className="py-2 pr-3">Beneficiário</th>
                <th scope="col" className="py-2 pr-3">Destino e finalidade</th>
                <th scope="col" className="py-2 pr-3">Período</th>
                <th scope="col" className="py-2 pr-3">Diárias</th>
                <th scope="col" className="py-2 pr-3">Valor</th>
                <th scope="col" className="py-2 pr-3">Norma</th>
                <th scope="col" className="py-2 pr-3">Prestação de contas</th>
              </tr>
            </thead>
            <tbody>
              {dados.linhas.map((l) => (
                <tr key={l.numero} className="border-t border-[color:var(--color-border)] align-top">
                  <th scope="row" className="py-2 pr-3 font-normal">
                    {l.beneficiarioNome}
                    <span className="block text-[color:var(--color-ink-3)]">{l.cargoOuFuncao ?? ""} {l.beneficiarioDocumento}</span>
                  </th>
                  <td className="py-2 pr-3">
                    {l.destino}
                    <span className="block text-[color:var(--color-ink-3)]">{l.finalidade}</span>
                  </td>
                  <td className="py-2 pr-3">{brData(l.diaSaida)} a {brData(l.diaRetorno)}</td>
                  <td className="py-2 pr-3">{l.quantidade.replace(".", ",")} × R$ {formatarMoeda(l.valorUnitario).texto}</td>
                  <td className="py-2 pr-3">R$ {formatarMoeda(l.valor).texto}</td>
                  <td className="py-2 pr-3">{l.atoAutorizativo}</td>
                  <td className="py-2 pr-3">{l.prestacaoAprovada ? "Aprovada" : "Pendente"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </main>
  );
}
