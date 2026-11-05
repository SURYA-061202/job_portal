import { onCall, HttpsError } from "firebase-functions/v2/https";
import { chat, chatJson, embed, MODELS } from "./openaiClient";
import { cleanId, enforceLimit, firestore, HOUR, requireStaff, str, Timestamp } from "./security";

/**
 * Every OpenAI call runs here, behind a recruiter/admin check and a per-user
 * hourly budget. The browser never sees the API key.
 */

const AI_OPTIONS = { timeoutSeconds: 300, memory: "512MiB" as const };
const CALLS_PER_HOUR = 200;

async function budget(uid: string, units = 1) {
  // One unit per OpenAI request; a batch of N candidates costs N.
  for (let i = 0; i < units; i++) {
    await enforceLimit(`ai:${uid}`, CALLS_PER_HOUR, HOUR, "AI usage limit reached for this hour. Please try again later.");
  }
}

const stripFences = (s: string) => {
  let out = s.trim();
  if (out.startsWith("```")) out = out.replace(/^```[a-zA-Z]*\s*/m, "").replace(/```$/m, "");
  const a = out.indexOf("{");
  const b = out.lastIndexOf("}");
  return a !== -1 && b !== -1 ? out.slice(a, b + 1) : out;
};

/* ------------------------------------------------------------------ *
 * parseResume: resume text -> structured candidate JSON
 * ------------------------------------------------------------------ */

const PARSE_PROMPT =
  "You are an assistant that extracts structured candidate data from resume text. " +
  'Return a valid JSON object with EXACTLY these keys: {"name":string,"email":string,"phone":string,' +
  '"role":string,"experience":string,"summary":string,"workExperience":array,' +
  '"education":array,"skills":array,"certifications":array,"projects":array}. ' +
  "The \"role\" field should contain the candidate's current OR desired job title (e.g., 'Software Engineer', 'Project Manager'). " +
  "If a field cannot be confidently determined, leave it as an empty string or empty array; NEVER fabricate placeholders such as 'John Doe', 'example@example.com', or '1234567890'. " +
  "Respond with ONLY the JSON – no markdown fences or additional commentary.";

export const parseResume = onCall(AI_OPTIONS, async (request) => {
  const { uid } = await requireStaff(request);
  const text = str((request.data as { text?: unknown })?.text, 12_000);
  if (text.length < 20) throw new HttpsError("invalid-argument", "The resume has no readable text.");
  await budget(uid, 2);

  const reply = await chat({ model: MODELS.parse, temperature: 0.2, system: PARSE_PROMPT, user: text });

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(stripFences(reply));
  } catch {
    throw new HttpsError("internal", "The AI service returned unreadable data for this resume.");
  }

  // Second, narrower attempt when no job title came back.
  if (!data.role || (typeof data.role === "string" && !data.role.trim())) {
    try {
      const role = await chat({
        model: MODELS.parse,
        temperature: 0,
        system:
          "Identify the candidate's current or desired job title from the following resume text. " +
          "Respond with ONLY the role string – no other text.",
        user: text,
      });
      data.role = stripFencesLine(role);
    } catch (err) {
      console.warn("parseResume: fallback role extraction failed", err);
    }
  }
  return { data };
});

function stripFencesLine(s: string): string {
  let out = s.trim();
  if (out.startsWith("```")) out = out.replace(/^```[a-zA-Z]*\s*/m, "").replace(/```$/m, "");
  return out.replace(/^"|"$/g, "").trim().slice(0, 120);
}

/* ------------------------------------------------------------------ *
 * scoreCandidates: relevance of uploaded candidates against one job
 * ------------------------------------------------------------------ */

interface ProfileInput {
  id?: unknown;
  name?: unknown;
  role?: unknown;
  experience?: unknown;
  skills?: unknown;
  summary?: unknown;
  workHistory?: unknown;
}

