import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const resources = {
  en: {
    translation: {
      // App Title
      appTitle: "Government of India",
      appSubtitle: "Digital India Initiative",

      // Login Page
      welcomeTitle: "Welcome to Portal",
      welcomeSubtitle: "Super Admin Portal",
      secureAccess: "Secure access to government helpdesk services",

      // Form Labels
      emailLabel: "Email Address",
      passwordLabel: "Password",
      emailPlaceholder: "Enter your official email address",
      passwordPlaceholder: "Enter your password",
      passwordMinLength: "Minimum 6 characters required",

      // Buttons
      loginButton: "Login",
      signingIn: "Signing in...",
      signInToContinue: "Sign in to continue",
      forgotPassword: "Forgot your password?",
      sendOtp: "Send OTP",
      sendingOtp: "Sending OTP...",
      verifyOtp: "Verify OTP",
      verifyingOtp: "Verifying...",
      resetPassword: "Reset Password",
      resettingPassword: "Resetting...",
      backToLogin: "Back to Login",

      // Validation Messages
      required: "This field is required",
      emailRequired: "Email address is required",
      emailInvalid: "Please enter a valid email address",
      passwordRequired: "Password is required",
      passwordMinLengthError: "Password must be at least 6 characters",
      otpRequired: "OTP is required",
      otpInvalid: "Please enter a valid 6-digit OTP",
      passwordMismatch: "Passwords do not match",

      // Error Messages
      loginFailed: "Invalid credentials. Please try again.",
      networkError: "Network error. Please check your connection.",
      emailNotFound: "Email address not found in our records.",
      invalidOtp: "Invalid or expired OTP. Please try again.",
      passwordResetFailed: "Password reset failed. Please try again.",

      // Success Messages
      otpSent: "OTP has been sent to your email address.",
      passwordResetSuccess:
        "Password reset successfully. Please login with your new password.",

      // Forgot Password
      forgotPasswordTitle: "Reset Your Password",
      forgotPasswordSubtitle: "Enter your email to receive an OTP",
      otpVerificationTitle: "Verify OTP",
      otpVerificationSubtitle: "Enter the 6-digit code sent to your email",
      newPasswordTitle: "Set New Password",
      newPasswordSubtitle: "Create a strong password for your account",
      newPasswordLabel: "New Password",
      confirmPasswordLabel: "Confirm Password",

      // Security & Trust
      sslSecured: "Secured with 256-bit SSL encryption",
      privacyPolicy: "Privacy Policy",
      termsOfService: "Terms of Service",
      helpSupport: "Help & Support",

      // Footer
      copyright: "© 2025 Government of India. All rights reserved.",
      digitalIndia: "Developed under Digital India Initiative | Version 1.0.0",

      // Accessibility
      requiredField: "Required field",
      showPassword: "Show password",
      hidePassword: "Hide password",
      skipToMain: "Skip to main content",
      selectLanguage: "Select your preferred language",
      governmentEmblem: "Government of India National Emblem",

      // Language
      language: "Language",
      english: "English",
      marathi: "मराठी",

      // Mobile-based Forgot Password
      resetPasswordTitle: "Reset Password",
      mobileNumber: "Mobile Number",
      enterMobileDesc: "Enter your registered mobile number",
      sendOtpBtn: "Send OTP",
      sendingOtpBtn: "Sending OTP...",
      resendOtpBtn: "Resend OTP",
      resendOtpTimer: "Resend OTP in {{seconds}}s",
      enterOtpLabel: "Enter OTP",
      verifyOtpBtn: "Verify OTP",
      verifyingOtpBtn: "Verifying...",
      changeMobileBtn: "Change mobile number",
      otpSentToMobile: "OTP sent to +91 {{mobile}}",
      createNewPasswordTitle: "Create New Password",
      newPasswordDesc: "Enter a strong password for your account",
      confirmNewPasswordLabel: "Confirm your new password",
      resettingPasswordBtn: "Resetting...",
      mobileValidationErr: "Please enter a valid 10-digit mobile number",
      otpValidationErr: "Please enter 6-digit OTP",
      passwordResetSuccessMsg:
        "Password reset successfully. You can now login with your new password.",
      invalidMobileErr: "No account found with this mobile number",
      otpExpiredErr: "OTP has expired. Please request a new one",
      invalidOtpErr: "Invalid OTP. Please check and try again",
      tooManyAttemptsErr: "Too many failed attempts. Please try again later",
      enterMobilePlaceholder: "Enter 10-digit mobile number",
      enterOtpPlaceholder: "Enter 6-digit OTP",

      // Student Portal
      knowledgeBase: "Knowledge Base",
      knowledgeBaseTitle: "Knowledge Base",
      browseArticles: "Browse articles and find answers to common questions",
      searchArticlesPlaceholder: "Search articles...",
      loadingArticles: "Loading articles...",
      noArticlesAvailable: "No articles available yet",
      backToArticles: "Back to Articles",
      recentlyUpdated: "Recently updated",
      discoverKnowledgeBase:
        "Discover answers, guides, and resources to help you succeed",
      searchForArticles: "Search for articles...",
      login: "Login",
      submitOnline: "Submit Online",
      visitCenter: "Visit Center",
      submitYourTicket: "Submit Your Query",
      submitTicket: "Submit Query",
      submitting: "Submitting...",
      ticketSubmittedSuccessfully: "Query Submitted Successfully!",
      findNearestCenter: "Find Nearest Center",
      allCenters: "All Centers",
      byState: "By State",
      byCity: "By City",
      byPincode: "By Pincode",
      list: "List",
      map: "Map",
      searchPlaceholder: "Search by city, state, or pincode...",
      searchByCity: "Search by city...",
      searchByPincode: "Search by pincode...",
      sortBy: "Sort By",
      sortDistrict: "Sort: District",
      sortDistance: "Sort: Distance",
      sortAlphabetical: "Sort: A-Z",
      sortByDistrict: "Sort by District",
      sortByDistance: "Sort by Distance",
      sortByAlphabetical: "Sort Alphabetically (A-Z)",
      clearSort: "Clear Sort",
      noCentersFound: "No centers found",
      address: "Address",
      phone: "Phone",
      email: "Email",
      workingHours: "Working Hours",
      availableFeatures: "Available Features",
      getDirections: "Get Directions",
      goToLoginPage: "Go to Login Page",

      // Student Dashboard
      myTickets: "My Queries",
      noTicketsYet: "No Queries Yet",
      noTicketsMessage: "You haven't submitted any queries yet.",
      submitYourFirstTicket: "Submit Your First Query",
      submitNewTicket: "Submit New Query",
      dashboard: "Dashboard",
      logout: "Logout",
      category: "Category",
      status: "Status",
      priority: "Priority",
      assignedTo: "Assigned to",
      createdAt: "Created At",

      // Student Login Modal
      studentLogin: "Student Login",
      enterEmailToLogin: "Enter your email to login",
      verifyYourEmail: "Verify Your Email",
      enterOtpSentToEmail: "Enter the 6-digit code sent to your email",
      createYourPassword: "Create Your Password",
      setPasswordForAccount: "Set a password for your account",
      setPassword: "Set Password",
      settingPassword: "Setting password...",
      passwordSetSuccessfully: "Password Set Successfully!",
      passwordCreatedMessage:
        "Your password has been created. Please login with your email and new password to access your account.",
      alreadyHavePassword: "Already have a password?",
      loginWithPassword: "Login with Password",
      loginWithOtp: "Login with OTP",
      firstTimeUser: "First time user?",
      getOtpToSetup: "Get OTP to setup password",

      // View Mode Toggle
      viewMode: {
        label: "View mode",
        single: "Single Project",
        unified: "All Projects",
        singleProject: "Single project view",
        allProjects: "All projects view",
      },
    },
  },
  hi: {
    translation: {
      // App Title
      appTitle: "भारत सरकार",
      appSubtitle: "डिजिटल इंडिया पहल",

      // Login Page
      welcomeTitle: "हेल्पडेस्क में आपका स्वागत है",
      welcomeSubtitle: "सुपर एडमिन पोर्टल",
      secureAccess: "सरकारी हेल्पडेस्क सेवाओं तक सुरक्षित पहुंच",

      // Form Labels
      emailLabel: "ईमेल पता",
      passwordLabel: "पासवर्ड",
      emailPlaceholder: "अपना आधिकारिक ईमेल पता दर्ज करें",
      passwordPlaceholder: "अपना पासवर्ड दर्ज करें",
      passwordMinLength: "न्यूनतम 6 वर्ण आवश्यक",

      // Buttons
      loginButton: "लॉग इन",
      signingIn: "साइन इन हो रहा है...",
      signInToContinue: "जारी रखने के लिए साइन इन करें",
      forgotPassword: "अपना पासवर्ड भूल गए?",
      sendOtp: "OTP भेजें",
      sendingOtp: "OTP भेजा जा रहा है...",
      verifyOtp: "OTP सत्यापित करें",
      verifyingOtp: "सत्यापित हो रहा है...",
      resetPassword: "पासवर्ड रीसेट करें",
      resettingPassword: "रीसेट हो रहा है...",
      backToLogin: "लॉगिन पर वापस जाएं",

      // Validation Messages
      required: "यह फ़ील्ड आवश्यक है",
      emailRequired: "ईमेल पता आवश्यक है",
      emailInvalid: "कृपया एक मान्य ईमेल पता दर्ज करें",
      passwordRequired: "पासवर्ड आवश्यक है",
      passwordMinLengthError: "पासवर्ड कम से कम 6 वर्ण का होना चाहिए",
      otpRequired: "OTP आवश्यक है",
      otpInvalid: "कृपया एक मान्य 6-अंकीय OTP दर्ज करें",
      passwordMismatch: "पासवर्ड मेल नहीं खाते",

      // Error Messages
      loginFailed: "अमान्य क्रेडेंशियल। कृपया पुनः प्रयास करें।",
      networkError: "नेटवर्क त्रुटि। कृपया अपना कनेक्शन जांचें।",
      emailNotFound: "हमारे रिकॉर्ड में ईमेल पता नहीं मिला।",
      invalidOtp: "अमान्य या समाप्त OTP। कृपया पुनः प्रयास करें।",
      passwordResetFailed: "पासवर्ड रीसेट विफल। कृपया पुनः प्रयास करें।",

      // Success Messages
      otpSent: "OTP आपके ईमेल पते पर भेजा गया है।",
      passwordResetSuccess:
        "पासवर्ड सफलतापूर्वक रीसेट किया गया। कृपया अपने नए पासवर्ड से लॉगिन करें।",

      // Forgot Password
      forgotPasswordTitle: "अपना पासवर्ड रीसेट करें",
      forgotPasswordSubtitle: "OTP प्राप्त करने के लिए अपना ईमेल दर्ज करें",
      otpVerificationTitle: "OTP सत्यापित करें",
      otpVerificationSubtitle: "अपने ईमेल पर भेजा गया 6-अंकीय कोड दर्ज करें",
      newPasswordTitle: "नया पासवर्ड सेट करें",
      newPasswordSubtitle: "अपने खाते के लिए एक मजबूत पासवर्ड बनाएं",
      newPasswordLabel: "नया पासवर्ड",
      confirmPasswordLabel: "पासवर्ड की पुष्टि करें",

      // Security & Trust
      sslSecured: "256-बिट SSL एन्क्रिप्शन के साथ सुरक्षित",
      privacyPolicy: "गोपनीयता नीति",
      termsOfService: "सेवा की शर्तें",
      helpSupport: "सहायता और समर्थन",

      // Footer
      copyright: "© 2025 भारत सरकार। सर्वाधिकार सुरक्षित।",
      digitalIndia: "डिजिटल इंडिया पहल के तहत विकसित | संस्करण 1.0.0",

      // Accessibility
      requiredField: "आवश्यक फ़ील्ड",
      showPassword: "पासवर्ड दिखाएं",
      hidePassword: "पासवर्ड छुपाएं",
      skipToMain: "मुख्य सामग्री पर जाएं",
      selectLanguage: "अपनी पसंदीदा भाषा चुनें",
      governmentEmblem: "भारत सरकार राष्ट्रीय प्रतीक",

      // Language
      language: "भाषा",
      english: "English",
      hindi: "हिंदी",
      marathi: "मराठी",

      // Mobile-based Forgot Password
      resetPasswordTitle: "पासवर्ड रीसेट करें",
      mobileNumber: "मोबाइल नंबर",
      enterMobileDesc: "अपना पंजीकृत मोबाइल नंबर दर्ज करें",
      sendOtpBtn: "OTP भेजें",
      sendingOtpBtn: "OTP भेजा जा रहा है...",
      resendOtpBtn: "OTP फिर से भेजें",
      resendOtpTimer: "{{seconds}} सेकंड में OTP फिर से भेजें",
      enterOtpLabel: "OTP दर्ज करें",
      verifyOtpBtn: "OTP सत्यापित करें",
      verifyingOtpBtn: "सत्यापित हो रहा है...",
      changeMobileBtn: "मोबाइल नंबर बदलें",
      otpSentToMobile: "+91 {{mobile}} पर OTP भेजा गया",
      createNewPasswordTitle: "नया पासवर्ड बनाएं",
      newPasswordDesc: "अपने खाते के लिए एक मजबूत पासवर्ड दर्ज करें",
      confirmNewPasswordLabel: "अपने नए पासवर्ड की पुष्टि करें",
      resettingPasswordBtn: "रीसेट हो रहा है...",
      mobileValidationErr: "कृपया एक मान्य 10-अंकीय मोबाइल नंबर दर्ज करें",
      otpValidationErr: "कृपया 6-अंकीय OTP दर्ज करें",
      passwordResetSuccessMsg:
        "पासवर्ड सफलतापूर्वक रीसेट किया गया। अब आप अपने नए पासवर्ड से लॉगिन कर सकते हैं।",
      invalidMobileErr: "इस मोबाइल नंबर से कोई खाता नहीं मिला",
      otpExpiredErr: "OTP समाप्त हो गया है। कृपया एक नया अनुरोध करें",
      invalidOtpErr: "अमान्य OTP। कृपया जांचें और पुनः प्रयास करें",
      tooManyAttemptsErr: "बहुत अधिक असफल प्रयास। कृपया बाद में प्रयास करें",
      enterMobilePlaceholder: "10-अंकीय मोबाइल नंबर दर्ज करें",
      enterOtpPlaceholder: "6-अंकीय OTP दर्ज करें",

      // Student Portal
      knowledgeBase: "नॉलेज बेस",
      knowledgeBaseTitle: "नॉलेज बेस",
      browseArticles: "लेख ब्राउज़ करें और सामान्य प्रश्नों के उत्तर खोजें",
      searchArticlesPlaceholder: "लेख खोजें...",
      loadingArticles: "लेख लोड हो रहे हैं...",
      noArticlesAvailable: "अभी तक कोई लेख उपलब्ध नहीं है",
      backToArticles: "लेखों पर वापस जाएं",
      recentlyUpdated: "हाल ही में अपडेट किया गया",
      discoverKnowledgeBase:
        "उत्तर, गाइड और संसाधन खोजें जो आपकी सफलता में मदद करें",
      searchForArticles: "लेख, गाइड या विषय खोजें...",
      login: "लॉग इन",
      submitOnline: "ऑनलाइन सबमिट करें",
      visitCenter: "सेंटर पर जाएं",
      submitYourTicket: "अपना प्रश्न सबमिट करें",
      submitTicket: "प्रश्न सबमिट करें",
      submitting: "सबमिट हो रहा है...",
      ticketSubmittedSuccessfully: "प्रश्न सफलतापूर्वक सबमिट किया गया!",
      findNearestCenter: "निकटतम सेंटर खोजें",
      allCenters: "सभी सेंटर",
      byState: "राज्य के अनुसार",
      byCity: "शहर के अनुसार",
      byPincode: "पिनकोड के अनुसार",
      list: "सूची",
      map: "नक्शा",
      searchPlaceholder: "शहर, राज्य या पिनकोड के अनुसार खोजें...",
      searchByCity: "शहर के अनुसार खोजें...",
      searchByPincode: "पिनकोड के अनुसार खोजें...",
      sortBy: "क्रमबद्ध करें",
      sortDistrict: "क्रमबद्ध: जिला",
      sortDistance: "क्रमबद्ध: दूरी",
      sortAlphabetical: "क्रमबद्ध: अ-ज्ञ",
      sortByDistrict: "जिले के अनुसार क्रमबद्ध करें",
      sortByDistance: "दूरी के अनुसार क्रमबद्ध करें",
      sortByAlphabetical: "वर्णमाला क्रम में क्रमबद्ध करें (अ-ज्ञ)",
      clearSort: "क्रम साफ़ करें",
      noCentersFound: "कोई सेंटर नहीं मिला",
      address: "पता",
      phone: "फोन",
      email: "ईमेल",
      workingHours: "कार्य समय",
      availableFeatures: "उपलब्ध सुविधाएं",
      getDirections: "दिशा निर्देश प्राप्त करें",
      goToLoginPage: "लॉगिन पेज पर जाएं",

      // Student Dashboard
      myTickets: "मेरे प्रश्न",
      noTicketsYet: "अभी तक कोई प्रश्न नहीं",
      noTicketsMessage: "आपने अभी तक कोई प्रश्न सबमिट नहीं किया है।",
      submitYourFirstTicket: "अपना पहला प्रश्न सबमिट करें",
      submitNewTicket: "नया प्रश्न सबमिट करें",
      dashboard: "डैशबोर्ड",
      logout: "लॉग आउट",
      category: "श्रेणी",
      status: "स्थिति",
      priority: "प्राथमिकता",
      assignedTo: "को सौंपा गया",
      createdAt: "बनाया गया",

      // Student Login Modal
      studentLogin: "छात्र लॉगिन",
      enterEmailToLogin: "लॉगिन करने के लिए अपना ईमेल दर्ज करें",
      verifyYourEmail: "अपना ईमेल सत्यापित करें",
      enterOtpSentToEmail: "अपने ईमेल पर भेजा गया 6-अंकीय कोड दर्ज करें",
      createYourPassword: "अपना पासवर्ड बनाएं",
      setPasswordForAccount: "अपने खाते के लिए पासवर्ड सेट करें",
      setPassword: "पासवर्ड सेट करें",
      settingPassword: "पासवर्ड सेट हो रहा है...",
      passwordSetSuccessfully: "पासवर्ड सफलतापूर्वक सेट किया गया!",
      passwordCreatedMessage:
        "आपका पासवर्ड बना दिया गया है। कृपया अपने खाते तक पहुंचने के लिए अपने ईमेल और नए पासवर्ड से लॉगिन करें।",
      alreadyHavePassword: "पहले से पासवर्ड है?",
      loginWithPassword: "पासवर्ड से लॉगिन करें",
      loginWithOtp: "OTP से लॉगिन करें",
      firstTimeUser: "पहली बार उपयोगकर्ता?",
      getOtpToSetup: "पासवर्ड सेटअप के लिए OTP प्राप्त करें",

      // View Mode Toggle
      viewMode: {
        label: "देखने का तरीका",
        single: "एकल परियोजना",
        unified: "सभी परियोजनाएं",
        singleProject: "एकल परियोजना दृश्य",
        allProjects: "सभी परियोजनाएं दृश्य",
      },
    },
  },
  mr: {
    translation: {
      // App Title
      appTitle: "भारत सरकार",
      appSubtitle: "डिजिटल इंडिया उपक्रम",

      // Login Page
      welcomeTitle: "हेल्पडेस्कमध्ये आपले स्वागत",
      welcomeSubtitle: "सुपर अॅडमिन पोर्टल",
      secureAccess: "सरकारी हेल्पडेस्क सेवांमध्ये सुरक्षित प्रवेश",

      // Form Labels
      emailLabel: "ईमेल पत्ता",
      passwordLabel: "पासवर्ड",
      emailPlaceholder: "आपला अधिकृत ईमेल पत्ता टाका",
      passwordPlaceholder: "आपला पासवर्ड टाका",
      passwordMinLength: "किमान ६ अक्षरे आवश्यक",

      // Buttons
      loginButton: "लॉग इन",
      signingIn: "साइन इन करत आहे...",
      signInToContinue: "सुरू ठेवण्यासाठी साइन इन करा",
      forgotPassword: "आपला पासवर्ड विसरलात?",
      sendOtp: "OTP पाठवा",
      sendingOtp: "OTP पाठवत आहे...",
      verifyOtp: "OTP तपासा",
      verifyingOtp: "तपासत आहे...",
      resetPassword: "पासवर्ड रीसेट करा",
      resettingPassword: "रीसेट करत आहे...",
      backToLogin: "लॉगिनकडे परत जा",

      // Validation Messages
      required: "हे फील्ड आवश्यक आहे",
      emailRequired: "ईमेल पत्ता आवश्यक आहे",
      emailInvalid: "कृपया वैध ईमेल पत्ता टाका",
      passwordRequired: "पासवर्ड आवश्यक आहे",
      passwordMinLengthError: "पासवर्डमध्ये किमान ६ अक्षरे असावीत",
      otpRequired: "OTP आवश्यक आहे",
      otpInvalid: "कृपया वैध ६-अंकी OTP टाका",
      passwordMismatch: "पासवर्ड जुळत नाहीत",

      // Error Messages
      loginFailed: "अवैध क्रेडेन्शियल्स. कृपया पुन्हा प्रयत्न करा.",
      networkError: "नेटवर्क त्रुटी. कृपया आपले कनेक्शन तपासा.",
      emailNotFound: "आमच्या रेकॉर्डमध्ये ईमेल पत्ता सापडला नाही.",
      invalidOtp: "अवैध किंवा कालबाह्य OTP. कृपया पुन्हा प्रयत्न करा.",
      passwordResetFailed: "पासवर्ड रीसेट अयशस्वी. कृपया पुन्हा प्रयत्न करा.",

      // Success Messages
      otpSent: "OTP आपल्या ईमेल पत्त्यावर पाठवला गेला आहे.",
      passwordResetSuccess:
        "पासवर्ड यशस्वीरित्या रीसेट झाला. कृपया आपल्या नवीन पासवर्डसह लॉगिन करा.",

      // Forgot Password
      forgotPasswordTitle: "आपला पासवर्ड रीसेट करा",
      forgotPasswordSubtitle: "OTP मिळवण्यासाठी आपला ईमेल टाका",
      otpVerificationTitle: "OTP तपासा",
      otpVerificationSubtitle: "आपल्या ईमेलवर पाठवलेला ६-अंकी कोड टाका",
      newPasswordTitle: "नवीन पासवर्ड सेट करा",
      newPasswordSubtitle: "आपल्या खात्यासाठी मजबूत पासवर्ड तयार करा",
      newPasswordLabel: "नवीन पासवर्ड",
      confirmPasswordLabel: "पासवर्डची पुष्टी करा",

      // Security & Trust
      sslSecured: "२५६-बिट SSL एन्क्रिप्शनसह सुरक्षित",
      privacyPolicy: "गोपनीयता धोरण",
      termsOfService: "सेवा अटी",
      helpSupport: "मदत आणि सहाय्य",

      // Footer
      copyright: "© २०२५ भारत सरकार. सर्व हक्क राखीव.",
      digitalIndia: "डिजिटल इंडिया उपक्रमाअंतर्गत विकसित | आवृत्ती १.०.०",

      // Accessibility
      requiredField: "आवश्यक फील्ड",
      showPassword: "पासवर्ड दाखवा",
      hidePassword: "पासवर्ड लपवा",
      skipToMain: "मुख्य सामग्रीकडे जा",
      selectLanguage: "आपली पसंतीची भाषा निवडा",
      governmentEmblem: "भारत सरकार राष्ट्रीय चिन्ह",

      // Language
      language: "भाषा",
      english: "English",
      marathi: "मराठी",

      // Mobile-based Forgot Password
      resetPasswordTitle: "पासवर्ड रीसेट करा",
      mobileNumber: "मोबाइल नंबर",
      enterMobileDesc: "आपला नोंदणीकृत मोबाइल नंबर टाका",
      sendOtpBtn: "OTP पाठवा",
      sendingOtpBtn: "OTP पाठवत आहे...",
      resendOtpBtn: "OTP पुन्हा पाठवा",
      resendOtpTimer: "{{seconds}} सेकंदात OTP पुन्हा पाठवा",
      enterOtpLabel: "OTP टाका",
      verifyOtpBtn: "OTP तपासा",
      verifyingOtpBtn: "तपासत आहे...",
      changeMobileBtn: "मोबाइल नंबर बदला",
      otpSentToMobile: "+91 {{mobile}} वर OTP पाठवला",
      createNewPasswordTitle: "नवीन पासवर्ड तयार करा",
      newPasswordDesc: "आपल्या खात्यासाठी मजबूत पासवर्ड टाका",
      confirmNewPasswordLabel: "आपल्या नवीन पासवर्डची पुष्टी करा",
      resettingPasswordBtn: "रीसेट करत आहे...",
      mobileValidationErr: "कृपया वैध १०-अंकी मोबाइल नंबर टाका",
      otpValidationErr: "कृपया ६-अंकी OTP टाका",
      passwordResetSuccessMsg:
        "पासवर्ड यशस्वीरित्या रीसेट झाला. कृपया आपल्या नवीन पासवर्डसह लॉगिन करा.",
      invalidMobileErr: "या मोबाइल नंबरसह कोणतेही खाते सापडले नाही",
      otpExpiredErr: "OTP कालबाह्य झाला आहे. कृपया नवीन विनंती करा",
      invalidOtpErr: "अवैध OTP. कृपया तपासा आणि पुन्हा प्रयत्न करा",
      tooManyAttemptsErr: "बरेच अयशस्वी प्रयत्न. कृपया नंतर प्रयत्न करा",
      enterMobilePlaceholder: "१०-अंकी मोबाइल नंबर टाका",
      enterOtpPlaceholder: "६-अंकी OTP टाका",

      // Student Portal
      knowledgeBase: "ज्ञान आधार",
      knowledgeBaseTitle: "ज्ञान केंद्र",
      browseArticles: "लेख ब्राउझ करा आणि सामान्य प्रश्नांची उत्तरे शोधा",
      searchArticlesPlaceholder: "लेख शोधा...",
      loadingArticles: "लेख लोड होत आहेत...",
      noArticlesAvailable: "अद्याप कोणतेही लेख उपलब्ध नाहीत",
      backToArticles: "लेखांकडे परत जा",
      recentlyUpdated: "अलीकडे अपडेट केले",
      discoverKnowledgeBase:
        "उत्तरे, मार्गदर्शक आणि संसाधने शोधा जी तुम्हाला यशस्वी होण्यास मदत करतील",
      searchForArticles: "लेख, मार्गदर्शक किंवा विषय शोधा...",
      login: "लॉग इन",
      submitOnline: "ऑनलाइन सबमिट करा",
      visitCenter: "सेंटरला भेट द्या",
      submitYourTicket: "आपला प्रश्न सबमिट करा",
      submitTicket: "प्रश्न सबमिट करा",
      submitting: "सबमिट करत आहे...",
      ticketSubmittedSuccessfully: "प्रश्न यशस्वीरित्या सबमिट केला!",
      findNearestCenter: "जवळचे सेंटर शोधा",
      allCenters: "सर्व सेंटर",
      byState: "राज्यानुसार",
      byCity: "शहरानुसार",
      byPincode: "पिनकोडनुसार",
      list: "यादी",
      map: "नकाशा",
      searchPlaceholder: "शहर, राज्य किंवा पिनकोडनुसार शोधा...",
      searchByCity: "शहरानुसार शोधा...",
      searchByPincode: "पिनकोडनुसार शोधा...",
      sortBy: "क्रमवारी लावा",
      sortDistrict: "क्रमवारी: जिल्हा",
      sortDistance: "क्रमवारी: अंतर",
      sortAlphabetical: "क्रमवारी: अ-ज्ञ",
      sortByDistrict: "जिल्ह्यानुसार क्रमवारी लावा",
      sortByDistance: "अंतरानुसार क्रमवारी लावा",
      sortByAlphabetical: "वर्णमालानुसार क्रमवारी लावा (अ-ज्ञ)",
      clearSort: "क्रमवारी साफ करा",
      noCentersFound: "कोणतेही सेंटर सापडले नाही",
      address: "पत्ता",
      phone: "फोन",
      email: "ईमेल",
      workingHours: "कार्य वेळ",
      availableFeatures: "उपलब्ध सुविधा",
      getDirections: "दिशानिर्देश मिळवा",
      goToLoginPage: "लॉगिन पेजवर जा",

      // Student Dashboard
      myTickets: "माझे प्रश्न",
      noTicketsYet: "अद्याप कोणताही प्रश्न नाही",
      noTicketsMessage: "आपण अद्याप कोणताही प्रश्न सबमिट केलेला नाही.",
      submitYourFirstTicket: "आपला पहिला प्रश्न सबमिट करा",
      submitNewTicket: "नवीन प्रश्न सबमिट करा",
      dashboard: "डॅशबोर्ड",
      logout: "लॉग आउट",
      category: "श्रेणी",
      status: "स्थिती",
      priority: "प्राधान्य",
      assignedTo: "यांना नियुक्त केले",
      createdAt: "तयार केले",

      // Student Login Modal
      studentLogin: "विद्यार्थी लॉगिन",
      enterEmailToLogin: "लॉगिन करण्यासाठी आपला ईमेल टाका",
      verifyYourEmail: "आपला ईमेल तपासा",
      enterOtpSentToEmail: "आपल्या ईमेलवर पाठवलेला ६-अंकी कोड टाका",
      createYourPassword: "आपला पासवर्ड तयार करा",
      setPasswordForAccount: "आपल्या खात्यासाठी पासवर्ड सेट करा",
      setPassword: "पासवर्ड सेट करा",
      settingPassword: "पासवर्ड सेट करत आहे...",
      passwordSetSuccessfully: "पासवर्ड यशस्वीरित्या सेट केला!",
      passwordCreatedMessage:
        "आपला पासवर्ड तयार केला गेला आहे. कृपया आपल्या खात्यात प्रवेश करण्यासाठी आपल्या ईमेल आणि नवीन पासवर्डसह लॉगिन करा.",
      alreadyHavePassword: "आधीच पासवर्ड आहे?",
      loginWithPassword: "पासवर्डसह लॉगिन करा",
      loginWithOtp: "OTP सह लॉगिन करा",
      firstTimeUser: "प्रथमच वापरकर्ता?",
      getOtpToSetup: "पासवर्ड सेटअपसाठी OTP मिळवा",

      // View Mode Toggle
      viewMode: {
        label: "पाहण्याची पद्धत",
        single: "एकच प्रकल्प",
        unified: "सर्व प्रकल्प",
        singleProject: "एकच प्रकल्प दृश्य",
        allProjects: "सर्व प्रकल्प दृश्य",
      },
    },
  },
};

// Get saved language, validate it's a supported language, default to English
const getSavedLanguage = (): string => {
  const saved = localStorage.getItem("preferredLanguage");
  // Only accept valid language codes, otherwise default to English
  if (saved && ["en", "mr", "hi"].includes(saved)) {
    return saved;
  }
  return "en"; // Default to English
};

i18n.use(initReactI18next).init({
  resources,
  lng: getSavedLanguage(), // Load saved language or default to English
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
