import { diaCivil } from "../../packages/datas/index.js";
import { agendaDaFiscalizacao, cancelarFiscalizacao, reagendarFiscalizacao, registrarRealizacaoDaFiscalizacao, type CompromissoNaAgenda, type SituacaoDoCompromisso } from "../../modules/m11-licitacoes/agenda-da-fiscalizacao.js";
import { cadastrarTipoDeOcorrencia, mudarSituacaoDoTipoDeOcorrencia, publicarVersaoDoTipoDeOcorrencia, tiposDeOcorrenciaDoEnte, type TipoDeResposta } from "../../modules/m11-licitacoes/formularios-de-ocorrencia.js";
import { contratosNoAlcanceDaFiscalizacao } from "../../modules/m11-licitacoes/acesso-da-fiscalizacao.js";
import { cliente } from "./cliente";
import { acoesPermitidas } from "./molde";
import { comEscritaAutenticada, type Identidade } from "./sessao";

/**
 * ═══ A AGENDA DA FISCALIZAÇÃO NA TELA (V7 M2 U8) ═══
 *
 * O RECORTE É DO SERVIDOR: a agenda só projeta os contratos que a pessoa alcança pela FISCALIZAÇÃO (designação vigente
 * ou administrador definido). Quem não alcança nenhum vê a agenda vazia com o motivo — não a agenda do ente.
 * As três vistas (dia, semana, mês) são a MESMA leitura com períodos diferentes, no calendário do ente.
 */

export type Vista = "dia" | "semana" | "mes";

const zeroPad = (n: number): string => String(n).padStart(2, "0");
const soma = (dia: string, dias: number): string => {
  const [a, m, d] = dia.split("-").map(Number) as [number, number, number];
  const x = new Date(Date.UTC(a, m - 1, d + dias));
  return `${x.getUTCFullYear()}-${zeroPad(x.getUTCMonth() + 1)}-${zeroPad(x.getUTCDate())}`;
};
const diaDaSemana = (dia: string): number => {
  const [a, m, d] = dia.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
};

/** O período da vista, sempre em dia civil: o dia; a semana de domingo a sábado; o mês inteiro. */
export function periodoDaVista(vista: Vista, dia: string): { readonly de: string; readonly ate: string } {
  if (vista === "dia") return { de: dia, ate: dia };
  if (vista === "semana") {
    const de = soma(dia, -diaDaSemana(dia));
    return { de, ate: soma(de, 6) };
  }
  const [a, m] = dia.split("-").map(Number) as [number, number];
  const de = `${a}-${zeroPad(m)}-01`;
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { de, ate: `${a}-${zeroPad(m)}-${zeroPad(ultimo)}` };
}

export interface AgendaNaTela {
  readonly vista: Vista;
  readonly dia: string;
  readonly de: string;
  readonly ate: string;
  readonly hoje: string;
  readonly compromissos: readonly CompromissoNaAgenda[];
  /** Os dias do período, para a grade da semana e do mês (o dia tem um só). */
  readonly dias: readonly { readonly dia: string; readonly compromissos: readonly CompromissoNaAgenda[] }[];
  readonly contratos: readonly { readonly valor: string; readonly rotulo: string }[];
  readonly fiscais: readonly { readonly valor: string; readonly rotulo: string }[];
  readonly filtros: { readonly contratoId: string; readonly fiscalUsuario: string; readonly situacao: string };
  readonly semAlcance: boolean;
  readonly podeProgramar: boolean;
  readonly podeRealizar: boolean;
}

