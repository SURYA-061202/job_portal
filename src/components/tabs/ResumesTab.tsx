'use client';

import { useState, useEffect, useRef } from 'react';
import { collection, getDocs, getDoc, addDoc, query as fsQuery, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { supabase } from '@/lib/supabase';
import type { Candidate, RecruitmentRequest } from '@/types';
import ResumeUpload from '@/components/resume/ResumeUpload';
import CandidateList from '@/components/resume/CandidateList';
import CandidateDetail from '@/components/resume/CandidateDetail';
import ManualDetailsModal from '@/components/resume/ManualDetailsModal';
import RecruitmentFormModal from '@/components/recruitment/RecruitmentFormModal';
import RecruitmentCard from '@/components/recruitment/RecruitmentCard';
import RecruitmentDetailsModal from '@/components/recruitment/RecruitmentDetailsModal';
import toast from 'react-hot-toast';
import openai from '@/lib/openai';
// PDF.js – load the worker dynamically so Vite can bundle it
// @ts-ignore
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker?url';
// @ts-ignore – pdfjsWorker will be resolved by Vite
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
import { ArrowLeft } from 'lucide-react';

export default function ResumesTab() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [filteredCandidates, setFilteredCandidates] = useState<Candidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [loading, setLoading] = useState(true);
  const [manualCandidate, setManualCandidate] = useState<Candidate | null>(null);
  const [activeView, setActiveView] = useState<'upload' | 'candidates' | 'history' | 'posts'>('posts');
  const [searchTerm, setSearchTerm] = useState('');
  const [isRecruitmentModalOpen, setIsRecruitmentModalOpen] = useState(false);
  const [recruitmentRequests, setRecruitmentRequests] = useState<RecruitmentRequest[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [selectedPost, setSelectedPost] = useState<RecruitmentRequest | null>(null);
  const [filterPostId, setFilterPostId] = useState<string | null>(null);
  const [isFilteringApplicants, setIsFilteringApplicants] = useState(false);
  const isFilteringRef = useRef(false);

  useEffect(() => {
    isFilteringRef.current = isFilteringApplicants;
  }, [isFilteringApplicants]);

  // Helpers to detect placeholder values coming from failed AI extraction
  const isPlaceholderName = (name: string) => /^(john|jane)\s+doe$/i.test(name.trim());
  const isPlaceholderEmail = (email: string) => /example\.com$/i.test(email.trim());
  const isPlaceholderPhone = (phone: string) => /^(123[-\s]?456[-\s]?7890|000[-\s]?000[-\s]?0000)$/i.test(phone.trim());

  useEffect(() => {
    fetchCandidates();
    fetchRecruitmentRequests();
  }, []);

  const fetchRecruitmentRequests = async () => {
    try {
      setLoadingPosts(true);

      // 1. Fetch posts from Firestore
      const recruitsRef = collection(db, 'recruits');
      const q = fsQuery(recruitsRef, orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);

      const recruits = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as any[];

      // 2. Fetch all applications from Supabase to count them
      const { data: apps, error: appsError } = await supabase
        .from('job_applications')
        .select('post_id');

      if (appsError) {
        console.error('Error fetching application counts:', appsError);
      }

      // 3. Map counts
      const counts: Record<string, number> = {};
      apps?.forEach(app => {
        counts[app.post_id] = (counts[app.post_id] || 0) + 1;
      });

      // 4. Combine
      const postsData: RecruitmentRequest[] = recruits.map(post => ({
        ...post,
        applicantCount: counts[post.id] || 0
      }));

      setRecruitmentRequests(postsData);
    } catch (error) {
      console.error('Error fetching recruitment requests:', error);
      toast.error('Failed to fetch recruitment requests');
    } finally {
      setLoadingPosts(false);
    }
  };



  const fetchCandidates = async (force = false) => {
    // If we are currently filtering for a specific post and this was called automatically, 
    // don't overwrite the filtered view.
    if (!force && isFilteringRef.current) {
      console.log('[DEBUG] fetchCandidates called but we are in filtering mode. Aborting.');
      return;
    }

    try {
      setLoading(true);
      // When explicitly fetching all candidates, we reset the filtering state
      if (force) {
        setFilterPostId(null);
        setIsFilteringApplicants(false);
        isFilteringRef.current = false;
        setFilteredCandidates([]);
      }

      const q = fsQuery(collection(db, 'candidates'), orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      const candidatesData: Candidate[] = [];
      querySnapshot.forEach((doc) => {
        candidatesData.push({ id: doc.id, ...doc.data() } as Candidate);
      });

      // Race condition check: If we started filtering while this was fetching, stop.
      if (isFilteringRef.current && !force) {
        console.log('[DEBUG] fetchCandidates finished but we are in filtering mode. Aborting update.');
        return;
      }

      // Fallback: ensure sorted correctly
      candidatesData.sort((a, b) => {
        const toDt = (val: any): number => {
          if (!val) return 0;
          if (typeof val.toDate === 'function') return val.toDate().getTime();
          if (val.seconds !== undefined) return val.seconds * 1000;
          return new Date(val).getTime();
        };
        return toDt(b.createdAt) - toDt(a.createdAt);
      });

      setCandidates(candidatesData);
    } catch (error) {
      console.error('Error fetching candidates:', error);
      toast.error('Failed to fetch candidates');
    } finally {
      setLoading(false);
    }
  };

  const fetchApplicantsForPost = async (postId: string) => {
    if (!postId) {
      console.error('[DEBUG] fetchApplicantsForPost called with null/empty postId');
      return;
    }

    // Update ref immediately to block other in-flight fetches
    isFilteringRef.current = true;
    setIsFilteringApplicants(true);
    setLoading(true);
    setFilteredCandidates([]); // Clear previous list immediately

    try {
      console.log(`[DEBUG] Fetching applicants for post ID: ${postId}`);

      // 1. Fetch applications from Supabase
      const { data: apps, error: appsError } = await supabase
        .from('job_applications')
        .select('user_id')
        .eq('post_id', postId);

      if (appsError) {
        console.error('[DEBUG] Supabase apps fetch error:', appsError);
        // Special handling for UUID errors after Firestore migration
        if (appsError.code === '22P02' || appsError.message?.includes('invalid input syntax for type uuid')) {
          toast.error('DATABASE ERROR: post_id column mismatch. Please run the SQL suggested in chat to update your Supabase schema!', { duration: 10000 });
          throw new Error('Supabase schema mismatch (UUID vs TEXT)');
        }
        throw appsError;
      }

      if (!apps || apps.length === 0) {
        console.log('[DEBUG] No applicants found for this post.');
        setFilteredCandidates([]);
        return;
      }

      // 2. Fetch user details from Firestore for these applicants
      const userIds = apps.map(a => (a as any).user_id).filter(uid => !!uid);
      console.log(`[DEBUG] Found ${userIds.length} user IDs:`, userIds);

      const fetchedApplicants: Candidate[] = [];
      for (const uid of userIds) {
        try {
          const userDoc = await getDoc(doc(db, 'users', uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            fetchedApplicants.push({
              id: uid,
              name: `${data.firstName || ''} ${data.lastName || ''}`.trim() || data.email || 'Unnamed Candidate',
              email: data.email || '',
              phone: data.mobile || '',
              role: data.department || 'Applicant',
              experience: data.yearsOfExperience || '',
              skills: data.skills ? (typeof data.skills === 'string' ? data.skills.split(',').map((s: string) => s.trim()) : data.skills) : [],
              resumeUrl: data.resumeUrl || '',
              extractedData: {
                summary: '',
                workExperience: [],
                education: [],
                skills: data.skills ? (typeof data.skills === 'string' ? data.skills.split(',').map((s: string) => s.trim()) : data.skills) : [],
                certifications: [],
                projects: []
              },
              createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
              updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date()
            } as any);
          } else {
            console.warn(`[DEBUG] User document for UID ${uid} not found in Firestore.`);
          }
        } catch (docErr) {
          console.error(`[DEBUG] Error fetching user doc for UID ${uid}:`, docErr);
        }
      }

      console.log(`[DEBUG] Final fetched applicants count: ${fetchedApplicants.length}`);

      // Final check: if user switched away during load, don't update
      if (isFilteringRef.current) {
        setFilteredCandidates(fetchedApplicants);
      }
    } catch (error: any) {
      console.error('[DEBUG] Global error in fetchApplicantsForPost:', error);
      const msg = error.message || 'Unknown error';
      if (!msg.includes('Supabase schema mismatch')) {
        toast.error(`Failed to fetch applicants: ${msg}`);
      }
      setFilteredCandidates([]);
    } finally {
      setLoading(false);
    }
  };

  const handleResumeUpload = async (file: File) => {
    try {
      setLoading(true);

      // Upload file to Supabase Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;

      console.log('Uploading file to Supabase...', fileName);

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('resumes')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        console.error('Supabase upload error:', uploadError);
        if (uploadError.message && uploadError.message.includes('row-level security policy')) {
          toast.error('Storage policy error. Please check Supabase storage policies.');
          throw new Error('Storage policy not configured. Please set up public access policies in Supabase dashboard.');
        }
        throw uploadError;
      }

      console.log('File uploaded successfully:', uploadData);

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('resumes')
        .getPublicUrl(fileName);

      console.log('Public URL generated:', publicUrl);

      // Attempt to parse resume data using AI
      let parsedData: any = {};
      let parseFailed = false;
      try {
        parsedData = await parseResumeWithAI(publicUrl);
      } catch (err) {
        console.warn('Resume parsing failed, will require manual entry');
        parseFailed = true;
      }

      // Replace placeholder values with empty strings so that modal will appear
      const sanitized = {
        name: !parsedData.name || isPlaceholderName(parsedData.name) ? '' : parsedData.name,
        email: !parsedData.email || isPlaceholderEmail(parsedData.email) ? '' : parsedData.email,
        phone: !parsedData.phone || isPlaceholderPhone(parsedData.phone) ? '' : parsedData.phone,
      };

      // Determine if manual input is required (core info missing after sanitisation)
      const missingCoreInfo = !sanitized.name || !sanitized.email || !sanitized.phone;

      // Build candidate object with graceful fallbacks (empty strings)
      const candidateData = {
        name: sanitized.name,
        email: sanitized.email,
        phone: sanitized.phone,
        role: parsedData.role || '',
        experience: parsedData.experience || '',
        skills: (missingCoreInfo ? [] : (parsedData.skills || [])),
        resumeUrl: publicUrl,
        extractedData: {
          summary: missingCoreInfo ? '' : (parsedData.summary || ''),
          workExperience: missingCoreInfo ? [] : (parsedData.workExperience || []),
          education: missingCoreInfo ? [] : (parsedData.education || []),
          skills: missingCoreInfo ? [] : (parsedData.skills || []),
          certifications: missingCoreInfo ? [] : (parsedData.certifications || []),
          projects: missingCoreInfo ? [] : (parsedData.projects || [])
        },
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any;

      // Save candidate to Firestore
      const docRef = await addDoc(collection(db, 'candidates'), candidateData);

      if (parseFailed || missingCoreInfo) {
        toast.error('Details could not be extracted. Please enter them manually.');
        setManualCandidate({ id: docRef.id, ...candidateData } as Candidate);
      } else {
        toast.success(`Resume uploaded successfully! Extracted data for ${candidateData.name}`);
      }

      fetchCandidates();
    } catch (error: any) {
      console.error('Error uploading resume:', error);

      if (error.message && error.message.includes('Storage policy')) {
        toast.error('Storage configuration issue. Please check Supabase settings.');
      } else {
        toast.error(error.message || 'Failed to upload resume');
      }
    } finally {
      setLoading(false);
    }
  };

  const parseResumeWithAI = async (publicUrl: string) => {
    try {
      console.log('Parsing resume locally via OpenAI:', publicUrl);

      // 1) Extract raw text from the PDF using pdfjs
      const loadingTask = pdfjsLib.getDocument({ url: publicUrl, useSystemFonts: true });
      const pdf = await loadingTask.promise;
      let rawText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        rawText += content.items.map((item: any) => item.str).join(' ') + '\n';
      }

      // 2) Ask OpenAI to transform the text into structured JSON
      const systemPrompt =
        "You are an assistant that extracts structured candidate data from resume text. " +
        "Return a valid JSON object with EXACTLY these keys: {\"name\":string,\"email\":string,\"phone\":string," +
        "\"role\":string,\"experience\":string,\"summary\":string,\"workExperience\":array," +
        "\"education\":array,\"skills\":array,\"certifications\":array,\"projects\":array}. " +
        "The \"role\" field should contain the candidate's current OR desired job title (e.g., 'Software Engineer', 'Project Manager'). " +
        "If a field cannot be confidently determined, leave it as an empty string or empty array; NEVER fabricate placeholders such as 'John Doe', 'example@example.com', or '1234567890'. " +
        "Respond with ONLY the JSON – no markdown fences or additional commentary.";

      const chat = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo-0125',
        temperature: 0.2,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: rawText.substring(0, 12000) }, // send first 12k chars
        ],
      });

      const reply = chat.choices[0].message?.content?.trim() || '{}';

      // Some models occasionally wrap the JSON in markdown fences or add leading text. Strip those out safely.
      let jsonStr = reply;

      // Remove ```json ... ``` or ``` ... ``` wrappers if present
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```[a-zA-Z]*\s*/m, '') // remove opening fence and optional language
          .replace(/```$/m, '');            // remove closing fence
      }

      // If the assistant added explanatory text before/after JSON, attempt to extract the JSON substring
      const firstBrace = jsonStr.indexOf('{');
      const lastBrace = jsonStr.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
      }

      let data: any = {};
      try {
        data = JSON.parse(jsonStr);
      } catch (parseErr) {
        console.error('Failed to parse JSON from OpenAI response:', jsonStr, parseErr);
        throw new Error('OpenAI returned unparsable JSON');
      }

      // Fallback: if role is empty, try a targeted prompt to extract role only
      if (!data.role || (typeof data.role === 'string' && data.role.trim() === '')) {
        try {
          const rolePrompt =
            "Identify the candidate's current or desired job title from the following resume text. " +
            "Respond with ONLY the role string – no other text.";

          const roleChat = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo-0125',
            temperature: 0,
            messages: [
              { role: 'system', content: rolePrompt },
              { role: 'user', content: rawText.substring(0, 12000) },
            ],
          });

          const roleReply = (roleChat.choices[0].message?.content || '').trim();
          // Basic sanitisation: remove markdown fences/quotes
          let roleStr = roleReply;
          if (roleStr.startsWith('```')) {
            roleStr = roleStr.replace(/^```[a-zA-Z]*\s*/m, '').replace(/```$/m, '');
          }
          // Strip surrounding quotes if any
          roleStr = roleStr.replace(/^"|"$/g, '').trim();

          data.role = roleStr;
        } catch (roleErr) {
          console.warn('Fallback role extraction failed', roleErr);
        }
      }

      return data;
    } catch (error: any) {
      console.error('Error in parseResumeWithAI:', error);
      throw new Error('Failed to parse resume using AI');
    }
  };

  const handleCandidateSelect = (candidate: Candidate) => {
    setSelectedCandidate(candidate);
  };

  const handleBackToList = () => {
    setSelectedCandidate(null);
  };

  const handleInviteSent = () => {
    // reload list and exit detail view
    fetchCandidates();
    setSelectedCandidate(null);
  };

  if (selectedCandidate) {
    return (
      <CandidateDetail
        candidate={selectedCandidate}
        onBack={handleBackToList}
        onInviteSent={handleInviteSent}
        onRemoveCandidate={() => {
          fetchCandidates();
          setSelectedCandidate(null);
        }}
      />
    );
  }

  return (
    <>
      <div className="space-y-6 flex-1 flex flex-col">
        {/* Sub navigation (hidden in history view) */}
        {activeView !== 'history' && (
          <div className="flex flex-col md:flex-row md:items-center md:space-x-4 mb-4 gap-3 w-full">
            <div className="flex space-x-4">
              <button
                onClick={() => {
                  setFilterPostId(null);
                  setActiveView('posts');
                  fetchRecruitmentRequests();
                }}
                className={`px-4 py-2 rounded-md text-sm font-bold border transition-all ${activeView === 'posts'
                  ? 'bg-orange-gradient text-white border-transparent shadow-md'
                  : 'bg-white text-orange-600 border-orange-200 hover:bg-orange-50'
                  }`}
              >
                Post
              </button>
              <button
                onClick={() => {
                  setActiveView('upload');
                  setSearchTerm('');
                }}
                className={`px-4 py-2 rounded-md text-sm font-bold border transition-all ${activeView === 'upload'
                  ? 'bg-orange-gradient text-white border-transparent shadow-md'
                  : 'bg-white text-orange-600 border-orange-200 hover:bg-orange-50'
                  }`}
              >
                Upload
              </button>
              <button
                onClick={() => {
                  setActiveView('candidates');
                  setFilterPostId(null);
                  setIsFilteringApplicants(false);
                  fetchCandidates(true);
                }}
                className={`px-4 py-2 rounded-md text-sm font-bold border transition-all ${activeView === 'candidates'
                  ? 'bg-orange-gradient text-white border-transparent shadow-md'
                  : 'bg-white text-orange-600 border-orange-200 hover:bg-orange-50'
                  }`}
              >
                Candidates
              </button>
            </div>

            <div className="flex-1 flex justify-end items-center space-x-4">
              <button
                onClick={() => setIsRecruitmentModalOpen(true)}
                className="px-4 py-2 bg-orange-gradient text-white rounded-md text-sm font-bold hover:opacity-90 transition-all shadow-md shadow-orange-500/20"
              >
                Add Recruitment
              </button>
            </div>
          </div>
        )}

        {activeView === 'upload' && (
          <div className="flex-1 flex flex-col items-center pt-8">
            <div className="max-w-2xl w-full">
              <ResumeUpload onUpload={handleResumeUpload} loading={loading} />
            </div>
          </div>
        )}

        {activeView === 'posts' && (
          <div className="flex-1">
            {loadingPosts ? (
              <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
              </div>
            ) : recruitmentRequests.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-lg border border-dashed border-gray-300">
                <p className="text-gray-500">No recruitment requests found.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {recruitmentRequests.map((post) => (
                  <RecruitmentCard
                    key={post.id}
                    recruitment={post}
                    applicantCount={(post as any).applicantCount}
                    onViewDetails={(p) => setSelectedPost(p)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {activeView === 'candidates' && (
          <CandidateList
            candidates={isFilteringApplicants ? filteredCandidates : candidates.filter(c => (c as any).status === 'pending' || !(c as any).status)}
            onSelectCandidate={handleCandidateSelect}
            loading={loading}
            searchTerm={searchTerm}
            onSearchTermChange={setSearchTerm}
            onRefresh={isFilteringApplicants ? () => filterPostId && fetchApplicantsForPost(filterPostId) : fetchCandidates}
            emptyMessage={isFilteringApplicants ? "No applicants found for this post." : undefined}
          />
        )}

        {activeView === 'candidates' && (
          <div className="flex justify-end mt-4">
            <button
              onClick={() => setActiveView('history')}
              className="px-4 py-2 text-sm font-medium rounded-md text-primary-600 border border-primary-600 hover:bg-primary-50"
            >
              Resume History
            </button>
          </div>
        )}

        {activeView === 'history' && (
          <>
            <div className="flex items-center gap-2 mb-4 cursor-pointer text-primary-600 hover:text-primary-800" onClick={() => setActiveView('candidates')}>
              <ArrowLeft className="h-5 w-5" />
              <span>Back</span>
            </div>
            <CandidateList
              candidates={candidates}
              onSelectCandidate={handleCandidateSelect}
              loading={loading}
              searchTerm={searchTerm}
              onSearchTermChange={setSearchTerm}
              emptyMessage="No resumes uploaded yet."
              onRefresh={fetchCandidates}
            />
          </>
        )}
      </div>
      <RecruitmentFormModal
        isOpen={isRecruitmentModalOpen}
        onClose={() => {
          setIsRecruitmentModalOpen(false);
          fetchRecruitmentRequests();
        }}
      />
      {selectedPost && (
        <RecruitmentDetailsModal
          recruitment={selectedPost}
          onClose={() => setSelectedPost(null)}
          onViewCandidates={(postId) => {
            setSelectedPost(null);
            setFilterPostId(postId);
            setActiveView('candidates');
            fetchApplicantsForPost(postId);
          }}
          onDelete={() => {
            fetchRecruitmentRequests();
            setSelectedPost(null);
          }}
        />
      )}
      {manualCandidate && (
        <ManualDetailsModal
          candidate={manualCandidate!}
          onCancel={async () => {
            // If the candidate was not saved, remove record and file
            try {
              // Delete Firestore doc
              await deleteDoc(doc(db, 'candidates', manualCandidate.id));
              // Delete file from Supabase storage
              if (manualCandidate.resumeUrl) {
                const match = manualCandidate.resumeUrl.match(/resumes\/([^/?#]+)/);
                const fileName = match ? match[1] : null;
                if (fileName) {
                  await supabase.storage.from('resumes').remove([fileName]);
                }
              }
            } catch (err) {
              console.error('Failed to clean up candidate on cancel', err);
            } finally {
              fetchCandidates();
              setManualCandidate(null);
            }
          }}
          onSaved={() => {
            fetchCandidates();
            setManualCandidate(null);
          }}
        />
      )}
    </>
  );
}