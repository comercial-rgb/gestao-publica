import type { ArquivoSpec } from "./tipos.js";
import { CAMPO_SEQUENCIAL, CAMPO_TIPO_REGISTRO, larguraDe } from "./writer.js";

/**
 * O GUARDA CONTRA O MANUAL — e ele existe porque o MANUAL ERRA.
 *
 * ═══ ⚠️ POR QUE NÃO SE CONFIA NO CAMPO "TOTAL" DO PDF ═══
 * O documento v44 tem erros de digitação CONFIRMADOS nas posições — `MetasArrecada`,
 * `PagRetencao`, `UnidOrca` e `Diaria` estão entre os flagrados. Em alguns casos o "Total" impresso
 * não bate com a soma das larguras dos campos listados logo acima dele.
 *
 * Num formato posicional, um erro desses não aparece como erro: aparece como um arquivo aceito
 * cujos campos significam outra coisa a partir do ponto do deslocamento. Este validador é o que
 * transforma um typo de transcrição em teste VERMELHO, antes de qualquer byte ir para o TCM.
 *
 * ⚠️ ELE NÃO VALIDA DADO — valida a SPEC. Roda em teste, contra as specs commitadas, e é a razão
 * de `totalBytes` existir como número independente: ele é a AFIRMAÇÃO do manual, e a soma dos
 * campos é o FATO. O teste confronta os dois.
 */
