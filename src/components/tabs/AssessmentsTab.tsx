import { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, ChevronDown, ChevronUp, Save, X, ClipboardCheck, BookOpen, Loader2 } from 'lucide-react';
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import toast from 'react-hot-toast';
import { usePopup } from '@/components/ui/Popup';
import { useSkin, FOCUS } from '@/styles/skin';

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
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const { showSuccess, showError } = usePopup();
    const skin = useSkin();

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
        setDeletingId(id);
        try {
            await deleteDoc(doc(db, 'assessments', id));
            showSuccess('Section deleted');
            fetchSections();
        } catch (error) {
            console.error('Error deleting section:', error);
            showError('Failed to delete section');
        } finally {
            setDeletingId(null);
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
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand" />
            </div>
        );
    }

    return (
        <div className={`space-y-6 flex-1 flex flex-col ${skin.canvas} p-4 md:p-6 pb-20 overflow-auto thin-scrollbar`}>
            {/* Header Section */}
            <div className={`p-6 overflow-hidden relative group border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.shadow} transition-colors duration-200 ${skin.cardHover}`}>
                {/* Decorative background element */}
                <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/4 w-64 h-64 bg-brand/10 rounded-full blur-3xl opacity-50 group-hover:opacity-70 transition-opacity" />
                
                <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <div className={`p-2 ${skin.radius} bg-brand/20`}>
                                <ClipboardCheck className="w-5 h-5 text-brand" />
                            </div>
                            <h2 className={skin.heading}>Skill Assessments</h2>
                        </div>
                        <p className="text-ink/60 text-sm font-medium">Manage assessment modules and multiple-choice questions</p>
                    </div>

                    <button
                        onClick={() => setIsAddingSection(true)}
                        className={`flex items-center justify-center gap-2 cursor-pointer ${skin.cta} ${FOCUS} hover:-translate-y-0.5`}
                    >
                        <Plus className="w-4 h-4" />
                        <span>Create New Section</span>
                    </button>
                </div>
            </div>

            {/* Assessment Grid */}
            <div className="grid grid-cols-1 gap-6">
                {sections.length === 0 && !isAddingSection ? (
                    <div className={`text-center py-20 ${skin.surface} ${skin.radius} border-2 border-dashed ${skin.edge} transition-colors duration-200 ${skin.cardHover}`}>
                        <div className={`w-16 h-16 ${skin.stateIcon} rounded-full flex items-center justify-center mx-auto mb-4`}>
                            <BookOpen className="w-8 h-8 text-brand" />
                        </div>
                        <h3 className={`${skin.emptyTitle} mb-2`}>No Assessments Created</h3>
                        <p className={`${skin.body} max-w-sm mx-auto mb-8`}>
                            Start by creating your first assessment section to evaluate candidate skills.
                        </p>
                    </div>
                ) : (
                    sections.map(section => (
                        <div key={section.id} className={`${skin.surface} ${skin.radius} ${skin.shadow} border ${skin.edge} overflow-hidden transition-colors duration-200 ${skin.cardHover}`}>
                            <div 
                                className={`p-6 flex items-center justify-between cursor-pointer transition-colors ${FOCUS} ${expandedSection === section.id ? 'bg-brand/3' : 'hover:bg-muted/50'}`}
                                onClick={() => setExpandedSection(expandedSection === section.id ? null : section.id)}
                            >
                                <div className="flex items-center gap-4">
                                    <div className={`p-3 ${skin.radius} ${expandedSection === section.id ? 'bg-brand/20 text-brand' : 'bg-muted text-ink/60'}`}>
                                        <BookOpen className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h3 className={skin.cardTitle}>{section.title}</h3>
                                        <p className="text-sm text-ink/60">{section.questions?.length || 0} Questions</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteSection(section.id);
                                        }}
                                        disabled={deletingId === section.id}
                                        className={`p-2 border border-destructive ${skin.surface} text-destructive ${skin.radius} hover:bg-destructive/10 cursor-pointer transition-colors duration-200 disabled:opacity-50 ${FOCUS}`}
                                    >
                                        {deletingId === section.id ? (
                                            <Loader2 className="w-5 h-5 animate-spin text-destructive" />
                                        ) : (
                                            <Trash2 className="w-5 h-5" />
                                        )}
                                    </button>
                                    {expandedSection === section.id ? <ChevronUp className="w-5 h-5 text-ink/40" /> : <ChevronDown className="w-5 h-5 text-ink/40" />}
                                </div>
                            </div>

                            {expandedSection === section.id && (
                                <div className={`border-t ${skin.edge} p-6 bg-muted/50`}>
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
                    <div className={`w-full max-w-md p-6 border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.shadow}`}>
                        <h3 className={`${skin.heading} mb-6 font-poppins`}>New Assessment Section</h3>
                        <form onSubmit={handleAddSection} className="space-y-4">
                            <div>
                                <label className={`block mb-1 ${skin.micro}`}>Title</label>
                                <input
                                    required
                                    type="text"
                                    placeholder="e.g. React Native Skill Test"
                                    value={newSection.title}
                                    onChange={e => setNewSection({ ...newSection, title: e.target.value })}
                                    className={`w-full p-3 ${skin.field} ${FOCUS}`}
                                />
                            </div>
                            <div>
                                <label className={`block mb-1 ${skin.micro}`}>Description</label>
                                <textarea
                                    required
                                    rows={3}
                                    placeholder="Brief description of the skills assessed..."
                                    value={newSection.description}
                                    onChange={e => setNewSection({ ...newSection, description: e.target.value })}
                                    className={`w-full p-3 ${skin.field} ${FOCUS}`}
                                />
                            </div>
                            <div className="pt-4 flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsAddingSection(false)}
                                    className={`flex-1 cursor-pointer ${skin.secondary} ${FOCUS}`}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className={`flex-1 cursor-pointer ${skin.cta} ${FOCUS}`}
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
    const skin = useSkin();

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
            <div className={`flex items-center justify-between sticky top-0 bg-muted/95 backdrop-blur-sm py-2 z-10 px-2 ${skin.radius} -mx-2 mb-4 border-b ${skin.edge}`}>
                <h4 className={skin.micro}>Question Bank</h4>
                <div className="flex gap-2">
                    <button 
                        onClick={addQuestion}
                        className={`p-1.5 border border-brand/20 bg-brand/10 text-brand ${skin.radius} hover:bg-brand/20 transition-all flex items-center gap-1.5 text-xs font-bold ${FOCUS}`}
                    >
                        <Plus className="w-4 h-4" />
                        Add Question
                    </button>
                    {localQuestions.length > 0 && !isEditing ? (
                        <button 
                            onClick={() => setIsEditing(true)}
                            className={`p-1.5 flex items-center gap-1.5 cursor-pointer ${skin.cta} ${FOCUS}`}
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
                                className={`p-1.5 flex items-center gap-1.5 cursor-pointer ${skin.secondary} ${FOCUS}`}
                            >
                                <X className="w-3.5 h-3.5" />
                                Cancel
                            </button>
                            <button 
                                onClick={() => {
                                    onSave(localQuestions);
                                    setIsEditing(false);
                                }}
                                className={`p-1.5 flex items-center gap-1.5 cursor-pointer ${skin.cta} ${FOCUS}`}
                            >
                                <Save className="w-3.5 h-3.5" />
                                Save
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {localQuestions.map((q, idx) => (
                <div key={q.id} className={`${skin.surface} p-5 border ${skin.edge} ${skin.radius} ${skin.shadow} relative group/q transition-colors duration-200 ${skin.cardHover}`}>
                    {/* Delete Icon - Absolute Top Right */}
                    {isEditing && (
                        <button 
                            onClick={() => removeQuestion(q.id)}
                            className={`absolute top-4 right-4 p-2 border border-destructive ${skin.surface} text-destructive ${skin.radius} hover:bg-destructive/10 cursor-pointer transition-colors duration-200 z-10 ${FOCUS}`}
                            title="Remove Question"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    )}

                    <div className="flex items-start">
                        {/* Question Number - Centered vertically with the question text area */}
                        <div className="flex-shrink-0 w-8 flex items-center justify-center min-h-[60px] md:min-h-[52px]">
                            <span className={`w-8 h-8 rounded-full ${skin.surface} flex items-center justify-center text-xs font-black text-ink/70 border ${skin.edge}`}>
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
                                        className={`w-full p-2.5 ${skin.field} ${FOCUS}`}
                                        rows={2}
                                    />
                                ) : (
                                    <p className="text-sm font-bold text-ink leading-relaxed">{q.question || <span className="text-ink/40 italic font-normal">No question text provided</span>}</p>
                                )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {q.options.map((opt, oIdx) => (
                                    <div 
                                        key={oIdx} 
                                        className={`flex items-center p-2.5 ${skin.radius} border transition-all focus-within:border-ink focus-within:ring-2 focus-within:ring-brand/20 ${
                                            q.correctAnswer === oIdx 
                                            ? 'bg-emerald-50 border-emerald-200 ring-1 ring-emerald-500/20' 
                                            : `${skin.surface} ${skin.edge} hover:border-ink`
                                        }`}
                                    >
                                        <div className="mr-3 flex items-center">
                                            {isEditing ? (
                                                <input
                                                    type="radio"
                                                    name={`correct-${q.id}`}
                                                    checked={q.correctAnswer === oIdx}
                                                    onChange={() => setCorrectAnswer(q.id, oIdx)}
                                                    className={`w-4 h-4 text-emerald-600 focus:ring-emerald-500 ${skin.edge} cursor-pointer`}
                                                />
                                            ) : (
                                                <div className={`w-4 h-4 rounded-full border-2 ${q.correctAnswer === oIdx ? 'bg-emerald-500 border-emerald-500 shadow-sm' : skin.edge}`} />
                                            )}
                                        </div>
                                        {isEditing ? (
                                            <input
                                                type="text"
                                                value={opt}
                                                onChange={(e) => updateOption(q.id, oIdx, e.target.value)}
                                                placeholder={`Option ${String.fromCharCode(65 + oIdx)}`}
                                                className="bg-transparent border-none p-0 text-sm text-ink font-medium focus:ring-0 focus:outline-none outline-none w-full shadow-none"
                                            />
                                        ) : (
                                            <span className={`text-sm ${q.correctAnswer === oIdx ? 'text-emerald-700 font-bold' : 'text-ink/70 font-medium'}`}>
                                                {opt || <span className="text-ink/30 italic font-normal">Empty Option</span>}
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
                    <p className={skin.emptyTitle}>No questions added yet</p>
                </div>
            )}
        </div>
    );
}
