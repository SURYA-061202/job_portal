import { useState, useEffect } from 'react';
import UserHeader from '@/components/layout/UserHeader';
import { db, auth } from '@/lib/firebase';
import { collection, query, orderBy, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { Loader2, BookOpen, ChevronRight, CheckCircle2, Clock, Award, X, ChevronLeft, AlertCircle, Sparkles } from 'lucide-react';
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
}

interface TestResult {
    score: number;
    totalQuestions: number;
    attemptedAt: string;
}

export default function TrainingModulePage() {
    const [sections, setSections] = useState<AssessmentSection[]>([]);
    const [userResults, setUserResults] = useState<Record<string, TestResult>>({});
    const [loading, setLoading] = useState(true);
    const [activeTest, setActiveTest] = useState<AssessmentSection | null>(null);
    const [user, setUser] = useState<any>(null);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (u) => {
            setUser(u);
            if (u) {
                fetchData(u.uid);
            } else {
                setLoading(false);
            }
        });
        return () => unsubscribe();
    }, []);

    const fetchData = async (uid: string) => {
        try {
            setLoading(true);
            
            // 1. Fetch Assessment Sections
            const q = query(collection(db, 'assessments'), orderBy('createdAt', 'desc'));
            const snapshot = await getDocs(q);
            const sectionsData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as AssessmentSection[];
            setSections(sectionsData);

            // 2. Fetch User Results
            const userRef = doc(db, 'users', uid);
            const testResultsRef = collection(userRef, 'testResults');
            const resultsSnapshot = await getDocs(testResultsRef);
            const resultsData: Record<string, TestResult> = {};
            resultsSnapshot.forEach(doc => {
                resultsData[doc.id] = doc.data() as TestResult;
            });
            setUserResults(resultsData);

        } catch (error) {
            console.error('Error fetching training data:', error);
            toast.error('Failed to load training modules');
        } finally {
            setLoading(false);
        }
    };

    const handleCompleteTest = async (testId: string, score: number, total: number) => {
        if (!user) return;

        try {
            const result: TestResult = {
                score,
                totalQuestions: total,
                attemptedAt: new Date().toISOString()
            };

            await setDoc(doc(db, 'users', user.uid, 'testResults', testId), result);
            setUserResults(prev => ({ ...prev, [testId]: result }));
            setActiveTest(null);
            toast.success(`Assessment completed! Score: ${score}/${total}`);
        } catch (error) {
            console.error('Error saving test result:', error);
            toast.error('Failed to save assessment result');
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
                <Loader2 className="w-12 h-12 text-orange-500 animate-spin mb-4" />
                <p className="text-gray-500 font-bold">Loading training modules...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col" style={{ fontFamily: '"Poppins", sans-serif' }}>
            <UserHeader />
            
            <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
                {/* Hero Section */}
                <div className="mb-12 text-center sm:text-left">
                    <h1 className="text-3xl md:text-4xl font-black text-gray-900 tracking-tight leading-none mb-4">
                        Skill <span className="text-orange-600">Training</span> Module
                    </h1>
                    <p className="text-gray-500 text-lg max-w-2xl leading-relaxed">
                        Enhance your professional standing with our verified skill assessments. Get scores and showcase your expertise to employers.
                    </p>
                </div>

                {sections.length === 0 ? (
                    <div className="bg-white rounded-[2rem] p-12 text-center border border-gray-100 shadow-sm max-w-2xl mx-auto">
                        <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
                            <BookOpen className="w-10 h-10 text-gray-300" />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-2">Awaiting Assessments</h2>
                        <p className="text-gray-500 mb-0">Our managers are currently curating new assessment modules for you. Please check back later!</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
                        {sections.map((section) => {
                            const result = userResults[section.id];
                            const isAttempted = !!result;
                            
                            return (
                                <div 
                                    key={section.id} 
                                    className="bg-white rounded-[2rem] p-6 border border-gray-100 transition-all duration-500 flex flex-col group relative overflow-hidden"
                                >
                                    {/* Glassy Background Accent */}
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-orange-50/50 rounded-full -mr-16 -mt-16 blur-3xl group-hover:bg-orange-100/50 transition-colors duration-500" />

                                    <div className="relative z-10 flex flex-col items-center text-center h-full">
                                        <div className="w-full mb-4">
                                            {isAttempted && (
                                                <div className="flex flex-col items-center">
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">Verified Score</span>
                                                    <span className="text-2xl font-black text-gray-900 mt-1">{Math.round((result.score / result.totalQuestions) * 100)}%</span>
                                                </div>
                                            )}
                                        </div>

                                        <h3 className="text-xl font-black text-gray-900 leading-tight mb-2 group-hover:text-orange-600 transition-colors duration-300">{section.title}</h3>
                                        <p className="text-gray-500 text-xs font-medium leading-relaxed mb-4 flex-1 line-clamp-3">
                                            {section.description || "Master these technical skills with our comprehensive assessment designed by industry experts."}
                                        </p>

                                        <div className="flex items-center justify-center gap-6 mb-6 text-xs font-bold text-gray-400">
                                            <div className="flex items-center gap-2">
                                                <span>{section.questions?.length || 0} Questions</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {isAttempted ? (
                                                    <span className="text-emerald-600">Attempted</span>
                                                ) : (
                                                    <span>Ready</span>
                                                )}
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => setActiveTest(section)}
                                            className={`mx-auto w-fit px-6 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all duration-300 border ${
                                                isAttempted 
                                                ? 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100' 
                                                : 'bg-orange-50 text-orange-600 border-orange-600 hover:bg-orange-100'
                                            }`}
                                        >
                                            {isAttempted ? (
                                                <span>Review Result</span>
                                            ) : (
                                                <span>Attempt Assessment</span>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>

            {/* Assessment Modal */}
            {activeTest && (
                <div className="fixed inset-0 z-50 overflow-hidden">
                    <div className="absolute inset-0 bg-gray-950/40 backdrop-blur-md" onClick={() => !userResults[activeTest.id] && setActiveTest(null)} />
                    <div className="absolute inset-y-0 right-0 w-full max-w-4xl bg-white shadow-2xl flex flex-col p-0 transition-transform duration-500 transform translate-x-0">
                        {userResults[activeTest.id] ? (
                            <AssessmentResult 
                                test={activeTest} 
                                result={userResults[activeTest.id]} 
                                onClose={() => setActiveTest(null)} 
                            />
                        ) : (
                            <QuizInterface 
                                test={activeTest} 
                                onCancel={() => setActiveTest(null)}
                                onComplete={(score) => handleCompleteTest(activeTest.id, score, activeTest.questions.length)}
                            />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function QuizInterface({ test, onCancel, onComplete }: { test: AssessmentSection, onCancel: () => void, onComplete: (score: number) => void }) {
    const [currentIdx, setCurrentIdx] = useState(0);
    const [answers, setAnswers] = useState<Record<string, number>>({});
    const [isFinished, setIsFinished] = useState(false);

    const questions = test.questions || [];
    const currentQ = questions[currentIdx];

    const handleSelectOption = (qId: string, optIdx: number) => {
        setAnswers(prev => ({ ...prev, [qId]: optIdx }));
    };

    const handleFinish = () => {
        let score = 0;
        questions.forEach(q => {
            if (answers[q.id] === q.correctAnswer) {
                score++;
            }
        });
        onComplete(score);
    };

    if (questions.length === 0) {
        return (
            <div className="h-full flex flex-col items-center justify-center p-12 text-center">
                <AlertCircle className="w-16 h-16 text-orange-500 mb-4" />
                <h3 className="text-2xl font-bold text-gray-900 mb-2">No Questions Found</h3>
                <p className="text-gray-500 mb-8">This assessment doesn't have any questions yet. Please contact support.</p>
                <button onClick={onCancel} className="px-8 py-3 bg-gray-900 text-white rounded-xl font-bold">Go Back</button>
            </div>
        );
    }

    const progress = ((currentIdx + 1) / questions.length) * 100;

    return (
        <div className="h-full flex flex-col bg-gray-50">
            {/* Quiz Header */}
            <div className="px-8 py-6 bg-white border-b border-gray-100 sticky top-0 z-10">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h2 className="text-2xl font-black text-gray-900 tracking-tight">{test.title}</h2>
                        <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mt-1">Assessment Ongoing</p>
                    </div>
                    <button onClick={onCancel} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                        <X className="w-6 h-6 text-gray-400" />
                    </button>
                </div>
                
                <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                        className="absolute h-full bg-orange-gradient transition-all duration-500" 
                        style={{ width: `${progress}%` }}
                    />
                </div>
                <div className="flex justify-between items-center mt-3 text-[10px] font-black uppercase tracking-widest text-gray-400">
                    <span>Question {currentIdx + 1} of {questions.length}</span>
                    <span>{Math.round(progress)}% Complete</span>
                </div>
            </div>

            {/* Quiz Body */}
            <div className="flex-1 overflow-y-auto p-8 md:p-12 thin-scrollbar">
                <div className="max-w-2xl mx-auto">
                    <div className="mb-10">
                        <h3 className="text-xl md:text-3xl font-black text-gray-900 leading-snug">
                            {currentQ.question}
                        </h3>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                        {currentQ.options.map((opt, idx) => (
                            <button
                                key={idx}
                                onClick={() => handleSelectOption(currentQ.id, idx)}
                                className={`flex items-center p-6 rounded-3xl border-2 transition-all duration-300 text-left ${
                                    answers[currentQ.id] === idx 
                                    ? 'bg-white border-orange-500 shadow-xl shadow-orange-500/10 -translate-y-1' 
                                    : 'bg-white border-transparent hover:border-gray-200'
                                }`}
                            >
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-4 flex-shrink-0 font-black text-sm transition-colors ${
                                    answers[currentQ.id] === idx ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-400'
                                }`}>
                                    {String.fromCharCode(65 + idx)}
                                </div>
                                <span className={`text-lg font-bold ${answers[currentQ.id] === idx ? 'text-gray-900' : 'text-gray-600'}`}>
                                    {opt}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Quiz Footer */}
            <div className="px-8 py-8 bg-white border-t border-gray-100 flex items-center justify-between">
                <button
                    disabled={currentIdx === 0}
                    onClick={() => setCurrentIdx(prev => prev - 1)}
                    className="flex items-center gap-2 px-6 py-3 text-gray-400 font-bold hover:text-gray-900 disabled:opacity-30 transition-colors"
                >
                    <ChevronLeft className="w-5 h-5" />
                    <span>Previous</span>
                </button>

                {currentIdx < questions.length - 1 ? (
                    <button
                        onClick={() => setCurrentIdx(prev => prev + 1)}
                        className="px-10 py-4 bg-gray-900 text-white rounded-2xl font-extrabold shadow-lg shadow-gray-200 hover:bg-black transition-all hover:-translate-y-0.5"
                    >
                        Next Question
                    </button>
                ) : (
                    <button
                        onClick={handleFinish}
                        className="px-10 py-4 bg-orange-gradient text-white rounded-2xl font-extrabold shadow-lg shadow-orange-500/20 hover:shadow-orange-500/30 transition-all hover:-translate-y-0.5"
                    >
                        Finish Assessment
                    </button>
                )}
            </div>
        </div>
    );
}

function AssessmentResult({ test, result, onClose }: { test: AssessmentSection, result: TestResult, onClose: () => void }) {
    const percentage = Math.round((result.score / result.totalQuestions) * 100);
    const questions = test.questions || [];

    return (
        <div className="h-full flex flex-col bg-white">
            <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
                <h2 className="text-2xl font-black text-gray-900 tracking-tight">Assessment Review</h2>
                <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                    <X className="w-6 h-6 text-gray-400" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 md:p-12 thin-scrollbar">
                <div className="max-w-2xl mx-auto text-center mb-16">
                    <div className={`w-32 h-32 rounded-full flex items-center justify-center mx-auto mb-6 border-4 ${percentage >= 70 ? 'bg-emerald-50 border-emerald-500 text-emerald-600' : 'bg-orange-50 border-orange-500 text-orange-600'}`}>
                        <span className="text-4xl font-black">{percentage}%</span>
                    </div>
                    <h3 className="text-3xl font-black text-gray-900 mb-2">{percentage >= 70 ? 'Excellent Work!' : 'Keep Practicing!'}</h3>
                    <p className="text-gray-500 font-medium">You scored {result.score} out of {result.totalQuestions} in the {test.title} assessment.</p>
                </div>

                <div className="space-y-6">
                    <h4 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-4 px-2">Knowledge Review</h4>
                    {questions.map((q, idx) => (
                        <div key={q.id} className="p-8 bg-gray-50 rounded-[2rem] border border-gray-100 relative overflow-hidden group">
                           <div className="absolute top-4 left-4 text-[60px] font-black text-gray-100 -z-0 leading-none opacity-50">{idx + 1}</div>
                           <div className="relative z-10">
                               <p className="text-sm font-black text-gray-900 mb-6 leading-relaxed pr-8">{q.question}</p>
                               <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                   {q.options.map((opt, oIdx) => (
                                       <div key={oIdx} className={`p-4 rounded-2xl border flex items-center gap-3 ${oIdx === q.correctAnswer ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-transparent text-gray-500'}`}>
                                           <div className={`w-2 h-2 rounded-full ${oIdx === q.correctAnswer ? 'bg-emerald-500' : 'bg-gray-200'}`} />
                                           <span className={`text-xs font-bold ${oIdx === q.correctAnswer ? '' : 'line-through opacity-50'}`}>{opt}</span>
                                       </div>
                                   ))}
                               </div>
                           </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="p-8 border-t border-gray-100 bg-gray-50/50">
                <button 
                    onClick={onClose}
                    className="w-full py-4 bg-gray-900 text-white rounded-2xl font-black shadow-lg shadow-gray-200 hover:bg-black transition-all"
                >
                    Dismiss Review
                </button>
            </div>
        </div>
    );
}
