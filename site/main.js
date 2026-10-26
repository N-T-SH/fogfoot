// Landing page behaviour. Change NAME here when the app is renamed; every visible name is filled from it.
const NAME = "fogfoot";
const API = "https://fogfoot.vercel.app/api/waitlist";   // the Vercel function that stores the list (CORS allows only our own sites)

const L = {
  en: {},   // English is the text already in the HTML
  kn: {
    h1: "ಯಾವ ಪಾದಚಾರಿ ಮಾರ್ಗಗಳಲ್ಲಿ ನಿಜವಾಗಿ ನಡೆಯಬಹುದು?",
    lead: "{N} ಬೆಂಗಳೂರಿನ ಪಾದಚಾರಿ ಮಾರ್ಗಗಳ ಉಚಿತ, ಸಮುದಾಯ ನಕ್ಷೆ. ಕ್ಯಾಮೆರಾ ಆನ್ ಮಾಡಿಕೊಂಡು ಸುಮ್ಮನೆ ನಡೆಯಿರಿ. ಸಮಸ್ಯೆಗಳನ್ನು ಅದು ತಾನಾಗಿ ಗುರುತಿಸುತ್ತದೆ, ನೀವು ನಡೆದ ಪ್ರತಿ ರಸ್ತೆ ಕಿತ್ತಳೆಯಿಂದ ಹಸಿರಾಗುತ್ತದೆ.",
    try: "ಆರಂಭಿಕ ಮಾದರಿಯನ್ನು ಪ್ರಯತ್ನಿಸಿ (ಡೊಮ್ಲೂರು, ಕೋರಮಂಗಲ)",
    status: "<b>ಇಂದು:</b> ನಡಿಗೆಯ ಆಟ ಮತ್ತು ನಿಮ್ಮ ಫೋನ್‌ನಲ್ಲಿ ಫೋಟೋ ಸೆರೆ. <b>ಮುಂದೆ:</b> ಮುಖ ಮತ್ತು ನಂಬರ್ ಪ್ಲೇಟ್ ಮಸುಕಾಗಿಸಿದ ನಂತರ ಸಮಸ್ಯೆಗಳ ಸ್ವಯಂಚಾಲಿತ ಗುರುತಿಸುವಿಕೆ.",
    howH: "ಹೇಗೆ ಕೆಲಸ ಮಾಡುತ್ತದೆ", s1h: "ಸುಮ್ಮನೆ ನಡೆಯಿರಿ", s1: "ಆ್ಯಪ್ ತೆರೆದು ನಡಿಗೆ ಆರಂಭಿಸಿ, ಕ್ಯಾಮೆರಾ ಆನ್ ಇರಲಿ. ಫಾರ್ಮ್ ಇಲ್ಲ, ಟೈಪಿಂಗ್ ಇಲ್ಲ, ಫೋಟೋ ಆರಿಸಬೇಕಿಲ್ಲ. ಕ್ಯಾಮೆರಾ ನೋಟ ಮುಂದಿನ ರಸ್ತೆಯನ್ನು ಕಣ್ಣಿಗೆ ಕಾಣುವಂತೆ ಇಡುತ್ತದೆ.",
    s2h: "ಸಮಸ್ಯೆಗಳನ್ನು ಅದೇ ಗುರುತಿಸುತ್ತದೆ", s2: "ನೀವು ಹೋಗುತ್ತಿದ್ದಂತೆ ಪಾದಚಾರಿ ಮಾರ್ಗವನ್ನು ಪರಿಶೀಲಿಸಿ, ಸಮಸ್ಯೆಗಳನ್ನು ಆ ನಿರ್ದಿಷ್ಟ ಭಾಗಕ್ಕೆ ತಾನಾಗಿ ಗುರುತಿಸುತ್ತದೆ: ನಿಲ್ಲಿಸಿದ ವಾಹನಗಳು, ಅಂಗಡಿಗಳ ಅತಿಕ್ರಮಣ, ಮುರಿದ ಅಥವಾ ಎತ್ತರತಗ್ಗಿನ ಚಪ್ಪಡಿಗಳು, ತೆರೆದ ಚರಂಡಿ, ಕಸ, ಜೋತಾಡುವ ತಂತಿಗಳು, ಪಾದಚಾರಿ ಮಾರ್ಗವೇ ಇಲ್ಲದಿರುವುದು.",
    soon: "ಶೀಘ್ರದಲ್ಲಿ", today: "ಇಂದೇ ಲಭ್ಯ",
    s3h: "ಆಡಿ", s3: "ನೀವು ನಡೆಯುವ ಪ್ರತಿ 10 ಮೀ ಎಲ್ಲರೊಂದಿಗೆ ಹಂಚಿದ ನಕ್ಷೆಯಲ್ಲಿ ಕಿತ್ತಳೆಯಿಂದ ಹಸಿರಾಗುತ್ತದೆ, ನಿಮ್ಮ ಮೀಟರ್‌ಗಳು ಕೂಡುತ್ತವೆ. ನಿಮ್ಮ ವಾರ್ಡ್ ಆವರಿಸಿ, ತಿಂಗಳುದ್ದಕ್ಕೂ ಹಸಿರಾಗಿ ಇಡಿ, ನಿಮ್ಮ ಬಡಾವಣೆ ಹೇಗಿದೆ ನೋಡಿ. ಅಂಕಗಳು, ಸತತ ದಿನಗಳು ಮತ್ತು ವಾರ್ಡ್ ಶ್ರೇಣಿ ಬರಲಿವೆ.",
    s4h: "ನಕ್ಷೆ", s4: "ಡೊಮ್ಲೂರು ಮತ್ತು ಕೋರಮಂಗಲದಿಂದ ಆರಂಭಿಸಿ, ಯಾವ ಮಾರ್ಗಗಳು ಬಳಸಲು ಯೋಗ್ಯ, ಸ್ವಚ್ಛ ಎಂಬ ಸಾರ್ವಜನಿಕ, ಇತ್ತೀಚಿನ ಚಿತ್ರವನ್ನು ಒಟ್ಟಾಗಿ ರೂಪಿಸುತ್ತೇವೆ.",
    whyH: "ಏಕೆ", why: "2026ರ ಜೂನ್‌ನಲ್ಲಿ ಭಾರತದ ಸರ್ವೋಚ್ಚ ನ್ಯಾಯಾಲಯ ಪಾದಚಾರಿ ಮಾರ್ಗದಲ್ಲಿ ನಡೆಯುವ ಹಕ್ಕನ್ನು ಮೂಲಭೂತ ಹಕ್ಕುಗಳ ಭಾಗವೆಂದು ಗುರುತಿಸಿತು. ನೆಲದ ಮೇಲೆ ಅದು ಹೇಗಿದೆ ಎಂದು ನಮಗೆ ಗೊತ್ತು, ಆದರೆ ಅದರ ಹಂಚಿಕೆಯ, ಇತ್ತೀಚಿನ ಚಿತ್ರ ಇಲ್ಲ.",
    whyLink: "ತೀರ್ಪಿನ ಸಾರಾಂಶ ಓದಿ (CPR)",
    princH: "ನಮ್ಮ ಭರವಸೆ", p1: "ಉಚಿತ, ಲಾಭದ ಉದ್ದೇಶವಿಲ್ಲ. ಜಾಹೀರಾತಿಲ್ಲ, ಡೇಟಾ ಮಾರಾಟವಿಲ್ಲ.", p2: "ಮುಕ್ತ ಮೂಲ (AGPL-3.0); ಯಾರು ಬೇಕಾದರೂ ಪರಿಶೀಲಿಸಬಹುದು.",
    p3: "ಗೋಪ್ಯತೆ ಮೊದಲು: ಫೋಟೋಗಳು ನಿಮ್ಮ ಫೋನ್‌ನಲ್ಲೇ ಇರುತ್ತವೆ; ಹಂಚಿದ ನಡಿಗೆಗಳಲ್ಲಿ ಯಾವ ಭಾಗ ಮತ್ತು ಯಾವ ದಿನ ಎಂಬುದು ಮಾತ್ರ ದಾಖಲಾಗುತ್ತದೆ.", p4: "ಸಾಮಾನ್ಯ ಫೋನ್‌ಗಳಿಗಾಗಿ, ಕಡಿಮೆ ಬೆಲೆಯ Android ಮತ್ತು iPhone ಸೇರಿ. ಆ್ಯಪ್ ಸ್ಟೋರ್ ಬೇಡ.",
    joinH: "ವೇಟ್‌ಲಿಸ್ಟ್‌ಗೆ ಸೇರಿ", email: "ನಿಮ್ಮ ಇಮೇಲ್", area: "ನೀವು ಹೆಚ್ಚಾಗಿ ಎಲ್ಲಿ ನಡೆಯುತ್ತೀರಿ?", aPick: "ಆರಿಸಿ (ಐಚ್ಛಿಕ)", aOther: "ಬೆಂಗಳೂರಿನ ಬೇರೆ ಕಡೆ", aOut: "ಬೆಂಗಳೂರಿನ ಹೊರಗೆ",
    agree: "ಇದು ನನ್ನ ಪ್ರದೇಶದಲ್ಲಿ ಆರಂಭವಾದಾಗ ನನಗೆ ಇಮೇಲ್ ಮಾಡಿ. ನನ್ನ ಇಮೇಲ್ ಅನ್ನು ಅದಕ್ಕಾಗಿ ಮಾತ್ರ ಇಟ್ಟುಕೊಳ್ಳುತ್ತೀರಿ, ಹಂಚುವುದಿಲ್ಲ, ಮತ್ತು ಈ ಪುಟದಲ್ಲಿ ಯಾವಾಗ ಬೇಕಾದರೂ ತೆಗೆಯಬಹುದು ಎಂದು ನನಗೆ ಅರ್ಥವಾಗಿದೆ.",
    send: "ವೇಟ್‌ಲಿಸ್ಟ್‌ಗೆ ಸೇರಿ",
    foot: "ಬೆಂಗಳೂರಿನಲ್ಲಿ ಮಾಡಿದ್ದು. ನಿಮ್ಮ ಇಮೇಲ್, ಆರಿಸಿದ ಪ್ರದೇಶ, ಭಾಷೆ ಮತ್ತು ಸೇರಿದ ದಿನವನ್ನು ಮಾತ್ರ ಇಟ್ಟುಕೊಳ್ಳುತ್ತೇವೆ. IP ವಿಳಾಸ, ಟ್ರ್ಯಾಕಿಂಗ್, ಕುಕೀಗಳಿಲ್ಲ.",
    rmH: "ನನ್ನ ಇಮೇಲ್ ತೆಗೆದುಹಾಕಿ", rmGo: "ತೆಗೆಯಿರಿ",
    okJoin: "ಧನ್ಯವಾದಗಳು! ಆರಂಭವಾದಾಗ ತಿಳಿಸುತ್ತೇವೆ.", okRm: "ಮುಗಿಯಿತು. ಇಮೇಲ್ ಪಟ್ಟಿಯಲ್ಲಿದ್ದರೆ ತೆಗೆದಿದ್ದೇವೆ.", badEmail: "ಇಮೇಲ್ ಸರಿಯಿಲ್ಲ.", needBox: "ದಯವಿಟ್ಟು ಪೆಟ್ಟಿಗೆಯನ್ನು ಟಿಕ್ ಮಾಡಿ.", fail: "ಈಗ ಉಳಿಸಲಾಗಲಿಲ್ಲ. ಸ್ವಲ್ಪ ಸಮಯದ ನಂತರ ಪ್ರಯತ್ನಿಸಿ.", busy: "ಕಳುಹಿಸಲಾಗುತ್ತಿದೆ…",
  },
  hi: {
    h1: "आप किन फुटपाथों पर सच में चल सकते हैं?",
    lead: "{N} बेंगलुरु के फुटपाथों का मुफ़्त, समुदाय का नक्शा है। कैमरा चालू रखकर बस चलिए। समस्याएँ अपने आप टैग हो जाती हैं, और आप जो भी सड़क पूरी करते हैं वह नारंगी से हरी हो जाती है।",
    try: "शुरुआती प्रोटोटाइप आज़माएँ (डोमलूर, कोरमंगला)",
    status: "<b>आज:</b> चलने का खेल और आपके फ़ोन में फ़ोटो कैप्चर। <b>आगे:</b> चेहरे और नंबर प्लेट धुंधले हो सकने के बाद समस्याओं का स्वचालित टैग।",
    howH: "यह कैसे काम करता है", s1h: "बस चलिए", s1: "ऐप खोलकर सैर शुरू कीजिए और कैमरा चालू रखिए। न फ़ॉर्म, न टाइपिंग, न तस्वीरें चुनना। कैमरा व्यू सामने की सड़क आपकी नज़र में भी रखता है।",
    s2h: "समस्याएँ अपने आप टैग", s2: "जैसे-जैसे आप चलते हैं, फुटपाथ जाँचा जाता है और समस्याएँ उसी हिस्से पर अपने आप टैग हो जाती हैं: खड़े वाहन, दुकानों का कब्ज़ा, टूटी या ऊँची-नीची स्लैब, खुली नालियाँ, कचरा, लटकते तार, फुटपाथ का न होना।",
    soon: "जल्द आ रहा है", today: "आज उपलब्ध",
    s3h: "खेलिए", s3: "आप जो हर 10 मीटर चलते हैं वह सबके साझा नक्शे पर नारंगी से हरा हो जाता है और आपके मीटर जुड़ते जाते हैं। अपना वार्ड पूरा कीजिए, महीने भर उसे हरा रखिए, और देखिए आपका मोहल्ला कैसा है। अंक, लगातार दिन और वार्ड की रैंकिंग आने वाली हैं।",
    s4h: "नक्शा", s4: "डोमलूर और कोरमंगला से शुरू करके हम मिलकर बनाते हैं कि कौन से फुटपाथ इस्तेमाल लायक और साफ़ हैं, सार्वजनिक और ताज़ा तस्वीर के रूप में।",
    whyH: "क्यों", why: "जून 2026 में भारत के सर्वोच्च न्यायालय ने फुटपाथ पर चलने के अधिकार को मौलिक अधिकारों का हिस्सा माना। ज़मीन पर हालत हम जानते हैं, पर उसकी साझा, ताज़ा तस्वीर नहीं है।",
    whyLink: "फ़ैसले का सार पढ़ें (CPR)",
    princH: "हमारा वादा", p1: "मुफ़्त और गैर-लाभकारी। कोई विज्ञापन नहीं, डेटा की बिक्री नहीं।", p2: "ओपन सोर्स (AGPL-3.0), ताकि कोई भी जाँच सके।",
    p3: "निजता पहले: तस्वीरें आपके फ़ोन में ही रहती हैं; साझा सैर में सिर्फ़ यह दर्ज होता है कि कौन सा हिस्सा किस दिन तय हुआ।", p4: "आम फ़ोन के लिए, कम कीमत वाले Android और iPhone समेत। ऐप स्टोर की ज़रूरत नहीं।",
    joinH: "वेटलिस्ट में जुड़ें", email: "आपका ईमेल", area: "आप ज़्यादातर कहाँ चलते हैं?", aPick: "चुनें (वैकल्पिक)", aOther: "बेंगलुरु में कहीं और", aOut: "बेंगलुरु के बाहर",
    agree: "जब यह मेरे इलाके में शुरू हो तो मुझे ईमेल करें। मैं समझता/समझती हूँ कि मेरा ईमेल सिर्फ़ इसी के लिए रखा जाएगा, साझा नहीं होगा, और मैं इसे इसी पेज पर कभी भी हटा सकता/सकती हूँ।",
    send: "वेटलिस्ट में जुड़ें",
    foot: "बेंगलुरु में बनाया गया। हम आपका ईमेल, चुना इलाका, भाषा और जुड़ने का दिन ही रखते हैं। IP पता, ट्रैकिंग या कुकीज़ नहीं।",
    rmH: "मेरा ईमेल हटाएँ", rmGo: "हटाएँ",
    okJoin: "धन्यवाद! शुरू होने पर बताएँगे।", okRm: "हो गया। ईमेल सूची में था तो हटा दिया।", badEmail: "ईमेल सही नहीं लगता।", needBox: "कृपया बॉक्स पर टिक करें।", fail: "अभी सहेज नहीं सके। थोड़ी देर बाद कोशिश करें।", busy: "भेज रहे हैं…",
  },
};
const EN_MSG = { okJoin: "Thanks! We'll e-mail you when it opens.", okRm: "Done. If that e-mail was on the list, it is gone.", badEmail: "That e-mail does not look right.", needBox: "Please tick the box so we know you agree.", fail: "Could not save right now. Please try again in a bit.", busy: "Sending…" };

