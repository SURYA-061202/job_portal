# UIDAI certificate for Aadhaar verification

Place UIDAI's public certificate for offline / Secure QR signature verification
in this folder (`.cer`, `.crt` or `.pem`). Download it yourself from
https://uidai.gov.in only; never use a copy from any other site, because
whoever controls this certificate decides which QR codes are accepted.

Until a certificate is here (and `SMS_API_KEY` is set in `functions/.env`),
`startAadhaarKyc` refuses every request.

After adding or replacing it, redeploy:

    firebase deploy --only "functions:startAadhaarKyc,functions:confirmAadhaarKyc"
