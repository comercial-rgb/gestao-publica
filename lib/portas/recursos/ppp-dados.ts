import { diaCivilBr, meioDiaCivil } from "../../../packages/datas/index.js";
import { toMoney } from "../../../packages/contracts/index.js";
import type { Prisma } from "../../../prisma/generated/client/client.js";
import {
  cadastrarParceriaPublicoPrivada,
  empenhosDaParceria,
  informarParcelasDaParceria,
  lerLinhasDeParcelas,
  parcelasVigentesDaPpp,
  registrarSituacaoDaParceria,
  ROTULO_DA_SITUACAO_DA_PPP,
  ROTULO_DO_TIPO_DE_PPP,
  situacaoVigenteDaPpp,
} from "../../../modules/m11-licitacoes/parcerias-publico-privadas.js";
import type { ConsultaDoMolde } from "../../molde/consulta.js";
import { TAMANHO_DE_PAGINA } from "../../molde/consulta.js";
import type { LinhaDoHistorico } from "../../molde/tipos.js";
import { comEscritaAutenticada } from "../sessao";
import { cliente, PortaSemBancoError } from "../cliente";
import type { DetalheLido, PaginaDoMolde } from "./dados";
import { nomesDosCredores } from "../empenho";
import { temLeituraDoEnte } from "../leitura";

/**
 * V36 — OS DADOS DAS PARCERIAS PÚBLICO-PRIVADAS (TR 5.10.1.87-89). Nenhuma regra aqui: situação vigente, parcelas
 * vigentes e líquido dos empenhos saem do M11; a recusa do serviço sobe como veio. As páginas cobram
 * CONSULTAR_LICITACOES antes.
 */

export { PortaSemBancoError };

type Campos = Readonly<Record<string, string>>;
const t = (c: Campos, k: string): string => (c[k] ?? "").trim();

const rotuloDaSituacao = (s: string | null): string => (s === null ? "Sem situação registrada" : ROTULO_DA_SITUACAO_DA_PPP[s as keyof typeof ROTULO_DA_SITUACAO_DA_PPP] ?? s);

export async function listarPpps(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const prisma = cliente();
  const texto = (c.filtros["texto"] ?? "").trim();
  const where: Prisma.ContratoPPPWhereInput =
    texto === "" ? {} : { OR: [{ numero: { contains: texto, mode: "insensitive" } }, { parceiroPrivado: { contains: texto, mode: "insensitive" } }, { objeto: { contains: texto, mode: "insensitive" } }] };
  const [total, linhas] = await Promise.all([
    prisma.contratoPPP.count({ where }),
    prisma.contratoPPP.findMany({
      where,
      orderBy: [{ numero: c.direcao }],
      skip: (c.pagina - 1) * TAMANHO_DE_PAGINA,
      take: TAMANHO_DE_PAGINA,
      select: { id: true, numero: true, parceiroPrivado: true, tipo: true, vigenciaInicio: true, vigenciaFim: true, valorGlobal: true, situacoes: { select: { id: true, situacao: true, data: true, criadoEm: true } } },
    }),
  ]);
  return {
    total,
    linhas: linhas.map((p) => ({
      id: p.id,
      numero: p.numero,
      parceiro: p.parceiroPrivado,
      tipo: p.tipo === null ? "Não informado" : (ROTULO_DO_TIPO_DE_PPP[p.tipo] ?? p.tipo),
      situacao: rotuloDaSituacao(situacaoVigenteDaPpp(p.situacoes)),
      vigencia: `${diaCivilBr(p.vigenciaInicio)} a ${diaCivilBr(p.vigenciaFim)}`,
      valorGlobal: p.valorGlobal.toFixed(2),
    })),
  };
}

export interface PppLida extends DetalheLido {
  readonly parcelas: readonly { readonly ano: number; readonly valor: string }[];
  readonly totalDasParcelas: string;
  readonly empenhos: readonly { readonly id: string; readonly numero: string; readonly data: string; readonly credor: string; readonly valor: string; readonly liquido: string }[];
  readonly totalEmpenhado: string;
  /** Os empenhos são dado da DESPESA: sem a consulta dela no ente, a tela diz o motivo em vez de listá-los. */
  readonly motivoSemEmpenhos: string | null;
}

