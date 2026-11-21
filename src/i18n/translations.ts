import type { SupportedLanguage } from '../types/civic';

export interface LanguageOption {
  code: SupportedLanguage;
  nativeLabel: string;
  englishLabel: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'en', nativeLabel: 'English', englishLabel: 'English' },
  { code: 'hi', nativeLabel: 'हिन्दी', englishLabel: 'Hindi' },
  { code: 'ta', nativeLabel: 'தமிழ்', englishLabel: 'Tamil' },
  { code: 'te', nativeLabel: 'తెలుగు', englishLabel: 'Telugu' },
  { code: 'kn', nativeLabel: 'ಕನ್ನಡ', englishLabel: 'Kannada' },
  { code: 'mr', nativeLabel: 'मराठी', englishLabel: 'Marathi' },
  { code: 'bn', nativeLabel: 'বাংলা', englishLabel: 'Bengali' },
  { code: 'gu', nativeLabel: 'ગુજરાતી', englishLabel: 'Gujarati' },
];

export interface UiStrings {
  signInTitle: string;
  signInSubtitle: string;
  signInGoogle: string;
  selectLanguage: string;
  emergencyBannerTitle: string;
  emergencyBannerBody: string;
  submitComplaintTitle: string;
  describeIssueLabel: string;
  describeIssuePlaceholder: string;
  landmarkLabel: string;
  landmarkPlaceholder: string;
  uploadEvidenceLabel: string;
  useMyGps: string;
  analyzeAndSubmit: string;
  myComplaintsTitle: string;
  noComplaintsYet: string;
}

