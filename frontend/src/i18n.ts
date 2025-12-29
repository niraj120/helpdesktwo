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
      "error": "Error",
      "success": "Success",
      
      // Navigation
      "dashboard": "Dashboard",
      "tickets": "Tickets",
      "users": "Users",
      "settings": "Settings",
      
      // Queries
      "createTicket": "Create Query",
      "ticketDetails": "Query Details",
      "assignTicket": "Assign Query",
      
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
      
      // Knowledge Base
      "knowledgeBaseTitle": "Knowledge Base",
      "browseArticles": "Browse articles and find answers to common questions",
      "searchArticlesPlaceholder": "Search articles...",
      "loadingArticles": "Loading articles...",
      "noArticlesAvailable": "No articles available yet",
      "backToArticles": "Back to Articles",
      "recentlyUpdated": "Recently updated",
      
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
      "error": "त्रुटि",
      "success": "सफलता",
      
      // Navigation
      "dashboard": "डैशबोर्ड",
      "tickets": "टिकट",
      "users": "उपयोगकर्ता",
      "settings": "सेटिंग्स",
      
      // Tickets
      "createTicket": "टिकट बनाएं",
      "ticketDetails": "टिकट विवरण",
      "assignTicket": "टिकट असाइन करें",
      
      // Center Search
      "allCenters": "सभी केंद्र",
      "byState": "राज्य के अनुसार",
      "byCity": "शहर के अनुसार",
      "byPincode": "पिनकोड के अनुसार",
      "findNearestCenter": "निकटतम केंद्र खोजें",
      "knowledgeBase": "ज्ञान आधार",
      "submitOnline": "ऑनलाइन सबमिट करें",
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
      
      // Knowledge Base
      "knowledgeBaseTitle": "ज्ञान आधार",
      "browseArticles": "लेख ब्राउज़ करें और सामान्य प्रश्नों के उत्तर खोजें",
      "searchArticlesPlaceholder": "लेख खोजें...",
      "loadingArticles": "लेख लोड हो रहे हैं...",
      "noArticlesAvailable": "अभी तक कोई लेख उपलब्ध नहीं है",
      "backToArticles": "लेखों पर वापस जाएं",
      "recentlyUpdated": "हाल ही में अपडेट किया गया",
      
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
      "error": "त्रुटी",
      "success": "यशस्वी",
      
      // Navigation
      "dashboard": "डॅशबोर्ड",
      "tickets": "तिकिटे",
      "users": "वापरकर्ते",
      "settings": "सेटिंग्ज",
      
      // Tickets
      "createTicket": "तिकीट तयार करा",
      "ticketDetails": "तिकीट तपशील",
      "assignTicket": "तिकीट नियुक्त करा",
      
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
      
      // Knowledge Base
      "knowledgeBaseTitle": "ज्ञान केंद्र",
      "browseArticles": "लेख ब्राउझ करा आणि सामान्य प्रश्नांची उत्तरे शोधा",
      "searchArticlesPlaceholder": "लेख शोधा...",
      "loadingArticles": "लेख लोड होत आहेत...",
      "noArticlesAvailable": "अद्याप कोणतेही लेख उपलब्ध नाहीत",
      "backToArticles": "लेखांकडे परत जा",
      "recentlyUpdated": "अलीकडे अपडेट केले",
      
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
    }
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'en', // default language
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false // react already safes from xss
    }
  });

export default i18n;
