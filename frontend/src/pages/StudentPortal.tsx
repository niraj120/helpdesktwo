import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import axios from "axios";
import {
  MapPinIcon,
  PhoneIcon,
  EnvelopeIcon,
  ClockIcon,
  DocumentArrowUpIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  BookOpenIcon,
} from "@heroicons/react/24/outline";
import { StudentLoginModal } from "../components/StudentLoginModal";
import { LanguageToggle } from "../components/LanguageToggle";
import KnowledgeBaseViewer from "../components/knowledge-base/KnowledgeBaseViewer";
import WhatsAppFloatingIcon from "../components/WhatsAppFloatingIcon";
import { useBranding } from "../contexts/BrandingContext";
import { API_CONFIG } from "../config/constants";
import HierarchyCategorySelector, {
  CategoryHierarchyValue,
  useHierarchyConfig,
} from "../components/HierarchyCategorySelector";
import { conditionEngine, FormFieldSchema } from "../utils/conditionEngine";
import "./StudentPortal.css";

// Google Maps type declarations
declare global {
  interface Window {
    google: any;
  }
}

interface ProjectBranding {
  projectId: string;
  name: string;
  customUrlPath: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string | null;
  logoLinkbackUrl?: string;
  welcomeText: string;
  footerText: string;
  knowledgeBase?: boolean;
  sso?: {
    enabled: boolean;
    keycloak: { authUrl: string; clientId: string; redirectUri: string } | null;
  };
  footerLinks?: {
    copyright?: string;
    termsOfUse?: string;
    privacyPolicy?: string;
    cookiePolicy?: string;
  };
  branding?: {
    colorTheme?: {
      primary: string;
      secondary: string;
      accent?: string;
      background?: string;
    };
    logo?: string;
    headerText?: string;
    logoLinkbackUrl?: string;
  };
}

interface OnlineFormField {
  fieldName: string;
  fieldType:
    | "text"
    | "number"
    | "date"
    | "email"
    | "phone"
    | "url"
    | "textarea"
    | "dropdown"
    | "multiselect"
    | "radio"
    | "checkbox"
    | "file";
  required: boolean;
  placeholder: string;
  options?: string[];
  // file-specific
  allowedFileTypes?: string[];
  maxFileSizeMB?: number;
  allowMultiple?: boolean;
}

interface OfflineCenter {
  _id?: string;
  centerName: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  email: string;
  workingHours: string;
  latitude?: number;
  longitude?: number;
  features?: string[];
  mapLink?: string;
  googleMapLink?: string;
  contacts?: Array<{
    name: string;
    role: string;
    mobile: string;
    email: string;
  }>;
}

// Treat empty strings and common placeholder values ("NA", "N/A", the dummy
// "NA@NA.com" email, etc.) as "not provided" so unfilled centre details are
// hidden from the public centre cards instead of showing junk.
const CENTER_PLACEHOLDERS = new Set([
  "",
  "na",
  "n/a",
  "none",
  "nil",
  "null",
  "-",
  "na@na.com",
]);
const isBlankValue = (v?: string | number | null): boolean =>
  v === undefined ||
  v === null ||
  CENTER_PLACEHOLDERS.has(String(v).trim().toLowerCase());

interface TicketSubmissionSettings {
  mode: "online" | "offline" | "both";
  enableOnlineForm: boolean;
  enableOfflineCenter: boolean;
  onlineFormFields: OnlineFormField[];
  offlineCenters: OfflineCenter[];
  welcomeMessage?: string;
  successMessage?: string;
  announcement?: string;
}

interface StudentPortalProps {
  hideHeader?: boolean;
}