export const scoreCandidates = onCall(AI_OPTIONS, async (request) => {
  const { uid } = await requireStaff(request);
  const body = request.data as { jobId?: unknown; jobTitle?: unknown; jobDescription?: unknown; candidates?: unknown };
  const jobId = cleanId(body.jobId, "job");
  const jobTitle = str(body.jobTitle, 200);
  const jobDescription = str(body.jobDescription, 2000);
  if (!jobDescription) throw new HttpsError("invalid-argument", "A job description is required.");

  const list = Array.isArray(body.candidates) ? (body.candidates as ProfileInput[]) : [];
  if (list.length === 0) return { rankings: {} };
  if (list.length > 25) throw new HttpsError("invalid-argument", "Score at most 25 candidates at a time.");
  await budget(uid, list.length);

  const db = firestore();
  const now = Timestamp().now();
  const rankings: Record<string, { score: number; reasoning: string; updatedAtMs: number }> = {};

  await Promise.all(
    list.map(async (c) => {
      const id = cleanId(c.id, "candidate");
      try {
        const skills = Array.isArray(c.skills) ? c.skills.map((s) => str(s, 60)).filter(Boolean).slice(0, 60) : [];
        const profile = [
          `Name: ${str(c.name, 120)}`,
          `Role: ${str(c.role, 120)}`,
          `Experience: ${str(c.experience, 60)}`,
          `Skills: ${skills.join(", ")}`,
          `Summary: ${str(c.summary, 1200)}`,
          `Work History: ${str(c.workHistory, 1200)}`,
        ].join("\n");

        const prompt = `
You are an expert technical recruiter. Analyze the following candidate against the Job Description.

JOB TITLE: ${jobTitle}
JOB DESCRIPTION:
${jobDescription}

CANDIDATE PROFILE:
${profile}

Provide a JSON response with:
- "score": integer 0-100 (Relevance match)
- "reasoning": string (1 concise sentence explaining the score)`;

        const result = await chatJson<{ score?: unknown; reasoning?: unknown }>({
          model: MODELS.score,
          system: "You are a helpful assistant that outputs JSON only.",
          user: prompt,
        });
        const score = Math.max(0, Math.min(100, Math.round(Number(result.score) || 0)));
        const reasoning = str(result.reasoning, 400) || "Analyzed by AI";

        // The candidate is either an uploaded resume or a registered user.
        let ref = db.collection("candidates").doc(id);
        if (!(await ref.get()).exists) {
          ref = db.collection("users").doc(id);
          if (!(await ref.get()).exists) return;
        }
        await ref.update({ [`rankings.${jobId}`]: { score, reasoning, updatedAt: now } });
        rankings[id] = { score, reasoning, updatedAtMs: now.toMillis() };
      } catch (err) {
        console.error(`scoreCandidates: failed for ${id}`, err);
      }
    })
  );

  return { rankings };
});

/* ------------------------------------------------------------------ *
 * rankApplicants: score every applicant of a post with the stronger model
 * ------------------------------------------------------------------ */

export const rankApplicants = onCall(AI_OPTIONS, async (request) => {
  const caller = await requireStaff(request);
  const jobId = cleanId((request.data as { jobId?: unknown })?.jobId, "job");
  const db = firestore();

  const jobSnap = await db.collection("recruits").doc(jobId).get();
  if (!jobSnap.exists) throw new HttpsError("not-found", "Job not found.");
  const job = jobSnap.data() as Record<string, unknown>;
  if (caller.role !== "admin" && job.recruiterId !== caller.uid) {
    throw new HttpsError("permission-denied", "You can only rank applicants of your own posts.");
  }

  const jd = `
Title: ${str(job.jobTitle, 200)}
Role: ${str(job.department, 200)}
Level: ${str(job.positionLevel, 100)}
Skills Required: ${str(job.skills, 600)}
Experience Required: ${str(job.yearsExperience, 60)}
Qualification: ${str(job.qualification, 300)}
Description: ${str(job.description, 3000) || "N/A"}`;

  const apps = await db.collection("job_applications").where("post_id", "==", jobId).limit(50).get();
  const userIds = apps.docs.map((d) => String(d.data().user_id || "")).filter(Boolean);
  if (userIds.length === 0) return { count: 0 };
  await budget(caller.uid, userIds.length);

  let count = 0;
  const now = Timestamp().now();
  for (const userId of userIds) {
    try {
      const ref = db.collection("users").doc(userId);
      const snap = await ref.get();
      if (!snap.exists) continue;
      const c = snap.data() as Record<string, any>;
      const ed = (c.extractedData || {}) as Record<string, unknown>;
      const profile = `
Name: ${str(c.name || `${c.firstName || ""} ${c.lastName || ""}`, 120)}
Current Role: ${str(c.role, 120)}
Experience: ${str(c.experience, 60)}
Skills: ${Array.isArray(c.skills) ? c.skills.slice(0, 60).join(", ") : ""}

Extracted Resume Data:
Summary: ${str(ed.summary, 1200)}
Work Experience: ${JSON.stringify(ed.workExperience || []).slice(0, 2500)}
Projects: ${JSON.stringify(ed.projects || []).slice(0, 1500)}
Education: ${JSON.stringify(ed.education || []).slice(0, 1000)}`;

      const result = await chatJson<{ score?: unknown; reasoning?: unknown }>({
        model: MODELS.rank,
        system: "You are a helpful assistant.",
        user: `You are an expert HR recruiter.
Evaluate the following Candidate against the Job Description.

JOB DESCRIPTION:
${jd}

CANDIDATE PROFILE:
${profile}

Verify the candidate's skills, experience years, and qualifications match the JD.
Data might be unstructured.

Output strictly in JSON format:
{
   "score": <number 0-100>,
   "reasoning": "<short concise justification 1-2 sentences>"
}`,
      });
      await ref.update({
        [`rankings.${jobId}`]: {
          score: Math.max(0, Math.min(100, Math.round(Number(result.score) || 0))),
          reasoning: str(result.reasoning, 400),
          updatedAt: now,
        },
      });
      count++;
    } catch (err) {
      console.error(`rankApplicants: failed for ${userId}`, err);
    }
  }
  return { count };
});

