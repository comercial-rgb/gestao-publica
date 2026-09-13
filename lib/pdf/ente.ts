/**
 * O NOME DO ENTE nos documentos NOVOS — da porta de identidade (V6 P0.1), não de uma
 * constante. "Nome de exibição — UF" da apresentação vigente; sem apresentação, o nome oficial
 * do `EnteConfig`; sem ente, a frase que diz isso.
 *
 * ⚠️ Documento EMITIDO congela o texto no seu JSON (M10 `termo-documento`): a segunda via lê
 * de lá. Reconfigurar a apresentação muda os documentos novos, nunca os já emitidos.
 */
export { nomeDoEnteParaDocumentos } from "../portas/identidade";
