import { cliente, PortaSemBancoError } from "./cliente";
import { comEscritaAutenticada, exigirSessao } from "./sessao";
import {
  acompanhamentoExterno,
  dossieDoProcesso,
  listarProcessos,
  type DossieDoProcesso,
  type FiltrosDaCaixa,
  type LinhaDaCaixa,
} from "../../modules/m21-protocolo/consultas";
import {
  apensarProcesso,
  abrirProcesso,
  arquivarProcesso,
  atenderReadequacao,
  complementarProcesso,
  desapensarProcesso,
  encerrarProcesso,
  reabrirProcesso,
  receberProcesso,
  responderParecer,
  solicitarParecer,
  solicitarReadequacao,
  tornarMovimentoSemEfeito,
  tramitar,
} from "../../modules/m21-protocolo/servico";
import { camposDoRegistro } from "../../modules/m25-campos-adicionais/consultas";
import { preencherCamposAdicionais } from "../../modules/m25-campos-adicionais/servico";

/**
 * PORTA — PROTOCOLO E PROCESSO DIGITAL (M21).
 *
 * ⚠️ A PORTA NÃO DECIDE NADA. Situação, prazo, sigilo, lotação e bloqueio por taxa são
 * do domínio, dentro da transação. Aqui só se lê e se chama — e é por isso que uma
 * requisição direta à Server Action encontra exatamente os mesmos guards que a tela.
 *
 * ⚠️ E O `criadoPor` VEM DA SESSÃO, nunca do formulário. `comEscritaAutenticada` injeta
 * o identificador do usuário logado: o campo "quem fez" não é preenchível pelo cliente.
 */

export { PortaSemBancoError };
export type { DossieDoProcesso, LinhaDaCaixa };

export interface OpcaoSimples {
  readonly id: string;
  readonly rotulo: string;
}

export interface AssuntoDaTela extends OpcaoSimples {
  readonly permiteAnonimo: boolean;
  readonly sigiloPadrao: boolean;
  readonly exigeTermo: boolean;
  readonly termo: string | null;
  readonly orientacao: string | null;
  readonly subassuntos: readonly OpcaoSimples[];
}

