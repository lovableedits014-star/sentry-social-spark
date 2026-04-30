## Boletim Semanal — fluxo dedicado

Hoje o tipo "boletim" usa o mesmo prompt das outras matérias e tenta ler de uma tabela `posts` que **não existe** no banco. Resultado: ele inventa ou repete informações da memória. Vamos transformar o boletim num **fluxo próprio**, alimentado pelas postagens reais do candidato na semana + ações externas registradas, e renderizar como uma retrospectiva semanal.

### O que muda na UI (Nova matéria)

Quando o usuário escolhe **Tipo = Boletim semanal**, o painel troca os campos:

- Esconde "Transcrições-fonte" e "Briefing" (não fazem sentido aqui).
- Mostra:
  - **Período da semana** (default: últimos 7 dias) — dois `<input type="date" />` (início/fim) que o usuário pode ajustar.
  - **Incluir** (checkboxes): Postagens em redes sociais ✓, Ações externas / agenda ✓, Visitas registradas ✓.
  - Campo **Tema/foco da semana** (opcional) — ex: "ênfase em saúde".
- Botão "Gerar boletim".

### O que muda no backend

Nova edge function dedicada **`ic-write-boletim`** (separada do `ic-write-materia` para não poluir o prompt principal):

1. **Coleta de fontes da semana** (intervalo `since`/`until`):
   - **Posts únicos**: agrega `comments` por `post_id` no período, recuperando `post_message`, `post_permalink_url`, `platform`, `post_full_picture`, e métricas derivadas (nº de comentários, distribuição de sentimento positivo/negativo/neutro).
   - **Ações externas**: `acoes_externas` com `data_inicio` no período (titulo, local, cadastros coletados vs meta).
   - **Visitas**: `narrativa_visitas_realizadas` no período (município, bairros, temas).
2. **Pré-processa** em JSON estruturado: lista de posts (com 1ª linha do texto, plataforma, engajamento), lista de ações, lista de visitas. Isso vira o "material bruto" passado para a IA — sem inventar, ela só organiza/redige.
3. **Prompt específico** para boletim: estrutura obrigatória com (a) abertura "Resumo da semana de X a Y", (b) seções por categoria detectada (Saúde, Educação, etc — inferidas dos textos dos posts), (c) bullets concretos com link para cada post quando houver `post_permalink_url`, (d) bloco "Em números" (ex: 12 postagens, 340 comentários, 3 ações de rua), (e) fechamento com "Próxima semana".
4. Salva em `materias_geradas` com `tipo = 'boletim'` e `fontes = { post_ids, acao_ids, visita_ids, periodo: {since,until}, stats }`. Sem auditoria por parágrafo (não se aplica) — em vez disso, `fontes.posts_referenciados` lista cada post com link para abrir no Facebook/Instagram.

### O que muda na visualização

Quando `tipo === 'boletim'`:

- Renderiza o markdown normalmente (mesma tipografia editorial), mas adiciona acima do corpo um **bloco "Cobertura da semana"** com mini-cards: ícone da plataforma + 1ª linha do post + métrica (nº comentários, sentimento dominante) + link "Ver post →" abrindo `post_permalink_url`.
- Esconde o painel "Auditoria por parágrafo" e o painel "Rastreabilidade [F1][F2]" (irrelevantes para boletim).
- Mantém Reprocessar e Histórico — útil para reescrever com outra ênfase.

### Detalhes técnicos

- **Posts únicos a partir de comments**: 
  ```sql
  select post_id, max(post_message) as message, max(post_permalink_url) as url,
         max(platform) as platform, max(post_full_picture) as picture,
         min(comment_created_time) as first_seen,
         count(*) as total_comments,
         count(*) filter (where sentiment='positive') as pos,
         count(*) filter (where sentiment='negative') as neg,
         count(*) filter (where sentiment='neutral')  as neu
  from comments
  where client_id = $1 and is_page_owner = true 
    and comment_created_time between $since and $until
  group by post_id
  order by first_seen desc
  ```
  *(filtramos por `is_page_owner=true` opcionalmente para garantir que é post do candidato — verifico se há flag melhor; senão pegamos todos os `post_id` que apareceram no intervalo).*
- O frontend hoje em `MateriasPanel.tsx` faz `supabase.functions.invoke("ic-write-materia", ...)`. Para boletim, vai invocar `ic-write-boletim` com `{ clientId, since, until, tema, incluir: { posts, acoes, visitas } }`.
- A renderização da tela atual (artigo com ReactMarkdown) é reaproveitada — só muda o pré-cabeçalho de mini-cards e a remoção dos painéis de auditoria.

### Arquivos afetados

- **Novo**: `supabase/functions/ic-write-boletim/index.ts`
- **Editado**: `src/components/inteligencia-conteudo/MateriasPanel.tsx` (UI condicional por tipo + invocação + cards de cobertura)
- **Editado**: `supabase/functions/ic-write-materia/index.ts` (remove tentativa morta de ler tabela `posts` inexistente)

### Pontos abertos (responda só se quiser mudar o default)

1. Default do período = **últimos 7 dias terminando hoje**. OK?
2. Quando não houver nenhum post no período, o sistema deve **avisar e não gerar**, ou gerar uma nota "semana sem postagens registradas"? Sugestão: avisar e bloquear geração para evitar conteúdo vazio.
3. Você quer **agrupamento automático por tema** (a IA detecta saúde/educação/mobilidade) ou **ordem cronológica simples** (segunda → domingo)? Sugestão: por tema, porque é mais legível como retrospectiva.