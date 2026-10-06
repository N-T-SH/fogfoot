// Small string table for the account screens. English is the source; Kannada and Hindi fall back to English
// for any string not yet translated. Translations here are a first pass and should be checked by a native speaker.
export type Lang = "en" | "kn" | "hi";
export const LANGS: { code: Lang; label: string }[] = [{ code: "en", label: "English" }, { code: "kn", label: "ಕನ್ನಡ" }, { code: "hi", label: "हिन्दी" }];

const en = {
  account: "Account", signIn: "Sign in with Google", signOut: "Sign out", signedInAs: "Signed in as", noHandle: "no name yet",
  signInWhy: "Sign in to share your walks with other people. You can use the map and play without signing in.",
  notEnabled: "Sign-in is not switched on yet. Your walks stay on this phone.",
  pickHandle: "Pick a name others will see", handleHelp: "3 to 20 letters, digits or _ . Not your real name.", save: "Save", taken: "That name is taken.",
  noticeTitle: "Before you share", accept: "I understand and agree", withdraw: "Withdraw my agreement", withdrawn: "You will no longer share coverage until you agree again.",
  notice: [
    "fogfoot maps which footpaths are usable, using walks by people like you. It is free and not for profit.",
    "What we keep about you: a scrambled id made from your Google account (we do not keep your e-mail, name or Google id), the name you pick, the day you agreed, and how many dots you shared today.",
    "What we keep about walks: only which 5 m stretches were covered and on which day. It is not linked to you, and we never store the time of day or your route.",
    "Photos you take are saved on this phone only. Nothing is uploaded today. If we add uploads later, we will ask you again, blur faces and number plates first, and say where they go.",
    "Your data is held on Vercel's servers and sign-in is by Google, both of which may be outside India.",
    "You must be 18 or older to use fogfoot.",
    "You can see your data, change your name, withdraw this agreement or delete your account at any time, here, in one tap. Use Report to reach the maintainer about any photo, item or street.",
  ],
  yourData: "Your data", download: "Download my data", deleteAccount: "Delete my account", confirmDelete: "Delete your account and name? This cannot be undone. Coverage you shared was never linked to you and stays on the map.",
  report: "Report a problem", reportWhat: "What is it about? (a photo, an item, a street, privacy)", reportSend: "Send report", reportThanks: "Thanks, the maintainer will look at it.",
  language: "Language", close: "Close", working: "Working…", error: "Something went wrong. Try again.",
  signInToShare: "Sign in to share", offlineNote: "Saved on this phone", shared: "Shared with other walkers",
};
type Key = keyof typeof en;

