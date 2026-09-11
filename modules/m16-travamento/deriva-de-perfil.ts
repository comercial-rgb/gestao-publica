import { TODAS_AS_ACOES, type AcaoDoSistema } from "./acoes.js";

/**
 * ═══ ⚠️ A DERIVA ENTRE O CENSO E O QUE OS PERFIS CONCEDEM ═══
 *
 * ═══ O DEFEITO QUE ISTO EXISTE PARA ACUSAR, E ELE É REAL ═══
 *
 * Medido no ENT06, no banco de desenvolvimento: o censo tinha **223 ações** e o perfil de
 * administrador concedia **185**. As 38 de diferença eram TODAS do ENT05 — almoxarifado
 * físico, gestão do bem, a compra e o repontamento de conta.
 *
 * O efeito não é um erro na tela: é a tela NÃO EXISTIR para quem usa. O molde esconde o
 * formulário de quem não tem a ação (e faz certo — oferecer e recusar depois ensina que o
 * sistema é instável). Então um lote inteiro de funcionalidade entregue fica invisível, sem
 * mensagem de erro, sem log, sem nada que denuncie. Ninguém abre um chamado dizendo "a tela
 * que eu nunca vi não apareceu".
 *
 * ═══ ⚠️ POR QUE O BOOTSTRAP NÃO RESOLVE, E ESTÁ CERTO EM NÃO RESOLVER ═══
 *
 * `prisma/seed/bootstrap-usuario.ts` deriva as permissões de `TODAS_AS_ACOES` — ele nasce
 * correto. Mas é ato de INSTALAÇÃO e recusa rodar em banco povoado, de propósito: um script
 * re-executável capaz de carimbar administrador entregaria a chave-mestra a quem tivesse
 * acesso ao shell. A recusa é uma decisão de segurança, e ela continua.
 *
 * O que falta é o outro lado: **não existe caso de uso que conceda uma AÇÃO a um PERFIL.**
 * `concederPerfil` concede o perfil a um usuário — outra coisa. Os únicos escritores de
 * `PermissaoDePerfil` no repositório são o bootstrap e um teste.
 *
 * ⚠️ ISTO AQUI NÃO CONSERTA ISSO, E NÃO DEVE. Conceder permissão é ato administrativo, com
 * autor responsável e registro de operação — é caso de uso, não script. A pendência
 * `CONCEDER_ACAO_A_PERFIL` fica nomeada. O que esta função faz é o passo anterior e o que
 * faltava por completo: **tornar a deriva visível**, para que ela pare de ser descoberta
 * por acaso, meses depois, por um servidor que não acha a tela.
 */

export interface DerivaDePerfil {
  /** Ações do censo que NENHUM perfil concede — funcionalidade entregue e inalcançável. */
  readonly semPerfil: readonly AcaoDoSistema[];
  /**
   * Ações concedidas que NÃO estão mais no censo — resíduo de ação renomeada ou removida.
   *
   * ⚠️ ESTE LADO TAMBÉM IMPORTA, e é o mais fácil de não olhar. Uma ação removida do censo
   * cujo registro de permissão sobrevive é uma concessão que ninguém consegue auditar: ela
   * não aparece em tela nenhuma, não tem serviço, e continua no banco parecendo poder.
   */
  readonly foraDoCenso: readonly string[];
  readonly totalDoCenso: number;
  readonly totalConcedido: number;
}

/**
 * A deriva, a partir das ações que os perfis concedem.
 *
 * ⚠️ FUNÇÃO PURA, e é isso que permite prová-la por mutação sem banco. Quem lê o banco é
 * quem a chama — `scripts/deriva-de-perfil.ts`.
 */
export function derivaDePerfil(acoesConcedidas: readonly string[]): DerivaDePerfil {
  const concedidas = new Set(acoesConcedidas);
  const doCenso = new Set<string>(TODAS_AS_ACOES);

  return {
    semPerfil: TODAS_AS_ACOES.filter((a) => !concedidas.has(a)),
    foraDoCenso: [...concedidas].filter((a) => !doCenso.has(a)).sort(),
    totalDoCenso: TODAS_AS_ACOES.length,
    totalConcedido: concedidas.size,
  };
}

/** A deriva em prosa — a mesma frase para o console e para a mensagem de falha. */
export function explicarDeriva(d: DerivaDePerfil): string {
  if (d.semPerfil.length === 0 && d.foraDoCenso.length === 0) {
    return `censo e perfis batem: ${d.totalDoCenso} ações, todas concedidas a algum perfil.`;
  }
  const partes: string[] = [
    `censo ${d.totalDoCenso} ações · concedidas ${d.totalConcedido}`,
  ];
  if (d.semPerfil.length > 0) {
    partes.push(
      `\n⚠️ ${d.semPerfil.length} AÇÕES QUE NENHUM PERFIL CONCEDE — a tela existe e ninguém` +
        ` a alcança:\n` +
        d.semPerfil.map((a) => `  · ${a}`).join("\n")
    );
  }
  if (d.foraDoCenso.length > 0) {
    partes.push(
      `\n⚠️ ${d.foraDoCenso.length} PERMISSÕES CONCEDIDAS FORA DO CENSO — resíduo de ação` +
        ` renomeada ou removida:\n` +
        d.foraDoCenso.map((a) => `  · ${a}`).join("\n")
    );
  }
  return partes.join("\n");
}
