import { Badge } from "../../../../components/ui/Badge";
import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import {
  lerPeriodosComMovimento,
  montarPreviewSagres,
  PortaSemBancoError,
  type DiaComMovimento,
  type MesComMovimento,
  type PeriodosComMovimento,
  type PreviewSagres,
} from "../../../../lib/portas/sagres";
import { POC_SAGRES } from "../../../../lib/portas/sagres-poc";
import { SeletorCompetencia } from "./SeletorCompetencia";

/**
 * TELA SAGRES 2026 (M15, S2) — prévia monoespaçada com régua de posições, lista de validações,
 * download do pacote, e a COMUNICAÇÃO HONESTA (DIRETIVA §7). A tela consome a PORTA (lib/portas/
 * sagres) — nunca o domínio direto (grep trivalente).
 *
 * ⚠️ A COMPETÊNCIA É ESCOLHIDA, NÃO PRESCRITA. Esta tela é operada AO VIVO diante de quem audita, e
 * o pedido natural de quem audita é "gere o dia que EU escolher". Antes, a tela oferecia seis dias
 * fixos numa constante: o avaliador podia clicar no que já tínhamos previsto, e em nada mais. Pior,
 * a constante envelheceu — a massa passou a ter movimento em agosto e setembro, e a lista continuou
 * anunciando o recorte de antes. Uma lista escrita à mão é uma afirmação sobre o banco que ninguém
 * revalida; ela apodrece em silêncio, e o silêncio aparece justamente na demonstração.
 *
 * Agora há (a) seletores de verdade — `<input type="date">` e `<input type="month">` — que aceitam
 * QUALQUER competência, e (b) atalhos para os períodos com movimento, DESCOBERTOS DO BANCO pela
 * porta (`lerPeriodosComMovimento`), com a contagem do que há em cada um. Os atalhos continuam
 * poupando cliques, mas nunca mais podem mentir sobre a base.
 *
 * ⚠️ DIA E MÊS SÃO INDEPENDENTES. O layout SAGRES tem duas periodicidades: o diário (empenho,
 * liquidação, pagamento, receita, retenção, despesa extra, movimentação entre contas, cadastro de
 * contas) e o mensal (Dotacao §4.4 e SaldoMensal §4.26). Derivar o mês do dia — o que a tela fazia —
 * escondia metade da escolha. O `?mes=` agora é parâmetro próprio, e a porta o recebe explicitamente.
 */
export const dynamic = "force-dynamic";

/**
 * O BLOCO MONOESPAÇADO: régua de posições EM CIMA, linhas de dado embaixo.
 *
 * ⚠️ ESTA FUNÇÃO EXISTE PARA CONSERTAR UM ERRO DE 2 COLUNAS. As linhas de dado levam o prefixo
 * `"  1 | "` — o número da linha em 3 casas mais " | " —, seis caracteres. A régua era emitida com
 * quatro espaços de indentação, e portanto ficava DUAS COLUNAS fora de fase: quem contasse "posições
 * 1 a 6" pela régua leria `| 9990` em vez de `999001`. Numa inspeção posicional diante do TCE, uma
 * régua desalinhada é pior do que régua nenhuma: ela CONVIDA à leitura errada e a resposta parece
 * conferida. O prefixo agora é o MESMO nos três tipos de linha, derivado de uma constante só.
 *
 * ⚠️ A ORDEM É dezenas → unidades → dados. As dezenas em cima é a convenção de régua de layout
 * posicional (o "1" da casa 10 fica sobre o "0" das unidades), e a régua vem ANTES do bloco porque
 * é assim que se lê: primeiro a escala, depois o que ela mede.
 */
const PREFIXO_LINHA = 6; // "  1 | " — três casas do número + " | "

function blocoComRegua(
  linhas: readonly string[],
  regua: { readonly dezenas: string; readonly unidades: string },
  largura: number
): string {
  const recuo = " ".repeat(PREFIXO_LINHA);
  const dados = linhas.map((l, i) => `${String(i + 1).padStart(3, " ")} | ${l}`);
  return [
    recuo + regua.dezenas.slice(0, largura),
    recuo + regua.unidades.slice(0, largura),
    ...dados,
  ].join("\n");
}