const $ = (s) => document.querySelector(s);
const en = {};
document.querySelectorAll("[data-t]").forEach((el) => { en[el.dataset.t] = el.innerHTML; });   // remember the English once
let lang = "en";
const msgs = () => ({ ...EN_MSG, ...(L[lang] || {}) });
const nameIn = (s) => s.replaceAll("{N}", `<span class="nm">${NAME}</span>`);

function apply(l) {
  lang = L[l] ? l : "en";
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-t]").forEach((el) => { const k = el.dataset.t; el.innerHTML = nameIn(L[lang][k] ?? en[k]); });
  document.querySelectorAll(".nm").forEach((el) => { el.textContent = NAME; });
  document.title = `${NAME}: ${lang === "en" ? "usable footpaths, mapped by people who walk them" : L[lang].h1}`;
  $("#lang").value = lang;
  try { localStorage.setItem("lang", lang); } catch {}
}
let saved = null; try { saved = localStorage.getItem("lang"); } catch {}
const guess = (navigator.language || "en").slice(0, 2);
apply(saved && L[saved] ? saved : L[guess] ? guess : "en");
$("#lang").addEventListener("change", (e) => apply(e.target.value));

const t0 = Date.now();
async function post(body) {
  const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { ok: r.ok, status: r.status, body: await r.json().catch(() => ({})) };
}
function wire(form, msgEl, build, okKey) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const M = msgs(), btn = form.querySelector("button");
    msgEl.className = "msg"; msgEl.textContent = "";
    const email = (form.querySelector('input[type=email]').value || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(email)) { msgEl.className = "msg err"; msgEl.textContent = M.badEmail; return; }
    const body = build(email);
    if (body.agree === false) { msgEl.className = "msg err"; msgEl.textContent = M.needBox; return; }
    btn.disabled = true; msgEl.textContent = M.busy;
    try {
      const r = await post(body);
      if (r.ok) { msgEl.textContent = M[okKey]; form.reset(); }
      else { msgEl.className = "msg err"; msgEl.textContent = r.status === 400 || r.status === 429 ? (r.body.error || M.fail) : M.fail; }
    } catch { msgEl.className = "msg err"; msgEl.textContent = M.fail; }
    btn.disabled = false;
  });
}
wire($("#wl"), $("#msg"), (email) => ({ email, area: $("#area").value || undefined, lang, agree: $("#agree").checked, website: $('input[name=website]').value, t: Date.now() - t0 }), "okJoin");
wire($("#rm"), $("#rmmsg"), (email) => ({ action: "remove", email }), "okRm");
