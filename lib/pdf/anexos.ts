import { formatarMoeda } from "../format/moeda";
import type { DocumentoPdf, SecaoPdf } from "./documento";
// ⚠️ OS TIPOS VÊM DA PORTA, não do módulo. `lib/pdf/` é `lib/**` FORA de `lib/portas/**`, e
// `test/ui/fronteira-ui.test.ts:14` proíbe essa camada de importar o domínio — inclusive por
// `import type`, que é apagado na compilação mas cria a MESMA dependência arquitetural (a §9
// do MODULO-SCAFFOLD, aprendida quando o `lib/scaffold/autorizacao.ts` cometeu o mesmo erro).
import type { AnexoLdo, LinhaAnexo } from "../portas/anexos-ldo";

/**
 * A PONTE ANEXO → DOCUMENTO. Formatação, e só.
 *
 * ⚠️ TODA A ARITMÉTICA JÁ ACONTECEU. O gerador (`modules/m02b-plurianual/anexos/ldo.ts`)
 * devolveu `Money`; aqui só se escolhe como escrever. Somar ou derivar nesta camada poria
 * contabilidade no PDF — sem transação, sem teste de domínio, e com um segundo resultado
 * que discordaria do primeiro.
 *
 * ⚠️ REUSA `formatarMoeda` — o MESMO que formata o balancete e a tela. Uma segunda
 * formatação de dinheiro divergiria no dia em que alguém ajustasse uma, e o anexo da LDO
 * passaria a mostrar um número diferente da tela para o mesmo valor.
 */

/**
 * `Money` → texto. Qualquer outra coisa vira string crua; ausente vira travessão.
 *
 * ⚠️ `| undefined` NO TIPO, e não é preciosismo: `l[c.chave]` devolve `undefined` quando a
 * linha não traz aquela coluna — e isso ACONTECE de propósito no anexo de alienação, onde
 * a linha da aplicação não repete o valor do bem. Sem tratar, o TypeScript recusa; e se
 * fosse silenciado com um `!`, a célula imprimiria "undefined" no papel oficial.
 */
function celula(valor: LinhaAnexo[string] | undefined, numerica: boolean): string {
  if (valor === null || valor === undefined) return "—";
  if (typeof valor === "number") return String(valor);
  if (typeof valor === "string") return valor;
  // `Money` (decimal.js). ⚠️ `toFixed` aqui é decimal.js — exato, não ponto flutuante.
  return numerica ? formatarMoeda(valor.toFixed(2)).texto : valor.toFixed(2);
}

/**
 * CONVERTE O ANEXO NUM `DocumentoPdf` — que o motor de sempre imprime, com SHA-256 do
 * conteúdo, hora de emissão e o carimbo "documento não assinado — ICP-Brasil pendente".
 *
 * ⚠️ A LINHA DE TOTAL SÓ EXISTE SE O ANEXO DECLAROU TOTAIS. Onde a série é por exercício
 * (metas anuais, RPPS, dívida, margem) somar anos não significa nada, e o gerador devolve
 * `totais: {}` — ver o docblock de `AnexoLdo`. Inventar a linha aqui produziria um número
 * que não existe na LRF.
 */
export function anexoParaDocumento(anexo: AnexoLdo, ente: string): DocumentoPdf {
  const numericas = new Set(
    anexo.colunas.filter((c) => c.numerica === true).map((c) => c.chave)
  );

  const linhas = anexo.linhas.map((l) =>
    anexo.colunas.map((c) => celula(l[c.chave], numericas.has(c.chave)))
  );

  const temTotais = Object.keys(anexo.totais).length > 0;
  if (temTotais) {
    linhas.push(
      anexo.colunas.map((c, i) => {
        if (i === 0) return "TOTAL";
        const t = anexo.totais[c.chave];
        return t === undefined ? "" : formatarMoeda(t.toFixed(2)).texto;
      })
    );
  }

  const secao: SecaoPdf = {
    colunas: anexo.colunas.map((c) => ({
      rotulo: c.rotulo,
      ...(c.numerica === true ? { alinhamento: "direita" as const } : {}),
    })),
    linhas:
      linhas.length > 0
        ? linhas
        : // ⚠️ UMA LINHA DIZENDO QUE NÃO HÁ LINHA. Uma tabela vazia num papel oficial é
          // indistinguível de uma tabela que falhou em carregar.
          [anexo.colunas.map((_, i) => (i === 0 ? "— sem registros —" : ""))],
    ...(temTotais ? { totais: [linhas.length - 1] } : {}),
  };

  return {
    ente,
    titulo: anexo.titulo,
    subtitulo: anexo.baseLegal,
    periodo: `Exercício ${anexo.exercicio}`,
    secoes: [secao],
    notas: [...anexo.notas],
  };
}
