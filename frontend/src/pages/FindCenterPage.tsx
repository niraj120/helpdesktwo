import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import {
  MapPinIcon,
  PhoneIcon,
  EnvelopeIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import API_URL from '../config/api';

// Google Maps type declarations
declare global {
  interface Window {
    google: any;
  }
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

interface ProjectBranding {
  projectId: string;
  projectName: string;
  logo: string;
  primaryColor: string;
  secondaryColor: string;
}

const FindCenterPage: React.FC = () => {
  const { customUrlPath } = useParams();
  const [loading, setLoading] = useState(true);
  const [centers, setCenters] = useState<OfflineCenter[]>([]);
  const [filteredCenters, setFilteredCenters] = useState<OfflineCenter[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'city' | 'pincode'>('all');
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [sortBy, setSortBy] = useState<'none' | 'district' | 'distance' | 'alphabetical'>('none');
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  
  const [projectBranding, setProjectBranding] = useState<ProjectBranding | null>(() => {
    const cachedBrandingKey = `branding_${customUrlPath}`;
    const cachedData = sessionStorage.getItem(cachedBrandingKey);
    if (cachedData) {
      const parsed = JSON.parse(cachedData);
      if (parsed.projectId) return parsed;
    }
    return null;
  });

  // Get user location
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
          console.log('Geolocation error:', error);
        }
      );
    }
  }, []);

  // Calculate distance between two coordinates using Haversine formula
  const calculateDistance = useCallback((lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lng2 - lng1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }, []);

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        let branding = projectBranding;
        
        if (!branding || !branding.projectId) {
          const brandingRes = await axios.get(`${API_URL}/projects/branding/${customUrlPath}`);
          const brandingData = brandingRes.data.data || brandingRes.data;
          const colorTheme = brandingData.colorTheme || brandingData.branding?.colorTheme;
          branding = {
            projectId: brandingData.projectId || brandingData._id || brandingData.id,
            projectName: brandingData.name || brandingData.projectName,
            logo: brandingData.logoUrl || brandingData.logo || '',
            primaryColor: colorTheme?.primary || '#49bc8f',
            secondaryColor: colorTheme?.secondary || '#64748b',
          };
          sessionStorage.setItem(`branding_${customUrlPath}`, JSON.stringify(branding));
          setProjectBranding(branding);
        }

        // Fetch centers
        const centersResponse = await axios.get(
          `${API_URL}/centers?projectId=${branding.projectId}&isActive=true`
        );
        if (centersResponse.data.success) {
          const centersData = centersResponse.data.data || [];
          setCenters(centersData);
          setFilteredCenters(centersData);
        }
      } catch (error) {
        console.error('Error fetching centers:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [customUrlPath]);

  // Filter and sort centers
  useEffect(() => {
    if (!centers) return;

    let filtered = [...centers];

    // Apply text search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (filterType === 'city') {
        filtered = filtered.filter(c => c.city?.toLowerCase().includes(query));
      } else if (filterType === 'pincode') {
        filtered = filtered.filter(c => c.pincode?.includes(query));
      } else {
        filtered = filtered.filter(c =>
          c.centerName?.toLowerCase().includes(query) ||
          c.city?.toLowerCase().includes(query) ||
          c.address?.toLowerCase().includes(query)
        );
      }
    }

    // Apply sorting
    if (sortBy === 'district') {
      filtered.sort((a, b) => (a.city || '').localeCompare(b.city || ''));
    } else if (sortBy === 'alphabetical') {
      filtered.sort((a, b) => (a.centerName || '').localeCompare(b.centerName || ''));
    } else if (sortBy === 'distance' && userLocation) {
      filtered.sort((a, b) => {
        const distA = a.latitude && a.longitude 
          ? calculateDistance(userLocation.lat, userLocation.lng, a.latitude, a.longitude) 
          : Infinity;
        const distB = b.latitude && b.longitude 
          ? calculateDistance(userLocation.lat, userLocation.lng, b.latitude, b.longitude) 
          : Infinity;
        return distA - distB;
      });
    }

    setFilteredCenters(filtered);
  }, [searchQuery, filterType, centers, sortBy, userLocation, calculateDistance]);

  // Initialize Google Map
  const initMap = useCallback((el: HTMLElement) => {
    const defaultCenter = { lat: 19.0760, lng: 72.8777 }; // Mumbai as default
    
    const map = new window.google.maps.Map(el, {
      center: defaultCenter,
      zoom: 10,
      styles: [
        { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
      ],
    });

    const bounds = new window.google.maps.LatLngBounds();
    let hasMarkers = false;

    // Add markers for each center
    filteredCenters.forEach((center) => {
      let lat = center.latitude;
      let lng = center.longitude;
      
      // Try to extract from mapLink
      if (!lat && !lng && (center.mapLink || center.googleMapLink)) {
        const link = center.mapLink || center.googleMapLink || '';
        const coordMatch = link.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
        if (coordMatch) {
          lat = parseFloat(coordMatch[1]);
          lng = parseFloat(coordMatch[2]);
        }
      }

      if (lat && lng) {
        const position = { lat, lng };
        
        const marker = new window.google.maps.Marker({
          position,
          map,
          title: center.centerName,
          animation: window.google.maps.Animation.DROP,
        });

        const infoContent = document.createElement('div');
        infoContent.className = 'map-info-window';

        const title = document.createElement('h3');
        title.className = 'map-info-window__title';
        title.textContent = center.centerName || 'Center';
        infoContent.appendChild(title);

        const address = document.createElement('p');
        address.className = 'map-info-window__text';
        address.textContent = `Location: ${[center.address, center.city, center.state].filter(Boolean).join(', ')}`;
        infoContent.appendChild(address);

        const phone = document.createElement('p');
        phone.className = 'map-info-window__text';
        phone.textContent = `Phone: ${center.phone || 'Not available'}`;
        infoContent.appendChild(phone);

        const hours = document.createElement('p');
        hours.className = 'map-info-window__text';
        hours.textContent = `Hours: ${center.workingHours || 'Not available'}`;
        infoContent.appendChild(hours);

        const infoWindow = new window.google.maps.InfoWindow({
          content: infoContent,
        });

        marker.addListener('click', () => {
          infoWindow.open(map, marker);
        });

        bounds.extend(position);
        hasMarkers = true;
      }
    });

    if (hasMarkers) {
      map.fitBounds(bounds);
      const listener = window.google.maps.event.addListener(map, 'idle', () => {
        if (map.getZoom() > 15) map.setZoom(15);
        window.google.maps.event.removeListener(listener);
      });
    }

    // Add user location marker
    if (userLocation) {
      new window.google.maps.Marker({
        position: userLocation,
        map,
        title: 'Your Location',
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: '#4285F4',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
      });
    }
  }, [filteredCenters, userLocation]);

  const primaryColor = projectBranding?.primaryColor || '#49bc8f';
  const secondaryColor = projectBranding?.secondaryColor || '#64748b';

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200" 
             style={{ borderTopColor: primaryColor }}></div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:p-8">
      {/* Header */}
      <div 
        className="rounded-xl p-4 sm:p-6 mb-6"
        style={{
          background: `linear-gradient(135deg, ${primaryColor}08 0%, ${secondaryColor}08 100%)`,
        }}
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 sm:gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mb-1 sm:mb-2">
              Find Nearest Center
            </h2>
          </div>
          
          {/* View Mode Toggle */}
          <div className="flex gap-1 sm:gap-2 bg-white p-1 rounded-lg shadow-sm border border-gray-200 w-full md:w-auto">
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center justify-center space-x-1 sm:space-x-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-md font-medium transition-all flex-1 md:flex-initial ${
                viewMode === 'list'
                  ? 'text-white shadow-md transform scale-105'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
              style={{
                backgroundColor: viewMode === 'list' ? primaryColor : 'transparent',
              }}
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              <span className="text-sm sm:text-base">List</span>
            </button>
            <button
              onClick={() => setViewMode('map')}
              className={`flex items-center justify-center space-x-1 sm:space-x-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-md font-medium transition-all flex-1 md:flex-initial ${
                viewMode === 'map'
                  ? 'text-white shadow-md transform scale-105'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
              style={{
                backgroundColor: viewMode === 'map' ? primaryColor : 'transparent',
              }}
            >
              <MapPinIcon className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="text-sm sm:text-base">Map</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filter Buttons */}
      {viewMode === 'list' && (
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            onClick={() => { setFilterType('all'); setSearchQuery(''); }}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filterType === 'all' ? 'text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            style={{ backgroundColor: filterType === 'all' ? primaryColor : undefined }}
          >
            All Centers
          </button>
          <button
            onClick={() => { setFilterType('city'); setSearchQuery(''); }}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filterType === 'city' ? 'text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            style={{ backgroundColor: filterType === 'city' ? primaryColor : undefined }}
          >
            By City
          </button>
          <button
            onClick={() => { setFilterType('pincode'); setSearchQuery(''); }}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filterType === 'pincode' ? 'text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            style={{ backgroundColor: filterType === 'pincode' ? primaryColor : undefined }}
          >
            By Pincode
          </button>
        </div>
      )}

      {/* Search and Sort */}
      {viewMode === 'list' && (
        <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row gap-3 sm:gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder={
                filterType === 'city' ? 'Search by city...' :
                filterType === 'pincode' ? 'Search by pincode...' :
                'Search centers...'
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:outline-none"
              style={{ ['--tw-ring-color' as any]: primaryColor }}
            />
          </div>
          
          {/* Sort Dropdown */}
          <div className="relative w-full sm:w-auto sm:min-w-[200px]">
            <button
              onClick={() => setShowSortDropdown(!showSortDropdown)}
              className="flex items-center space-x-2 px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-colors font-medium text-gray-700 w-full justify-between text-sm sm:text-base"
            >
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                </svg>
                <span>
                  {sortBy === 'district' ? 'Sort by District' : 
                   sortBy === 'distance' ? 'Sort by Distance' :
                   sortBy === 'alphabetical' ? 'Sort Alphabetically' :
                   'Sort By'}
                </span>
              </div>
              <svg className={`w-4 h-4 transition-transform ${showSortDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {showSortDropdown && (
              <div className="absolute right-0 mt-2 w-full bg-white rounded-lg shadow-xl border border-gray-200 z-10 overflow-hidden">
                <button
                  onClick={() => { setSortBy('district'); setShowSortDropdown(false); }}
                  className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors flex items-center space-x-2 ${sortBy === 'district' ? 'font-bold' : ''}`}
                  style={{
                    backgroundColor: sortBy === 'district' ? `${primaryColor}10` : 'transparent',
                    color: sortBy === 'district' ? primaryColor : 'inherit',
                  }}
                >
                  <span>Sort by District</span>
                </button>
                <button
                  onClick={() => {
                    if (!userLocation) {
                      alert('Location access is required to sort by distance.');
                      return;
                    }
                    setSortBy('distance');
                    setShowSortDropdown(false);
                  }}
                  className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors flex items-center space-x-2 ${sortBy === 'distance' ? 'font-bold' : ''} ${!userLocation ? 'opacity-50' : ''}`}
                  style={{
                    backgroundColor: sortBy === 'distance' ? `${primaryColor}10` : 'transparent',
                    color: sortBy === 'distance' ? primaryColor : 'inherit',
                  }}
                >
                  <span>Sort by Distance</span>
                  {!userLocation && <span className="text-xs text-gray-400">(location required)</span>}
                </button>
                <button
                  onClick={() => { setSortBy('alphabetical'); setShowSortDropdown(false); }}
                  className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors flex items-center space-x-2 ${sortBy === 'alphabetical' ? 'font-bold' : ''}`}
                  style={{
                    backgroundColor: sortBy === 'alphabetical' ? `${primaryColor}10` : 'transparent',
                    color: sortBy === 'alphabetical' ? primaryColor : 'inherit',
                  }}
                >
                  <span>Sort Alphabetically</span>
                </button>
                {sortBy !== 'none' && (
                  <button
                    onClick={() => { setSortBy('none'); setShowSortDropdown(false); }}
                    className="w-full px-4 py-3 text-left hover:bg-red-50 transition-colors flex items-center space-x-2 border-t border-gray-200 text-red-600"
                  >
                    <span>Clear Sort</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Map View */}
      {viewMode === 'map' && (
        <div className="h-[400px] sm:h-[500px] md:h-[600px] rounded-lg overflow-hidden border border-gray-200 shadow-lg relative">
          <div 
            id="google-map" 
            className="w-full h-full"
            ref={(el) => {
              if (el && !el.dataset.initialized) {
                el.dataset.initialized = 'true';
                
                if (!window.google) {
                  const script = document.createElement('script');
                  script.src = `https://maps.googleapis.com/maps/api/js?key=AIzaSyBRFSFV0gNYtzruNYF9hoJxbUFoaOMWhD8`;
                  script.async = true;
                  script.onload = () => initMap(el);
                  document.head.appendChild(script);
                } else {
                  initMap(el);
                }
              }
            }}
          ></div>
        </div>
      )}

      {/* Centers List */}
      {viewMode === 'list' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {filteredCenters.length === 0 ? (
            <div className="col-span-2 text-center py-12">
              <MapPinIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-lg">No centers found matching your search</p>
            </div>
          ) : (
            filteredCenters.map((center, idx) => (
              <div
                key={idx}
                className="bg-white border-2 border-gray-400 rounded-xl sm:rounded-2xl p-4 sm:p-6 hover:border-gray-600 transition-all duration-300 shadow-md hover:shadow-xl flex flex-col"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3 sm:mb-4 min-h-[60px]">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg sm:text-xl font-bold text-gray-900 break-words">
                      {center.centerName}
                    </h3>
                    {sortBy === 'distance' && userLocation && center.latitude && center.longitude && (
                      <p className="text-sm text-gray-500 mt-1 flex items-center space-x-1">
                        <MapPinIcon className="w-4 h-4" />
                        <span>
                          {calculateDistance(userLocation.lat, userLocation.lng, center.latitude, center.longitude).toFixed(1)} km away
                        </span>
                      </p>
                    )}
                  </div>
                  <div 
                    className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{
                      background: `linear-gradient(135deg, ${primaryColor}15 0%, ${secondaryColor}25 100%)`,
                    }}
                  >
                    <MapPinIcon className="w-6 h-6" style={{ color: primaryColor }} />
                  </div>
                </div>
                
                {/* Contact Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div className="flex items-start space-x-3">
                    <MapPinIcon className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                    <div className="overflow-hidden">
                      <p className="text-sm font-medium text-gray-700">Address</p>
                      <p className="text-sm text-gray-600 line-clamp-3">
                        {center.address}, {center.city}, {center.state} - {center.pincode}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <PhoneIcon className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-gray-700">Phone</p>
                      <p className="text-sm text-gray-600">{center.phone}</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <EnvelopeIcon className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-gray-700">Email</p>
                      <p className="text-sm text-gray-600 truncate">{center.email}</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <ClockIcon className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-gray-700">Working Hours</p>
                      <p className="text-sm text-gray-600">{center.workingHours}</p>
                    </div>
                  </div>
                </div>

                {/* Features */}
                {center.features && center.features.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <p className="text-sm font-medium text-gray-700 mb-2">Available Features</p>
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

                {/* Contact Details */}
                {center.contacts && center.contacts.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <p className="text-sm font-medium text-gray-700 mb-3">Contact Details</p>
                    <div className="space-y-3">
                      {center.contacts.map((contact, contactIdx) => (
                        <div key={contactIdx}>
                          <p className="text-sm font-semibold text-gray-900">{contact.name}</p>
                          {contact.role && (
                            <p className="text-xs text-gray-500 mb-2">{contact.role}</p>
                          )}
                          {contact.mobile && (
                            <div className="flex items-center space-x-2 mb-1">
                              <PhoneIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                              <a href={`tel:${contact.mobile}`} className="text-sm text-gray-600 hover:text-gray-900">{contact.mobile}</a>
                            </div>
                          )}
                          {contact.email && (
                            <div className="flex items-center space-x-2">
                              <EnvelopeIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                              <a href={`mailto:${contact.email}`} className="text-sm text-gray-600 hover:text-gray-900 truncate">{contact.email}</a>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Get Directions Button */}
                <div className="mt-auto pt-4 border-t border-gray-200">
                  <button
                    onClick={() => {
                      let mapUrl = center.mapLink || center.googleMapLink;
                      if (!mapUrl && center.latitude && center.longitude) {
                        mapUrl = `https://www.google.com/maps?q=${center.latitude},${center.longitude}`;
                      } else if (!mapUrl) {
                        mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          `${center.address}, ${center.city}, ${center.state} ${center.pincode}`
                        )}`;
                      }
                      window.open(mapUrl, '_blank');
                    }}
                    className="w-full py-3 px-4 rounded-xl text-white font-bold shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all flex items-center justify-center space-x-2 group"
                    style={{
                      background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
                    }}
                  >
                    <MapPinIcon className="w-5 h-5 group-hover:animate-bounce" />
                    <span>Get Directions</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default FindCenterPage;
