/**
 * LIMITES DE CONTRATAÇÃO DIRETA — art. 75, I e II, da Lei 14.133/2021.
 *
 * ⚠️ DADO OFICIAL. Os valores abaixo são os do **Decreto 12.807/2025** (atualização
 * anual dos valores da Lei 14.133), com vigência a partir de **01/01/2026**. Não se
 * digita limite de memória: um teto errado para MENOS barra contratação legítima; um
 * teto errado para MAIS legaliza a dispensa que a lei proíbe.
 *
 * APPEND-ONLY: quando o decreto de 2027 sair, ele entra como LINHA NOVA, com a
 * `vigenciaInicio` dele. O contrato de 2026 continua sendo julgado pelo limite de
 * 2026 — o passado não se reescreve.
 */
export interface LimiteOficial {
  readonly vigenciaInicio: string;
  readonly fonteLegal: string;
  readonly limiteObrasEngenharia: string;
  readonly limiteComprasServicos: string;
}

export const LIMITES_OFICIAIS: readonly LimiteOficial[] = [
  {
    vigenciaInicio: "2026-01-01T00:00:00Z",
    fonteLegal: "Decreto 12.807/2025 (art. 75, I e II, Lei 14.133/2021)",
    /** Art. 75, I — obras e serviços de engenharia / manutenção de veículos. */
    limiteObrasEngenharia: "130984.20",
    /** Art. 75, II — compras e demais serviços. */
    limiteComprasServicos: "65492.11",
  },
];
