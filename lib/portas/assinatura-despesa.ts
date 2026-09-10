import { cliente, PortaSemBancoError } from "./cliente";
import { comEscritaAutenticada } from "./sessao";
import {
  enviarEmpenhoParaAssinatura,
  enviarLiquidacaoParaAssinatura,
  enviarOrdemParaAssinatura,
} from "../../modules/m05-despesa/assinatura-da-despesa";
import { assinarNaFila } from "../../modules/m22-documentos/assinatura";
import { diaCivilBr } from "../../packages/datas/index";

/**
 * PORTA — OS DOCUMENTOS DA DESPESA NA FILA DE ASSINATURAS DO ENT02 (ENT03a, item 4).
 *
 * ⚠️ A FILA É A MESMA DO ENT02, e isso é o ponto. Não há "fila de assinaturas da
 * despesa": há a `FilaDeAssinatura` do M22, que o borderô já usava. Uma fila paralela
 * teria duplicado a ordenação, o "já assinou?" e o significado do hash.
 */

export { PortaSemBancoError };

export interface DocumentoAssinavel {
  readonly tipo: "EMPENHO" | "LIQUIDACAO" | "ORDEM";
  readonly registroId: string;
  readonly numero: string;
  readonly valor: string;
  readonly data: string;
  /** `null` quando ainda não há documento gerado. */
  readonly filaId: string | null;
  readonly anexoId: string | null;
  readonly assinaturas: readonly {
    readonly ordem: number;
    readonly usuario: string;
    readonly assinou: boolean;
  }[];
  readonly completa: boolean;
}

/** Os empenhos, liquidações e ordens do exercício, com o estado do documento. */
export async function documentosDaDespesa(): Promise<readonly DocumentoAssinavel[]> {
  const prisma = cliente();

  // ⚠️ `filas` É UM ARRAY no modelo: um anexo pode entrar em mais de uma fila. Para o
  // documento da despesa há uma só (o guard "um documento por fato" garante isso), mas o
  // tipo é plural — e tratá-lo como objeto seria assumir uma cardinalidade que o schema
  // não promete.
  const fila = {
    orderBy: { criadoEm: "asc" as const },
    select: {
      id: true,
      signatarios: {
        select: {
          ordem: true,
          usuarioIdent: true,
          assinatura: { select: { id: true } },
        },
        orderBy: { ordem: "asc" as const },
      },
    },
  };

  const [empenhos, liquidacoes, ordens] = await Promise.all([
    prisma.empenho.findMany({
      where: { estornoDeId: null },
      orderBy: { numero: "asc" },
      take: 100,
      select: {
        id: true, numero: true, valor: true, data: true,
        anexos: { where: { origem: "SISTEMA" }, select: { id: true, filas: fila } },
      },
    }),
    prisma.liquidacao.findMany({
      where: { estornoDeId: null },
      orderBy: { numero: "asc" },
      take: 100,
      select: {
        id: true, numero: true, valor: true, data: true,
        anexos: { where: { origem: "SISTEMA" }, select: { id: true, filas: fila } },
      },
    }),
    prisma.ordemDePagamento.findMany({
      orderBy: { numero: "asc" },
      take: 100,
      select: {
        id: true, numero: true, valor: true, dataPrevista: true,
        anexos: { where: { origem: "SISTEMA" }, select: { id: true, filas: fila } },
      },
    }),
  ]);

  type ComAnexos = {
    id: string; numero: string; valor: { toFixed: (n: number) => string };
    anexos: readonly {
      id: string;
      filas: readonly {
        id: string;
        signatarios: readonly { ordem: number; usuarioIdent: string; assinatura: { id: string } | null }[];
      }[];
    }[];
  };

  const mapear = (
    tipo: DocumentoAssinavel["tipo"],
    r: ComAnexos,
    data: Date
  ): DocumentoAssinavel => {
    const anexo = r.anexos[0];
    const primeiraFila = anexo?.filas[0];
    const sig = primeiraFila?.signatarios ?? [];
    return {
      tipo,
      registroId: r.id,
      numero: r.numero,
      valor: r.valor.toFixed(2),
      data: diaCivilBr(data),
      filaId: primeiraFila?.id ?? null,
      anexoId: anexo?.id ?? null,
      assinaturas: sig.map((s) => ({
        ordem: s.ordem,
        usuario: s.usuarioIdent,
        assinou: s.assinatura !== null,
      })),
      // ⚠️ `length > 0 &&` — `[].every(...)` é `true` em JavaScript, e fila vazia passaria
      // por "todas colhidas". Mesma armadilha que o domínio fecha em `estadoDasAssinaturas`.
      completa: sig.length > 0 && sig.every((s) => s.assinatura !== null),
    };
  };

  return [
    ...empenhos.map((e) => mapear("EMPENHO", e as unknown as ComAnexos, e.data)),
    ...liquidacoes.map((l) => mapear("LIQUIDACAO", l as unknown as ComAnexos, l.data)),
    ...ordens.map((o) => mapear("ORDEM", o as unknown as ComAnexos, o.dataPrevista)),
  ];
}

/** Os usuários que podem assinar — o cadastro do M16, sem inventar lista. */
export async function possiveisSignatarios(): Promise<readonly string[]> {
  const us = await cliente().usuario.findMany({
    where: { ativo: true },
    orderBy: { identificador: "asc" },
    select: { identificador: true },
  });
  return us.map((u) => u.identificador);
}

export async function enviarParaAssinatura(
  tipo: "EMPENHO" | "LIQUIDACAO" | "ORDEM",
  registroId: string,
  signatarios: readonly string[]
): Promise<string> {
  return comEscritaAutenticada("ENVIAR_DOCUMENTO_PARA_ASSINATURA", async (criadoPor) => {
    const comum = { modo: "AVANCADA" as const, signatarios: [...signatarios], criadoPor };
    const r =
      tipo === "EMPENHO"
        ? await enviarEmpenhoParaAssinatura(cliente(), { empenhoId: registroId, ...comum })
        : tipo === "LIQUIDACAO"
          ? await enviarLiquidacaoParaAssinatura(cliente(), { liquidacaoId: registroId, ...comum })
          : await enviarOrdemParaAssinatura(cliente(), { ordemId: registroId, ...comum });
    return r.filaId;
  });
}

export async function assinar(filaId: string): Promise<boolean> {
  return comEscritaAutenticada("ASSINAR_NA_FILA", async (criadoPor) => {
    const r = await assinarNaFila(cliente(), { filaId, criadoPor });
    return r.concluida;
  });
}
