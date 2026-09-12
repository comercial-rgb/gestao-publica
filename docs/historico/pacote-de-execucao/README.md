# Pacote de execução — Gestão Pública (Anita Garibaldi/SC)

Material de planejamento e execução do produto de gestão pública municipal
referente ao Termo de Referência de Anita Garibaldi/SC. Movido de `~/Downloads`
em 2026-09-09, preservando a estrutura interna que os próprios documentos
descrevem (`prompts/`, `especificacoes/`).

> **Este pacote não descreve o `saas-municipal`.** Ele trata de um produto cujo
> núcleo autoritativo é o `siafic-cg` e cujo destino declarado é
> `/Users/winnervinicius/Developer/gestao-publica`. Está guardado aqui como
> documentação; o `saas-municipal` aparece nele como **doador seletivo**.

---

## Inventário

| Arquivo | O que é |
|---|---|
| `PROMPT-MESTRE-IMPLEMENTACAO.md` | Missão, invariantes, decisão arquitetural e as 12 frentes ENT00–ENT11. Regra que vale em todos os lotes |
| `MAPA-DE-LACUNAS.md` | Cruza as 2.037 cláusulas do catálogo com o código real dos dois repositórios. Diz de onde parte cada bloco |
| `INSTRUCAO-CONTINUACAO.md` | Como retomar o pacote a partir de ENT02, com o texto pronto para colar |
| `CONTEXTO-SIAFIC-E-SAAS-MUNICIPAL.md` | Handoff técnico dos dois repositórios, por inspeção direta de código (2026-09-09) |
| `prompts/02-ENT02-CAPACIDADES-TRANSVERSAIS.md` | Lote: protocolo, comunicação interna, pessoas/papéis, anexos, assinatura, notificações, designer de relatórios, ajuda |
| `prompts/03-ENT03-FINANCEIRO-E-CONTROLE.md` | Lote: caracterização, tesouraria, conciliação, adiantamentos, planejamento, controle interno |
| `prompts/GABARITO-DE-LOTE-E-FRENTES-04-11.md` | Molde para escrever os lotes seguintes + briefing de cada frente ENT04–ENT11 |
| `especificacoes/PRIMEIRA-ENTREGA.md` | Recorte de implementação inicial: telas T01–T09, contratos de rota, cenário de aceite, 25 testes mínimos |
| `fonte/Termo_de_referencia.pdf` | Documento oficial do certame (189 páginas) |
| `fonte/resultado-auditoria.json` | Auditoria estrutural do catálogo. **Aprovação estrutural apenas** — não valida implementação, cobertura, normas ou integração externa |

## Ordem de leitura

1. `PROMPT-MESTRE-IMPLEMENTACAO.md` — invariantes e regras que continuam valendo
2. `MAPA-DE-LACUNAS.md` — de onde parte cada bloco
3. `prompts/` — o lote a executar
4. `fonte/Termo_de_referencia.pdf` — a fonte, quando o texto de uma cláusula importar

---

## Peças que o pacote referencia e que NÃO estão aqui

Verificado por varredura dos próprios documentos. Nenhuma delas foi encontrada
em `~/Downloads` nem neste repositório:

| Ausente | Referenciado por | Consequência |
|---|---|---|
| `ESTADO-EXECUCAO.md` | `INSTRUCAO-CONTINUACAO.md` (item 1 da ordem de leitura), ENT02, ENT03 | É o checkpoint do último gate. Sem ele não há registro de o que já foi executado |
| `01-CONTEXTO-E-PRIMEIRA-ENTREGA.md` | ENT02 ("executar somente depois do gate de…") | Prompt do lote ENT01, cujo gate precede o ENT02 |
| Prompt do ENT00 | `PROMPT-MESTRE-IMPLEMENTACAO.md` ("comece executando o prompt 00") | Primeiro gate obrigatório: preservação, ambiente, baselines, inventário |
| `catalogo-execucao.json` | Prompt mestre §10, `MAPA-DE-LACUNAS.md` | As 2.037 cláusulas com seus localizadores. A auditoria valida este arquivo, que não veio junto |
| `condicoes-operacionais-e-contexto.json` | Prompt mestre §10 | Demais condições fora do catálogo |
| `especificacoes/CONTRATO-FUNCIONALIDADE.json` | Prompt mestre §5 | Formato do contrato por funcionalidade, a preencher antes de cada lote |

Também registrado: **`/Users/winnervinicius/Developer/gestao-publica` não existe
no disco.** É o destino declarado em `PROMPT-MESTRE-IMPLEMENTACAO.md` e em
`INSTRUCAO-CONTINUACAO.md`. O próprio prompt mestre já antecipa o caso: a
inexistência de um caminho não autoriza recriar a base a partir da descrição nem
trabalhar em outra pasta por semelhança de nome.

## Divergência conhecida entre os documentos

`MAPA-DE-LACUNAS.md` classifica M09/M10/M11/M12/M13/M14 do `siafic-cg` como base
existente, e está correto quanto ao disco. Já o `PROJETO.md` **dentro** do
`siafic-cg` lista vários desses módulos como "pendente" — o documento é que está
defasado, não o código. Conferir sempre o disco antes de tratar um módulo como
ausente.
