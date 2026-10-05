FIREBASE BACKUP — recruitment-portal-7b629
Created: 2026-10-03T16:47:57.000Z

CONTENTS
  firestore/<collection>/documents.json    readable JSON: [{id, path, data}]
  firestore/<collection>/documents.raw.json exact Firestore REST payloads
  auth/users.json                          Firebase Auth accounts (password hashes REDACTED)
  auth/auth-export.json                    Firebase Auth accounts, importable, WITH password hashes
  storage/**                               every file in the Storage bucket (resumes, certificates, JDs)
  manifest.json                            counts + SHA-256 of every file + missing/orphan report

RESTORE
  Firestore: each documents.raw.json entry is an exact Firestore REST Document resource —
    replay it with POST https://firestore.googleapis.com/v1/projects/recruitment-portal-7b629/databases/(default)/documents:batchWrite
    (or recreate the readable documents.json entries with the firebase-admin SDK).
    Ask for scripts/restore-firestore.mjs if you want a ready-made restore script.
  Auth: firebase auth:import auth/auth-export.json --project recruitment-portal-7b629
    (restores accounts with existing passwords; users.json is human-readable but has
     password hashes redacted by Google — see manifest.auth.passwordHashesRedacted)
  Storage: gcloud storage rsync --recursive storage/ gs://recruitment-portal-7b629.firebasestorage.app

VERIFY: manifest.ok === true means every referenced file was downloaded with no API failures.