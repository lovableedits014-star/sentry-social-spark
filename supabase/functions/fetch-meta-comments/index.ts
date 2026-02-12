/**
 * fetch-meta-comments - Edge Function
 * 
 * Refatorada para:
 * 1) Usar EXCLUSIVAMENTE Page Access Token para Facebook
 * 2) Buscar comentários DENTRO do contexto da página (/{page-id}/posts?fields=comments{from{...}})
 * 3) Resolver identidade ANTES de salvar (social_profiles)
 * 4) Nunca salvar comentário sem identidade mínima (ou marcá-lo como author_unavailable)
 * 5) Log detalhado de permissões, endpoints, e campos retornados
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { getClientLLMConfig, callLLM, type LLMMessage, type LLMConfig } from '../_shared/llm-router.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const RequestSchema = z.object({
  clientId: z.string().uuid(),
  postsLimit: z.coerce.number().int().min(1).max(30).optional(),
});

// ==== UTILITIES ====

function buildGraphUrl(path: string, params: Record<string, string>): string {
  const normalized = path.replace(/^\//, '');
  const url = new URL(`https://graph.facebook.com/v21.0/${normalized}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

async function fetchAllGraphPages<T>(initialUrl: string, opts?: { maxPages?: number }): Promise<T[]> {
  const maxPages = opts?.maxPages ?? 100;
  const items: T[] = [];
  let url: string | null = initialUrl;
  let pages = 0;

  type GraphPage<U> = { data?: U[]; paging?: { next?: string } };

  while (url && pages < maxPages) {
    pages++;
    const resp = await fetch(url);
    if (!resp.ok) {
      try {
        const err = await resp.json();
        console.error('Graph API page fetch failed', { url, err });
      } catch {
        console.error('Graph API page fetch failed', { url, status: resp.status });
      }
      break;
    }
    const json = (await resp.json()) as GraphPage<T>;
    if (Array.isArray(json?.data)) items.push(...json.data);
    url = json?.paging?.next ?? null;
  }

  return items;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ==== TYPES ====

interface SocialProfile {
  id: string;
  platform: string;
  platform_user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

interface CommentInsert {
  client_id: string;
  comment_id: string;
  post_id: string;
  text: string;
  author_name: string | null;
  author_id: string | null;
  author_profile_picture: string | null;
  platform: string;
  platform_user_id: string | null;
  social_profile_id: string | null;
  author_unavailable: boolean;
  author_unavailable_reason: string | null;
  status: string;
  sentiment: string;
  post_message: string | null;
  post_permalink_url: string | null;
  post_full_picture: string | null;
  post_media_type: string | null;
  comment_created_time: string | null;
  parent_comment_id: string | null;
  is_page_owner: boolean;
}

interface SyncStats {
  totalComments: number;
  newComments: number;
  updatedComments: number;
  facebookComments: number;
  instagramComments: number;
  facebookMissingAuthors: number;
  instagramMissingUsernames: number;
  profilesCreated: number;
  profilesUpdated: number;
}

// ==== IDENTITY RESOLUTION ====

/**
 * Resolves a social profile: upserts into social_profiles and returns the row.
 */
async function resolveProfile(
  supabase: SupabaseClient,
  clientId: string,
  platform: 'facebook' | 'instagram',
  platformUserId: string,
  username: string | null,
  displayName: string | null,
  avatarUrl: string | null
): Promise<{ profile: SocialProfile | null; created: boolean; updated: boolean }> {
  // Check if exists
  const { data: existing, error: findError } = await supabase
    .from('social_profiles')
    .select('*')
    .eq('client_id', clientId)
    .eq('platform', platform)
    .eq('platform_user_id', platformUserId)
    .maybeSingle();

  if (findError) {
    console.error('Error finding social profile:', findError);
    return { profile: null, created: false, updated: false };
  }

  if (existing) {
    // Possibly update if we have new info
    const updates: Record<string, unknown> = { last_seen: new Date().toISOString() };
    if (!existing.username && username) updates.username = username;
    if (!existing.display_name && displayName) updates.display_name = displayName;
    if (!existing.avatar_url && avatarUrl) updates.avatar_url = avatarUrl;

    const needsUpdate =
      Object.keys(updates).length > 1 ||
      (avatarUrl && existing.avatar_url !== avatarUrl);

    if (needsUpdate) {
      if (avatarUrl) updates.avatar_url = avatarUrl;
      const { error: updateError } = await supabase
        .from('social_profiles')
        .update(updates)
        .eq('id', existing.id);
      if (updateError) console.warn('Error updating social profile:', updateError);
      return { profile: { ...existing, ...updates } as SocialProfile, created: false, updated: true };
    }
    return { profile: existing as SocialProfile, created: false, updated: false };
  }

  // Insert new
  const { data: inserted, error: insertError } = await supabase
    .from('social_profiles')
    .insert({
      client_id: clientId,
      platform,
      platform_user_id: platformUserId,
      username,
      display_name: displayName,
      avatar_url: avatarUrl,
    })
    .select()
    .single();

  if (insertError) {
    console.error('Error inserting social profile:', insertError);
    return { profile: null, created: false, updated: false };
  }

  return { profile: inserted as SocialProfile, created: true, updated: false };
}

