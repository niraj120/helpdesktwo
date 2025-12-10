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
