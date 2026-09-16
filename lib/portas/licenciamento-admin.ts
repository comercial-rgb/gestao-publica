import { cliente } from "./cliente";
import { exigirLeitura } from "./molde";
import { comEscritaAutenticada } from "./sessao";
import { ID_DO_ENTE_UNICO } from "../../modules/m01-core-contabil/contexto-do-ente.js";
import {
  encerrarContratoComercial,
  habilitarModuloContratado,
  lerLicenciamento,
  programarVigenciaDeModulo,
  reativarModuloContratado,
  registrarContratoComercial,
  suspenderModuloContratado,
  type LicenciamentoDaImplantacao,
  type ResultadoDoAto,
} from "../../modules/m35-licenciamento/servico.js";

/**
 * PORTA — A TELA DO FORNECEDOR (V10 T1 · N6.1): o contrato desta implantação e os módulos.
 *
 * ⚠️ NENHUMA REGRA AQUI. Autorização, dependência entre módulos, vigência, idempotência e a
 * recusa de suspender o que sustenta outro são do DOMÍNIO (`modules/m35-licenciamento`). Esta
 * camada só traz a identidade da implantação (que exige servidor) e encaminha.
 *
 * ⚠️ AS AÇÕES SÃO RESERVADAS. `REGISTRAR_CONTRATO_COMERCIAL`, `HABILITAR_MODULO_CONTRATADO` e
 * as outras estão em `ACOES_DO_FORNECEDOR`: a tela de permissões do ENTE recusa concedê-las, e
 * o bootstrap do administrador municipal não as recebe. Quem as tem é o operador provisionado
 * por `scripts/provisionar-operador-engine.ts`.
 */

export async function lerLicenciamentoDaTela(): Promise<LicenciamentoDaImplantacao> {
  await exigirLeitura("CONSULTAR_LICENCIAMENTO");
  return lerLicenciamento(cliente(), ID_DO_ENTE_UNICO);
}

export async function registrarContratoNaTela(input: {
  readonly numero: string;
  readonly cliente: string;
  readonly inicio: string;
  readonly fim: string | null;
  readonly observacao: string | null;
  readonly demonstracao: boolean;
}): Promise<ResultadoDoAto> {
  return comEscritaAutenticada("REGISTRAR_CONTRATO_COMERCIAL", (criadoPor) =>
    registrarContratoComercial(cliente(), { ...input, enteId: ID_DO_ENTE_UNICO, criadoPor })
  );
}

export async function encerrarContratoNaTela(input: {
  readonly contratoId: string;
  readonly motivo: string;
}): Promise<ResultadoDoAto> {
  return comEscritaAutenticada("ENCERRAR_CONTRATO_COMERCIAL", (criadoPor) =>
    encerrarContratoComercial(cliente(), { ...input, criadoPor })
  );
}

export async function habilitarModuloNaTela(input: {
  readonly contratoId: string;
  readonly modulo: string;
  readonly inicio: string;
  readonly fim: string | null;
  readonly motivo: string;
}): Promise<ResultadoDoAto> {
  return comEscritaAutenticada("HABILITAR_MODULO_CONTRATADO", (criadoPor) =>
    habilitarModuloContratado(cliente(), { ...input, criadoPor })
  );
}

export async function programarVigenciaNaTela(input: {
  readonly contratoId: string;
  readonly modulo: string;
  readonly inicio: string;
  readonly fim: string | null;
  readonly motivo: string;
}): Promise<ResultadoDoAto> {
  return comEscritaAutenticada("PROGRAMAR_VIGENCIA_DE_MODULO", (criadoPor) =>
    programarVigenciaDeModulo(cliente(), { ...input, criadoPor })
  );
}

export async function suspenderModuloNaTela(input: {
  readonly contratoId: string;
  readonly modulo: string;
  readonly motivo: string;
}): Promise<ResultadoDoAto> {
  return comEscritaAutenticada("SUSPENDER_MODULO_CONTRATADO", (criadoPor) =>
    suspenderModuloContratado(cliente(), { ...input, criadoPor })
  );
}

export async function reativarModuloNaTela(input: {
  readonly contratoId: string;
  readonly modulo: string;
  readonly motivo: string;
}): Promise<ResultadoDoAto> {
  return comEscritaAutenticada("REATIVAR_MODULO_CONTRATADO", (criadoPor) =>
    reativarModuloContratado(cliente(), { ...input, criadoPor })
  );
}

export type { LicenciamentoDaImplantacao, ResultadoDoAto };
