

# Plano: Vídeo Explicativo do Sentinelle

## Visão Geral

Vídeo de ~25 segundos em formato MP4 (1920x1080, 30fps) apresentando as funcionalidades do Sentinelle para clientes potenciais. Será criado com Remotion (React + código) e renderizado via CLI.

## Direção Criativa

- **Paleta**: Azul profundo (#1a56db primary), branco, cinza escuro (#1e293b), com acentos em verde (#10b981), violeta (#7c3aed) e âmbar (#f59e0b) — extraídos do design system do projeto
- **Fonte**: Inter (display) + Inter (body) — consistente com a identidade do sistema
- **Estilo**: Tech Product — clean, profissional, transições rápidas e snappy
- **Motifs**: Cards com ícones, linhas de grid sutis, gradientes suaves

## Estrutura do Vídeo (6 cenas, ~25s)

1. **Abertura** (3s) — Logo "Sentinelle" com tagline "Inteligência Política Digital"
2. **Redes Sociais** (4s) — Ícones de Comentários, IA, Radar, Detector de Crise animando em grid
3. **CRM Político** (4s) — Cards de Base Política, Funil de Leads, QR Code, WhatsApp
4. **Mobilização** (4s) — Missões IA, Multiplicadores, Ranking, Check-in
5. **Operacional + Inteligência** (5s) — Campanha, Contratados, Territorial, IED, Telemarketing
6. **Encerramento** (5s) — "Controle total da sua presença digital" + branding final

## Detalhes Técnicos

- Projeto criado em `/dev-server/remotion/` com Remotion + React + Tailwind
- Cada cena em arquivo separado (`src/scenes/`)
- Transições via `@remotion/transitions` (wipe/slide)
- Animações via `useCurrentFrame()` + `interpolate()`/`spring()`
- Renderização headless via script programático
- Output: `/mnt/documents/sentinelle-video.mp4`

