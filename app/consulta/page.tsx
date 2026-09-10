import { lerAcompanhamentoExterno } from "../../lib/portas/protocolo";

/**
 * A CONSULTA DO REQUERENTE — número + código verificador, SEM SESSÃO (5.42.58).
 *
 * ═══ ⚠️ ELA MORA FORA DO GRUPO AUTENTICADO, E ISSO É O PONTO ═══
 * `app/(areas)/**` passa pelo layout que exige sessão. Esta página está em `app/consulta`
 * justamente para não exigir: quem a usa é o cidadão que protocolou um pedido, e ele não
 * tem — nem deve ter — usuário do sistema.
 *
 * ═══ ⚠️ O QUE ELA **NÃO** MOSTRA ═══
 * Pareceres internos, anexos da administração e o instrutório ficam de fora. A cláusula
 * pede ACOMPANHAMENTO — situação, datas, por onde passou —, não acesso ao processo. Um
 * "mostre tudo, ele é o dono" entregaria a manifestação do jurídico sobre o próprio
 * pedido dele, antes da decisão.
 *
 * ═══ ⚠️ A BUSCA É PELO NÚMERO, E O CÓDIGO É CONFERIDO DEPOIS ═══
 * Buscar PELO código permitiria enumerar o espaço de códigos com requisições sucessivas.
 * Achando pelo número e conferindo o código, quem erra o código não descobre nada — a
 * resposta é a mesma de um processo que não existe.
 */
export const dynamic = "force-dynamic";

function instante(d: Date): string {
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default async function ConsultaPublicaPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const sp = await searchParams;
  const exercicioBruto = typeof sp["exercicio"] === "string" ? sp["exercicio"] : "";
  const numeroBruto = typeof sp["numero"] === "string" ? sp["numero"] : "";
  const verificador = typeof sp["verificador"] === "string" ? sp["verificador"] : "";

  const exercicio = Number.parseInt(exercicioBruto, 10);
  const numero = Number.parseInt(numeroBruto, 10);
  const pediu = exercicioBruto !== "" && numeroBruto !== "" && verificador !== "";

  const resultado =
    pediu && Number.isInteger(exercicio) && Number.isInteger(numero)
      ? await lerAcompanhamentoExterno(exercicio, numero, verificador)
      : null;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-xl font-semibold text-[color:var(--color-ink)]">
          Acompanhar processo
        </h1>
        <p className="mt-1 text-sm text-[color:var(--color-ink-2)]">
          Informe o número, o ano e o código verificador que você recebeu na abertura.
          Não é preciso ter senha.
        </p>
      </header>

      <form
        method="get"
        className="grid grid-cols-1 gap-3 rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4 md:grid-cols-4"
      >
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-ink-2)]">
          <span className="font-medium text-[color:var(--color-ink)]">Número</span>
          <input
            name="numero"
            inputMode="numeric"
            required
            defaultValue={numeroBruto}
            className="rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] p-2 text-sm text-[color:var(--color-ink)]"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-ink-2)]">
          <span className="font-medium text-[color:var(--color-ink)]">Ano</span>
          <input
            name="exercicio"
            inputMode="numeric"
            required
            defaultValue={exercicioBruto}
            className="rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] p-2 text-sm text-[color:var(--color-ink)]"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-ink-2)] md:col-span-2">
          <span className="font-medium text-[color:var(--color-ink)]">
            Código verificador
          </span>
          <input
            name="verificador"
            required
            defaultValue={verificador}
            className="rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] p-2 font-mono text-sm uppercase text-[color:var(--color-ink)]"
          />
        </label>
        <div className="md:col-span-4">
          <button
            type="submit"
            className="rounded-[var(--radius-md)] bg-[color:var(--color-accent)] px-4 py-2 text-sm font-medium text-[color:var(--color-accent-fg)]"
          >
            Consultar
          </button>
        </div>
      </form>

      {pediu && resultado === null ? (
        <p
          role="alert"
          className="rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]"
        >
          Não encontramos um processo com esse número, ano e código verificador. Confira
          os três — o código distingue maiúsculas de minúsculas apenas na digitação, e
          nunca usa os caracteres 0, O, 1, I e L.
        </p>
      ) : null}

      {resultado !== null ? (
        <section className="rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
          <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">
            Processo {resultado.numero}/{resultado.ano}
          </h2>
          <p className="mt-1 text-sm text-[color:var(--color-ink-2)]">
            {resultado.assunto} — aberto em {instante(resultado.abertoEm)}
          </p>
          <p className="mt-2 text-sm">
            <strong>Situação:</strong> {resultado.situacao}
          </p>

          <h3 className="mt-4 text-sm font-medium text-[color:var(--color-ink)]">
            Andamento
          </h3>
          {resultado.movimentos.length === 0 ? (
            <p className="mt-1 text-sm text-[color:var(--color-ink-2)]">
              Ainda sem movimentação.
            </p>
          ) : (
            <ol className="mt-1 text-sm">
              {resultado.movimentos.map((m, i) => (
                <li
                  key={`${m.rotulo}-${i}`}
                  className="border-b border-[color:var(--color-border)] py-2 last:border-0"
                >
                  {m.rotulo}
                  {m.setor !== null ? ` — ${m.setor}` : ""}{" "}
                  <span className="text-xs text-[color:var(--color-ink-2)]">
                    {instante(m.em)}
                  </span>
                </li>
              ))}
            </ol>
          )}

          <p className="mt-4 text-xs text-[color:var(--color-ink-2)]">
            Esta consulta mostra por onde o processo passou e em que pé ele está. O
            conteúdo da instrução — pareceres e documentos internos — não aparece aqui.
          </p>
        </section>
      ) : null}
    </main>
  );
}
