# Esperança/PB nos dados abertos do TCE-PB (código do município no Tribunal: 078)

Obtido em 01/10/2026 em https://dados-abertos.tce.pb.gov.br/ (download público, sem chave).

## Unidades gestoras

Fonte: `https://download.tce.pb.gov.br/dados-abertos/dados-por-municipio/078/despesas/despesas-{ano}.zip`, colunas
`codigo_unidade_gestora;descricao_unidade_gestora`. Anos consultados: 2010, 2015, 2018, 2021, 2022, 2023, 2024, 2025
e 2026. Os arquivos de despesa não foram versionados aqui (trazem credores com CPF); só o resumo abaixo.

| Código | Nome como está no Tribunal | Anos em que aparece (dos consultados) |
|---|---|---|
| 101078 | Câmara Municipal de Esperança | 2010 a 2026 |
| 201078 | Prefeitura Municipal de Esperança | 2010 a 2026 |
| 301078 | Autarquia Municipal de Proteção e Defesa do Consumidor - PROCON | 2022 a 2026 (ausente em 2021) |
| 601078 | Fundo de Previdência Social dos Serv. do Mun. de Esperança | 2010 a 2026 |
| 701078 | CONSÓRCIO IRMÃ LUCIANA - CONSÓRCIO INTERMUNICIPAL DO SERVIÇO SOCIOASSISTENCIAL DE ALTA COMPLEXIDADE | 2022 a 2026 (ausente em 2021) |

- Fundo Municipal de Saúde, Fundo Municipal de Assistência Social e o Hospital Municipal **não são UGs**: aparecem
  como unidades orçamentárias dentro da 201078 (02016, 02017).
- **Evidência temporal**: só o ano em que o código aparece nas despesas. Os dados não trazem a data de criação da UG.
  A data de início de vigência não se deduz daqui; o cadastro da UG neste sistema cita esta evidência e a data que
  o ente confirmar.
- O CNPJ 08.993.909/0001-08 é do município (fonte: SNC, `snc.cultura.gov.br/adesao/detalhar/2506004`). Ele não se
  reutiliza para a Câmara, o FUNPREVE, o PROCON ou o consórcio. A razão social cadastral ("MUNICIPIO DE
  ESPERANCA", segundo agregador não oficial dos dados da Receita) ainda não foi conferida no comprovante oficial.

## Licitações e o protocolo do Tramita

`licitacoes-2026-protocolos-DERIVADO.csv`: derivado de
`https://download.tce.pb.gov.br/dados-abertos/dados-por-municipio/078/licitacoes/licitacoes-2026.zip`
(zip sha256 `938a4cb7be97e3200cd620b39d87720dca0f8dfda217a00702a50ffacd9711c7`; CSV interno sha256
`abd9a16ea88eabe7ceff8563ea4eadb1111584e074da3ac781f9809282fb1173`) por `scripts/fontes/derivar-licitacoes-tce-pb.mjs`.
Só as colunas do vínculo (UG, número da licitação, protocolo, ano e modalidade); proponentes com nome e CPF/CNPJ não
saem. Derivado: sha256 `32027bab275c90db03d98095dd56495cb2ed4f3ee7f95e268075d73bfa3c4020`; 130 licitações distintas
(UG 201078: 118; 301078: 6; 101078: 3; 601078: 3).

- `numero_licitacao` vem como `NNNNN/AAAA`. O §4.38 do leiaute pede o "Número da Licitação" com 9 posições (origem
  Tramita): os 5 dígitos e o ano, sem a barra.
- `numero_protocolo_tce` vem como `Doc. NNNNN/AA` ou `Doc. NNNNNN/AA` (113 e 17 casos; 125 do ano 26 e 5 do ano 25). É o protocolo do documento no
  Tramita, prova da correspondência; não é o número da licitação nem o identificador do PNCP.

## O que não foi obtido

- Banco de legislação do TCE-PB (`legislacao.tce.pb.gov.br`): respondeu HTTP 403. O protocolo da Lei 613/2025 no
  banco de legislação não foi localizado; ele vem do comprovante de envio que o município recebeu.
- Consulta ao Tramita por jurisdicionado: exige sessão (login). Não usada.