export interface CampoAdicionalDaTela {
  readonly codigo: string;
  readonly rotulo: string;
  readonly tipo: string;
  readonly obrigatorio: boolean;
  readonly valor: string;
  readonly ativo: boolean;
  readonly opcoes: readonly string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// LEITURAS
// ═══════════════════════════════════════════════════════════════════════════

export async function lerCaixaDeProcessos(
  filtros: FiltrosDaCaixa = {}
): Promise<readonly LinhaDaCaixa[]> {
  const sessao = await exigirSessao();
  return listarProcessos(cliente(), sessao.identificador, filtros);
}

export async function lerDossieDoProcesso(
  processoId: string
): Promise<DossieDoProcesso | null> {
  const sessao = await exigirSessao();
  return dossieDoProcesso(cliente(), processoId, sessao.identificador);
}

/**
 * ⚠️ A CONSULTA EXTERNA NÃO EXIGE SESSÃO — é o acompanhamento do requerente pelo número
 * e pelo código verificador (5.42.58). Ela devolve situação e movimentos, e NÃO o
 * instrutório: pareceres internos e anexos da administração ficam de fora.
 */
export async function lerAcompanhamentoExterno(
  exercicio: number,
  numero: number,
  verificador: string
): Promise<Awaited<ReturnType<typeof acompanhamentoExterno>>> {
  return acompanhamentoExterno(cliente(), exercicio, numero, verificador);
}

export async function lerAssuntos(): Promise<readonly AssuntoDaTela[]> {
  const assuntos = await cliente().assunto.findMany({
    where: { ativo: true },
    select: {
      id: true,
      codigo: true,
      nome: true,
      permiteAnonimo: true,
      sigiloPadrao: true,
      termoDeAceite: true,
      textoOrientacao: true,
      subassuntos: {
        where: { ativo: true },
        select: { id: true, codigo: true, nome: true },
        orderBy: { codigo: "asc" },
      },
    },
    orderBy: { codigo: "asc" },
  });

  return assuntos.map((a) => ({
    id: a.id,
    rotulo: `${a.codigo} — ${a.nome}`,
    permiteAnonimo: a.permiteAnonimo,
    sigiloPadrao: a.sigiloPadrao,
    exigeTermo: a.termoDeAceite !== null,
    termo: a.termoDeAceite,
    orientacao: a.textoOrientacao,
    subassuntos: a.subassuntos.map((s) => ({
      id: s.id,
      rotulo: `${s.codigo} — ${s.nome}`,
    })),
  }));
}

/**
 * OS SETORES EM QUE O USUÁRIO ESTÁ LOTADO — é o que o seletor de "abrir aqui" oferece.
 *
 * ⚠️ ELE NÃO OFERECE TODOS OS SETORES DO ENTE. Oferecer o que o servidor vai recusar é
 * a definição de uma tela que mente: o usuário escolhe, preenche o formulário inteiro e
 * só então descobre o limite.
 */
export async function lerMeusSetores(): Promise<readonly OpcaoSimples[]> {
  const sessao = await exigirSessao();
  const lotacoes = await cliente().usuarioDoSetor.findMany({
    where: { usuarioIdent: sessao.identificador },
    select: { setor: { select: { id: true, codigo: true, nome: true, ativo: true } } },
    orderBy: { setor: { codigo: "asc" } },
  });
  return lotacoes
    .filter((l) => l.setor.ativo)
    .map((l) => ({ id: l.setor.id, rotulo: `${l.setor.codigo} — ${l.setor.nome}` }));
}

/** Todos os setores ATIVOS — o destino de um trâmite pode ser qualquer um. */
export async function lerSetoresAtivos(): Promise<readonly OpcaoSimples[]> {
  const setores = await cliente().setor.findMany({
    where: { ativo: true },
    select: { id: true, codigo: true, nome: true },
    orderBy: { codigo: "asc" },
  });
  return setores.map((s) => ({ id: s.id, rotulo: `${s.codigo} — ${s.nome}` }));
}

export async function lerPessoasParaRequerente(): Promise<readonly OpcaoSimples[]> {
  const pessoas = await cliente().pessoa.findMany({
    select: {
      id: true,
      documento: true,
      versoes: { select: { nome: true, ativa: true }, orderBy: { criadoEm: "desc" }, take: 1 },
    },
    orderBy: { criadoEm: "desc" },
    take: 500,
  });
  return pessoas
    .filter((p) => p.versoes[0]?.ativa !== false)
    .map((p) => ({
      id: p.id,
      rotulo: `${p.versoes[0]?.nome ?? "(sem nome)"} — ${p.documento}`,
    }));
}

/** Os campos adicionais de um processo, com o valor vigente. */
export async function lerCamposDoProcesso(
  processoId: string
): Promise<readonly CampoAdicionalDaTela[]> {
  const p = await cliente().processo.findUnique({
    where: { id: processoId },
    select: { setorAbertura: { select: { unidadeOrcId: true } } },
  });
  if (p === null) return [];

  const campos = await camposDoRegistro(
    cliente(),
    "PROCESSO",
    processoId,
    p.setorAbertura.unidadeOrcId
  );
  return campos.map((c) => ({
    codigo: c.codigo,
    rotulo: c.rotulo,
    tipo: c.tipo,
    obrigatorio: c.obrigatorio,
    valor: c.valor,
    ativo: c.ativo,
    opcoes: c.opcoes,
  }));
}

export async function lerExerciciosAbertos(): Promise<readonly number[]> {
  const anos = await cliente().exercicio.findMany({
    where: { encerramento: null },
    select: { ano: true },
    orderBy: { ano: "desc" },
  });
  return anos.map((a) => a.ano);
}

// ═══════════════════════════════════════════════════════════════════════════
// ESCRITAS — o `criadoPor` vem da sessão, sempre
// ═══════════════════════════════════════════════════════════════════════════

export interface AbrirProcessoNaTela {
  readonly exercicio: number;
  readonly assuntoId: string;
  readonly subassuntoId?: string | undefined;
  readonly requerenteId?: string | undefined;
  readonly contatoAnonimo?: string | undefined;
  readonly finalidade: "ATENDIMENTO_AO_PUBLICO" | "INTERNO";
  readonly prioridade: "NORMAL" | "ALTA" | "URGENTE";
  readonly sigiloso: boolean;
  readonly documentacaoFisica: boolean;
  readonly textoAbertura: string;
  readonly setorAberturaId: string;
  readonly aceitouTermo: boolean;
}

export async function abrirProcessoNaTela(
  input: AbrirProcessoNaTela
): Promise<{ readonly processoId: string; readonly numero: number; readonly ano: number; readonly codigoVerificador: string }> {
  return comEscritaAutenticada("ABRIR_PROCESSO", (criadoPor) =>
    abrirProcesso(cliente(), { ...input, criadoPor })
  );
}

export async function tramitarNaTela(input: {
  readonly processoId: string;
  readonly setorDestinoId: string;
  readonly usuarioDestino?: string | undefined;
  readonly texto: string;
}): Promise<{ readonly alvos: number }> {
  return comEscritaAutenticada("TRAMITAR_PROCESSO", (criadoPor) =>
    tramitar(cliente(), { ...input, criadoPor })
  );
}

export async function receberNaTela(processoId: string): Promise<void> {
  await comEscritaAutenticada("RECEBER_PROCESSO", (criadoPor) =>
    receberProcesso(cliente(), { processoId, criadoPor })
  );
}

export async function complementarNaTela(input: {
  readonly processoId: string;
  readonly texto: string;
}): Promise<void> {
  await comEscritaAutenticada("COMPLEMENTAR_PROCESSO", (criadoPor) =>
    complementarProcesso(cliente(), { ...input, criadoPor })
  );
}

export async function solicitarParecerNaTela(input: {
  readonly processoId: string;
  readonly setorDestinoId: string;
  readonly texto: string;
}): Promise<void> {
  await comEscritaAutenticada("SOLICITAR_PARECER", (criadoPor) =>
    solicitarParecer(cliente(), { ...input, criadoPor })
  );
}

export async function responderParecerNaTela(input: {
  readonly processoId: string;
  readonly solicitacaoId: string;
  readonly texto: string;
}): Promise<void> {
  await comEscritaAutenticada("RESPONDER_PARECER", (criadoPor) =>
    responderParecer(cliente(), { ...input, criadoPor })
  );
}

export async function solicitarReadequacaoNaTela(input: {
  readonly processoId: string;
  readonly texto: string;
}): Promise<void> {
  await comEscritaAutenticada("SOLICITAR_READEQUACAO", (criadoPor) =>
    solicitarReadequacao(cliente(), { ...input, criadoPor })
  );
}

export async function atenderReadequacaoNaTela(input: {
  readonly processoId: string;
  readonly solicitacaoId: string;
  readonly texto: string;
}): Promise<void> {
  await comEscritaAutenticada("ATENDER_READEQUACAO", (criadoPor) =>
    atenderReadequacao(cliente(), { ...input, criadoPor })
  );
}

export async function encerrarNaTela(input: {
  readonly processoId: string;
  readonly texto: string;
}): Promise<void> {
  await comEscritaAutenticada("ENCERRAR_PROCESSO", (criadoPor) =>
    encerrarProcesso(cliente(), { ...input, criadoPor })
  );
}

export async function arquivarNaTela(input: {
  readonly processoId: string;
  readonly texto: string;
}): Promise<void> {
  await comEscritaAutenticada("ARQUIVAR_PROCESSO", (criadoPor) =>
    arquivarProcesso(cliente(), { ...input, criadoPor })
  );
}

export async function reabrirNaTela(input: {
  readonly processoId: string;
  readonly texto: string;
}): Promise<void> {
  await comEscritaAutenticada("REABRIR_PROCESSO", (criadoPor) =>
    reabrirProcesso(cliente(), { ...input, criadoPor })
  );
}

export async function apensarNaTela(input: {
  readonly processoPrincipalId: string;
  readonly processoApensoId: string;
  readonly motivo: string;
}): Promise<void> {
  await comEscritaAutenticada("APENSAR_PROCESSO", (criadoPor) =>
    apensarProcesso(cliente(), { ...input, criadoPor })
  );
}

export async function desapensarNaTela(input: {
  readonly processoPrincipalId: string;
  readonly processoApensoId: string;
  readonly motivo: string;
}): Promise<void> {
  await comEscritaAutenticada("DESAPENSAR_PROCESSO", (criadoPor) =>
    desapensarProcesso(cliente(), { ...input, criadoPor })
  );
}

export async function tornarSemEfeitoNaTela(input: {
  readonly processoId: string;
  readonly movimentoId: string;
  readonly motivo: string;
}): Promise<void> {
  await comEscritaAutenticada("TORNAR_MOVIMENTO_SEM_EFEITO", (criadoPor) =>
    tornarMovimentoSemEfeito(cliente(), { ...input, criadoPor })
  );
}

export async function preencherCamposNaTela(input: {
  readonly processoId: string;
  readonly valores: Record<string, string>;
}): Promise<{ readonly gravados: number; readonly apagados: number }> {
  return comEscritaAutenticada("PREENCHER_CAMPOS_ADICIONAIS", (criadoPor) =>
    preencherCamposAdicionais(cliente(), {
      cadastro: "PROCESSO",
      registroId: input.processoId,
      valores: input.valores,
      criadoPor,
    })
  );
}
