'use client';

import { useState } from 'react';
import { addDoc, collection, deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { supabase } from '@/lib/supabase';
import type { Candidate } from '@/types';
import ResumeUpload from '@/components/resume/ResumeUpload';
import ManualDetailsModal from '@/components/resume/ManualDetailsModal';
import toast from 'react-hot-toast';
import openai from '@/lib/openai';
// PDF.js – load the worker dynamically so Vite can bundle it
// @ts-ignore
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker?url';
// @ts-ignore – pdfjsWorker will be resolved by Vite
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export default function UploadResumesTab() {
    const [loading, setLoading] = useState(false);
    const [manualCandidate, setManualCandidate] = useState<Candidate | null>(null);

    // Helpers to detect placeholder values coming from failed AI extraction
    const isPlaceholderName = (name: string) => /^(john|jane)\s+doe$/i.test(name.trim());
    const isPlaceholderEmail = (email: string) => /example\.com$/i.test(email.trim());
    const isPlaceholderPhone = (phone: string) => /^(123[-\s]?456[-\s]?7890|000[-\s]?000[-\s]?0000)$/i.test(phone.trim());

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
                    roleStr = roleStr.replace(/^\"|\"$/g, '').trim();

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

    return (
        <div className="space-y-6 flex-1 flex flex-col h-full">
            {/* Header Section */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <div>
                    <h2 className="text-xl font-bold text-gray-900">Upload Resumes</h2>
                    <p className="text-sm text-gray-500 mt-1">Upload candidate resumes to parse details and add them to the pipeline.</p>
                </div>
            </div>

            <div className="h-full flex items-center justify-center">
                <div className="max-w-2xl w-full">
                    <ResumeUpload onUpload={handleResumeUpload} loading={loading} />
                </div>
            </div>

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
                            setManualCandidate(null);
                        }
                    }}
                    onSaved={() => {
                        setManualCandidate(null);
                        toast.success('Resume uploaded successfully!');
                    }}
                />
            )}
        </div>
    );
}
