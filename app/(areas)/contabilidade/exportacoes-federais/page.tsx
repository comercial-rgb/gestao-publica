import Link from "next/link";
import { Alerta } from "../../../../components/ui/Alerta";
import { Badge } from "../../../../components/ui/Badge";
import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO,
} from "../../../../components/ui/Formulario";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";
import {
  ArquivoFederalIndisponivelError,
  exercicioDoManadDaUrl,
  PedidoDeExportacaoInvalidoError,
  pedidoDaMscDaUrl,
  PortaSemBancoError,
  resumoDaMscPara,
  resumoDoManadPara,
  type PedidoDaMsc,
  type ResumoDaMsc,
  type ResumoDoManad,
} from "../../../../lib/portas/exportacoes-federais";
import { anoCivil, competenciaCivil } from "../../../../packages/datas/index";
import { inteiroBr, umaCasaBr } from "../../../../lib/format/quantidade";

/**
 * ARQUIVOS PARA A STN E A RECEITA — a Matriz de Saldos Contábeis (SICONFI) e o MANAD.
 *
 * ⚠️ A TELA SÓ GERA O ARQUIVO PARA DOWNLOAD E CONFERÊNCIA. Não há botão de envio, e não pode
 * haver: transmissão fiscal é proibida neste repositório, e um "enviado" sem recibo seria aviso de
 * sucesso sem persistência.
 *
 * ⚠️ OS FORMULÁRIOS SÃO `GET` E NÃO MUDAM ESTADO: os dois arquivos são derivados do razão a cada
 * pedido (nada é gravado). O resumo e o download chamam o MESMO gerador com o MESMO pedido — a
 * contagem da tela é a do arquivo que se baixa.
 *
 * ⚠️ AUTORIZAÇÃO: `CONSULTAR_CONTABILIDADE`, concessão global (os arquivos são do ente inteiro).
 * A tela redireciona para /sem-acesso; as rotas de download respondem 403; a porta confere de novo.
 *
 * ⚠️ SEM `id` LITERAL (test/ui/formularios-na-mesma-pagina.test.tsx, t6): as seções se rotulam por
 * `aria-label`, que não depende de um id único no documento.
 *
 * ⚠️ Imports RELATIVOS na UI. `force-dynamic`: depende de sessão.
 */
export const dynamic = "force-dynamic";

const MESES: readonly string[] = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

type Desfecho<T> =
  | { readonly ok: true; readonly valor: T }
  | { readonly ok: false; readonly titulo: string; readonly motivo: string; readonly faltas: readonly string[] };

function recusa(e: unknown, tituloIndisponivel: string): Desfecho<never> {
  if (e instanceof PedidoDeExportacaoInvalidoError) {
    return { ok: false, titulo: "Pedido inválido", motivo: e.message, faltas: [] };
  }
  if (e instanceof ArquivoFederalIndisponivelError) {
    return { ok: false, titulo: tituloIndisponivel, motivo: e.message, faltas: e.faltas };
  }
  if (e instanceof PortaSemBancoError) {
    return {
      ok: false,
      titulo: "Banco de dados não configurado",
      motivo: "Os arquivos são gerados a partir dos lançamentos contábeis e precisam do banco.",
      faltas: [],
    };
  }
  throw e;
}

function querystring(p: Readonly<Record<string, string | number>>): string {
  return new URLSearchParams(Object.entries(p).map(([k, v]) => [k, String(v)])).toString();
}

function formatarBytes(n: number): string {
  if (n < 1024) return `${String(n)} bytes`;
  return `${umaCasaBr(n / 1024)} KB`;
}

