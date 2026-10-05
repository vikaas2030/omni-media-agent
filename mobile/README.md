# 📱 Omni Media Agent — Android App (Capacitor)

Omni dashboard का native Android wrapper — server URL डालो, app बन जाता है आपके self-hosted agent का।

## APK कैसे मिलेगा (Android Studio की ज़रूरत नहीं!)
1. GitHub repo → **Actions** tab → **Android APK** workflow
2. हर `mobile/**` push पर अपने आप build होता है (या "Run workflow" से manual)
3. Build पूरा होने पर **Artifacts** में `omni-media-agent-apk` download करो
4. फ़ोन में APK install करो (unknown sources allow करके)

## Local build (optional, अपने machine पर)
```bash
cd mobile
npm install
npx cap sync android
cd android && ./gradlew assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```

## App का इस्तेमाल
1. Install के बाद खोलो → server URL डालो (जहाँ `docker compose up` या `npm start` चल रहा है)
   - LAN: `http://192.168.x.x:3000` (फ़ोन और server एक network पर)
   - Public: `https://your-domain` (PWA install की तरह)
2. Connect → dashboard पूरा app बन जाता है; URL याद रखा जाता है
3. ⚙ button से बाद में server बदल सकते हो

## Play Store (optional आगे के लिए)
- Debug APK सीधे install होता है; Play Store के लिए signed **release AAB** चाहिए
- `./gradlew bundleRelease` + keystore (CI secrets में `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD` जोड़कर automated signing workflow बनाया जा सकता है — बोलो तो बना दूँ)