/* ------------------------------------------------------------------ *
 * clusterCandidates: embeddings + k-means + short labels
 * ------------------------------------------------------------------ */

function cosineDistance(a: number[], b: number[]) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return 1 - dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

function kMeans(vectors: number[][], k: number, maxIterations = 20): number[] {
  if (vectors.length < k) return vectors.map(() => 0);
  let centroids = vectors.slice(0, k);
  const assignments = new Array<number>(vectors.length).fill(0);
  const dim = vectors[0].length;

  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;
    for (let i = 0; i < vectors.length; i++) {
      let best = Infinity;
      let cluster = 0;
      for (let j = 0; j < k; j++) {
        const d = cosineDistance(vectors[i], centroids[j]);
        if (d < best) {
          best = d;
          cluster = j;
        }
      }
      if (assignments[i] !== cluster) {
        assignments[i] = cluster;
        changed = true;
      }
    }
    if (!changed) break;

    const next = Array.from({ length: k }, () => new Array<number>(dim).fill(0));
    const counts = new Array<number>(k).fill(0);
    vectors.forEach((v, i) => {
      counts[assignments[i]]++;
      for (let d = 0; d < dim; d++) next[assignments[i]][d] += v[d];
    });
    for (let j = 0; j < k; j++) {
      if (counts[j] > 0) for (let d = 0; d < dim; d++) next[j][d] /= counts[j];
      else next[j] = vectors[Math.floor(Math.random() * vectors.length)];
    }
    centroids = next;
  }
  return assignments;
}

export const clusterCandidates = onCall(AI_OPTIONS, async (request) => {
  const { uid } = await requireStaff(request);
  const raw = (request.data as { candidates?: unknown })?.candidates;
  const list = Array.isArray(raw) ? (raw as ProfileInput[]) : [];
  if (list.length < 3) throw new HttpsError("invalid-argument", "Need at least 3 candidates to cluster.");
  if (list.length > 500) throw new HttpsError("invalid-argument", "Too many candidates to cluster at once.");

  const people = list.map((c) => ({
    id: cleanId(c.id, "candidate"),
    role: str(c.role, 120),
    skills: Array.isArray(c.skills) ? c.skills.map((s) => str(s, 60)).filter(Boolean).slice(0, 40) : [],
    experience: str(c.experience, 60),
    summary: str(c.summary, 600),
  }));

  const k = Math.min(Math.max(3, Math.floor(Math.sqrt(people.length))), 6);
  await budget(uid, 1 + k);

  const vectors = await embed(
    people.map((p) => `Role: ${p.role}, Skills: ${p.skills.join(", ")}, Exp: ${p.experience}, Summary: ${p.summary}`)
  );
  const assignments = kMeans(vectors, k);

  const groups = new Map<number, typeof people>();
  assignments.forEach((cluster, i) => {
    groups.set(cluster, [...(groups.get(cluster) || []), people[i]]);
  });

  const clusters: { id: number; label: string; candidateIds: string[] }[] = [];
  for (const [id, group] of groups) {
    const profiles = group
      .slice(0, 5)
      .map((c) => `${c.role} (${c.skills.slice(0, 3).join(",")})`)
      .join("; ");
    let label = `Group ${id + 1}`;
    try {
      const text = await chat({
        model: MODELS.label,
        user: `Analyze these job profiles: [${profiles}]. Give a single short descriptive label (MAX 3 words) for this group (e.g., "Frontend Developers", "Senior Managers"). Output only the label.`,
      });
      label = text.replace(/['"]/g, "").slice(0, 40) || label;
    } catch (err) {
      console.error("clusterCandidates: labeling failed", err);
    }
    clusters.push({ id, label, candidateIds: group.map((c) => c.id) });
  }
  return { clusters };
});
