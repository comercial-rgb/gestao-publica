import { conferirCertidao } from "../../../../lib/portas/certidao-publica";

/**
 * A CONFERÊNCIA DE UMA CERTIDÃO, pela chave — SEM SESSÃO.
 *
 * ═══ ⚠️ ELA MORA EM `(publico)` DE PROPÓSITO ═══
 * Quem confere uma certidão é um cartório, um banco, outro órgão — ninguém que tenha, nem deva
 * ter, usuário deste sistema.
 *
 * ═══ ⚠️ O QUE ELA **NÃO** MOSTRA, e cada omissão tem motivo ═══
 * O extrato de débitos (quem tem a chave de uma certidão não ganha o cadastro fiscal de
 * ninguém), o CPF em claro (sai mascarado), a cobertura detalhada e o id interno. O que ela
 * responde é a pergunta de quem confere: este documento existe, é de quem diz ser, está valendo?
 *
 * ═══ ⚠️ A CHAVE ERRADA RESPONDE O MESMO QUE A INEXISTENTE ═══
 * "Formato inválido" e "não encontrada" seriam duas respostas, e a diferença ensinaria a quem
 * varre chaves o que está perto de acertar. A chave tem 64 hex de `randomBytes`: não se enumera.
 */
export const dynamic = "force-dynamic";

export default async function ConferirCertidaoPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const sp = await searchParams;
  const chave = typeof sp["chave"] === "string" ? sp["chave"].trim() : "";
  const resultado = chave === "" ? null : await conferirCertidao(chave);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8" style={{ paddingInline: "16px" }}>
      <h1 className="mb-2 text-xl font-semibold text-[color:var(--color-ink)]">Conferir uma certidão</h1>
      <p className="mb-6 text-sm text-[color:var(--color-ink-3)]">
        Informe a chave de autenticidade impressa no documento. A conferência mostra se ele existe,
        de quem é e até quando vale — e nada além disso.
      </p>

      <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
        <label className="flex-1 text-xs">
          <span className="mb-1 block font-medium text-[color:var(--color-ink-2)]">
            Chave de autenticidade
          </span>
          <input
            name="chave"
            defaultValue={chave}
            maxLength={64}
            className="w-full rounded-[var(--radius-md)] border border-[color:var(--color-border)] px-3 py-2 font-mono text-sm"
          />
        </label>
        <button
          type="submit"
          className="rounded-[var(--radius-md)] bg-[color:var(--color-engine-forte)] px-4 py-2 text-sm font-medium text-white"
        >
          Conferir
        </button>
      </form>

      {resultado === null ? null : resultado.existe ? (
        <section data-papel="certidao-encontrada" className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-4">
          <h2 className="mb-2 text-sm font-semibold text-[color:var(--color-ink)]">
            Certidão {resultado.protocolo}
          </h2>
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-[color:var(--color-ink-3)]">Tipo</dt>
              <dd className="text-[color:var(--color-ink)]">{resultado.tipo}</dd>
            </div>
            <div>
              <dt className="text-xs text-[color:var(--color-ink-3)]">Titular</dt>
              <dd className="text-[color:var(--color-ink)]">
                {resultado.titular} — {resultado.documentoMascarado}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[color:var(--color-ink-3)]">Emitida em</dt>
              <dd className="tabular text-[color:var(--color-ink)]">
                {resultado.emitidaEm?.split("-").reverse().join("/")}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[color:var(--color-ink-3)]">Válida até</dt>
              <dd className="tabular text-[color:var(--color-ink)]">
                {resultado.validadeAte?.split("-").reverse().join("/")}
              </dd>
            </div>
          </dl>
          <p data-papel="vigencia" className="mt-3 text-sm font-medium text-[color:var(--color-ink)]">
            {resultado.vigente === true ? "Este documento está VIGENTE nesta data." : "Este documento está VENCIDO."}
          </p>
          {resultado.semValidadeOficial === true ? (
            <p role="note" className="mt-2 rounded-[var(--radius-md)] bg-[color:var(--color-status-alerta-bg)] px-3 py-2 text-sm text-[color:var(--color-status-alerta-fg)]">
              Documento emitido em ambiente de avaliação — <strong>sem validade oficial</strong>.
            </p>
          ) : null}
        </section>
      ) : (
        <p role="status" data-papel="certidao-nao-encontrada" className="rounded-[var(--radius-md)] bg-[color:var(--color-status-alerta-bg)] px-3 py-2 text-sm text-[color:var(--color-status-alerta-fg)]">
          Nenhuma certidão emitida corresponde a esta chave.
        </p>
      )}
    </main>
  );
}