function BannerHonesto(): React.ReactElement {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[color:var(--color-status-alerta-fg)] bg-[color:var(--color-status-alerta-bg)] p-5 text-sm">
      <p className="font-semibold text-[color:var(--color-ink)]">Formato oficial gerado e validado localmente</p>
      <ul className="mt-2 space-y-1 text-[color:var(--color-ink-2)]">
        <li>✓ Layout SAGRES Contabilidade 2026 v1.1 — arquivos e posições conforme o layout oficial versionado.</li>
        <li>✓ Validado localmente (obrigatoriedade, domínios oficiais e integridade referencial).</li>
        <li>⚠ <strong>Transmissão externa não realizada.</strong> Esta tela não fala com o TCE: não há recibo, protocolo nem aceite.</li>
        <li>○ Integração de transmissão: preparada para credencial (sessões seguintes).</li>
      </ul>
    </div>
  );
}

/**
 * MATRIZ DE COBERTURA — as 13 entidades da vertical slice, 10 exportando. O status de cada uma sai
 * de `adapters/tribunais/tce-pb/sagres/MODULO.md` (a fonte); aqui a tela a exibe para o avaliador não ter de abrir
 * o repositório. Nunca "linha vazia falsa": o que não exporta diz POR QUE (DIRETIVA §5).
 */
const MATRIZ_SAGRES: readonly { readonly entidade: string; readonly secao: string; readonly exporta: boolean; readonly nota: string }[] = [
  { entidade: "Dotacao", secao: "§4.4", exporta: true, nota: "FichaOrcamentaria (a ficha foi desenhada como esta tabela)." },
  { entidade: "Empenhos", secao: "§4.8", exporta: true, nota: "Empenho + Ficha." },
  { entidade: "Liquidacao", secao: "§4.10", exporta: true, nota: "Liquidacao + Empenho + Ficha." },
  { entidade: "Pagamentos", secao: "§4.12", exporta: true, nota: "Pagamento + conta pagadora (tripla bancária)." },
  { entidade: "Retencao", secao: "§4.14", exporta: true, nota: "M07 ingresso com pagamentoId; de-para TipoConsignacao → TipoRetencao §5.24." },
  { entidade: "ReceitaOrcamentaria", secao: "§4.16", exporta: true, nota: "ReceitaArrecadada; conta arrecadadora é parâmetro de exportação." },
  { entidade: "DespesaExtra", secao: "§4.20", exporta: true, nota: "M07 dispêndio; fonte STN (860/861/862/869) é parâmetro de exportação." },
  { entidade: "CadastroContaBancaria", secao: "§4.23", exporta: true, nota: "ContaBancaria (tripla banco/agência/conta)." },
  { entidade: "SaldoMensal", secao: "§4.26", exporta: true, nota: "Soma do extrato até o fim do mês." },
  { entidade: "MovimentacaoEntreContas", secao: "§4.59", exporta: true, nota: "TransferenciaEntreContas (M09)." },
  { entidade: "EstornoRetencao", secao: "§4.15", exporta: false, nota: "O M07 já modela ESTORNO_INGRESSO — falta só o layout/exporter. Não implementado nesta POC." },
  { entidade: "EstornoDespesaExtra", secao: "§4.22", exporta: false, nota: "O M07 já modela ESTORNO_DISPENDIO — falta só o layout/exporter. Não implementado nesta POC." },
  { entidade: "RetencaoRestos", secao: "§4.33", exporta: false, nota: "Exige retenção sobre restos a pagar; a POC não produz essa massa." },
];

