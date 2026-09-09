/**
 * O DOCUMENTO DO CONTRATADO — UMA função de normalização, e é ela em toda parte.
 *
 * ═══ ⚠️ ESTE ARQUIVO VIROU RE-EXPORT (ENT01) ═══
 * As três funções mudaram de casa para `packages/documento`, e a razão é o M19: o cadastro
 * de pessoas e credores precisa da MESMA normalização, porque `Empenho.credorCpfCnpj` é FK
 * lógica para `Pessoa.documento` exatamente como a certidão é para o contrato. Uma segunda
 * cópia funcionaria — até o dia em que uma delas mudasse.
 *
 * A API daqui NÃO mudou: quem importa deste arquivo continua importando as mesmas três
 * funções, com o mesmo comportamento. É o mesmo movimento de `test/roteiro-orcamentario.ts`,
 * que virou re-export quando o roteiro ganhou dono no M01.
 *
 * ═══ POR QUE ELAS EXISTEM (a razão original, que continua valendo) ═══
 * `CertidaoFornecedor.contratadoDocumento` é FK LÓGICA para `Contrato.contratadoDocumento` —
 * não há model `Fornecedor` neste repositório. FK lógica não é verificada pelo banco: o que a
 * mantém honesta é os dois lados gravarem a MESMA string.
 *
 * Se um CNPJ entrar como "12.345.678/0001-99" no contrato e "12345678000199" na certidão, eles
 * viram DUAS empresas. A certidão fica pendurada numa, e a tela da outra a declara ausente — um
 * fornecedor com certidão válida aparecendo como irregular, sem erro, sem log, sem nada que
 * denuncie. É o defeito que só se descobre quando o Tribunal pergunta.
 *
 * O CHECK do banco (`ck_contrato_contratado_documento_formato` e
 * `ck_certidao_documento_formato`) RECUSA o que não for 11 ou 14 dígitos — mas recusar é tarde:
 * o usuário digitou com máscara porque o formulário mostrou máscara. Normalizar é o que faz o
 * CHECK nunca disparar.
 *
 * ⚠️ O M11 CONFERE FORMATO, NÃO DÍGITO VERIFICADOR — e isso é decisão, não esquecimento: um
 * contratado ESTRANGEIRO não tem CPF nem CNPJ, e recusar o contrato dele por DV seria inventar
 * uma regra que a lei não tem. O `documentoTemDigitoValido` existe no pacote e é usado pelo
 * M19, onde a pergunta é outra (um credor com DV errado não é ninguém).
 */

export {
  documentoTemFormatoValido,
  normalizarDocumento,
  tipoDeDocumento,
} from "../../packages/documento/index.js";
