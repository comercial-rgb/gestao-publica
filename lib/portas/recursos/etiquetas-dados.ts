import { svgCode128, textoCodificavelEmCode128 } from "../../../packages/codigo-de-barras/index.js";
import { ENTE } from "../../pdf/ente.js";
import { cliente, PortaSemBancoError } from "../cliente";

/**
 * AS ETIQUETAS IMPRIMÍVEIS (V3, pacote 2, unidade 5; TR 5.19.2) — individual ou em lote.
 *
 * ⚠️ IMPRIMIR NÃO GRAVA. O código de barras do bem é GERADO E GRAVADO pela ação "Gerar
 * etiqueta" do detalhe (`gerarEtiquetaDeBem`, idempotente); esta leitura só desenha o que
 * está gravado. Bem sem código aparece na lista "sem código" com o caminho — a tela não
 * inventa um código na hora de imprimir, porque a reimpressão precisa sair idêntica à
 * etiqueta já colada.
 *
 * ⚠️ O SVG É GERADO NO SERVIDOR a partir do código gravado (ASCII, conferido) — nenhum HTML
 * de terceiros entra nele.
 */

export { PortaSemBancoError };

export interface EtiquetaDoBem {
  readonly id: string;
  readonly numeroTombamento: string;
  readonly descricao: string;
  readonly classe: string;
  readonly codigoDeBarras: string;
  readonly svg: string;
}

export interface BemSemEtiqueta {
  readonly id: string;
  readonly numeroTombamento: string;
  readonly descricao: string;
  readonly motivo: string;
}

export interface LoteDeEtiquetas {
  readonly ente: string;
  readonly etiquetas: readonly EtiquetaDoBem[];
  readonly semCodigo: readonly BemSemEtiqueta[];
  readonly naoEncontrados: number;
}

/** Os ids vêm da URL (`?bens=a,b,c`); o teto evita um lote de milhares num só HTML. */
export const TETO_DO_LOTE = 200;

export async function etiquetasDosBens(ids: readonly string[]): Promise<LoteDeEtiquetas> {
  const unicos = [...new Set(ids.map((s) => s.trim()).filter((s) => s !== ""))].slice(0, TETO_DO_LOTE);
  if (unicos.length === 0) return { ente: ENTE, etiquetas: [], semCodigo: [], naoEncontrados: 0 };
  const bens = await cliente().bemPatrimonial.findMany({
    where: { id: { in: unicos } },
    select: {
      id: true,
      numeroTombamento: true,
      descricao: true,
      codigoDeBarras: true,
      classeDeBens: { select: { codigo: true, descricao: true } },
    },
    orderBy: { numeroTombamento: "asc" },
  });
  const etiquetas: EtiquetaDoBem[] = [];
  const semCodigo: BemSemEtiqueta[] = [];
  for (const b of bens) {
    if (b.codigoDeBarras === null) {
      semCodigo.push({ id: b.id, numeroTombamento: b.numeroTombamento, descricao: b.descricao, motivo: 'sem código gravado — use "Gerar etiqueta" no detalhe do bem' });
      continue;
    }
    if (!textoCodificavelEmCode128(b.codigoDeBarras)) {
      semCodigo.push({ id: b.id, numeroTombamento: b.numeroTombamento, descricao: b.descricao, motivo: `o código gravado "${b.codigoDeBarras}" tem caractere fora do ASCII e não cabe em Code 128` });
      continue;
    }
    etiquetas.push({
      id: b.id,
      numeroTombamento: b.numeroTombamento,
      descricao: b.descricao,
      classe: `${b.classeDeBens.codigo} — ${b.classeDeBens.descricao}`,
      codigoDeBarras: b.codigoDeBarras,
      svg: svgCode128(b.codigoDeBarras),
    });
  }
  return { ente: ENTE, etiquetas, semCodigo, naoEncontrados: unicos.length - bens.length };
}
