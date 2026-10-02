# Ofício (tipos 14/15) e realocação por decreto (tipos 12/13) — Esperança 2026 (V27, 2026-10-02)

## As fontes

- **Tabela "Tipo Alteração Orçamentária" do TCE-PB** (tabelas de domínio do Captura 2.0,
  `docs/oficial/tce-pb/captura20-tabelas-de-dominio.html`, vigência desde 2025):
  - 12 — Transposição, Remanejamento, Transferências – Origem
  - 13 — Transposição, Remanejamento, Transferências – Destino
  - 14 — Ofício – Origem
  - 15 — Ofício – Destino
  - Observação literal: "Os tipos 14 e 15 (Ofício) serão utilizados para movimentações orçamentárias apenas nos
    elementos de despesa."
- **Lei Ordinária 613, de 19/12/2025** (LOA 2026 de Esperança), `docs/oficial/esperanca-pb/lei-613-2025-loa-2026.pdf`
  (SHA-256 `43e84bea…b236`). Lidos todos os artigos do texto da lei (arts. 1º a 13).
- **Alterações da Lei 613/2025 em 2026**: nenhuma localizada. Foi feita uma varredura nas edições do Quinzenário Oficial
  de 2025 e 2026. As leis 623, 624, 628, 637 e 638/2026 são de crédito especial e não alteram o texto da LOA. Ver as
  lacunas da varredura abaixo.

## O que a lei autoriza

| Dispositivo | Texto (literal) | Alcance |
|---|---|---|
| Art. 5º, II | "Abrir créditos suplementares até 50% (cinquenta por cento) do total da despesa autorizada…" | crédito suplementar por decreto (tipos 1 a 4 da tabela) |
| Art. 5º, III | "No mesmo percentual autorizado para o inciso anterior, **mediante Decreto**, Transpor, Remanejar ou Transferir Recursos de uma Categoria de Programação para outro ou de um Órgão para outro." | **tipos 12/13**, por decreto |
| Art. 5º, § 1º | "Considera-se Categoria de Programação, o Programa, independente da Função, Subfunção ou Categoria Econômica." | o que é "categoria de programação" |
| Art. 8º | "Fica o chefe do poder executivo municipal autorizado a abrir novas fontes de recursos e inserir novos elementos de despesas em ações e programas constantes do quadro de detalhamento de despesas integrante desta lei." | autoriza **inserir** elemento; não diz o instrumento nem fala em movimentar dotação entre elementos por ofício |

## Conclusão

**Ofício (14/15): sem fundamento comprovado. Fica indisponível.**
- A lei não menciona ofício como instrumento de alteração orçamentária. O único instrumento que ela nomeia para mover
  dotação (art. 5º, III) é o **decreto**.
- O art. 8º autoriza inserir elementos de despesa em ações e programas. Não diz que isso se faz por ofício, nem
  autoriza mover dotação entre elementos por ofício. A conclusão não se apoia na simples ausência da palavra: o
  dispositivo que trata do instrumento escolhe o decreto, e o que trata de elementos não escolhe instrumento nenhum.
- Com isso:
  - o sistema **não oferece** a efetivação por ofício e não exporta os tipos 14/15;
  - **não converte** ofício em decreto;
  - os demais caminhos (crédito por decreto e realocação por decreto) seguem disponíveis.

**Realocação por decreto (12/13): com fundamento (art. 5º, III).** Implementada na V27.
- A realocação já existia desde a V21 (ato, pernas, lei autorizativa obrigatória, razão).
- A V27 passou a exportá-la ao SAGRES: a perna que cede vai como origem (12), a que recebe como destino (13).
- O decreto vai à §4.6 com o PDF anexado ao ato (Planejamento › Remanejamento, transposição e transferência).
- Sem o PDF, o decreto é nomeado e o arquivo do dia fica fora da remessa.
- O desfazimento de uma realocação não tem registro no leiaute: o arquivo do dia em que ela é desfeita fica fora,
  nomeando o ato, até a orientação do Tribunal.

## O que o sistema ainda não confere (pendência nomeada)

- `LIMITE-DO-ART-5-III`: o limite "no mesmo percentual" (50% do total da despesa autorizada), compartilhado com os
  créditos suplementares, não é somado nem conferido no registro da realocação. O ato exige a lei autorizativa, mas não
  calcula o consumo do limite.

## Pergunta objetiva ao município, se quiser usar ofício

O Executivo entende que o art. 8º da Lei 613/2025 autoriza movimentar dotação entre elementos de despesa por ofício?
- Se sim: qual ato regulamentou o instrumento?
- Há lei posterior que altere a LOA para isso?

Sem um dos dois documentos, o ofício permanece indisponível. Com eles, a autorização se cadastra com artigo, documento
e exercício, e o alcance fica restrito a elementos de despesa, como manda a observação da tabela do Tribunal.

## Lacunas da busca por alterações

- Os PDFs das leis 623 e 624/2026 não deram texto extraível: só os títulos foram lidos.
- As leis 614, 616 a 622, 625 a 627, 630 a 634 e 639 a 641 não apareceram em edição extra.
- Não foram localizadas edições regulares do Quinzenário depois da nº 218 (30/06/2026).
