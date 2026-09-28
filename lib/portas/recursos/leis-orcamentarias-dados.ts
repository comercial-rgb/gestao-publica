import {
  cadastrarLeiOrcamentariaAnual,
  registrarAprovacaoDaLeiOrcamentaria,
} from "../../../modules/m02b-plurianual/lei-orcamentaria.js";
import { diaCivilBr } from "../../../packages/datas/index.js";
import type { ConsultaDoMolde } from "../../molde/consulta.js";
import { TAMANHO_DE_PAGINA } from "../../molde/consulta.js";
import { comEscritaAutenticada } from "../sessao";
import { cliente, PortaSemBancoError } from "../cliente";
import type { DetalheLido, PaginaDoMolde } from "./dados";

export { PortaSemBancoError };

/**
 * ═══ OS DADOS DAS LEIS ORÇAMENTÁRIAS ANUAIS (V22, M02b) ═══
 *
 * ⚠️ NENHUMA REGRA AQUI: o exercício repetido, a ordem das datas, a aprovação única e a
 * autorização são do serviço (`modules/m02b-plurianual/lei-orcamentaria.ts`), e a recusa sobe
 * como veio.
 */

type Campos = Readonly<Record<string, string>>;
const t = (c: Campos, k: string): string => (c[k] ?? "").trim();

export async function listarLeisOrcamentarias(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const prisma = cliente();
  const q = (c.filtros["q"] ?? "").trim();
  const ano = /^\d{4}$/.test(q) ? Number(q) : null;
  const where =
    q === ""
      ? {}
      : {
          OR: [
            ...(ano !== null ? [{ exercicio: ano }] : []),
            { numeroDoProjeto: { contains: q, mode: "insensitive" as const } },
            { aprovacao: { is: { numeroDaLei: { contains: q, mode: "insensitive" as const } } } },
          ],
        };
  const [total, linhas] = await Promise.all([
    prisma.leiOrcamentariaAnual.count({ where }),
    prisma.leiOrcamentariaAnual.findMany({
      where,
      skip: (c.pagina - 1) * TAMANHO_DE_PAGINA,
      take: TAMANHO_DE_PAGINA,
      orderBy: { exercicio: c.ordem === "exercicio" ? c.direcao : "desc" },
      select: {
        id: true,
        exercicio: true,
        numeroDoProjeto: true,
        dataDoEnvio: true,
        aprovacao: { select: { numeroDaLei: true, dataDaPublicacao: true } },
        _count: { select: { anexos: true } },
      },
    }),
  ]);
  return {
    total,
    linhas: linhas.map((x) => ({
      id: x.id,
      exercicio: String(x.exercicio),
      projeto: x.numeroDoProjeto,
      envio: diaCivilBr(x.dataDoEnvio),
      lei: x.aprovacao === null ? "aguardando aprovação" : x.aprovacao.numeroDaLei,
      publicacao: x.aprovacao === null ? "" : diaCivilBr(x.aprovacao.dataDaPublicacao),
      anexos: String(x._count.anexos),
    })),
  };
}

export async function verLeiOrcamentaria(id: string): Promise<DetalheLido | null> {
  const x = await cliente().leiOrcamentariaAnual.findUnique({
    where: { id },
    select: {
      exercicio: true,
      numeroDoProjeto: true,
      dataDoEnvio: true,
      ementa: true,
      criadoEm: true,
      criadoPor: true,
      aprovacao: {
        select: { id: true, numeroDaLei: true, dataDaSancao: true, dataDaPublicacao: true, veiculoDePublicacao: true, criadoEm: true, criadoPor: true },
      },
      _count: { select: { anexos: true } },
    },
  });
  if (x === null) return null;
  const a = x.aprovacao;
  return {
    titulo: `LOA ${x.exercicio}`,
    subtitulo: a === null ? `Projeto de lei ${x.numeroDoProjeto}` : `Lei ${a.numeroDaLei} (projeto ${x.numeroDoProjeto})`,
    selos: [
      a === null ? { texto: "aguardando aprovação", tom: "alerta" } : { texto: "lei aprovada e publicada", tom: "ok" },
      x._count.anexos === 0 ? { texto: "sem documentos anexados", tom: "alerta" } : { texto: `${x._count.anexos} documento(s) anexado(s)`, tom: "neutro" },
    ],
    dados: [
      { rotulo: "Exercício", valor: String(x.exercicio) },
      { rotulo: "Projeto de lei", valor: x.numeroDoProjeto },
      { rotulo: "Envio ao Legislativo", valor: diaCivilBr(x.dataDoEnvio), tipo: "data" },
      { rotulo: "Ementa", valor: x.ementa },
      { rotulo: "Lei", valor: a === null ? "Ainda não registrada" : a.numeroDaLei },
      ...(a === null
        ? []
        : [
            { rotulo: "Sanção", valor: diaCivilBr(a.dataDaSancao), tipo: "data" as const },
            { rotulo: "Publicação", valor: diaCivilBr(a.dataDaPublicacao), tipo: "data" as const },
            { rotulo: "Veículo de publicação", valor: a.veiculoDePublicacao },
          ]),
    ],
    historico: [
      {
        id: `${id}-projeto`,
        oQue: `Projeto de lei ${x.numeroDoProjeto} cadastrado`,
        quando: diaCivilBr(x.dataDoEnvio),
        registradoEm: diaCivilBr(x.criadoEm),
        por: x.criadoPor,
      },
      ...(a === null
        ? []
        : [
            {
              id: a.id,
              oQue: `Lei ${a.numeroDaLei} registrada (publicada em ${a.veiculoDePublicacao})`,
              quando: diaCivilBr(a.dataDaSancao),
              registradoEm: diaCivilBr(a.criadoEm),
              por: a.criadoPor,
            },
          ]),
    ],
  };
}

export async function criarLeiOrcamentaria(c: Campos): Promise<string> {
  const r = await comEscritaAutenticada("CADASTRAR_LOA", (criadoPor) =>
    cadastrarLeiOrcamentariaAnual(cliente(), {
      exercicio: t(c, "exercicio"),
      numeroDoProjeto: t(c, "numeroDoProjeto"),
      dataDoEnvio: t(c, "dataDoEnvio"),
      ementa: t(c, "ementa"),
      criadoPor,
    })
  );
  return String(r.exercicio);
}

export async function registrarAprovacaoDaLei(leiId: string, c: Campos): Promise<void> {
  await comEscritaAutenticada("CADASTRAR_LOA", (criadoPor) =>
    registrarAprovacaoDaLeiOrcamentaria(cliente(), {
      leiId,
      numeroDaLei: t(c, "numeroDaLei"),
      dataDaSancao: t(c, "dataDaSancao"),
      dataDaPublicacao: t(c, "dataDaPublicacao"),
      veiculoDePublicacao: t(c, "veiculoDePublicacao"),
      criadoPor,
    })
  );
}
