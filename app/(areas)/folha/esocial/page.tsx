import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { exigirLeitura } from "../../../../lib/portas/molde";
import { PortaSemBancoError } from "../../../../lib/portas/cliente";
import { AMBIENTES, consistenciaDoESocial, type Ambiente } from "../../../../lib/portas/esocial";
import { diaCivil, diaCivilBr, inicioDoDiaCivil } from "../../../../packages/datas/index";

/**
 * A CONSISTÊNCIA DA ORIGEM PARA O eSOCIAL (V11 V2.1).
 *
 * ⚠️ ESTA TELA NÃO GERA, NÃO ASSINA E NÃO TRANSMITE NADA — e é isso que ela diz na cara. O
 * leiaute do eSocial é documento oficial da União, não está no repositório, e sem ele não há
 * XML possível que não seja inventado. O que ela faz é a metade que independe do leiaute: dado
 * um pacote REGISTRADO, aponta qual cadastro do ente está vazio e onde se corrige.
 *
 * ⚠️ E NÃO CORRIGE. Fato funcional se corrige na ficha do servidor ou no vínculo, por quem tem
 * a ação. A linha traz a rota; o botão que "ajusta tudo" é exatamente o que não pode existir.
 *
 * ⚠️ `force-dynamic`: depende de SESSÃO e do dia.
 */
export const dynamic = "force-dynamic";

const ROTULO_DO_TIPO: Readonly<Record<string, string>> = {
  AUSENTE: "Ausente",
  CONFERIR: "Conferir",
};

