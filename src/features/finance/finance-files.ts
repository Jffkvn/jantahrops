import { getSupabase } from '@/lib/supabase';

/**
 * Private finance storage (payment proofs + expense receipts).
 *
 * Files live in the `finance` bucket (public=false — never world-readable).
 * Access is by signed URL only. A `finance_files` metadata row is created for
 * every upload so callers can reference files by stable id.
 */

const BUCKET = 'finance';
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIMES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

export type UploadFinanceFileResult = { fileId: string };

export async function uploadFinanceFile(file: File): Promise<UploadFinanceFileResult> {
  if (!ALLOWED_MIMES.has(file.type)) {
    throw new Error('Only PDF, JPG, PNG, or WebP files are allowed.');
  }
  if (file.size > MAX_BYTES) {
    throw new Error('Files must be 10 MB or smaller.');
  }

  const supabase = getSupabase();
  const extension = extensionForMime(file.type);
  const path = `${crypto.randomUUID()}.${extension}`;

  const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadErr) throw new Error(uploadErr.message);

  const { data: meta, error: metaErr } = await supabase
    .from('finance_files')
    .insert({
      bucket: BUCKET,
      path,
      filename: file.name,
      mime: file.type,
      size_bytes: file.size,
    })
    .select('*')
    .single();

  if (metaErr || !meta) {
    // Best-effort cleanup of the orphaned object so failed metadata rows do
    // not leave files behind.
    await supabase.storage.from(BUCKET).remove([path]);
    throw new Error(metaErr?.message || 'Failed to record uploaded file');
  }

  return { fileId: meta.id };
}

/**
 * Signed URL for a finance file, valid for the given lifetime.
 * Returns null when the file cannot be resolved or signed.
 */
export async function signedUrlForFinanceFile(
  fileId: string,
  expiresInSeconds = 60 * 60,
): Promise<string | null> {
  const supabase = getSupabase();
  const { data: meta } = await supabase
    .from('finance_files')
    .select('bucket, path')
    .eq('id', fileId)
    .maybeSingle();

  if (!meta) return null;
  const { data } = await supabase.storage
    .from(meta.bucket)
    .createSignedUrl(meta.path, expiresInSeconds);
  return data?.signedUrl ?? null;
}

export function extensionForMime(mime: string): string {
  switch (mime) {
    case 'application/pdf':
      return 'pdf';
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return 'bin';
  }
}
