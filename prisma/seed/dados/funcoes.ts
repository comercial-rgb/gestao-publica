/**
 * FUNÇÕES — Portaria SOF/SETO/ME 42/1999 (consolidada).
 * Padrão NACIONAL, comum a todo ente. Código de 2 dígitos.
 *
 * 28 funções + 99 (Reserva de Contingência) = 29 linhas.
 */

export interface FuncaoOficial {
  readonly codigo: string;
  readonly nome: string;
}

export const FUNCOES: readonly FuncaoOficial[] = [
  { codigo: "01", nome: "Legislativa" },
  { codigo: "02", nome: "Judiciária" },
  { codigo: "03", nome: "Essencial à Justiça" },
  { codigo: "04", nome: "Administração" },
  { codigo: "05", nome: "Defesa Nacional" },
  { codigo: "06", nome: "Segurança Pública" },
  { codigo: "07", nome: "Relações Exteriores" },
  { codigo: "08", nome: "Assistência Social" },
  { codigo: "09", nome: "Previdência Social" },
  { codigo: "10", nome: "Saúde" },
  { codigo: "11", nome: "Trabalho" },
  { codigo: "12", nome: "Educação" },
  { codigo: "13", nome: "Cultura" },
  { codigo: "14", nome: "Direitos da Cidadania" },
  { codigo: "15", nome: "Urbanismo" },
  { codigo: "16", nome: "Habitação" },
  { codigo: "17", nome: "Saneamento" },
  { codigo: "18", nome: "Gestão Ambiental" },
  { codigo: "19", nome: "Ciência e Tecnologia" },
  { codigo: "20", nome: "Agricultura" },
  { codigo: "21", nome: "Organização Agrária" },
  { codigo: "22", nome: "Indústria" },
  { codigo: "23", nome: "Comércio e Serviços" },
  { codigo: "24", nome: "Comunicações" },
  { codigo: "25", nome: "Energia" },
  { codigo: "26", nome: "Transporte" },
  { codigo: "27", nome: "Desporto e Lazer" },
  { codigo: "28", nome: "Encargos Especiais" },
  { codigo: "99", nome: "Reserva de Contingência" },
];
