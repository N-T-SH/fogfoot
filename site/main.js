// Closed notice. Only the language switch remains.
const NAME = "Greenlit";
const L = {
  en: {},
  kn: {
    eyebrow: "ಯೋಜನೆ ಮುಚ್ಚಲಾಗಿದೆ", h1: "Greenlit ಮುಚ್ಚಲಾಗಿದೆ.",
    lead: "ನಾವು ಮಾಡುತ್ತಿದ್ದದ್ದನ್ನು ಬೇರೆಯವರು ಈಗಾಗಲೇ ನಿರ್ಮಿಸಿದ್ದಾರೆ, ಆದ್ದರಿಂದ Greenlit ಕೆಲಸ ನಿಲ್ಲಿಸಿದ್ದೇವೆ. ಆಸಕ್ತಿ ತೋರಿದ ಎಲ್ಲರಿಗೂ ಧನ್ಯವಾದಗಳು.",
    lead2: "ವೇಟ್‌ಲಿಸ್ಟ್ ಮುಚ್ಚಲಾಗಿದೆ; ಯಾವುದೇ ಇಮೇಲ್ ಕಳುಹಿಸುವುದಿಲ್ಲ.",
    foot: "ಕಲಿಯಲು ಬಯಸುವವರಿಗಾಗಿ ಕೋಡ್ AGPL-3.0 ಪರವಾನಗಿಯಡಿ ಸಾರ್ವಜನಿಕವಾಗಿ ಉಳಿಯುತ್ತದೆ.",
  },
  hi: {
    eyebrow: "प्रोजेक्ट बंद", h1: "Greenlit बंद हो गया है।",
    lead: "हम जो बना रहे थे वह किसी और ने पहले ही बना दिया है, इसलिए हमने Greenlit पर काम रोक दिया है। रुचि दिखाने वाले सभी का धन्यवाद।",
    lead2: "वेटलिस्ट बंद है और कोई ईमेल नहीं भेजा जाएगा।",
    foot: "सीखने के इच्छुक लोगों के लिए कोड AGPL-3.0 लाइसेंस के तहत सार्वजनिक रहेगा।",
  },
};
const en = {};
document.querySelectorAll("[data-t]").forEach((el) => { en[el.dataset.t] = el.innerHTML; });
function apply(l) {
  const lang = L[l] ? l : "en";
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-t]").forEach((el) => { el.innerHTML = L[lang][el.dataset.t] ?? en[el.dataset.t]; });
  document.getElementById("lang").value = lang;
  try { localStorage.setItem("lang", lang); } catch {}
}
let saved = null; try { saved = localStorage.getItem("lang"); } catch {}
const guess = (navigator.language || "en").slice(0, 2);
apply(saved && L[saved] ? saved : L[guess] ? guess : "en");
document.getElementById("lang").addEventListener("change", (e) => apply(e.target.value));
void NAME;
