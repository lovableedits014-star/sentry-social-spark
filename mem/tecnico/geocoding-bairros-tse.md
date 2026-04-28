---
name: Geocoding de Bairros TSE
description: Classificação de bairros das escolas/locais TSE usa Nominatim (OSM), nunca IA generativa
type: constraint
---
A edge function `geocode-tse-locais` usa GEOCODING REAL via Nominatim/OpenStreetMap (forward + reverse) para identificar o bairro de cada local de votação a partir de coordenadas GPS reais.

**Por quê:** Tentativas anteriores com Lovable AI (Gemini) alucinavam bairros (ex: classificou "Rua Palmácia, Campo Grande" como "Nova Lima" — erro grosseiro). Política: prefere VAZIO a errar.

**Como aplicar:**
- Rate limit obrigatório: 1.1s entre requests (Nominatim policy).
- User-Agent identificável obrigatório.
- Bairro extraído de `address.suburb || neighbourhood || city_district || quarter || residential`.
- Se OSM não retorna, grava string vazia (não inventa).
- NÃO usar LLM como fallback para inferir bairros geográficos.
