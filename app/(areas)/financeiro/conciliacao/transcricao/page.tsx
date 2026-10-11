import Link from "next/link";
import { Badge, type StatusBadge } from "../../../../../components/ui/Badge";
import { Card } from "../../../../../components/ui/Card";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { formatarMoeda } from "../../../../../lib/format/moeda";
import { mensagemDoErro } from "../../../../../lib/portas/mensagem-do-erro";
import { lerTelaDaTranscricao, type TelaDaTranscricao } from "../../../../../lib/portas/transcricao-de-extrato";
import { FormRevisar, FormTranscrever } from "./Forms";

/**
 * V39-R3 (R3-015, V39-029) — TRANSCRIÇÃO DE EXTRATO. Sem arquivo nem integração com o banco, as linhas do extrato são
 * digitadas a partir de um documento e conferidas por outra pessoa; só a linha confirmada, em dia que o banco não
 * cobre, vale como extrato na conciliação.
 */
const SITUACAO: Readonly<Record<TelaDaTranscricao["linhas"][number]["condicao"], { readonly rotulo: string; readonly status: StatusBadge }>> = {
  VALE: { rotulo: "Vale como extrato", status: "ok" },
  AGUARDANDO_REVISAO: { rotulo: "Aguardando revisão", status: "alerta" },
  REVISADA_DIVERGENTE: { rotulo: "Divergente", status: "erro" },
  COBERTA_PELO_BANCO: { rotulo: "Substituída pelo extrato do banco", status: "neutro" },
};

export default async function TranscricaoDeExtratoPage({ searchParams }: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<React.ReactElement> {
  const sp = await searchParams;
  const contaPedida = typeof sp["conta"] === "string" && sp["conta"] !== "" ? sp["conta"] : null;
  let tela: TelaDaTranscricao;
  try {
    tela = await lerTelaDaTranscricao(contaPedida);
  } catch (e) {
    return (
      <div className="space-y-4">
        <PageHeader titulo="Transcrição de extrato" />
        <EstadoVazio titulo="Não foi possível abrir a transcrição" descricao={e instanceof Error ? mensagemDoErro(e, "") : "Erro desconhecido."} />
      </div>
    );
  }
  const conta = tela.contas.find((c) => c.id === tela.contaId) ?? null;
  return (
    <div className="space-y-4">
      <PageHeader
        titulo="Transcrição de extrato"
        subtitulo="Linhas do extrato digitadas a partir de um documento, quando não há arquivo do banco. A linha só vale como extrato depois de conferida por outra pessoa."
      />
      <p className="text-sm">
        <Link className="text-[color:var(--color-primary)] hover:underline" href="/financeiro/conciliacao">Voltar à conciliação bancária</Link>
      </p>
      <Card>
        <form method="get" className="flex flex-wrap items-end gap-3" data-acao="escolher-conta-da-transcricao">
          <label className="text-xs text-[color:var(--color-ink-2)]" htmlFor="conta-da-transcricao">
            <span className="mb-1 block font-medium">Conta bancária</span>
            <select id="conta-da-transcricao" name="conta" defaultValue={tela.contaId ?? ""} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] px-2 py-1.5 text-sm">
              <option value="">Escolha…</option>
              {tela.contas.map((c) => (
                <option key={c.id} value={c.id}>{c.codigo} — {c.descricao}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="text-sm font-medium text-[color:var(--color-primary)] hover:underline">Abrir</button>
        </form>
      </Card>

      {conta === null ? null : (
        <>
          {tela.podeTranscrever ? <FormTranscrever contaId={conta.id} contaCodigo={conta.codigo} /> : (
            <p className="text-sm text-[color:var(--color-ink-2)]">Transcrever e revisar linhas cabe a quem tem a permissão de transcrever extrato.</p>
          )}
          <Card>
            <h2 className="mb-2 text-sm font-semibold">Linhas digitadas da conta {conta.codigo}</h2>
            {tela.linhas.length === 0 ? (
              <p className="text-sm text-[color:var(--color-ink-2)]" data-sem-linhas-digitadas>Nenhuma linha digitada nesta conta.</p>
            ) : (
              <ul className="grid gap-3">
                {tela.linhas.map((l) => (
                  <li key={l.transcricaoId} data-linha-digitada={l.transcricaoId} data-condicao={l.condicao} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge status={SITUACAO[l.condicao].status}>{SITUACAO[l.condicao].rotulo}</Badge>
                      <span className="font-medium">{l.dia}</span>
                      <span>{l.natureza === "CREDITO" ? "Entrada" : "Saída"} de R$ {formatarMoeda(l.valor).texto}</span>
                      <span className="text-[color:var(--color-ink-2)]">{l.historico}</span>
                    </div>
                    <p className="mt-1 text-xs text-[color:var(--color-ink-2)]">
                      Digitada por {l.digitadaPor} em {l.digitadaEm}, a partir de: {l.documentoDeSuporte}. {l.textoDaCondicao.charAt(0).toUpperCase() + l.textoDaCondicao.slice(1)}.
                      {l.revisao === null ? null : <> Revisada por {l.revisao.por} em {l.revisao.em} ({l.revisao.resultado === "CONFIRMADA" ? "confere" : "não confere"}; {l.revisao.meio}).</>}
                    </p>
                    {l.podeRevisar ? <FormRevisar transcricaoId={l.transcricaoId} revisada={l.revisao !== null} /> : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
