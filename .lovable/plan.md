
# Narrativa Política — Plano final aprovado

Com base nas suas 4 decisões, está tudo definido. Antes de implementar, recapitulo a versão final pra você confirmar.

## Decisões consolidadas

1. **Localização**: nova aba dentro de `/inteligencia-eleitoral` (ao lado de Prefeito 2024, Vereador 2024, Composição de Chapa, etc.)
2. **Perfil do candidato**: editado dentro da própria aba (botão "Configurar Candidato" no topo, abre dialog)
3. **Saída IA**: gera as 3 versões (popular/técnico/emocional) já no primeiro clique
4. **Memória de campanha**: registrada e visível, sem alerta automático nessa primeira versão

## Estrutura final da aba

```text
┌─ Inteligência Eleitoral ────────────────────────────────────┐
│ [Prefeito 24] [Vereador 24] [Chapa] ... [📣 Narrativa]     │ ← nova aba
├─────────────────────────────────────────────────────────────┤
│ Cidade: [Campo Grande/MS ▾]  [Configurar Candidato] [Gerar] │
├─────────────────────────────────────────────────────────────┤
│ 1. RAIO-X RELÂMPAGO                                         │
│    Quem governa • Margem da última eleição • Rejeição local │
├─────────────────────────────────────────────────────────────┤
│ 2. MAPA DE DOR                                              │
│    🔴 EXPLOSIVA   🟡 LATENTE   ⚪ SILENCIOSA                │
│    cada card: número + fonte + ano + selo Impacto Digital   │
│    + frase de ataque (3-camadas) + frase de proposta        │
├─────────────────────────────────────────────────────────────┤
│ 3. OPORTUNIDADE POLÍTICA                                    │
│    🟢 Forte (alta dor + ninguém atua + alinha bandeira)    │
│    🟡 Disputa  ⚪ Não prioritário                           │
├─────────────────────────────────────────────────────────────┤
│ 4. POSICIONAMENTO DO CANDIDATO                              │
│    3 ângulos cruzando bandeiras × dores explosivas          │
├─────────────────────────────────────────────────────────────┤
│ 5. ROTEIRO ESTRATÉGICO (Onda 2)                             │
│    Cada parada: local • objetivo • emoção • fala • imagem   │
├─────────────────────────────────────────────────────────────┤
│ 6. CONTEÚDO PRONTO                                          │
│    Discurso 3min  [Popular] [Técnico] [Emocional]           │
│    Reels 30s • 5 headlines • 3 ataques 3-camadas            │
│    [Copiar] [PDF] [WhatsApp]                                │
├─────────────────────────────────────────────────────────────┤
│ MEMÓRIA DE CAMPANHA (lateral): últimas 5 cidades + temas    │
└─────────────────────────────────────────────────────────────┘
```

## Onda 1 — MVP arma de combate (entrega rápida)

### Banco (1 migration)
- `narrativa_perfil_candidato` (client_id PK, bandeiras text[], estilo, tom, biografia)
- `narrativa_dossies` (client_id, codigo_ibge, payload jsonb, gerado_em, expires_at)
- `narrativa_visitas_realizadas` (client_id, codigo_ibge, data_visita, temas_usados text[], discurso_id, observacoes)
- RLS por `client_id` em todas; reuso total da `api_cache`

### Edge Functions (3 nesta onda)
1. **`narrativa-coleta`** — orquestra IBGE + TSE local + GDELT + DataSUS (CNES) + INEP/QEdu em paralelo, salva em `api_cache`
2. **`narrativa-analise`** — calcula escores Dor + Oportunidade Política + Impacto Digital; monta JSON estruturado
3. **`narrativa-gerar`** — recebe dossiê + perfil candidato + memória → gera 3 versões de discurso, Reels, headlines, ataques 3-camadas

### Frontend
- Nova aba `<TabsContent value="narrativa">` em `InteligenciaEleitoral.tsx`
- Componente principal `NarrativaPolitica.tsx`
- Subcomponentes: `RaioXSection`, `MapaDorSection`, `OportunidadeSection`, `PosicionamentoSection`, `ConteudoSection`, `MemoriaCampanhaPanel`
- `MunicaoCard` reutilizável (número + fonte + selo Impacto + frase ataque + frase proposta + copiar)
- `PerfilCandidatoDialog` (botão no topo)
- React Query com `staleTime: Infinity`

### IA (Lovable AI Gateway, sem chave)
- `google/gemini-2.5-pro` para Análise estratégica (Dor + Posicionamento)
- `google/gemini-2.5-flash` para Conteúdo (3 versões + Reels + headlines)

### Fontes nesta onda
IBGE, TSE (já temos), GDELT (já temos), DataSUS/CNES, INEP/QEdu

### Saídas
3 discursos completos + Reels + 5 headlines + 3 ataques estruturados + PDF + WhatsApp

## Onda 2 (depois, quando pedir)
- Seção 5 Roteiro Estratégico com locais reais por zona
- Bairro Inferido (cruza zona TSE × CNES × INEP × GDELT)
- SNIS, IPEA, Tesouro, Câmara/emendas
- Cron "Cidade do Dia"

## O que NÃO vamos fazer (compromisso firme)
- Não inventar dado de bairro que não existe (qualquer inferência vem rotulada)
- Não disparar nada automático no WhatsApp (sempre revisão manual)
- Não usar mapa geográfico externo
- Não criar 9 módulos — tudo em 1 aba

## Próximo passo
Se aprovar este plano, eu começo pela Onda 1 inteira: schema + 3 edge functions + UI completa + integração com o IBGE/TSE/GDELT/DataSUS/INEP. Entrega funcional ponta a ponta.

Pode aprovar?
