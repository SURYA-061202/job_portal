import { useState } from 'react';
import type { Candidate } from '@/types';
import { X } from 'lucide-react';
import { db } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';

interface Props {
  candidate: Candidate;
  onCancel: () => void; // called when user cancels / closes modal without saving
  onSaved?: () => void; // called after successful save
}

export default function ManualDetailsModal({ candidate, onCancel, onSaved }: Props) {
  const [form, setForm] = useState({
    name: candidate.name || '',
    email: candidate.email || '',
    phone: candidate.phone || '',
    role: candidate.role || '',
    experience: candidate.experience || '',
  });
  const [skills, setSkills] = useState<string[]>(candidate.skills || []);
  const [skillInput, setSkillInput] = useState('');
  const suggestions = ['JavaScript', 'TypeScript', 'React', 'Node.js', 'Python', 'Java', 'AWS', 'Docker', 'SQL', 'HTML', 'CSS'];

  const toggleSkill = (skill: string) => {
    setSkills((prev) => (prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]));
  };

  const addSkillFromInput = () => {
    const trimmed = skillInput.trim();
    if (!trimmed) return;
    if (!skills.includes(trimmed)) {
      setSkills((prev) => [...prev, trimmed]);
    }
    setSkillInput('');
  };

  const [saving, setSaving] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    if (!form.name || !form.email || !form.phone) {
      toast.error('Please fill name, email and phone');
      return;
    }
    try {
      setSaving(true);
      await updateDoc(doc(db, 'candidates', candidate.id), {
        name: form.name,
        email: form.email,
        phone: form.phone,
        role: form.role,
        experience: form.experience,
        skills,
        updatedAt: new Date(),
      });
      toast.success('Details saved');
      onSaved?.();
    } catch (err) {
      console.error(err);
      toast.error('Failed to save details');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (saving) return;
    onCancel();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white w-full max-w-2xl rounded-lg shadow-lg p-6 relative">
        <button
          onClick={handleCancel}
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="text-xl font-semibold mb-4">Enter Details Manually</h2>

        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input
              type="tel"
              name="phone"
              value={form.phone}
              onChange={handleChange}
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <input
              type="text"
              name="role"
              value={form.role}
              onChange={handleChange}
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Experience</label>
            <textarea
              name="experience"
              value={form.experience}
              onChange={handleChange}
              rows={3}
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Skills</label>
            {/* Selected skills chips */}
            {skills.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {skills.map((skill) => (
                  <span key={skill} className="inline-flex items-center bg-primary-100 text-primary-800 text-xs font-medium px-2 py-1 rounded-full cursor-pointer hover:bg-primary-200"
                    onClick={() => toggleSkill(skill)}>
                    {skill} <X className="ml-1 h-3 w-3" />
                  </span>
                ))}
              </div>
            )}
            {/* Suggestions */}
            <div className="flex flex-wrap gap-2 mb-2">
              {suggestions.map((s) => (
                <button type="button" key={s} onClick={() => toggleSkill(s)}
                  className={`text-xs px-2 py-1 rounded border ${skills.includes(s) ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>{s}</button>
              ))}
            </div>
            {/* Manual input */}
            <div className="flex gap-2">
              <input type="text" value={skillInput} onChange={(e) => setSkillInput(e.target.value)}
                placeholder="Add custom skill" className="flex-1 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              <button type="button" onClick={addSkillFromInput}
                className="px-3 py-2 text-sm rounded-md bg-primary-600 text-white hover:bg-primary-700">Add</button>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-sm font-medium border rounded-md text-gray-700 hover:bg-gray-50"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50"
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
} 