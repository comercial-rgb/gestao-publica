import { cliente } from "./cliente";
import { exigirSessao } from "./sessao";
import { estadoDoModoBb } from "../../modules/m17-banco-bb/modos";

/**
 * PORTA — CENTRAL DE INTEGRAÇÕES (S6). Agrega o estado dos 4 canais para o hub `/integracoes`. Só
 * LEITURA. Cada card mostra o MODO vigente, o último evento (RegistroDeOperacao/ExecucaoCaptura), o
 * hash do último pacote quando houver, e a ação principal — ou o BLOQUEIO NOMEADO (DIRETIVA §3).
 */

export type EstadoCard = "OPERACIONAL" | "SIMULACAO" | "BLOQUEADO_DOCUMENTO" | "AGUARDANDO_CREDENCIAL";

export interface CardIntegracao {
  readonly chave: string;
  readonly titulo: string;
  readonly descricao: string;
  /** O modo vigente, exibido como badge permanente. */
  readonly modo: string;
  readonly estado: EstadoCard;
  /** Última operação registrada (texto curto) ou null. */
  readonly ultimoEvento: string | null;
  /** Hash do último pacote/payload, quando houver. */
  readonly hash: string | null;
  readonly acaoHref: string | null;
  readonly acaoRotulo: string | null;
  /** Quando BLOQUEADO_DOCUMENTO: o documento exato que falta (o bloqueio nomeado é o conteúdo). */
  readonly detalhe: string | null;
}

function resumoOperacao(op: { acao: string; detalhe: string | null; criadoEm: Date } | null): string | null {
  if (op === null) return null;
  const quando = op.criadoEm.toISOString().slice(0, 16).replace("T", " ");
  return `${quando} · ${op.acao}${op.detalhe !== null ? ` — ${op.detalhe.slice(0, 80)}` : ""}`;
}

export async function montarCentralIntegracoes(): Promise<readonly CardIntegracao[]> {
  await exigirSessao();
  const prisma = cliente();

  // Últimos eventos por canal (RegistroDeOperacao) + a última submissão do Captura.
  const [opSagres, opCaptura, opTce, ultimaCaptura] = await Promise.all([
    prisma.registroDeOperacao.findFirst({ where: { acao: "IMPORTAR_EXTRATO" }, orderBy: { criadoEm: "desc" }, select: { acao: true, detalhe: true, criadoEm: true } }),
    prisma.registroDeOperacao.findFirst({ where: { acao: "SUBMETER_CAPTURA" }, orderBy: { criadoEm: "desc" }, select: { acao: true, detalhe: true, criadoEm: true } }),
    prisma.registroDeOperacao.findFirst({ where: { acao: "CONSULTAR_TCE" }, orderBy: { criadoEm: "desc" }, select: { acao: true, detalhe: true, criadoEm: true } }),
    prisma.execucaoCaptura.findFirst({ orderBy: { criadoEm: "desc" }, select: { estado: true, modo: true, hashPayload: true } }),
  ]);

  const bbSandbox = estadoDoModoBb("SANDBOX");

  return [
    {
      chave: "sagres",
      titulo: "SAGRES 2026 — TXT",
      descricao: "Arquivos diário e mensal em largura fixa, validados e empacotados (ZIP + manifesto SHA-256).",
      modo: "GERAÇÃO LOCAL",
      estado: "OPERACIONAL",
      ultimoEvento: resumoOperacao(opSagres),
      hash: null,
      acaoHref: "/integracoes/sagres?dia=2026-07-15",
      acaoRotulo: "Abrir SAGRES TXT",
      detalhe: null,
    },
    {
      chave: "captura",
      titulo: "SAGRES Captura 2.0 — JSON",
      descricao: "Mesma massa em JSON, validada contra o schema oficial e simulada (MOCK → SIMULATED).",
      modo: "MOCK",
      estado: "SIMULACAO",
      ultimoEvento: resumoOperacao(opCaptura),
      hash: ultimaCaptura?.hashPayload ?? null,
      acaoHref: "/integracoes/captura",
      acaoRotulo: "Abrir Captura 2.0",
      detalhe: null,
    },
    {
      chave: "bb",
      titulo: "Banco do Brasil",
      descricao: "Extrato e saldo (leitura). Agência/conta mascaradas na UI e no log; nenhuma chamada financeira.",
      modo: "MOCK",
      estado: bbSandbox.estado === "DISPONIVEL" ? "OPERACIONAL" : "AGUARDANDO_CREDENCIAL",
      ultimoEvento: resumoOperacao(opSagres), // o extrato BB entra pela importação (IMPORTAR_EXTRATO)
      hash: null,
      // O card do BB não tinha ação — e o hub do Financeiro mandava o usuário para cá atrás dela.
      // A ação existe: é a CONCILIAÇÃO (M09 bloco 3), que mora no Financeiro porque a pergunta que
      // ela responde ("o banco e o razão batem?") é de tesouraria, não de canal.
      acaoHref: "/financeiro/conciliacao",
      acaoRotulo: "Abrir conciliação bancária",
      detalhe: `SANDBOX: ${bbSandbox.mensagem} · LIVE: bloqueado (DIRETIVA §4).`,
    },
    {
      chave: "apitce",
      titulo: "API de Consulta TCE-PB",
      descricao: "Gateway de consulta (UG/período) — comparação dados locais × TCE.",
      modo: "MOCK",
      estado: "SIMULACAO",
      ultimoEvento: resumoOperacao(opTce),
      hash: null,
      acaoHref: "/integracoes/tce",
      acaoRotulo: "Comparar local × TCE",
      // Recorte 3/32 rotas (dotacoes/empenhos/pagamentos); SANDBOX/LIVE exigem token do TCE.
      detalhe:
        "Fixtures conformes ao OpenAPI oficial (openapi-sagrescaptura.json). Recorte da demo: 3 de 32 rotas. " +
        "SANDBOX/LIVE exigem token (por configuração) — respondem CREDENTIAL_NOT_CONFIGURED, sem fallback.",
    },
  ];
}
