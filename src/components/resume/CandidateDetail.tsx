'use client';

import type { Candidate, RecruitmentRequest } from '@/types';
import { ArrowLeft, MailPlus, ArrowRightCircle, Edit2, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import CustomDropdown from '@/components/CustomDropdown';
import { collection, query, orderBy, getDocs, deleteDoc, doc, getDoc } from 'firebase/firestore';
import { db, storage } from '@/lib/firebase';
import { setApplicationStatus, upsertApplication } from '@/lib/jobApplications';
import InterviewInviteModal from './InterviewInviteModal';
import { ref, deleteObject } from 'firebase/storage';
import { usePopup } from '@/components/ui/Popup';
import toast from 'react-hot-toast';

interface CandidateDetailProps {
  candidate: Candidate;
  onBack: () => void;
  onEdit?: (candidate: Candidate) => void;
  onInviteSent?: () => void;
  onRemoveCandidate?: () => void;
  onUpdateCandidate?: (updatedCandidate: Candidate) => void;
  userApplications?: any[];
  /** Post ID this candidate list is currently filtered to (set only when reached via the Posts module). Gates the "Send Interview Invite" action. */
  activePostId?: string | null;
}

export default function CandidateDetail({ candidate: initialCandidate, onBack, onEdit, onInviteSent, onRemoveCandidate, onUpdateCandidate, userApplications, activePostId }: CandidateDetailProps) {
  const [candidate, setCandidate] = useState(initialCandidate);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [jobPosts, setJobPosts] = useState<RecruitmentRequest[]>([]);
  const [shortlistPostId, setShortlistPostId] = useState('');
  const [shortlisting, setShortlisting] = useState(false);
  const [appliedPosts, setAppliedPosts] = useState<any[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const { showSuccess, showError } = usePopup();

  // Set only when this detail view was reached through the Posts module, so the
  // header can name the post the candidate is being reviewed for.
  const activePost = activePostId ? jobPosts.find(p => p.id === activePostId) : null;

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

  // Fetch applied posts for this candidate
  useEffect(() => {
    const fetchAppliedPosts = async () => {
      if (!candidate.id) return;

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
  }, [candidate.id, userApplications]);

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

  const handleShortlistToPost = async () => {
    if (!shortlistPostId) return;
    setShortlisting(true);
    try {
      const isJobApplicant = !!(candidate as any).postId;

      if (isJobApplicant) {
        // Registered user / job applicant — update existing application
        await setApplicationStatus(shortlistPostId, candidate.id, 'shortlisted');
      } else {
        // Manual candidate — update Firestore + create application
        const candidateRef = doc(db, 'candidates', candidate.id);
        await import('firebase/firestore').then(({ updateDoc }) =>
          updateDoc(candidateRef, {
            postId: shortlistPostId,
            status: 'shortlisted',
            updatedAt: new Date(),
          })
        );

        await upsertApplication(shortlistPostId, candidate.id, 'shortlisted');
      }

      // Update local candidate state
      setCandidate(prev => ({ ...prev, status: 'shortlisted', postId: shortlistPostId } as Candidate));
      if (onUpdateCandidate) {
        onUpdateCandidate({ ...candidate, status: 'shortlisted', postId: shortlistPostId } as Candidate);
      }
    } catch (err: any) {
      console.error('Shortlist failed:', err);
      toast.error(err.message || 'Failed to shortlist candidate');
    } finally {
      setShortlisting(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header - Fixed */}
      <div className="bg-surface p-4 rounded-xl border border-gray-200 sticky top-0 z-10 mb-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          {/* Left: Back + Name/Role */}
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-1.5 mt-0.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors flex-shrink-0"
              title="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-xl font-bold text-gray-900">
                  {candidate.name}{activePost?.jobTitle && ` - ${activePost.jobTitle}`}
                </h2>
                {candidate.email && activePostId && (
                  <button
                    onClick={() => setShowInviteModal(true)}
                    className="p-1.5 rounded-lg bg-brand text-white hover:shadow-lg hover:shadow-brand/30 hover:scale-110 active:scale-95 transition-all"
                    title="Send Interview Invite"
                  >
                    <MailPlus className="h-4 w-4" />
                  </button>
                )}
              </div>
              {(candidate as any).selectedInterviewDate && (
                <div className="flex items-center gap-1.5 text-sm text-gray-500">
                  <span>Interview on {(candidate as any).selectedInterviewDate}</span>
                </div>
              )}
            </div>
          </div>

          {/* Right: Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <CustomDropdown
                value={shortlistPostId}
                onChange={setShortlistPostId}
                options={jobPosts.map((job) => ({ value: job.id || '', label: job.jobTitle || 'Untitled Post' }))}
                placeholder="Select Post"
                className="max-w-[180px]"
              />
              <button
                onClick={handleShortlistToPost}
                disabled={!shortlistPostId || shortlisting}
                className="flex items-center gap-1.5 px-3 py-2 bg-surface border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                <ArrowRightCircle className="w-4 h-4" />
                {shortlisting ? 'Moving...' : 'Move'}
              </button>
            </div>

            {onEdit && (
              <button
                onClick={() => onEdit(candidate)}
                className="flex items-center gap-1.5 px-3 py-2 bg-surface border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 transition-colors text-sm font-medium"
              >
                <Edit2 className="w-4 h-4" />
                Edit
              </button>
            )}

            <a
              href={candidate.resumeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 bg-brand text-white rounded-lg hover:bg-brand transition-colors text-sm font-medium"
            >
              Resume
            </a>
          </div>
        </div>
      </div>

      {/* Content - Scrollable */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="bg-surface border border-gray-200 rounded-xl p-6 space-y-6">
            {/* Applied Posts */}
            <div className="bg-surface border border-gray-200 rounded-lg p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">
                Applied Posts
              </h3>
              {loadingPosts ? (
                <div className="flex items-center gap-2 text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Loading applied posts...</span>
                </div>
              ) : appliedPosts.length === 0 ? (
                <p className="text-gray-500 text-sm">No applications found</p>
              ) : (
                <div className="space-y-3">
                  {appliedPosts.map((app, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                      {app.postDetails ? (
                        <div>
                          <div className="flex items-start justify-between">
                            <div>
                              <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                                {app.postDetails.jobTitle || 'Job Post'}
                                {candidate.rankings && candidate.rankings[app.post_id] && (
                                  <span className={`text-xs px-2 py-0.5 rounded border ${candidate.rankings[app.post_id].score >= 70 ? 'bg-green-50 text-green-700 border-green-200' :
                                    candidate.rankings[app.post_id].score >= 40 ? 'bg-brand/10 text-brand border-brand/30' :
                                      'bg-red-50 text-red-700 border-red-200'
                                    }`}>
                                    {candidate.rankings[app.post_id].score}% Match
                                  </span>
                                )}
                              </h4>
                              <p className="text-sm text-gray-600 mt-1">{app.postDetails.department || 'Department not specified'}</p>
                              <p className="text-xs text-gray-500 mt-1">
                                Applied: {app.created_at?.toDate?.() ? new Date(app.created_at.toDate()).toLocaleDateString() : (app.created_at ? new Date(app.created_at).toLocaleDateString() : 'N/A')}
                              </p>
                            </div>
                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${app.status === 'shortlisted' ? 'bg-brand/20 text-brand' :
                              app.status === 'selected' ? 'bg-green-100 text-green-700' :
                                app.status === 'rejected' ? 'bg-red-100 text-red-700' :
                                  app.status === 'interviewed' ? 'bg-blue-100 text-blue-700' :
                                    'bg-gray-100 text-gray-700'
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
                        <p className="text-gray-500 text-sm">Post details not available</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Contact Info */}
            <div className="bg-surface border border-gray-200 rounded-lg p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-3">
                Contact Information
              </h3>
              <div className="space-y-3">
                {candidate.email && (
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-gray-500 font-medium w-16">Email:</span>
                    <span className="text-gray-700">{candidate.email}</span>
                  </div>
                )}
                {candidate.phone && (
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-gray-500 font-medium w-16">Phone:</span>
                    <span className="text-gray-700">{candidate.phone}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Skills */}
            {candidate.skills && candidate.skills.length > 0 && (
              <div className="bg-surface border border-gray-200 rounded-lg p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-3">
                  Skills
                </h3>
                <div className="flex flex-wrap gap-2">
                  {candidate.skills.map((skill, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-3 py-1 rounded-full text-sm border border-gray-200 text-gray-700"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Education */}
            {candidate.education && candidate.education.length > 0 && (
              <div className="bg-surface border border-gray-200 rounded-lg p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-3">
                  Education
                  {(() => {
                    const eduWithCgpa: any = (candidate.education || []).find((e: any) => (e.cgpa ?? e.CGPA) !== undefined && (e.cgpa ?? e.CGPA) !== null);
                    if (!eduWithCgpa) return null;
                    const raw = (eduWithCgpa.cgpa ?? eduWithCgpa.CGPA) as string;
                    const cgpa = parseFloat(raw);
                    const good = !isNaN(cgpa) && cgpa >= 7;
                    const badgeClass = good ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
                    return (
                      <span className={`ml-3 inline-block px-2 py-0.5 text-xs font-semibold rounded ${badgeClass}`}>CGPA: {cgpa}</span>
                    );
                  })()}
                </h3>
                <div className="space-y-4">
                  {candidate.education.map((edu, index) => (
                    <div key={index} className="border-l-4 border-brand/30 pl-4">
                      {(edu.degree || edu.field) && (
                        <p className="text-gray-800 font-medium">
                          {edu.degree}
                          {edu.field && ` in ${edu.field}`}
                        </p>
                      )}
                      <p className="text-gray-600">{edu.institution}</p>
                      {edu.year && <p className="text-sm text-gray-500">{edu.year}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Experience */}
            <div className="bg-surface border border-gray-200 rounded-lg p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-3">
                Experience
              </h3>
              {(candidate.role || candidate.experience) && (
                <div className="mb-4 pb-4 border-b border-gray-100 space-y-1.5">
                  {candidate.role && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-500">Role:</span>
                      <span className="text-sm font-semibold text-gray-900">{candidate.role}</span>
                    </div>
                  )}
                  {candidate.experience && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-500">Overall:</span>
                      <span className="text-sm font-semibold text-gray-900">{candidate.experience}</span>
                    </div>
                  )}
                </div>
              )}
              {candidate.extractedData?.workExperience && candidate.extractedData.workExperience.length > 0 && (
                <div className="space-y-4">
                  {candidate.extractedData.workExperience.map((exp, index) => (
                    <div key={index} className="border-l-4 border-brand/30 pl-4">
                      {(exp.position || exp.company) && (
                        <p className="text-gray-700 font-medium">{`${exp.position || ''}${exp.position && exp.company ? ' @ ' : ''}${exp.company || ''}`}</p>
                      )}
                      <p className="text-gray-500 text-sm mb-1">{exp.duration}</p>
                      {exp.description && <p className="text-gray-700 text-sm">{exp.description}</p>}
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
                    <div className="bg-surface border border-gray-200 rounded-lg p-6">
                      <h3 className="text-lg font-bold text-gray-900 mb-3">
                        Key Projects
                      </h3>
                      <div className="space-y-3">
                        {projectLines.map((line: string, index: number) => (
                          <div key={index} className="border-l-4 border-brand/30 pl-4">
                            <p className="text-gray-700">{line.trim()}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }
              }

              if (Array.isArray(projectsRaw) && projectsRaw.length > 0) {
                return (
                  <div className="bg-surface border border-gray-200 rounded-lg p-6">
                    <h3 className="text-lg font-bold text-gray-900 mb-3">
                      Projects
                    </h3>
                    <div className="space-y-4">
                      {projectsRaw.map((proj: any, index: number) => (
                        <div key={index} className="border-l-4 border-brand/30 pl-4">
                          {(proj.name || proj.title) && (
                            <p className="text-gray-700 font-medium">{proj.name || proj.title}</p>
                          )}
                          {proj.description && <p className="text-gray-500 text-sm">{proj.description}</p>}
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
                    <div className="bg-surface border border-gray-200 rounded-lg p-6">
                      <h3 className="text-lg font-bold text-gray-900 mb-3">
                        Certifications
                      </h3>
                      <div className="space-y-2">
                        {certLines.map((line: string, index: number) => (
                          <div key={index} className="text-gray-700">
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
                  <div className="bg-surface border border-gray-200 rounded-lg p-6">
                    <h3 className="text-lg font-bold text-gray-900 mb-3">
                      Certifications
                    </h3>
                    <div className="space-y-2">
                      {certificationsRaw.map((cert: any, index: number) => {
                        const text = typeof cert === 'string' ? cert : (cert.certificate ?? cert.name ?? JSON.stringify(cert));
                        if (!text) return null;
                        return (
                          <div key={index} className="text-gray-700">
                            {text}
                            {cert.provider && (
                              <span className="text-gray-500 text-xs ml-2">({cert.provider})</span>
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

      {/* Remove Candidate Button */}
      <div className="flex justify-end flex-shrink-0 mt-4">
        <button
          className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
          onClick={handleRemove}
          disabled={removing}
        >
          {removing && <Loader2 className="h-4 w-4 animate-spin" />}
          {removing ? 'Removing...' : 'Remove Candidate'}
        </button>
      </div>
    </div>
  );
}