export default async function Pagina({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_FOLHA");
  const sp = await searchParams;

  const brutoAmbiente = typeof sp["ambiente"] === "string" ? sp["ambiente"] : "";
  const ambiente: Ambiente = brutoAmbiente === "PRODUCAO_RESTRITA" ? "PRODUCAO_RESTRITA" : "PRODUCAO";

  const brutoDia = typeof sp["dia"] === "string" ? sp["dia"] : "";
  const hoje = diaCivil(new Date());
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(brutoDia) ? brutoDia : hoje;

  const cabecalho = (
    <PageHeader
      titulo="Consistência para o eSocial"
      subtitulo="O que o cadastro do ente ainda não tem para atender o leiaute registrado. Esta tela não gera, não assina e não transmite arquivo."
    />
  );

  let r: Awaited<ReturnType<typeof consistenciaDoESocial>>;
  try {
    r = await consistenciaDoESocial({ ambiente, dia: inicioDoDiaCivil(dia) });
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <>
          {cabecalho}
          <EstadoVazio titulo="Sem banco configurado" descricao="Esta consulta lê o cadastro de pessoal e precisa do banco." />
        </>
      );
    }
    throw e;
  }

  const ausentes = r.pendencias.filter((p) => p.tipo === "AUSENTE");
  const conferir = r.pendencias.filter((p) => p.tipo === "CONFERIR");

  return (
    <>
      {cabecalho}

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2" data-papel="filtro-da-consistencia">
        <label className="text-xs" htmlFor="ambiente">
          <span className="mb-1 block text-[color:var(--color-ink-2)]">Ambiente</span>
          <select
            id="ambiente"
            name="ambiente"
            defaultValue={ambiente}
            className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] px-2 py-1"
          >
            {AMBIENTES.map((a) => (
              <option key={a.valor} value={a.valor}>
                {a.rotulo}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs" htmlFor="dia">
          <span className="mb-1 block text-[color:var(--color-ink-2)]">Data de referência</span>
          <input
            id="dia"
            name="dia"
            type="date"
            defaultValue={dia}
            className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] px-2 py-1"
          />
        </label>
        <button type="submit" className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] px-3 py-1 text-xs">
          Conferir
        </button>
      </form>

      {r.indisponivel !== null ? (
        <Card>
          <p className="text-sm text-[color:var(--color-ink)]" data-papel="consistencia-indisponivel">
            {r.indisponivel}
          </p>
          {r.leiaute !== null ? (
            <p className="mt-2 text-xs text-[color:var(--color-ink-2)]">
              Pacote registrado: versão {r.leiaute.versao}, arquivo {r.leiaute.arquivo}.
            </p>
          ) : null}
        </Card>
      ) : (
        <>
          <Card>
            <p className="text-xs text-[color:var(--color-ink-2)]">Leiaute obedecido nesta conferência</p>
            <p className="text-sm text-[color:var(--color-ink)]" data-papel="leiaute-em-uso">
              Versão <strong>{r.leiaute?.versao}</strong> · arquivo {r.leiaute?.arquivo} · sha256 {r.leiaute?.sha256}
            </p>
            <p className="mt-1 break-all text-xs text-[color:var(--color-ink-3)]">Fonte: {r.leiaute?.fonte}</p>
            <ul role="list" className="mt-2 space-y-0.5 text-xs" data-papel="eventos-vigentes">
              {r.eventos.map((e) => (
                <li key={e.codigo} className="text-[color:var(--color-ink-2)]">
                  {e.codigo} — {e.nome}
                  {e.temXsd ? "" : " · sem XSD registrado, nenhuma validação de estrutura é possível"}
                </li>
              ))}
            </ul>
          </Card>

          <div className="my-4 grid gap-3 sm:grid-cols-3" data-papel="totais-da-consistencia">
            <Card>
              <p className="text-xs text-[color:var(--color-ink-2)]">Vínculos conferidos em {diaCivilBr(inicioDoDiaCivil(dia))}</p>
              <p className="text-lg font-semibold tabular-nums">{r.vinculosConferidos}</p>
            </Card>
            <Card>
              <p className="text-xs text-[color:var(--color-ink-2)]">Campos obrigatórios sem preenchimento</p>
              <p className="text-lg font-semibold tabular-nums" data-papel="total-ausentes">{ausentes.length}</p>
            </Card>
            <Card>
              <p className="text-xs text-[color:var(--color-ink-2)]">Campos condicionais a conferir</p>
              <p className="text-lg font-semibold tabular-nums" data-papel="total-conferir">{conferir.length}</p>
            </Card>
          </div>

          {r.pendencias.length === 0 ? (
            <EstadoVazio
              titulo="Nenhuma pendência de cadastro"
              descricao={`Os ${r.vinculosConferidos} vínculos têm preenchidos todos os campos que o leiaute registrado exige. Isto não é autorização para transmitir: geração, assinatura e transporte continuam indisponíveis.`}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-papel="tabela-da-consistencia">
                <caption className="sr-only">
                  Pendências de cadastro para o eSocial: pessoa, evento, campo, erro e onde corrigir
                </caption>
                <thead>
                  <tr className="border-b border-[color:var(--color-border)] text-left text-xs text-[color:var(--color-ink-2)]">
                    <th scope="col" className="px-3 py-2">Pessoa</th>
                    <th scope="col" className="px-3 py-2">Evento e campo</th>
                    <th scope="col" className="px-3 py-2">Situação</th>
                    <th scope="col" className="px-3 py-2">O que fazer</th>
                  </tr>
                </thead>
                <tbody>
                  {r.pendencias.map((p) => (
                    <tr
                      key={`${p.vinculoId}-${p.caminho}`}
                      className="border-b border-[color:var(--color-border)] align-top"
                      data-tipo={p.tipo}
                      data-vinculo={p.vinculoId}
                    >
                      <th scope="row" className="px-3 py-2 text-left font-normal">
                        {p.identificacao}
                      </th>
                      <td className="px-3 py-2">
                        <span className="block">{p.evento}</span>
                        <span className="block text-xs text-[color:var(--color-ink-3)]">{p.campo} · {p.caminho}</span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="block font-semibold">{ROTULO_DO_TIPO[p.tipo] ?? p.tipo}</span>
                        <span className="block text-xs text-[color:var(--color-ink-2)]">{p.erro}</span>
                        {p.textoDoLeiaute !== null ? (
                          <span className="mt-1 block text-xs text-[color:var(--color-ink-3)]">
                            Texto do leiaute: {p.textoDoLeiaute}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <span className="block text-xs text-[color:var(--color-ink-2)]">{p.sugestao}</span>
                        <a href={p.rota} className="mt-1 inline-block text-xs underline">
                          Abrir o cadastro
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
