import Link from "next/link";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import type { ParametrosBrutos } from "../../../../lib/molde/consulta";
import { exigirLeitura } from "../../../../lib/portas/molde";
import { etiquetasDosBens, PortaSemBancoError, TETO_DO_LOTE } from "../../../../lib/portas/recursos/etiquetas-dados";
import { BotaoImprimir } from "./BotaoImprimir";

/**
 * A FOLHA DE ETIQUETAS (V3, pacote 2, unidade 5; TR 5.19.2) — individual ou em lote.
 *
 * `?bens=id,id,id` — do detalhe do bem (um) ou da seleção da lista do acervo (vários). GET,
 * sem transição de estado: só desenha os códigos já gravados. A folha imprime em grade;
 * o que não é etiqueta (cabeçalho, avisos, botão) sai da impressão.
 */
export const dynamic = "force-dynamic";

const CSS = `
@media print {
  .no-print { display: none !important; }
  body { background: #fff; }
  .folha { gap: 4mm; }
  .etiqueta { break-inside: avoid; }
}
.folha { display: grid; grid-template-columns: repeat(auto-fill, minmax(62mm, 1fr)); gap: 6mm; }
.etiqueta { border: 0.3mm solid #999; padding: 2mm 3mm; width: 62mm; min-height: 32mm; font-family: Arial, sans-serif; color: #111; background: #fff; }
.etiqueta .ente { font-size: 7pt; color: #333; text-transform: uppercase; }
.etiqueta .tomb { font-size: 11pt; font-weight: 700; margin-top: 1mm; }
.etiqueta .desc { font-size: 7.5pt; margin-top: 0.5mm; max-height: 8mm; overflow: hidden; }
.etiqueta svg { width: 100%; height: auto; margin-top: 1mm; }
`;

const primeiro = (v: string | readonly string[] | undefined): string =>
  (Array.isArray(v) ? (v[0] ?? "") : ((v as string | undefined) ?? "")).trim();

export default async function EtiquetasPage({
  searchParams,
}: {
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_PATRIMONIO");
  const sp = await searchParams;
  const ids = primeiro(sp["bens"]).split(",");

  const cabecalho = (
    <div className="no-print">
      <PageHeader
        titulo="Etiquetas de patrimônio"
        subtitulo={`Folha para impressão com o código de barras de cada bem (Code 128). Até ${TETO_DO_LOTE} por folha; o código impresso é o gravado no cadastro.`}
      />
    </div>
  );

  try {
    const lote = await etiquetasDosBens(ids);
    return (
      <div className="space-y-4">
        <style>{CSS}</style>
        {cabecalho}
        {lote.etiquetas.length === 0 && lote.semCodigo.length === 0 ? (
          <div className="no-print">
            <EstadoVazio
              titulo="Nenhum bem para etiquetar"
              descricao="Abra a etiqueta pelo detalhe do bem, ou marque bens na lista do acervo e use o link de etiquetas da seleção."
            />
          </div>
        ) : null}
        {lote.semCodigo.length > 0 ? (
          <div className="no-print rounded border border-[color:var(--color-linha)] p-3 text-sm" data-sem-codigo={lote.semCodigo.length}>
            <p className="font-medium">{lote.semCodigo.length} bem(ns) fora da folha:</p>
            <ul className="mt-1 list-disc pl-5">
              {lote.semCodigo.map((b) => (
                <li key={b.id}>
                  <Link className="underline underline-offset-2" href={`/patrimonio/bens-patrimoniais/${b.id}`}>{b.numeroTombamento}</Link> — {b.descricao}: {b.motivo}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {lote.naoEncontrados > 0 ? (
          <p className="no-print text-sm text-[color:var(--color-status-erro-fg)]">{lote.naoEncontrados} identificador(es) não correspondem a bem nenhum e foram ignorados.</p>
        ) : null}
        {lote.etiquetas.length > 0 ? (
          <>
            <div className="no-print flex items-center gap-3">
              <BotaoImprimir />
              <span className="text-sm text-[color:var(--color-ink-2)]">{lote.etiquetas.length} etiqueta(s) na folha</span>
            </div>
            <div className="folha" data-etiquetas={lote.etiquetas.length}>
              {lote.etiquetas.map((e) => (
                <div key={e.id} className="etiqueta" data-tombamento={e.numeroTombamento}>
                  <div className="ente">{lote.ente}</div>
                  <div className="tomb">{e.numeroTombamento}</div>
                  <div className="desc">{e.descricao}</div>
                  {/* O SVG nasce no servidor, do código ASCII gravado — não há HTML de terceiros aqui. */}
                  <div aria-label={`código de barras ${e.codigoDeBarras}`} dangerouslySetInnerHTML={{ __html: e.svg }} />
                </div>
              ))}
            </div>
          </>
        ) : null}
      </div>
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-4">
          {cabecalho}
          <EstadoVazio titulo="Banco de dados indisponível" descricao="A folha lê os bens e os códigos gravados. Sem banco, não tem o que imprimir." />
        </div>
      );
    }
    throw e;
  }
}
