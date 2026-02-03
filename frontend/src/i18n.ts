import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Import translation files
const resources = {
  en: {
    translation: {
      // Common
      "welcome": "Welcome",
      "login": "Login",
      "logout": "Logout",
      "submit": "Submit",
      "cancel": "Cancel",
      "save": "Save",
      "delete": "Delete",
      "edit": "Edit",
      "search": "Search",
      "loading": "Loading...",
      "loadingPortal": "Loading portal...",
      "error": "Error",
      "success": "Success",
      "remove": "Remove",
      "goBack": "Go Back",
      "close": "Close",
      "view": "View",
      "download": "Download",
      "new": "New",
      
      // Navigation
      "dashboard": "Dashboard",
      "tickets": "Tickets",
      "users": "Users",
      "settings": "Settings",
      
      // Queries/Tickets
      "createTicket": "Create Query",
      "ticketDetails": "Query Details",
      "assignTicket": "Assign Query",
      "submitYourQuery": "Submit Your Query",
      "fillFormToSubmit": "Fill out the form below to submit your query. We'll respond as soon as possible.",
      "submittingQuery": "Submitting...",
      "submitQuery": "Submit Query",
      "querySubmittedSuccess": "Your query has been submitted successfully!",
      "querySubmittedMessage": "Our team will review your query and respond within 24-48 hours.",
      "submissionError": "Submission Error",
      
      // Center Search
      "allCenters": "All Centers",
      "byState": "By State",
      "byCity": "By City",
      "byPincode": "By Pincode",
      "findNearestCenter": "Find Nearest Center",
      "knowledgeBase": "Knowledge Base",
      "submitOnline": "Submit Online",
      "list": "List",
      "map": "Map",
      "locateCentersText": "Locate our centers across the country or view them on the map",
      "searchByCity": "Search by city...",
      "searchByPincode": "Search by pincode...",
      "searchPlaceholder": "Search by city, state, or pincode...",
      "sortBy": "Sort By",
      "sortDistrict": "Sort: District",
      "sortDistance": "Sort: Distance",
      "sortAlphabetical": "Sort: A-Z",
      "sortByDistrict": "Sort by District",
      "sortByDistance": "Sort by Distance",
      "sortByAlphabetical": "Sort Alphabetically (A-Z)",
      "address": "Address",
      "phone": "Phone",
      "email": "Email",
      "workingHours": "Working Hours",
      "getDirections": "Get Directions",
      "viewOnMap": "View on Map",
      "availableFeatures": "Available Features",
      "noFeaturesListed": "No features listed",
      "contactDetails": "Contact Details",
      "noContactDetailsAvailable": "No contact details available",
      "noCentersFound": "No centers found",
      "noCentersMatchSearch": "No centers match your search criteria",
      "centersFound": "{{count}} center(s) found",
      
      // Knowledge Base
      "knowledgeBaseTitle": "Knowledge Base",
      "browseArticles": "Browse articles and find answers to common questions",
      "searchArticlesPlaceholder": "Search articles...",
      "searchForArticles": "Search for articles, guides, or topics...",
      "loadingArticles": "Loading articles...",
      "noArticlesAvailable": "No knowledge base articles available yet",
      "backToArticles": "Back to Articles",
      "recentlyUpdated": "Recently updated",
      "discoverKnowledgeBase": "Discover answers, guides, and resources to help you succeed",
      "articles": "Articles",
      "tables": "Tables",
      "all": "All",
      "featured": "Featured",
      "noResults": "No results found",
      
      // File Upload
      "uploadFiles": "Upload Files",
      "dragDropFiles": "Drag and drop files here, or",
      "clickToUpload": "click to upload",
      "maxFileSize": "Maximum file size: {{size}}MB",
      "supportedFormats": "Supported formats: {{formats}}",
      "filesSelected": "{{count}} file(s) selected",
      
      // Portal Errors
      "portalNotFound": "Portal Not Found",
      "portalNotFoundMessage": "The portal you're looking for doesn't exist or the URL may be incorrect.",
      
      // Users
      "userManagement": "User Management",
      "addUser": "Add User",
      "editUser": "Edit User",
      
      // Project Dashboard
      "projectDashboard": "Project Dashboard",
      "overviewOfQueries": "Overview of queries for your project",
      "totalQueries": "Total Queries",
      "highPriority": "High Priority",
      "mediumPriority": "Medium Priority",
      "lowPriority": "Low Priority",
      "withinSLA": "Within SLA",
      "outsideSLA": "Outside SLA",
      "dashboardUpdatedRealtime": "Dashboard statistics are updated in real-time and show data based on your access permissions.",
      
      // Footer
      "allRightsReserved": "All rights reserved",
      "privacyPolicy": "Privacy Policy",
      "termsOfService": "Terms of Service",
      "cookiePolicy": "Cookie Policy",
      "contactUs": "Contact Us",
    }
  },
  hi: {
    translation: {
      // Common
      "welcome": "स्वागत है",
      "login": "लॉगिन",
      "logout": "लॉगआउट",
      "submit": "जमा करें",
      "cancel": "रद्द करें",
      "save": "सहेजें",
      "delete": "हटाएं",
      "edit": "संपादित करें",
      "search": "खोजें",
      "loading": "लोड हो रहा है...",
      "loadingPortal": "पोर्टल लोड हो रहा है...",
      "error": "त्रुटि",
      "success": "सफलता",
      "remove": "हटाएं",
      "goBack": "वापस जाएं",
      "close": "बंद करें",
      "view": "देखें",
      "download": "डाउनलोड करें",
      "new": "नया",
      
      // Navigation
      "dashboard": "डैशबोर्ड",
      "tickets": "टिकट",
      "users": "उपयोगकर्ता",
      "settings": "सेटिंग्स",
      
      // Queries/Tickets
      "createTicket": "प्रश्न बनाएं",
      "ticketDetails": "प्रश्न विवरण",
      "assignTicket": "प्रश्न असाइन करें",
      "submitYourQuery": "अपना प्रश्न जमा करें",
      "fillFormToSubmit": "अपना प्रश्न जमा करने के लिए नीचे दिया गया फॉर्म भरें। हम जल्द से जल्द जवाब देंगे।",
      "submittingQuery": "जमा हो रहा है...",
      "submitQuery": "प्रश्न जमा करें",
      "querySubmittedSuccess": "आपका प्रश्न सफलतापूर्वक जमा हो गया है!",
      "querySubmittedMessage": "हमारी टीम आपके प्रश्न की समीक्षा करेगी और 24-48 घंटों में जवाब देगी।",
      "submissionError": "जमा करने में त्रुटि",
      
      // Center Search
      "allCenters": "सभी केंद्र",
      "byState": "राज्य के अनुसार",
      "byCity": "शहर के अनुसार",
      "byPincode": "पिनकोड के अनुसार",
      "findNearestCenter": "निकटतम केंद्र खोजें",
      "knowledgeBase": "ज्ञान आधार",
      "submitOnline": "ऑनलाइन जमा करें",
      "list": "सूची",
      "map": "नक्शा",
      "locateCentersText": "देश भर में हमारे केंद्रों का पता लगाएं या उन्हें नक्शे पर देखें",
      "searchByCity": "शहर के अनुसार खोजें...",
      "searchByPincode": "पिनकोड के अनुसार खोजें...",
      "searchPlaceholder": "शहर, राज्य या पिनकोड के अनुसार खोजें...",
      "sortBy": "क्रमबद्ध करें",
      "sortDistrict": "क्रमबद्ध: जिला",
      "sortDistance": "क्रमबद्ध: दूरी",
      "sortAlphabetical": "क्रमबद्ध: अ-ज्ञ",
      "sortByDistrict": "जिले के अनुसार क्रमबद्ध करें",
      "sortByDistance": "दूरी के अनुसार क्रमबद्ध करें",
      "sortByAlphabetical": "वर्णमाला क्रम में क्रमबद्ध करें (अ-ज्ञ)",
      "address": "पता",
      "phone": "फोन",
      "email": "ईमेल",
      "workingHours": "कार्य समय",
      "getDirections": "दिशा निर्देश प्राप्त करें",
      "viewOnMap": "नक्शे पर देखें",
      "availableFeatures": "उपलब्ध सुविधाएं",
      "noFeaturesListed": "कोई सुविधा सूचीबद्ध नहीं",
      "contactDetails": "संपर्क विवरण",
      "noContactDetailsAvailable": "कोई संपर्क विवरण उपलब्ध नहीं है",
      "noCentersFound": "कोई केंद्र नहीं मिला",
      "noCentersMatchSearch": "आपकी खोज से मेल खाने वाला कोई केंद्र नहीं है",
      "centersFound": "{{count}} केंद्र मिले",
      
      // Knowledge Base
      "knowledgeBaseTitle": "ज्ञान आधार",
      "browseArticles": "लेख ब्राउज़ करें और सामान्य प्रश्नों के उत्तर खोजें",
      "searchArticlesPlaceholder": "लेख खोजें...",
      "searchForArticles": "लेख, गाइड या विषय खोजें...",
      "loadingArticles": "लेख लोड हो रहे हैं...",
      "noArticlesAvailable": "अभी तक कोई ज्ञान आधार लेख उपलब्ध नहीं है",
      "backToArticles": "लेखों पर वापस जाएं",
      "recentlyUpdated": "हाल ही में अपडेट किया गया",
      "discoverKnowledgeBase": "उत्तर, गाइड और संसाधन खोजें जो आपकी सफलता में मदद करें",
      "articles": "लेख",
      "tables": "तालिकाएं",
      "all": "सभी",
      "featured": "विशेष",
      "noResults": "कोई परिणाम नहीं मिला",
      
      // File Upload
      "uploadFiles": "फाइलें अपलोड करें",
      "dragDropFiles": "फाइलें यहां खींचें और छोड़ें, या",
      "clickToUpload": "अपलोड करने के लिए क्लिक करें",
      "maxFileSize": "अधिकतम फ़ाइल आकार: {{size}}MB",
      "supportedFormats": "समर्थित प्रारूप: {{formats}}",
      "filesSelected": "{{count}} फ़ाइल(एं) चयनित",
      
      // Portal Errors
      "portalNotFound": "पोर्टल नहीं मिला",
      "portalNotFoundMessage": "आप जिस पोर्टल की तलाश कर रहे हैं वह मौजूद नहीं है या URL गलत हो सकता है।",
      
      // Users
      "userManagement": "उपयोगकर्ता प्रबंधन",
      "addUser": "उपयोगकर्ता जोड़ें",
      "editUser": "उपयोगकर्ता संपादित करें",
      
      // Project Dashboard
      "projectDashboard": "प्रोजेक्ट डैशबोर्ड",
      "overviewOfQueries": "आपके प्रोजेक्ट के लिए प्रश्नों का अवलोकन",
      "totalQueries": "कुल प्रश्न",
      "highPriority": "उच्च प्राथमिकता",
      "mediumPriority": "मध्यम प्राथमिकता",
      "lowPriority": "कम प्राथमिकता",
      "withinSLA": "SLA के भीतर",
      "outsideSLA": "SLA के बाहर",
      "dashboardUpdatedRealtime": "डैशबोर्ड आंकड़े वास्तविक समय में अपडेट होते हैं और आपकी पहुंच अनुमतियों के आधार पर डेटा दिखाते हैं।",
      
      // Footer
      "allRightsReserved": "सर्वाधिकार सुरक्षित",
      "privacyPolicy": "गोपनीयता नीति",
      "termsOfService": "सेवा की शर्तें",
      "cookiePolicy": "कुकी नीति",
      "contactUs": "संपर्क करें",
    }
  },
  mr: {
    translation: {
      // Common
      "welcome": "स्वागत आहे",
      "login": "लॉगिन",
      "logout": "लॉगआउट",
      "submit": "सबमिट करा",
      "cancel": "रद्द करा",
      "save": "जतन करा",
      "delete": "हटवा",
      "edit": "संपादित करा",
      "search": "शोधा",
      "loading": "लोड होत आहे...",
      "loadingPortal": "पोर्टल लोड होत आहे...",
      "error": "त्रुटी",
      "success": "यशस्वी",
      "remove": "काढून टाका",
      "goBack": "मागे जा",
      "close": "बंद करा",
      "view": "पहा",
      "download": "डाउनलोड करा",
      "new": "नवीन",
      
      // Navigation
      "dashboard": "डॅशबोर्ड",
      "tickets": "तिकिटे",
      "users": "वापरकर्ते",
      "settings": "सेटिंग्ज",
      
      // Queries/Tickets
      "createTicket": "प्रश्न तयार करा",
      "ticketDetails": "प्रश्न तपशील",
      "assignTicket": "प्रश्न नियुक्त करा",
      "submitYourQuery": "तुमचा प्रश्न सबमिट करा",
      "fillFormToSubmit": "तुमचा प्रश्न सबमिट करण्यासाठी खालील फॉर्म भरा. आम्ही लवकरात लवकर प्रतिसाद देऊ.",
      "submittingQuery": "सबमिट होत आहे...",
      "submitQuery": "प्रश्न सबमिट करा",
      "querySubmittedSuccess": "तुमचा प्रश्न यशस्वीरित्या सबमिट झाला आहे!",
      "querySubmittedMessage": "आमची टीम तुमच्या प्रश्नाचे पुनरावलोकन करेल आणि 24-48 तासांत प्रतिसाद देईल.",
      "submissionError": "सबमिशन त्रुटी",
      
      // Center Search
      "allCenters": "सर्व केंद्रे",
      "byState": "राज्यानुसार",
      "byCity": "शहरानुसार",
      "byPincode": "पिनकोडनुसार",
      "findNearestCenter": "जवळचे केंद्र शोधा",
      "knowledgeBase": "ज्ञान केंद्र",
      "submitOnline": "ऑनलाइन सबमिट करा",
      "list": "यादी",
      "map": "नकाशा",
      "locateCentersText": "देशभरातील आमची केंद्रे शोधा किंवा नकाशावर पहा",
      "searchByCity": "शहरानुसार शोधा...",
      "searchByPincode": "पिनकोडनुसार शोधा...",
      "searchPlaceholder": "शहर, राज्य किंवा पिनकोडनुसार शोधा...",
      "sortBy": "क्रमवारी लावा",
      "sortDistrict": "क्रमवारी: जिल्हा",
      "sortDistance": "क्रमवारी: अंतर",
      "sortAlphabetical": "क्रमवारी: अ-ज्ञ",
      "sortByDistrict": "जिल्ह्यानुसार क्रमवारी लावा",
      "sortByDistance": "अंतरानुसार क्रमवारी लावा",
      "sortByAlphabetical": "वर्णमालानुसार क्रमवारी लावा (अ-ज्ञ)",
      "address": "पत्ता",
      "phone": "फोन",
      "email": "ईमेल",
      "workingHours": "कार्य वेळ",
      "getDirections": "मार्गदर्शन मिळवा",
      "viewOnMap": "नकाशावर पहा",
      "availableFeatures": "उपलब्ध सुविधा",
      "noFeaturesListed": "कोणत्याही सुविधा सूचीबद्ध नाहीत",
      "contactDetails": "संपर्क तपशील",
      "noContactDetailsAvailable": "कोणतेही संपर्क तपशील उपलब्ध नाहीत",
      "noCentersFound": "कोणतेही केंद्र सापडले नाही",
      "noCentersMatchSearch": "तुमच्या शोधाशी जुळणारे कोणतेही केंद्र नाही",
      "centersFound": "{{count}} केंद्र(े) सापडले",
      
      // Knowledge Base
      "knowledgeBaseTitle": "ज्ञान केंद्र",
      "browseArticles": "लेख ब्राउझ करा आणि सामान्य प्रश्नांची उत्तरे शोधा",
      "searchArticlesPlaceholder": "लेख शोधा...",
      "searchForArticles": "लेख, मार्गदर्शक किंवा विषय शोधा...",
      "loadingArticles": "लेख लोड होत आहेत...",
      "noArticlesAvailable": "अद्याप कोणतेही ज्ञान केंद्र लेख उपलब्ध नाहीत",
      "backToArticles": "लेखांकडे परत जा",
      "recentlyUpdated": "अलीकडे अपडेट केले",
      "discoverKnowledgeBase": "उत्तरे, मार्गदर्शक आणि संसाधने शोधा जे तुम्हाला यशस्वी होण्यास मदत करतील",
      "articles": "लेख",
      "tables": "तालिका",
      "all": "सर्व",
      "featured": "वैशिष्ट्यीकृत",
      "noResults": "कोणतेही परिणाम सापडले नाहीत",
      
      // File Upload
      "uploadFiles": "फाइल्स अपलोड करा",
      "dragDropFiles": "फाइल्स येथे ड्रॅग आणि ड्रॉप करा, किंवा",
      "clickToUpload": "अपलोड करण्यासाठी क्लिक करा",
      "maxFileSize": "कमाल फाइल आकार: {{size}}MB",
      "supportedFormats": "समर्थित स्वरूप: {{formats}}",
      "filesSelected": "{{count}} फाइल(स्) निवडल्या",
      
      // Portal Errors
      "portalNotFound": "पोर्टल सापडले नाही",
      "portalNotFoundMessage": "तुम्ही शोधत असलेले पोर्टल अस्तित्वात नाही किंवा URL चुकीचा असू शकतो.",
      
      // Users
      "userManagement": "वापरकर्ता व्यवस्थापन",
      "addUser": "वापरकर्ता जोडा",
      "editUser": "वापरकर्ता संपादित करा",
      
      // Project Dashboard
      "projectDashboard": "प्रोजेक्ट डॅशबोर्ड",
      "overviewOfQueries": "तुमच्या प्रोजेक्टसाठी प्रश्नांचे विहंगावलोकन",
      "totalQueries": "एकूण प्रश्न",
      "highPriority": "उच्च प्राधान्य",
      "mediumPriority": "मध्यम प्राधान्य",
      "lowPriority": "कमी प्राधान्य",
      "withinSLA": "SLA मध्ये",
      "outsideSLA": "SLA बाहेर",
      "dashboardUpdatedRealtime": "डॅशबोर्ड आकडेवारी रिअल-टाइममध्ये अपडेट केली जाते आणि तुमच्या प्रवेश परवानग्यांवर आधारित डेटा दाखवते.",
      
      // Footer
      "allRightsReserved": "सर्व हक्क राखीव",
      "privacyPolicy": "गोपनीयता धोरण",
      "termsOfService": "सेवा अटी",
      "cookiePolicy": "कुकी धोरण",
      "contactUs": "संपर्क साधा",
    }
  }
};

// Get saved language, validate it's a supported language, default to English
const getSavedLanguage = (): string => {
  const saved = localStorage.getItem('preferredLanguage');
  // Only accept valid language codes, otherwise default to English
  if (saved && ['en', 'mr', 'hi'].includes(saved)) {
    return saved;
  }
  return 'en'; // Default to English
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: getSavedLanguage(), // Use saved preference or default to English
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false // react already safes from xss
    }
  });

export default i18n;
