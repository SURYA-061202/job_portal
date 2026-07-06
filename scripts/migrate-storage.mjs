import { initializeApp } from 'firebase/app';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join, relative } from 'path';

const firebaseConfig = {
  apiKey: "AIzaSyDie1gthf0EGD0ok9sbLzoLbVDe42jy_y8",
  authDomain: "recruitment-portal-7b629.firebaseapp.com",
  projectId: "recruitment-portal-7b629",
  storageBucket: "recruitment-portal-7b629.firebasestorage.app",
  messagingSenderId: "46109245906",
  appId: "1:46109245906:web:f618473d43abbe44d3480b",
};

const app = initializeApp(firebaseConfig);
const storage = getStorage(app);

const BACKUP_DIR = 'public/backup/storage_extracted/udtmabrnhxnuvruuidfc';
const BUCKETS = ['resumes', 'jd'];
const CONCURRENCY = 10;
const PROGRESS_FILE = 'scripts/migration-progress.json';

function getAllFiles(dir) {
  const files = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllFiles(fullPath));
    } else if (entry.name !== '.empty') {
      files.push(fullPath);
    }
  }
  return files;
}

function loadProgress() {
  if (existsSync(PROGRESS_FILE)) {
    return JSON.parse(readFileSync(PROGRESS_FILE, 'utf-8'));
  }
  return { uploaded: {}, urlMap: {} };
}

function saveProgress(progress) {
  writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function uploadFile(filePath) {
  const relativePath = relative(BACKUP_DIR, filePath).replace(/\\/g, '/');
  const fileBuffer = readFileSync(filePath);
  const storageRef = ref(storage, relativePath);
  await uploadBytes(storageRef, fileBuffer);
  const url = await getDownloadURL(storageRef);
  return { path: relativePath, url };
}

async function migrate() {
  const progress = loadProgress();
  let totalFiles = 0;
  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  const urlMap = { ...progress.urlMap };

  for (const bucket of BUCKETS) {
    const bucketDir = join(BACKUP_DIR, bucket);
    const files = getAllFiles(bucketDir);
    totalFiles += files.length;

    const remaining = files.filter(f => {
      const relPath = relative(BACKUP_DIR, f).replace(/\\/g, '/');
      return !progress.uploaded[relPath];
    });

    console.log(`\n📦 Bucket "${bucket}": ${files.length} total, ${remaining.length} remaining`);

    for (let i = 0; i < remaining.length; i += CONCURRENCY) {
      const batch = remaining.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(batch.map(file => uploadFile(file)));
      
      for (let j = 0; j < results.length; j++) {
        uploaded++;
        if (results[j].status === 'fulfilled') {
          const relPath = relative(BACKUP_DIR, batch[j]).replace(/\\/g, '/');
          progress.uploaded[relPath] = true;
          urlMap[relPath] = results[j].value.url;
          console.log(`  ✅ [${uploaded + skipped}/${totalFiles}] ${relPath}`);
        } else {
          failed++;
          console.error(`  ❌ FAILED: ${batch[j]} - ${results[j].reason?.message}`);
        }
      }
      // Save progress after each batch
      saveProgress({ uploaded: progress.uploaded, urlMap });
    }

    skipped += files.length - remaining.length;
  }

  console.log(`\n🎉 Migration complete!`);
  console.log(`   Total: ${totalFiles}`);
  console.log(`   Uploaded: ${uploaded}`);
  console.log(`   Skipped (already done): ${skipped}`);
  console.log(`   Failed: ${failed}`);

  writeFileSync('scripts/storage-urls.json', JSON.stringify(urlMap, null, 2));
  console.log(`\n📄 URL mapping saved to scripts/storage-urls.json`);
}

migrate().catch(console.error);
