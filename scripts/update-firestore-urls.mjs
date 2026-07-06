import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc, query, where, or } from 'firebase/firestore';
import { readFileSync } from 'fs';

const firebaseConfig = {
  apiKey: "AIzaSyDie1gthf0EGD0ok9sbLzoLbVDe42jy_y8",
  authDomain: "recruitment-portal-7b629.firebaseapp.com",
  projectId: "recruitment-portal-7b629",
  storageBucket: "recruitment-portal-7b629.firebasestorage.app",
  messagingSenderId: "46109245906",
  appId: "1:46109245906:web:f618473d43abbe44d3480b",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const SUPABASE_BASE = 'https://udtmabrnhxnuvruuidfc.supabase.co/storage/v1/object/public/';
const urlMap = JSON.parse(readFileSync('scripts/storage-urls.json', 'utf-8'));

// Build reverse map: old Supabase URL -> new Firebase URL
function buildReverseMap() {
  const reverseMap = {};
  
  for (const [path, firebaseUrl] of Object.entries(urlMap)) {
    // Old Supabase URL pattern: .../resumes/filename.pdf or .../jd/filename.pdf
    const supabaseUrl = SUPABASE_BASE + path;
    reverseMap[supabaseUrl] = firebaseUrl;
  }
  
  return reverseMap;
}

function convertUrl(oldUrl, reverseMap) {
  if (!oldUrl || !oldUrl.includes('supabase.co')) return null;
  
  // Try exact match first
  if (reverseMap[oldUrl]) return reverseMap[oldUrl];
  
  // Try to extract path and match
  const supabasePrefix = 'https://udtmabrnhxnuvruuidfc.supabase.co/storage/v1/object/public/';
  if (oldUrl.startsWith(supabasePrefix)) {
    const path = oldUrl.substring(supabasePrefix.length).split('?')[0];
    if (urlMap[path]) return urlMap[path];
  }
  
  return null;
}

async function updateCollection(collectionName, urlFields) {
  console.log(`\n📁 Processing collection: ${collectionName}`);
  const reverseMap = buildReverseMap();
  
  const snapshot = await getDocs(collection(db, collectionName));
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  
  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    const updates = {};
    let needsUpdate = false;
    
    for (const field of urlFields) {
      const oldValue = data[field];
      if (oldValue && typeof oldValue === 'string' && oldValue.includes('supabase.co')) {
        const newValue = convertUrl(oldValue, reverseMap);
        if (newValue) {
          updates[field] = newValue;
          needsUpdate = true;
        } else {
          console.log(`  ⚠️  No mapping found for: ${oldValue}`);
        }
      }
    }
    
    // Also check certificateItems array
    if (data.certificateItems && Array.isArray(data.certificateItems)) {
      const updatedCerts = data.certificateItems.map((cert) => {
        if (cert.url && typeof cert.url === 'string' && cert.url.includes('supabase.co')) {
          const newUrl = convertUrl(cert.url, reverseMap);
          if (newUrl) {
            needsUpdate = true;
            return { ...cert, url: newUrl };
          }
        }
        return cert;
      });
      if (JSON.stringify(updatedCerts) !== JSON.stringify(data.certificateItems)) {
        updates.certificateItems = updatedCerts;
      }
    }
    
    if (needsUpdate) {
      try {
        await updateDoc(doc(db, collectionName, docSnap.id), updates);
        updated++;
        console.log(`  ✅ Updated: ${docSnap.id}`);
      } catch (err) {
        failed++;
        console.error(`  ❌ Failed: ${docSnap.id} - ${err.message}`);
      }
    } else {
      skipped++;
    }
  }
  
  console.log(`  📊 Results: ${updated} updated, ${skipped} skipped, ${failed} failed`);
  return { updated, skipped, failed };
}

async function migrate() {
  console.log('🔄 Starting Firestore URL migration...');
  console.log(`   URL map has ${Object.keys(urlMap).length} entries`);
  
  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalFailed = 0;
  
  // Update users collection (resumeUrl)
  const users = await updateCollection('users', ['resumeUrl']);
  totalUpdated += users.updated;
  totalSkipped += users.skipped;
  totalFailed += users.failed;
  
  // Update candidates collection (resumeUrl)
  const candidates = await updateCollection('candidates', ['resumeUrl']);
  totalUpdated += candidates.updated;
  totalSkipped += candidates.skipped;
  totalFailed += candidates.failed;
  
  // Update recruits collection (jdUrl)
  const recruits = await updateCollection('recruits', ['jdUrl']);
  totalUpdated += recruits.updated;
  totalSkipped += recruits.skipped;
  totalFailed += recruits.failed;
  
  console.log('\n🎉 Migration complete!');
  console.log(`   Total updated: ${totalUpdated}`);
  console.log(`   Total skipped: ${totalSkipped}`);
  console.log(`   Total failed: ${totalFailed}`);
}

migrate().catch(console.error);
