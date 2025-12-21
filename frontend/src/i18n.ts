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
      
      // Users
      "userManagement": "User Management",
      "addUser": "Add User",
      "editUser": "Edit User",
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
      
      // Users
      "userManagement": "उपयोगकर्ता प्रबंधन",
      "addUser": "उपयोगकर्ता जोड़ें",
      "editUser": "उपयोगकर्ता संपादित करें",
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