const kn: Partial<Record<Key, string | string[]>> = {
  account: "ಖಾತೆ", signIn: "Google ನಿಂದ ಸೈನ್ ಇನ್", signOut: "ಸೈನ್ ಔಟ್", signedInAs: "ಸೈನ್ ಇನ್ ಆಗಿರುವವರು", noHandle: "ಇನ್ನೂ ಹೆಸರಿಲ್ಲ",
  signInWhy: "ನಿಮ್ಮ ನಡಿಗೆಗಳನ್ನು ಇತರರೊಂದಿಗೆ ಹಂಚಿಕೊಳ್ಳಲು ಸೈನ್ ಇನ್ ಮಾಡಿ. ಸೈನ್ ಇನ್ ಇಲ್ಲದೆಯೂ ನಕ್ಷೆ ನೋಡಬಹುದು, ಆಡಬಹುದು.",
  notEnabled: "ಸೈನ್ ಇನ್ ಇನ್ನೂ ಆರಂಭವಾಗಿಲ್ಲ. ನಿಮ್ಮ ನಡಿಗೆಗಳು ಈ ಫೋನ್‌ನಲ್ಲೇ ಇರುತ್ತವೆ.",
  pickHandle: "ಇತರರಿಗೆ ಕಾಣುವ ಹೆಸರನ್ನು ಆರಿಸಿ", handleHelp: "3 ರಿಂದ 20 ಅಕ್ಷರ, ಅಂಕೆ ಅಥವಾ _ . ನಿಮ್ಮ ನಿಜವಾದ ಹೆಸರು ಬೇಡ.", save: "ಉಳಿಸಿ", taken: "ಆ ಹೆಸರು ಬಳಕೆಯಲ್ಲಿದೆ.",
  noticeTitle: "ಹಂಚಿಕೊಳ್ಳುವ ಮೊದಲು", accept: "ನನಗೆ ಅರ್ಥವಾಗಿದೆ, ಒಪ್ಪುತ್ತೇನೆ", withdraw: "ನನ್ನ ಒಪ್ಪಿಗೆ ಹಿಂಪಡೆಯಿರಿ", withdrawn: "ನೀವು ಮತ್ತೆ ಒಪ್ಪುವವರೆಗೆ ನಿಮ್ಮ ನಡಿಗೆ ಹಂಚಿಕೆಯಾಗುವುದಿಲ್ಲ.",
  notice: [
    "fogfoot ನಿಮ್ಮಂತಹ ಜನರ ನಡಿಗೆಗಳನ್ನು ಬಳಸಿ ಯಾವ ಪಾದಚಾರಿ ಮಾರ್ಗಗಳು ಬಳಸಲು ಯೋಗ್ಯ ಎಂದು ನಕ್ಷೆ ಮಾಡುತ್ತದೆ. ಇದು ಉಚಿತ, ಲಾಭದ ಉದ್ದೇಶವಿಲ್ಲ.",
    "ನಿಮ್ಮ ಬಗ್ಗೆ ನಾವು ಇಟ್ಟುಕೊಳ್ಳುವುದು: ನಿಮ್ಮ Google ಖಾತೆಯಿಂದ ಮಾಡಿದ ಗೂಢ ಐಡಿ (ಇಮೇಲ್, ಹೆಸರು ಅಥವಾ Google ಐಡಿ ಅಲ್ಲ), ನೀವು ಆರಿಸಿದ ಹೆಸರು, ಒಪ್ಪಿದ ದಿನ, ಮತ್ತು ಇಂದು ಹಂಚಿದ ಚುಕ್ಕಿಗಳ ಸಂಖ್ಯೆ.",
    "ನಡಿಗೆಗಳ ಬಗ್ಗೆ: ಯಾವ 5 ಮೀ ಭಾಗಗಳು ಯಾವ ದಿನ ಪೂರ್ಣಗೊಂಡವು ಎಂಬುದು ಮಾತ್ರ. ಅದು ನಿಮ್ಮೊಂದಿಗೆ ಜೋಡಿಸಲ್ಪಟ್ಟಿಲ್ಲ; ಸಮಯ ಅಥವಾ ನಿಮ್ಮ ಮಾರ್ಗವನ್ನು ನಾವು ಉಳಿಸುವುದಿಲ್ಲ.",
    "ನೀವು ತೆಗೆದ ಫೋಟೋಗಳು ಈ ಫೋನ್‌ನಲ್ಲೇ ಇರುತ್ತವೆ. ಇಂದು ಏನನ್ನೂ ಅಪ್‌ಲೋಡ್ ಮಾಡುವುದಿಲ್ಲ. ಮುಂದೆ ಅಪ್‌ಲೋಡ್ ಸೇರಿಸಿದರೆ ಮತ್ತೆ ಕೇಳುತ್ತೇವೆ, ಮುಖ ಮತ್ತು ನಂಬರ್ ಪ್ಲೇಟ್ ಮಸುಕಾಗಿಸುತ್ತೇವೆ.",
    "ನಿಮ್ಮ ಡೇಟಾ Vercel ಸರ್ವರ್‌ಗಳಲ್ಲಿದೆ, ಸೈನ್ ಇನ್ Google ಮೂಲಕ; ಇವು ಭಾರತದ ಹೊರಗೂ ಇರಬಹುದು.",
    "fogfoot ಬಳಸಲು ನಿಮಗೆ 18 ವರ್ಷ ಅಥವಾ ಹೆಚ್ಚು ಆಗಿರಬೇಕು.",
    "ನಿಮ್ಮ ಡೇಟಾ ನೋಡಲು, ಹೆಸರು ಬದಲಿಸಲು, ಒಪ್ಪಿಗೆ ಹಿಂಪಡೆಯಲು ಅಥವಾ ಖಾತೆ ಅಳಿಸಲು ಯಾವಾಗ ಬೇಕಾದರೂ ಇಲ್ಲೇ ಒಂದು ಟ್ಯಾಪ್‌ನಲ್ಲಿ ಸಾಧ್ಯ.",
  ],
  yourData: "ನಿಮ್ಮ ಡೇಟಾ", download: "ನನ್ನ ಡೇಟಾ ಡೌನ್‌ಲೋಡ್", deleteAccount: "ನನ್ನ ಖಾತೆ ಅಳಿಸಿ", report: "ಸಮಸ್ಯೆ ವರದಿ ಮಾಡಿ", reportSend: "ವರದಿ ಕಳುಹಿಸಿ", reportThanks: "ಧನ್ಯವಾದಗಳು.",
  language: "ಭಾಷೆ", close: "ಮುಚ್ಚಿ", working: "ನಡೆಯುತ್ತಿದೆ…", error: "ಏನೋ ತಪ್ಪಾಯಿತು. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
  signInToShare: "ಹಂಚಲು ಸೈನ್ ಇನ್ ಮಾಡಿ", offlineNote: "ಈ ಫೋನ್‌ನಲ್ಲಿ ಉಳಿಸಲಾಗಿದೆ", shared: "ಇತರ ನಡಿಗೆಗಾರರೊಂದಿಗೆ ಹಂಚಲಾಗಿದೆ",
};

