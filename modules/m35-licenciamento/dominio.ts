import type { ModuloComercial } from "./modulos.js";
import { moduloDoCatalogo, nomeDoModulo } from "./modulos.js";

/**
 * M35 — A DECISÃO DE LICENCIAMENTO, PURA. Sem Prisma, sem relógio, sem sessão.
 *
 * ═══ ⚠️ QUATRO SITUAÇÕES, E A DIFERENÇA ENTRE ELAS É O PRODUTO INTEIRO ═══
 *
 *   · `HABILITADO`      — contratado e vigente hoje. Lê e escreve.
 *   · `SUSPENSO`        — contratado e suspenso por ato do fornecedor. **Lê, não escreve.**
 *   · `FORA_DE_VIGENCIA`— contratado, com vigência que ainda não começou ou já terminou.
 *                          **Lê, não escreve.**
 *   · `NAO_CONTRATADO`  — nunca esteve no contrato. Não lê e não escreve.
 *
 * ⚠️ A SEPARAÇÃO "LÊ, NÃO ESCREVE" NÃO É GENEROSIDADE COMERCIAL — é obrigação. Suspender um
 * módulo não apaga fato nenhum: o empenho continua empenhado, o processo continua
 * protocolado, o documento continua emitido. O ente segue obrigado a prestar contas do que
 * já fez, e o cidadão segue com direito de consultar o que já foi publicado. O que a
 * suspensão impede é OPERAÇÃO NOVA. Um gate que derrubasse a leitura junto transformaria uma
 * pendência comercial em apagamento de escrituração pública.
 *
 * ⚠️ E `NAO_CONTRATADO` FECHA OS DOIS LADOS de propósito: não há fato histórico para
 * preservar num módulo que nunca funcionou nesta implantação, e deixar a tela abrir vazia
 * ensinaria que a funcionalidade existe e está quebrada.
 *
 * ⚠️ A TRANSPARÊNCIA PÚBLICA NÃO PASSA POR AQUI. As rotas de `app/(publico)/` não têm sessão
 * e não chamam as portas autenticadas — por desenho, não por exceção. Uma suspensão não
 * derruba o portal que já está no ar; ver `docs/lotes/V10-...`, seção 4.
 */

export type SituacaoDoModulo =
  | "HABILITADO"
  | "SUSPENSO"
  | "FORA_DE_VIGENCIA"
  | "NAO_CONTRATADO";

/** O que o gate faz com cada situação. Duas perguntas separadas, e nunca uma só. */
export function podeEscrever(s: SituacaoDoModulo): boolean {
  return s === "HABILITADO";
}

export function podeLer(s: SituacaoDoModulo): boolean {
  return s !== "NAO_CONTRATADO";
}

/** A situação registrada de um módulo dentro de um contrato — o dado cru da tabela. */
export interface HabilitacaoRegistrada {
  readonly modulo: ModuloComercial;
  /** `true` enquanto o fornecedor não suspendeu. A vigência é outra pergunta. */
  readonly ativa: boolean;
  /** Dia civil do ente, "AAAA-MM-DD". */
  readonly inicio: string;
  /** Dia civil do ente, "AAAA-MM-DD", ou `null` para vigência sem termo. */
  readonly fim: string | null;
}

export interface ContratoVigente {
  readonly numero: string;
  readonly ativo: boolean;
  readonly inicio: string;
  readonly fim: string | null;
}

/**
 * ⚠️ A COMPARAÇÃO É DE DIA CIVIL, EM TEXTO — e é assim de propósito. "AAAA-MM-DD" ordena
 * lexicograficamente igual à ordem cronológica, e o texto não tem fuso para errar. Guardar
 * `DateTime` e comparar com `new Date()` é exatamente o defeito que o guard `data-civil`
 * deste repositório já acusou duas vezes: às 21h do último dia de vigência, em UTC, o
 * contrato já teria vencido para um ente que ainda está no dia anterior.
 */
export function dentroDaVigencia(hoje: string, inicio: string, fim: string | null): boolean {
  if (hoje < inicio) return false;
  if (fim !== null && hoje > fim) return false;
  return true;
}

export interface EntradaDaDecisao {
  readonly modulo: ModuloComercial;
  readonly hoje: string;
  readonly contrato: ContratoVigente | null;
  readonly habilitacoes: readonly HabilitacaoRegistrada[];
}

/**
 * A SITUAÇÃO DE UM MÓDULO, hoje.
 *
 * ⚠️ A PLATAFORMA É SEMPRE `HABILITADO`, e antes de qualquer consulta ao contrato. Sem isso,
 * um contrato mal configurado tiraria do município a administração dos próprios usuários — e
 * a saída seria mexer no banco à mão, que é o oposto do que este módulo existe para permitir.
 */
