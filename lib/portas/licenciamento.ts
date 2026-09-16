import { cliente, PortaSemBancoError } from "./cliente.js";
import { ID_DO_ENTE_UNICO } from "../../modules/m01-core-contabil/contexto-do-ente.js";
import type { AcaoDoSistema } from "../../modules/m16-travamento/acoes.js";
import {
  MODULOS_LICENCIAVEIS,
  MODULO_DA_ACAO,
  moduloDoCatalogo,
  nomeDoModulo,
  type ModuloComercial,
} from "../../modules/m35-licenciamento/modulos.js";
import {
  motivoDaRecusa,
  podeEscrever,
  podeLer,
  type SituacaoDoModulo,
} from "../../modules/m35-licenciamento/dominio.js";
import {
  lerLicenciamento,
  licenciamentoInstalado,
  situacaoDoModuloNaImplantacao,
  type LicenciamentoDaImplantacao,
} from "../../modules/m35-licenciamento/servico.js";

/**
 * ═══ PORTA — O GATE DE LICENCIAMENTO (V10 T1 · N6.1) ═══
 *
 * ⚠️ ELE MORA NOS DOIS FUNIS QUE JÁ EXISTEM, e não numa checagem espalhada por tela:
 *   · `comEscritaAutenticada` (lib/portas/sessao.ts) — TODA escrita da interface passa por
 *     ele, e há guard (`m16-borda-execucao.test.ts`) provando que passa. Rota, formulário,
 *     job e exportação com efeito entram pelo mesmo lugar;
 *   · a política de leitura (lib/portas/leitura.ts) — toda tela protegida declara a ação de
 *     leitura da área, e há grep-teste provando que declara.
 *
 * Pendurar o gate em cada `page.tsx` seria a enumeração que este repositório já pagou para
 * aprender a não fazer: "uma estimativa de dez sítios virou cinquenta e sete".
 *
 * ═══ ⚠️ TRÊS RECUSAS DIFERENTES, E NENHUMA É "ACESSO NEGADO" ═══
 *   · `LicenciamentoIndisponivelError` — o BANCO não respondeu. NÃO é problema comercial, e
 *     dizer "módulo não contratado" aqui faria o município ligar para o setor errado;
 *   · `LicenciamentoNaoInstaladoError` — não há contrato nenhum nesta implantação. É estado
 *     de INSTALAÇÃO incompleta, e a mensagem nomeia o comando que o resolve;
 *   · `ModuloNaoHabilitadoError` — há contrato, e este módulo não está vigente nele.
 *
 * ⚠️ E O QUE O GATE **NÃO** FAZ: não substitui permissão, não substitui escopo de unidade e
 * não substitui período aberto. Ele é uma quarta pergunta, anterior às outras três —
 * "isto foi contratado?" — e as três continuam sendo feitas depois.
 */

export class LicenciamentoIndisponivelError extends Error {
  constructor(causa: unknown) {
    super(
      `SERVIÇO INDISPONÍVEL: não foi possível consultar o contrato desta implantação porque o ` +
        `banco de dados não respondeu. ⚠️ Isto NÃO é falta de contratação nem falta de ` +
        `permissão: é indisponibilidade. Tente novamente em instantes; se persistir, é caso de ` +
        `suporte técnico, não comercial. Nada foi gravado.` +
        (causa instanceof Error ? `\n  causa: ${causa.message}` : "")
    );
    this.name = "LicenciamentoIndisponivelError";
  }
}

export class LicenciamentoNaoInstaladoError extends Error {
  constructor() {
    super(
      `LICENCIAMENTO NÃO INSTALADO: esta implantação não tem contrato comercial registrado, e ` +
        `sem contrato o sistema não libera módulo nenhum — liberar "porque a configuração ` +
        `falta" faria de apagar a tabela o caminho para usar tudo de graça, em silêncio.\n` +
        `  quem resolve: quem opera esta instalação, executando ` +
        `\`npm run licenciamento:instalar\` uma vez. Ele registra o contrato a partir dos ` +
        `módulos que esta instalação já usa, com autor e data.\n` +
        `  a administração de usuários, os cadastros e o suporte continuam abertos: eles são ` +
        `plataforma e não se contratam. Nada foi gravado.`
    );
    this.name = "LicenciamentoNaoInstaladoError";
  }
}

export class ModuloNaoHabilitadoError extends Error {
  readonly modulo: ModuloComercial;
  readonly situacao: SituacaoDoModulo;
  constructor(modulo: ModuloComercial, situacao: SituacaoDoModulo, oQue: string) {
    super(motivoDaRecusa(modulo, situacao, oQue));
    this.name = "ModuloNaoHabilitadoError";
    this.modulo = modulo;
    this.situacao = situacao;
  }
}

export function ehRecusaDeLicenca(e: unknown): e is ModuloNaoHabilitadoError | LicenciamentoNaoInstaladoError {
  return e instanceof ModuloNaoHabilitadoError || e instanceof LicenciamentoNaoInstaladoError;
}

/**
 * ⚠️ OS RÓTULOS DE ENVELOPE QUE NÃO SÃO AÇÃO DO CENSO — declarados um a um.
 *
 * `comEscritaAutenticada` recebe uma `string`, e há UM chamador que passa um rótulo que não é
 * ação do censo: a aplicação de uma atualização versionada de permissões (o domínio dela cobra
 * `CONCEDER_ACAO_A_PERFIL`; o rótulo existe para a auditoria distinguir o ato). Ele é
 * PLATAFORMA — administrar permissões não se contrata.
 *
 * ⚠️ E A LISTA É FECHADA: um rótulo novo, não declarado, ESTOURA. Devolver "plataforma" para o
 * desconhecido seria a gaveta de sobra que deixa passar, calada, a ação que ninguém
 * classificou — exatamente o que o `Record` exaustivo do catálogo existe para impedir.
 */