export const UI_TRANSLATIONS: Record<SupportedLanguage, UiStrings> = {
  en: {
    signInTitle: 'Municipal Grievance & Field Operations Platform',
    signInSubtitle:
      'Report civic issues in your preferred Indian regional language with AI-assisted classification, photographic verification, and verified municipal jurisdiction routing.',
    signInGoogle: 'Continue with Google',
    selectLanguage: 'Portal Language',
    emergencyBannerTitle: 'Life-Safety Emergency? Dial 112 Immediately',
    emergencyBannerBody:
      'For active accidents, electrocution hazards, fires, gas leaks, or medical emergencies in India, call 112 directly. CivicAI routes Critical reports to on-duty municipal officers and does not directly dispatch 112 emergency services.',
    submitComplaintTitle: 'File a Civic Complaint',
    describeIssueLabel: 'Describe the issue(s) in your language',
    describeIssuePlaceholder:
      'Example: Deep pothole near the bus stop and an exposed sparking electric cable hanging over the footpath...',
    landmarkLabel: 'Nearest Landmark / Street Detail',
    landmarkPlaceholder: 'e.g., Opposite Ward 14 Primary School Gate',
    uploadEvidenceLabel: 'Attach Photograph Evidence (ImageGuard SHA-256 & EXIF)',
    useMyGps: 'Use Current GPS',
    analyzeAndSubmit: 'Inspect with Gemini AI & Submit Complaint',
    myComplaintsTitle: 'Your Submitted Complaints',
    noComplaintsYet: 'You have not filed any civic complaints yet. Submit a report to track municipal progress.',
  },
  hi: {
    signInTitle: 'नगर निगम शिकायत एवं क्षेत्रीय प्रबंधन मंच',
    signInSubtitle:
      'अपनी क्षेत्रीय भाषा में नागरिक समस्याएँ दर्ज करें — AI वर्गीकरण, फ़ोटो सत्यापन और सही वार्ड कार्यालय रूटिंग के साथ।',
    signInGoogle: 'Google से साइन इन करें',
    selectLanguage: 'भाषा चुनें',
    emergencyBannerTitle: 'आपातकालीन स्थिति? तुरंत 112 पर कॉल करें',
    emergencyBannerBody:
      'दुर्घटना, बिजली के खुले तार, आग या गैस रिसाव जैसी जानलेवा स्थिति में तुरंत 112 डायल करें। CivicAI नगर निगम अधिकारी को सूचित करता है, सीधे 112 डिस्पैच नहीं करता।',
    submitComplaintTitle: 'नई नागरिक शिकायत दर्ज करें',
    describeIssueLabel: 'अपनी भाषा में समस्या का विवरण लिखें',
    describeIssuePlaceholder:
      'उदाहरण: बस स्टॉप के पास गहरा गड्ढा है और फुटपाथ पर खुला बिजली का तार लटक रहा है...',
    landmarkLabel: 'नजदीकी स्थान / लैंडमार्क',
    landmarkPlaceholder: 'उदा., वार्ड 14 प्राथमिक विद्यालय गेट के सामने',
    uploadEvidenceLabel: 'फ़ोटो प्रमाण संलग्न करें (ImageGuard SHA-256 और EXIF)',
    useMyGps: 'मेरा GPS लोकेशन लें',
    analyzeAndSubmit: 'Gemini AI से जांचें और शिकायत दर्ज करें',
    myComplaintsTitle: 'आपकी दर्ज शिकायतें',
    noComplaintsYet: 'आपने अभी तक कोई शिकायत दर्ज नहीं की है।',
  },
  ta: {
    signInTitle: 'நகராட்சி புகார் மற்றும் கள நிர்வாக தளம்',
    signInSubtitle:
      'உங்கள் மொழியில் குடிமை புகார்களை பதிவு செய்யுங்கள் — AI வகைப்பாடு, புகைப்பட சரிபார்ப்பு மற்றும் வார்டு வழிகாட்டலுடன்.',
    signInGoogle: 'Google மூலம் உள்நுழையவும்',
    selectLanguage: 'மொழி தேர்வு',
    emergencyBannerTitle: 'அவசர நிலையா? உடனே 112 ஐ அழைக்கவும்',
    emergencyBannerBody:
      'விபத்து, மின் கம்பி அறுந்து விழுதல், தீ அல்லது எரிவாயு கசிவு போன்ற உயிராபத்து நிலைகளில் உடனே 112 ஐ அழைக்கவும். CivicAI நகராட்சி அதிகாரிகளுக்கு மட்டுமே தகவல் அனுப்பும்.',
    submitComplaintTitle: 'புதிய குடிமை புகார் பதிவு',
    describeIssueLabel: 'பிரச்சனையை உங்கள் மொழியில் விவரிக்கவும்',
    describeIssuePlaceholder: 'உதாரணம்: பேருந்து நிறுத்தம் அருகே பெரிய பள்ளம் மற்றும் திறந்த சாக்கடை மூடி...',
    landmarkLabel: 'அருகிலுள்ள அடையாளம்',
    landmarkPlaceholder: 'எ.கா., வார்டு 14 அரசு பள்ளி நுழைவாயில் எதிரில்',
    uploadEvidenceLabel: 'புகைப்பட ஆதாரத்தை இணைக்கவும் (ImageGuard)',
    useMyGps: 'தற்போதைய GPS ஐப் பயன்படுத்து',
    analyzeAndSubmit: 'Gemini AI ஆய்வுடன் புகார் சமர்ப்பி',
    myComplaintsTitle: 'உங்கள் புகார்கள்',
    noComplaintsYet: 'நீங்கள் இதுவரை எந்தப் புகாரும் பதிவு செய்யவில்லை.',
  },
  te: {
    signInTitle: 'మున్సిపల్ ఫిర్యాదు మరియు క్షేత్ర నిర్వహణ వేదిక',
    signInSubtitle:
      'మీ భాషలో పౌర సమస్యలను నమోదు చేయండి — AI వర్గీకరణ, ఫోటో తనిఖీ మరియు వార్డు కార్యాలయ రూటింగ్‌తో.',
    signInGoogle: 'Google తో సైన్ ఇన్ చేయండి',
    selectLanguage: 'భాష ఎంచుకోండి',
    emergencyBannerTitle: 'అత్యవసర పరిస్థితా? వెంటనే 112 కు కాల్ చేయండి',
    emergencyBannerBody:
      'ప్రమాదాలు, విద్యుత్ తీగలు, అగ్ని లేదా గ్యాస్ లీక్ వంటి ప్రాణాపాయ పరిస్థితుల్లో వెంటనే 112 కు కాల్ చేయండి.',
    submitComplaintTitle: 'కొత్త పౌర ఫిర్యాదు నమోదు',
    describeIssueLabel: 'సమస్యను మీ భాషలో వివరించండి',
    describeIssuePlaceholder: 'ఉదాహరణ: బస్ స్టాప్ వద్ద పెద్ద గుంత మరియు తెరిచిన మ్యాన్‌హోల్...',
    landmarkLabel: 'సమీప గుర్తు / ల్యాండ్‌మార్క్',
    landmarkPlaceholder: 'ఉదా., వార్డ్ 14 పాఠశాల గేట్ ఎదురుగా',
    uploadEvidenceLabel: 'ఫోటో ఆధారాన్ని జత చేయండి (ImageGuard)',
    useMyGps: 'ప్రస్తుత GPS ఉపయోగించండి',
    analyzeAndSubmit: 'Gemini AI పరిశీలనతో ఫిర్యాదు సమర్పించండి',
    myComplaintsTitle: 'మీ ఫిర్యాదులు',
    noComplaintsYet: 'మీరు ఇంకా ఎలాంటి ఫిర్యాదు నమోదు చేయలేదు.',
  },
  kn: {
    signInTitle: 'ನಗರಸಭೆ ದೂರು ಮತ್ತು ಕ್ಷೇತ್ರ ನಿರ್ವಹಣಾ ವೇದಿಕೆ',
    signInSubtitle:
      'ನಿಮ್ಮ ಭಾಷೆಯಲ್ಲಿ ನಾಗರಿಕ ಸಮಸ್ಯೆಗಳನ್ನು ದಾಖಲಿಸಿ — AI ವರ್ಗೀಕರಣ, ಫೋಟೋ ಪರಿಶೀಲನೆ ಮತ್ತು ವಾರ್ಡ್ ರೂಟಿಂಗ್‌ನೊಂದಿಗೆ.',
    signInGoogle: 'Google ಮೂಲಕ ಸೈನ್ ಇನ್ ಮಾಡಿ',
    selectLanguage: 'ಭಾಷೆ ಆಯ್ಕೆಮಾಡಿ',
    emergencyBannerTitle: 'ತುರ್ತು ಪರಿಸ್ಥಿತಿಯೇ? ತಕ್ಷಣ 112 ಗೆ ಕರೆ ಮಾಡಿ',
    emergencyBannerBody:
      'ಅಪಘಾತ, ವಿದ್ಯುತ್ ತಂತಿ, ಬೆಂಕಿ ಅಥವಾ ಗ್ಯಾಸ್ ಸೋರಿಕೆ ಸಂದರ್ಭದಲ್ಲಿ ತಕ್ಷಣ 112 ಗೆ ಕರೆ ಮಾಡಿ.',
    submitComplaintTitle: 'ಹೊಸ ನಾಗರಿಕ ದೂರು ದಾಖಲಿಸಿ',
    describeIssueLabel: 'ಸಮಸ್ಯೆಯನ್ನು ನಿಮ್ಮ ಭಾಷೆಯಲ್ಲಿ ವಿವರಿಸಿ',
    describeIssuePlaceholder: 'ಉದಾಹರಣೆ: ಬಸ್ ನಿಲ್ದಾಣದ ಬಳಿ ಆಳವಾದ ಗುಂಡಿ ಮತ್ತು ತೆರೆದ ಮ್ಯಾನ್‌ಹೋಲ್...',
    landmarkLabel: 'ಸಮೀಪದ ಗುರುತು',
    landmarkPlaceholder: 'ಉದಾ., ವಾರ್ಡ್ 14 ಶಾಲೆಯ ಗೇಟ್ ಎದುರು',
    uploadEvidenceLabel: 'ಫೋಟೋ ಪುರಾವೆ ಲಗತ್ತಿಸಿ (ImageGuard)',
    useMyGps: 'ಪ್ರಸ್ತುತ GPS ಬಳಸಿ',
    analyzeAndSubmit: 'Gemini AI ಪರಿಶೀಲನೆಯೊಂದಿಗೆ ದೂರು ಸಲ್ಲಿಸಿ',
    myComplaintsTitle: 'ನಿಮ್ಮ ದೂರುಗಳು',
    noComplaintsYet: 'ನೀವು ಇನ್ನೂ ಯಾವುದೇ ದೂರನ್ನು ಸಲ್ಲಿಸಿಲ್ಲ.',
  },
  mr: {
    signInTitle: 'महापालिका तक्रार व क्षेत्रीय व्यवस्थापन व्यासपीठ',
    signInSubtitle:
      'तुमच्या भाषेत नागरी समस्या नोंदवा — AI वर्गीकरण, छायाचित्र तपासणी आणि प्रभाग कार्यालय रूटिंगसह.',
    signInGoogle: 'Google सह साइन इन करा',
    selectLanguage: 'भाषा निवडा',
    emergencyBannerTitle: 'आपत्कालीन स्थिती? तात्काळ 112 वर कॉल करा',
    emergencyBannerBody:
      'अपघात, उघडी वीज तार, आग किंवा गॅस गळतीसाठी तात्काळ 112 वर संपर्क साधा.',
    submitComplaintTitle: 'नवीन नागरी तक्रार नोंदवा',
    describeIssueLabel: 'तुमच्या भाषेत समस्या लिहा',
    describeIssuePlaceholder: 'उदाहरण: बस स्थानकाजवळ मोठा खड्डा आणि उघडे मॅनहोल आहे...',
    landmarkLabel: 'जवळची खूण / लँडमार्क',
    landmarkPlaceholder: 'उदा., प्रभाग 14 शाळेच्या गेटसमोर',
    uploadEvidenceLabel: 'फोटो पुरावा जोडा (ImageGuard)',
    useMyGps: 'सध्याचे GPS वापरा',
    analyzeAndSubmit: 'Gemini AI तपासणीसह तक्रार पाठवा',
    myComplaintsTitle: 'तुमच्या नोंदवलेल्या तक्रारी',
    noComplaintsYet: 'तुम्ही अद्याप कोणतीही तक्रार नोंदवलेली नाही.',
  },
  bn: {
    signInTitle: 'পৌর অভিযোগ ও মাঠ পরিচালনা প্ল্যাটফর্ম',
    signInSubtitle:
      'আপনার ভাষায় নাগরিক সমস্যা জানান — AI শ্রেণিবিন্যাস, ছবি যাচাই এবং ওয়ার্ড অফিস রাউটিং সহ।',
    signInGoogle: 'Google দিয়ে সাইন ইন করুন',
    selectLanguage: 'ভাষা নির্বাচন করুন',
    emergencyBannerTitle: 'জরুরি অবস্থা? অবিলম্বে 112 নম্বরে কল করুন',
    emergencyBannerBody:
      'দুর্ঘটনা, খোলা বৈদ্যুতিক তার, আগুন বা গ্যাস লিকের জন্য অবিলম্বে 112 ডায়াল করুন।',
    submitComplaintTitle: 'নতুন নাগরিক অভিযোগ জমা দিন',
    describeIssueLabel: 'আপনার ভাষায় সমস্যাটি লিখুন',
    describeIssuePlaceholder: 'উদাহরণ: বাস স্টপের কাছে গভীর গর্ত এবং খোলা ম্যানহোল...',
    landmarkLabel: 'নিকটবর্তী ল্যান্ডমার্ক',
    landmarkPlaceholder: 'যেমন, ওয়ার্ড ১৪ প্রাথমিক বিদ্যালয়ের গেটের সামনে',
    uploadEvidenceLabel: 'ছবির প্রমাণ সংযুক্ত করুন (ImageGuard)',
    useMyGps: 'বর্তমান GPS ব্যবহার করুন',
    analyzeAndSubmit: 'Gemini AI যাচাইসহ অভিযোগ জমা দিন',
    myComplaintsTitle: 'আপনার জমাকৃত অভিযোগসমূহ',
    noComplaintsYet: 'আপনি এখনও কোনো অভিযোগ জমা দেননি।',
  },
  gu: {
    signInTitle: 'મ્યુનિસિપલ ફરિયાદ અને ક્ષેત્ર વ્યવસ્થાપન પ્લેટફોર્મ',
    signInSubtitle:
      'તમારી ભાષામાં નાગરિક સમસ્યાઓ નોંધાવો — AI વર્ગીકરણ, ફોટો ચકાસણી અને વોર્ડ રૂટિંગ સાથે.',
    signInGoogle: 'Google વડે સાઇન ઇન કરો',
    selectLanguage: 'ભાષા પસંદ કરો',
    emergencyBannerTitle: 'કટોકટીની સ્થિતિ? તરત જ 112 પર કૉલ કરો',
    emergencyBannerBody:
      'અકસ્માત, ખુલ્લો વીજ વાયર, આગ કે ગેસ લીક માટે તરત જ 112 ડાયલ કરો.',
    submitComplaintTitle: 'નવી નાગરિક ફરિયાદ નોંધાવો',
    describeIssueLabel: 'તમારી ભાષામાં સમસ્યાનું વર્ણન કરો',
    describeIssuePlaceholder: 'ઉદાહરણ: બસ સ્ટોપ પાસે ઊંડો ખાડો અને ખુલ્લું મેનહોલ...',
    landmarkLabel: 'નજીકનું લેન્ડમાર્ક',
    landmarkPlaceholder: 'દા.ત., વોર્ડ 14 પ્રાથમિક શાળાના ગેટ સામે',
    uploadEvidenceLabel: 'ફોટો પુરાવો જોડો (ImageGuard)',
    useMyGps: 'વર્તમાન GPS વાપરો',
    analyzeAndSubmit: 'Gemini AI તપાસ સાથે ફરિયાદ સબમિટ કરો',
    myComplaintsTitle: 'તમારી નોંધાયેલી ફરિયાદો',
    noComplaintsYet: 'તમે હજુ સુધી કોઈ ફરિયાદ નોંધાવી નથી.',
  },
};
