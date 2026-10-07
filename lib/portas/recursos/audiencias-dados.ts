import { diaCivilBr, meioDiaCivil } from "../../../packages/datas/index.js";
import type { Prisma } from "../../../prisma/generated/client/client.js";
import {
  registrarAudienciaPublica,
  registrarSituacaoDaSolicitacao,
  registrarSolicitacaoDaAudiencia,
  ROTULO_DA_SITUACAO,
  situacaoVigente,
  type SituacaoDaSolicitacao,
} from "../../../modules/m02b-plurianual/audiencias.js";
import type { ConsultaDoMolde } from "../../molde/consulta.js";
import { TAMANHO_DE_PAGINA } from "../../molde/consulta.js";
import type { LinhaDoHistorico } from "../../molde/tipos.js";
import { comEscritaAutenticada } from "../sessao";
import { cliente, PortaSemBancoError } from "../cliente";
import type { DetalheLido, OpcoesDoCadastro, PaginaDoMolde } from "./dados";

/**
 * V36 — OS DADOS DAS AUDIÊNCIAS PÚBLICAS (M02b, TR 5.9.1.1-2). Nenhuma regra aqui: a situação vigente sai de
 * `situacaoVigente` (o domínio) e a recusa do serviço sobe como veio. As páginas cobram CONSULTAR_PLANEJAMENTO antes.
 */

export { PortaSemBancoError };

type Campos = Readonly<Record<string, string>>;
const t = (c: Campos, k: string): string => (c[k] ?? "").trim();

const DECIDIDAS: ReadonlySet<SituacaoDaSolicitacao> = new Set(["ACOLHIDA", "NAO_ACOLHIDA"]);
const ROTULO_DA_PECA: Readonly<Record<string, string>> = { PPA: "PPA", LDO: "LDO", LOA: "LOA" };

export async function listarAudiencias(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const prisma = cliente();
  const exercicio = c.filtros["exercicio"] ?? "";
  const peca = c.filtros["peca"] ?? "";
  const where: Prisma.AudienciaPublicaWhereInput = {
    ...(/^\d{4}$/.test(exercicio) ? { exercicio: Number(exercicio) } : {}),
    ...(peca !== "" ? { peca } : {}),
  };
  const [total, linhas] = await Promise.all([
    prisma.audienciaPublica.count({ where }),
    prisma.audienciaPublica.findMany({
      where,
      orderBy: [{ data: c.direcao }, { id: "asc" }],
      skip: (c.pagina - 1) * TAMANHO_DE_PAGINA,
      take: TAMANHO_DE_PAGINA,
      select: { id: true, exercicio: true, peca: true, data: true, local: true, solicitacoes: { select: { situacoes: { select: { id: true, situacao: true, criadoEm: true } } } } },
    }),
  ]);
  return {
    total,
    linhas: linhas.map((a) => ({
      id: a.id,
      data: diaCivilBr(a.data),
      peca: ROTULO_DA_PECA[a.peca] ?? a.peca,
      exercicio: String(a.exercicio),
      local: a.local,
      solicitacoes: String(a.solicitacoes.length),
      semDecisao: String(a.solicitacoes.filter((s) => !DECIDIDAS.has(situacaoVigente(s.situacoes))).length),
    })),
  };
}

export interface SolicitacaoNaTela {
  readonly id: string;
  readonly descricao: string;
  readonly bairro: string;
  readonly solicitante: string;
  readonly contato: string;
  readonly orgao: string;
  readonly situacao: string;
  readonly decidida: boolean;
  readonly parecer: string | null;
}

export interface AudienciaLida extends DetalheLido {
  readonly solicitacoes: readonly SolicitacaoNaTela[];
}

