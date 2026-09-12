# Fontes oficiais TCE-PB — inventário e procedência (v2)

> Fonte de verdade local da missão POC. O executor **não acessa a web**: tudo que S1–S4 exigem deve estar salvo aqui. Arquivo exigido pela sessão e ausente = bloquear nomeando. Procedência registrada em `MANIFEST.json` (este diretório).

## Inventário — links diretos verificados em 18/07/2026 (seção 2026 de tce.pb.gov.br/layout-sagres-2/)

| # | Arquivo (nome REAL do download — não renomear) | Fonte | Bloqueia |
|---|---|---|---|
| 1 | `layout-contabilidade-2026-v1.1-12122025.html` (Export "HTML autocontido" do wiki; PDF aceito) | docs.tcepb.tc.br/books/dados-da-contabilidade/page/versao-11-12122025 — **versão-alvo: 2026 v1.1 de 12/12/2025** | **S1** |
| 2 | `Pcasp_2025.xlsx` (é o PCASP que a seção 2026 do portal linka; contém "Exige Retenção?") | tce.pb.gov.br/wp-content/uploads/2024/12/Pcasp_2025.xlsx | **S1** |
| 3 | `subelementos_2026.xlsx` | tce.pb.gov.br/wp-content/uploads/2025/12/subelementos_2026.xlsx | S1/S2 |
| 4 | `relacao_elemento_subelemento_2026.xlsx` | tce.pb.gov.br/wp-content/uploads/2025/12/relacao_elemento_subelemento_2026.xlsx | S1/S2 |
| 5 | `relacionamento_fonterecursos_co_2026.xlsx` (Fonte × CO — conversa com TR 4.3 e ementário 7.9) | tce.pb.gov.br/wp-content/uploads/2025/12/relacionamento_fonterecursos_co_2026.xlsx | S1/S2 |
| 6 | `SAGRES-Captura-2.0.pdf` (apresentação 09/07/2026) | tce.pb.gov.br/wp-content/uploads/2026/07/SAGRES-Captura-2.0.pdf | S3 (contexto) |
| 7 | OpenAPI/Swagger + JSON Schemas + tabelas de domínio do **Captura 2.0** | docs.tcepb.tc.br/shelves/sagres-captura-20 (e o que o TCE fornecer com o usuário de testes) | **S3 (transporte real)** |
| 8 | OpenAPI/Swagger da **API de consulta SAGRES vigente** | sagrescaptura.tce.pb.gov.br/api/docs · docs-api.tce.pb.gov.br | **S4** |

### Notas anti-bloqueio-fantasma
- **"Códigos elemento de despesa" NÃO é publicado como arquivo separado para 2026** (o portal só o publica até 2023). O domínio de elementos deriva do layout v1.1 + item 4. O executor não bloqueia por este arquivo.
- O PDF do Captura 2.0 (item 6) **não basta** para implementar endpoints/payloads (PATCH §4): sem o item 7, a S3 entrega DTO+validação+transport com **mock contratual bloqueado ou limitado ao schema disponível**, nomeando o que falta.
- Itens 7–8 podem chegar depois sem travar S1/S2.

## Regras deste diretório
1. **Não editar** arquivos baixados. Versão nova do TCE = arquivo novo com data no nome; nunca sobrescrever (golden files referenciam a versão).
2. Procedência em `MANIFEST.json`: Winner preenche `fonte/url/versao/dataPublicacao/dataDownload`; **o executor calcula e grava `sha256` no Passo 0 da S1** (hash atesta integridade a partir do repo).
3. Divergência entre estes arquivos e qualquer resumo em `docs/historico/poc-pregao-330-2026/missao-poc/PATCH.md` → **estes arquivos mandam**; divergência reportada no bloco verde.

## Credenciais TCE (duas, distintas — PATCH §6)
- **Captura 2.0 (testes 2026, obrigatório 2027):** solicitar usuário de testes ao suporte do TCE, informando participação no PE 330/2026 (SEFIN Campina Grande), pedindo também UG fictícia/homologação e OpenAPI/schemas atualizados.
- **API de consulta vigente:** atendimento formal é para empresas com contrato em vigor; solicitar apenas **orientação** enquanto o pregão corre. **Não declarar direito vigente.**
- Enquanto não chegarem: S4 roda em `MODO MOCK` sobre schema oficial versionado, por design.
