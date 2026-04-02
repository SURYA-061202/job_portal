import { Page, Text, View, Document, StyleSheet, Link } from '@react-pdf/renderer';

// Register standard fonts if needed, but Times-Roman is a built-in standard
// Font.register({ family: 'Times-Roman', src: '...' });

const styles = StyleSheet.create({
    page: {
        padding: '0.4in 0.4in',
        fontFamily: 'Helvetica',
        fontSize: 10,
        lineHeight: 1.25,
        color: '#000',
    },
    header: {
        marginBottom: 12,
        flexDirection: 'column',
    },
    nameWrapper: {
        textAlign: 'center',
        marginBottom: 4,
    },
    name: {
        fontSize: 24,
        fontFamily: 'Helvetica-Bold',
    },
    addressWrapper: {
        textAlign: 'center',
        marginBottom: 6,
    },
    address: {
        fontSize: 9,
    },
    contactRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 12,
    },
    contactItem: {
        fontSize: 9,
    },
    section: {
        marginTop: 10,
        marginBottom: 2,
    },
    sectionTitle: {
        fontSize: 11,
        fontFamily: 'Helvetica-Bold',
        borderBottomWidth: 1,
        borderBottomColor: '#000',
        paddingBottom: 2,
        marginBottom: 6,
        marginTop: 4,
    },
    subheadingRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 2,
    },
    boldText: {
        fontFamily: 'Helvetica-Bold',
    },
    italicText: {
        fontSize: 9,
    },
    subSubheadingRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        fontSize: 9,
        marginBottom: 6,
    },
    itemList: {
        marginTop: 2,
    },
    item: {
        flexDirection: 'row',
        marginBottom: 2,
        paddingLeft: 10,
    },
    bullet: {
        width: 12,
        fontSize: 9,
    },
    itemText: {
        flex: 1,
        fontSize: 9,
    },
    coursesGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    courseItem: {
        width: '33.33%',
        marginBottom: 4,
    }
});

interface ResumeProps {
    data: any;
}

export const StandardResumeTemplate = ({ data }: ResumeProps) => {
    const { firstName, lastName, email, mobile, address, educationItems, projectItems, certificateItems, experienceItems, courseItems, skillItems, portfolio, linkedin, github } = data;
    const fullName = `${firstName} ${lastName}`.trim() || 'Your Name';

    return (
        <Document title={`${fullName} Resume`}>
            <Page size="LETTER" style={styles.page}>
                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.nameWrapper}>
                        <Text style={styles.name}>{fullName}</Text>
                    </View>
                    <View style={styles.addressWrapper}>
                        <Text style={styles.address}>{address || 'Salem, Tamilnadu , India'}</Text>
                    </View>
                    <View style={styles.contactRow}>
                        <Text style={styles.contactItem}>Phone: +91 {mobile || '8098182153'}</Text>
                        <Text style={styles.contactItem}>Email: {email || 'jaddu738@gmail.com'}</Text>
                        {portfolio && <Text style={styles.contactItem}>Portfolio</Text>}
                        {linkedin && <Text style={styles.contactItem}>LinkedIn</Text>}
                        {github && <Text style={styles.contactItem}>Github</Text>}
                    </View>
                </View>

                {/* Education */}
                {educationItems && educationItems.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Education</Text>
                        {educationItems.map((edu: any, i: number) => (
                            <View key={i} style={{ marginBottom: 6 }}>
                                <View style={styles.subheadingRow}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.boldText}>{edu.collegeName}</Text>
                                    </View>
                                    <View>
                                        <Text style={styles.boldText}>{edu.graduatedYear || ''}</Text>
                                    </View>
                                </View>
                                <View style={styles.subSubheadingRow}>
                                    <Text style={styles.italicText}>{edu.course} {edu.specialization ? `in ${edu.specialization}` : ''} {edu.grade ? `(CGPA of ${edu.grade})` : ''}</Text>
                                </View>
                            </View>
                        ))}
                    </View>
                )}

                {/* Experience */}
                {experienceItems && experienceItems.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Experience</Text>
                        {experienceItems.map((exp: any, i: number) => (
                            <View key={i} style={{ marginBottom: 6 }}>
                                <View style={styles.subheadingRow}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.boldText}>{exp.company}</Text>
                                    </View>
                                    <View>
                                        <Text style={styles.boldText}>{exp.duration || ''}</Text>
                                    </View>
                                </View>
                                <View style={styles.subSubheadingRow}>
                                    <Text style={styles.italicText}>{exp.role}</Text>
                                </View>
                                {exp.description && (
                                    <View style={{ marginTop: 2 }}>
                                        <Text style={styles.itemText}>{exp.description}</Text>
                                    </View>
                                )}
                            </View>
                        ))}
                    </View>
                )}

                {/* Projects */}
                {projectItems && projectItems.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Projects</Text>
                        {projectItems.map((proj: any, i: number) => (
                            <View key={i} style={{ marginBottom: 8 }}>
                                <View style={styles.subheadingRow}>
                                    <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap' }}>
                                        <Text style={styles.boldText}>{proj.title} | </Text>
                                        <Text style={styles.italicText}>{proj.technologies || ''}</Text>
                                        {proj.link && (
                                            <Link src={proj.link} style={{ textDecoration: 'underline', color: '#000', fontSize: 9 }}> (Link)</Link>
                                        )}
                                    </View>
                                    <View>
                                        <Text style={styles.boldText}>{proj.duration || ''}</Text>
                                    </View>
                                </View>
                                <View style={styles.itemList}>
                                    {proj.description && proj.description.split('\n').filter(Boolean).map((line: string, idx: number) => (
                                        <View key={idx} style={styles.item}>
                                            <Text style={styles.bullet}>•</Text>
                                            <Text style={styles.itemText}>{line.trim()}</Text>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        ))}
                    </View>
                )}

                {/* Certifications */}
                {certificateItems && certificateItems.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Certifications</Text>
                        {certificateItems.map((cert: any, i: number) => (
                            <View key={i} style={{ marginBottom: 4 }}>
                                <View style={styles.subheadingRow}>
                                    <View style={{ flex: 1, flexDirection: 'row' }}>
                                        <Text style={styles.boldText}>{cert.name} | </Text>
                                        <Text style={styles.italicText}>{cert.organization}</Text>
                                    </View>
                                    <View>
                                        <Text style={styles.boldText}>{cert.issueDate}</Text>
                                    </View>
                                </View>
                            </View>
                        ))}
                    </View>
                )}

                {/* Courses */}
                {courseItems && courseItems.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Courses</Text>
                        <View style={styles.coursesGrid}>
                            {courseItems.map((course: string, i: number) => (
                                <View key={i} style={styles.courseItem}>
                                    <Text style={styles.itemText}>{course}</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                )}

                {/* Skills */}
                {skillItems && skillItems.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Skills</Text>
                        <View style={styles.coursesGrid}>
                            {skillItems.map((skill: string, i: number) => (
                                <View key={i} style={styles.courseItem}>
                                    <Text style={styles.itemText}>{skill}</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                )}
            </Page>
        </Document>
    );
};