/** aaaa-mm-dd a partir de um Date UTC — o mesmo formato que a porta e o `<input type="date">` usam. */
function isoDia(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/**
 * O AVISO DE PERÍODO SEM MOVIMENTO (DIRETIVA §5 e §7).
 *
 * ⚠️ POR QUE ISTO É OBRIGATÓRIO, E NÃO UM DETALHE. Se a Comissão escolher um dia em que a base não
 * tem fato, os arquivos daquele dia saem com ZERO registro. Isso é o comportamento CORRETO do
 * layout — o arquivo do dia é gerado VAZIO, não omitido, porque a ausência de movimento também é
 * uma declaração e o TCE precisa recebê-la. O que seria desonesto é a tela ficar muda e deixar
 * alguém concluir que o sistema falhou, ou (pior) impedir a escolha do dia para esconder o vazio.
 */
function AvisoSemMovimento({
  escopo,
  competencia,
}: {
  readonly escopo: "dia" | "mes";
  readonly competencia: string;
}): React.ReactElement {
  const diario = escopo === "dia";
  return (
    <div className="rounded-[var(--radius-md)] border border-[color:var(--color-status-alerta-fg)] bg-[color:var(--color-status-alerta-bg)] p-4 text-sm">
      <p className="font-semibold text-[color:var(--color-ink)]">
        {diario ? "Este dia não tem movimento na base" : "Este mês não tem movimento na base"} — <span className="font-mono">{competencia}</span>
      </p>
      <p className="mt-1 text-[color:var(--color-ink-2)]">
        {diario ? (
          <>
            Os arquivos <strong>diários de fato</strong> (Empenhos, Liquidacao, Pagamentos,
            ReceitaOrcamentaria, Retencao, DespesaExtra, MovimentacaoEntreContas) sairão com{" "}
            <strong>0 registro</strong>.
          </>
        ) : (
          <>
            Os arquivos <strong>mensais</strong> desta competência refletirão um mês sem movimento: o
            SaldoMensal (§4.26) traz o saldo acumulado até o fim do mês, ainda que nenhum fato tenha
            ocorrido dentro dele.
          </>
        )}{" "}
        <strong>Isso é correto:</strong> o arquivo é gerado <strong>vazio</strong>, não omitido — a
        ausência de movimento é uma declaração, e o pacote precisa carregá-la.
      </p>
      <p className="mt-1 text-[color:var(--color-ink-3)]">
        {diario
          ? "O CadastroContaBancaria (§4.23) e os arquivos mensais continuam preenchidos: eles não dependem do dia escolhido."
          : "A Dotacao (§4.4) continua preenchida se o exercício tiver fichas: ela é o orçamento autorizado, não o movimento do mês."}{" "}
        Os atalhos abaixo listam os períodos que <em>têm</em> fato, lidos do banco.
      </p>
    </div>
  );
}

export default async function SagresPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly dia?: string; readonly mes?: string }>;
}): Promise<React.ReactElement> {
  const { dia: diaParam, mes: mesParam } = await searchParams;

  // ── NORMALIZAÇÃO DOS PARÂMETROS ──
  // O `dia` é livre (o seletor aceita qualquer data); só o FORMATO é validado. Data inválida vira
  // erro NOMEADO em vez de silenciosamente cair no padrão — quem digitou errado precisa saber.
  const diaEscolhido = diaParam !== undefined && diaParam !== "" ? new Date(`${diaParam}T00:00:00Z`) : POC_SAGRES.dia;
  const diaValido = !Number.isNaN(diaEscolhido.getTime());

  // O `mes` é INDEPENDENTE do dia; ausente, cai no mês do dia (o comportamento histórico da tela).
  // Qualquer data dentro do mês serve — a porta normaliza para o último dia dele.
  const mesFallback = diaValido ? isoDia(diaEscolhido).slice(0, 7) : "";
  const mesTexto = mesParam !== undefined && mesParam !== "" ? mesParam : mesFallback;
  const mesEscolhido = new Date(`${mesTexto}-01T00:00:00Z`);
  const mesValido = !Number.isNaN(mesEscolhido.getTime());

  const cabecalho = (
    <PageHeader
      titulo="SAGRES 2026 — TXT diário e mensal"
      subtitulo="Geração, validação local e download do pacote (formato oficial 2026 v1.1)."
      acoes={<Badge status="ok">Layout SAGRES 2026 v1.1</Badge>}
    />
  );

  // ── OS PERÍODOS COM MOVIMENTO, DO BANCO ──
  // Falha aqui é falha de INFRAESTRUTURA (sem DATABASE_URL, banco fora): a tela inteira depende do
  // banco, então o estado vazio nomeado substitui a página — não adianta oferecer seletor de dia
  // para um sistema que não consegue ler dia nenhum.
  let periodos: PeriodosComMovimento;
  try {
    periodos = await lerPeriodosComMovimento();
  } catch (erro) {
    return (
      <div className="space-y-6">
        {cabecalho}
        <BannerHonesto />
        <EstadoVazio
          titulo={erro instanceof PortaSemBancoError ? "Banco de dados não configurado" : "Não foi possível ler os períodos com movimento"}
          descricao={erro instanceof Error ? erro.message : "Erro desconhecido."}
        />
      </div>
    );
  }

  const diaIso = diaValido ? isoDia(diaEscolhido) : "";
  const mesIso = mesValido ? mesTexto : "";
  const movimentoDoDia: DiaComMovimento | undefined = periodos.dias.find((d) => d.dia === diaIso);
  const movimentoDoMes: MesComMovimento | undefined = periodos.meses.find((m) => m.mes === mesIso);

  let preview: PreviewSagres | null = null;
  let erro: string | null = null;
  if (!diaValido) erro = `Parâmetro 'dia' inválido: "${diaParam}" (esperado aaaa-mm-dd).`;
  else if (!mesValido) erro = `Parâmetro 'mes' inválido: "${mesParam}" (esperado aaaa-mm).`;
  else {
    try {
      preview = await montarPreviewSagres({ ...POC_SAGRES, dia: diaEscolhido, mes: mesEscolhido });
    } catch (e) {
      erro = e instanceof Error ? e.message : "Falha ao montar a prévia.";
    }
  }

  // O download precisa dos MESMOS dois parâmetros da prévia, senão o ZIP baixado não é o que a
  // Comissão acabou de ver na tela — e essa divergência seria invisível até alguém abrir o arquivo.
  const hrefDownload = `/integracoes/sagres/download?dia=${diaIso}&mes=${mesIso}`;
  /** Href de atalho que preserva a OUTRA metade da escolha (troca só o dia, ou só o mês). */
  const hrefDia = (d: string): string => `/integracoes/sagres?dia=${d}&mes=${mesIso}`;
  const hrefMes = (m: string): string => `/integracoes/sagres?dia=${diaIso}&mes=${m}`;

  return (
    <div className="space-y-6">
      {cabecalho}

      <BannerHonesto />

      {/* ── MATRIZ DE COBERTURA ── */}
      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--color-ink-2)]">Matriz de cobertura</h2>
          <Badge status="ok">{MATRIZ_SAGRES.filter((m) => m.exporta).length} de {MATRIZ_SAGRES.length} exportam</Badge>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead>
              <tr className="border-b border-[color:var(--color-border)] text-xs uppercase tracking-wide text-[color:var(--color-ink-3)]">
                <th className="py-2 pr-3 font-semibold">Entidade</th>
                <th className="py-2 pr-3 font-semibold">Seção</th>
                <th className="py-2 pr-3 font-semibold">Status</th>
                <th className="py-2 font-semibold">Origem / motivo</th>
              </tr>
            </thead>
            <tbody>
              {MATRIZ_SAGRES.map((m) => (
                <tr key={m.entidade} className="border-b border-[color:var(--color-border)] last:border-0 align-top">
                  <td className="py-2 pr-3 font-medium text-[color:var(--color-ink)]">{m.entidade}</td>
                  <td className="py-2 pr-3 font-mono text-xs text-[color:var(--color-ink-3)]">{m.secao}</td>
                  <td className="py-2 pr-3">
                    <Badge status={m.exporta ? "ok" : "neutro"}>{m.exporta ? "exporta" : "não implementada"}</Badge>
                  </td>
                  <td className="py-2 text-[color:var(--color-ink-2)]">{m.nota}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── ESCOLHA DA COMPETÊNCIA ── */}
      <Card>
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-[color:var(--color-ink-2)]">Competência a gerar</h2>
        <p className="mb-3 text-xs text-[color:var(--color-ink-3)]">
          Escolha <strong>qualquer</strong> dia e <strong>qualquer</strong> mês — não há lista fechada.
          O dia comanda os arquivos <strong>diários</strong>; o mês, os <strong>mensais</strong> (Dotacao
          §4.4 e SaldoMensal §4.26). Os dois são independentes.
        </p>
        <SeletorCompetencia dia={diaIso} mes={mesIso} />

        {/* ── ATALHOS: os períodos com movimento, LIDOS DO BANCO ── */}
        <div className="mt-5 space-y-3">
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--color-ink-3)]">
              Dias com movimento na base ({periodos.dias.length})
            </h3>
            {periodos.dias.length === 0 ? (
              <p className="text-sm text-[color:var(--color-ink-3)]">
                Nenhum dia com fato exportável na base — a massa não foi semeada. Todo pacote diário sairá com 0 registro.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {periodos.dias.map((d) => (
                  <a
                    key={d.dia}
                    href={hrefDia(d.dia)}
                    aria-current={d.dia === diaIso ? "true" : undefined}
                    className={`inline-flex h-11 items-center gap-2 rounded-[var(--radius-md)] border bg-[color:var(--color-surface-2)] px-3 text-sm hover:border-[color:var(--color-primary)] ${
                      d.dia === diaIso
                        ? "border-[color:var(--color-primary)] text-[color:var(--color-ink)]"
                        : "border-[color:var(--color-border)]"
                    }`}
                  >
                    <strong className="font-mono text-xs">{d.dia}</strong>
                    <span className="text-[color:var(--color-ink-2)]">{d.rotulo}</span>
                  </a>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--color-ink-3)]">
              Meses com movimento na base ({periodos.meses.length})
            </h3>
            {periodos.meses.length === 0 ? (
              <p className="text-sm text-[color:var(--color-ink-3)]">Nenhum mês com fato exportável na base.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {periodos.meses.map((m) => (
                  <a
                    key={m.mes}
                    href={hrefMes(m.mes)}
                    aria-current={m.mes === mesIso ? "true" : undefined}
                    className={`inline-flex h-11 items-center gap-2 rounded-[var(--radius-md)] border bg-[color:var(--color-surface-2)] px-3 text-sm hover:border-[color:var(--color-primary)] ${
                      m.mes === mesIso
                        ? "border-[color:var(--color-primary)] text-[color:var(--color-ink)]"
                        : "border-[color:var(--color-border)]"
                    }`}
                  >
                    <strong className="font-mono text-xs">{m.mes}</strong>
                    <span className="text-[color:var(--color-ink-2)]">
                      {m.diasComMovimento} dia(s) · {m.rotulo}
                    </span>
                  </a>
                ))}
              </div>
            )}
          </div>

          {/*
            A DOTACAO NÃO DEPENDE DO MOVIMENTO — depende do EXERCÍCIO ter fichas. Dizer quais
            exercícios existem evita a conclusão errada de que "mês sem movimento = Dotacao vazia".
          */}
          <p className="text-xs text-[color:var(--color-ink-3)]">
            Exercícios com ficha orçamentária (fonte da Dotacao §4.4):{" "}
            {periodos.exercicios.length === 0 ? "nenhum" : periodos.exercicios.join(", ")}. Períodos e
            contagens acima são <strong>lidos do banco a cada carga</strong> — não há lista fixa nesta tela.
          </p>
        </div>
      </Card>

      {/* ── HONESTIDADE: competência escolhida sem movimento ── */}
      {diaValido && movimentoDoDia === undefined ? <AvisoSemMovimento escopo="dia" competencia={diaIso} /> : null}
      {mesValido && movimentoDoMes === undefined ? <AvisoSemMovimento escopo="mes" competencia={mesIso} /> : null}

      {erro !== null && (
        <Card>
          <p className="text-sm font-semibold text-[color:var(--color-status-erro-fg)]">Não foi possível gerar a prévia</p>
          <p className="mt-1 text-sm text-[color:var(--color-ink-2)]">{erro}</p>
        </Card>
      )}

      {preview !== null && (
        <>
          <Card>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <span><span className="text-[color:var(--color-ink-2)]">UG:</span> <strong>{preview.codUnidadeGestora}</strong> <Badge status="neutro">POC</Badge></span>
              <span>
                <span className="text-[color:var(--color-ink-2)]">Competência diária:</span> <strong>{preview.competenciaDiaria}</strong>{" "}
                <Badge status={movimentoDoDia !== undefined ? "ok" : "alerta"}>
                  {movimentoDoDia !== undefined ? movimentoDoDia.rotulo : "sem movimento"}
                </Badge>
              </span>
              <span>
                <span className="text-[color:var(--color-ink-2)]">Competência mensal:</span> <strong>{preview.competenciaMensal}</strong>{" "}
                <Badge status={movimentoDoMes !== undefined ? "ok" : "alerta"}>
                  {movimentoDoMes !== undefined ? movimentoDoMes.rotulo : "sem movimento"}
                </Badge>
              </span>
              <span className="ml-auto">
                <a
                  href={hrefDownload}
                  className="inline-flex h-10 items-center rounded-[var(--radius-md)] bg-[color:var(--color-primary)] px-4 font-semibold text-[color:var(--color-primary-fg)] hover:bg-[color:var(--color-primary-hover)]"
                >
                  Baixar pacote (.zip + manifesto)
                </a>
              </span>
            </div>
            <p className="mt-2 break-all text-xs text-[color:var(--color-ink-3)]">hash do pacote: {preview.manifesto.hashPacote}</p>
            <p className="mt-1 text-xs text-[color:var(--color-ink-3)]">
              O ZIP baixado é <strong>exatamente</strong> esta competência — o botão carrega os mesmos{" "}
              <code>dia</code> e <code>mes</code> da prévia. Os arquivos mensais dentro dele levam{" "}
              {preview.competenciaMensal} no nome, mesmo quando o dia escolhido é de outro mês.
            </p>
          </Card>

          {/* ── VALIDAÇÕES ── */}
          <Card>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[color:var(--color-ink-2)]">Validações</h2>
            {preview.violacoes.length === 0 ? (
              <p className="text-sm text-[color:var(--color-status-ok-fg)]">✓ Nenhuma violação — o pacote passou nas validações locais.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {preview.violacoes.map((v, i) => (
                  <li key={i} className="text-[color:var(--color-status-erro-fg)]">
                    <Badge status="erro">{v.regra}</Badge> <strong>{v.arquivo}</strong>
                    {v.linha > 0 ? ` · linha ${v.linha}` : " · pacote"} · campo <code>{v.campo}</code>: {v.detalhe}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* ── PRÉVIA MONOESPAÇADA POR ARQUIVO ── */}
          {preview.arquivos.map((arq) => (
            <Card key={arq.nome}>
              <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                <strong>{arq.entidade}</strong>
                <Badge status="neutro">{arq.periodicidade}</Badge>
                <span className="text-[color:var(--color-ink-2)]">{arq.registros} registro(s) · largura {arq.largura}</span>
                <code className="ml-auto text-xs text-[color:var(--color-ink-3)]">{arq.nome}</code>
              </div>
              {arq.registros === 0 ? (
                <p className="text-sm text-[color:var(--color-ink-3)]">
                  Sem registros nesta competência — o arquivo é gerado <strong>vazio (0 linha)</strong>, não omitido:
                  a ausência de movimento também é uma declaração ao TCE. Use os atalhos acima para escolher um
                  período com fato.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]">
                  <pre className="whitespace-pre px-3 py-2 font-mono text-xs leading-5 text-[color:var(--color-ink)]">
{blocoComRegua(arq.linhas, preview.regua, arq.largura)}
                  </pre>
                </div>
              )}
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
