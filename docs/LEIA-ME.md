# Índice dos documentos

Todo documento que diz como construir o sistema, o que medir e o que já foi decidido
está listado aqui. As regras estão em `CLAUDE.md`, na raiz — este arquivo é o mapa.

## 0. O modo de trabalho vigente

Desde 2026-09-12 vale a **orquestração contínua** (`docs/lotes/V3-orquestracao-continua.md`,
resumida em `CLAUDE.md`, "Modo de trabalho"): não se para para revisão a cada lote, a
verificação durante a construção é direcionada, e o portão integral fica para o candidato
de homologação/implantação. O regime anterior — um lote, um portão de dez passos, uma
revisão — está preservado como histórico nas seções do `ESTADO-EXECUCAO.md` e nos pedidos
antigos de `docs/lotes/`; ele **não se segue mais**. Onde um documento antigo disser "pare
no gate", vale o modo vigente.

Desde 2026-09-13 vale também a **V6** (`docs/lotes/V6-produto-integrado.md`): ela substitui
SOMENTE a prioridade temporal e de publicação da V5 — construção contínua do produto integrado
(P0 identidade e shell → P1 vínculos → P2 RH/folha/portal do servidor → P3 processos e canais →
P4 mensagens, documentos e observabilidade), sem esperar alvo de hospedagem. Regras de negócio,
ADRs e evidências anteriores permanecem.

## 1. Para executar uma unidade de trabalho

1. `CLAUDE.md` — as regras. Toda sessão o carrega sozinha.
2. `ESTADO-EXECUCAO.md`, seção "O próximo passo" — onde paramos.
3. `docs/lotes/<lote>.md` — o que o pedido vigente pede (hoje o V6, `docs/lotes/V6-produto-integrado.md`).
4. O `MODULO.md` de cada módulo que o lote toca. Ligar ao que existe exige ler o
   módulo ligado, não só o módulo alvo.
5. `docs/instrucoes/` — o detalhe, quando o lote ou o `MODULO.md` não bastar.
6. `docs/edital/` — quando o texto exato de uma cláusula importar.

## 2. Precedência, quando dois documentos divergem

1. **Invariantes e proibições de `CLAUDE.md`** vencem qualquer outro documento,
   o pedido de lote incluído.
2. **O pedido do lote** (`docs/lotes/`) define o escopo do lote.
3. **O `MODULO.md`** explica o código do módulo e os porquês dele.
4. **`docs/instrucoes/`** é o detalhamento: hierarquia de evidências, arquitetura
   multi-ente, telas e rotas, integrações, definição de concluído.
5. **`docs/historico/`** não se segue. Está ali para consulta.

Divergência encontrada se registra — o que cada fonte diz e a consequência. Não se
corrige um documento em silêncio.

## 3. Frente não é lote

O prompt mestre divide o produto em **frentes** ENT00 a ENT11. A execução numera
**lotes**, e a partir do ENT04 os números deixaram de coincidir com as frentes.

| Lote executado | O que foi | Frente do prompt mestre | Onde está o resultado |
|---|---|---|---|
| ENT00 | preservação, ambiente, baselines | ENT00 | `ESTADO-EXECUCAO.md`, início |
| ENT01 | contexto, identidade, primeira despesa | ENT01 | `ESTADO-EXECUCAO.md`, "ENT01" |
| ENT02 | capacidades transversais | ENT02 | seções 1 a 10 |
| ENT03, 03a, 03b, 03c | financeiro, tesouraria, molde, censo | ENT03 | seções 11 a 17 |
| ENT04 | seeds oficiais do PCASP, casca de navegação | ENT03 (não é a frente de pessoal) | seção 18 |
| ENT05 | modelo das três seções: compra, almoxarifado, bem | ENT05 | seção 20 |
| ENT06 item 0 | telas das três seções do ENT05 | ENT05 (não é a frente de arrecadação) | seção 21 |
| ENT06 itens 1–3 | conceder ação a perfil; liquidação de material (parada); eixo da data | ENT05 / transversal | seções 23 a 27 |
| ENT07 | o acervo: classe e bem | ENT05 | seção 28 |
| ENT08 | eixo de gestão do bem | ENT05 | seção 29 |
| ENT09 | etiqueta do bem | ENT05 | seção 31 |
| ENT10 | autorização de leitura por unidade | transversal (M16) | seção 32 |
| ENT11 | roteiro contábil do patrimônio | ENT05 / ENT03 | seção 33 |
| ENT12 | eixo de valor do bem | ENT05 | seção 34 |
| V3 (orquestração contínua) | pacotes por capacidade, sem gate por lote | todas — ver `docs/lotes/V3-orquestracao-continua.md` | seção 35 em diante |
| V4 | sessão noturna: percursos sob o build e Fila A | planejamento, contratação, compras | seção 50 |
| V5 | demonstração comercial: nota recebida e empenho×ordem | Fila A (despesa/compras); B/C fora da oferta | seção 51; `docs/lotes/V5-demonstracao-24h.md`; `docs/demo/` |
| V6 | produto integrado: identidade configurável, shell, vínculos, RH, canais | P0 transversal (M16 apresentação); P1 M11/M04/M09; P2 pessoal; P3 M21/M22/canais; P4 transversal | seção 52 em diante; `docs/lotes/V6-produto-integrado.md` |

