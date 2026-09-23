/**
 * ═══ O ROL DE TIPOS DE UNIDADE DO MANAD (L400, campo 06 — TIP_UN_ORC) ═══
 *
 * ⚠️ TRANSCRIÇÃO, NÃO INVENÇÃO. Estes doze valores já estavam no repositório, escritos no
 * comentário de `UnidadeOrcamentaria.tipoManad` (`prisma/schema/m02-planejamento.prisma`) desde
 * que o gerador do MANAD nasceu. O que este arquivo faz é uma coisa só: parar de deixá-los
 * apenas num comentário, onde nenhum código consegue conferi-los.
 *
 * ⚠️ E É UM RECORD SÓ, DE PROPÓSITO. A `EntidadeContabil` classifica-se pelo MESMO rol da
 * `UnidadeOrcamentaria` — é a mesma pergunta ("isto é uma prefeitura, uma câmara, uma
 * autarquia?") feita sobre objetos diferentes. Escrever um segundo rol para a entidade criaria
 * duas verdades sobre o mesmo dígito, e no dia em que só uma fosse corrigida o MANAD declararia
 * uma coisa e a consulta por entidade, outra.
 *
 * ⚠️ NADA AQUI É CLASSIFICAÇÃO NOVA. O rol é da Receita Federal; quem quiser saber por que o
 * RPPS tem dois códigos (05 e 07) lê o leiaute, não este arquivo. Acrescentar um décimo terceiro
 * tipo por conveniência seria inventar norma — e é exatamente o que a chave fechada impede.
 */

export const TIPO_MANAD: Record<string, string> = {
  "01": "Prefeitura",
  "02": "Câmara",
  "03": "Secretaria de Educação",
  "04": "Secretaria de Saúde",
  "05": "RPPS (exceto Autarquia)",
  "06": "Autarquia (exceto RPPS)",
  "07": "Autarquia (RPPS)",
  "08": "Fundação",
  "09": "Empresa Estatal Dependente",
  "10": "Empresa Estatal não Dependente",
  "11": "Consórcio",
  "12": "Outras",
};

/** Os códigos, na ordem do leiaute — o que a tela oferece em vez de dois dígitos de cabeça. */
export const CODIGOS_TIPO_MANAD: readonly string[] = Object.keys(TIPO_MANAD);

/**
 * FAIL-CLOSED: um tipo fora do rol não classifica nada. A mensagem lista o rol inteiro porque
 * quem cadastra uma entidade não tem o leiaute do MANAD aberto ao lado.
 */
export function exigirTipoManad(codigo: string): string {
  const rotulo = TIPO_MANAD[codigo];
  if (rotulo === undefined) {
    throw new Error(
      `TIPO DE ENTIDADE INEXISTENTE: "${codigo}" não é um tipo do rol oficial (MANAD L400, ` +
        `campo 06). Escolha um destes: ` +
        `${CODIGOS_TIPO_MANAD.map((c) => `${c} ${TIPO_MANAD[c]!}`).join(", ")}. Nada foi gravado.`
    );
  }
  return rotulo;
}
