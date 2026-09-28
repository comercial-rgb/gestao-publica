import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";
import {
  lerEntidadesContabeis,
  TIPOS_DE_ATO_NA_TELA,
  TIPOS_DE_ENTIDADE,
} from "../../../../lib/portas/entidades-contabeis";
import { FormCadastrarEntidade, FormPublicarVersao } from "./FormsDaEntidade";

/**
 * AS ENTIDADES CONTÁBEIS — QUEM TEM BALANCETE PRÓPRIO (V11 V9 · TR 5.10.1.3).
 *
 * ═══ ⚠️ POR QUE ESTA TELA EXISTE ═══
 * A arrecadação não registrava de QUEM era o dinheiro que entrava, e a pendência
 * `RECEITA-SEM-ENTIDADE-ARRECADADORA` dizia que ratear por órgão inventaria o número. Tudo certo
 * — e faltava o mesmo que faltava nas consignações: **não havia onde o ente dizer quem são as
 * suas entidades.** O cadastro nasce vazio de propósito; entidade, CNPJ e código são dado do
 * ente, e semear uma prefeitura plausível seria inventário inventado.
 *
 * ⚠️ ENTIDADE NÃO É ÓRGÃO. Órgão e unidade orçamentária são a estrutura da DESPESA. Entidade é
 * quem tem contabilização distinta: a prefeitura, a câmara, a autarquia, o fundo, o RPPS.
 *
 * ⚠️ `force-dynamic`: depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

export default async function EntidadesPage(): Promise<React.ReactElement> {
  let entidades: Awaited<ReturnType<typeof lerEntidadesContabeis>>;
  try {
    await telaExigeLeituraDoEnte("CONSULTAR_CONTABILIDADE");
    entidades = await lerEntidadesContabeis();
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader titulo="Entidades contábeis" subtitulo="Entidades do ente com contabilização própria" />
        <EstadoVazio
          titulo="Não foi possível ler as entidades"
          descricao={erro instanceof Error ? erro.message : "Erro desconhecido."}
        />
      </div>
    );
  }

  const semConta = entidades.filter((e) => e.contas === 0);

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      <PageHeader titulo="Entidades contábeis" subtitulo="Entidades do ente com contabilização própria" />

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        <strong>Entidade contábil</strong> é o órgão ou ente com contabilização própria: prefeitura,
        câmara, autarquia, fundação, fundo ou RPPS. A arrecadação é atribuída à entidade pela{" "}
        <strong>conta bancária</strong>, cuja titularidade é informada em Financeiro.
      </div>

      <FormCadastrarEntidade tiposDeEntidade={TIPOS_DE_ENTIDADE} tiposDeAto={TIPOS_DE_ATO_NA_TELA} />

      {semConta.length > 0 ? (
        <div
          className="rounded-[var(--radius-md)] border border-[color:var(--color-status-alerta-fg)] p-3 text-xs"
          data-teste="entidades-sem-conta"
        >
          {/*
            ⚠️ ESTE AVISO EXISTE PORQUE O CADASTRO SOZINHO NÃO FAZ NADA APARECER. Quem cadastra a
            entidade e não a vê na consulta da receita conclui que o sistema está errado — quando
            o que falta é o segundo passo. Dizer isso aqui é mais barato que a dúvida depois.
          */}
          <strong>
            {semConta.length === 1
              ? "Uma entidade ainda não tem conta bancária vinculada"
              : `${String(semConta.length)} entidades ainda não têm conta bancária vinculada`}
          </strong>
          . Sem conta bancária vinculada, a arrecadação não é atribuída à entidade nem aparece na
          consulta da receita por entidade. Vincule em{" "}
          <strong>Financeiro &gt; Contas bancárias</strong>:{" "}
          {semConta.map((e) => `${e.codigo} ${e.nome}`).join("; ")}.
        </div>
      ) : null}

      {entidades.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma entidade cadastrada"
          descricao="Cadastre acima as entidades contábeis do ente."
        />
      ) : (
        <ul className="space-y-2" data-papel="lista-de-entidades">
          {entidades.map((e) => (
            <li
              key={e.id}
              className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3"
              data-entidade={e.codigo}
            >
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-semibold">{e.codigo}</span>
                <span>{e.nome}</span>
                <span className="text-xs text-[color:var(--color-ink-2)]">
                  {e.tipoRotulo}
                  {e.cnpj === null ? " · sem CNPJ próprio" : ` · CNPJ ${e.cnpj}`}
                  {e.versao > 1 ? ` · versão ${String(e.versao)}` : ""}
                  {" · "}
                  {e.contas === 0
                    ? "nenhuma conta declarada"
                    : e.contas === 1
                      ? "1 conta declarada"
                      : `${String(e.contas)} contas declaradas`}
                </span>
              </div>
              <FormPublicarVersao
                entidadeId={e.id}
                nome={e.nome}
                cnpj={e.cnpj}
                tipoManad={e.tipoManad}
                tiposDeEntidade={TIPOS_DE_ENTIDADE}
                tiposDeAto={TIPOS_DE_ATO_NA_TELA}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
