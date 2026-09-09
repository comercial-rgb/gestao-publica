import Link from "next/link";
import { Badge } from "../../../../../components/ui/Badge";
import { Card } from "../../../../../components/ui/Card";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import {
  buscarPessoaDaTela,
  historicoDaPessoa,
  PortaSemBancoError,
  type PapelDePessoa,
} from "../../../../../lib/portas/pessoas";
import { FormAlterarPessoa } from "./FormAlterarPessoa";
import { FormPapel } from "./FormPapel";

/**
 * DETALHE DA PESSOA — dados, papéis, relacionados e histórico, no MESMO contexto.
 *
 * ⚠️ A ABA DE HISTÓRICO CHAMA-SE HISTÓRICO. O ENT01 é explícito: nada de rótulo de
 * conformidade na interface. Quem usa o sistema procura "histórico", não um número de
 * cláusula.
 *
 * ⚠️ O HISTÓRICO NÃO É UMA TABELA DE DIFFS ESCRITA À MÃO. Ele É o cadastro: cada versão é
 * uma linha real, com autor, momento e motivo. Uma tabela de auditoria separada mente no
 * dia em que alguém gravar sem escrevê-la — aqui não há como gravar sem aparecer.
 */
export const dynamic = "force-dynamic";

const ROTULO_DO_PAPEL: Record<PapelDePessoa, string> = {
  CREDOR: "Credor",
  CONSIGNATARIO: "Consignatário",
  SERVIDOR: "Servidor",
  REPRESENTANTE: "Representante",
};

function instante(d: Date): string {
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function dia(d: Date): string {
  return d.toLocaleDateString("pt-BR");
}

export default async function DetalheDaPessoaPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}): Promise<React.ReactElement> {
  const { id } = await params;

  let pessoa: Awaited<ReturnType<typeof buscarPessoaDaTela>>;
  let historico: Awaited<ReturnType<typeof historicoDaPessoa>>;
  try {
    pessoa = await buscarPessoaDaTela(id);
    if (pessoa === null) {
      return (
        <div className="space-y-4">
          <PageHeader titulo="Pessoa não encontrada" subtitulo={id} />
          <EstadoVazio
            titulo="Este cadastro não existe"
            descricao="O identificador não corresponde a nenhuma pessoa. Volte à lista e escolha pelo nome."
          />
        </div>
      );
    }
    historico = await historicoDaPessoa(id);
  } catch (erro) {
    return (
      <div className="space-y-4">
        <PageHeader titulo="Pessoa" subtitulo={id} />
        <EstadoVazio
          titulo={
            erro instanceof PortaSemBancoError
              ? "Banco de dados não configurado"
              : "Não foi possível ler o cadastro"
          }
          descricao={erro instanceof Error ? erro.message : "Erro desconhecido."}
        />
      </div>
    );
  }

  const versaoVigente = historico.versoes[0];

  return (
    <div className="space-y-4">
      <PageHeader
        titulo={pessoa.nome}
        subtitulo={`${pessoa.documentoFormatado} · ${pessoa.tipo === "FISICA" ? "pessoa física" : "pessoa jurídica"}`}
      />

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <Badge status={pessoa.ativa ? "ok" : "neutro"}>
            {pessoa.ativa ? "Ativa" : "Inativa"}
          </Badge>
          {pessoa.papeis.length === 0 ? (
            <span className="text-xs text-[color:var(--color-ink-3)]">
              Sem papel vigente — esta pessoa está cadastrada, mas não é credora nem
              servidora hoje.
            </span>
          ) : (
            pessoa.papeis.map((p) => (
              <Badge key={p} status="neutro">
                {ROTULO_DO_PAPEL[p]}
              </Badge>
            ))
          )}
        </div>

        {/*
          RELACIONADOS. Não há contagem própria aqui de propósito: quem soma empenho é o
          M05, e uma segunda contagem nesta tela seria a segunda verdade sobre a mesma
          execução. O link leva à consulta que já existe, com o documento aplicado.
        */}
        <p className="mt-3 text-xs text-[color:var(--color-ink-2)]">
          <Link
            href={`/relatorios/gerenciais?credor=${encodeURIComponent(pessoa.documento)}`}
            className="underline underline-offset-2"
          >
            Ver a execução da despesa deste documento
          </Link>{" "}
          — os empenhos guardam o CPF/CNPJ como ele foi informado no ato, e é por ele que
          a consulta casa.
        </p>
      </Card>

      <FormAlterarPessoa
        pessoaId={pessoa.id}
        ativa={pessoa.ativa}
        nome={pessoa.nome}
      />

      <FormPapel pessoaId={pessoa.id} papeisVigentes={[...pessoa.papeis]} />

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">
          Histórico
        </h2>

        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--color-ink-3)]">
          Alterações cadastrais
        </h3>
        <ol className="space-y-2">
          {historico.versoes.map((v) => (
            <li
              key={v.id}
              className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] px-3 py-2 text-xs"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-[color:var(--color-ink)]">
                  {v.nome}
                  {v === versaoVigente ? (
                    <span className="ml-2 text-[color:var(--color-ink-3)]">(vigente)</span>
                  ) : null}
                </span>
                <span className="tabular-nums text-[color:var(--color-ink-3)]">
                  {instante(v.criadoEm)} · {v.criadoPor}
                </span>
              </div>
              <div className="mt-1 text-[color:var(--color-ink-2)]">
                {v.ativa ? "Ativa" : "Inativa"}
                {v.motivo !== null ? ` · ${v.motivo}` : " · cadastro inicial"}
              </div>
            </li>
          ))}
        </ol>

        <h3 className="mt-4 mb-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--color-ink-3)]">
          Papéis
        </h3>
        {historico.movimentos.length === 0 ? (
          <p className="text-xs text-[color:var(--color-ink-3)]">
            Nenhum papel foi concedido a esta pessoa.
          </p>
        ) : (
          <ol className="space-y-2">
            {historico.movimentos.map((m) => (
              <li
                key={m.id}
                className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] px-3 py-2 text-xs"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-[color:var(--color-ink)]">
                    {ROTULO_DO_PAPEL[m.papel]}{" "}
                    {m.movimento === "CONCEDIDO" ? "concedido" : "encerrado"} em{" "}
                    {dia(m.data)}
                  </span>
                  <span className="tabular-nums text-[color:var(--color-ink-3)]">
                    registrado {instante(m.criadoEm)} · {m.criadoPor}
                  </span>
                </div>
                {m.motivo !== null ? (
                  <div className="mt-1 text-[color:var(--color-ink-2)]">{m.motivo}</div>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