export async function verPpp(id: string): Promise<PppLida | null> {
  const prisma = cliente();
  const p = await prisma.contratoPPP.findUnique({
    where: { id },
    select: {
      numero: true, objeto: true, parceiroPrivado: true, tipo: true, vigenciaInicio: true, vigenciaFim: true, valorGlobal: true, contraprestacaoAnual: true, criadoEm: true, criadoPor: true,
      situacoes: { orderBy: [{ data: "asc" }, { criadoEm: "asc" }], select: { id: true, situacao: true, data: true, motivo: true, criadoEm: true, criadoPor: true } },
      parcelas: { orderBy: [{ ano: "asc" }, { criadoEm: "asc" }], select: { id: true, ano: true, valor: true, criadoEm: true, criadoPor: true } },
    },
  });
  if (p === null) return null;
  const situacao = situacaoVigenteDaPpp(p.situacoes);
  const parcelas = parcelasVigentesDaPpp(p.parcelas.map((x) => ({ ...x, valor: toMoney(x.valor.toFixed(2)) })));
  const totalDasParcelas = parcelas.reduce((a, x) => toMoney(a.plus(x.valor)), toMoney("0.00"));
  // ⚠️ A PÁGINA COBRA SÓ A LEITURA DE LICITAÇÕES; número, credor e valor de empenho são da despesa (achado da
  // auditoria da V36). Sem CONSULTAR_DESPESA no ente, nem a lista nem o total.
  const leDespesa = await temLeituraDoEnte("CONSULTAR_DESPESA");
  const empenhos = leDespesa ? await empenhosDaParceria(prisma, id) : [];
  const nomes = await nomesDosCredores([...new Set(empenhos.map((e) => e.credorCpfCnpj))]);
  const totalEmpenhado = empenhos.reduce((a, e) => toMoney(a.plus(e.liquido)), toMoney("0.00"));
  const linha = (lid: string, oQue: string, quando: Date, registrado: Date, por: string, motivo: string | null, valor?: string): LinhaDoHistorico => ({
    id: lid, oQue, quando: diaCivilBr(quando), registradoEm: diaCivilBr(registrado), por, motivo, ...(valor !== undefined ? { valor } : {}),
  });
  const historico: LinhaDoHistorico[] = [
    ...p.situacoes.map((s) => linha(s.id, `Situação: ${rotuloDaSituacao(s.situacao)}`, s.data, s.criadoEm, s.criadoPor, s.motivo)),
    ...p.parcelas.map((x) => linha(x.id, `Parcela de ${String(x.ano)} informada`, x.criadoEm, x.criadoEm, x.criadoPor, null, x.valor.toFixed(2))),
  ];
  return {
    titulo: `Parceria ${p.numero}`,
    subtitulo: `${p.parceiroPrivado} · ${diaCivilBr(p.vigenciaInicio)} a ${diaCivilBr(p.vigenciaFim)}`,
    selos: [
      { texto: rotuloDaSituacao(situacao), tom: situacao === "EM_EXECUCAO" ? "ok" : situacao === "RESCINDIDA" ? "erro" : "neutro" },
      ...(leDespesa ? [{ texto: `${String(empenhos.length)} empenho(s)`, tom: "neutro" as const }] : []),
    ],
    dados: [
      { rotulo: "Contrato", valor: p.numero },
      { rotulo: "Tipo da parceria", valor: p.tipo === null ? "Não informado" : (ROTULO_DO_TIPO_DE_PPP[p.tipo] ?? p.tipo) },
      { rotulo: "Situação", valor: rotuloDaSituacao(situacao) },
      { rotulo: "Empresa parceira", valor: p.parceiroPrivado },
      { rotulo: "Objeto", valor: p.objeto },
      { rotulo: "Vigência", valor: `${diaCivilBr(p.vigenciaInicio)} a ${diaCivilBr(p.vigenciaFim)}` },
      { rotulo: "Valor global", valor: p.valorGlobal.toFixed(2), tipo: "dinheiro" },
      { rotulo: "Contraprestação anual", valor: p.contraprestacaoAnual.toFixed(2), tipo: "dinheiro" },
      { rotulo: "Cadastrada por", valor: p.criadoPor },
    ],
    historico,
    parcelas: parcelas.map((x) => ({ ano: x.ano, valor: x.valor.toFixed(2) })),
    totalDasParcelas: totalDasParcelas.toFixed(2),
    empenhos: empenhos.map((e) => ({ id: e.id, numero: e.numero, data: diaCivilBr(e.data), credor: nomes.get(e.credorCpfCnpj) ?? e.credorCpfCnpj, valor: e.valor.toFixed(2), liquido: e.liquido.toFixed(2) })),
    totalEmpenhado: totalEmpenhado.toFixed(2),
    motivoSemEmpenhos: leDespesa ? null : "Os empenhos da parceria pedem a consulta da despesa no ente inteiro, que o seu perfil não tem.",
  };
}

export async function criarPpp(c: Campos): Promise<void> {
  await comEscritaAutenticada("CADASTRAR_CONTRATO", (criadoPor) =>
    cadastrarParceriaPublicoPrivada(cliente(), {
      numero: t(c, "numero"),
      objeto: t(c, "objeto"),
      parceiroPrivado: t(c, "parceiroPrivado"),
      tipo: t(c, "tipo") as "PATROCINADA",
      vigenciaInicio: meioDiaCivil(t(c, "vigenciaInicio")),
      vigenciaFim: meioDiaCivil(t(c, "vigenciaFim")),
      valorGlobal: t(c, "valorGlobal"),
      contraprestacaoAnual: t(c, "contraprestacaoAnual"),
      criadoPor,
    })
  );
}

export async function acaoDaPpp(acao: string, contratoPppId: string, c: Campos): Promise<void> {
  switch (acao) {
    case "situacao":
      await comEscritaAutenticada("CADASTRAR_CONTRATO", (criadoPor) =>
        registrarSituacaoDaParceria(cliente(), {
          contratoPppId,
          situacao: t(c, "situacao") as "EM_EXECUCAO",
          data: meioDiaCivil(t(c, "data")),
          motivo: t(c, "motivo"),
          criadoPor,
        })
      );
      return;
    case "parcelas": {
      const lidas = lerLinhasDeParcelas(c["linhas"] ?? "");
      if (lidas.erros.length > 0) throw new Error(`Nada foi gravado. Corrija: ${lidas.erros.join("; ")}.`);
      await comEscritaAutenticada("CADASTRAR_CONTRATO", (criadoPor) =>
        informarParcelasDaParceria(cliente(), { contratoPppId, parcelas: [...lidas.parcelas], criadoPor })
      );
      return;
    }
    default:
      throw new Error(`Ação "${acao}" não existe na parceria público-privada.`);
  }
}
