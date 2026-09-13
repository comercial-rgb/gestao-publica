import { diaCivilBr } from "../../packages/datas/index.js";
import { formatarDocumento } from "../../packages/documento/index.js";
import type { Tx } from "../m16-travamento/autorizacao.js";
import { estadoDoBem } from "./gestao-do-bem.js";
import { valorContabilDoBem } from "./patrimonio.js";

/**
 * O DOCUMENTO DO TERMO PATRIMONIAL (V3, pacote 2, unidade 5; TR 5.19.36 e 5.19.37).
 *
 * ═══ O QUE ISTO É ═══
 * A composição do termo — cabeçalho, a relação dos bens com o que cada um vale hoje e onde
 * está, a declaração e as linhas de assinatura — como DADO. Quem transforma em PDF é o motor
 * de `lib/pdf` (a rota autenticada); o módulo não conhece PDF nem HTML. A forma é a mesma
 * que os demonstrativos usam (`ente`, `titulo`, `subtitulo`, `periodo`, `secoes`, `notas`),
 * declarada aqui para que o módulo não importe `lib/`.
 *
 * ⚠️ O TERMO É O FATO — o valor e a localização são os de HOJE, derivados. O termo emitido
 * em março registrou o movimento de responsabilidade em março; o PDF gerado em junho diz
 * "emitido em março" no cabeçalho e traz o valor contábil de junho na tabela, porque é uma
 * leitura, não um arquivo congelado (o arquivo congelado é `documentoId` → `Anexo`, quando
 * o ente anexar o termo assinado).
 */

export interface SecaoDoTermo {
  readonly titulo?: string;
  readonly colunas: readonly { readonly rotulo: string; readonly alinhamento?: "esquerda" | "direita" }[];
  readonly linhas: readonly (readonly string[])[];
}

export interface DocumentoDoTermo {
  readonly ente: string;
  readonly titulo: string;
  readonly subtitulo: string;
  readonly periodo: string;
  readonly secoes: readonly SecaoDoTermo[];
  readonly notas: readonly string[];
  /** O número do termo, seguro para nome de arquivo. */
  readonly numeroArquivo: string;
}

const ROTULO_DO_TIPO = { RESPONSABILIDADE: "Termo de responsabilidade", BAIXA: "Termo de baixa" } as const;

export async function documentoDoTermo(tx: Tx, termoId: string, ente: string): Promise<DocumentoDoTermo> {
  const termo = await tx.termoPatrimonial.findUnique({
    where: { id: termoId },
    select: {
      numero: true,
      tipo: true,
      data: true,
      criadoEm: true,
      criadoPor: true,
      responsavel: {
        select: { documento: true, versoes: { select: { nome: true }, orderBy: { criadoEm: "desc" }, take: 1 } },
      },
      setor: { select: { codigo: true, nome: true } },
      itens: {
        select: { bem: { select: { id: true, numeroTombamento: true, descricao: true, classeDeBens: { select: { codigo: true, descricao: true } } } } },
        orderBy: { criadoEm: "asc" },
      },
    },
  });
  if (termo === null) throw new Error(`Termo patrimonial ${termoId} não encontrado.`);

  const responsavel =
    termo.responsavel === null
      ? null
      : { nome: termo.responsavel.versoes[0]?.nome ?? termo.responsavel.documento, documento: formatarDocumento(termo.responsavel.documento) };

  const linhas: string[][] = [];
  let total = "0.00";
  let somaCentavos = 0n;
  for (const item of termo.itens) {
    const b = item.bem;
    const [valor, estado] = await Promise.all([valorContabilDoBem(tx, b.id), estadoDoBem(tx, b.id)]);
    const localizacao =
      estado.localizacaoId === null
        ? "—"
        : await tx.localizacaoFisica.findUnique({ where: { id: estado.localizacaoId }, select: { codigo: true, descricao: true } }).then((l) => (l === null ? "—" : `${l.codigo} — ${l.descricao}`));
    const v = valor.toFixed(2);
    somaCentavos += BigInt(v.replace(".", ""));
    linhas.push([b.numeroTombamento, b.descricao, `${b.classeDeBens.codigo} — ${b.classeDeBens.descricao}`, localizacao, v]);
  }
  total = `${somaCentavos / 100n}.${String(somaCentavos % 100n).padStart(2, "0")}`;
  linhas.push(["", "", "", "Total", total]);

  const titulo = `${ROTULO_DO_TIPO[termo.tipo]} nº ${termo.numero}`;
  const subtitulo =
    termo.tipo === "RESPONSABILIDADE"
      ? `Responsável: ${responsavel === null ? "—" : `${responsavel.nome} (${responsavel.documento})`}` +
        (termo.setor === null ? "" : ` · Setor: ${termo.setor.codigo} — ${termo.setor.nome}`)
      : `Baixa do acervo` + (termo.setor === null ? "" : ` · Setor: ${termo.setor.codigo} — ${termo.setor.nome}`);

  const notas =
    termo.tipo === "RESPONSABILIDADE"
      ? [
          `Declaro ter recebido os bens acima relacionados, em ${diaCivilBr(termo.data)}, responsabilizando-me pela guarda, conservação e uso exclusivo no serviço público, e por comunicar ao setor de patrimônio qualquer movimentação, dano ou extravio.`,
          `Assinatura do responsável: ________________________________  ${responsavel === null ? "" : `${responsavel.nome} (${responsavel.documento})`}`,
          `Assinatura do setor de patrimônio: ________________________________`,
          `Emitido por ${termo.criadoPor} em ${diaCivilBr(termo.criadoEm)}. Valores contábeis e localizações são os do momento da impressão.`,
        ]
      : [
          `Os bens acima relacionados foram baixados do acervo patrimonial em ${diaCivilBr(termo.data)}, conforme o motivo registrado em cada movimento de baixa.`,
          `Assinatura do setor de patrimônio: ________________________________`,
          `Assinatura da comissão/autoridade: ________________________________`,
          `Emitido por ${termo.criadoPor} em ${diaCivilBr(termo.criadoEm)}. Valores contábeis e localizações são os do momento da impressão.`,
        ];

  return {
    ente,
    titulo,
    subtitulo,
    periodo: `Data do termo: ${diaCivilBr(termo.data)}`,
    secoes: [
      {
        titulo: "Bens",
        colunas: [
          { rotulo: "Tombamento" },
          { rotulo: "Descrição" },
          { rotulo: "Classe" },
          { rotulo: "Localização" },
          { rotulo: "Valor contábil (R$)", alinhamento: "direita" },
        ],
        linhas,
      },
    ],
    notas,
    numeroArquivo: termo.numero.replace(/[^A-Za-z0-9._-]+/g, "_"),
  };
}