// ==== FACEBOOK FETCH ====

async function fetchFacebookPostsWithComments(
  accessToken: string,
  pageId: string,
  postsLimit: number
): Promise<{ posts: any[]; log: string[] }> {
  const log: string[] = [];

  // Fetch posts with comments - use smaller limit per page to avoid "reduce the amount of data" error
  const commentFields = 'id,message,created_time,from{id,name,picture.width(100).height(100)},comment_count';
  const postFields = `id,message,created_time,full_picture,permalink_url,attachments{media_type},comments.limit(50){${commentFields}}`;

  // Fetch in smaller pages to avoid API limit errors
  const pageSize = Math.min(postsLimit, 10);
  const url = buildGraphUrl(`${pageId}/posts`, {
    fields: postFields,
    limit: String(pageSize),
    access_token: accessToken,
  });

  log.push(`[FB] Endpoint: /${pageId}/posts?fields=...&limit=${pageSize} (target: ${postsLimit})`);

  const resp = await fetch(url);
  if (!resp.ok) {
    const errBody = await resp.text();
    log.push(`[FB] Error ${resp.status}: ${errBody}`);
    console.error('Error fetching Facebook posts:', errBody);
    return { posts: [], log };
  }

  const json = await resp.json();
  let posts = json?.data ?? [];
  
  // Paginate to get more posts if needed
  if (posts.length < postsLimit && json?.paging?.next) {
    let nextUrl: string | null = json.paging.next;
    while (posts.length < postsLimit && nextUrl) {
      const nextResp = await fetch(nextUrl);
      if (!nextResp.ok) break;
      const nextJson = await nextResp.json();
      posts = [...posts, ...(nextJson?.data ?? [])];
      nextUrl = nextJson?.paging?.next ?? null;
    }
    posts = posts.slice(0, postsLimit);
  }
  
  log.push(`[FB] Posts returned: ${posts.length}`);

  // For each post, paginate comments if needed
  for (const post of posts) {
    if (post.comments?.paging?.next) {
      const moreComments = await fetchAllGraphPages<any>(post.comments.paging.next);
      post.comments.data = [...(post.comments.data || []), ...moreComments];
      log.push(`[FB] Post ${post.id}: paginated to ${post.comments.data.length} comments`);
    }

    // Also fetch nested replies for each comment
    for (const comment of post.comments?.data || []) {
      if (comment.comment_count > 0) {
        const repliesUrl = buildGraphUrl(`${comment.id}/comments`, {
          fields: 'id,message,created_time,from{id,name,picture.width(100).height(100)}',
          limit: '100',
          access_token: accessToken,
        });
        const replies = await fetchAllGraphPages<any>(repliesUrl);
        comment.replies = { data: replies };
      }
    }
  }

  return { posts, log };
}

// ==== INSTAGRAM FETCH ====

