# dietO app (Android, iOS later)

The app holds the dietO web app (plan, tracking, diet test, dietician chat, dietician dashboard) inside a native shell.
It talks to the API on **https://dieto.health**, so the server files must be live first.

Package: `health.dieto.app` · Name: **dietO**

## What's inside
- `www/`: the app's pages (built from the website files with `scripts/build-www.py`)
- `android/`: the Android Studio project (icons, splash screen and notification icon already set)
- `.github/workflows/android.yml`: builds the app on GitHub, so you don't need Android Studio

## 1. Firebase (push notifications), 10 minutes
1. Go to https://console.firebase.google.com → **Add project** → name it `dietO` (Analytics optional).
2. **Add app → Android**, package name `health.dieto.app` → **Register** → download **google-services.json**.
   Put it at `android/app/google-services.json` (or add it as a GitHub secret, see below). Skip the SDK steps; they're done.
3. **Project settings → Service accounts → Generate new private key**. This downloads a JSON file.
   Upload it to your server **outside public_html** (e.g. `/home/youraccount/dieto-fcm.json`) and set
   `'fcm_service_account' => '/home/youraccount/dieto-fcm.json'` in `dieto-config.php`.

## 2. Build the app
**Option A, GitHub (no installs):**
1. Create a private GitHub repo and upload this folder (without `node_modules`).
2. Settings → Secrets → Actions → add `GOOGLE_SERVICES_JSON_B64` = the base64 of google-services.json
   (Mac/Linux: `base64 -i google-services.json`; Windows PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("google-services.json"))`).
3. Actions → **Build Android app** → **Run workflow**. When it finishes, download **dieto-debug-apk** and install it on an Android phone.

**Option B, Android Studio:**
`npm install` → `npx cap sync android` → `npx cap open android` → Run ▶ on your phone.

## 3. Play Store
1. Create the Play Console account ($25 one-time) at https://play.google.com/console.
2. Make an upload keystore once and keep it safe forever (lose it and you need Google support to reset):
   `keytool -genkeypair -v -keystore dieto-upload.jks -alias dieto -keyalg RSA -keysize 2048 -validity 10000`
3. Add GitHub secrets `KEYSTORE_B64` (base64 of the .jks), `KEYSTORE_PASSWORD`, `KEY_ALIAS` (`dieto`), `KEY_PASSWORD`, then run the workflow.
   Upload **dieto-playstore-aab** to Play Console → Testing → Internal testing first.
4. For every new release, raise `versionCode` (and `versionName`) in `android/app/build.gradle`.
5. Play Console forms you'll need: privacy policy URL, Data safety (phone number, health info, chat messages; encrypted in transit; users can request deletion), Health apps declaration, content rating, target audience 18+.
   Payments: dietician chats are paid with Razorpay as one-to-one sessions with registered dietitians. Describe them that way in the listing.

## Updating the app's pages
When the website files change, rebuild `www/` and sync:
```
python3 scripts/build-www.py /path/to/website-files https://dieto.health
npx cap sync android
```
Then build a new version (raise `versionCode`).