export async function verAudiencia(id: string): Promise<AudienciaLida | null> {
  const a = await cliente().audienciaPublica.findUnique({
    where: { id },
    select: {
      exercicio: true,
      peca: true,
      data: true,
      local: true,
      pauta: true,
      criadoEm: true,
      criadoPor: true,
      solicitacoes: {
        orderBy: [{ criadoEm: "asc" }, { id: "asc" }],
        select: {
          id: true,
          descricao: true,
          bairro: true,
          solicitanteNome: true,
          solicitanteContato: true,
          criadoEm: true,
          criadoPor: true,
          orgao: { select: { codigo: true, nome: true } },
          situacoes: { orderBy: [{ criadoEm: "asc" }, { id: "asc" }], select: { id: true, situacao: true, parecer: true, criadoEm: true, criadoPor: true } },
        },
      },
    },
  });
  if (a === null) return null;
  const solicitacoes: SolicitacaoNaTela[] = a.solicitacoes.map((s) => {
    const vigente = situacaoVigente(s.situacoes);
    const ultima = s.situacoes.at(-1);
    return {
      id: s.id,
      descricao: s.descricao,
      bairro: s.bairro,
      solicitante: s.solicitanteNome,
      contato: s.solicitanteContato,
      orgao: `${s.orgao.codigo} — ${s.orgao.nome}`,
      situacao: ROTULO_DA_SITUACAO[vigente],
      decidida: DECIDIDAS.has(vigente),
      parecer: ultima?.parecer ?? null,
    };
  });
  const linha = (lid: string, oQue: string, quando: Date, por: string, motivo: string | null): LinhaDoHistorico => ({
    id: lid, oQue, quando: diaCivilBr(quando), registradoEm: diaCivilBr(quando), por, motivo,
  });
  const historico: LinhaDoHistorico[] = a.solicitacoes.flatMap((s) => [
    linha(s.id, `Solicitação registrada: ${s.descricao}`, s.criadoEm, s.criadoPor, `Bairro ${s.bairro} · órgão ${s.orgao.codigo}`),
    ...s.situacoes.map((x) => linha(x.id, `"${s.descricao}" passou a ${ROTULO_DA_SITUACAO[x.situacao as SituacaoDaSolicitacao].toLowerCase()}`, x.criadoEm, x.criadoPor, x.parecer)),
  ]);
  const semDecisao = solicitacoes.filter((s) => !s.decidida).length;
  return {
    titulo: `Audiência pública — ${ROTULO_DA_PECA[a.peca] ?? a.peca} ${a.exercicio}`,
    subtitulo: `${diaCivilBr(a.data)} · ${a.local}`,
    selos: [
      { texto: `${solicitacoes.length} solicitação(ões)`, tom: "neutro" },
      { texto: semDecisao === 0 ? "Todas decididas" : `${semDecisao} sem decisão`, tom: semDecisao === 0 ? "ok" : "alerta" },
    ],
    dados: [
      { rotulo: "Peça discutida", valor: ROTULO_DA_PECA[a.peca] ?? a.peca },
      { rotulo: "Exercício", valor: String(a.exercicio) },
      { rotulo: "Data", valor: diaCivilBr(a.data), tipo: "data" },
      { rotulo: "Local", valor: a.local },
      { rotulo: "Pauta", valor: a.pauta },
      { rotulo: "Registrada em", valor: diaCivilBr(a.criadoEm), tipo: "data" },
      { rotulo: "Registrada por", valor: a.criadoPor },
    ],
    historico,
    solicitacoes,
  };
}

/** Os órgãos (para a análise) e — CONTEXTUAL — as solicitações DESTA audiência. */
export async function opcoesDaAudiencia(audienciaId?: string): Promise<OpcoesDoCadastro> {
  const prisma = cliente();
  const [orgaos, solicitacoes] = await Promise.all([
    prisma.orgao.findMany({ select: { id: true, codigo: true, nome: true }, orderBy: { codigo: "asc" } }),
    audienciaId === undefined
      ? []
      : prisma.solicitacaoDaAudiencia.findMany({ where: { audienciaId }, select: { id: true, descricao: true, bairro: true }, orderBy: [{ criadoEm: "asc" }, { id: "asc" }] }),
  ]);
  return {
    orgaoId: orgaos.map((o) => ({ valor: o.id, rotulo: `${o.codigo} — ${o.nome}` })),
    solicitacaoId: solicitacoes.map((s) => ({ valor: s.id, rotulo: `${s.descricao} (${s.bairro})` })),
  };
}

export async function criarAudiencia(c: Campos): Promise<void> {
  await comEscritaAutenticada("CADASTRAR_PPA", (criadoPor) =>
    registrarAudienciaPublica(cliente(), {
      exercicio: Number.parseInt(t(c, "exercicio"), 10),
      peca: t(c, "peca") as "PPA",
      data: meioDiaCivil(t(c, "data")),
      local: t(c, "local"),
      pauta: t(c, "pauta"),
      criadoPor,
    })
  );
}

export async function acaoDaAudiencia(acao: string, audienciaId: string, c: Campos): Promise<void> {
  switch (acao) {
    case "solicitacao":
      await comEscritaAutenticada("CADASTRAR_PPA", (criadoPor) =>
        registrarSolicitacaoDaAudiencia(cliente(), {
          audienciaId,
          descricao: t(c, "descricao"),
          bairro: t(c, "bairro"),
          solicitanteNome: t(c, "solicitanteNome"),
          solicitanteContato: t(c, "solicitanteContato"),
          orgaoId: t(c, "orgaoId"),
          criadoPor,
        })
      );
      return;
    case "situacao": {
      // A solicitação tem de ser DESTA audiência: o select já é contextual, mas quem confere é o servidor.
      const s = await cliente().solicitacaoDaAudiencia.findUnique({ where: { id: t(c, "solicitacaoId") }, select: { audienciaId: true } });
      if (s === null || s.audienciaId !== audienciaId) throw new Error("A solicitação escolhida não pertence a esta audiência. Nada foi gravado.");
      await comEscritaAutenticada("CADASTRAR_PPA", (criadoPor) =>
        registrarSituacaoDaSolicitacao(cliente(), {
          solicitacaoId: t(c, "solicitacaoId"),
          situacao: t(c, "situacao") as "EM_ANALISE",
          ...(t(c, "parecer") !== "" ? { parecer: t(c, "parecer") } : {}),
          criadoPor,
        })
      );
      return;
    }
    default:
      throw new Error(`Ação "${acao}" não existe na audiência pública.`);
  }
}
