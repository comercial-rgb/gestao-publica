import { formatarMoeda } from "../../lib/format/moeda";

/**
 * VALOR MONETÁRIO — o número do razão, na tela, como o cidadão o lê.
 *
 * ⚠️ `valor` É `string`, NUNCA `number`. Passar um number é erro de compilação — a defesa da
 * regra de ouro (Decimal atravessa como string). A formatação é da função pura `formatarMoeda`
 * (testada sem React); aqui só se pinta.
 */
export interface ValorMonetarioProps {
  /** String decimal do domínio: "1234.50", "-1234.50", "0". */
  readonly valor: string;
  /** Esconde o "R$" (em tabelas densas o cabeçalho já diz a moeda). Default: sem prefixo. */
  readonly comSimbolo?: boolean;
  readonly className?: string;
}

export function ValorMonetario({
  valor,
  comSimbolo = false,
  className = "",
}: ValorMonetarioProps): React.ReactElement {
  const { texto, negativo } = formatarMoeda(valor);
  return (
    <span
      className={`tabular ${negativo ? "text-[color:var(--color-negativo)]" : ""} ${className}`}
      data-negativo={negativo ? "" : undefined}
    >
      {comSimbolo ? "R$ " : ""}
      {texto}
    </span>
  );
}
