export {
  Decimal,
  toMoney,
  sumMoney,
  isBalanced,
  assertBalanced,
  serializar,
  zMoney,
} from "./money.js";
export type { Dinheiro, Money, MoneyInput } from "./money.js";

export { ELEGIVEL, naoAplicavel, preCondicao, exigirElegivel, AtoInelegivelError } from "./elegibilidade.js";
export type { Elegibilidade } from "./elegibilidade.js";

export { formatarMoeda, emProsa } from "./moeda.js";
export type { MoedaFormatada } from "./moeda.js";

export {
  CASAS_DO_PERCENTUAL,
  toPercentual,
  serializarPercentual,
  zPercentual,
  zPercentualDeRateio,
} from "./percentual.js";
export type { Percentual, PercentualInput } from "./percentual.js";

export { zPeriodo } from "./periodo.js";
export type { Periodo } from "./periodo.js";