const hi: Partial<Record<Key, string | string[]>> = {
  account: "खाता", signIn: "Google से साइन इन करें", signOut: "साइन आउट", signedInAs: "साइन इन है", noHandle: "अभी नाम नहीं",
  signInWhy: "अपनी सैर दूसरों के साथ साझा करने के लिए साइन इन करें। बिना साइन इन के भी नक्शा देख और खेल सकते हैं।",
  notEnabled: "साइन इन अभी चालू नहीं है। आपकी सैर इसी फ़ोन में रहती है।",
  pickHandle: "ऐसा नाम चुनें जो दूसरों को दिखे", handleHelp: "3 से 20 अक्षर, अंक या _ । अपना असली नाम न रखें।", save: "सहेजें", taken: "यह नाम पहले से लिया हुआ है।",
  noticeTitle: "साझा करने से पहले", accept: "मैं समझता/समझती हूँ और सहमत हूँ", withdraw: "मेरी सहमति वापस लें", withdrawn: "जब तक आप फिर सहमत नहीं होते, आपकी सैर साझा नहीं होगी।",
  notice: [
    "fogfoot आप जैसे लोगों की सैर से यह नक्शा बनाता है कि कौन से फुटपाथ इस्तेमाल लायक हैं। यह मुफ़्त है और लाभ के लिए नहीं।",
    "आपके बारे में हम रखते हैं: आपके Google खाते से बनी एक गुप्त आईडी (ईमेल, नाम या Google आईडी नहीं), आपका चुना नाम, सहमति का दिन, और आज साझा किए गए बिंदुओं की संख्या।",
    "सैर के बारे में: सिर्फ़ यह कि कौन से 5 मीटर के हिस्से किस दिन पूरे हुए। यह आपसे जुड़ा नहीं है; हम समय या आपका रास्ता नहीं रखते।",
    "आपकी खींची तस्वीरें सिर्फ़ इसी फ़ोन में रहती हैं। आज कुछ अपलोड नहीं होता। आगे अपलोड जोड़ा तो फिर पूछेंगे और चेहरे व नंबर प्लेट धुंधले करेंगे।",
    "आपका डेटा Vercel के सर्वरों पर है और साइन इन Google से होता है; दोनों भारत के बाहर भी हो सकते हैं।",
    "fogfoot इस्तेमाल करने के लिए आपकी उम्र 18 वर्ष या अधिक होनी चाहिए।",
    "अपना डेटा देखना, नाम बदलना, सहमति वापस लेना या खाता हटाना कभी भी यहीं एक टैप में हो सकता है।",
  ],
  yourData: "आपका डेटा", download: "मेरा डेटा डाउनलोड करें", deleteAccount: "मेरा खाता हटाएँ", report: "समस्या बताएँ", reportSend: "रिपोर्ट भेजें", reportThanks: "धन्यवाद।",
  language: "भाषा", close: "बंद करें", working: "हो रहा है…", error: "कुछ गड़बड़ हुई। फिर कोशिश करें।",
  signInToShare: "साझा करने के लिए साइन इन करें", offlineNote: "इस फ़ोन में सहेजा गया", shared: "दूसरे वॉकरों के साथ साझा",
};

const tables = { en, kn, hi } as const;
const KEY = "fogfoot-lang";
export function detectLang(): Lang {
  try { const s = localStorage.getItem(KEY) as Lang | null; if (s && s in tables) return s; } catch { /* storage blocked */ }
  const n = (navigator.language || "en").slice(0, 2).toLowerCase();
  return n === "kn" || n === "hi" ? n : "en";
}
export function setLang(l: Lang) { try { localStorage.setItem(KEY, l); } catch { /* storage blocked */ } }

export function t<K extends Key>(lang: Lang, k: K): (typeof en)[K] {
  return ((tables[lang] as Record<string, unknown>)[k] ?? en[k]) as (typeof en)[K];
}
