// JantaHR Ops — public job-board endpoint.
//
// The JantaHR website reads its job board from a configurable endpoint
// (env VITE_JOBS_ENDPOINT) and falls back to a static /data/jobs.json. This
// function becomes that endpoint. It is read-only and anonymous
// (--no-verify-jwt), so CORS plus a short edge cache are the protections:
// the data is deliberately public.
//
// It returns ONLY vacancies that are is_public AND status='open', and it maps
// the vacancy row to the website's Job shape. The client organisation, owner
// and internal notes are never exposed.
//
// Deploy: supabase functions deploy public-jobs --no-verify-jwt

import { createClient } from 'jsr:@supabase/supabase-js@2';

function corsHeaders(origin: string | null): HeadersInit {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=300',
      ...corsHeaders(origin),
    },
  });
}

interface ScreeningQuestion {
  id: string;
  question: string;
  type: string;
  required: boolean;
  options?: string[];
}

interface VacancyRow {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  description: string | null;
  requirements: string | null;
  location: string | null;
  employment_type: string | null;
  salary_min_ugx: number | null;
  salary_max_ugx: number | null;
  screening_questions: ScreeningQuestion[] | null;
  published_at: string | null;
  closes_at: string | null;
}

// The website's Job type (src/data/jobs.ts). Field names must match; if the
// website changes its shape, adjust the mapping below (docs/JOBS_CUTOVER.md).
interface Job {
  id: string;
  slug: string;
  title: string;
  location: string | null;
  employmentType: string | null;
  summary: string | null;
  description: string | null;
  requirements: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  screeningQuestions?: ScreeningQuestion[];
  postedAt: string | null;
  closesAt: string | null;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (req.method !== 'GET') {
    return json({ error: 'Method not allowed.' }, 405, origin);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const { data, error } = await supabase
    .from('vacancies')
    .select(
      'id, slug, title, summary, description, requirements, location, employment_type, salary_min_ugx, salary_max_ugx, screening_questions, published_at, closes_at',
    )
    .eq('is_public', true)
    .eq('status', 'open')
    .not('published_at', 'is', null)
    .order('published_at', { ascending: false });

  if (error) {
    console.error('public-jobs query failed', error);
    return json({ error: 'Could not load jobs.' }, 500, origin);
  }

  const jobs: Job[] = (data as VacancyRow[]).map((v) => ({
    id: v.id,
    slug: v.slug,
    title: v.title,
    location: v.location,
    employmentType: v.employment_type,
    summary: v.summary,
    description: v.description,
    requirements: v.requirements,
    salaryMin: v.salary_min_ugx,
    salaryMax: v.salary_max_ugx,
    screeningQuestions: v.screening_questions || [],
    postedAt: v.published_at,
    closesAt: v.closes_at,
  }));

  return json({ jobs }, 200, origin);
});