As frentes ainda não abertas estão em `docs/instrucoes/GABARITO-DE-LOTE-E-FRENTES-04-11.md`:
ENT04 pessoal, ENT05 suprimentos/patrimônio/frota, ENT06 cadastros fiscais e
arrecadação, ENT07 fiscal eletrônico, ENT08 procuradoria, ENT09 canais, ENT10 serviços
setoriais e urbanismo, ENT11 migração, desempenho, operação e entrega.

**Ao abrir um lote, nomeie os dois:** o número do lote e a frente a que ele serve.

## 4. O mapa

### O que seguir para construir — `docs/instrucoes/`

| Arquivo | O que é |
|---|---|
| `PROMPT-MESTRE-IMPLEMENTACAO.md` | missão, hierarquia de evidências, arquitetura multi-ente, telas e rotas, integrações, definição de concluído. "Comece pelo prompt 00" já foi cumprido |
| `MAPA-DE-LACUNAS.md` | as 2.037 cláusulas cruzadas com o código: de onde parte cada bloco |
| `GABARITO-DE-LOTE-E-FRENTES-04-11.md` | o molde para escrever um lote novo, e o briefing de cada frente restante |
| `especificacoes/CONTRATO-FUNCIONALIDADE.json` | formato do contrato preenchido antes de cada funcionalidade |
| `especificacoes/PRIMEIRA-ENTREGA.md` | especificação do ENT01 |
| `especificacoes/ESTADO-EXECUCAO.modelo.md` | modelo do checkpoint |
| `arquitetura.md` | stack, regra do Decimal, razão de perna única, banco de teste isolado, armadilhas do Prisma 7 |
| `MODULO.template.md` | modelo do `MODULO.md` de um módulo novo |

Junto do código, porque se leem antes dele: `modules/*/MODULO*.md`,
`components/ui/MODULO-UI.md`, `adapters/tribunais/*/MODULO.md`.

### O que cada lote pediu — `docs/lotes/`

ENT00 a ENT03 e ENT06 item 0. **Faltam** ENT03a, ENT03b, ENT03c, ENT04 e ENT05: foram
escritos no chat e não chegaram a arquivo. O resultado de cada um está no
`ESTADO-EXECUCAO.md`; o pedido, não.

### A medida — `docs/edital/`

| Arquivo | O que é |
|---|---|
| `Termo_de_referencia.pdf` | a fonte oficial, 189 páginas |
| `catalogo-execucao.json` | as 2.037 cláusulas e a situação de cada uma. Escrito só por `scripts/marcar-catalogo.ts` |
| `condicoes-operacionais-e-contexto.json` | as condições que não são cláusula |
| `resultado-auditoria.json` | auditoria estrutural do catálogo contra o PDF. Não valida implementação |
| `gerar-catalogo.py`, `gerar-condicoes.py`, `.cache-tr-layout.txt` | como o catálogo foi gerado, e o texto intermediário versionado de propósito |

### O que já foi decidido ou medido

`docs/adr/` (decisões aceitas), `docs/caracterizacao/` (comportamento medido),
`docs/varreduras/` (decisões de modelo levantadas, várias ainda abertas),
`docs/dependencias-externas.md`, `docs/doador.md`, `docs/oficial/` (normativo de
tribunal, com manifesto), `docs/poc-fixtures/` (massa lida por teste — não mover).

### Superado — `docs/historico/`

| Pasta | O que é | Por que não se segue |
|---|---|---|
| `pacote-de-execucao/` | README do pacote, `INSTRUCAO-CONTINUACAO.md`, `CONTEXTO-SIAFIC-E-SAAS-MUNICIPAL.md` | retratos de 2026-09-09, antes de o pacote entrar aqui |
| `poc-pregao-330-2026/` | `README-POC.md`, roteiro de apresentação, `missao-poc/` | missão da POC de julho, encerrada |
| `apresentacao-pregao-90023-2026/` | roteiro, checklist e plano B | apresentação do produto antigo |

## 5. Fora deste repositório

| Onde | O que é | Situação |
|---|---|---|
| `../saas-municipal` | produto antigo | congelado em `doador/saas-municipal`; sai quando as duas extrações de `docs/doador.md` estiverem feitas |
| `../siafic-cg` | versão anterior deste repositório | todo arquivo dela existe aqui; nada a trazer |
| `../gestao-publica-execucao` | o pacote de planejamento | absorvido em `docs/edital`, `docs/instrucoes`, `docs/lotes` e `docs/historico`, com histórico |
| sistema de saúde, no GitHub | código pronto | entra como módulo daqui se um termo de referência pedir |
