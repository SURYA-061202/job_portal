'use client';

import type { Candidate } from '@/types';
import { ArrowLeft, Mail, Phone, Calendar, Briefcase, GraduationCap, Award, Send } from 'lucide-react';
import { useState } from 'react';
import InterviewInviteModal from './InterviewInviteModal';
import { deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { supabase } from '@/lib/supabase';

interface CandidateDetailProps {
  candidate: Candidate;
  onBack: () => void;
  onInviteSent?: () => void;
  onRemoveCandidate?: () => void;
}

export default function CandidateDetail({ candidate, onBack, onInviteSent, onRemoveCandidate }: CandidateDetailProps) {
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [removing, setRemoving] = useState(false);

  const handleRemove = async () => {
    if (!window.confirm('Are you sure you want to remove this candidate?')) return;
    setRemoving(true);
    try {
      // Defensive check for candidate.id
      if (!candidate.id) throw new Error('Candidate ID is missing.');
      // Delete from Firestore
      await deleteDoc(doc(db, 'candidates', candidate.id));
      // Delete from Supabase Storage
      if (candidate.resumeUrl) {
        // Extract file name from public URL (fixed regex)
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
                  <Send
                    className="h-5 w-5 ml-3 text-primary-600 cursor-pointer"
                    onClick={() => setShowInviteModal(true)}
                  />
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
                  <div className="flex items-center space-x-1">
                    <Mail className="h-4 w-4 text-primary-600" />
                    <span>{candidate.email}</span>
                  </div>
                )}
                {candidate.phone && (
                  <div className="flex items-center space-x-1">
                    <Phone className="h-4 w-4 text-primary-600" />
                    <span>{candidate.phone}</span>
                  </div>
                )}
                {(() => {
                  const expNum = parseFloat(candidate.experience as any);
                  const years = isNaN(expNum) ? 0 : expNum;
                  return (
                    <div className="flex items-center space-x-1">
                      <Calendar className="h-4 w-4 text-primary-600" />
                      <span>{`${years} years experience`}</span>
                    </div>
                  );
                })()}
              </div>
            </div>
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

        {/* Content */}
        <div className="px-6 py-6">
          <div className="space-y-6">
            {/* Skills */}
            {candidate.skills && candidate.skills.length > 0 && (
              <div className="bg-white border rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                  <Award className="h-5 w-5 mr-2 text-primary-600" />
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
                  <GraduationCap className="h-5 w-5 mr-2 text-primary-600" />
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
                    <div key={index} className="border-l-4 border-primary-200 pl-4">
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
                  <Briefcase className="h-5 w-5 mr-2 text-primary-600" />
                  Work Experience
                </h3>
                <div className="space-y-4">
                  {candidate.extractedData.workExperience.map((exp, index) => (
                    <div key={index} className="border-l-4 border-primary-200 pl-4">
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
            {((((candidate as any).projects?.length ?? 0) > 0) || (((candidate as any).extractedData?.projects?.length ?? 0) > 0)) && (
              <div className="bg-white border rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                  <Briefcase className="h-5 w-5 mr-2 text-primary-600" />
                  Projects
                </h3>
                <div className="space-y-4">
                  {( (candidate as any).projects ?? (candidate as any).extractedData?.projects ).map((proj: any, index: number) => (
                    <div key={index} className="border-l-4 border-primary-200 pl-4">
                      {(proj.name || proj.title) && (
                        <p className="text-gray-700 font-medium">{proj.name || proj.title}</p>
                      )}
                      {proj.description && <p className="text-gray-500 text-sm">{proj.description}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Certifications */}
            {candidate.extractedData?.certifications && candidate.extractedData.certifications.length > 0 && (
              <div className="bg-white border rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                  <Award className="h-5 w-5 mr-2 text-primary-600" />
                  Certifications
                </h3>
                <div className="space-y-2">
                  {candidate.extractedData.certifications.map((cert: any, index: number) => {
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
            )}
          </div>
        </div>
      </div>

      {showInviteModal && (
        <InterviewInviteModal
          candidate={candidate}
          onClose={() => setShowInviteModal(false)}
          onSent={() => {
            setShowInviteModal(false);
            onInviteSent?.();
          }}
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