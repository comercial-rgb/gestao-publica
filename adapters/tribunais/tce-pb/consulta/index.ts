export { ROTAS_TCE, defDaRota, validarRespostaTce, type RotaTce, type ViolacaoContratoTce } from "./contrato.js";
export { fixturasDaRota } from "./fixtures-poc.js";
export {
  criarGatewayTce,
  estadoDoModoTce,
  TceCredentialNotConfiguredError,
  type GatewayTce,
  type ModoTce,
  type ParamsConsulta,
  type RespostaConsulta,
} from "./gateway.js";
export { compararEmpenhos, type LinhaComparacao, type SituacaoComparacao } from "./comparar.js";
