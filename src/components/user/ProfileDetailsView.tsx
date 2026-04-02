import { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { supabase } from '@/lib/supabase';
import { useDropzone } from 'react-dropzone';
import toast from 'react-hot-toast';
import { CheckCircle2, FileUp, Loader2, Edit2, X, Plus, Trash2 } from 'lucide-react';

interface ProfileDetailsViewProps {
    formData: any;
    setFormData: React.Dispatch<React.SetStateAction<any>>;
}

export default function ProfileDetailsView({ formData, setFormData }: ProfileDetailsViewProps) {
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadingCert, setUploadingCert] = useState(false);
    
    const [activeModal, setActiveModal] = useState<'education'|'project'|'certificate'|'experience'|'course'|'skill'|null>(null);
    const [editIndex, setEditIndex] = useState<number | null>(null);

    const [eduForm, setEduForm] = useState({ collegeName: '', course: '', specialization: '', graduatedYear: '', grade: '' });
    const [projForm, setProjForm] = useState({ title: '', role: '', duration: '', description: '', link: '' });
    const [certForm, setCertForm] = useState({ name: '', organization: '', issueDate: '', url: '' });
    const [expForm, setExpForm] = useState({ company: '', role: '', description: '', duration: '' });
    
    const [skillInput, setSkillInput] = useState('');
    const [tempSkills, setTempSkills] = useState<string[]>([]);
    const [courseInput, setCourseInput] = useState('');
    const [tempCourses, setTempCourses] = useState<string[]>([]);

    const openModal = (type: 'education'|'project'|'certificate'|'experience'|'course'|'skill', index: number | null = null) => {
        setEditIndex(index);
        setActiveModal(type);
        if (type === 'education') {
            if (index !== null) setEduForm(formData.educationItems[index] || { collegeName: '', course: '', specialization: '', graduatedYear: '', grade: '' });
            else setEduForm({ collegeName: '', course: '', specialization: '', graduatedYear: '', grade: '' });
        } else if (type === 'project') {
            if (index !== null) setProjForm(formData.projectItems[index] || { title: '', role: '', duration: '', description: '', link: '' });
            else setProjForm({ title: '', role: '', duration: '', description: '', link: '' });
        } else if (type === 'certificate') {
            if (index !== null) setCertForm(formData.certificateItems[index] || { name: '', organization: '', issueDate: '', url: '' });
            else setCertForm({ name: '', organization: '', issueDate: '', url: '' });
        } else if (type === 'experience') {
            if (index !== null) setExpForm(formData.experienceItems[index] || { company: '', role: '', description: '', duration: '' });
            else setExpForm({ company: '', role: '', description: '', duration: '' });
        } else if (type === 'course') {
            setTempCourses([...(formData.courseItems || [])]);
            setCourseInput('');
        } else if (type === 'skill') {
            setTempSkills([...(formData.skillItems || [])]);
            setSkillInput('');
        }
    };

    const closeModal = () => {
        setActiveModal(null);
        setEditIndex(null);
        setTempSkills([]);
        setSkillInput('');
        setTempCourses([]);
        setCourseInput('');
    };

    const saveArrayConfig = async (arrayField: string, items: any[]) => {
        const user = auth.currentUser;
        if (!user) return;
        setSaving(true);
        try {
            await updateDoc(doc(db, 'users', user.uid), {
                [arrayField]: items,
                updatedAt: new Date()
            });
            setFormData((prev: any) => ({ ...prev, [arrayField]: items }));
            toast.success('Updated successfully!');
            closeModal();
            setSkillInput('');
        } catch (error) {
            console.error(error);
            toast.error('Failed to update');
        } finally {
            setSaving(false);
        }
    };

    const handleSaveEdu = () => {
        if (!eduForm.collegeName.trim()) return toast.error('College Name is required');
        const newArray = [...(formData.educationItems || [])];
        if (editIndex !== null) newArray[editIndex] = eduForm;
        else newArray.push(eduForm);
        saveArrayConfig('educationItems', newArray);
    };

    const handleSaveProj = () => {
        if (!projForm.title.trim()) return toast.error('Project Title is required');
        const newArray = [...(formData.projectItems || [])];
        if (editIndex !== null) newArray[editIndex] = projForm;
        else newArray.push(projForm);
        saveArrayConfig('projectItems', newArray);
    };

    const handleSaveCert = () => {
        if (!certForm.name.trim()) return toast.error('Certificate Name is required');
        const newArray = [...(formData.certificateItems || [])];
        if (editIndex !== null) newArray[editIndex] = certForm;
        else newArray.push(certForm);
        saveArrayConfig('certificateItems', newArray);
    };

    const handleSaveExp = () => {
        if (!expForm.company.trim() || !expForm.role.trim()) return toast.error('Company and Role are required');
        const newArray = [...(formData.experienceItems || [])];
        if (editIndex !== null) newArray[editIndex] = expForm;
        else newArray.push(expForm);
        saveArrayConfig('experienceItems', newArray);
    };

    const handleSaveCourse = () => {
        saveArrayConfig('courseItems', tempCourses);
    };

    const handleCertFileUpload = async (e: any) => {
        const file = e.target.files?.[0];
        const user = auth.currentUser;
        if (!file || !user) return;
        
        if (file.size > 2 * 1024 * 1024) return toast.error('File size exceeds 2MB limit');

        setUploadingCert(true);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Date.now()}.${fileExt}`;
            const filePath = `certificates/${user.uid}/${fileName}`;

            const { error: uploadError } = await supabase.storage.from('resumes').upload(filePath, file);
            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage.from('resumes').getPublicUrl(filePath);

            setCertForm({ ...certForm, url: publicUrl });
            toast.success('Certificate file uploaded!');
        } catch (error: any) {
            toast.error(`Upload failed`);
        } finally {
            setUploadingCert(false);
            e.target.value = '';
        }
    };

    const handleAddTempSkill = () => {
        if (!skillInput.trim()) return;
        if (!tempSkills.includes(skillInput.trim())) {
            setTempSkills([...tempSkills, skillInput.trim()]);
        }
        setSkillInput('');
    };

    const handleRemoveTempSkill = (index: number) => {
        const newArray = [...tempSkills];
        newArray.splice(index, 1);
        setTempSkills(newArray);
    };

    const handleSaveSkills = () => {
        saveArrayConfig('skillItems', tempSkills);
    };

    const handleRemoveArrayItem = (arrayField: string, index: number) => {
        const newArray = [...(formData[arrayField as keyof typeof formData] || [])];
        newArray.splice(index, 1);
        saveArrayConfig(arrayField, newArray);
    };

    const onDropResume = async (acceptedFiles: File[]) => {
        const file = acceptedFiles[0];
        const user = auth.currentUser;
        if (!file || !user) return;

        if (file.size > 5 * 1024 * 1024) return toast.error('File size exceeds 5MB limit');

        setUploading(true);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Date.now()}.${fileExt}`;
            const filePath = `resumes/${user.uid}/${fileName}`;

            const { error: uploadError } = await supabase.storage.from('resumes').upload(filePath, file);
            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage.from('resumes').getPublicUrl(filePath);

            setFormData((prev: any) => ({ ...prev, resumeUrl: publicUrl }));
            await updateDoc(doc(db, 'users', user.uid), { resumeUrl: publicUrl, updatedAt: new Date() });
            toast.success('Resume uploaded successfully!');
        } catch (error: any) {
            toast.error(`Upload failed`);
        } finally {
            setUploading(false);
        }
    };

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop: onDropResume,
        accept: { 'application/pdf': ['.pdf'], 'application/msword': ['.doc'], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] },
        maxFiles: 1, multiple: false
    });

    return (
        <div className="flex flex-col gap-6">

            {/* Education Card */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-gray-900">Education</h3>
                    <button onClick={() => openModal('education')} className="text-orange-600 font-bold text-sm hover:text-orange-700 flex items-center gap-1">
                        <Plus className="w-4 h-4" /> Add
                    </button>
                </div>
                {(!formData.educationItems || formData.educationItems.length === 0) ? (
                    <p className="text-gray-400 italic text-sm">No education history added.</p>
                ) : (
                    <div className="space-y-4">
                        {formData.educationItems.map((edu: any, idx: number) => (
                            <div key={idx} className="group flex justify-between items-start border-b border-gray-100 last:border-0 pb-4 last:pb-0">
                                <div>
                                    <h4 className="font-bold text-gray-900">{edu.collegeName}</h4>
                                    <p className="text-sm font-semibold text-gray-700 mt-0.5">{edu.course} {edu.specialization && `- ${edu.specialization}`}</p>
                                    <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                                        {edu.graduatedYear && <span>Class of {edu.graduatedYear}</span>}
                                        {edu.grade && <span>Grade: {edu.grade}</span>}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => openModal('education', idx)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-black transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => handleRemoveArrayItem('educationItems', idx)} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Skills Card */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-gray-900 whitespace-nowrap">Skills</h3>
                    <button onClick={() => openModal('skill')} className="text-orange-600 font-bold text-sm hover:text-orange-700 flex items-center gap-1">
                        <Plus className="w-4 h-4" /> Add
                    </button>
                </div>
                {(!formData.skillItems || formData.skillItems.length === 0) ? (
                    <p className="text-gray-400 italic text-sm">No skills added yet.</p>
                ) : (
                    <div className="flex flex-wrap gap-2 mt-2">
                        {formData.skillItems.map((skill: string, idx: number) => {
                            const colors = [
                                'bg-blue-50 text-blue-700 border-blue-100',
                                'bg-emerald-50 text-emerald-700 border-emerald-100',
                                'bg-purple-50 text-purple-700 border-purple-100',
                                'bg-rose-50 text-rose-700 border-rose-100',
                                'bg-amber-50 text-amber-700 border-amber-100',
                                'bg-indigo-50 text-indigo-700 border-indigo-100',
                                'bg-cyan-50 text-cyan-700 border-cyan-100'
                            ];
                            const colorClass = colors[idx % colors.length];
                            return (
                                <div key={idx} className={`group flex items-center gap-1.5 px-2 py-1 ${colorClass} border rounded-lg text-[11px] font-bold transition-all hover:scale-105`}>
                                    <span>{skill}</span>
                                    <button onClick={() => handleRemoveArrayItem('skillItems', idx)} className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-500"><X className="w-3 h-3" /></button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Courses Card */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-gray-900 whitespace-nowrap">Courses Completed</h3>
                    <button onClick={() => openModal('course')} className="text-orange-600 font-bold text-sm hover:text-orange-700 flex items-center gap-1">
                        <Plus className="w-4 h-4" /> Add
                    </button>
                </div>
                {(!formData.courseItems || formData.courseItems.length === 0) ? (
                    <p className="text-gray-400 italic text-sm">No courses added yet.</p>
                ) : (
                    <div className="flex flex-wrap gap-2 mt-2">
                        {formData.courseItems.map((course: string, idx: number) => (
                            <div key={idx} className="group flex items-center gap-1.5 px-2 py-1 bg-gray-50 text-gray-700 border border-gray-100 rounded-lg text-[11px] font-bold transition-all hover:scale-105">
                                <span>{course}</span>
                                <button onClick={() => handleRemoveArrayItem('courseItems', idx)} className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-500"><X className="w-3 h-3" /></button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Projects Card */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-gray-900">Projects</h3>
                    <button onClick={() => openModal('project')} className="text-orange-600 font-bold text-sm hover:text-orange-700 flex items-center gap-1">
                        <Plus className="w-4 h-4" /> Add
                    </button>
                </div>
                {(!formData.projectItems || formData.projectItems.length === 0) ? (
                    <p className="text-gray-400 italic text-sm">No projects added yet.</p>
                ) : (
                    <div className="space-y-6">
                        {formData.projectItems.map((proj: any, idx: number) => (
                            <div key={idx} className="group relative border border-gray-100 bg-gray-50/50 rounded-xl p-4">
                                <div className="absolute right-4 top-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => openModal('project', idx)} className="p-1.5 bg-white hover:bg-gray-100 border border-gray-200 rounded-lg text-black transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => handleRemoveArrayItem('projectItems', idx)} className="p-1.5 bg-white hover:bg-red-50 border border-gray-200 rounded-lg text-gray-500 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                                </div>
                                <h4 className="font-bold text-gray-900 pr-20">{proj.title}</h4>
                                {(proj.role || proj.duration) && (
                                    <p className="text-[10px] font-bold text-gray-500 mt-1 uppercase tracking-tight">{proj.role} {proj.role && proj.duration && '•'} {proj.duration}</p>
                                )}
                                {proj.description && <p className="text-xs text-gray-600 mt-2 whitespace-pre-wrap leading-relaxed">{proj.description}</p>}
                                {proj.link && <a href={proj.link} target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold text-gray-900 underline hover:text-black mt-3 inline-block">View Project Source</a>}
                            </div>
                        ))}
                    </div>
                )}
            </div>
            {/* Certificates Card */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-gray-900">Certificates</h3>
                    <button onClick={() => openModal('certificate')} className="text-orange-600 font-bold text-sm hover:text-orange-700 flex items-center gap-1">
                        <Plus className="w-4 h-4" /> Add
                    </button>
                </div>
                {(!formData.certificateItems || formData.certificateItems.length === 0) ? (
                    <p className="text-gray-400 italic text-sm">No certifications added yet.</p>
                ) : (
                    <div className="space-y-4">
                        {formData.certificateItems.map((cert: any, idx: number) => (
                            <div key={idx} className="group relative border border-gray-100 bg-gray-50/50 rounded-xl p-4">
                                <div className="absolute right-4 top-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => openModal('certificate', idx)} className="p-1.5 bg-white hover:bg-gray-100 border border-gray-200 rounded-lg text-black transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => handleRemoveArrayItem('certificateItems', idx)} className="p-1.5 bg-white hover:bg-red-50 border border-gray-200 rounded-lg text-gray-500 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                                </div>
                                <h4 className="font-bold text-gray-900 pr-20">{cert.name}</h4>
                                <p className="text-[10px] font-bold text-gray-500 mt-1 uppercase tracking-tight">{cert.organization}</p>
                                {cert.issueDate && <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-tight">{cert.issueDate}</p>}
                                {cert.url && <a href={cert.url} target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold text-gray-900 underline hover:text-black mt-3 inline-block">View Credential</a>}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Experience Card */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-gray-900">Experience</h3>
                    <button onClick={() => openModal('experience')} className="text-orange-600 font-bold text-sm hover:text-orange-700 flex items-center gap-1">
                        <Plus className="w-4 h-4" /> Add
                    </button>
                </div>
                {(!formData.experienceItems || formData.experienceItems.length === 0) ? (
                    <p className="text-gray-400 italic text-sm">No work experience added yet.</p>
                ) : (
                    <div className="space-y-4">
                        {formData.experienceItems.map((exp: any, idx: number) => (
                            <div key={idx} className="group relative border border-gray-100 bg-gray-50/50 rounded-xl p-4">
                                <div className="absolute right-4 top-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => openModal('experience', idx)} className="p-1.5 bg-white hover:bg-gray-100 border border-gray-200 rounded-lg text-black transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => handleRemoveArrayItem('experienceItems', idx)} className="p-1.5 bg-white hover:bg-red-50 border border-gray-200 rounded-lg text-gray-500 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                                </div>
                                <h4 className="font-bold text-gray-900 pr-20">{exp.company}</h4>
                                <p className="text-[10px] font-bold text-gray-700 mt-1 uppercase tracking-tight">{exp.role} {exp.duration && `• ${exp.duration}`}</p>
                                {exp.description && <p className="text-xs text-gray-600 mt-2 whitespace-pre-wrap leading-relaxed">{exp.description}</p>}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Resumes Upload Component */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Resume Upload</h3>
                {formData.resumeUrl && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200 mb-4 gap-4">
                        <div className="flex items-center gap-3">
                            <div>
                                <p className="text-sm font-bold text-gray-900">Current Resume</p>
                                <p className="text-xs text-emerald-600 flex items-center gap-1 mt-0.5 font-semibold">
                                    <CheckCircle2 className="w-3.5 h-3.5" /> Uploaded successfully
                                </p>
                            </div>
                        </div>
                        <a href={formData.resumeUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-center text-orange-600 hover:text-white border border-orange-200 hover:bg-orange-500 px-6 py-2 rounded-lg transition-colors">
                            View PDF
                        </a>
                    </div>
                )}

                <div
                    {...getRootProps()}
                    className={`cursor-pointer transition-all duration-300 ${isDragActive ? 'bg-orange-50 border-orange-400' : 'bg-white border-gray-200 hover:border-orange-300 hover:bg-orange-50/30'} 
                    border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3`}
                >
                    <input {...getInputProps()} />
                    <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center border border-gray-200">
                        {uploading ? <Loader2 className="w-5 h-5 text-orange-500 animate-spin" /> : <FileUp className="w-5 h-5 text-gray-400" />}
                    </div>
                    <div className="text-center">
                        <p className="text-sm font-bold text-gray-900">{isDragActive ? 'Drop resume here' : 'Drop new resume or browse'}</p>
                        <p className="text-xs text-gray-500 mt-1">PDF, DOCX up to 5MB</p>
                    </div>
                </div>
            </div>
            
            {/* Modal Overlays */}
            {activeModal === 'experience' && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeModal} />
                    <div className="bg-white rounded-2xl w-full max-w-lg p-6 relative z-10 shadow-2xl max-h-[90vh] flex flex-col">
                        <div className="flex justify-between items-center mb-6 flex-shrink-0">
                            <h2 className="text-xl font-bold text-gray-900">{editIndex !== null ? "Edit Experience" : "Add Experience"}</h2>
                            <button onClick={closeModal} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors"><X className="w-5 h-5 text-gray-500"/></button>
                        </div>
                        <div className="overflow-y-auto pr-2 space-y-4 pb-2">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[11px] uppercase font-bold text-gray-500 mb-1">Company</label>
                                    <input type="text" value={expForm.company} onChange={(e)=>setExpForm({...expForm, company: e.target.value})} placeholder="e.g. Google" className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20" />
                                </div>
                                <div>
                                    <label className="block text-[11px] uppercase font-bold text-gray-500 mb-1">Role / Position</label>
                                    <input type="text" value={expForm.role} onChange={(e)=>setExpForm({...expForm, role: e.target.value})} placeholder="e.g. Software Engineer" className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-[11px] uppercase font-bold text-gray-500 mb-1">Duration</label>
                                <input type="text" value={expForm.duration} onChange={(e)=>setExpForm({...expForm, duration: e.target.value})} placeholder="e.g. Jan 2023 - Present" className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20" />
                            </div>
                            <div>
                                <label className="block text-[11px] uppercase font-bold text-gray-500 mb-1">Description</label>
                                <textarea value={expForm.description} onChange={(e)=>setExpForm({...expForm, description: e.target.value})} placeholder="Describe your roles and achievements..." className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 h-32 resize-none" />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100 flex-shrink-0">
                            <button onClick={closeModal} className="px-5 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 rounded-xl transition-colors">Cancel</button>
                            <button disabled={saving} onClick={handleSaveExp} className="px-6 py-2.5 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50 min-w-[120px]">
                                {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Save Details'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {activeModal === 'course' && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeModal} />
                    <div className="bg-white rounded-2xl w-full max-w-lg p-6 relative z-10 shadow-2xl max-h-[90vh] flex flex-col">
                        <div className="flex justify-between items-center mb-6 flex-shrink-0">
                            <h2 className="text-xl font-bold text-gray-900">Courses Completed</h2>
                            <button onClick={closeModal} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors"><X className="w-5 h-5 text-gray-500"/></button>
                        </div>
                        <div className="mb-4">
                            <div className="flex gap-2">
                                <input type="text" value={courseInput} onChange={(e) => setCourseInput(e.target.value)} onKeyDown={(e) => { if(e.key === 'Enter' && courseInput.trim()) { setTempCourses([...tempCourses, courseInput.trim()]); setCourseInput(''); } }} placeholder="Add a course (e.g. AWS Certified Solutions Architect)" className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-orange-500" />
                                <button onClick={() => { if(courseInput.trim()) { setTempCourses([...tempCourses, courseInput.trim()]); setCourseInput(''); } }} className="px-4 py-2 bg-orange-600 text-white rounded-xl text-sm font-bold hover:bg-orange-700 transition-colors">Add</button>
                            </div>
                        </div>
                        <div className="overflow-y-auto pr-2 flex flex-wrap gap-2 pb-2">
                            {tempCourses.map((course, idx) => (
                                <div key={idx} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 border border-gray-200 rounded-lg text-xs font-bold text-gray-700">
                                    <span>{course}</span>
                                    <button onClick={() => setTempCourses(tempCourses.filter((_, i) => i !== idx))}><X className="w-3.5 h-3.5 text-gray-400 hover:text-red-500"/></button>
                                </div>
                            ))}
                        </div>
                        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100 flex-shrink-0">
                            <button onClick={closeModal} className="px-5 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 rounded-xl transition-colors">Cancel</button>
                            <button disabled={saving} onClick={handleSaveCourse} className="px-6 py-2.5 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50 min-w-[120px]">
                                {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Save Courses'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {activeModal === 'education' && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeModal} />
                    <div className="bg-white rounded-2xl w-full max-w-lg p-6 relative z-10 shadow-2xl max-h-[90vh] flex flex-col">
                        <div className="flex justify-between items-center mb-6 flex-shrink-0">
                            <h2 className="text-xl font-bold text-gray-900">{editIndex !== null ? "Edit Education" : "Add Education"}</h2>
                            <button onClick={closeModal} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors"><X className="w-5 h-5 text-gray-500"/></button>
                        </div>
                        <div className="overflow-y-auto pr-2 space-y-4 pb-2">
                            <div>
                                <label className="block text-[11px] uppercase font-bold text-gray-500 mb-1">College / University Name</label>
                                <input type="text" value={eduForm.collegeName} onChange={(e)=>setEduForm({...eduForm, collegeName: e.target.value})} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20" />
                            </div>
                            <div>
                                <label className="block text-[11px] uppercase font-bold text-gray-500 mb-1">Course / Degree</label>
                                <input type="text" value={eduForm.course} onChange={(e)=>setEduForm({...eduForm, course: e.target.value})} placeholder="e.g. B.Tech, BSc" className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20" />
                            </div>
                            <div>
                                <label className="block text-[11px] uppercase font-bold text-gray-500 mb-1">Specialization</label>
                                <input type="text" value={eduForm.specialization} onChange={(e)=>setEduForm({...eduForm, specialization: e.target.value})} placeholder="e.g. Computer Science" className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[11px] uppercase font-bold text-gray-500 mb-1">Graduated Year</label>
                                    <input type="text" value={eduForm.graduatedYear} onChange={(e)=>setEduForm({...eduForm, graduatedYear: e.target.value})} placeholder="e.g. 2024" className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20" />
                                </div>
                                <div>
                                    <label className="block text-[11px] uppercase font-bold text-gray-500 mb-1">Grade (CGPA / %)</label>
                                    <input type="text" value={eduForm.grade} onChange={(e)=>setEduForm({...eduForm, grade: e.target.value})} placeholder="e.g. 8.5 CGPA" className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20" />
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100 flex-shrink-0">
                            <button onClick={closeModal} className="px-5 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 rounded-xl transition-colors">Cancel</button>
                            <button disabled={saving} onClick={handleSaveEdu} className="px-6 py-2.5 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50 min-w-[120px]">
                                {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Save Details'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {activeModal === 'project' && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeModal} />
                    <div className="bg-white rounded-2xl w-full max-w-lg p-6 relative z-10 shadow-2xl max-h-[90vh] flex flex-col">
                        <div className="flex justify-between items-center mb-6 flex-shrink-0">
                            <h2 className="text-xl font-bold text-gray-900">{editIndex !== null ? "Edit Project" : "Add Project"}</h2>
                            <button onClick={closeModal} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors"><X className="w-5 h-5 text-gray-500"/></button>
                        </div>
                        <div className="overflow-y-auto pr-2 space-y-4 pb-2">
                            <div>
                                <label className="block text-[11px] uppercase font-bold text-gray-500 mb-1">Project Title</label>
                                <input type="text" value={projForm.title} onChange={(e)=>setProjForm({...projForm, title: e.target.value})} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[11px] uppercase font-bold text-gray-500 mb-1">Your Role</label>
                                    <input type="text" value={projForm.role} onChange={(e)=>setProjForm({...projForm, role: e.target.value})} placeholder="e.g. Frontend Developer" className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20" />
                                </div>
                                <div>
                                    <label className="block text-[11px] uppercase font-bold text-gray-500 mb-1">Duration</label>
                                    <input type="text" value={projForm.duration} onChange={(e)=>setProjForm({...projForm, duration: e.target.value})} placeholder="e.g. Jan 2023 - Mar 2023" className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-[11px] uppercase font-bold text-gray-500 mb-1">Description</label>
                                <textarea value={projForm.description} onChange={(e)=>setProjForm({...projForm, description: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 h-28 resize-none" />
                            </div>
                            <div>
                                <label className="block text-[11px] uppercase font-bold text-gray-500 mb-1">Project URL (Optional)</label>
                                <input type="url" value={projForm.link} onChange={(e)=>setProjForm({...projForm, link: e.target.value})} placeholder="https://" className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20" />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100 flex-shrink-0">
                            <button onClick={closeModal} className="px-5 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 rounded-xl transition-colors">Cancel</button>
                            <button disabled={saving} onClick={handleSaveProj} className="px-6 py-2.5 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50 min-w-[120px]">
                                {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Save Details'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {activeModal === 'certificate' && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeModal} />
                    <div className="bg-white rounded-2xl w-full max-w-lg p-6 relative z-10 shadow-2xl max-h-[90vh] flex flex-col">
                        <div className="flex justify-between items-center mb-6 flex-shrink-0">
                            <h2 className="text-xl font-bold text-gray-900">{editIndex !== null ? "Edit Certificate" : "Add Certificate"}</h2>
                            <button onClick={closeModal} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors"><X className="w-5 h-5 text-gray-500"/></button>
                        </div>
                        <div className="overflow-y-auto pr-2 space-y-4 pb-2">
                            <div>
                                <label className="block text-[11px] uppercase font-bold text-gray-500 mb-1">Certificate Name</label>
                                <input type="text" value={certForm.name} onChange={(e)=>setCertForm({...certForm, name: e.target.value})} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20" />
                            </div>
                            <div>
                                <label className="block text-[11px] uppercase font-bold text-gray-500 mb-1">Issuing Organization</label>
                                <input type="text" value={certForm.organization} onChange={(e)=>setCertForm({...certForm, organization: e.target.value})} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20" />
                            </div>
                            <div>
                                <label className="block text-[11px] uppercase font-bold text-gray-500 mb-1">Issue Date</label>
                                <input type="text" value={certForm.issueDate} onChange={(e)=>setCertForm({...certForm, issueDate: e.target.value})} placeholder="e.g. Aug 2023" className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20" />
                            </div>
                            <div>
                                <label className="block text-[11px] uppercase font-bold text-gray-500 mb-1">Upload Certificate (Image / PDF)</label>
                                {certForm.url ? (
                                    <div className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                                        <div className="flex items-center gap-2">
                                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                            <span className="text-xs font-bold text-emerald-800">File attached</span>
                                        </div>
                                        <button onClick={() => setCertForm({...certForm, url: ''})} className="text-xs font-bold text-red-600 hover:text-red-700">Remove</button>
                                    </div>
                                ) : (
                                    <label className="flex items-center justify-center w-full px-4 py-6 bg-gray-50 border border-gray-200 border-dashed rounded-xl cursor-pointer hover:bg-gray-100 hover:border-orange-300 transition-all">
                                        <input type="file" accept="image/*,application/pdf" className="hidden" onChange={handleCertFileUpload} />
                                        <div className="flex flex-col items-center gap-2 text-center mt-1">
                                            {uploadingCert ? <Loader2 className="w-5 h-5 text-orange-500 animate-spin" /> : <FileUp className="w-5 h-5 text-gray-400" />}
                                            <span className="text-xs font-bold text-gray-600">{uploadingCert ? 'Uploading...' : 'Click to upload certificate'}</span>
                                        </div>
                                    </label>
                                )}
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100 flex-shrink-0">
                            <button onClick={closeModal} className="px-5 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 rounded-xl transition-colors">Cancel</button>
                            <button disabled={saving || uploadingCert} onClick={handleSaveCert} className="px-6 py-2.5 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50 min-w-[120px]">
                                {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Save Details'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {activeModal === 'skill' && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeModal} />
                    <div className="bg-white rounded-2xl w-full max-w-lg p-6 relative z-10 shadow-2xl max-h-[90vh] flex flex-col">
                        <div className="flex justify-between items-center mb-6 flex-shrink-0">
                            <h2 className="text-xl font-bold text-gray-900">Manage Skills</h2>
                            <button onClick={closeModal} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors"><X className="w-5 h-5 text-gray-500"/></button>
                        </div>
                        <div className="overflow-y-auto pr-2 space-y-4 pb-2">
                            <div>
                                <label className="block text-[11px] uppercase font-bold text-gray-500 mb-1">Add New Skill</label>
                                <div className="flex items-center gap-2">
                                    <input 
                                        type="text" 
                                        value={skillInput} 
                                        onChange={(e) => setSkillInput(e.target.value)} 
                                        onKeyDown={(e) => e.key === 'Enter' && handleAddTempSkill()}
                                        placeholder="e.g. React, Python, UI Design" 
                                        className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                                    />
                                    <button onClick={handleAddTempSkill} disabled={!skillInput.trim()} className="px-5 py-2 bg-orange-50 text-orange-600 text-sm font-bold rounded-xl hover:bg-orange-100 transition-colors disabled:opacity-50">Add</button>
                                </div>
                            </div>
                            
                            <div className="pt-4 border-t border-gray-100">
                                <label className="block text-[11px] uppercase font-bold text-gray-500 mb-3">Current Skills ({tempSkills.length})</label>
                                {tempSkills.length === 0 ? (
                                    <p className="text-gray-400 italic text-sm">No skills added yet.</p>
                                ) : (
                                    <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto pb-2">
                                        {tempSkills.map((skill: string, idx: number) => (
                                            <div key={idx} className="group flex items-center gap-2 px-3 py-1.5 bg-amber-50 text-amber-800 border border-amber-200/50 rounded-lg text-sm font-semibold">
                                                <span>{skill}</span>
                                                <button onClick={() => handleRemoveTempSkill(idx)} className="text-red-400 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100 flex-shrink-0">
                            <button onClick={closeModal} className="px-5 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 rounded-xl transition-colors">Cancel</button>
                            <button disabled={saving} onClick={handleSaveSkills} className="px-6 py-2.5 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50 min-w-[120px]">
                                {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Save Skills'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