export async function agendaParaTela(
  sessao: Identidade,
  opcoes: { readonly vista?: string; readonly dia?: string; readonly contratoId?: string; readonly fiscalUsuario?: string; readonly situacao?: string }
): Promise<AgendaNaTela> {
  const prisma = cliente();
  const hoje = diaCivil(new Date());
  const vista: Vista = opcoes.vista === "semana" || opcoes.vista === "mes" ? opcoes.vista : "dia";
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(opcoes.dia ?? "") ? (opcoes.dia as string) : hoje;
  const { de, ate } = periodoDaVista(vista, dia);
  const [alcance, permitidas] = await Promise.all([
    contratosNoAlcanceDaFiscalizacao(prisma, sessao.identificador),
    acoesPermitidas(["PROGRAMAR_FISCALIZACAO_DO_CONTRATO", "REGISTRAR_OCORRENCIA_DE_FISCALIZACAO"]),
  ]);
  // O administrador da fiscalização alcança todos; os demais, só os contratos em que têm designação vigente.
  const contratos = await prisma.contrato.findMany({
    where: alcance.todos ? {} : { id: { in: [...alcance.ids] } },
    orderBy: { numeroContrato: "asc" },
    take: 500,
    select: { id: true, numeroContrato: true, processo: { select: { objeto: true } } },
  });
  const ids = contratos.map((c) => c.id);
  const filtroContrato = opcoes.contratoId !== undefined && ids.includes(opcoes.contratoId) ? opcoes.contratoId : "";
  const situacao = ["PROGRAMADA", "REAGENDADA", "CANCELADA", "REALIZADA"].includes(opcoes.situacao ?? "") ? (opcoes.situacao as SituacaoDoCompromisso) : "";
  const compromissos = ids.length === 0 ? [] : await agendaDaFiscalizacao(prisma, {
    de, ate,
    contratoIds: filtroContrato === "" ? ids : [filtroContrato],
    ...(opcoes.fiscalUsuario === undefined || opcoes.fiscalUsuario === "" ? {} : { fiscalUsuario: opcoes.fiscalUsuario }),
    ...(situacao === "" ? {} : { situacoes: [situacao] }),
  });
  const dias: { dia: string; compromissos: CompromissoNaAgenda[] }[] = [];
  for (let d = de; d <= ate; d = soma(d, 1)) dias.push({ dia: d, compromissos: compromissos.filter((c) => c.data === d) });
  const fiscais = [...new Map(compromissos.map((c) => [c.fiscalUsuario, c.fiscal])).entries()].map(([valor, rotulo]) => ({ valor, rotulo }));
  return {
    vista, dia, de, ate, hoje, compromissos, dias,
    contratos: contratos.map((c) => ({ valor: c.id, rotulo: `${c.numeroContrato} — ${c.processo?.objeto ?? "sem processo"}` })),
    fiscais,
    filtros: { contratoId: filtroContrato, fiscalUsuario: opcoes.fiscalUsuario ?? "", situacao },
    semAlcance: ids.length === 0,
    podeProgramar: permitidas.has("PROGRAMAR_FISCALIZACAO_DO_CONTRATO"),
    podeRealizar: permitidas.has("REGISTRAR_OCORRENCIA_DE_FISCALIZACAO"),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// OS ATOS DA AGENDA E DOS TIPOS
// ═══════════════════════════════════════════════════════════════════════════════

type Campos = Readonly<Record<string, string>>;
const t = (c: Campos, k: string): string => (c[k] ?? "").trim();
const br = (dia: string): string => dia.split("-").reverse().join("/");
const numeroOpcional = (v: string): number | undefined => (v === "" ? undefined : Number(v.replace(/\D/g, "")));

export async function reagendarNaTela(c: Campos): Promise<string> {
  const duracao = numeroOpcional(t(c, "duracaoMinutos"));
  const r = await comEscritaAutenticada("PROGRAMAR_FISCALIZACAO_DO_CONTRATO", (criadoPor) =>
    reagendarFiscalizacao(cliente(), {
      ordemId: t(c, "ordemId"), dataPrevista: t(c, "dataPrevista"), motivo: t(c, "motivo"), criadoPor,
      ...(t(c, "horaInicio") === "" ? {} : { horaInicio: t(c, "horaInicio") }),
      ...(duracao === undefined ? {} : { duracaoMinutos: duracao }),
      ...(t(c, "local") === "" ? {} : { local: t(c, "local") }),
    })
  );
  return `Fiscalização nº ${r.numero} reagendada para ${br(r.data)}. O compromisso anterior e o motivo ficam no histórico.`;
}

export async function cancelarNaTela(c: Campos): Promise<string> {
  const r = await comEscritaAutenticada("PROGRAMAR_FISCALIZACAO_DO_CONTRATO", (criadoPor) => cancelarFiscalizacao(cliente(), { ordemId: t(c, "ordemId"), motivo: t(c, "motivo"), criadoPor }));
  return `Fiscalização nº ${r.numero} cancelada. Ela continua no histórico da agenda, com o motivo.`;
}

export async function realizarNaTela(c: Campos): Promise<string> {
  const r = await comEscritaAutenticada("REGISTRAR_OCORRENCIA_DE_FISCALIZACAO", (criadoPor) =>
    registrarRealizacaoDaFiscalizacao(cliente(), {
      ordemId: t(c, "ordemId"), data: t(c, "data"), relato: t(c, "relato"), criadoPor,
      ...(t(c, "horaInicio") === "" ? {} : { horaInicio: t(c, "horaInicio") }),
      ...(t(c, "horaFim") === "" ? {} : { horaFim: t(c, "horaFim") }),
    })
  );
  return `Realização da fiscalização nº ${r.numero} registrada. As ocorrências do que foi visto se registram à parte, ligadas a ela.`;
}

export interface TiposNaTela {
  readonly tipos: Awaited<ReturnType<typeof tiposDeOcorrenciaDoEnte>>;
  readonly podeGerir: boolean;
  readonly hoje: string;
}

export async function tiposParaTela(): Promise<TiposNaTela> {
  const [tipos, permitidas] = await Promise.all([tiposDeOcorrenciaDoEnte(cliente()), acoesPermitidas(["GERIR_TIPOS_DE_OCORRENCIA"])]);
  return { tipos, podeGerir: permitidas.has("GERIR_TIPOS_DE_OCORRENCIA"), hoje: diaCivil(new Date()) };
}

/** Os tipos ATIVOS com versão vigente hoje — é o que o formulário da ocorrência oferece. */
export async function tiposParaPreencher(): Promise<Awaited<ReturnType<typeof tiposDeOcorrenciaDoEnte>>> {
  return tiposDeOcorrenciaDoEnte(cliente(), { apenasAtivos: true });
}

export async function cadastrarTipoNaTela(c: Campos): Promise<string> {
  await comEscritaAutenticada("GERIR_TIPOS_DE_OCORRENCIA", (criadoPor) =>
    cadastrarTipoDeOcorrencia(cliente(), { codigo: t(c, "codigo").toUpperCase(), nome: t(c, "nome"), natureza: t(c, "natureza") as "OUTRO", criadoPor })
  );
  return `Tipo de ocorrência ${t(c, "codigo").toUpperCase()} cadastrado e ativo. Publique a primeira versão do formulário para usá-lo.`;
}

/** As perguntas chegam como `pergunta.<n>.<campo>`; a ordem é a do formulário. */
function perguntasDoFormulario(c: Campos): { readonly codigo: string; readonly rotulo: string; readonly tipoDeResposta: TipoDeResposta; readonly obrigatoria: boolean; readonly opcoes: readonly string[] }[] {
  const indices = [...new Set(Object.keys(c).filter((k) => k.startsWith("pergunta.")).map((k) => k.split(".")[1] ?? ""))].sort((a, b) => Number(a) - Number(b));
  return indices
    .filter((i) => t(c, `pergunta.${i}.rotulo`) !== "")
    .map((i) => ({
      codigo: t(c, `pergunta.${i}.codigo`) === "" ? `p${i}` : t(c, `pergunta.${i}.codigo`),
      rotulo: t(c, `pergunta.${i}.rotulo`),
      tipoDeResposta: (t(c, `pergunta.${i}.tipo`) || "TEXTO") as TipoDeResposta,
      obrigatoria: t(c, `pergunta.${i}.obrigatoria`) === "sim",
      opcoes: t(c, `pergunta.${i}.opcoes`).split(";").map((o) => o.trim()).filter((o) => o !== ""),
    }));
}

export async function publicarVersaoNaTela(c: Campos): Promise<string> {
  const perguntas = perguntasDoFormulario(c);
  if (perguntas.length === 0) throw new Error("Escreva ao menos uma pergunta do formulário. Nada foi gravado.");
  const r = await comEscritaAutenticada("GERIR_TIPOS_DE_OCORRENCIA", (criadoPor) =>
    publicarVersaoDoTipoDeOcorrencia(cliente(), {
      tipoId: t(c, "tipoId"), exigeGravidade: t(c, "exigeGravidade") === "sim", encaminhamentoPadrao: t(c, "encaminhamentoPadrao") === "GESTOR" ? "GESTOR" : "NENHUM",
      vigenciaInicio: t(c, "vigenciaInicio"), motivo: t(c, "motivo"), perguntas: perguntas.map((p) => ({ ...p, opcoes: [...p.opcoes] })), criadoPor,
    })
  );
  return `Versão ${r.versao} do formulário publicada com ${r.perguntas} pergunta(s), valendo a partir de ${br(t(c, "vigenciaInicio"))}. As ocorrências já preenchidas continuam na versão delas.`;
}

export async function mudarSituacaoDoTipoNaTela(c: Campos): Promise<string> {
  const r = await comEscritaAutenticada("GERIR_TIPOS_DE_OCORRENCIA", (criadoPor) => mudarSituacaoDoTipoDeOcorrencia(cliente(), { tipoId: t(c, "tipoId"), ativo: t(c, "ativo") === "sim", motivo: t(c, "motivo"), criadoPor }));
  return r.ativo ? "Tipo reativado: volta a ser oferecido em ocorrência nova." : "Tipo desativado: não é mais oferecido em ocorrência nova, e as anteriores continuam como estão.";
}