const ROTULOS_DE_PLATAFORMA: readonly string[] = ["APLICAR_ATUALIZACAO_DE_PERMISSOES"];

export function moduloDoRotuloDaBorda(acao: string): ModuloComercial {
  const m = MODULO_DA_ACAO[acao as AcaoDoSistema];
  if (m !== undefined) return m;
  if (ROTULOS_DE_PLATAFORMA.includes(acao)) return "PLATAFORMA";
  throw new Error(
    `RÓTULO DE ESCRITA NÃO CLASSIFICADO: "${acao}" chegou ao envelope de escrita e não é ação ` +
      `do censo do M16 nem rótulo declarado em \`ROTULOS_DE_PLATAFORMA\`. Sem classificação, o ` +
      `gate de licenciamento não sabe a que módulo comercial o ato pertence — e liberar o ` +
      `desconhecido seria entregar de graça o que ninguém classificou. Acrescente a ação ao ` +
      `censo, ou declare o rótulo com o motivo. Nada foi gravado.`
  );
}

/** A situação de um módulo nesta implantação, traduzindo a falha de banco para o erro certo. */
export async function situacaoDoModuloAqui(modulo: ModuloComercial): Promise<SituacaoDoModulo> {
  if (!moduloDoCatalogo(modulo).licenciavel) return "HABILITADO";
  try {
    const prisma = cliente();
    if (!(await licenciamentoInstalado(prisma, ID_DO_ENTE_UNICO))) {
      throw new LicenciamentoNaoInstaladoError();
    }
    return await situacaoDoModuloNaImplantacao(prisma, ID_DO_ENTE_UNICO, modulo);
  } catch (e) {
    if (e instanceof LicenciamentoNaoInstaladoError) throw e;
    if (e instanceof PortaSemBancoError) throw new LicenciamentoIndisponivelError(e);
    throw new LicenciamentoIndisponivelError(e);
  }
}

/**
 * O GATE DA ESCRITA — chamado pelo envelope, antes do ato.
 *
 * ⚠️ ANTES DO ATO, e não depois: a regra "efeito colateral antes da guarda envenena a tentativa
 * seguinte" vale aqui como em qualquer outra guarda. O envelope já registra a tentativa; o que
 * não pode acontecer é o fato ser gravado e a licença conferida em seguida.
 */
export async function exigirModuloParaEscrita(acao: string): Promise<void> {
  const modulo = moduloDoRotuloDaBorda(acao);
  if (!moduloDoCatalogo(modulo).licenciavel) return;
  const situacao = await situacaoDoModuloAqui(modulo);
  if (!podeEscrever(situacao)) throw new ModuloNaoHabilitadoError(modulo, situacao, `executar ${acao}`);
}

/**
 * O GATE DA LEITURA — mais frouxo que o da escrita, e de propósito.
 *
 * ⚠️ SUSPENSO E FORA DE VIGÊNCIA CONTINUAM LENDO. Suspender um módulo não apaga o empenho, o
 * processo nem o documento; o ente segue obrigado a prestar contas do que já fez, e o cidadão
 * segue com direito de consultar o que já foi publicado. O que a suspensão impede é operação
 * NOVA. Só `NAO_CONTRATADO` fecha a leitura — não há fato histórico a preservar num módulo que
 * nunca funcionou aqui.
 */
export async function exigirModuloParaLeitura(acao: string): Promise<void> {
  const modulo = moduloDoRotuloDaBorda(acao);
  if (!moduloDoCatalogo(modulo).licenciavel) return;
  const situacao = await situacaoDoModuloAqui(modulo);
  if (!podeLer(situacao)) throw new ModuloNaoHabilitadoError(modulo, situacao, `consultar ${acao}`);
}

/** As situações de TODOS os módulos licenciáveis — uma consulta, para o menu e para a tela. */
export async function situacoesDosModulos(): Promise<ReadonlyMap<ModuloComercial, SituacaoDoModulo>> {
  const mapa = new Map<ModuloComercial, SituacaoDoModulo>();
  let visao: LicenciamentoDaImplantacao;
  try {
    visao = await lerLicenciamento(cliente(), ID_DO_ENTE_UNICO);
  } catch {
    // ⚠️ FAIL-CLOSED NO MENU, e sem estourar: uma falha aqui não pode derrubar o shell. O menu
    // some, e a tela que o usuário tentar abrir dará o erro NOMEADO pelo gate — que é onde a
    // mensagem certa mora.
    for (const m of MODULOS_LICENCIAVEIS) mapa.set(m, "NAO_CONTRATADO");
    return mapa;
  }
  for (const m of visao.modulos) mapa.set(m.modulo, m.situacao);
  return mapa;
}

/**
 * ⚠️ A TELA DO FORNECEDOR **NÃO** MORA AQUI, e a razão é de dependência, não de gosto. Este
 * arquivo é importado por `sessao.ts` e por `leitura.ts` — os dois funis. Se ele importasse
 * `molde.ts` (que importa `leitura.ts`) para cobrar `CONSULTAR_LICENCIAMENTO`, o ciclo se
 * fecharia e a ordem de inicialização dos módulos passaria a decidir se o gate existe no
 * momento em que o funil o chama. A tela vive em `lib/portas/licenciamento-admin.ts`.
 */

export { nomeDoModulo, MODULOS_LICENCIAVEIS };
export type { ModuloComercial, SituacaoDoModulo, LicenciamentoDaImplantacao };
