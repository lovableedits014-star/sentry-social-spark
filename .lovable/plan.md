# 🚀 Roadmap de Integrações Grátis — versão revisada

Análise do `github.com/public-apis/public-apis` concluída. **2 APIs adicionadas** ao plano (Nager.Date e Open-Meteo). O resto da lista é genérico/irrelevante para o público político brasileiro ou já coberto por fontes melhores.

Removidos definitivamente conforme suas instruções: Atividade Legislativa (Câmara/Senado), CRM com CNPJ, Portal da Transparência (CGU), OpenWeather, Telegram Bot, DeepL, alertas de clima via WhatsApp.

---

## 🌊 Onda 1 — Inteligência Eleitoral (TSE)

**Objetivo**: dar ao candidato/gestor uma visão histórica eleitoral do território onde ele atua.

### Fontes
- **TSE Dados Abertos** (`dadosabertos.tse.jus.br`) — sem chave, sem rate limit relevante.
  - Resultados de eleições anteriores por zona/seção
  - Declarações de bens dos candidatos
  - Filiação partidária

### Entregas frontend
- Nova aba **"Inteligência Eleitoral"** dentro do dashboard administrativo:
  - Card "Histórico do meu reduto": mostra desempenho do candidato (ou aliados) na última eleição por zona/seção
  - Mapa de calor textual (sem API de mapa, só painel) por bairro/zona
  - Comparativo "candidatos concorrentes na mesma região"

### Backend
- Edge Function `tse-fetch-electoral-data` — wrapper com cache.
- Tabela `tse_cache` (estilo `api_cache` genérico) com TTL de 30 dias (dados históricos não mudam).

---

## 🌊 Onda 2 — Contexto, Monitoramento e Calendário

### 2.1 IBGE — Contexto Socioeconômico
- **Fonte**: `servicodados.ibge.gov.br/api/v1` — sem chave.
- **Uso**: enriquecer painel Territorial com dados de renda, população, escolaridade por município/bairro. Permite segmentar discurso ("seus apoiadores no bairro X têm renda média de R$ Y, focar em discurso de Z").

### 2.2 GDELT 2.0 — Monitor de Imprensa
- **Fonte**: `api.gdeltproject.org/api/v2/doc/doc` — sem chave.
- **Uso**: alimenta o Detector de Crise existente com menções do nome do candidato/cidade na imprensa nacional/internacional. Sparkline de "volume de menções nos últimos 7 dias".

### 2.3 CEMADEN + INMET — Alertas Visuais de Clima
- **CEMADEN**: alertas ativos de risco hidrológico/geológico por município.
- **INMET**: avisos meteorológicos oficiais.
- **Uso**: badge visual no calendário de eventos da campanha — "evento na cidade X tem alerta laranja de chuva forte". **Sem disparo automático no WhatsApp** (conforme você definiu).

### 2.4 🆕 Open-Meteo — Previsão 7 Dias
- **Fonte**: `api.open-meteo.com/v1/forecast` — sem chave, ilimitado.
- **Uso**: complementa CEMADEN/INMET com previsão de 7 dias para eventos agendados. Permite remarcar com antecedência ("comício marcado pra sábado tem 80% de chuva").
- **Por que adicionar**: CEMADEN só mostra alerta *ativo*. Open-Meteo dá visão futura, que é o que importa pra planejar agenda.

### 2.5 🆕 Nager.Date — Feriados Brasileiros
- **Fonte**: `date.nager.at/api/v3/PublicHolidays/{ano}/BR` — sem chave, ilimitado.
- **Uso 1 (Disparos WhatsApp)**: bloquear ou alertar antes de agendar disparo em feriado nacional. Exibe aviso "atenção: 7 de setembro é feriado, taxa de leitura cai ~60%".
- **Uso 2 (Calendário de Campanha)**: pinta feriados automaticamente no calendário de eventos. Pré-popula sugestões: "Dia das Mães → mensagem temática para suas apoiadoras mães", "Dia do Trabalhador → ato com sindicatos".
- **Custo**: 1 fetch por ano por país, cacheável praticamente eterno.

---

## 🏗️ Arquitetura comum (todas as ondas)

### Tabela genérica de cache
```sql
create table public.api_cache (
  endpoint_key text primary key,        -- ex: 'tse:zona:RJ:2022', 'nager:BR:2026'
  payload jsonb not null,
  fetched_at timestamptz default now(),
  expires_at timestamptz not null
);
```
- TTL diferente por fonte: TSE = 30 dias, IBGE = 90 dias, GDELT = 1 hora, CEMADEN = 30 min, Open-Meteo = 1 hora, Nager = 1 ano.
- RLS: leitura pública (são dados públicos), escrita apenas service role.

### Edge Functions (uma por fonte)
- `tse-fetch-electoral-data`
- `ibge-fetch-context`
- `gdelt-fetch-mentions`
- `weather-alerts` (CEMADEN + INMET + Open-Meteo num só wrapper)
- `holidays-fetch` (Nager.Date)

Cada uma: valida input → consulta `api_cache` → se expirado, fetch externo → grava cache → retorna JSON. Fallback gracioso: se a fonte cair, retorna o último cache válido com flag `stale: true`.

### Sem segredos novos
Nenhuma das fontes selecionadas exige chave. Zero `add_secret`.

---

## ✅ Critérios de aceite

1. Aba "Inteligência Eleitoral" mostra resultado real do TSE para pelo menos 1 zona escolhida pelo gestor.
2. Painel Territorial exibe renda/população do IBGE para municípios cadastrados.
3. Detector de Crise mostra sparkline de menções na imprensa via GDELT.
4. Tela de criação de Disparo bloqueia/alerta quando data cai em feriado (Nager.Date).
5. Calendário de eventos pinta feriados nacionais automaticamente.
6. Card de evento agendado mostra previsão Open-Meteo + alerta CEMADEN/INMET (se houver).
7. Todas as chamadas externas passam pelo cache — segunda visita à mesma tela não bate na API externa.

---

## 📦 Ordem de execução sugerida

1. **Migração**: criar tabela `api_cache` (5 min).
2. **Onda 1 completa** (TSE + UI da aba Inteligência Eleitoral).
3. **Onda 2.5 (Nager.Date)** primeiro — é o mais barato e tem ganho imediato no módulo de Disparos que já existe.
4. **Onda 2.3+2.4 (Clima)** — wrapper único `weather-alerts`, integra no calendário.
5. **Onda 2.1 (IBGE)** — enriquecer painel Territorial.
6. **Onda 2.2 (GDELT)** — integra no Detector de Crise existente.

Sem mexer em RLS de tabelas existentes. Sem mexer em autenticação. Sem novas dependências npm relevantes (tudo `fetch` puro nas Edge Functions).
