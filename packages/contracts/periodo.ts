import { z } from "zod";

/** Período fechado [inicio, fim], com fim >= inicio. */
export interface Periodo {
  inicio: Date;
  fim: Date;
}

export const zPeriodo: z.ZodType<Periodo> = z
  .object({
    inicio: z.coerce.date(),
    fim: z.coerce.date(),
  })
  .refine((p) => p.fim.getTime() >= p.inicio.getTime(), {
    message: "Período inválido: fim deve ser >= inicio",
    path: ["fim"],
  });
