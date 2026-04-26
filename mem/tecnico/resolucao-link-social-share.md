---
name: Resolução de links de share de redes sociais
description: Edge Function resolve-social-link segue redirects do Facebook/Instagram para extrair o handle real automaticamente, suportando links curtos como facebook.com/share/xxx
type: feature
---
A Edge Function `resolve-social-link` resolve links "obscurecidos" de redes sociais (ex: `facebook.com/share/1bGUhmcd66/`, `fb.me/x`) e devolve o `usuario` (handle) real + URL canônica.

Estratégia:
1. Tenta extrair o handle direto da URL (rápido, sem rede).
2. Se a URL é um link de share/curto, faz `fetch` com `redirect: 'follow'` usando User-Agent de bot (`facebookexternalhit/1.1`, `Googlebot`) que recebe redirects "limpos" sem página intersticial JS.
3. Lê `res.url` final — caso seja `/login/?next=<perfil>`, decodifica o `next`.
4. Fallback: extrai do HTML via `og:url`, `<link rel="canonical">`, `userVanity` (FB) ou `username` (IG).

Integrado no `SocialLinkCapture` em `RegistroPessoa.tsx` e em `extractHandleFromUrl` (`src/lib/social-url.ts`). Quando o atendente cola um link de share, o frontend chama a função e completa o cadastro automaticamente — atendente não precisa pedir nada extra ao apoiador.