const StudentPortal: React.FC<StudentPortalProps> = ({
  hideHeader = false,
}) => {
  const { customUrlPath } = useParams<{ customUrlPath: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { branding: contextBranding, loading: brandingLoading } = useBranding();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projectBranding, setProjectBranding] =
    useState<ProjectBranding | null>(null);
  const [ticketSettings, setTicketSettings] =
    useState<TicketSubmissionSettings | null>(null);
  const [activeTab, setActiveTab] = useState<"online" | "offline" | "kb">(
    "online",
  );
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [fieldFiles, setFieldFiles] = useState<Record<string, File[]>>({}); // per-field file storage
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [validationPopup, setValidationPopup] = useState<{
    isOpen: boolean;
    errors: string[];
  }>({ isOpen: false, errors: [] });
  const [createdTicketNumber, setCreatedTicketNumber] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<
    "all" | "state" | "city" | "pincode"
  >("all");
  const [filteredCenters, setFilteredCenters] = useState<OfflineCenter[]>([]);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [uniqueStates, setUniqueStates] = useState<string[]>([]);
  const [uniqueCities, setUniqueCities] = useState<string[]>([]);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [autoLoginEmail, setAutoLoginEmail] = useState("");
  const [autoLoginPassword, setAutoLoginPassword] = useState("");

  // Read ?email and ?password from URL and auto-open login modal
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const qEmail = params.get("email");
    const qPassword = params.get("password");
    if (qEmail && qPassword) {
      setAutoLoginEmail(qEmail);
      setAutoLoginPassword(qPassword);
      setShowLoginModal(true);
      // Remove credentials from URL immediately to avoid them staying in browser history
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);
  const [sortBy, setSortBy] = useState<
    "none" | "district" | "distance" | "alphabetical"
  >("none");
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [centerCoordinates, setCenterCoordinates] = useState<
    Map<string, { lat: number; lng: number }>
  >(new Map());
  const [kbArticles, setKbArticles] = useState<any[]>([]);
  const [kbCategories, setKbCategories] = useState<any[]>([]);
  const [kbLoading, setKbLoading] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<any | null>(null);
  const [kbSearchQuery, setKbSearchQuery] = useState("");
  const [ssoEnabled, setSsoEnabled] = useState(false);
  const [ssoConfig, setSsoConfig] = useState<{
    authUrl: string;
    clientId: string;
    redirectUri: string;
  } | null>(null);
  const [categoryHierarchy, setCategoryHierarchy] =
    useState<CategoryHierarchyValue>({});

  // Fetch project hierarchy config (drives Course → Category → Subcategory in the form)
  const { config: hierarchyConfig } = useHierarchyConfig(
    projectBranding?.projectId || "",
  );

  const fetchSpecificKBArticle = async (articleId: string) => {
    try {
      setKbLoading(true);
      const response = await axios.get(`${API_CONFIG.API_URL}/kb/${articleId}`);
      if (response.data.success) {
        setSelectedArticle(response.data.data);
        // Also fetch all articles for navigation
        if (kbArticles.length === 0) {
          fetchKBArticles();
        }
      }
    } catch (error) {
      console.error("Error fetching KB article:", error);
    } finally {
      setKbLoading(false);
    }
  };

  // Fetch KB articles when KB tab is active
  useEffect(() => {
    if (
      activeTab === "kb" &&
      projectBranding?.knowledgeBase &&
      kbArticles.length === 0
    ) {
      fetchKBArticles();
    }
  }, [activeTab]);

  const fetchKBArticles = async () => {
    try {
      setKbLoading(true);
      console.log(
        "Fetching KB articles for project:",
        projectBranding?.projectId,
      );
      const response = await axios.get(
        `${API_CONFIG.API_URL}/kb/project/${projectBranding?.projectId}`,
      );
      console.log("KB API Response:", response.data);

      // Handle different response structures
      if (response.data.success) {
        const articles =
          response.data.data?.articles || response.data.data || [];
        console.log("KB Articles found:", articles);
        setKbArticles(Array.isArray(articles) ? articles : []);
        setKbCategories(response.data.data?.categories || []);
      } else {
        console.log("KB API returned success=false");
      }
    } catch (error) {
      console.error("Error fetching KB articles:", error);
    } finally {
      setKbLoading(false);
    }
  };

  useEffect(() => {
    const fetchProjectData = async () => {
      console.log("📋 StudentPortal: fetchProjectData called");
      console.log("📋 contextBranding:", contextBranding);
      console.log("📋 brandingLoading:", brandingLoading);

      // Use branding from context if available
      if (contextBranding && !brandingLoading) {
        const colorTheme =
          contextBranding.branding?.colorTheme || contextBranding.colorTheme;

        const branding: ProjectBranding = {
          projectId: contextBranding.projectId || "",
          name: contextBranding.name || contextBranding.projectName || "",
          customUrlPath: customUrlPath || "",
          logoUrl:
            contextBranding.branding?.logo || contextBranding.logo || null,
          logoLinkbackUrl:
            contextBranding.branding?.logoLinkbackUrl ||
            (contextBranding as any).logoLinkbackUrl ||
            "",
          welcomeText: contextBranding.branding?.headerText || "Welcome!",
          footerText:
            (contextBranding as any).branding?.footerText ||
            "© 2025. All rights reserved.",
          knowledgeBase: (contextBranding as any).knowledgeBase,
          footerLinks:
            (contextBranding as any).footerLinks ||
            (contextBranding as any).configuration?.footerLinks,
          primaryColor: colorTheme?.primary || "#49bc8f",
          secondaryColor: colorTheme?.secondary || "#64748b",
          branding: {
            colorTheme,
            logo: contextBranding.branding?.logo || undefined,
            headerText: contextBranding.branding?.headerText,
            logoLinkbackUrl: contextBranding.branding?.logoLinkbackUrl,
          },
        };

        console.log(
          "📋 Setting branding from context, projectId:",
          branding.projectId,
        );
        setProjectBranding(branding);
        console.log("✅ Using branding from context (no API call)");
        // Extract SSO from context branding
        const ctxSso = (contextBranding as any).sso;
        if (ctxSso?.enabled && ctxSso.keycloak) {
          setSsoEnabled(true);
          setSsoConfig(ctxSso.keycloak);
        }
      }

      try {
        setLoading(true);
        setError(null);

        // Only fetch branding if not available from context
        let branding: ProjectBranding;
        if (!projectBranding && !contextBranding) {
          console.log("🔄 Fetching branding from API (context not available)");
          const brandingResponse = await axios.get(
            `${API_CONFIG.API_URL}/projects/branding/${customUrlPath}`,
          );

          const brandingData = brandingResponse.data.success
            ? brandingResponse.data.data
            : brandingResponse.data;

          let colorTheme = brandingData.branding?.colorTheme;
          if (typeof colorTheme === "string") {
            const parsed: any = {};
            const matches = colorTheme.match(/(\w+)=#([a-zA-Z0-9]+)/g);
            if (matches) {
              matches.forEach((match: string) => {
                const [key, value] = match.split("=");
                parsed[key] = "#" + value;
              });
              colorTheme = parsed;
            }
          }

          branding = {
            projectId: brandingData.projectId,
            name: brandingData.name,
            customUrlPath: brandingData.customUrlPath,
            logoUrl: brandingData.branding?.logo || null,
            logoLinkbackUrl:
              brandingData.branding?.logoLinkbackUrl ||
              brandingData.logoLinkbackUrl ||
              "",
            welcomeText: brandingData.branding?.headerText || "Welcome!",
            footerText:
              brandingData.branding?.footerText ||
              "© 2025. All rights reserved.",
            knowledgeBase: brandingData.knowledgeBase,
            footerLinks:
              brandingData.footerLinks ||
              brandingData.configuration?.footerLinks,
            primaryColor: colorTheme?.primary || "#49bc8f",
            secondaryColor: colorTheme?.secondary || "#64748b",
            branding: { ...brandingData.branding, colorTheme },
          };

          console.log(
            "📋 Setting branding from API, projectId:",
            branding.projectId,
          );
          setProjectBranding(branding);
          // Extract SSO config from API branding
          const apiSso = brandingData.sso;
          if (apiSso?.enabled && apiSso.keycloak) {
            setSsoEnabled(true);
            setSsoConfig(apiSso.keycloak);
          }
        } else {
          branding = projectBranding!;
          console.log(
            "📋 Using existing projectBranding, projectId:",
            branding?.projectId,
          );
        }

        // Fetch ticket submission settings (mode and form fields only)
        const cacheBuster = `?t=${Date.now()}`;
        const settingsResponse = await axios.get(
          `${API_CONFIG.API_URL}/projects/${branding.projectId}/ticket-settings${cacheBuster}`,
        );
        const ticketSettings = settingsResponse.data.success
          ? settingsResponse.data.data
          : settingsResponse.data;

        console.log("📋 Ticket settings mode:", ticketSettings.mode);
        console.log("📋 Online form fields:", ticketSettings.onlineFormFields);

        // Only fetch centers if mode is 'offline' or 'both'
        let centersData: OfflineCenter[] = [];
        if (
          ticketSettings.mode === "offline" ||
          ticketSettings.mode === "both"
        ) {
          try {
            const centersResponse = await axios.get(
              `${API_CONFIG.API_URL}/centers?projectId=${branding.projectId}&isActive=true`,
            );
            if (centersResponse.data.success) {
              centersData = centersResponse.data.data || [];
              console.log("📍 Loaded centers from centers API:", centersData);
            }
          } catch (centersError) {
            console.error("Error fetching centers:", centersError);
            // Fallback to empty array if centers API fails
            centersData = [];
          }
        } else {
          console.log(
            "📍 Skipping offline centers fetch (mode is online only)",
          );
        }

        // Merge settings with centers data
        const mergedSettings = {
          ...ticketSettings,
          offlineCenters: centersData,
        };
        setTicketSettings(mergedSettings);

        // Set default tab based on mode
        // Check if we have a kbArticle parameter in URL
        const urlParams = new URLSearchParams(window.location.search);
        const kbArticleId = urlParams.get("kbArticle");

        if (kbArticleId && branding.knowledgeBase) {
          // If KB article is specified, switch to KB tab and load it
          setActiveTab("kb");
          // Fetch the specific article
          try {
            const response = await axios.get(
              `${API_CONFIG.API_URL}/kb/${kbArticleId}`,
            );
            if (response.data.success) {
              setSelectedArticle(response.data.data);
            }
          } catch (error) {
            console.error("Error fetching KB article:", error);
          }
        } else if (mergedSettings.mode === "online") {
          setActiveTab("online");
        } else if (mergedSettings.mode === "offline") {
          setActiveTab("offline");
        }

        // Initialize filtered centers
        setFilteredCenters(centersData || []);

        // Extract unique states and cities for filters
        if (centersData && centersData.length > 0) {
          const states = [
            ...new Set(centersData.map((c: OfflineCenter) => c.state)),
          ] as string[];
          const cities = [
            ...new Set(centersData.map((c: OfflineCenter) => c.city)),
          ] as string[];
          setUniqueStates(states.sort());
          setUniqueCities(cities.sort());
        }
      } catch (err: any) {
        console.error("Error fetching project data:", err);
        setError(err.response?.data?.message || "Project not found");
      } finally {
        setLoading(false);
      }
    };

    if (customUrlPath) {
      fetchProjectData();
    }
  }, [customUrlPath, contextBranding, brandingLoading]);

  // Get user's location for distance-based sorting
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => {
          console.log("Geolocation permission denied or unavailable:", error);
        },
      );
    }
  }, []);

  // Helper function to calculate distance between two coordinates (Haversine formula)
  const calculateDistance = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number => {
    const R = 6371; // Radius of Earth in kilometers
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  useEffect(() => {
    // Filter centers based on search query and filter type
    if (ticketSettings?.offlineCenters) {
      let filtered = ticketSettings.offlineCenters;

      // Apply search query filter
      if (searchQuery.trim()) {
        const searchLower = searchQuery.toLowerCase();
        filtered = filtered.filter((center) => {
          if (filterType === "state") {
            return center.state.toLowerCase().includes(searchLower);
          } else if (filterType === "city") {
            return center.city.toLowerCase().includes(searchLower);
          } else if (filterType === "pincode") {
            return center.pincode.includes(searchQuery);
          } else {
            // 'all' - search across all fields
            return (
              center.centerName.toLowerCase().includes(searchLower) ||
              center.city.toLowerCase().includes(searchLower) ||
              center.state.toLowerCase().includes(searchLower) ||
              center.pincode.includes(searchQuery)
            );
          }
        });
      }

      // Apply sorting
      if (sortBy === "district") {
        // Sort by state (district) alphabetically
        filtered = [...filtered].sort((a, b) => a.state.localeCompare(b.state));
      } else if (sortBy === "alphabetical") {
        // Sort by center name alphabetically
        filtered = [...filtered].sort((a, b) =>
          a.centerName.localeCompare(b.centerName),
        );
      } else if (sortBy === "distance" && userLocation) {
        console.log("🗺️ Sorting by distance. User location:", userLocation);

        // Helper function to extract coordinates from Google Maps link
        const extractCoordinatesFromLink = (
          center: OfflineCenter,
        ): { lat: number; lng: number } | null => {
          // First check if center already has coordinates
          if (center.latitude && center.longitude) {
            return { lat: center.latitude, lng: center.longitude };
          }

          const link = center.mapLink || center.googleMapLink;
          if (!link) return null;

          try {
            // Format 1: 3d<lat>!4d<lng> pattern (most common in place links)
            // e.g., 3d19.1594674!4d72.8355775
            let match = link.match(/3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/);
            if (match) {
              console.log(`✅ Found 3d/4d format: ${match[1]}, ${match[2]}`);
              return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
            }

            // Format 2: @lat,lng pattern (e.g., https://www.google.com/maps/@19.0760,72.8777,15z)
            match = link.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
            if (match) {
              console.log(`✅ Found @ format: ${match[1]}, ${match[2]}`);
              return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
            }

            // Format 3: ?q=lat,lng pattern (e.g., https://www.google.com/maps?q=19.0760,72.8777)
            match = link.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
            if (match) {
              console.log(`✅ Found q= format: ${match[1]}, ${match[2]}`);
              return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
            }

            // Format 4: /place/ or /dir/ with coordinates
            match = link.match(
              /\/(?:place|dir)\/[^\/]*@(-?\d+\.?\d*),(-?\d+\.?\d*)/,
            );
            if (match) {
              console.log(
                `✅ Found place/dir format: ${match[1]}, ${match[2]}`,
              );
              return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
            }

            // Format 5: ll= pattern
            match = link.match(/[?&]ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
            if (match) {
              console.log(`✅ Found ll= format: ${match[1]}, ${match[2]}`);
              return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
            }

            console.log(`❌ No coordinate pattern found in: ${link}`);
          } catch (e) {
            console.error("Error parsing coordinates from link:", link, e);
          }

          return null;
        };

        // For centers with shortened URLs or no coordinates, we'll use Geocoding API
        // This will be done asynchronously after initial sort
        const centersWithDistances: Array<{
          center: OfflineCenter;
          distance: number;
        }> = [];
        const centersNeedingGeocode: OfflineCenter[] = [];

        filtered.forEach((center) => {
          const coords = extractCoordinatesFromLink(center);
          if (coords) {
            const distance = calculateDistance(
              userLocation.lat,
              userLocation.lng,
              coords.lat,
              coords.lng,
            );
            console.log(`📏 ${center.centerName}: ${distance.toFixed(2)} km`);
            centersWithDistances.push({ center, distance });
          } else {
            // Will geocode based on address
            console.log(
              `🔍 ${center.centerName}: Will use geocoding for address`,
            );
            centersNeedingGeocode.push(center);
          }
        });

        // Sort by distance
        centersWithDistances.sort((a, b) => a.distance - b.distance);

        console.log(
          "✅ Sorted order:",
          centersWithDistances.map(
            (c) => `${c.center.centerName} (${c.distance.toFixed(2)} km)`,
          ),
        );

        // Extract just the centers
        const sortedWithCoords = centersWithDistances.map(
          (item) => item.center,
        );

        // Geocode centers that need it (using Google Maps Geocoding API)
        if (centersNeedingGeocode.length > 0 && window.google) {
          const geocoder = new window.google.maps.Geocoder();
          const newCoords = new Map(centerCoordinates);
          let geocodedCount = 0;
          const geocodedCenters: Array<{
            center: OfflineCenter;
            distance: number;
          }> = [];

          centersNeedingGeocode.forEach((center) => {
            const address = `${center.address}, ${center.city}, ${center.state} ${center.pincode}`;

            geocoder.geocode({ address }, (results: any, status: any) => {
              if (status === "OK" && results[0]) {
                const lat = results[0].geometry.location.lat();
                const lng = results[0].geometry.location.lng();
                const distance = calculateDistance(
                  userLocation.lat,
                  userLocation.lng,
                  lat,
                  lng,
                );

                console.log(
                  `📍 Geocoded ${center.centerName}: ${distance.toFixed(2)} km`,
                );

                // Store coordinates for this center
                const key = `${center.centerName}-${center.address}`;
                newCoords.set(key, { lat, lng });
                geocodedCenters.push({ center, distance });
                geocodedCount++;

                // When all geocoding is done, update the list
                if (geocodedCount === centersNeedingGeocode.length) {
                  // Combine and sort all centers
                  const allCentersWithDistance = [
                    ...centersWithDistances,
                    ...geocodedCenters,
                  ];
                  allCentersWithDistance.sort(
                    (a, b) => a.distance - b.distance,
                  );
                  const allSorted = allCentersWithDistance.map(
                    (item) => item.center,
                  );

                  setCenterCoordinates(newCoords);
                  setFilteredCenters(allSorted);
                }
              } else {
                geocodedCount++;
                if (geocodedCount === centersNeedingGeocode.length) {
                  // Update with what we have
                  const allCentersWithDistance = [
                    ...centersWithDistances,
                    ...geocodedCenters,
                  ];
                  allCentersWithDistance.sort(
                    (a, b) => a.distance - b.distance,
                  );
                  const allSorted = allCentersWithDistance.map(
                    (item) => item.center,
                  );

                  setCenterCoordinates(newCoords);
                  setFilteredCenters(allSorted);
                }
              }
            });
          });
        }

        // Initial display with sorted centers + centers needing geocoding at the end
        filtered = [...sortedWithCoords, ...centersNeedingGeocode];
      }

      setFilteredCenters(filtered);
    }
  }, [searchQuery, filterType, ticketSettings, sortBy, userLocation]);

  const handleInputChange = (fieldName: string, value: any) => {
    setFormData((prev) => ({ ...prev, [fieldName]: value }));
  };

  const handleFieldFileChange = (
    fieldName: string,
    files: FileList | null,
    field: OnlineFormField,
  ) => {
    if (!files || files.length === 0) return;

    const filesArray = Array.from(files);
    const maxSize = (field.maxFileSizeMB || 10) * 1024 * 1024;
    const allowedTypes = field.allowedFileTypes || [];

    // Validate file size
    const oversizedFiles = filesArray.filter((file) => file.size > maxSize);
    if (oversizedFiles.length > 0) {
      setSubmitError(
        `Some files for "${fieldName}" exceed the maximum size of ${field.maxFileSizeMB || 10} MB`,
      );
      return;
    }

    // Validate file types
    if (allowedTypes.length > 0) {
      const invalidFiles = filesArray.filter((file) => {
        const fileExt = "." + file.name.split(".").pop()?.toLowerCase();
        return !allowedTypes.includes(fileExt);
      });
      if (invalidFiles.length > 0) {
        setSubmitError(
          `Invalid file type for "${fieldName}". Allowed: ${allowedTypes.join(", ")}`,
        );
        return;
      }
    }

    // Store files keyed by field name
    if (field.allowMultiple) {
      setFieldFiles((prev) => ({
        ...prev,
        [fieldName]: [...(prev[fieldName] || []), ...filesArray],
      }));
    } else {
      setFieldFiles((prev) => ({ ...prev, [fieldName]: [filesArray[0]] }));
    }
    setSubmitError(null);
  };

  const removeFieldFile = (fieldName: string, fileIndex: number) => {
    setFieldFiles((prev) => {
      const updated = { ...prev };
      updated[fieldName] = (updated[fieldName] || []).filter(
        (_, i) => i !== fileIndex,
      );
      if (updated[fieldName].length === 0) delete updated[fieldName];
      return updated;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);

    try {
      // Validate required fields — respects condition engine visibility rules
      const allFields =
        (ticketSettings?.onlineFormFields as FormFieldSchema[]) || [];
      const { visibleFields, requiredFields } = conditionEngine(
        allFields,
        formData,
      );
      const missingFields = Array.from(requiredFields).filter(
        (fieldName) =>
          !formData[fieldName] && !(fieldFiles[fieldName]?.length > 0),
      );

      const validationErrors: string[] = [];

      if (missingFields.length > 0) {
        missingFields.forEach((fieldName) => {
          const f = allFields.find((fi) => fi.fieldName === fieldName);
          validationErrors.push((f as any)?.displayLabel || fieldName);
        });
      }

      // Validate field-level rules (minLength, maxLength, regex) for visible fields
      for (const field of allFields) {
        if (!visibleFields.has(field.fieldName)) continue;
        const v = (field as any).validation;
        if (!v) continue;
        const rawValue = formData[field.fieldName];
        const value = rawValue == null ? "" : String(rawValue);
        // Skip empty optional fields — required check was already done above
        if (!value) continue;
        const label = (field as any).displayLabel || field.fieldName;
        if (v.minLength != null && value.length < Number(v.minLength)) {
          validationErrors.push(
            `${label} must be at least ${v.minLength} characters`,
          );
        } else if (v.maxLength != null && value.length > Number(v.maxLength)) {
          validationErrors.push(
            `${label} must be at most ${v.maxLength} characters`,
          );
        } else if (v.regex) {
          try {
            const re = new RegExp(v.regex);
            if (!re.test(value)) {
              validationErrors.push(`${label} is not in the correct format`);
            }
          } catch {
            // invalid regex pattern — skip silently
          }
        }
      }

      if (validationErrors.length > 0) {
        setValidationPopup({ isOpen: true, errors: validationErrors });
        setSubmitting(false);
        return;
      }

      // Prepare form data — only include values for visible fields
      const submitData = new FormData();
      submitData.append("projectId", projectBranding?.projectId || "");
      // Filter out the synthetic hierarchy name keys (Course, Category, Subcategory injected for conditionEngine)
      const cleanFormData = Object.fromEntries(
        Object.entries(formData).filter(([key]) => visibleFields.has(key)),
      );
      submitData.append("formData", JSON.stringify(cleanFormData));

      // Include hierarchical category selection if configured
      if (categoryHierarchy?.level1) {
        submitData.append(
          "categoryHierarchy",
          JSON.stringify(categoryHierarchy),
        );
        submitData.append("category", categoryHierarchy.level1);
      }

      // Attach per-field files — only for visible fields
      Object.keys(fieldFiles).forEach((fieldName) => {
        if (!visibleFields.has(fieldName)) return;
        fieldFiles[fieldName].forEach((file) => {
          submitData.append(fieldName, file);
        });
      });

      // Submit ticket
      const response = await axios.post(
        `${API_CONFIG.API_URL}/tickets/submit`,
        submitData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        },
      );

      const ticketNum =
        response.data.data?.ticketNumber || response.data.ticketNumber || "";
      setCreatedTicketNumber(ticketNum);
      setSubmitSuccess(true);
      setFormData({});
      setFieldFiles({});
      setCategoryHierarchy({});
    } catch (err: any) {
      console.error("Error submitting ticket:", err);
      setSubmitError(err.response?.data?.message || "Failed to submit ticket");
    } finally {
      setSubmitting(false);
    }
  };

  const renderOnlineFormField = (field: OnlineFormField) => {
    const value = formData[field.fieldName] || "";

    const commonClasses = `block w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-offset-0 focus:outline-none transition-colors`;

    switch (field.fieldType) {
      case "text":
      case "email":
      case "phone":
      case "number":
      case "date":
      case "url":
        return (
          <input
            key={field.fieldName}
            type={
              field.fieldType === "number"
                ? "text"
                : field.fieldType === "url"
                  ? "url"
                  : field.fieldType
            }
            inputMode={field.fieldType === "number" ? "numeric" : undefined}
            placeholder={field.placeholder}
            value={value}
            onChange={(e) => {
              let val = e.target.value;
              if (field.fieldType === "number") {
                val = val.replace(/[^0-9]/g, "");
              }
              handleInputChange(field.fieldName, val);
            }}
            required={field.required}
            className={`${commonClasses} focus:ring-2`}
            style={{
              borderColor: "#e5e7eb",
              ["--tw-ring-color" as any]: projectBranding?.primaryColor,
            }}
          />
        );
      case "textarea":
        return (
          <textarea
            key={field.fieldName}
            placeholder={field.placeholder}
            value={value}
            onChange={(e) => handleInputChange(field.fieldName, e.target.value)}
            required={field.required}
            rows={4}
            className={`${commonClasses} focus:ring-2`}
            style={{
              borderColor: "#e5e7eb",
              ["--tw-ring-color" as any]: projectBranding?.primaryColor,
            }}
          />
        );
      case "dropdown":
        return (
          <select
            key={field.fieldName}
            value={value}
            onChange={(e) => handleInputChange(field.fieldName, e.target.value)}
            required={field.required}
            className={`${commonClasses} focus:ring-2`}
            style={{
              borderColor: "#e5e7eb",
              ["--tw-ring-color" as any]: projectBranding?.primaryColor,
            }}
          >
            <option value="">{field.placeholder}</option>
            {field.options?.map((option, idx) => (
              <option key={idx} value={option}>
                {option}
              </option>
            ))}
          </select>
        );
      case "multiselect":
        return (
          <select
            key={field.fieldName}
            multiple
            value={Array.isArray(value) ? value : []}
            onChange={(e) => {
              const selected = Array.from(
                e.target.selectedOptions,
                (opt) => opt.value,
              );
              handleInputChange(field.fieldName, selected);
            }}
            required={field.required}
            className={`${commonClasses} focus:ring-2`}
            style={{
              borderColor: "#e5e7eb",
              ["--tw-ring-color" as any]: projectBranding?.primaryColor,
              minHeight: "120px",
            }}
          >
            {field.options?.map((option, idx) => (
              <option key={idx} value={option}>
                {option}
              </option>
            ))}
          </select>
        );
      case "radio":
        return (
          <div key={field.fieldName} className="flex flex-col gap-2">
            {field.options?.map((option, idx) => (
              <label
                key={idx}
                className="flex items-center gap-2 cursor-pointer"
              >
                <input
                  type="radio"
                  name={field.fieldName}
                  value={option}
                  checked={value === option}
                  onChange={(e) =>
                    handleInputChange(field.fieldName, e.target.value)
                  }
                  required={field.required && idx === 0}
                  className="w-4 h-4 cursor-pointer"
                  style={{ accentColor: projectBranding?.primaryColor }}
                />
                <span className="text-sm text-gray-700">{option}</span>
              </label>
            ))}
          </div>
        );
      case "checkbox":
        return (
          <div key={field.fieldName} className="flex flex-col gap-2">
            {field.options?.map((option, idx) => (
              <label
                key={idx}
                className="flex items-center gap-2 cursor-pointer"
              >
                <input
                  type="checkbox"
                  value={option}
                  checked={Array.isArray(value) && value.includes(option)}
                  onChange={(e) => {
                    const current = Array.isArray(value) ? value : [];
                    if (e.target.checked) {
                      handleInputChange(field.fieldName, [...current, option]);
                    } else {
                      handleInputChange(
                        field.fieldName,
                        current.filter((v) => v !== option),
                      );
                    }
                  }}
                  className="w-4 h-4 cursor-pointer"
                  style={{ accentColor: projectBranding?.primaryColor }}
                />
                <span className="text-sm text-gray-700">{option}</span>
              </label>
            ))}
          </div>
        );
      case "file":
        return (
          <div key={field.fieldName}>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              <DocumentArrowUpIcon className="w-12 h-12 text-gray-400 mx-auto mb-2" />
              <label className="cursor-pointer">
                <span
                  className="text-sm font-medium hover:underline"
                  style={{ color: projectBranding?.primaryColor }}
                >
                  {t("clickToUpload", "Click to Upload")}
                </span>
                <input
                  type="file"
                  multiple={field.allowMultiple}
                  onChange={(e) =>
                    handleFieldFileChange(
                      field.fieldName,
                      e.target.files,
                      field,
                    )
                  }
                  className="hidden"
                />
              </label>
              <p className="text-xs text-gray-500 mt-1">
                Max size: {field.maxFileSizeMB || 10} MB
                {(field.allowedFileTypes || []).length > 0 &&
                  ` | Allowed: ${field.allowedFileTypes?.join(", ")}`}
              </p>
            </div>
            {fieldFiles[field.fieldName] &&
              fieldFiles[field.fieldName].length > 0 && (
                <ul className="mt-4 space-y-2">
                  {fieldFiles[field.fieldName].map((file, idx) => (
                    <li
                      key={idx}
                      className="flex items-center justify-between bg-gray-50 p-3 rounded-lg"
                    >
                      <span className="text-sm text-gray-700">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => removeFieldFile(field.fieldName, idx)}
                        className="text-red-600 hover:text-red-700 text-sm font-medium"
                      >
                        {t("remove")}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
          </div>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-blue-50">
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-gray-600 font-medium">{t("loadingPortal")}</p>
        </div>
      </div>
    );
  }

  if (error || !projectBranding || !ticketSettings) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-50">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <ExclamationCircleIcon className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {t("portalNotFound")}
          </h2>
          <p className="text-gray-600 mb-6">
            {error || t("portalNotFoundMessage")}
          </p>
          <button
            onClick={() => navigate("/")}
            className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            {t("goBack")}
          </button>
        </div>
      </div>
    );
  }

  const showOnline =
    ticketSettings.mode === "online" || ticketSettings.mode === "both";
  const showOffline =
    ticketSettings.mode === "offline" || ticketSettings.mode === "both";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Modern Header with Logo */}
      {!hideHeader && (
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16 sm:h-20">
              {/* Logo and Brand */}
              <div className="flex items-center space-x-2 sm:space-x-4 flex-1 min-w-0">
                {projectBranding.logoUrl &&
                  (projectBranding.logoLinkbackUrl ? (
                    <a
                      href={
                        projectBranding.logoLinkbackUrl.startsWith("http")
                          ? projectBranding.logoLinkbackUrl
                          : `https://${projectBranding.logoLinkbackUrl}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0"
                    >
                      <img
                        src={projectBranding.logoUrl}
                        alt={projectBranding.name}
                        loading="lazy"
                        className="h-8 sm:h-12 w-auto cursor-pointer hover:opacity-80 transition-opacity"
                      />
                    </a>
                  ) : (
                    <img
                      src={projectBranding.logoUrl}
                      alt={projectBranding.name}
                      loading="lazy"
                      className="h-8 sm:h-12 w-auto flex-shrink-0"
                    />
                  ))}
                <div className="min-w-0">
                  <h1 className="text-base sm:text-xl font-bold text-gray-900 truncate">
                    {projectBranding.name}
                  </h1>
                  <p className="text-xs sm:text-sm text-gray-500 truncate hidden sm:block">
                    {projectBranding.welcomeText}
                  </p>
                </div>
              </div>

              {/* Right Side Actions */}
              <div className="flex items-center space-x-2 sm:space-x-3 flex-shrink-0">
                <LanguageToggle />
                <button
                  onClick={() => setShowLoginModal(true)}
                  className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all hover:shadow-md"
                  style={{
                    backgroundColor: projectBranding.primaryColor,
                    color: "white",
                  }}
                >
                  {t("login")}
                </button>
              </div>
            </div>

            {/* Modern Navigation Menu */}
            <nav className="flex space-x-1 pb-2 overflow-x-auto">
              {showOnline && (
                <button
                  onClick={() => {
                    setActiveTab("online");
                  }}
                  className={`flex items-center space-x-1 sm:space-x-2 px-3 sm:px-6 py-2 sm:py-3 rounded-t-lg font-medium transition-all whitespace-nowrap ${
                    activeTab === "online"
                      ? "text-white shadow-md"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                  style={{
                    backgroundColor:
                      activeTab === "online"
                        ? projectBranding.primaryColor
                        : "transparent",
                  }}
                >
                  <DocumentArrowUpIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span className="text-sm sm:text-base">
                    {t("submitOnline")}
                  </span>
                </button>
              )}

              {showOffline && (
                <button
                  onClick={() => {
                    setActiveTab("offline");
                    setViewMode("list");
                  }}
                  className={`flex items-center space-x-1 sm:space-x-2 px-3 sm:px-6 py-2 sm:py-3 rounded-t-lg font-medium transition-all whitespace-nowrap ${
                    activeTab === "offline"
                      ? "text-white shadow-md"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                  style={{
                    backgroundColor:
                      activeTab === "offline"
                        ? projectBranding.primaryColor
                        : "transparent",
                  }}
                >
                  <MapPinIcon className="w-5 h-5" />
                  <span>{t("findNearestCenter")}</span>
                </button>
              )}

              {projectBranding.knowledgeBase && (
                <button
                  onClick={() => setActiveTab("kb")}
                  className={`flex items-center space-x-2 px-6 py-3 rounded-t-lg font-medium transition-all ${
                    activeTab === "kb"
                      ? "text-white shadow-md"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                  style={{
                    backgroundColor:
                      activeTab === "kb"
                        ? projectBranding.primaryColor
                        : "transparent",
                  }}
                >
                  <BookOpenIcon className="w-5 h-5" />
                  <span>{t("knowledgeBase")}</span>
                </button>
              )}
            </nav>
          </div>
        </header>
      )}

      {/* Moving Announcement Banner */}
      {ticketSettings.announcement && (
        <div
          className="overflow-hidden py-3 border-b border-gray-200"
          style={{
            background: `linear-gradient(90deg, ${projectBranding.primaryColor}10 0%, ${projectBranding.secondaryColor}10 100%)`,
          }}
        >
          <div className="relative flex">
            <div className="animate-marquee whitespace-nowrap flex items-center space-x-8">
              <span className="inline-flex items-center space-x-2 text-sm font-medium px-4">
                <ExclamationCircleIcon
                  className="w-5 h-5 flex-shrink-0"
                  style={{ color: projectBranding.primaryColor }}
                />
                <span style={{ color: projectBranding.primaryColor }}>
                  {ticketSettings.announcement}
                </span>
              </span>
              <span className="inline-flex items-center space-x-2 text-sm font-medium px-4">
                <ExclamationCircleIcon
                  className="w-5 h-5 flex-shrink-0"
                  style={{ color: projectBranding.primaryColor }}
                />
                <span style={{ color: projectBranding.primaryColor }}>
                  {ticketSettings.announcement}
                </span>
              </span>
            </div>
            <div className="animate-marquee2 whitespace-nowrap flex items-center space-x-8 absolute top-0">
              <span className="inline-flex items-center space-x-2 text-sm font-medium px-4">
                <ExclamationCircleIcon
                  className="w-5 h-5 flex-shrink-0"
                  style={{ color: projectBranding.primaryColor }}
                />
                <span style={{ color: projectBranding.primaryColor }}>
                  {ticketSettings.announcement}
                </span>
              </span>
              <span className="inline-flex items-center space-x-2 text-sm font-medium px-4">
                <ExclamationCircleIcon
                  className="w-5 h-5 flex-shrink-0"
                  style={{ color: projectBranding.primaryColor }}
                />
                <span style={{ color: projectBranding.primaryColor }}>
                  {ticketSettings.announcement}
                </span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main
        className={`max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 ${hideHeader ? "py-0" : "py-4 sm:py-8"}`}
      >
        {/* Success Modal — rendered via portal to stay above all overlays */}
        {submitSuccess &&
          createPortal(
            <div className="fixed inset-0 z-[9999] flex items-center justify-center">
              {/* Backdrop */}
              <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
              {/* Dialog */}
              <div className="relative bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 text-center animate-fadeIn">
                <div className="flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mx-auto mb-4">
                  <CheckCircleIcon className="w-10 h-10 text-green-600" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  🎉{" "}
                  {t("querySubmittedSuccess", "Query Submitted Successfully!")}
                </h2>
                {createdTicketNumber && (
                  <div className="my-3 px-4 py-2 bg-blue-50 rounded-lg border border-blue-200 inline-block">
                    <span className="text-sm text-blue-600 font-medium">
                      Ticket Number
                    </span>
                    <p className="text-xl font-bold text-blue-800 mt-0.5">
                      {createdTicketNumber}
                    </p>
                  </div>
                )}
                <p className="text-gray-600 mb-6">
                  {ticketSettings.successMessage ||
                    t(
                      "querySubmittedMessage",
                      "Your ticket has been submitted. Our team will get back to you soon.",
                    )}
                </p>
                <button
                  onClick={() => setSubmitSuccess(false)}
                  className="px-6 py-2.5 rounded-lg text-white font-medium"
                  style={{
                    background: projectBranding?.primaryColor || "#2563eb",
                  }}
                >
                  {t("close") || "Close"}
                </button>
              </div>
            </div>,
            document.body,
          )}

        {/* Error Message */}
        {submitError && (
          <div
            className="mb-6 rounded-xl p-6 flex items-start space-x-4 shadow-lg animate-fadeIn"
            style={{
              background: `linear-gradient(135deg, #ef444415 0%, #ef444425 100%)`,
              border: "1px solid #ef4444",
            }}
          >
            <ExclamationCircleIcon className="w-7 h-7 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-lg font-bold text-red-900 mb-1">
                ⚠️ {t("submissionError")}
              </h3>
              <p className="text-red-700 font-medium">{submitError}</p>
            </div>
          </div>
        )}

        {/* Validation Error Popup */}
        {validationPopup.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
              <div className="bg-red-500 px-6 py-6 flex flex-col items-center text-white">
                <div className="bg-white/20 rounded-full p-3 mb-3">
                  <svg
                    className="h-10 w-10 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                    />
                  </svg>
                </div>
                <h2 className="text-xl font-bold tracking-tight">
                  Validation Error
                </h2>
                <p className="text-red-100 text-sm mt-1">
                  Please fix the following before submitting
                </p>
              </div>
              <div className="px-6 py-5">
                <ul className="space-y-2">
                  {validationPopup.errors.map((err, idx) => (
                    <li
                      key={idx}
                      className="flex items-center gap-3 text-sm text-gray-700"
                    >
                      <span className="flex-shrink-0 w-5 h-5 bg-red-100 rounded-full flex items-center justify-center">
                        <svg
                          className="w-3 h-3 text-red-600"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={3}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </span>
                      <span className="font-medium">{err}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="px-6 pb-6">
                <button
                  type="button"
                  onClick={() =>
                    setValidationPopup({ isOpen: false, errors: [] })
                  }
                  className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors"
                >
                  OK, I'll Fix It
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Content Area with Modern Card Design */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-200">
          {/* Online Form View */}
          {showOnline && activeTab === "online" && (
            <div className="p-4 sm:p-8 md:p-12">
              <div className="mb-6 sm:mb-8">
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
                  {t("submitYourTicket")}
                </h2>
                <p className="text-sm sm:text-base text-gray-600">
                  {ticketSettings.welcomeMessage ||
                    t(
                      "fillFormToSubmit",
                      "Welcome! Submit your query below and our team will assist you.",
                    )}
                </p>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
                {/* Fixed profile fields (Name, Email, Phone) */}
                {ticketSettings.onlineFormFields
                  .filter((f: any) => f.isFixed)
                  .map((field) => (
                    <div key={field.fieldName} className="group">
                      <label className="block text-sm font-semibold text-gray-800 mb-2">
                        {field.fieldName}
                        {field.required && (
                          <span className="text-red-500 ml-1">*</span>
                        )}
                      </label>
                      {renderOnlineFormField(field)}
                    </div>
                  ))}

                {/* Hierarchy selector (Course → Category → Subcategory etc.) */}
                {projectBranding && hierarchyConfig && (
                  <HierarchyCategorySelector
                    projectId={projectBranding.projectId}
                    value={categoryHierarchy}
                    onChange={(newValue) => {
                      setCategoryHierarchy(newValue);
                      // Inject level names into formData so conditionEngine can evaluate
                      // rules like "When Subcategory equals 'Fees paid but not reflecting'"
                      if (hierarchyConfig?.levels) {
                        const nameUpdates: Record<string, string> = {};
                        (hierarchyConfig.levels as any[]).forEach((l) => {
                          const nameKey =
                            `level${l.levelNumber}Name` as keyof CategoryHierarchyValue;
                          nameUpdates[l.displayName] =
                            (newValue[nameKey] as string) || "";
                        });
                        setFormData((prev) => ({ ...prev, ...nameUpdates }));
                      }
                    }}
                    mode="online"
                    showValidation={false}
                  />
                )}

                {/* Custom form fields — visibility driven by conditionEngine (admin-configured rules) */}
                {(() => {
                  const allFields =
                    ticketSettings.onlineFormFields as FormFieldSchema[];
                  const { visibleFields, requiredFields } = conditionEngine(
                    allFields,
                    formData,
                  );
                  return allFields
                    .filter((f) => !f.isFixed && visibleFields.has(f.fieldName))
                    .map((field) => (
                      <div key={field.fieldName} className="group">
                        <label className="block text-sm font-semibold text-gray-800 mb-2">
                          {field.fieldName}
                          {requiredFields.has(field.fieldName) && (
                            <span className="text-red-500 ml-1">*</span>
                          )}
                        </label>
                        {renderOnlineFormField(field as OnlineFormField)}
                      </div>
                    ));
                })()}

                {/* Submit Button with Modern Design */}
                <div className="pt-4">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-4 px-6 rounded-xl text-white font-bold text-lg shadow-lg hover:shadow-2xl transform hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden group"
                    style={{
                      background: `linear-gradient(135deg, ${projectBranding.primaryColor} 0%, ${projectBranding.secondaryColor} 100%)`,
                    }}
                  >
                    <span className="relative z-10 flex items-center justify-center space-x-2">
                      {submitting ? (
                        <>
                          <svg
                            className="animate-spin h-5 w-5"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            ></circle>
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            ></path>
                          </svg>
                          <span>{t("submitting")}</span>
                        </>
                      ) : (
                        <>
                          <DocumentArrowUpIcon className="w-6 h-6" />
                          <span>{t("submitTicket")}</span>
                        </>
                      )}
                    </span>
                    <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity"></div>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Offline Centers View */}
          {showOffline && activeTab === "offline" && (
            <div>
              {/* Header with View Toggle */}
              <div
                className="px-4 sm:px-8 md:px-12 py-4 sm:py-6 border-b border-gray-200"
                style={{
                  background: `linear-gradient(135deg, ${projectBranding.primaryColor}08 0%, ${projectBranding.secondaryColor}08 100%)`,
                }}
              >
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 sm:gap-4">
                  <div>
                    <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mb-1 sm:mb-2">
                      {t("findNearestCenter")}
                    </h2>
                  </div>

                  {/* View Mode Toggle */}
                  <div className="flex gap-1 sm:gap-2 bg-white p-1 rounded-lg shadow-sm border border-gray-200 w-full md:w-auto">
                    <button
                      onClick={() => setViewMode("list")}
                      className={`flex items-center justify-center space-x-1 sm:space-x-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-md font-medium transition-all flex-1 md:flex-initial ${
                        viewMode === "list"
                          ? "text-white shadow-md transform scale-105"
                          : "text-gray-600 hover:bg-gray-50"
                      }`}
                      style={{
                        backgroundColor:
                          viewMode === "list"
                            ? projectBranding.primaryColor
                            : "transparent",
                      }}
                    >
                      <svg
                        className="w-4 h-4 sm:w-5 sm:h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 6h16M4 10h16M4 14h16M4 18h16"
                        />
                      </svg>
                      <span className="text-sm sm:text-base">{t("list")}</span>
                    </button>
                    <button
                      onClick={() => setViewMode("map")}
                      className={`flex items-center justify-center space-x-1 sm:space-x-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-md font-medium transition-all flex-1 md:flex-initial ${
                        viewMode === "map"
                          ? "text-white shadow-md transform scale-105"
                          : "text-gray-600 hover:bg-gray-50"
                      }`}
                      style={{
                        backgroundColor:
                          viewMode === "map"
                            ? projectBranding.primaryColor
                            : "transparent",
                      }}
                    >
                      <MapPinIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                      <span className="text-sm sm:text-base">{t("map")}</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-4 sm:p-6 md:p-8 lg:p-12">
                {/* Filter Buttons */}
                {viewMode === "list" && (
                  <div className="mb-4 flex flex-wrap gap-2">
                    <button
                      onClick={() => {
                        setFilterType("all");
                        setSearchQuery("");
                      }}
                      className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                        filterType === "all"
                          ? "text-white shadow-md"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                      style={{
                        backgroundColor:
                          filterType === "all"
                            ? projectBranding.primaryColor
                            : undefined,
                      }}
                    >
                      {t("allCenters")}
                    </button>
                    <button
                      onClick={() => {
                        setFilterType("city");
                        setSearchQuery("");
                      }}
                      className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                        filterType === "city"
                          ? "text-white shadow-md"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                      style={{
                        backgroundColor:
                          filterType === "city"
                            ? projectBranding.primaryColor
                            : undefined,
                      }}
                    >
                      By District
                    </button>
                    <button
                      onClick={() => {
                        setFilterType("pincode");
                        setSearchQuery("");
                      }}
                      className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                        filterType === "pincode"
                          ? "text-white shadow-md"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                      style={{
                        backgroundColor:
                          filterType === "pincode"
                            ? projectBranding.primaryColor
                            : undefined,
                      }}
                    >
                      {t("byPincode")}
                    </button>
                  </div>
                )}

                {/* Search and Sort */}
                {viewMode === "list" && (
                  <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row gap-3 sm:gap-4">
                    <div className="flex-1">
                      <input
                        type="text"
                        placeholder={
                          filterType === "city"
                            ? "Search by district..."
                            : filterType === "pincode"
                              ? t("searchByPincode")
                              : "Search by district, state, or pincode..."
                        }
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:outline-none"
                        style={{
                          ["--tw-ring-color" as any]:
                            projectBranding.primaryColor,
                        }}
                      />
                    </div>

                    {/* Sort Dropdown */}
                    <div className="relative w-full sm:w-auto sm:min-w-[200px]">
                      <button
                        onClick={() => setShowSortDropdown(!showSortDropdown)}
                        className="flex items-center space-x-2 px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-colors font-medium text-gray-700 w-full justify-between text-sm sm:text-base"
                      >
                        <div className="flex items-center space-x-2">
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12"
                            />
                          </svg>
                          <span>
                            {sortBy === "district"
                              ? t("sortDistrict")
                              : sortBy === "distance"
                                ? t("sortDistance")
                                : sortBy === "alphabetical"
                                  ? t("sortAlphabetical")
                                  : t("sortBy")}
                          </span>
                        </div>
                        <svg
                          className={`w-4 h-4 transition-transform ${showSortDropdown ? "rotate-180" : ""}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </button>

                      {/* Dropdown Menu */}
                      {showSortDropdown && (
                        <div className="absolute right-0 mt-2 w-full bg-white rounded-lg shadow-xl border border-gray-200 z-10 overflow-hidden">
                          <button
                            onClick={() => {
                              setSortBy("district");
                              setShowSortDropdown(false);
                            }}
                            className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors flex items-center space-x-2 ${
                              sortBy === "district" ? "font-bold" : ""
                            }`}
                            style={{
                              backgroundColor:
                                sortBy === "district"
                                  ? `${projectBranding.primaryColor}10`
                                  : "transparent",
                              color:
                                sortBy === "district"
                                  ? projectBranding.primaryColor
                                  : "inherit",
                            }}
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                              />
                            </svg>
                            <span>{t("sortByDistrict")}</span>
                            {sortBy === "district" && (
                              <svg
                                className="w-4 h-4 ml-auto"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            )}
                          </button>
                          <button
                            onClick={() => {
                              if (!userLocation) {
                                alert(
                                  "Location access is required to sort by distance. Please enable location permissions.",
                                );
                                return;
                              }
                              setSortBy("distance");
                              setShowSortDropdown(false);
                            }}
                            className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors flex items-center space-x-2 ${
                              sortBy === "distance" ? "font-bold" : ""
                            } ${!userLocation ? "opacity-50" : ""}`}
                            style={{
                              backgroundColor:
                                sortBy === "distance"
                                  ? `${projectBranding.primaryColor}10`
                                  : "transparent",
                              color:
                                sortBy === "distance"
                                  ? projectBranding.primaryColor
                                  : "inherit",
                            }}
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                              />
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                              />
                            </svg>
                            <span>{t("sortByDistance")}</span>
                            {!userLocation && (
                              <span className="text-xs text-gray-400">
                                (location required)
                              </span>
                            )}
                            {sortBy === "distance" && (
                              <svg
                                className="w-4 h-4 ml-auto"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            )}
                          </button>
                          <button
                            onClick={() => {
                              setSortBy("alphabetical");
                              setShowSortDropdown(false);
                            }}
                            className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors flex items-center space-x-2 ${
                              sortBy === "alphabetical" ? "font-bold" : ""
                            }`}
                            style={{
                              backgroundColor:
                                sortBy === "alphabetical"
                                  ? `${projectBranding.primaryColor}10`
                                  : "transparent",
                              color:
                                sortBy === "alphabetical"
                                  ? projectBranding.primaryColor
                                  : "inherit",
                            }}
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4"
                              />
                            </svg>
                            <span>{t("sortByAlphabetical")}</span>
                            {sortBy === "alphabetical" && (
                              <svg
                                className="w-4 h-4 ml-auto"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            )}
                          </button>
                          {sortBy !== "none" && (
                            <button
                              onClick={() => {
                                setSortBy("none");
                                setShowSortDropdown(false);
                              }}
                              className="w-full px-4 py-3 text-left hover:bg-red-50 transition-colors flex items-center space-x-2 border-t border-gray-200 text-red-600"
                            >
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M6 18L18 6M6 6l12 12"
                                />
                              </svg>
                              <span>{t("clearSort")}</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Map View */}
                {viewMode === "map" && (
                  <div className="h-[400px] sm:h-[500px] md:h-[600px] rounded-lg overflow-hidden border border-gray-200 shadow-lg relative">
                    <div
                      id="google-map"
                      className="w-full h-full"
                      ref={(el) => {
                        if (el && !el.dataset.initialized) {
                          el.dataset.initialized = "true";

                          // Load Google Maps Script
                          if (!window.google) {
                            const script = document.createElement("script");
                            script.src = `https://maps.googleapis.com/maps/api/js?key=AIzaSyBRFSFV0gNYtzruNYF9hoJxbUFoaOMWhD8`;
                            script.async = true;
                            script.onload = () => initMap(el);
                            document.head.appendChild(script);
                          } else {
                            initMap(el);
                          }
                        }

                        function initMap(mapElement: HTMLElement) {
                          if (!window.google) return;

                          // Default center (India)
                          const defaultCenter = { lat: 20.5937, lng: 78.9629 };

                          // Create map
                          const map = new window.google.maps.Map(mapElement, {
                            zoom: 5,
                            center: defaultCenter,
                            mapTypeControl: true,
                            fullscreenControl: true,
                          });

                          // Add markers for each center
                          const bounds = new window.google.maps.LatLngBounds();
                          let hasMarkers = false;

                          // Geocode centers that don't have coordinates
                          const geocodePromises = filteredCenters.map(
                            async (center) => {
                              let lat: number | undefined,
                                lng: number | undefined;

                              // Try to get coordinates
                              if (center.latitude && center.longitude) {
                                lat =
                                  typeof center.latitude === "number"
                                    ? center.latitude
                                    : parseFloat(String(center.latitude));
                                lng =
                                  typeof center.longitude === "number"
                                    ? center.longitude
                                    : parseFloat(String(center.longitude));
                              } else if (
                                center.mapLink ||
                                center.googleMapLink
                              ) {
                                // Try to extract coordinates from map link - supports multiple formats
                                const link: string | undefined =
                                  center.mapLink || center.googleMapLink;
                                if (link) {
                                  // Format 1: @lat,lng pattern (e.g., https://www.google.com/maps/@19.0760,72.8777,15z)
                                  let coordMatch = link.match(
                                    /@(-?\d+\.\d+),(-?\d+\.\d+)/,
                                  );
                                  if (coordMatch) {
                                    lat = parseFloat(coordMatch[1]);
                                    lng = parseFloat(coordMatch[2]);
                                  }

                                  // Format 2: ?q=lat,lng pattern (e.g., https://www.google.com/maps?q=19.0760,72.8777)
                                  if (!lat && !lng) {
                                    coordMatch = link.match(
                                      /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/,
                                    );
                                    if (coordMatch) {
                                      lat = parseFloat(coordMatch[1]);
                                      lng = parseFloat(coordMatch[2]);
                                    }
                                  }

                                  // Format 3: /place/ or /dir/ with coordinates (e.g., https://www.google.com/maps/place/@19.0760,72.8777)
                                  if (!lat && !lng) {
                                    coordMatch = link.match(
                                      /\/(?:place|dir)\/[^/]*@?(-?\d+\.\d+),(-?\d+\.\d+)/,
                                    );
                                    if (coordMatch) {
                                      lat = parseFloat(coordMatch[1]);
                                      lng = parseFloat(coordMatch[2]);
                                    }
                                  }

                                  // Format 4: ll= pattern (e.g., https://www.google.com/maps?ll=19.0760,72.8777)
                                  if (!lat && !lng) {
                                    coordMatch = link.match(
                                      /[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/,
                                    );
                                    if (coordMatch) {
                                      lat = parseFloat(coordMatch[1]);
                                      lng = parseFloat(coordMatch[2]);
                                    }
                                  }
                                }

                                // Format 5: Shortened links (maps.app.goo.gl) or links without coordinates
                                // Use Geocoding API as fallback
                                if (!lat && !lng) {
                                  try {
                                    const geocoder =
                                      new window.google.maps.Geocoder();
                                    const address = `${center.centerName}, ${center.address}, ${center.city}, ${center.state} ${center.pincode}`;
                                    const result = await new Promise<any>(
                                      (resolve, reject) => {
                                        geocoder.geocode(
                                          { address },
                                          (
                                            results: any[] | null,
                                            status: string,
                                          ) => {
                                            if (
                                              status === "OK" &&
                                              results &&
                                              results[0]
                                            ) {
                                              resolve(results[0]);
                                            } else {
                                              reject(status);
                                            }
                                          },
                                        );
                                      },
                                    );
                                    lat = result.geometry.location.lat();
                                    lng = result.geometry.location.lng();
                                  } catch (error) {
                                    console.warn(
                                      `Could not geocode ${center.centerName}:`,
                                      error,
                                    );
                                  }
                                }
                              }

                              return { center, lat, lng };
                            },
                          );

                          // Wait for all geocoding to complete
                          Promise.all(geocodePromises).then((results) => {
                            results.forEach(({ center, lat, lng }) => {
                              if (lat && lng) {
                                const position = { lat, lng };

                                // Create marker
                                const marker = new window.google.maps.Marker({
                                  position,
                                  map,
                                  title: center.centerName,
                                  animation: window.google.maps.Animation.DROP,
                                });

                                // Create info window with contacts
                                let contactsHtml = "";
                                if (
                                  center.contacts &&
                                  center.contacts.length > 0
                                ) {
                                  contactsHtml =
                                    '<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb;">';
                                  contactsHtml +=
                                    '<p style="margin: 4px 0; font-size: 12px; font-weight: bold; color: #374151;">Additional Contacts:</p>';
                                  center.contacts.forEach((contact) => {
                                    contactsHtml += `<div style="margin: 4px 0; font-size: 12px; color: #6b7280;">
                                <strong>${contact.name}</strong>${contact.role ? ` (${contact.role})` : ""}<br/>
                                📞 ${contact.mobile}${contact.email ? ` | ✉️ ${contact.email}` : ""}
                              </div>`;
                                  });
                                  contactsHtml += "</div>";
                                }

                                const infoWindow =
                                  new window.google.maps.InfoWindow({
                                    content: `
                              <div style="padding: 8px; max-width: 250px;">
                                <h3 style="font-weight: bold; margin: 0 0 8px 0; color: #1f2937;">${center.centerName}</h3>
                                <p style="margin: 4px 0; font-size: 13px; color: #4b5563;">
                                  📍 ${center.address}, ${center.city}, ${center.state}
                                </p>
                                <p style="margin: 4px 0; font-size: 13px; color: #4b5563;">
                                  📞 ${center.phone}
                                </p>
                                <p style="margin: 4px 0; font-size: 13px; color: #4b5563;">
                                  🕒 ${center.workingHours}
                                </p>
                                ${contactsHtml}
                                ${
                                  center.mapLink || center.googleMapLink
                                    ? `
                                  <a 
                                    href="${center.mapLink || center.googleMapLink}" 
                                    target="_blank"
                                    style="display: inline-block; margin-top: 8px; padding: 6px 12px; background: #3b82f6; color: white; text-decoration: none; border-radius: 4px; font-size: 12px;"
                                  >
                                    ${t("getDirections")}
                                  </a>
                                `
                                    : ""
                                }
                              </div>
                            `,
                                  });

                                marker.addListener("click", () => {
                                  infoWindow.open(map, marker);
                                });

                                bounds.extend(position);
                                hasMarkers = true;
                              }
                            });

                            // Fit bounds to show all markers
                            if (hasMarkers) {
                              map.fitBounds(bounds);

                              // Don't zoom in too much for single marker
                              const listener =
                                window.google.maps.event.addListener(
                                  map,
                                  "idle",
                                  () => {
                                    if (map.getZoom() > 15) map.setZoom(15);
                                    window.google.maps.event.removeListener(
                                      listener,
                                    );
                                  },
                                );
                            }

                            // Add user's current location
                            if (navigator.geolocation) {
                              navigator.geolocation.getCurrentPosition(
                                (position) => {
                                  const userPos = {
                                    lat: position.coords.latitude,
                                    lng: position.coords.longitude,
                                  };

                                  // User location marker (blue dot)
                                  new window.google.maps.Marker({
                                    position: userPos,
                                    map,
                                    title: "Your Location",
                                    icon: {
                                      path: window.google.maps.SymbolPath
                                        .CIRCLE,
                                      scale: 8,
                                      fillColor: "#4285F4",
                                      fillOpacity: 1,
                                      strokeColor: "#ffffff",
                                      strokeWeight: 2,
                                    },
                                  });

                                  // Center map on user if no centers with coordinates
                                  if (!hasMarkers) {
                                    map.setCenter(userPos);
                                    map.setZoom(12);
                                  }
                                },
                                () => {
                                  console.log("Geolocation permission denied");
                                },
                              );
                            }
                          });
                        }
                      }}
                    ></div>

                    {filteredCenters.filter(
                      (c) =>
                        !c.latitude &&
                        !c.longitude &&
                        !c.mapLink &&
                        !c.googleMapLink,
                    ).length > 0 && (
                      <div className="absolute top-4 left-4 right-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
                        ⚠️ Some centers don't have location coordinates. Please
                        add latitude/longitude or map links to show them on the
                        map.
                      </div>
                    )}
                  </div>
                )}

                {/* Centers List */}
                {viewMode === "list" && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                    {filteredCenters.length === 0 ? (
                      <div className="col-span-2 text-center py-12">
                        <MapPinIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                        <p className="text-gray-500 text-lg">
                          {t("noCentersMatchSearch")}
                        </p>
                      </div>
                    ) : (
                      filteredCenters.map((center, idx) => (
                        <div
                          key={idx}
                          className="bg-white border-2 border-gray-400 rounded-xl sm:rounded-2xl p-4 sm:p-6 hover-lift hover:border-gray-600 transition-all duration-300 shadow-md hover:shadow-xl flex flex-col"
                        >
                          {/* Header Section - Fixed Height */}
                          <div className="flex items-start justify-between mb-3 sm:mb-4 min-h-[60px]">
                            <div className="flex-1 min-w-0">
                              <h3 className="text-lg sm:text-xl font-bold text-gray-900 break-words">
                                {center.centerName}
                              </h3>
                              {/* Show distance if sorting by distance */}
                              {sortBy === "distance" &&
                                userLocation &&
                                (() => {
                                  // Try to get coordinates from direct values or geocoded values
                                  let lat = center.latitude;
                                  let lng = center.longitude;

                                  if (!lat || !lng) {
                                    const key = `${center.centerName}-${center.address}`;
                                    const coords = centerCoordinates.get(key);
                                    if (coords) {
                                      lat = coords.lat;
                                      lng = coords.lng;
                                    }
                                  }

                                  if (lat && lng) {
                                    return (
                                      <p className="text-sm text-gray-500 mt-1 flex items-center space-x-1">
                                        <svg
                                          className="w-4 h-4"
                                          fill="none"
                                          stroke="currentColor"
                                          viewBox="0 0 24 24"
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                                          />
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                                          />
                                        </svg>
                                        <span>
                                          {calculateDistance(
                                            userLocation.lat,
                                            userLocation.lng,
                                            lat,
                                            lng,
                                          ).toFixed(1)}{" "}
                                          km away
                                        </span>
                                      </p>
                                    );
                                  }
                                  return null;
                                })()}
                            </div>
                            <div
                              className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                              style={{
                                background: `linear-gradient(135deg, ${projectBranding.primaryColor}15 0%, ${projectBranding.secondaryColor}25 100%)`,
                              }}
                            >
                              <MapPinIcon
                                className="w-6 h-6"
                                style={{ color: projectBranding.primaryColor }}
                              />
                            </div>
                          </div>

                          {/* Contact Info Grid — only render details that are
                              actually provided (hide NA / empty placeholders) */}
                          {(() => {
                            const addressStr = [
                              center.address,
                              center.city,
                              center.state,
                            ]
                              .filter((p) => !isBlankValue(p))
                              .join(", ");
                            const fullAddress = !isBlankValue(center.pincode)
                              ? `${addressStr}${addressStr ? " - " : ""}${center.pincode}`
                              : addressStr;
                            const hasAddress = !!fullAddress;
                            const hasPhone = !isBlankValue(center.phone);
                            const hasEmail = !isBlankValue(center.email);
                            const hasHours = !isBlankValue(center.workingHours);
                            if (
                              !hasAddress &&
                              !hasPhone &&
                              !hasEmail &&
                              !hasHours
                            )
                              return null;
                            return (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                {hasAddress && (
                                  <div className="flex items-start space-x-3">
                                    <MapPinIcon className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                                    <div className="overflow-hidden">
                                      <p className="text-sm font-medium text-gray-700">
                                        {t("address")}
                                      </p>
                                      <p className="text-sm text-gray-600 line-clamp-3">
                                        {fullAddress}
                                      </p>
                                    </div>
                                  </div>
                                )}
                                {hasPhone && (
                                  <div className="flex items-start space-x-3">
                                    <PhoneIcon className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                                    <div>
                                      <p className="text-sm font-medium text-gray-700">
                                        {t("phone")}
                                      </p>
                                      <p className="text-sm text-gray-600">
                                        {center.phone}
                                      </p>
                                    </div>
                                  </div>
                                )}
                                {hasEmail && (
                                  <div className="flex items-start space-x-3">
                                    <EnvelopeIcon className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                                    <div>
                                      <p className="text-sm font-medium text-gray-700">
                                        {t("email")}
                                      </p>
                                      <p className="text-sm text-gray-600 truncate">
                                        {center.email}
                                      </p>
                                    </div>
                                  </div>
                                )}
                                {hasHours && (
                                  <div className="flex items-start space-x-3">
                                    <ClockIcon className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                                    <div>
                                      <p className="text-sm font-medium text-gray-700">
                                        {t("workingHours")}
                                      </p>
                                      <p className="text-sm text-gray-600">
                                        {center.workingHours}
                                      </p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          {/* Features Section — hidden when none are listed */}
                          {center.features && center.features.length > 0 && (
                            <div className="mt-4 pt-4 border-t border-gray-200">
                              <p className="text-sm font-medium text-gray-700 mb-2">
                                {t("availableFeatures")}
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {center.features.map((feature, featureIdx) => (
                                  <span
                                    key={featureIdx}
                                    className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                                  >
                                    {feature}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Contact Details Section — hidden when no real
                              contacts are provided */}
                          {(() => {
                            const validContacts = (center.contacts || []).filter(
                              (c) =>
                                !isBlankValue(c?.name) ||
                                !isBlankValue(c?.mobile) ||
                                !isBlankValue(c?.email),
                            );
                            if (validContacts.length === 0) return null;
                            return (
                              <div className="mt-4 pt-4 border-t border-gray-200">
                                <p className="text-sm font-medium text-gray-700 mb-3">
                                  {t("contactDetails")}
                                </p>
                                <div className="space-y-3">
                                  {validContacts.map((contact, contactIdx) => (
                                    <div key={contactIdx}>
                                      {!isBlankValue(contact.name) && (
                                        <p className="text-sm font-semibold text-gray-900">
                                          {contact.name}
                                        </p>
                                      )}
                                      {!isBlankValue(contact.role) && (
                                        <p className="text-xs text-gray-500 mb-2">
                                          {contact.role}
                                        </p>
                                      )}
                                      {!isBlankValue(contact.mobile) && (
                                        <div className="flex items-center space-x-2 mb-1">
                                          <PhoneIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                          <a
                                            href={`tel:${contact.mobile}`}
                                            className="text-sm text-gray-600 hover:text-gray-900"
                                          >
                                            {contact.mobile}
                                          </a>
                                        </div>
                                      )}
                                      {!isBlankValue(contact.email) && (
                                        <div className="flex items-center space-x-2">
                                          <EnvelopeIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                          <a
                                            href={`mailto:${contact.email}`}
                                            className="text-sm text-gray-600 hover:text-gray-900 truncate"
                                          >
                                            {contact.email}
                                          </a>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}

                          {/* Get Directions Button - Always at bottom */}
                          <div className="mt-auto pt-4 border-t border-gray-200">
                            <button
                              onClick={() => {
                                let mapUrl =
                                  center.mapLink || center.googleMapLink;
                                if (
                                  !mapUrl &&
                                  center.latitude &&
                                  center.longitude
                                ) {
                                  mapUrl = `https://www.google.com/maps?q=${center.latitude},${center.longitude}`;
                                } else if (!mapUrl) {
                                  mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                                    `${center.address}, ${center.city}, ${center.state} ${center.pincode}`,
                                  )}`;
                                }
                                window.open(mapUrl, "_blank");
                              }}
                              className="w-full py-3 px-4 rounded-xl text-white font-bold shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all flex items-center justify-center space-x-2 group"
                              style={{
                                background: `linear-gradient(135deg, ${projectBranding?.primaryColor} 0%, ${projectBranding?.secondaryColor} 100%)`,
                              }}
                            >
                              <MapPinIcon className="w-5 h-5 group-hover:animate-bounce" />
                              <span>{t("getDirections")}</span>
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Knowledge Base View */}
          {projectBranding.knowledgeBase && activeTab === "kb" && (
            <div className="p-4 md:p-8">
              <KnowledgeBaseViewer
                projectId={projectBranding.projectId}
                showControls={false}
                isStudentPortal={true}
              />
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-center text-gray-600 text-sm">
            {projectBranding.footerText}
          </p>

          {/* Footer Links */}
          {(projectBranding.footerLinks?.copyright ||
            projectBranding.footerLinks?.termsOfUse ||
            projectBranding.footerLinks?.privacyPolicy ||
            projectBranding.footerLinks?.cookiePolicy) && (
            <div className="flex flex-wrap justify-center gap-4 mt-3 text-sm">
              {projectBranding.footerLinks?.copyright && (
                <a
                  href={
                    projectBranding.footerLinks.copyright.startsWith("http")
                      ? projectBranding.footerLinks.copyright
                      : `https://${projectBranding.footerLinks.copyright}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-500 hover:text-gray-700 hover:underline transition-colors"
                >
                  Copyright
                </a>
              )}
              {projectBranding.footerLinks?.termsOfUse && (
                <a
                  href={
                    projectBranding.footerLinks.termsOfUse.startsWith("http")
                      ? projectBranding.footerLinks.termsOfUse
                      : `https://${projectBranding.footerLinks.termsOfUse}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-500 hover:text-gray-700 hover:underline transition-colors"
                >
                  Terms of Use
                </a>
              )}
              {projectBranding.footerLinks?.privacyPolicy && (
                <a
                  href={
                    projectBranding.footerLinks.privacyPolicy.startsWith("http")
                      ? projectBranding.footerLinks.privacyPolicy
                      : `https://${projectBranding.footerLinks.privacyPolicy}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-500 hover:text-gray-700 hover:underline transition-colors"
                >
                  Privacy Policy
                </a>
              )}
              {projectBranding.footerLinks?.cookiePolicy && (
                <a
                  href={
                    projectBranding.footerLinks.cookiePolicy.startsWith("http")
                      ? projectBranding.footerLinks.cookiePolicy
                      : `https://${projectBranding.footerLinks.cookiePolicy}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-500 hover:text-gray-700 hover:underline transition-colors"
                >
                  Cookie Policy
                </a>
              )}
            </div>
          )}
        </div>
      </footer>

      {/* Login Modal */}
      {projectBranding && (
        <StudentLoginModal
          isOpen={showLoginModal}
          onClose={() => setShowLoginModal(false)}
          primaryColor={projectBranding.primaryColor}
          customUrlPath={customUrlPath || ""}
          ssoEnabled={ssoEnabled}
          ssoConfig={ssoConfig}
          initialEmail={autoLoginEmail}
          initialPassword={autoLoginPassword}
        />
      )}
      <WhatsAppFloatingIcon
        projectId={projectBranding?.projectId}
        isAuthenticated={false}
      />
    </div>
  );
};

export default StudentPortal;
