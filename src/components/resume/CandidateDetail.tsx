'use client';

import type { Candidate, RecruitmentRequest } from '@/types';
import { ArrowLeft, MailPlus, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { collection, query, orderBy, getDocs, deleteDoc, doc, getDoc } from 'firebase/firestore';
import { db, storage } from '@/lib/firebase';
import InterviewInviteModal from './InterviewInviteModal';
import { ref, deleteObject } from 'firebase/storage';
import { usePopup } from '@/components/ui/Popup';
import { useSkin, FOCUS } from '@/styles/skin';

interface CandidateDetailProps {
  candidate: Candidate;
  onBack: () => void;
  onInviteSent?: () => void;
  onRemoveCandidate?: () => void;
  onUpdateCandidate?: (updatedCandidate: Candidate) => void;
  userApplications?: any[];
  /** Post ID this candidate list is currently filtered to (set only when reached via the Posts module). Gates the "Send Interview Invite" action. */
  activePostId?: string | null;
}

export default function CandidateDetail({ candidate: initialCandidate, onBack, onInviteSent, onRemoveCandidate, userApplications, activePostId }: CandidateDetailProps) {
  const [candidate, setCandidate] = useState(initialCandidate);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [jobPosts, setJobPosts] = useState<RecruitmentRequest[]>([]);
  const [appliedPosts, setAppliedPosts] = useState<any[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const { showSuccess, showError } = usePopup();
  const skin = useSkin();

  // Set only when this detail view was reached through the Posts module, so the
  // header can name the post the candidate is being reviewed for.
  const activePost = activePostId ? jobPosts.find(p => p.id === activePostId) : null;

  // Reached via Posts > Recruitment Detail > Candidates: the post context is
  // already known, so the applied-posts list (and the module-only actions)
  // belong to the Candidates-module path only.
  const isPostContext = !!activePostId;

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const q = query(collection(db, 'recruits'), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        setJobPosts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as RecruitmentRequest)));
      } catch (error) {
        console.error('Error fetching jobs:', error);
      }
    };
    fetchJobs();
  }, []);

  // Interview status/round info (written by the invite modal and the Shortlisted module)
  const [interviewInfo, setInterviewInfo] = useState<{ roundType?: string; status?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchInterviewInfo = async () => {
      if (!candidate.id) return;
      try {
        const snap = await getDoc(doc(db, 'interviews', candidate.id));
        if (!cancelled) {
          setInterviewInfo(snap.exists() ? (snap.data() as { roundType?: string; status?: string }) : null);
        }
      } catch (error) {
        console.error('Error fetching interview info:', error);
      }
    };
    fetchInterviewInfo();
    return () => { cancelled = true; };
  }, [candidate.id]);

  // Fetch applied posts for this candidate (Candidates-module path only)
  useEffect(() => {
    const fetchAppliedPosts = async () => {
      if (!candidate.id) return;

      if (isPostContext) {
        setAppliedPosts([]);
        setLoadingPosts(false);
        return;
      }

      // If userApplications prop is provided, use it directly
      if (userApplications && userApplications.length > 0) {
        const postsWithDetails = await Promise.all(
          userApplications.map(async (app: any) => {
            try {
              const postDoc = await getDoc(doc(db, 'recruits', app.post_id));
              if (postDoc.exists()) {
                return { ...app, postDetails: { id: postDoc.id, ...postDoc.data() } };
              }
              return app;
            } catch {
              return app;
            }
          })
        );
        setAppliedPosts(postsWithDetails);
        return;
      }

      setLoadingPosts(true);
      try {
        // Fetch ALL applications and filter client-side (avoids missing index issues)
        const allSnapshot = await getDocs(collection(db, 'job_applications'));
        const applications = allSnapshot.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter((app: any) => app.user_id === candidate.id);
        
        const postsWithDetails = await Promise.all(
          applications.map(async (app: any) => {
            try {
              const postDoc = await getDoc(doc(db, 'recruits', app.post_id));
              if (postDoc.exists()) {
                return { ...app, postDetails: { id: postDoc.id, ...postDoc.data() } };
              }
              return app;
            } catch {
              return app;
            }
          })
        );
        
        setAppliedPosts(postsWithDetails);
      } catch (error: any) {
        console.error('Error fetching applied posts:', error?.message || error);
        setAppliedPosts([]);
      } finally {
        setLoadingPosts(false);
      }
    };
    fetchAppliedPosts();
  }, [candidate.id, userApplications, isPostContext]);

  // If initialCandidate changes, update local state
  if (initialCandidate.id !== candidate.id) {
    setCandidate(initialCandidate);
  }

  const handleRemove = async () => {
    setRemoving(true);
    try {
      // Defensive check
      if (!candidate.id) throw new Error('Candidate ID is missing.');
      // Delete from Firestore
      await deleteDoc(doc(db, 'candidates', candidate.id));
      // Delete from Firebase Storage
      if (candidate.resumeUrl) {
        const match = candidate.resumeUrl.match(/resumes\/([^/?#]+)/);
        const fileName = match ? match[1] : null;
        if (fileName) {
          const fileRef = ref(storage, `resumes/${fileName}`);
          await deleteObject(fileRef).catch(() => {});
        }
      }
      showSuccess('Candidate removed successfully');
      onRemoveCandidate?.();
    } catch (err) {
      showError('Failed to remove candidate');
      setRemoving(false);
    }
  };

  // Status to show in place of the invite action once the candidate has moved
  // beyond "applied" (shortlisted, or in an interview round).
  const statusLabel = (() => {
    const statuses = [candidate.status, interviewInfo?.status].filter(Boolean) as string[];
    const round = statuses.find((s) => /^round\d+$/.test(s));
    if (round) {
      const roundNumber = round.replace(/\D/g, '');
      const roundName = interviewInfo?.roundType || candidate.interviewDetails?.roundType || '';
      return roundName ? `Round ${roundNumber} - ${roundName}` : `Round ${roundNumber}`;
    }
    const status = statuses.find((s) => ['shortlisted', 'selected', 'rejected'].includes(s));
    if (status) return status.charAt(0).toUpperCase() + status.slice(1);
    return null;
  })();

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Masthead - the Posts/Candidates recipe: hairline edge, surface, radius,
          elevation and brand wash from the active skin. Title row carries the
          back control, candidate identity and the page actions. */}
      <div className={`shrink-0 mb-4 overflow-hidden border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.headerWash}`}>
        <div className={`flex flex-wrap items-center justify-between gap-3 border-b ${skin.edge} px-4 py-3.5 sm:px-5`}>
          {/* Left: Back + Name/Post */}
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={onBack}
              className={`group inline-flex h-8 w-8 shrink-0 items-center justify-center ${skin.iconTile} ${skin.radius} cursor-pointer transition-colors duration-200 hover:border-brand hover:text-brand ${FOCUS}`}
              title="Back"
              aria-label="Go back"
            >
              <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" aria-hidden="true" />
            </button>
            <div className="flex min-w-0 flex-col">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h1 className={`${skin.heading} max-w-full truncate`}>
                  {candidate.name}
                </h1>
                {activePostId && (
                  statusLabel ? (
                    <span
                      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink ${skin.radius}`}
                      title="Interview status"
                    >
                      {statusLabel}
                    </span>
                  ) : candidate.email ? (
                    <button
                      onClick={() => setShowInviteModal(true)}
                      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center ${skin.iconTile} ${skin.radius} cursor-pointer transition-colors duration-200 hover:border-brand hover:text-brand active:scale-95 ${FOCUS}`}
                      title="Send Interview Invite"
                      aria-label="Send interview invite"
                    >
                      <MailPlus className="h-4 w-4" aria-hidden="true" />
                    </button>
                  ) : null
                )}
              </div>
            </div>
          </div>

          {/* Right: Action Buttons */}
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              onClick={handleRemove}
              disabled={removing}
              className={`inline-flex items-center gap-1.5 cursor-pointer border border-destructive bg-surface px-4 py-2 text-xs font-semibold uppercase tracking-wider text-destructive transition-colors duration-200 hover:bg-destructive hover:text-white disabled:opacity-50 ${FOCUS}`}
            >
              {removing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {removing ? 'Deleting...' : 'Delete'}
            </button>

            <a
              href={candidate.resumeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-1.5 cursor-pointer ${skin.cta} ${FOCUS}`}
            >
              Resume
            </a>
          </div>
        </div>

        {/* Description row - separated from the title row by the same hairline
            used across the other mastheads. */}
        {(activePost?.jobTitle || candidate.selectedInterviewDate) && (
          <div className="px-4 py-2.5 sm:px-5">
            {activePost?.jobTitle && <p className={skin.body}>{activePost.jobTitle}</p>}
            {candidate.selectedInterviewDate && (
              <p className={`${skin.meta} mt-1`}>Interview on {candidate.selectedInterviewDate}</p>
            )}
          </div>
        )}
      </div>

      {/* Content - Scrollable */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className={`border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.shadow} p-6 space-y-6`}>
            {/* Applied Posts - Candidates-module path only; when the detail is
                reached through a post the context is already known. */}
            {!isPostContext && (
            <div className={`border ${skin.edge} ${skin.surface} ${skin.radius} p-6`}>
              <h3 className={`${skin.cardTitle} mb-4`}>
                Applied Posts
              </h3>
              {loadingPosts ? (
                <div className="flex items-center gap-2 text-ink/60">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Loading applied posts...</span>
                </div>
              ) : appliedPosts.length === 0 ? (
                <p className="text-ink/60 text-sm">No applications found</p>
              ) : (
                <div className="space-y-3">
                  {appliedPosts.map((app, index) => (
                    <div key={index} className={`border ${skin.edge} ${skin.surface} ${skin.radius} p-4 transition-colors ${skin.rowHover} ${skin.cardHover}`}>
                      {app.postDetails ? (
                        <div>
                          <div className="flex items-start justify-between">
                            <div>
                              <h4 className="font-semibold text-ink flex items-center gap-2">
                                {app.postDetails.jobTitle || 'Job Post'}
                                {candidate.rankings && candidate.rankings[app.post_id] && (
                                  <span className={`text-xs px-2 py-0.5 rounded border ${candidate.rankings[app.post_id].score >= 70 ? 'bg-ink/10 text-ink border-ink/20' :
                                    candidate.rankings[app.post_id].score >= 40 ? 'bg-brand/10 text-brand border-brand/20' :
                                      'bg-destructive/10 text-destructive border-destructive/20'
                                    }`}>
                                    {candidate.rankings[app.post_id].score}% Match
                                  </span>
                                )}
                              </h4>
                              <p className="text-sm text-ink/70 mt-1">{app.postDetails.department || 'Department not specified'}</p>
                              <p className={`mt-1 ${skin.meta}`}>
                                Applied: {app.created_at?.toDate?.() ? new Date(app.created_at.toDate()).toLocaleDateString() : (app.created_at ? new Date(app.created_at).toLocaleDateString() : 'N/A')}
                              </p>
                            </div>
                            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${app.status === 'shortlisted' ? 'bg-brand/10 text-brand border-brand/20' :
                              app.status === 'selected' ? 'bg-ink/10 text-ink border-ink/20' :
                                app.status === 'rejected' ? 'bg-destructive/10 text-destructive border-destructive/20' :
                                  app.status === 'interviewed' ? 'bg-muted text-ink/70 border-border' :
                                    'border-border bg-surface text-ink/70'
                              }`}>
                              {app.status === 'shortlisted' ? 'Shortlisted' :
                               app.status === 'selected' ? 'Selected' :
                               app.status === 'rejected' ? 'Rejected' :
                               app.status === 'interviewed' ? 'Interviewed' :
                               app.status === 'applied' ? 'Applied' :
                               app.status || 'Pending'}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-ink/60 text-sm">Post details not available</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            )}

            {/* Contact Info */}
            <div className={`border ${skin.edge} ${skin.surface} ${skin.radius} p-6`}>
              <h3 className={`${skin.cardTitle} mb-3`}>
                Contact Information
              </h3>
              <div className="space-y-3">
                {candidate.email && (
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-ink/60 font-medium w-16">Email:</span>
                    <span className="text-ink/80">{candidate.email}</span>
                  </div>
                )}
                {candidate.phone && (
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-ink/60 font-medium w-16">Phone:</span>
                    <span className="text-ink/80">{candidate.phone}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Skills */}
            {candidate.skills && candidate.skills.length > 0 && (
              <div className={`border ${skin.edge} ${skin.surface} ${skin.radius} p-6`}>
                <h3 className={`${skin.cardTitle} mb-3`}>
                  Skills
                </h3>
                <div className="flex flex-wrap gap-2">
                  {candidate.skills.map((skill, index) => (
                    <span key={index} className={skin.tag}>
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Education */}
            {candidate.education && candidate.education.length > 0 && (
              <div className={`border ${skin.edge} ${skin.surface} ${skin.radius} p-6`}>
                <h3 className={`${skin.cardTitle} mb-4 flex flex-wrap items-center gap-3`}>
                  Education
                  {candidate.education.filter((edu) => edu.cgpa).map((edu, i) => (
                    <span key={i} className="inline-block bg-ink px-2 py-0.5 text-xs font-semibold text-surface">
                      {isNaN(parseFloat(String(edu.cgpa))) ? edu.cgpa : `CGPA: ${edu.cgpa}`}
                    </span>
                  ))}
                </h3>
                <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-6">
                  {candidate.education.map((edu, index) => (
                    <div key={index} className="min-w-0 grow basis-60">
                      {(edu.degree || edu.field) && (
                        <p className="text-ink/80 font-medium">
                          {edu.degree}
                          {edu.field && ` in ${edu.field}`}
                        </p>
                      )}
                      <p className="text-ink/70">{edu.institution}</p>
                      {edu.year && <p className="mt-2 text-sm text-ink/60">{edu.year}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Experience */}
            <div className={`border ${skin.edge} ${skin.surface} ${skin.radius} p-6`}>
              <h3 className={`${skin.cardTitle} mb-3`}>
                Experience
              </h3>
              {(candidate.role || candidate.experience) && (
                <div className={`mb-4 pb-4 border-b ${skin.edge} space-y-1.5`}>
                  {candidate.role && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-ink/60">Role:</span>
                      <span className="text-sm font-semibold text-ink">{candidate.role}</span>
                    </div>
                  )}
                  {candidate.experience && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-ink/60">Overall:</span>
                      <span className="text-sm font-semibold text-ink">{candidate.experience}</span>
                    </div>
                  )}
                </div>
              )}
              {candidate.extractedData?.workExperience && candidate.extractedData.workExperience.length > 0 && (
                <div className="space-y-4">
                  {candidate.extractedData.workExperience.map((exp, index) => (
                    <div key={index} className="border-l-4 border-brand/30 pl-4">
                      {(exp.position || exp.company) && (
                        <p className="text-ink/80 font-medium">{`${exp.position || ''}${exp.position && exp.company ? ' @ ' : ''}${exp.company || ''}`}</p>
                      )}
                      <p className="text-ink/60 text-sm mb-1">{exp.duration}</p>
                      {exp.description && <p className="text-ink/80 text-sm">{exp.description}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Projects */}
            {(() => {
              const projectsRaw = (candidate as any).keyProjects ?? (candidate as any).projects ?? (candidate as any).extractedData?.projects;

              if (typeof projectsRaw === 'string' && projectsRaw.trim().length > 0) {
                const projectLines = projectsRaw.split('\n').filter((line: string) => line.trim().length > 0);
                if (projectLines.length > 0) {
                  return (
                    <div className={`border ${skin.edge} ${skin.surface} ${skin.radius} p-6`}>
                      <h3 className={`${skin.cardTitle} mb-3`}>
                        Key Projects
                      </h3>
                      <div className="space-y-3">
                        {projectLines.map((line: string, index: number) => (
                          <div key={index} className="border-l-4 border-brand/30 pl-4">
                            <p className="text-ink/80">{line.trim()}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }
              }

              if (Array.isArray(projectsRaw) && projectsRaw.length > 0) {
                return (
                  <div className={`border ${skin.edge} ${skin.surface} ${skin.radius} p-6`}>
                    <h3 className={`${skin.cardTitle} mb-3`}>
                      Projects
                    </h3>
                    <div className="space-y-4">
                      {projectsRaw.map((proj: any, index: number) => (
                        <div key={index} className="border-l-4 border-brand/30 pl-4">
                          {(proj.name || proj.title) && (
                            <p className="text-ink/80 font-medium">{proj.name || proj.title}</p>
                          )}
                          {proj.description && <p className="text-ink/60 text-sm">{proj.description}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }

              return null;
            })()}

            {/* Certifications */}
            {(() => {
              const certificationsRaw = (candidate as any).certifications ?? (candidate as any).extractedData?.certifications;

              if (typeof certificationsRaw === 'string' && certificationsRaw.trim().length > 0) {
                const certLines = certificationsRaw.split('\n').filter((line: string) => line.trim().length > 0);
                if (certLines.length > 0) {
                  return (
                    <div className={`border ${skin.edge} ${skin.surface} ${skin.radius} p-6`}>
                      <h3 className={`${skin.cardTitle} mb-3`}>
                        Certifications
                      </h3>
                      <div className="space-y-2">
                        {certLines.map((line: string, index: number) => (
                          <div key={index} className="text-ink/80">
                            {line.trim()}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }
              }

              if (Array.isArray(certificationsRaw) && certificationsRaw.length > 0) {
                return (
                  <div className={`border ${skin.edge} ${skin.surface} ${skin.radius} p-6`}>
                    <h3 className={`${skin.cardTitle} mb-3`}>
                      Certifications
                    </h3>
                    <div className="space-y-2">
                      {certificationsRaw.map((cert: any, index: number) => {
                        const text = typeof cert === 'string' ? cert : (cert.certificate ?? cert.name ?? JSON.stringify(cert));
                        if (!text) return null;
                        return (
                          <div key={index} className="text-ink/80">
                            {text}
                            {cert.provider && (
                              <span className="text-ink/60 text-xs ml-2">({cert.provider})</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              }

              return null;
            })()}
          </div>
      </div>

      {showInviteModal && (
        <InterviewInviteModal
          candidate={candidate}
          onClose={() => setShowInviteModal(false)}
          onSent={onInviteSent}
          defaultPostId={activePostId}
        />
      )}
    </div>
  );
}