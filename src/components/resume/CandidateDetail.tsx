'use client';

import type { Candidate, RecruitmentRequest } from '@/types';
import { ArrowLeft, Mail, Phone, Calendar, Briefcase, GraduationCap, Award, Edit2, MailPlus, FolderKanban, Sparkles } from 'lucide-react';
import { useState } from 'react';
import InterviewInviteModal from './InterviewInviteModal';
import AIScoringModal from './AIScoringModal';
import { deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { supabase } from '@/lib/supabase';
import { analyzeCandidateScores } from '@/lib/aiService';
import toast from 'react-hot-toast';

interface CandidateDetailProps {
  candidate: Candidate;
  onBack: () => void;
  onEdit?: (candidate: Candidate) => void;
  onInviteSent?: () => void;
  onRemoveCandidate?: () => void;
  onUpdateCandidate?: (updatedCandidate: Candidate) => void;
  userApplications?: any[];
}

export default function CandidateDetail({ candidate: initialCandidate, onBack, onEdit, onInviteSent, onRemoveCandidate, onUpdateCandidate, userApplications }: CandidateDetailProps) {
  const [candidate, setCandidate] = useState(initialCandidate);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [scoring, setScoring] = useState(false);

  // If initialCandidate changes, update local state
  if (initialCandidate.id !== candidate.id) {
    setCandidate(initialCandidate);
  }

  const handleScoreJob = async (job: RecruitmentRequest) => {
    if (!job.id || !job.description) return;
    setScoring(true);
    toast.loading(`Evaluating match for ${job.jobTitle}...`, { id: 'score-job' });
    try {
      const [updatedCandidate] = await analyzeCandidateScores(
        [candidate],
        job.description,
        job.id,
        job.jobTitle
      );

      setCandidate(updatedCandidate);
      if (onUpdateCandidate) onUpdateCandidate(updatedCandidate);

      toast.success(`Score updated: ${updatedCandidate.rankings?.[job.id].score}%`, { id: 'score-job' });
      setShowScoreModal(false);
    } catch (error) {
      console.error('Scoring failed:', error);
      toast.error('Failed to analyze candidate', { id: 'score-job' });
    } finally {
      setScoring(false);
    }
  };

  const handleRemove = async () => {
    if (!window.confirm('Are you sure you want to remove this candidate?')) return;
    setRemoving(true);
    try {
      // Defensive check
      if (!candidate.id) throw new Error('Candidate ID is missing.');
      // Delete from Firestore
      await deleteDoc(doc(db, 'candidates', candidate.id));
      // Delete from Supabase Storage
      if (candidate.resumeUrl) {
        // Extract file name from public URL 
        const match = candidate.resumeUrl.match(/resumes\/([^/?#]+)/);
        const fileName = match ? match[1] : null;
        if (fileName) {
          await supabase.storage.from('resumes').remove([fileName]);
        }
      }
      onRemoveCandidate?.();
    } catch (err) {
      alert('Failed to remove candidate.');
      setRemoving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <button
          onClick={onBack}
          className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
          <span>Back to Candidates</span>
        </button>
      </div>

      <div className="bg-white rounded-lg shadow">
        {/* Header */}
        <div className="px-6 py-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3 flex-wrap">
                <span>{candidate.name}</span>
                {candidate.email && (
                  <button
                    onClick={() => setShowInviteModal(true)}
                    className="p-2 rounded-lg bg-gradient-to-r from-orange-500 to-pink-600 text-white hover:shadow-lg hover:shadow-orange-500/30 hover:scale-110 active:scale-95 transition-all"
                    title="Send Interview Invite"
                  >
                    <MailPlus className="h-4 w-4" />
                  </button>
                )}
              </h1>
              {candidate.role && (
                <p className="text-lg text-gray-600">{candidate.role}</p>
              )}
              <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-gray-500">
                {(candidate as any).selectedInterviewDate && (
                  <div className="flex items-center space-x-1">
                    <Calendar className="h-4 w-4 text-primary-600" />
                    <span>Interview on {(candidate as any).selectedInterviewDate}</span>
                  </div>
                )}
                {candidate.email && (
                  <div className="flex items-center space-x-1.5">
                    <Mail className="h-4 w-4 text-blue-600" />
                    <span>{candidate.email}</span>
                  </div>
                )}
                {candidate.phone && (
                  <div className="flex items-center space-x-1.5">
                    <Phone className="h-4 w-4 text-green-600" />
                    <span>{candidate.phone}</span>
                  </div>
                )}
                {(() => {
                  const expStr = candidate.experience ?? '';
                  if (/month/i.test(expStr)) {
                    return (
                      <div className="flex items-center space-x-1.5">
                        <Briefcase className="h-4 w-4 text-orange-600" />
                        <span>{expStr}</span>
                      </div>
                    );
                  }
                  const yrs = (() => {
                    const numMatch = expStr.match(/\d+(?:\.\d+)?/);
                    return numMatch ? parseFloat(numMatch[0]) : 0;
                  })();
                  return (
                    <div className="flex items-center space-x-1.5">
                      <Briefcase className="h-4 w-4 text-orange-600" />
                      <span>{`${yrs} years experience`}</span>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3">
              {/* AI Score Badge (Existing) */}
              {candidate.rankings && Object.keys(candidate.rankings).length > 0 && (
                <div className="flex items-center space-x-1.5 px-3 py-1.5 bg-purple-50 rounded-lg border border-purple-100 text-purple-700 shadow-sm animate-in fade-in zoom-in spin-in-1 mr-2">
                  <Sparkles className="h-4 w-4 fill-purple-300" />
                  <span className="font-bold text-sm">
                    {/* Show highest score or first one found */}
                    {Object.values(candidate.rankings).reduce((max, r) => Math.max(max, r.score), 0)}%
                  </span>
                </div>
              )}

              {onEdit && (
                <button
                  onClick={() => onEdit(candidate)}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700 transition-colors text-sm font-medium"
                >
                  <Edit2 className="w-4 h-4" />
                  Edit Profile
                </button>
              )}

              {/* Manual AI Score Trigger (New) */}
              {(!candidate.rankings || Object.keys(candidate.rankings).length === 0) && (
                <button
                  onClick={() => setShowScoreModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-pink-50 border border-pink-200 text-pink-700 rounded-md hover:bg-pink-100 transition-colors text-sm font-medium"
                >
                  <Sparkles className="w-4 h-4" />
                  AI Score
                </button>
              )}

              <a
                href={candidate.resumeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700 transition-colors text-sm font-medium"
              >
                View Resume
              </a>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-6">
          <div className="space-y-6">
            {/* Application History */}
            {userApplications && userApplications.length > 0 && (
              <div className="bg-white border rounded-lg shadow p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Briefcase className="w-5 h-5 text-blue-600" />
                  Applied Jobs
                </h3>
                <div className="space-y-3">
                  {userApplications.map((app, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                      {app.postDetails ? (
                        <div>
                          <div className="flex items-start justify-between">
                            <div>
                              <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                                {app.postDetails.jobTitle || 'Job Post'}
                                {/* AI Score for this specific job */}
                                {candidate.rankings && candidate.rankings[app.post_id] && (
                                  <span className={`text-xs px-2 py-0.5 rounded border ${candidate.rankings[app.post_id].score >= 70 ? 'bg-green-50 text-green-700 border-green-200' :
                                    candidate.rankings[app.post_id].score >= 40 ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                                      'bg-red-50 text-red-700 border-red-200'
                                    }`}>
                                    {candidate.rankings[app.post_id].score}% Match
                                  </span>
                                )}
                              </h4>
                              <p className="text-sm text-gray-600 mt-1">{app.postDetails.department || 'Department not specified'}</p>
                              <p className="text-xs text-gray-500 mt-1">
                                Applied: {new Date(app.created_at).toLocaleDateString()}
                              </p>
                            </div>
                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${app.status === 'shortlisted' ? 'bg-orange-100 text-orange-700' :
                              app.status === 'selected' ? 'bg-green-100 text-green-700' :
                                app.status === 'rejected' ? 'bg-red-100 text-red-700' :
                                  'bg-gray-100 text-gray-700'
                              }`}>
                              {app.status || 'Pending'}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-gray-500 text-sm">Post details not available</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Skills */}
            {candidate.skills && candidate.skills.length > 0 && (
              <div className="bg-white border rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                  <Award className="h-5 w-5 mr-2 text-orange-600" />
                  Skills
                </h3>
                <div className="flex flex-wrap gap-2">
                  {candidate.skills.map((skill, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-green-100 text-green-800"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Education */}
            {candidate.education && candidate.education.length > 0 && (
              <div className="bg-white border rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                  <GraduationCap className="h-5 w-5 mr-2 text-indigo-600" />
                  Education
                  {(() => {
                    // Find first CGPA value if present
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
                    <div key={index} className="border-l-4 border-indigo-200 pl-4">
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

            {/* Work Experience */}
            {candidate.extractedData?.workExperience && candidate.extractedData.workExperience.length > 0 && (
              <div className="bg-white border rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                  <Briefcase className="h-5 w-5 mr-2 text-blue-600" />
                  Work Experience
                </h3>
                <div className="space-y-4">
                  {candidate.extractedData.workExperience.map((exp, index) => (
                    <div key={index} className="border-l-4 border-blue-200 pl-4">
                      {(exp.position || exp.company) && (
                        <p className="text-gray-700 font-medium">{`${exp.position || ''}${exp.position && exp.company ? ' @ ' : ''}${exp.company || ''}`}</p>
                      )}
                      <p className="text-gray-500 text-sm mb-1">{exp.duration}</p>
                      {exp.description && <p className="text-gray-700 text-sm">{exp.description}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Projects */}
            {(() => {
              const projectsRaw = (candidate as any).keyProjects ?? (candidate as any).projects ?? (candidate as any).extractedData?.projects;

              // Handle string format (from user profile textarea)
              if (typeof projectsRaw === 'string' && projectsRaw.trim().length > 0) {
                const projectLines = projectsRaw.split('\n').filter((line: string) => line.trim().length > 0);
                if (projectLines.length > 0) {
                  return (
                    <div className="bg-white border rounded-lg shadow p-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                        <FolderKanban className="h-5 w-5 mr-2 text-purple-600" />
                        Key Projects
                      </h3>
                      <div className="space-y-3">
                        {projectLines.map((line: string, index: number) => (
                          <div key={index} className="border-l-4 border-purple-200 pl-4">
                            <p className="text-gray-700">{line.trim()}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }
              }

              // Handle array format (from resume parsing)
              if (Array.isArray(projectsRaw) && projectsRaw.length > 0) {
                return (
                  <div className="bg-white border rounded-lg shadow p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                      <FolderKanban className="h-5 w-5 mr-2 text-purple-600" />
                      Projects
                    </h3>
                    <div className="space-y-4">
                      {projectsRaw.map((proj: any, index: number) => (
                        <div key={index} className="border-l-4 border-purple-200 pl-4">
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

              // Handle string format (from user profile textarea)
              if (typeof certificationsRaw === 'string' && certificationsRaw.trim().length > 0) {
                const certLines = certificationsRaw.split('\n').filter((line: string) => line.trim().length > 0);
                if (certLines.length > 0) {
                  return (
                    <div className="bg-white border rounded-lg shadow p-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                        <Award className="h-5 w-5 mr-2 text-emerald-600" />
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

              // Handle array format (from resume parsing)
              if (Array.isArray(certificationsRaw) && certificationsRaw.length > 0) {
                return (
                  <div className="bg-white border rounded-lg shadow p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                      <Award className="h-5 w-5 mr-2 text-emerald-600" />
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
      </div>

      {showInviteModal && (
        <InterviewInviteModal
          candidate={candidate}
          onClose={() => setShowInviteModal(false)}
          onSent={onInviteSent}
        />
      )}

      {showScoreModal && (
        <AIScoringModal
          onClose={() => setShowScoreModal(false)}
          onSelectJob={handleScoreJob}
          isLoading={scoring}
        />
      )}

      {/* Remove Candidate Button */}
      <div className="flex justify-end">
        <button
          className="mt-6 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
          onClick={handleRemove}
          disabled={removing}
        >
          {removing ? 'Removing...' : 'Remove Candidate'}
        </button>
      </div>
    </div>
  );
}