export function validarArquivoSpec(spec: ArquivoSpec): string[] {
  const erros: string[] = [];
  const onde = `${spec.identificacao} (arquivo ${spec.numeroManual}, ${spec.origemSpec})`;

  if (spec.campos.length === 0) {
    return [`${onde}: spec sem campos.`];
  }

  // ── larguras individuais ─────────────────────────────────────────────────────────────────────
  for (const campo of spec.campos) {
    try {
      larguraDe(campo);
    } catch (causa) {
      erros.push(`${onde}: ${causa instanceof Error ? causa.message : String(causa)}`);
    }
    if (campo.literal !== undefined && campo.literal.length > campo.fim - campo.inicio + 1) {
      erros.push(
        `${onde}: literal de "${campo.nome}" tem ${campo.literal.length} bytes, mas o campo tem ` +
          `${campo.fim - campo.inicio + 1}.`
      );
    }
  }

  // ── ordenação, sobreposição e buracos ────────────────────────────────────────────────────────
  //
  // ⚠️ GAP NÃO DECLARADO É ERRO, NÃO É "ESPAÇO EM BRANCO". Num layout posicional, um buraco
  // significa que alguém leu a tabela errado — ou que o manual pulou um campo. Quando o TCM
  // realmente reserva bytes, isso vira um campo "reservado_tcm_N" EXPLÍCITO na spec, que é
  // auditável. Um gap implícito não é auditável: ninguém sabe se é reserva ou esquecimento.
  const ordenados = [...spec.campos].sort((a, b) => a.inicio - b.inicio);

  for (let i = 0; i < ordenados.length; i++) {
    const campo = ordenados[i]!;
    if (i === 0) {
      if (campo.inicio !== 0) {
        erros.push(`${onde}: o primeiro campo começa em ${campo.inicio}, deveria começar em 0.`);
      }
      continue;
    }
    const anterior = ordenados[i - 1]!;
    if (campo.inicio <= anterior.fim) {
      erros.push(
        `${onde}: "${campo.nome}" (${campo.inicio}-${campo.fim}) SOBREPÕE ` +
          `"${anterior.nome}" (${anterior.inicio}-${anterior.fim}).`
      );
    } else if (campo.inicio !== anterior.fim + 1) {
      erros.push(
        `${onde}: GAP não declarado entre "${anterior.nome}" (termina em ${anterior.fim}) e ` +
          `"${campo.nome}" (começa em ${campo.inicio}). Bytes ${anterior.fim + 1}-` +
          `${campo.inicio - 1} não pertencem a campo nenhum — declare-os como "reservado_tcm_N".`
      );
    }
  }

  // ── a soma tem de bater com o total declarado ────────────────────────────────────────────────
  const soma = spec.campos.reduce((acc, c) => acc + (c.fim - c.inicio + 1), 0);
  if (soma !== spec.totalBytes) {
    erros.push(
      `${onde}: a soma das larguras é ${soma}, mas totalBytes declara ${spec.totalBytes}. ` +
        `⚠️ NÃO "corrija" o totalBytes sem reconferir a tabela do manual: é exatamente assim que ` +
        `os erros de digitação do PDF entram no código.`
    );
  }

  // ── o primeiro campo é o tipo de registro, em 0–0 ────────────────────────────────────────────
  const primeiro = ordenados[0]!;
  if (primeiro.nome !== CAMPO_TIPO_REGISTRO || primeiro.inicio !== 0 || primeiro.fim !== 0) {
    erros.push(
      `${onde}: o primeiro campo deve ser "${CAMPO_TIPO_REGISTRO}" em 0-0, mas é ` +
        `"${primeiro.nome}" em ${primeiro.inicio}-${primeiro.fim}.`
    );
  }

  // ── o último campo é o sequencial, ocupando os 10 últimos bytes ──────────────────────────────
  const ultimo = ordenados[ordenados.length - 1]!;
  const inicioEsperado = spec.totalBytes - 10;
  if (
    ultimo.nome !== CAMPO_SEQUENCIAL ||
    ultimo.inicio !== inicioEsperado ||
    ultimo.fim !== spec.totalBytes - 1
  ) {
    erros.push(
      `${onde}: o último campo deve ser "${CAMPO_SEQUENCIAL}" em ` +
        `${inicioEsperado}-${spec.totalBytes - 1} (os 10 últimos bytes), mas é "${ultimo.nome}" ` +
        `em ${ultimo.inicio}-${ultimo.fim}.`
    );
  }

  // ── os "Reservado TCM" numéricos TÊM de declarar o literal ───────────────────────────────────
  //
  // ⚠️ ESTA É A REGRA QUE TRANSFORMA UM ESQUECIMENTO EM ERRO DE SPEC.
  //
  // Campo `N` completa com BRANCOS. Mas o manual manda "preencher com zeros" nos reservados — o
  // oposto. Sem esta checagem, esquecer o `literal` num `reservado_tcm_*` produz um campo em
  // brancos: o registro continua com a largura certa, nenhum teste de geometria reclama, o writer
  // não tem como saber que era exceção, e o TCM recusa a remessa por um campo que ninguém olhou.
  //
  // Com ela, o esquecimento para AQUI — em tempo de teste, nomeando o campo.
  for (const campo of spec.campos) {
    if (!campo.nome.startsWith("reservado_tcm_")) continue;
    if (campo.tipo !== "N") continue;
    if (campo.literal === undefined) {
      erros.push(
        `${onde}: "${campo.nome}" é tipo N e reservado, mas não declara \`literal\`. O manual manda ` +
          `preencher os reservados com ZEROS, e N preenche com BRANCOS — sem o literal o campo ` +
          `sairia em branco e o TCM recusaria a remessa. Declare ` +
          `\`literal: "${"0".repeat(campo.fim - campo.inicio + 1)}"\`.`
      );
    } else if (campo.literal.length !== campo.fim - campo.inicio + 1) {
      // Um literal mais curto seria completado com '0' pelo writer (mesmo efeito), mas declarar a
      // largura exata é o que torna a spec conferível contra o manual sem executar nada.
      erros.push(
        `${onde}: o literal de "${campo.nome}" tem ${campo.literal.length} bytes e o campo tem ` +
          `${campo.fim - campo.inicio + 1}. Declare o literal na largura exata do campo.`
      );
    }
  }

  // ── nomes duplicados ─────────────────────────────────────────────────────────────────────────
  const vistos = new Set<string>();
  for (const campo of spec.campos) {
    if (vistos.has(campo.nome)) {
      erros.push(`${onde}: campo "${campo.nome}" aparece mais de uma vez.`);
    }
    vistos.add(campo.nome);
  }

  return erros;
}