async function fetchInstagramMediaWithComments(
  accessToken: string,
  igAccountId: string,
  postsLimit: number
): Promise<{ media: any[]; log: string[] }> {
  const log: string[] = [];

  const mediaUrl = buildGraphUrl(`${igAccountId}/media`, {
    fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp',
    limit: String(postsLimit),
    access_token: accessToken,
  });

  log.push(`[IG] Endpoint: /${igAccountId}/media`);

  const resp = await fetch(mediaUrl);
  if (!resp.ok) {
    const errBody = await resp.text();
    log.push(`[IG] Error ${resp.status}: ${errBody}`);
    console.error('Error fetching Instagram media:', errBody);
    return { media: [], log };
  }

  const json = await resp.json();
  const media = json?.data ?? [];
  log.push(`[IG] Media returned: ${media.length}`);

  // For each media, fetch comments
  for (const m of media) {
    const commentsUrl = buildGraphUrl(`${m.id}/comments`, {
      fields: 'id,text,username,timestamp,replies{id,text,username,timestamp}',
      limit: '100',
      access_token: accessToken,
    });

    const comments = await fetchAllGraphPages<any>(commentsUrl);
    m.comments = { data: comments };
    log.push(`[IG] Media ${m.id}: ${comments.length} comments`);
  }

  return { media, log };
}

// ==== PERSISTENCE ====

async function persistComments(
  supabase: SupabaseClient,
  clientId: string,
  rows: CommentInsert[]
): Promise<{ inserted: number; updated: number }> {
  if (rows.length === 0) return { inserted: 0, updated: 0 };

  // De-dupe by comment_id
  const dedup = new Map<string, CommentInsert>();
  for (const r of rows) dedup.set(r.comment_id, r);
  const uniqueRows = Array.from(dedup.values());

  // Get existing comments for this client
  const commentIds = uniqueRows.map((r) => r.comment_id);
  const { data: existing, error } = await supabase
    .from('comments')
    .select('id, comment_id, social_profile_id, author_unavailable, is_page_owner, parent_comment_id')
    .eq('client_id', clientId)
    .in('comment_id', commentIds);

  if (error) {
    console.error('Error reading existing comments:', error);
  }

  const existingByCommentId = new Map<string, any>();
  for (const row of existing ?? []) existingByCommentId.set(row.comment_id, row);

  const inserts: CommentInsert[] = [];
  const updates: Array<{ id: string; data: Record<string, unknown> }> = [];

  for (const r of uniqueRows) {
    const ex = existingByCommentId.get(r.comment_id);
    if (!ex) {
      inserts.push(r);
      continue;
    }

    // Update if we now have a profile or better data
    const data: Record<string, unknown> = {};
    if (!ex.social_profile_id && r.social_profile_id) {
      data.social_profile_id = r.social_profile_id;
      data.platform_user_id = r.platform_user_id;
      data.author_name = r.author_name;
      data.author_id = r.author_id;
      data.author_profile_picture = r.author_profile_picture;
      data.author_unavailable = false;
      data.author_unavailable_reason = null;
    }
    if (ex.author_unavailable && r.social_profile_id) {
      // We now have identity
      data.social_profile_id = r.social_profile_id;
      data.platform_user_id = r.platform_user_id;
      data.author_name = r.author_name;
      data.author_id = r.author_id;
      data.author_profile_picture = r.author_profile_picture;
      data.author_unavailable = false;
      data.author_unavailable_reason = null;
    }

    // Always update page owner and parent fields
    if (r.is_page_owner && !ex.is_page_owner) {
      data.is_page_owner = true;
      data.status = 'responded';
    }
    if (r.parent_comment_id && !ex.parent_comment_id) {
      data.parent_comment_id = r.parent_comment_id;
    }

    if (Object.keys(data).length > 0) {
      updates.push({ id: ex.id, data });
    }
  }

  let inserted = 0;
  let updated = 0;

  if (inserts.length > 0) {
    for (const chunk of chunkArray(inserts, 50)) {
      const { error: insertError } = await supabase.from('comments').insert(chunk);
      if (insertError) {
        console.error('Batch insert failed:', insertError);
      } else {
        inserted += chunk.length;
      }
    }
  }

  if (updates.length > 0) {
    for (const chunk of chunkArray(updates, 50)) {
      const results = await Promise.all(
        chunk.map((u) => supabase.from('comments').update(u.data).eq('id', u.id))
      );
      updated += results.filter((r) => !r.error).length;
    }
  }

  return { inserted, updated };
}

