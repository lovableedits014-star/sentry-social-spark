#!/usr/bin/env node
/**
 * Storage migration script
 * Copies all files from source Supabase Storage buckets to destination.
 *
 * Usage:
 *   SOURCE_URL=... SOURCE_SERVICE_KEY=... \
 *   DEST_URL=... DEST_SERVICE_KEY=... \
 *   node scripts/migrate-storage.mjs
 */
import { createClient } from "@supabase/supabase-js";

const SOURCE_URL = process.env.SOURCE_URL;
const SOURCE_KEY = process.env.SOURCE_SERVICE_KEY;
const DEST_URL = process.env.DEST_URL;
const DEST_KEY = process.env.DEST_SERVICE_KEY;
const BUCKETS = (process.env.BUCKETS || "client-logos,birthday-images").split(",");

if (!SOURCE_URL || !SOURCE_KEY || !DEST_URL || !DEST_KEY) {
  console.error("Missing env vars. Required: SOURCE_URL, SOURCE_SERVICE_KEY, DEST_URL, DEST_SERVICE_KEY");
  process.exit(1);
}

const source = createClient(SOURCE_URL, SOURCE_KEY);
const dest = createClient(DEST_URL, DEST_KEY);

async function listAllFiles(client, bucket, prefix = "") {
  const out = [];
  const { data, error } = await client.storage.from(bucket).list(prefix, {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });
  if (error) throw error;
  for (const item of data || []) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id === null) {
      // folder
      const nested = await listAllFiles(client, bucket, path);
      out.push(...nested);
    } else {
      out.push(path);
    }
  }
  return out;
}

async function ensureBucket(bucket) {
  const { data: buckets } = await dest.storage.listBuckets();
  if (buckets?.some((b) => b.name === bucket)) return;
  console.log(`  Creating bucket "${bucket}" on destination...`);
  const { error } = await dest.storage.createBucket(bucket, { public: true });
  if (error && !String(error.message).includes("already exists")) throw error;
}

async function migrateBucket(bucket) {
  console.log(`\n📦 Bucket: ${bucket}`);
  await ensureBucket(bucket);
  const files = await listAllFiles(source, bucket);
  console.log(`  Found ${files.length} files`);

  let ok = 0, fail = 0;
  for (const path of files) {
    try {
      const { data: blob, error: dlErr } = await source.storage.from(bucket).download(path);
      if (dlErr) throw dlErr;
      const buf = Buffer.from(await blob.arrayBuffer());
      const { error: upErr } = await dest.storage.from(bucket).upload(path, buf, {
        contentType: blob.type || "application/octet-stream",
        upsert: true,
      });
      if (upErr) throw upErr;
      ok++;
      if (ok % 10 === 0) console.log(`  ✓ ${ok}/${files.length}`);
    } catch (e) {
      fail++;
      console.error(`  ✗ ${path}: ${e.message}`);
    }
  }
  console.log(`  Done: ${ok} ok, ${fail} failed`);
}

(async () => {
  for (const bucket of BUCKETS) {
    await migrateBucket(bucket.trim());
  }
  console.log("\n✅ Storage migration complete.");
})().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
