/**
 * M14 — OS RESPONSÁVEIS DO MANAD NO TEMPO (registros 0050 e 0100). PURO: sem banco, sem escrita.
 *
 * ═══ POR QUE A VIGÊNCIA É DERIVADA, E NÃO GRAVADA ═══
 * O contabilista (0050) e a empresa/técnico gerador (0100) mudam com o tempo, e o arquivo de um
 * período leva os responsáveis DAQUELE período, com DT_INI/DT_FIN. O modo natural de "trocar de
 * contabilista" seria encerrar a linha anterior (UPDATE em `dtFim`) e criar a nova — mas o papel
 * da aplicação (`prisma/papel-runtime.ts`, censo `ESCRITA_MUTAVEL_DO_RUNTIME`) NÃO tem UPDATE em
 * `ManadContabilista` nem em `ManadEmpresaGeradora`: só SELECT e INSERT. Afrouxar o grant para
 * encerrar uma vigência seria trocar o desenho append-only por conveniência.
 *
 * Então o registro é SÓ INSERT, e o fim de uma vigência aberta é DERIVADO: termina na véspera
 * do início do registro seguinte. Quem cadastra o sucessor encerra o antecessor sem tocar nele,
 * e o histórico fica inteiro no banco — exatamente o que o schema pede ("o histórico é o dado").
 *
 * ⚠️ A REGRA QUE TORNA A DERIVAÇÃO INEQUÍVOCA mora no serviço de registro (M01,
 * `responsaveis-do-manad.ts`): um registro novo começa DEPOIS de todos os anteriores, e nunca
 * dentro de um período que já foi declarado com data de fim. Com isso a sucessão é uma linha do
 * tempo sem sobreposição, e este arquivo só precisa ordenar e fechar.
 *
 * ⚠️ DATAS EM UTC DE PROPÓSITO: é o FORMATO EXTERNO do leiaute (DT_INI/DT_FIN saem em DDMMAAAA
 * lidos por `getUTC*` em `dominio.ts#data`). A data gravada é meia-noite UTC do dia civil
 * informado — nenhuma comparação de domínio do ente passa por aqui.
 */

export interface PeriodoDeclarado {
  readonly inicio: Date;
  /** `null` = aberto: vale até o início do próximo registro (ou indefinidamente). */
  readonly fim: Date | null;
}

export interface ComVigenciaEfetiva<T> {
  readonly registro: T;
  readonly inicio: Date;
  /** O fim declarado, ou a véspera do sucessor quando o declarado é aberto. `null` = vigente. */
  readonly fimEfetivo: Date | null;
}

const UM_DIA_MS = 24 * 60 * 60 * 1000;

/**
 * A linha do tempo dos responsáveis: cada registro com o fim EFETIVO, em ordem de início.
 *
 * ⚠️ O fim declarado prevalece quando é ANTERIOR à véspera do sucessor (houve um intervalo sem
 * responsável cadastrado — isso é dado, e aparece). Quando não há fim declarado, o registro
 * termina na véspera do próximo. O último registro aberto fica aberto.
 */
export function vigenciasEfetivas<T>(
  registros: readonly T[],
  periodo: (r: T) => PeriodoDeclarado
): readonly ComVigenciaEfetiva<T>[] {
  const ordenados = [...registros].sort(
    (a, b) => periodo(a).inicio.getTime() - periodo(b).inicio.getTime()
  );
  return ordenados.map((r, i) => {
    const p = periodo(r);
    const proximo = ordenados[i + 1];
    const vespera = proximo === undefined ? null : new Date(periodo(proximo).inicio.getTime() - UM_DIA_MS);
    let fimEfetivo: Date | null = p.fim;
    if (vespera !== null && (fimEfetivo === null || fimEfetivo > vespera)) fimEfetivo = vespera;
    return { registro: r, inicio: p.inicio, fimEfetivo };
  });
}

/**
 * Os responsáveis cuja vigência EFETIVA toca a janela do arquivo `[dtInicio, dtFim]`.
 *
 * É o que o gerador leva para o 0050/0100: o contabilista que assinou março de 2024 não entra no
 * MANAD de 2026 — o arquivo de um exercício declara quem respondeu por AQUELE exercício.
 */
export function responsaveisDoPeriodo<T>(
  registros: readonly T[],
  periodo: (r: T) => PeriodoDeclarado,
  janela: { readonly dtInicio: Date; readonly dtFim: Date }
): readonly ComVigenciaEfetiva<T>[] {
  return vigenciasEfetivas(registros, periodo).filter(
    (v) => v.inicio <= janela.dtFim && (v.fimEfetivo === null || v.fimEfetivo >= janela.dtInicio)
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// A CONFERÊNCIA DO TEXTO NA ENTRADA — a mesma que o gerador faz na saída
// ═══════════════════════════════════════════════════════════════════════════

/**
 * O texto cabe no arquivo da Receita? O gerador RECUSA o arquivo inteiro se um campo tiver barra
 * vertical (o separador) ou caractere fora do ISO 8859-1 (`dominio.ts#alfa`). Conferir só lá
 * deixaria gravar um responsável que torna o MANAD impossível de gerar — o efeito colateral antes
 * da guarda. Aqui a recusa vem na hora do cadastro, com o nome do campo e em linguagem de tela.
 *
 * Devolve a mensagem de recusa, ou `null` quando o texto serve.
 */
export function motivoDeTextoInvalidoNoManad(valor: string, rotulo: string): string | null {
  if (valor.includes("|")) {
    return `${rotulo}: a barra vertical ("|") não é aceita, porque o arquivo da Receita a usa como separador.`;
  }
  const volta = Buffer.from(valor, "latin1").toString("latin1");
  if (volta !== valor) {
    return (
      `${rotulo}: há caractere que o arquivo da Receita não aceita, como travessão, aspas curvas ` +
      `ou símbolos. Digite o texto sem eles.`
    );
  }
  if (valor.length > 255) {
    return `${rotulo}: o texto passa de 255 caracteres, o limite do arquivo da Receita.`;
  }
  return null;
}