// ==== MAIN HANDLER ====

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let clientIdVar: string | null = null;
  let userIdVar: string | null = null;

  const syncLog: string[] = [];

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: 'No authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    userIdVar = user.id;

    const body = RequestSchema.parse(await req.json());
    const { clientId } = body;
    const postsLimit = body.postsLimit ?? 10;
    clientIdVar = clientId;

    // Verify user owns this client
    const { data: clientOwner, error: clientOwnerError } = await supabaseClient
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .eq('user_id', user.id)
      .single();

    if (clientOwnerError || !clientOwner) {
      return new Response(JSON.stringify({ success: false, error: 'Acesso não autorizado a este cliente' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('=== fetch-meta-comments START ===');
    console.log('Client:', clientId, '| Posts limit:', postsLimit);
    syncLog.push(`Client: ${clientId}, postsLimit: ${postsLimit}`);

    // Get integration data
    const { data: integration, error: intError } = await supabaseClient
      .from('integrations')
      .select('meta_access_token, meta_page_id, meta_instagram_id')
      .eq('client_id', clientId)
      .single();

    if (intError || !integration?.meta_access_token || !integration?.meta_page_id) {
      syncLog.push('ERROR: Meta integration not configured');
      throw new Error('Meta integration not configured. Configure your Meta access token and page ID first.');
    }

    syncLog.push(`Page ID: ${integration.meta_page_id}`);
    syncLog.push(`Instagram ID: ${integration.meta_instagram_id || 'not configured'}`);

    // ==== DERIVE PAGE ACCESS TOKEN ====
    // The stored token may be a User Access Token or a Page Access Token.
    // For fetching comments with from{id,name}, we NEED a Page Access Token.
    // We keep the stored token as-is (don't overwrite) so we can still check permissions later.
    let pageAccessToken = integration.meta_access_token as string;
    syncLog.push('Attempting to derive Page Access Token...');

    try {
      const pageTokenResp = await fetch(
        buildGraphUrl(integration.meta_page_id, {
          fields: 'access_token,name',
          access_token: pageAccessToken,
        })
      );
      if (pageTokenResp.ok) {
        const pageInfo = await pageTokenResp.json();
        if (pageInfo.access_token) {
          if (pageInfo.access_token !== pageAccessToken) {
            // Stored token was a User Token; we derived the Page Token
            syncLog.push(`Derived Page Access Token from User Token (page: ${pageInfo.name})`);
          } else {
            syncLog.push('Token is already a Page Access Token');
          }
          pageAccessToken = pageInfo.access_token;
        }
      } else {
        const errText = await pageTokenResp.text();
        syncLog.push(`Could not derive page token: ${errText}`);
        
        // Check if token is expired
        try {
          const errJson = JSON.parse(errText);
          if (errJson?.error?.code === 190) {
            // Token expired - update status in DB
            await supabaseClient
              .from('integrations')
              .update({ meta_token_type: 'expired' } as any)
              .eq('client_id', clientId);
            
            throw new Error('Token Meta expirado! Atualize o token na página de Integrações.');
          }
        } catch (parseErr) {
          if (parseErr instanceof Error && parseErr.message.includes('Token Meta expirado')) {
            throw parseErr;
          }
        }
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes('Token Meta expirado')) {
        throw e;
      }
      syncLog.push(`Error deriving page token: ${e}`);
    }

    const accessToken = pageAccessToken;

    // ==== CHECK PERMISSIONS (debug info) ====
    try {
      const permResp = await fetch(
        buildGraphUrl('me/permissions', { access_token: accessToken })
      );
      if (permResp.ok) {
        const permData = await permResp.json();
        const granted = (permData.data || [])
          .filter((p: any) => p.status === 'granted')
          .map((p: any) => p.permission);
        syncLog.push(`Permissions granted: ${granted.join(', ')}`);
        console.log('Permissions:', granted);

        const required = ['pages_read_engagement', 'pages_manage_metadata'];
        const missing = required.filter((p) => !granted.includes(p));
        if (missing.length > 0) {
          syncLog.push(`WARNING: Missing recommended permissions: ${missing.join(', ')}`);
        }
      }
    } catch (e) {
      syncLog.push(`Could not check permissions: ${e}`);
    }

    const stats: SyncStats = {
      totalComments: 0,
      newComments: 0,
      updatedComments: 0,
      facebookComments: 0,
      instagramComments: 0,
      facebookMissingAuthors: 0,
      instagramMissingUsernames: 0,
      profilesCreated: 0,
      profilesUpdated: 0,
    };

    const allComments: CommentInsert[] = [];

    // ==== FACEBOOK ====
    console.log('--- Fetching Facebook posts with comments ---');
    syncLog.push('--- FACEBOOK ---');
    const { posts: fbPosts, log: fbLog } = await fetchFacebookPostsWithComments(
      accessToken,
      integration.meta_page_id,
      postsLimit
    );
    syncLog.push(...fbLog);

    for (const post of fbPosts) {
      const postId = post.id;
      const postMessage = post.message || null;
      const postPermalink = post.permalink_url || null;
      const postPicture = post.full_picture || null;
      const postMediaType = post.attachments?.data?.[0]?.media_type || null;

      const comments = post.comments?.data || [];

      for (const comment of comments) {
        const result = await processFacebookComment(
          supabaseClient,
          clientId,
          accessToken,
          integration.meta_page_id,
          postId,
          postMessage,
          postPermalink,
          postPicture,
          postMediaType,
          comment,
          stats,
          null
        );
        allComments.push(result);

        // Process replies
        const replies = comment.replies?.data || [];
        for (const reply of replies) {
          const replyResult = await processFacebookComment(
            supabaseClient,
            clientId,
            accessToken,
            integration.meta_page_id,
            postId,
            postMessage,
            postPermalink,
            postPicture,
            postMediaType,
            reply,
            stats,
            comment.id
          );
          allComments.push(replyResult);
        }
      }
    }

    // ==== INSTAGRAM ====
    if (integration.meta_instagram_id) {
      console.log('--- Fetching Instagram media with comments ---');
      syncLog.push('--- INSTAGRAM ---');

      // Fetch the IG account's own username to detect page owner replies
      let igOwnerUsername: string | null = null;
      try {
        const igInfoResp = await fetch(
          buildGraphUrl(integration.meta_instagram_id, {
            fields: 'username',
            access_token: accessToken,
          })
        );
        if (igInfoResp.ok) {
          const igInfo = await igInfoResp.json();
          igOwnerUsername = igInfo.username || null;
          syncLog.push(`[IG] Owner username: ${igOwnerUsername}`);
        }
      } catch (e) {
        syncLog.push(`[IG] Could not fetch owner username: ${e}`);
      }

      const { media: igMedia, log: igLog } = await fetchInstagramMediaWithComments(
        accessToken,
        integration.meta_instagram_id,
        postsLimit
      );
      syncLog.push(...igLog);

      for (const m of igMedia) {
        const postId = m.id;
        const postMessage = m.caption || null;
        const postPermalink = m.permalink || null;
        const isVideoMedia = m.media_type?.toLowerCase() === 'video';
        const postPicture = isVideoMedia
          ? (m.thumbnail_url || m.media_url || null)
          : (m.media_url || m.thumbnail_url || null);
        const postMediaType = m.media_type?.toLowerCase() || null;

        const comments = m.comments?.data || [];

        for (const comment of comments) {
          const result = await processInstagramComment(
            supabaseClient,
            clientId,
            igOwnerUsername,
            postId,
            postMessage,
            postPermalink,
            postPicture,
            postMediaType,
            comment,
            stats,
            null
          );
          allComments.push(result);

          // Process replies
          const replies = comment.replies?.data || [];
          for (const reply of replies) {
            const replyResult = await processInstagramComment(
              supabaseClient,
              clientId,
              igOwnerUsername,
              postId,
              postMessage,
              postPermalink,
              postPicture,
              postMediaType,
              reply,
              stats,
              comment.id
            );
            allComments.push(replyResult);
          }
        }
      }
    }

    stats.totalComments = allComments.length;

    // ==== PERSIST ====
    syncLog.push(`Total comments to persist: ${allComments.length}`);
    const { inserted, updated } = await persistComments(supabaseClient, clientId, allComments);
    stats.newComments = inserted;
    stats.updatedComments = updated;

    syncLog.push(`Inserted: ${inserted}, Updated: ${updated}`);
    syncLog.push(`FB missing authors: ${stats.facebookMissingAuthors}`);
    syncLog.push(`IG missing usernames: ${stats.instagramMissingUsernames}`);
    syncLog.push(`Profiles created: ${stats.profilesCreated}, updated: ${stats.profilesUpdated}`);

    // ==== REGISTER ENGAGEMENT ACTIONS & UPDATE SCORES ====
    syncLog.push('--- ENGAGEMENT ACTIONS ---');
    let engagementActionsCreated = 0;
    const supporterScoresToUpdate = new Set<string>();

    // Only process non-page-owner comments that have identity
    const engageableComments = allComments.filter(c => !c.is_page_owner && c.platform_user_id);

    for (const comment of engageableComments) {
      // Check if engagement action already exists for this comment
      const { data: existingAction } = await supabaseClient
        .from('engagement_actions')
        .select('id')
        .eq('client_id', clientId)
        .eq('comment_id', comment.comment_id)
        .maybeSingle();

      if (existingAction) continue;

      // Find linked supporter via supporter_profiles
      let supporterId: string | null = null;
      const { data: linkedProfile } = await supabaseClient
        .from('supporter_profiles')
        .select('supporter_id')
        .eq('platform', comment.platform)
        .eq('platform_user_id', comment.platform_user_id!)
        .maybeSingle();

      if (linkedProfile) {
        supporterId = linkedProfile.supporter_id;
        supporterScoresToUpdate.add(supporterId);
      }

      const { error: insertErr } = await supabaseClient
        .from('engagement_actions')
        .insert({
          client_id: clientId,
          supporter_id: supporterId,
          platform: comment.platform,
          platform_user_id: comment.platform_user_id,
          platform_username: comment.author_name,
          action_type: 'comment',
          comment_id: comment.comment_id,
          post_id: comment.post_id,
          action_date: comment.comment_created_time || new Date().toISOString(),
        });

      if (!insertErr) {
        engagementActionsCreated++;
      }
    }

    syncLog.push(`Engagement actions created: ${engagementActionsCreated}`);

    // Link ALL orphan engagement_actions (including those from previous syncs)
    try {
      const { data: linkedCount } = await supabaseClient.rpc('link_orphan_engagement_actions', {
        p_client_id: clientId,
      });
      syncLog.push(`Orphan actions linked: ${linkedCount}`);
    } catch (e) {
      syncLog.push(`Error linking orphan actions: ${e}`);
    }

    // Snapshot monthly scores
    try {
      await supabaseClient.rpc('snapshot_monthly_scores', { p_client_id: clientId });
      syncLog.push('Monthly scores snapshot updated');
    } catch (e) {
      syncLog.push(`Error snapshotting scores: ${e}`);
    }

    // ==== AUTO SENTIMENT ANALYSIS ====
    syncLog.push('--- SENTIMENT ANALYSIS ---');
    let sentimentAnalyzed = 0;
    try {
      const llmConfig = await getClientLLMConfig(supabaseClient, clientId);
      console.log(`📡 Using LLM provider: ${llmConfig.provider} for batch sentiment`);
      syncLog.push(`LLM provider: ${llmConfig.provider}, model: ${llmConfig.model}`);

      // Get comments without sentiment (neutral = not analyzed yet)
      const { data: unanalyzed } = await supabaseClient
        .from('comments')
        .select('id, text')
        .eq('client_id', clientId)
        .eq('sentiment', 'neutral')
        .eq('is_page_owner', false)
        .order('created_at', { ascending: false })
        .limit(100);

      if (unanalyzed && unanalyzed.length > 0) {
        syncLog.push(`Comments to analyze: ${unanalyzed.length}`);
        
        // Batch analyze - send multiple comments in one LLM call for efficiency
        for (const batch of chunkArray(unanalyzed, 10)) {
          const batchTexts = batch.map((c: any, i: number) => `[${i + 1}] ${c.text.slice(0, 200)}`).join('\n');
          
          const messages: LLMMessage[] = [
            {
              role: 'user',
              content: `Classifique o sentimento de cada comentário abaixo. Responda APENAS com o número e o sentimento, um por linha, no formato: "1:positive", "2:negative" ou "3:neutral".

${batchTexts}

Resposta:`,
            },
          ];

          try {
            const response = await callLLM(llmConfig, { messages, maxTokens: 200, temperature: 0 });
            const lines = response.content.trim().split('\n');
            
            for (const line of lines) {
              const match = line.match(/(\d+)\s*[:.\-)\s]\s*(positive|negative|neutral)/i);
              if (match) {
                const idx = parseInt(match[1]) - 1;
                const sentiment = match[2].toLowerCase();
                if (idx >= 0 && idx < batch.length && ['positive', 'negative', 'neutral'].includes(sentiment)) {
                  await supabaseClient
                    .from('comments')
                    .update({ sentiment })
                    .eq('id', batch[idx].id);
                  sentimentAnalyzed++;
                }
              }
            }
          } catch (llmErr) {
            console.warn('Batch sentiment analysis failed:', llmErr);
            syncLog.push(`LLM batch error: ${llmErr}`);
          }
        }
      }
      syncLog.push(`Sentiments analyzed: ${sentimentAnalyzed}`);
    } catch (llmConfigErr) {
      syncLog.push(`LLM config error (sentiment skipped): ${llmConfigErr}`);
      console.warn('Could not load LLM config for sentiment:', llmConfigErr);
    }

    // Log action
    await supabaseClient.from('action_logs').insert({
      client_id: clientId,
      user_id: user.id,
      action: 'fetch_meta_comments',
      status: 'success',
      details: {
        ...stats,
        posts_limit: postsLimit,
        sync_log: syncLog,
      },
    });

    console.log('=== fetch-meta-comments END ===', stats);

    const warnings: string[] = [];
    
    // Critical warning for Facebook
    if (stats.facebookComments > 0 && stats.facebookMissingAuthors > 0) {
      const pct = Math.round((stats.facebookMissingAuthors / stats.facebookComments) * 100);
      if (pct > 90) {
        warnings.push(`⚠️ CRÍTICO: ${pct}% dos comentários do Facebook estão sem autor. Isso geralmente significa que o App Meta está em modo "Development". Para ver autores reais: 1) Acesse o Meta for Developers, 2) Vá em "App Review", 3) Coloque o App em modo "Live" ou adicione testadores.`);
      } else {
        warnings.push(`Facebook: ${stats.facebookMissingAuthors} comentários sem autor identificado.`);
      }
    }
    
    // Instagram warning
    if (stats.instagramComments > 0 && stats.instagramMissingUsernames > 0) {
      const pct = Math.round((stats.instagramMissingUsernames / stats.instagramComments) * 100);
      if (pct === 100) {
        warnings.push(`⚠️ Instagram: Nenhum @username capturado. Verifique se a permissão "instagram_manage_comments" está aprovada.`);
      } else {
        warnings.push(`Instagram: ${stats.instagramMissingUsernames} comentários sem @username.`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Sincronização concluída! ${stats.newComments} novos, ${stats.updatedComments} atualizados (FB: ${stats.facebookComments}, IG: ${stats.instagramComments}).`,
        ...stats,
        warnings,
        sync_log: syncLog,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in fetch-meta-comments:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    syncLog.push(`FATAL ERROR: ${errorMessage}`);

    try {
      const sb = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      if (clientIdVar && userIdVar) {
        await sb.from('action_logs').insert({
          client_id: clientIdVar,
          user_id: userIdVar,
          action: 'fetch_meta_comments',
          status: 'error',
          details: { error: errorMessage, sync_log: syncLog },
        });
      }
    } catch (logErr) {
      console.error('Failed to log action error:', logErr);
    }

    return new Response(
      JSON.stringify({ success: false, error: errorMessage, sync_log: syncLog }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ==== COMMENT PROCESSORS ====

async function processFacebookComment(
  supabase: SupabaseClient,
  clientId: string,
  accessToken: string,
  pageId: string,
  postId: string,
  postMessage: string | null,
  postPermalink: string | null,
  postPicture: string | null,
  postMediaType: string | null,
  comment: any,
  stats: SyncStats,
  parentCommentId: string | null = null
): Promise<CommentInsert> {
  stats.facebookComments++;

  const commentId = comment.id;
  const text = comment.message || '';
  const createdTime = comment.created_time ? new Date(comment.created_time).toISOString() : null;

  // Extract author from nested from{}
  let authorId: string | null = comment.from?.id || null;
  let authorName: string | null = comment.from?.name || null;
  let avatarUrl: string | null =
    comment.from?.picture?.data?.url ||
    comment.from?.picture?.url ||
    null;

  // If from is missing, try to fetch individually (fallback)
  if (!authorId || !authorName) {
    try {
      const cResp = await fetch(
        buildGraphUrl(commentId, {
          fields: 'from{id,name,picture.width(100).height(100)}',
          access_token: accessToken,
        })
      );
      if (cResp.ok) {
        const cJson = await cResp.json();
        authorId = authorId || cJson?.from?.id || null;
        authorName = authorName || cJson?.from?.name || null;
        avatarUrl = avatarUrl || cJson?.from?.picture?.data?.url || null;
      }
    } catch (e) {
      console.warn('Fallback fetch for FB comment author failed:', e);
    }
  }

  // If still no avatar, try the /picture endpoint
  if (!avatarUrl && authorId) {
    try {
      const picResp = await fetch(
        buildGraphUrl(`${authorId}/picture`, {
          type: 'normal',
          redirect: '0',
          access_token: accessToken,
        })
      );
      if (picResp.ok) {
        const picJson = await picResp.json();
        avatarUrl = picJson?.data?.url || null;
      }
    } catch (e) {
      console.warn('Fallback fetch for FB user picture failed:', e);
    }
  }

  // Determine if we have identity
  const hasIdentity = !!authorId;

  let socialProfileId: string | null = null;
  let platformUserId: string | null = authorId;

  if (hasIdentity && authorId) {
    const { profile, created, updated } = await resolveProfile(
      supabase,
      clientId,
      'facebook',
      authorId,
      null, // username not applicable for FB
      authorName,
      avatarUrl
    );
    if (profile) {
      socialProfileId = profile.id;
    }
    if (created) stats.profilesCreated++;
    if (updated) stats.profilesUpdated++;
  } else {
    stats.facebookMissingAuthors++;
  }

  const isPageOwner = !!authorId && authorId === pageId;

  return {
    client_id: clientId,
    comment_id: commentId,
    post_id: postId,
    text,
    author_name: authorName,
    author_id: authorId,
    author_profile_picture: avatarUrl,
    platform: 'facebook',
    platform_user_id: platformUserId,
    social_profile_id: socialProfileId,
    author_unavailable: !hasIdentity,
    author_unavailable_reason: hasIdentity ? null : 'from field not returned by Meta API',
    status: isPageOwner ? 'responded' : 'pending',
    sentiment: 'neutral',
    post_message: postMessage,
    post_permalink_url: postPermalink,
    post_full_picture: postPicture,
    post_media_type: postMediaType,
    comment_created_time: createdTime,
    parent_comment_id: parentCommentId,
    is_page_owner: isPageOwner,
  };
}

async function processInstagramComment(
  supabase: SupabaseClient,
  clientId: string,
  igOwnerUsername: string | null,
  postId: string,
  postMessage: string | null,
  postPermalink: string | null,
  postPicture: string | null,
  postMediaType: string | null,
  comment: any,
  stats: SyncStats,
  parentCommentId: string | null = null
): Promise<CommentInsert> {
  stats.instagramComments++;

  const commentId = comment.id;
  const text = comment.text || '';
  const createdTime = comment.timestamp ? new Date(comment.timestamp).toISOString() : null;

  // Instagram only provides username
  const username: string | null = comment.username || null;

  const hasIdentity = !!username;

  let socialProfileId: string | null = null;
  const platformUserId = username;

  if (hasIdentity && username) {
    const { profile, created, updated } = await resolveProfile(
      supabase,
      clientId,
      'instagram',
      username, // For IG, platform_user_id = username
      username,
      null, // IG API doesn't return display name for commenters
      null // IG API doesn't return avatar for commenters
    );
    if (profile) {
      socialProfileId = profile.id;
    }
    if (created) stats.profilesCreated++;
    if (updated) stats.profilesUpdated++;
  } else {
    stats.instagramMissingUsernames++;
  }

  const isPageOwner = !!username && !!igOwnerUsername && username.toLowerCase() === igOwnerUsername.toLowerCase();

  return {
    client_id: clientId,
    comment_id: commentId,
    post_id: postId,
    text,
    author_name: username ? `@${username}` : null,
    author_id: username,
    author_profile_picture: null, // IG limitation
    platform: 'instagram',
    platform_user_id: platformUserId,
    social_profile_id: socialProfileId,
    author_unavailable: !hasIdentity,
    author_unavailable_reason: hasIdentity ? null : 'username not returned by Instagram API',
    status: isPageOwner ? 'responded' : 'pending',
    sentiment: 'neutral',
    post_message: postMessage,
    post_permalink_url: postPermalink,
    post_full_picture: postPicture,
    post_media_type: postMediaType,
    comment_created_time: createdTime,
    parent_comment_id: parentCommentId,
    is_page_owner: isPageOwner,
  };
}
