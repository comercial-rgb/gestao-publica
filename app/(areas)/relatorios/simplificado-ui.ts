/**
 * O BADGE DE UMA SITUAÇÃO DE LIMITE — a tradução dos estados dos demonstrativos simplificados para
 * o `Badge` da UI. Compartilhado pelo RGF Anexo 6 e o RREO Anexo 14.
 *
 * ⚠️ Recebe a `situacao` como STRING (o valor que a porta serializou), não o tipo do domínio — a
 * fronteira UI não importa `modules/*` (grep trivalente). Os estados são os mesmos dos anexos
 * analíticos, então o simplificado exibe o MESMO Badge que o detalhe: nunca discordam.
 */
export function badgeDaSituacao(
  situacao: string | null
): { readonly status: "ok" | "alerta" | "erro" | "neutro"; readonly rotulo: string } | null {
  switch (situacao) {
    case "ok":
      return { status: "ok", rotulo: "dentro do limite" };
    case "alerta":
      return { status: "alerta", rotulo: "alerta" };
    case "excedido":
      return { status: "erro", rotulo: "acima do limite" };
    case "insuficiente":
      return { status: "erro", rotulo: "abaixo do mínimo" };
    case "neutro":
      return { status: "neutro", rotulo: "sem base" };
    default:
      return null;
  }
}