export default async function Pagina({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const sessao = await telaExigeLeituraDoEnte("CONSULTAR_CONTABILIDADE");
  const sp = await searchParams;

  // ⚠️ O ANO E O MÊS CIVIS DO ENTE — `getFullYear()` abriria o exercício seguinte às 22h de 31/12.
  const agora = new Date();
  const padrao = { exercicio: anoCivil(agora), mes: Number(competenciaCivil(agora).slice(5, 7)) };

  // ── MSC ────────────────────────────────────────────────────────────────────
  let pedidoMsc: PedidoDaMsc = { ...padrao, tipo: "MENSAL" };
  let msc: Desfecho<ResumoDaMsc>;
  try {
    pedidoMsc = pedidoDaMscDaUrl(sp, padrao);
    msc = { ok: true, valor: await resumoDaMscPara(sessao, pedidoMsc) };
  } catch (e) {
    msc = recusa(e, "A matriz não pôde ser gerada");
  }

  // ── MANAD ──────────────────────────────────────────────────────────────────
  let exercicioManad = padrao.exercicio;
  let manad: Desfecho<ResumoDoManad>;
  try {
    exercicioManad = exercicioDoManadDaUrl({ exercicio: sp["manad"] }, padrao.exercicio);
    manad = { ok: true, valor: await resumoDoManadPara(sessao, exercicioManad) };
  } catch (e) {
    manad = recusa(e, "O arquivo para a Receita não pôde ser gerado");
  }

  const hrefMsc = `/contabilidade/exportacoes-federais/msc?${querystring({
    exercicio: pedidoMsc.exercicio,
    mes: pedidoMsc.mes,
    tipo: pedidoMsc.tipo,
  })}`;
  const hrefManad = `/contabilidade/exportacoes-federais/manad?${querystring({ exercicio: exercicioManad })}`;

  return (
    <div className="space-y-8">
      <PageHeader
        titulo="Arquivos para a STN e a Receita"
        subtitulo="Geração da Matriz de Saldos Contábeis e do arquivo digital da Receita Federal a partir dos lançamentos contábeis, para download e conferência."
      />

      <Alerta status="neutro" titulo="Nenhum arquivo é enviado por esta tela">
        Os arquivos são gerados na hora, a partir dos lançamentos registrados, e ficam disponíveis
        para download. O envio ao SICONFI e à Receita Federal é feito por quem responde por eles,
        depois da conferência.
      </Alerta>

      {/* ═══ MSC ═══ */}
      <section aria-label="Matriz de Saldos Contábeis (SICONFI)" className="space-y-4" data-papel="secao-msc">
        <div>
          <h2 className="text-lg font-semibold text-[color:var(--color-ink)]">
            Matriz de Saldos Contábeis (SICONFI)
          </h2>
          <p className="mt-1 text-sm text-[color:var(--color-ink-2)]">
            Saldo inicial, movimento e saldo final de cada conta no mês de referência, com as
            informações complementares. O arquivo sai compactado, como o SICONFI o recebe.
          </p>
        </div>

        <form method="get" className={`${CLASSE_PAINEL_FORMULARIO} flex flex-wrap items-end gap-4`} data-acao="gerar-msc">
          <input type="hidden" name="manad" value={exercicioManad} />
          <label className="w-32">
            <span className={CLASSE_ROTULO}>Exercício</span>
            <input
              name="exercicio"
              type="number"
              min={2000}
              max={2100}
              required
              defaultValue={pedidoMsc.exercicio}
              className={CLASSE_CAMPO}
            />
          </label>
          <label className="w-44">
            <span className={CLASSE_ROTULO}>Mês de referência</span>
            <select name="mes" defaultValue={String(pedidoMsc.mes)} className={CLASSE_CAMPO}>
              {MESES.map((m, i) => (
                <option key={m} value={String(i + 1)}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="w-72">
            <span className={CLASSE_ROTULO}>Tipo de matriz</span>
            <select name="tipo" defaultValue={pedidoMsc.tipo} className={CLASSE_CAMPO}>
              <option value="MENSAL">Mensal</option>
              <option value="ENCERRAMENTO">Encerramento do exercício (dezembro)</option>
            </select>
          </label>
          <button type="submit" className={CLASSE_BOTAO_PRIMARIO}>
            Gerar resumo
          </button>
        </form>

        {msc.ok ? <ResumoMsc r={msc.valor} href={hrefMsc} /> : <Recusa d={msc} />}
      </section>

      {/* ═══ MANAD ═══ */}
      <section aria-label="Arquivo digital da Receita Federal (MANAD)" className="space-y-4" data-papel="secao-manad">
        <div>
          <h2 className="text-lg font-semibold text-[color:var(--color-ink)]">
            Arquivo digital da Receita Federal (MANAD)
          </h2>
          <p className="mt-1 text-sm text-[color:var(--color-ink-2)]">
            Movimento anual do órgão público: execução orçamentária do exercício inteiro, no
            leiaute da Receita. O arquivo é sempre do exercício completo, de 1º de janeiro a 31 de
            dezembro.
          </p>
          <p className="mt-1 text-sm">
            <Link
              href="/contabilidade/exportacoes-federais/responsaveis"
              className="font-medium text-[color:var(--color-primary)] hover:underline"
              data-papel="link-responsaveis"
            >
              Responsáveis pelo arquivo: contabilista e empresa geradora
            </Link>
            {" · "}
            <Link
              href="/contabilidade/exportacoes-federais/classificacao"
              className="font-medium text-[color:var(--color-primary)] hover:underline"
              data-papel="link-classificacao"
            >
              Classificação do cadastro e forma de escrituração
            </Link>
          </p>
        </div>

        <form method="get" className={`${CLASSE_PAINEL_FORMULARIO} flex flex-wrap items-end gap-4`} data-acao="gerar-manad">
          <input type="hidden" name="exercicio" value={pedidoMsc.exercicio} />
          <input type="hidden" name="mes" value={pedidoMsc.mes} />
          <input type="hidden" name="tipo" value={pedidoMsc.tipo} />
          <label className="w-32">
            <span className={CLASSE_ROTULO}>Exercício</span>
            <input
              name="manad"
              type="number"
              min={2000}
              max={2100}
              required
              defaultValue={exercicioManad}
              className={CLASSE_CAMPO}
            />
          </label>
          <button type="submit" className={CLASSE_BOTAO_PRIMARIO}>
            Gerar resumo
          </button>
        </form>

        {manad.ok ? <ResumoManad r={manad.valor} href={hrefManad} /> : <Recusa d={manad} />}
      </section>
    </div>
  );
}

function Recusa({
  d,
}: {
  readonly d: { readonly titulo: string; readonly motivo: string; readonly faltas: readonly string[] };
}): React.ReactElement {
  if (d.faltas.length === 0) return <EstadoVazio titulo={d.titulo} descricao={d.motivo} />;
  return (
    <Alerta status="alerta" titulo={d.titulo}>
      <p>Para gerar este arquivo, falta cadastrar:</p>
      <ul className="mt-1 list-disc pl-5" data-papel="faltas-do-cadastro">
        {d.faltas.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
    </Alerta>
  );
}

function BotaoBaixar({ href, rotulo }: { readonly href: string; readonly rotulo: string }): React.ReactElement {
  return (
    <a href={href} download className={`${CLASSE_BOTAO_PRIMARIO} inline-flex items-center`}>
      {rotulo}
    </a>
  );
}

function ResumoMsc({ r, href }: { readonly r: ResumoDaMsc; readonly href: string }): React.ReactElement {
  const referencia =
    r.tipo === "ENCERRAMENTO"
      ? `encerramento do exercício de ${String(r.exercicio)}`
      : `${(MESES[r.mes - 1] ?? "").toLowerCase()} de ${String(r.exercicio)}`;
  return (
    <div className="space-y-4" data-papel="resumo-msc">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--color-ink-3)]">
              Matriz {r.tipo === "ENCERRAMENTO" ? "de encerramento" : "mensal"} · {referencia}
            </p>
            <p className="mt-2 text-xl font-semibold tabular text-[color:var(--color-ink)]" data-papel="linhas-msc">
              {inteiroBr(r.linhas)} linhas · {inteiroBr(r.contas)} contas
            </p>
            <p className="mt-1 text-sm text-[color:var(--color-ink-2)]">
              Instituição {r.instituicao} · período {r.periodo}
            </p>
          </div>
          <BotaoBaixar href={href} rotulo={`Baixar ${r.nomeDoArquivo}`} />
        </div>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          {r.porTipoDeValor.map((t) => (
            <div key={t.rotulo}>
              <dt className="text-xs text-[color:var(--color-ink-2)]">{t.rotulo}</dt>
              <dd className="text-sm font-semibold tabular">{inteiroBr(t.linhas)} linhas</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-[color:var(--color-ink)]">Conferências antes da geração</h3>
        <p className="mt-1 text-sm text-[color:var(--color-ink-2)]">
          Se qualquer uma delas não fechasse, o arquivo não seria gerado.
        </p>
        <ul className="mt-3 space-y-2" data-papel="conferencias-msc">
          {r.conferencias.map((c) => (
            <li key={c.nome} className="flex items-start gap-3 text-sm">
              <Badge status="ok">Confere</Badge>
              <span>
                <strong>{c.nome}.</strong> {c.descricao}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      {!r.exigenciasPorContaCarregadas ? (
        <Alerta status="alerta" titulo="Arquivo para conferência">
          A tabela que define quais informações complementares cada conta deve levar ainda não foi
          carregada. Por isso o arquivo traz todas as informações que o sistema consegue apurar,
          com mais detalhe do que o leiaute costuma exigir. O código de função e subfunção e a
          posição do ano de inscrição de restos a pagar também devem ser conferidos com o leiaute
          vigente antes do envio.
        </Alerta>
      ) : null}

      {r.pendencias.length === 0 ? (
        <p className="text-sm text-[color:var(--color-ink-2)]" data-papel="sem-pendencias-msc">
          Nenhuma informação complementar ficou sem apuração.
        </p>
      ) : (
        <Card>
          <h3 className="text-sm font-semibold text-[color:var(--color-ink)]">
            Informações complementares não apuradas
          </h3>
          <p className="mt-1 text-sm text-[color:var(--color-ink-2)]">
            As linhas dessas contas saem no arquivo sem a informação indicada. Normalmente são
            lançamentos que não passam por um documento com fonte de recurso (transferências entre
            contas, ajustes diretos, doações).
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm" data-papel="pendencias-msc">
              <caption className="sr-only">Informações complementares não apuradas, por conta</caption>
              <thead>
                <tr className="text-left text-xs text-[color:var(--color-ink-2)]">
                  <th scope="col" className="py-1 pr-4">Conta</th>
                  <th scope="col" className="py-1 pr-4">Informação</th>
                  <th scope="col" className="py-1 text-right">Lançamentos</th>
                </tr>
              </thead>
              <tbody>
                {r.pendencias.map((p) => (
                  <tr key={`${p.conta}|${p.informacao}`} className="border-t border-[color:var(--color-border)]">
                    <td className="py-1 pr-4 tabular">{p.conta}</td>
                    <td className="py-1 pr-4">{p.informacao}</td>
                    <td className="py-1 text-right tabular">
                      {p.lancamentos === 0 ? "cadastro da conta" : inteiroBr(p.lancamentos)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

const ROTULO_DO_BLOCO: Readonly<Record<string, string>> = {
  "0": "Abertura e identificação",
  K: "Folha de pagamento",
  L: "Execução orçamentária",
  "9": "Encerramento do arquivo",
};

function ResumoManad({ r, href }: { readonly r: ResumoDoManad; readonly href: string }): React.ReactElement {
  return (
    <div className="space-y-4" data-papel="resumo-manad">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--color-ink-3)]">
              Exercício de {String(r.exercicio)} · 1º de janeiro a 31 de dezembro
            </p>
            <p className="mt-2 text-xl font-semibold tabular text-[color:var(--color-ink)]" data-papel="linhas-manad">
              {inteiroBr(r.linhas)} linhas · {formatarBytes(r.bytes)}
            </p>
          </div>
          <BotaoBaixar href={href} rotulo={`Baixar ${r.nomeDoArquivo}`} />
        </div>
        <dl className="mt-4 grid gap-3 sm:grid-cols-4">
          {r.porBloco.map((b) => (
            <div key={b.bloco}>
              <dt className="text-xs text-[color:var(--color-ink-2)]">
                Bloco {b.bloco} · {ROTULO_DO_BLOCO[b.bloco] ?? "outros registros"}
              </dt>
              <dd className="text-sm font-semibold tabular">{inteiroBr(b.linhas)} linhas</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-sm text-[color:var(--color-ink-2)]">
          Antes da geração, o total empenhado no arquivo foi conferido com a execução da despesa,
          ficha a ficha, e com os restos a pagar cancelados. A folha de pagamento sai sem
          movimento: ainda não é escriturada neste arquivo.
        </p>
      </Card>

      {r.pendencias.length === 0 ? null : (
        <Card>
          <h3 className="text-sm font-semibold text-[color:var(--color-ink)]">Campos que saem vazios</h3>
          <ul className="mt-3 space-y-2 text-sm" data-papel="pendencias-manad">
            {r.pendencias.map((p) => (
              <li key={`${p.registro}|${p.descricao}`}>
                <strong>Registro {p.registro}</strong>
                {p.quantidade !== null ? ` (${inteiroBr(p.quantidade)})` : ""}: {p.descricao}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
