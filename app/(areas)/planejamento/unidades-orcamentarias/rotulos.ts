/** Os rótulos em português dos domínios da declaração da unidade — o enum não vai para a tela. */

export const NATUREZAS: readonly { readonly valor: string; readonly rotulo: string }[] = [
  { valor: "CAMARA_MUNICIPAL", rotulo: "Câmara Municipal" },
  { valor: "PREFEITURA_OU_SECRETARIA", rotulo: "Prefeitura ou secretaria" },
  { valor: "AUTARQUIA", rotulo: "Autarquia" },
  { valor: "FUNDACAO", rotulo: "Fundação" },
  { valor: "SOCIEDADE_DE_ECONOMIA_MISTA", rotulo: "Sociedade de economia mista" },
  { valor: "FUNDO", rotulo: "Fundo" },
  { valor: "EMPRESA_PUBLICA", rotulo: "Empresa pública" },
  { valor: "AUTARQUIA_PREVIDENCIARIA", rotulo: "Autarquia previdenciária" },
  { valor: "FUNDO_PREVIDENCIARIO", rotulo: "Fundo previdenciário" },
];

export const ATOS: readonly { readonly valor: string; readonly rotulo: string }[] = [
  { valor: "LEI", rotulo: "Lei" },
  { valor: "DECRETO", rotulo: "Decreto" },
  { valor: "PORTARIA", rotulo: "Portaria" },
  { valor: "OUTROS", rotulo: "Outro ato" },
];

export function rotuloDe(lista: readonly { readonly valor: string; readonly rotulo: string }[], valor: string): string {
  return lista.find((x) => x.valor === valor)?.rotulo ?? "—";
}
