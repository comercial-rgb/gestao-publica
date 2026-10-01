# V25 — os pendentes da V24

Pedido, como veio (01/10/2026, depois do relatório final da V24):

> Siga por estes Pendntes.

"Estes pendentes" são os nomeados no fechamento da V24:

1. A verificação automática de datas (`test/ui/data-civil.test.ts`) com a falha vinda de 27 e 28/09 — 32 sítios.
2. O IR retido pelo município não conferido contra o manual de contabilidade (pode ser receita própria).
3. O FAP vale para um único CNPJ empregador.
4. O SAGRES com 31 das 58 tabelas por gerar.

Fora deste lote, por decisão do usuário (reinicia o sistema da apresentação): levar a V24 à 3010 —
migrations no banco da apresentação, carga das tabelas oficiais, build novo, ente Esperança e contas
das consignações.

Restrições que continuam: sem push, deploy, transmissão ou pagamento; nada de `doador/`; nenhuma norma,
alíquota ou conta inventada; sem jargão nem emoji em tela; migration aditiva; percurso que grava nunca na
3010; dinheiro em Decimal; data civil do ente; commit local; sem suítes completas.
