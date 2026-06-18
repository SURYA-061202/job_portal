import { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, ChevronDown, ChevronUp, Save, X, ClipboardCheck, BookOpen } from 'lucide-react';
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import toast from 'react-hot-toast';

interface MCQ {
    id: string;
    question: string;
    options: string[];
    correctAnswer: number;
}

interface AssessmentSection {
    id: string;
    title: string;
    description: string;
    questions: MCQ[];
    createdAt: any;
}

export default function AssessmentsTab() {
    const [sections, setSections] = useState<AssessmentSection[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAddingSection, setIsAddingSection] = useState(false);
    const [expandedSection, setExpandedSection] = useState<string | null>(null);

    const [newSection, setNewSection] = useState({
        title: '',
        description: ''
    });

    useEffect(() => {
        fetchSections();
    }, []);

    const fetchSections = async () => {
        try {
            setLoading(true);
            const q = query(collection(db, 'assessments'), orderBy('createdAt', 'desc'));
            const snapshot = await getDocs(q);
            const data = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as AssessmentSection[];
            setSections(data);
        } catch (error) {
            console.error('Error fetching assessments:', error);
            toast.error('Failed to load assessments');
        } finally {
            setLoading(false);
        }
    };

    const handleAddSection = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await addDoc(collection(db, 'assessments'), {
                ...newSection,
                questions: [],
                createdAt: new Date()
            });
            toast.success('Assessment section added!');
            setNewSection({ title: '', description: '' });
            setIsAddingSection(false);
            fetchSections();
        } catch (error) {
            console.error('Error adding section:', error);
            toast.error('Failed to add section');
        }
    };

    const handleDeleteSection = async (id: string) => {
        if (!window.confirm('Are you sure you want to delete this assessment section?')) return;
        try {
            await deleteDoc(doc(db, 'assessments', id));
            toast.success('Section deleted');
            fetchSections();
        } catch (error) {
            console.error('Error deleting section:', error);
            toast.error('Failed to delete section');
        }
    };

    const handleUpdateQuestions = async (sectionId: string, updatedQuestions: MCQ[]) => {
        try {
            await updateDoc(doc(db, 'assessments', sectionId), {
                questions: updatedQuestions
            });
            toast.success('Questions updated!');
            fetchSections();
        } catch (error) {
            console.error('Error updating questions:', error);
            toast.error('Failed to save questions');
        }
    };

    if (loading) {
        return (
            <div className="min-h-[400px] flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
            </div>
        );
    }

    return (
        <div className="space-y-6 flex-1 flex flex-col p-4 md:p-6 pb-20 overflow-auto thin-scrollbar">
            {/* Header Section */}
            <div className="bg-white p-6 rounded-2xl border border-gray-100 overflow-hidden relative group">
                {/* Decorative background element */}
                <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/4 w-64 h-64 bg-primary-50 rounded-full blur-3xl opacity-50 group-hover:opacity-70 transition-opacity" />
                
                <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <div className="p-2 bg-primary-100 rounded-lg">
                                <ClipboardCheck className="w-5 h-5 text-primary-600" />
                            </div>
                            <h2 className="text-2xl font-black text-gray-900 tracking-tight">Skill Assessments</h2>
                        </div>
                        <p className="text-gray-500 text-sm font-medium">Manage assessment modules and multiple-choice questions</p>
                    </div>

                    <button
                        onClick={() => setIsAddingSection(true)}
                        className="flex items-center justify-center gap-2 px-6 py-3 bg-orange-gradient text-white rounded-xl text-sm font-bold shadow-lg shadow-orange-500/20 hover:shadow-orange-500/30 transition-all hover:-translate-y-0.5"
                    >
                        <Plus className="w-4 h-4" />
                        <span>Create New Section</span>
                    </button>
                </div>
            </div>

            {/* Assessment Grid */}
            <div className="grid grid-cols-1 gap-6">
                {sections.length === 0 && !isAddingSection ? (
                    <div className="text-center py-20 bg-white rounded-[2rem] border-2 border-dashed border-gray-200">
                        <div className="bg-primary-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                            <BookOpen className="w-8 h-8 text-primary-400" />
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">No Assessments Created</h3>
                        <p className="text-gray-500 max-w-sm mx-auto mb-8">
                            Start by creating your first assessment section to evaluate candidate skills.
                        </p>
                    </div>
                ) : (
                    sections.map(section => (
                        <div key={section.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden transition-all hover:shadow-md">
                            <div 
                                className={`p-6 flex items-center justify-between cursor-pointer transition-colors ${expandedSection === section.id ? 'bg-primary-50/30' : 'hover:bg-gray-50/50'}`}
                                onClick={() => setExpandedSection(expandedSection === section.id ? null : section.id)}
                            >
                                <div className="flex items-center gap-4">
                                    <div className={`p-3 rounded-xl ${expandedSection === section.id ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-500'}`}>
                                        <BookOpen className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-gray-900 text-lg">{section.title}</h3>
                                        <p className="text-sm text-gray-500">{section.questions?.length || 0} Questions</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteSection(section.id);
                                        }}
                                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                    {expandedSection === section.id ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                                </div>
                            </div>

                            {expandedSection === section.id && (
                                <div className="border-t border-gray-100 p-6 bg-gray-50/30">
                                    <MCQEditor 
                                        questions={section.questions || []} 
                                        onSave={(updated) => handleUpdateQuestions(section.id, updated)}
                                    />
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Add Section Modal */}
            {isAddingSection && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm px-6">
                    <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
                        <h3 className="text-xl font-bold text-gray-900 mb-6 font-poppins">New Assessment Section</h3>
                        <form onSubmit={handleAddSection} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">Title</label>
                                <input
                                    required
                                    type="text"
                                    placeholder="e.g. React Native Skill Test"
                                    value={newSection.title}
                                    onChange={e => setNewSection({ ...newSection, title: e.target.value })}
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none transition-all placeholder:text-gray-400 font-medium"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">Description</label>
                                <textarea
                                    required
                                    rows={3}
                                    placeholder="Brief description of the skills assessed..."
                                    value={newSection.description}
                                    onChange={e => setNewSection({ ...newSection, description: e.target.value })}
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none transition-all placeholder:text-gray-400 font-medium"
                                />
                            </div>
                            <div className="pt-4 flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsAddingSection(false)}
                                    className="flex-1 py-3 text-gray-600 font-bold bg-gray-100 hover:bg-gray-200 rounded-xl transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 py-3 text-white font-bold bg-orange-gradient hover:opacity-90 rounded-xl transition-all shadow-lg shadow-orange-500/20"
                                >
                                    Create Section
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

function MCQEditor({ questions, onSave }: { questions: MCQ[], onSave: (updated: MCQ[]) => void }) {
    const [localQuestions, setLocalQuestions] = useState<MCQ[]>([...questions]);
    const [isEditing, setIsEditing] = useState(false);

    const addQuestion = () => {
        const newQ: MCQ = {
            id: Date.now().toString(),
            question: '',
            options: ['', '', '', ''],
            correctAnswer: 0
        };
        setLocalQuestions([...localQuestions, newQ]);
        if (!isEditing) setIsEditing(true);
    };

    const removeQuestion = (id: string) => {
        setLocalQuestions(localQuestions.filter(q => q.id !== id));
    };

    const updateQuestionText = (id: string, text: string) => {
        setLocalQuestions(localQuestions.map(q => q.id === id ? { ...q, question: text } : q));
    };

    const updateOption = (qId: string, optIdx: number, val: string) => {
        setLocalQuestions(localQuestions.map(q => {
            if (q.id === qId) {
                const newOpts = [...q.options];
                newOpts[optIdx] = val;
                return { ...q, options: newOpts };
            }
            return q;
        }));
    };

    const setCorrectAnswer = (qId: string, idx: number) => {
        setLocalQuestions(localQuestions.map(q => q.id === qId ? { ...q, correctAnswer: idx } : q));
    };

    return (
        <div className="space-y-6 max-h-[70vh] overflow-y-auto px-1 thin-scrollbar">
            <div className="flex items-center justify-between sticky top-0 bg-gray-50/95 backdrop-blur-sm py-2 z-10 px-2 rounded-lg -mx-2 mb-4 border-b border-gray-100">
                <h4 className="text-sm font-bold text-gray-900 uppercase tracking-widest">Question Bank</h4>
                <div className="flex gap-2">
                    <button 
                        onClick={addQuestion}
                        className="p-1.5 bg-primary-100 text-primary-600 rounded-lg hover:bg-primary-200 transition-all flex items-center gap-1.5 text-xs font-bold"
                    >
                        <Plus className="w-4 h-4" />
                        Add Question
                    </button>
                    {localQuestions.length > 0 && !isEditing ? (
                        <button 
                            onClick={() => setIsEditing(true)}
                            className="p-1.5 bg-gray-900 text-white rounded-lg hover:bg-black transition-all flex items-center gap-1.5 text-xs font-bold"
                        >
                            <Edit2 className="w-3.5 h-3.5" />
                            Edit
                        </button>
                    ) : isEditing && (
                        <div className="flex gap-2">
                            <button 
                                onClick={() => {
                                    setIsEditing(false);
                                    setLocalQuestions([...questions]);
                                }}
                                className="p-1.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-all flex items-center gap-1.5 text-xs font-bold"
                            >
                                <X className="w-3.5 h-3.5" />
                                Cancel
                            </button>
                            <button 
                                onClick={() => {
                                    onSave(localQuestions);
                                    setIsEditing(false);
                                }}
                                className="p-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-all shadow-sm flex items-center gap-1.5 text-xs font-bold"
                            >
                                <Save className="w-3.5 h-3.5" />
                                Save
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {localQuestions.map((q, idx) => (
                <div key={q.id} className="bg-white p-5 rounded-xl border border-gray-200 relative group/q transition-all hover:border-primary-200">
                    {/* Delete Icon - Absolute Top Right */}
                    {isEditing && (
                        <button 
                            onClick={() => removeQuestion(q.id)}
                            className="absolute top-4 right-4 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all z-10"
                            title="Remove Question"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    )}

                    <div className="flex items-start">
                        {/* Question Number - Centered vertically with the question text area */}
                        <div className="flex-shrink-0 w-8 flex items-center justify-center min-h-[60px] md:min-h-[52px]">
                            <span className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-black text-gray-500 border border-gray-200">
                                {idx + 1}
                            </span>
                        </div>

                        {/* Question Content & Options */}
                        <div className="flex-1 ml-4 pr-10">
                            <div className="min-h-[60px] md:min-h-[52px] flex items-center mb-4">
                                {isEditing ? (
                                    <textarea
                                        value={q.question}
                                        onChange={(e) => updateQuestionText(q.id, e.target.value)}
                                        placeholder="Enter question text..."
                                        className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm font-medium transition-all"
                                        rows={2}
                                    />
                                ) : (
                                    <p className="text-sm font-bold text-gray-900 leading-relaxed">{q.question || <span className="text-gray-400 italic font-normal">No question text provided</span>}</p>
                                )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {q.options.map((opt, oIdx) => (
                                    <div 
                                        key={oIdx} 
                                        className={`flex items-center p-2.5 rounded-lg border transition-all focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-500/20 ${
                                            q.correctAnswer === oIdx 
                                            ? 'bg-emerald-50 border-emerald-200 ring-1 ring-emerald-500/20' 
                                            : 'bg-gray-50 border-gray-100'
                                        }`}
                                    >
                                        <div className="mr-3 flex items-center">
                                            {isEditing ? (
                                                <input
                                                    type="radio"
                                                    name={`correct-${q.id}`}
                                                    checked={q.correctAnswer === oIdx}
                                                    onChange={() => setCorrectAnswer(q.id, oIdx)}
                                                    className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 border-gray-300 cursor-pointer"
                                                />
                                            ) : (
                                                <div className={`w-4 h-4 rounded-full border-2 ${q.correctAnswer === oIdx ? 'bg-emerald-500 border-emerald-500 shadow-sm' : 'border-gray-300'}`} />
                                            )}
                                        </div>
                                        {isEditing ? (
                                            <input
                                                type="text"
                                                value={opt}
                                                onChange={(e) => updateOption(q.id, oIdx, e.target.value)}
                                                placeholder={`Option ${String.fromCharCode(65 + oIdx)}`}
                                                className="bg-transparent border-none p-0 text-sm font-medium focus:ring-0 focus:outline-none outline-none w-full shadow-none"
                                            />
                                        ) : (
                                            <span className={`text-sm ${q.correctAnswer === oIdx ? 'text-emerald-700 font-bold' : 'text-gray-600 font-medium'}`}>
                                                {opt || <span className="text-gray-300 italic font-normal">Empty Option</span>}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            ))}

            {localQuestions.length === 0 && (
                <div className="py-12 flex flex-col items-center justify-center opacity-40">
                    <ClipboardCheck className="w-12 h-12 mb-2" />
                    <p className="text-sm font-bold">No questions added yet</p>
                </div>
            )}
        </div>
    );
}
