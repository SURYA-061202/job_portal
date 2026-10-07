import type { Education } from '@/types';

type UserDoc = Record<string, unknown>;

const toSkillList = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
    if (typeof value === 'string') return value.split(',').map((s) => s.trim()).filter(Boolean);
    return [];
};

/** Skills as saved by the user-side profile (skillItems array, legacy comma string). */
export const getUserSkills = (data: UserDoc): string[] => {
    const items = toSkillList(data.skillItems);
    if (items.length > 0) return items;
    return toSkillList(data.skills);
};

const asText = (value: unknown): string =>
    value === undefined || value === null ? '' : String(value).trim();

const itemsOf = (value: unknown): UserDoc[] => (Array.isArray(value) ? (value as UserDoc[]) : []);

const extractedOf = (data: UserDoc): UserDoc => {
    const value = data.extractedData;
    return value && typeof value === 'object' ? (value as UserDoc) : {};
};

/** Education as saved by the user-side profile (educationItems array, legacy college/degree). */
export const getUserEducation = (data: UserDoc): Education[] => {
    const items = Array.isArray(data.educationItems) ? (data.educationItems as UserDoc[]) : [];
    const mapped: Education[] = items.map((edu) => {
        const grade = asText(edu.grade);
        return {
            institution: asText(edu.collegeName) || asText(data.college),
            degree: asText(edu.course) || asText(data.degree),
            field: asText(edu.specialization),
            year: asText(edu.graduatedYear),
            ...(grade ? { cgpa: grade } : {})
        };
    });
    if (mapped.length > 0) return mapped;

    // Resume-extracted entries (uploaded candidates)
    const fromResume = itemsOf(extractedOf(data).education)
        .map((edu) => {
            const grade = asText(edu.cgpa) || asText(edu.CGPA);
            return {
                institution: asText(edu.institution),
                degree: asText(edu.degree),
                field: asText(edu.field),
                year: asText(edu.year),
                ...(grade ? { cgpa: grade } : {})
            };
        })
        .filter((edu) => edu.institution || edu.degree || edu.field);
    if (fromResume.length > 0) return fromResume;

    const college = asText(data.college);
    if (!college) return [];
    return [
        {
            institution: college,
            degree: asText(data.degree),
            field: '',
            year: asText(data.graduationYear)
        }
    ];
};

/** One line of profile detail shown on cards/summaries. */
export type ProfileLine = { title: string; meta?: string; description?: string };

/** Projects added on the user-side profile (projectItems), with resume/legacy fallbacks. */
export const getUserProjects = (data: UserDoc): ProfileLine[] => {
    const items = itemsOf(data.projectItems);
    if (items.length === 0) {
        const legacy = asText(data.projects);
        if (legacy) return [{ title: 'Portfolio', description: legacy }];
        return itemsOf(extractedOf(data).projects)
            .map((p) => ({ title: asText(p.name), meta: asText(p.technologies), description: asText(p.description) }))
            .filter((p) => p.title);
    }
    return items
        .map((p) => ({
            title: asText(p.title) || asText(p.name),
            meta: [asText(p.role), asText(p.duration)].filter(Boolean).join(' · '),
            description: asText(p.description)
        }))
        .filter((p) => p.title);
};

/** Certificates added on the user-side profile (certificateItems), with resume/legacy fallbacks. */
export const getUserCertificates = (data: UserDoc): ProfileLine[] => {
    const items = itemsOf(data.certificateItems);
    if (items.length === 0) {
        const names = toSkillList(data.certifications).length
            ? toSkillList(data.certifications)
            : toSkillList(extractedOf(data).certifications);
        return names.map((name) => ({ title: name }));
    }
    return items
        .map((c) => ({
            title: asText(c.name),
            meta: [asText(c.organization), asText(c.issueDate)].filter(Boolean).join(' · ')
        }))
        .filter((c) => c.title);
};

/** Work experience added on the user-side profile (experienceItems), with resume fallbacks. */
export const getUserExperience = (data: UserDoc): ProfileLine[] => {
    const items = itemsOf(data.experienceItems);
    if (items.length === 0) {
        return itemsOf(extractedOf(data).workExperience)
            .map((w) => ({
                title: [asText(w.position), asText(w.company)].filter(Boolean).join(' — '),
                meta: asText(w.duration),
                description: asText(w.description)
            }))
            .filter((w) => w.title);
    }
    return items
        .map((w) => ({
            title: [asText(w.role), asText(w.company)].filter(Boolean).join(' — '),
            meta: asText(w.duration),
            description: asText(w.description)
        }))
        .filter((w) => w.title);
};

/** Courses/certifications-in-progress added on the user-side profile (courseItems). */
export const getUserCourses = (data: UserDoc): string[] => {
    const items = toSkillList(data.courseItems);
    if (items.length > 0) return items;
    return toSkillList(data.courses);
};
