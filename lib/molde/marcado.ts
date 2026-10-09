/**
 * V37 — A LEITURA DO CAMPO `booleano` DO MOLDE, num lugar só.
 *
 * O `FormularioDeRecurso` envia a caixa marcada com o valor "sim" (e nada, desmarcada). Cada porta lia o campo com a
 * sua própria comparação, e três delas aceitavam só "on", "true" ou "1": "Controla lote e validade" do material,
 * "Consumo imediato" da ordem de compra e "Invalidez permanente" do dependente gravavam sempre "não" pela tela, sem
 * erro. `test/ui/campo-marcado-do-molde.test.ts` confere que o valor que o formulário envia é o que este leitor aceita, e
 * que nenhuma porta compara um campo `booleano` do molde por conta própria.
 *
 * Aceita também "on", "true" e "1": formulários escritos à mão (fora do molde) enviam esses.
 */
export const VALOR_DO_CAMPO_MARCADO = "sim";

export function campoMarcado(valor: string | undefined): boolean {
  return ["sim", "on", "true", "1"].includes((valor ?? "").trim().toLowerCase());
}