export function situacaoDoModulo(e: EntradaDaDecisao): SituacaoDoModulo {
  if (!moduloDoCatalogo(e.modulo).licenciavel) return "HABILITADO";
  if (e.contrato === null) return "NAO_CONTRATADO";

  const h = e.habilitacoes.find((x) => x.modulo === e.modulo);
  if (h === undefined) return "NAO_CONTRATADO";

  // ⚠️ O CONTRATO ENCERRADO NÃO APAGA A HABILITAÇÃO: ele a põe fora de vigência. A diferença
  // importa porque `NAO_CONTRATADO` fecha a leitura, e um ente cujo contrato acabou continua
  // com o direito — e o dever — de ler o que escriturou enquanto ele valia.
  if (!e.contrato.ativo) return "FORA_DE_VIGENCIA";
  if (!dentroDaVigencia(e.hoje, e.contrato.inicio, e.contrato.fim)) return "FORA_DE_VIGENCIA";
  if (!h.ativa) return "SUSPENSO";
  if (!dentroDaVigencia(e.hoje, h.inicio, h.fim)) return "FORA_DE_VIGENCIA";
  return "HABILITADO";
}

/**
 * AS DEPENDÊNCIAS QUE FALTAM para habilitar um módulo — nomeadas, nunca habilitadas.
 *
 * ⚠️ HABILITAR EM CASCATA SERIA ENTREGAR MÓDULO NÃO CONTRATADO. Se "Compras" depende do
 * núcleo contábil e o município não contratou o núcleo, a resposta certa é recusar dizendo
 * qual contrato falta — e não ligar o núcleo por tabela, de graça, porque o código precisava.
 */
export function dependenciasFaltantes(
  modulo: ModuloComercial,
  jaContratados: readonly ModuloComercial[]
): readonly ModuloComercial[] {
  return moduloDoCatalogo(modulo).depende.filter((d) => !jaContratados.includes(d));
}

/**
 * QUEM DEPENDE DESTE — para recusar a suspensão que deixaria um módulo contratado sem base.
 */
export function dependentesContratados(
  modulo: ModuloComercial,
  contratadosEAtivos: readonly ModuloComercial[]
): readonly ModuloComercial[] {
  return contratadosEAtivos.filter(
    (m) => m !== modulo && moduloDoCatalogo(m).depende.includes(modulo)
  );
}

/**
 * ═══ AS MENSAGENS DA RECUSA — cada situação pede uma PROVIDÊNCIA diferente ═══
 *
 * ⚠️ "Acesso negado" seria a resposta errada nas quatro. Quem resolve `NAO_CONTRATADO` é o
 * fornecedor, com um aditivo comercial; quem resolve `SUSPENSO` é o fornecedor, reativando;
 * `FORA_DE_VIGENCIA` é prazo, e pode ser só uma renovação atrasada. Mandar as três com o
 * mesmo texto faz o servidor público abrir chamado na fila errada — e, pior, faz o
 * administrador do ente procurar uma permissão que não é o problema.
 */
export function motivoDaRecusa(
  modulo: ModuloComercial,
  situacao: SituacaoDoModulo,
  acao: string
): string {
  const nome = nomeDoModulo(modulo);
  if (situacao === "NAO_CONTRATADO") {
    return (
      `MÓDULO NÃO CONTRATADO: "${nome}" não faz parte do contrato desta implantação, e por ` +
      `isso ${acao} não está disponível aqui. Isto NÃO é falta de permissão do seu usuário — ` +
      `nenhuma permissão abre um módulo que não foi contratado. Quem resolve é a contratação ` +
      `do módulo junto ao fornecedor. Nada foi gravado.`
    );
  }
  if (situacao === "SUSPENSO") {
    return (
      `MÓDULO SUSPENSO: "${nome}" está contratado e com a habilitação SUSPENSA, então ${acao} ` +
      `não pode ser executado agora. A consulta ao que já foi registrado continua disponível — ` +
      `suspender não apaga fato, e o ente segue podendo prestar contas do que fez. Quem ` +
      `resolve é a reativação junto ao fornecedor. Nada foi gravado.`
    );
  }
  if (situacao === "FORA_DE_VIGENCIA") {
    return (
      `MÓDULO FORA DE VIGÊNCIA: a habilitação de "${nome}" não está vigente na data de hoje, ` +
      `então ${acao} não pode ser executado. A consulta ao que já foi registrado continua ` +
      `disponível. Quem resolve é a renovação ou a correção da vigência junto ao fornecedor. ` +
      `Nada foi gravado.`
    );
  }
  return `MÓDULO "${nome}" habilitado — esta mensagem não deveria ser lida.`;
}
