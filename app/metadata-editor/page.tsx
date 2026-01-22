'use client';

import { useState, useEffect, useCallback } from 'react';
import { Upload, Globe, Save, RefreshCw, Image as ImageIcon, Video } from 'lucide-react';
import { NotificationModal } from '../components/ui/NotificationModal';
import { ThemeSelector } from '../components/ThemeSelector';
import { FacebookIcon, LinkedInIcon, AppleIcon, SlackIcon, DiscordIcon } from '../components/SocialIcons';
import styles from './metadata-editor.module.css';

interface MetadataForm {
  title: string;
  description: string;
  siteUrl: string;
  ogImage: string;
  ogImageWidth: number;
  ogImageHeight: number;
  ogImageSize?: number; // in bytes
  ogImageUploadDate?: string;
  ogVideo?: string; // URL to self-hosted video file
  favicon: string;
  faviconSize?: number; // in bytes
  faviconUploadDate?: string;
}

interface ExternalMetadata {
  title?: string;
  description?: string;
  image?: string;
  favicon?: string;
  hostname?: string;
}

export default function MetadataEditor(): React.ReactElement {
  // All hooks must be called unconditionally at the top level
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Initialize activeTab from localStorage or default
  const getInitialTab = (): 'current' | 'external' | 'preview' => {
    if (typeof window === 'undefined') {
      return isProduction ? 'preview' : 'current';
    }
    
    const savedTab = localStorage.getItem('metadataEditorActiveTab') as 'current' | 'external' | 'preview' | null;
    
    if (savedTab && ['current', 'external', 'preview'].includes(savedTab)) {
      // In production, don't allow 'current' tab
      if (isProduction && savedTab === 'current') {
        return 'preview';
      }
      return savedTab;
    }
    
    return isProduction ? 'preview' : 'current';
  };
  
  const [activeTab, setActiveTab] = useState<'current' | 'external' | 'preview'>(getInitialTab);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<{ type: 'og' | 'favicon' | null; progress: number }>({ type: null, progress: 0 });
  const [externalUrl, setExternalUrl] = useState('');
  const [externalMetadata, setExternalMetadata] = useState<ExternalMetadata | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [currentSiteUrl, setCurrentSiteUrl] = useState('localhost');
  const [notification, setNotification] = useState<{
    isOpen: boolean;
    type: 'success' | 'error';
    title: string;
    message: string;
  }>({
    isOpen: false,
    type: 'success',
    title: '',
    message: '',
  });

  const [formData, setFormData] = useState<MetadataForm>({
    title: 'Start Page',
    description: 'Personal Start Page with Local Persistence',
    siteUrl: 'https://yourdomain.com',
    ogImage: '/og-img.png',
    ogImageWidth: 1200,
    ogImageHeight: 630,
    ogVideo: '/og-vid.mp4',
    favicon: '/favicon.png',
  });

  // Toggle state for preview cards (image vs video)
  const [previewMode, setPreviewMode] = useState<Record<string, 'image' | 'video'>>({
    twitter: 'image',
    facebook: 'image',
    linkedin: 'image',
    imessage: 'image',
    slack: 'image',
    discord: 'image',
  });

  // Video dimensions and codec state
  const [videoDimensions, setVideoDimensions] = useState<{
    width: number | null;
    height: number | null;
  }>({ width: null, height: null });
  
  const [videoCodec, setVideoCodec] = useState<string | null>(null);

  // Helper function to detect codec from video URL
  const detectVideoCodec = (videoUrl: string, videoElement: HTMLVideoElement): string | null => {
    if (!videoUrl) return null;

    // Try to get codec from file extension first
    const urlLower = videoUrl.toLowerCase();
    if (urlLower.endsWith('.mp4') || urlLower.includes('.mp4')) {
      // Try to detect H.264 or H.265
      const canPlayH264 = videoElement.canPlayType('video/mp4; codecs="avc1.42E01E"');
      const canPlayH265 = videoElement.canPlayType('video/mp4; codecs="hev1.1.6.L93.B0"');
      if (canPlayH265 !== '') return 'H.265 (HEVC)';
      if (canPlayH264 !== '') return 'H.264 (AVC)';
      return 'MP4';
    }
    if (urlLower.endsWith('.webm') || urlLower.includes('.webm')) {
      const canPlayVP9 = videoElement.canPlayType('video/webm; codecs="vp9"');
      const canPlayVP8 = videoElement.canPlayType('video/webm; codecs="vp8"');
      if (canPlayVP9 !== '') return 'VP9';
      if (canPlayVP8 !== '') return 'VP8';
      return 'WebM';
    }
    if (urlLower.endsWith('.ogg') || urlLower.endsWith('.ogv') || urlLower.includes('.ogg')) {
      return 'Ogg Theora';
    }

    // Try to detect from MIME type if available
    try {
      const video = videoElement;
      // Check common codecs via canPlayType
      const codecTests = [
        { mime: 'video/mp4; codecs="avc1.42E01E"', name: 'H.264 (AVC)' },
        { mime: 'video/mp4; codecs="hev1.1.6.L93.B0"', name: 'H.265 (HEVC)' },
        { mime: 'video/webm; codecs="vp9"', name: 'VP9' },
        { mime: 'video/webm; codecs="vp8"', name: 'VP8' },
        { mime: 'video/ogg; codecs="theora"', name: 'Ogg Theora' },
      ];

      for (const test of codecTests) {
        if (video.canPlayType(test.mime) !== '') {
          return test.name;
        }
      }
    } catch (e) {
      // Fallback to extension-based detection
    }

    // Fallback: infer from URL pattern
    if (urlLower.includes('mp4')) return 'MP4';
    if (urlLower.includes('webm')) return 'WebM';
    if (urlLower.includes('ogg') || urlLower.includes('ogv')) return 'Ogg';

    return null;
  };

  // Define loadCurrentMetadata before useEffect that uses it
  const loadCurrentMetadata = async (): Promise<void> => {
    setLoading(true);
    try {
      const response = await fetch('/api/metadata-editor/current');
      if (response.ok) {
        const data = await response.json();
        // Normalize image paths (remove any accidental escaping)
        const normalizedData = {
          ...data,
          ogImage: data.ogImage?.replace(/\\+\./g, '.') || data.ogImage,
          ogVideo: data.ogVideo?.replace(/\\+\./g, '.') || data.ogVideo,
          favicon: data.favicon?.replace(/\\+\./g, '.') || data.favicon,
        };
        setFormData(normalizedData);
      }
    } catch (error) {
      console.error('Failed to load metadata:', error);
    } finally {
      setLoading(false);
    }
  };

  // Define handleSave with useCallback before useEffect that uses it
  const handleSave = useCallback(async (): Promise<void> => {
    setSaving(true);
    try {
      const response = await fetch('/api/metadata-editor/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setNotification({
          isOpen: true,
          type: 'success',
          title: 'Success!',
          message: 'Metadata updated successfully',
        });
      } else {
        setNotification({
          isOpen: true,
          type: 'error',
          title: 'Error',
          message: 'Failed to update metadata',
        });
      }
    } catch (error) {
      console.error('Failed to save metadata:', error);
      setNotification({
        isOpen: true,
        type: 'error',
        title: 'Error',
        message: 'Error saving metadata',
      });
    } finally {
      setSaving(false);
    }
  }, [formData]);

  // Set mounted state on client and update site URL
  useEffect(() => {
    setIsMounted(true);
    
    // Calculate site URL on client side only
    if (typeof window !== 'undefined') {
      const { hostname, protocol, port } = window.location;
      
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        setCurrentSiteUrl(`localhost: ${formData.title}`);
      } else {
        const portSuffix = port && port !== '80' && port !== '443' ? `:${port}` : '';
        setCurrentSiteUrl(`${protocol}//${hostname}${portSuffix}`);
      }
    }
  }, [formData.title]);

  // Load current metadata from API
  useEffect(() => {
    loadCurrentMetadata();
  }, []);

  // Persist active tab to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('metadataEditorActiveTab', activeTab);
    }
  }, [activeTab]);

  // Keyboard shortcut for save (Cmd/Ctrl + S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (!saving) {
          handleSave();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saving, handleSave]);

  // In production, only allow Preview and External URL tabs (read-only)
  // Current Site tab (which modifies files) is restricted to development

  // Get current site URL - uses state to avoid hydration mismatch
  const getCurrentSiteUrl = (): string => {
    return currentSiteUrl;
  };

  const handleImageUpload = async (file: File, type: 'og' | 'favicon'): Promise<void> => {
    setUploading({ type, progress: 0 });
    const formDataUpload = new FormData();
    formDataUpload.append('file', file);
    formDataUpload.append('type', type);

    try {
      // Simulate progress for better UX
      const progressInterval = setInterval(() => {
        setUploading((prev) => ({
          ...prev,
          progress: Math.min(prev.progress + 10, 90),
        }));
      }, 100);

      const response = await fetch('/api/metadata-editor/upload-image', {
        method: 'POST',
        body: formDataUpload,
      });

      clearInterval(progressInterval);
      setUploading({ type, progress: 100 });

      if (response.ok) {
        const { url, size, uploadDate, width, height } = await response.json();
        // Add cache buster to force image reload
        const timestamp = Date.now();
        const urlWithCacheBuster = `${url}?t=${timestamp}`;
        
        if (type === 'og') {
          setFormData((prevData) => ({
            ...prevData,
            ogImage: urlWithCacheBuster,
            ogImageSize: size,
            ogImageUploadDate: uploadDate,
            ogImageWidth: width || prevData.ogImageWidth,
            ogImageHeight: height || prevData.ogImageHeight,
          }));
        } else {
          setFormData((prevData) => ({
            ...prevData,
            favicon: urlWithCacheBuster,
            faviconSize: size,
            faviconUploadDate: uploadDate,
          }));
        }

        // Force image reload by updating key
        setTimeout(() => {
          setUploading({ type: null, progress: 0 });
        }, 500);
      } else {
        setUploading({ type: null, progress: 0 });
        const errorData = await response.json().catch(() => ({ error: 'Upload failed' }));
        setNotification({
          isOpen: true,
          type: 'error',
          title: 'Upload Failed',
          message: errorData.error || 'Failed to upload image',
        });
      }
    } catch (error) {
      console.error('Failed to upload image:', error);
      setUploading({ type: null, progress: 0 });
      setNotification({
        isOpen: true,
        type: 'error',
        title: 'Upload Failed',
        message: error instanceof Error ? error.message : 'Failed to upload image',
      });
    }
  };

  const handleExternalUrlCheck = async (): Promise<void> => {
    if (!externalUrl) return;

    setLoading(true);
    try {
      // Normalize URL - add protocol if missing
      let normalizedUrl = externalUrl.trim();
      if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
        normalizedUrl = `https://${normalizedUrl}`;
      }
      
      const encodedUrl = encodeURIComponent(normalizedUrl);
      const response = await fetch(`/api/metadata-editor/meta?url=${encodedUrl}`);
      
      if (response.ok) {
        const data = await response.json();
        setExternalMetadata(data);
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        setNotification({
          isOpen: true,
          type: 'error',
          title: 'Error',
          message: errorData.error || `Failed to fetch metadata (${response.status})`,
        });
        setExternalMetadata(null);
      }
    } catch (error) {
      console.error('Failed to fetch external metadata:', error);
      setNotification({
        isOpen: true,
        type: 'error',
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to fetch external metadata',
      });
      setExternalMetadata(null);
    } finally {
      setLoading(false);
    }
  };

  const closeNotification = (): void => {
    setNotification({ ...notification, isOpen: false });
  };

  return (
    <>
      <NotificationModal
        isOpen={notification.isOpen}
        type={notification.type}
        title={notification.title}
        message={notification.message}
        onClose={closeNotification}
      />

      <div className="min-h-screen w-full px-4 py-6 md:px-6 md:py-8 bg-white dark:bg-gray-900">
        <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold mb-2 text-gray-900 dark:text-gray-100">
              Sharing Metadata Editor
            </h1>
            <p className="text-sm md:text-base text-gray-600 dark:text-gray-400">
              Manage Open Graph and social media sharing metadata
            </p>
          </div>
          <ThemeSelector />
        </div>

        {/* Tabs */}
        <div className="flex flex-col md:flex-row gap-2 mb-6">
          {!isProduction && (
            <button
              onClick={() => setActiveTab('current')}
              className={`px-6 py-3 rounded-lg font-medium transition-all ${
                activeTab === 'current' 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              Edit
            </button>
          )}
          <button
            onClick={() => setActiveTab('preview')}
            className={`px-6 py-3 rounded-lg font-medium transition-all ${
              activeTab === 'preview' 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            Preview
          </button>
          <button
            onClick={() => setActiveTab('external')}
            className={`px-6 py-3 rounded-lg font-medium transition-all ${
              activeTab === 'external' 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            Check External URL
          </button>
        </div>

        {/* Content Container */}
        <div className="p-6 md:p-8 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-700">
          {activeTab === 'current' && !isProduction ? (
            <>
              {/* Current Site Metadata Form */}
              <div className="space-y-6">
                {/* Site URL - Browser Window Theme */}
                <div className="pb-4 border-b border-gray-300 dark:border-gray-700">
                  <div className={styles.browserWindow}>
                    {/* Window Controls */}
                    <div className={styles.browserWindowControls}>
                      <div className={styles.browserTrafficLights}>
                        <div className={`${styles.browserTrafficLight} ${styles.browserTrafficLightRed}`}></div>
                        <div className={`${styles.browserTrafficLight} ${styles.browserTrafficLightYellow}`}></div>
                        <div className={`${styles.browserTrafficLight} ${styles.browserTrafficLightGreen}`}></div>
                      </div>

                      {/* Tab Bar */}
                      <div className={styles.browserTabBar}>
                        <div className={styles.browserTab}>
                          {/* Favicon */}
                          <div className={styles.browserTabFavicon}>
                            {formData.favicon ? (
                              <img 
                                src={formData.favicon} 
                                alt=""
                              />
                            ) : (
                              <Globe size={16} />
                            )}
                          </div>
                          
                          {/* Tab Title */}
                          <div className={styles.browserTabTitle}>{formData.title || 'OG Meta Editor'}</div>
                          
                          {/* Close Button */}
                          <div className={styles.browserTabClose}>×</div>
                        </div>
                      </div>
                    </div>

                    {/* Navigation Bar */}
                    <div className={styles.browserNavBar}>
                      {/* Back Button */}
                      <div className={styles.browserNavButton}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m15 18-6-6 6-6"/>
                        </svg>
                      </div>

                      {/* Forward Button */}
                      <div className={`${styles.browserNavButton} ${styles.browserNavButtonDisabled}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m9 18 6-6-6-6"/>
                        </svg>
                      </div>

                      {/* Refresh Button */}
                      <div className={styles.browserNavButton}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/>
                          <path d="M21 3v5h-5"/>
                        </svg>
                      </div>

                      <div className={styles.browserDivider}></div>

                      {/* URL Bar */}
                      <div className={styles.browserUrlBar}>
                        <div className={styles.browserUrlIcon}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8"/>
                            <path d="m21 21-4.3-4.3"/>
                          </svg>
                        </div>
                        
                        {/* URL Text */}
                        <input 
                          type="text" 
                          className={styles.browserUrlText} 
                          value={getCurrentSiteUrl()} 
                          readOnly
                        />
                      </div>

                      {/* Bookmark Icon */}
                      <div className={styles.browserNavIcon}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                        </svg>
                      </div>

                      {/* Menu Icon */}
                      <div className={styles.browserNavIcon}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="4" x2="20" y1="12" y2="12"/>
                          <line x1="4" x2="20" y1="6" y2="6"/>
                          <line x1="4" x2="20" y1="18" y2="18"/>
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Basic Info */}
                <div className="space-y-4">
                  <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
                    Basic Information
                  </h2>

                  {/* Two-column grid: Favicon | Site Title & Description */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Favicon - First column */}
                    <div className="space-y-4">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                            Favicon
                          </h3>
                        </div>
                      </div>

                      <div className="mt-4">
                        <div className="flex justify-center">
                          <div className="relative">
                            <label
                              className={`absolute -right-[1.125rem] -top-[1.125rem] inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300/60 dark:border-gray-600/60 bg-white/60 dark:bg-gray-900/60 text-gray-900 dark:text-gray-100 opacity-70 backdrop-blur-sm transition-opacity hover:opacity-100 cursor-pointer origin-center z-10 ${
                                uploading.type === 'favicon' ? 'opacity-100' : ''
                              }`}
                              title="Upload favicon"
                            >
                              {uploading.type === 'favicon' ? (
                                <RefreshCw size={16} className="animate-spin" />
                              ) : (
                                <RefreshCw size={16} />
                              )}
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                disabled={uploading.type === 'favicon'}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleImageUpload(file, 'favicon');
                                  e.target.value = ''; // Reset input
                                }}
                              />
                            </label>
                            {uploading.type === 'favicon' && (
                              <div className="absolute -right-[1.125rem] -top-[1.125rem] w-9 h-9 rounded-lg border-2 border-blue-500 border-t-transparent animate-spin z-20 pointer-events-none"></div>
                            )}

                            {formData.favicon ? (
                              <div className={`${styles.faviconPreview} p-1`}>
                                <img
                                  key={`${formData.favicon}-${formData.faviconUploadDate || Date.now()}`}
                                  src={formData.favicon}
                                  alt="Favicon Preview"
                                  onLoad={() => {
                                    // Force re-render on successful load
                                    setFormData((prev) => ({ ...prev }));
                                  }}
                                  onError={(e) => {
                                    // Fallback to Globe icon on error
                                    const parent = e.currentTarget.parentElement;
                                    if (parent) {
                                      parent.innerHTML = '<div class="w-full h-full flex items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-400"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg></div>';
                                    }
                                  }}
                                />
                              </div>
                            ) : (
                              <div className={`${styles.faviconPreview} p-1`}>
                                <div className="w-full h-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center rounded">
                                  <Globe size={24} className="text-gray-400" />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Site Title and Description - Second column */}
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
                          Site Title
                        </label>
                        <input
                          type="text"
                          value={formData.title}
                          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                          className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
                          Description
                        </label>
                        <textarea
                          value={formData.description}
                          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                          rows={3}
                          className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* OG Image and OG Video - Two Column Layout */}
                <div className="pt-6 border-t border-gray-300 dark:border-gray-700">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* OG Image - First column */}
                    <div className="space-y-4">
                      <div>
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                          Open Graph Image
                        </h2>
                      </div>
                      <div>
                        <label className={`flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 w-full justify-center ${
                          uploading.type === 'og' ? 'opacity-75 cursor-wait' : ''
                        }`}>
                          {uploading.type === 'og' ? (
                            <>
                              <RefreshCw size={16} className="animate-spin" />
                              <span>Uploading... {uploading.progress}%</span>
                            </>
                          ) : (
                            <>
                              <Upload size={16} />
                              <span>Upload Image</span>
                            </>
                          )}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={uploading.type === 'og'}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleImageUpload(file, 'og');
                              e.target.value = ''; // Reset input
                            }}
                          />
                        </label>
                      </div>

                      <div className="mt-4 space-y-4">
                        <p className="text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
                          Preview
                        </p>
                        {formData.ogImage ? (
                          <div className="w-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center aspect-[1200/630]">
                            <img
                              key={`${formData.ogImage}-${formData.ogImageUploadDate || Date.now()}`}
                              src={formData.ogImage}
                              alt="OG Image Preview"
                              className="w-full h-full object-cover"
                              onLoad={() => {
                                // Force re-render on successful load
                                setFormData((prev) => ({ ...prev }));
                              }}
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                const parent = e.currentTarget.parentElement;
                                if (parent) {
                                  parent.innerHTML = '<div class="text-center p-4"><p class="text-gray-600 dark:text-gray-400">Failed to load image</p></div>';
                                }
                              }}
                            />
                          </div>
                        ) : (
                          <div className="w-full bg-gray-200 flex items-center justify-center aspect-[1200/630] rounded">
                            <span className="text-gray-400 text-sm">OG Image Placeholder</span>
                          </div>
                        )}

                        {/* File Information */}
                        <div className="w-full p-4 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700">
                          <p className="text-xs font-medium mb-1 text-gray-900 dark:text-gray-100">
                            File Information
                          </p>
                          <div className="grid grid-cols-1 gap-1 text-xs md:grid-cols-2">
                            {formData.ogImage && (
                              <div className="md:col-span-2">
                                <span className="text-gray-600">URL: </span>
                                <span className="text-gray-900 dark:text-gray-100 break-all">
                                  {formData.ogImage}
                                </span>
                              </div>
                            )}
                            <div>
                              <span className="text-gray-600">Dimensions: </span>
                              <span className="text-gray-900 dark:text-gray-100">
                                {formData.ogImageWidth} × {formData.ogImageHeight}px
                              </span>
                            </div>
                            {formData.ogImageSize && (
                              <div>
                                <span className="text-gray-600">Size: </span>
                                <span className="text-gray-900 dark:text-gray-100">
                                  {(formData.ogImageSize / 1024).toFixed(2)} KB
                                </span>
                              </div>
                            )}
                            {formData.ogImageUploadDate && (
                              <div className="md:col-span-2">
                                <span className="text-gray-600">Uploaded: </span>
                                <span className="text-gray-900 dark:text-gray-100">
                                  {new Date(formData.ogImageUploadDate).toLocaleString()}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* OG Video - Second column */}
                    <div className="space-y-4">
                      <div>
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                          Open Graph Video
                        </h2>
                      </div>
                      <div>
                        <div className="flex items-center w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent overflow-hidden">
                          <span className="px-4 py-2 text-sm font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap border-r border-gray-300 dark:border-gray-600 rounded-l-lg bg-white dark:bg-gray-700">
                            Video URL
                          </span>
                          <input
                            type="text"
                            placeholder="/videos/preview.mp4 or https://yourdomain.com/videos/preview.mp4"
                            value={formData.ogVideo || ''}
                            onChange={(e) => {
                              setFormData({ ...formData, ogVideo: e.target.value });
                              // Reset video dimensions and codec when URL changes
                              setVideoDimensions({ width: null, height: null });
                              setVideoCodec(null);
                            }}
                            className="flex-1 px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none rounded-r-lg"
                          />
                        </div>
                      </div>

                      <div className="mt-4 space-y-4">
                        <p className="text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
                          Preview
                        </p>
                        {formData.ogVideo ? (
                          <div className="w-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center aspect-[1200/630]">
                            <video
                              key={formData.ogVideo}
                              src={formData.ogVideo}
                              className="w-full h-full object-cover"
                              preload="metadata"
                              controls
                              playsInline
                              onLoadStart={(e) => {
                                // Ensure video is paused immediately when loading starts
                                const video = e.currentTarget;
                                video.pause();
                                video.currentTime = 0;
                              }}
                              onLoadedMetadata={(e) => {
                                // Ensure video is paused/stopped when metadata is loaded
                                // and capture video dimensions and codec
                                const video = e.currentTarget;
                                video.pause();
                                video.currentTime = 0;
                                
                                const width = video.videoWidth;
                                const height = video.videoHeight;
                                
                                setVideoDimensions({
                                  width: width > 0 ? width : null,
                                  height: height > 0 ? height : null,
                                });
                                
                                // Always try to detect codec, especially if no dimensions
                                if (formData.ogVideo) {
                                  const codec = detectVideoCodec(formData.ogVideo, video);
                                  setVideoCodec(codec);
                                }
                              }}
                              onCanPlay={(e) => {
                                // Ensure video remains paused even if it can play
                                const video = e.currentTarget;
                                if (!video.paused) {
                                  video.pause();
                                  video.currentTime = 0;
                                }
                              }}
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                const parent = e.currentTarget.parentElement;
                                if (parent) {
                                  parent.innerHTML = '<div class="text-center p-4"><p class="text-gray-600">Failed to load video</p></div>';
                                }
                              }}
                            />
                          </div>
                        ) : (
                          <div className="w-full bg-gray-200 flex items-center justify-center aspect-[1200/630] rounded">
                            <span className="text-gray-400 text-sm">OG Video Placeholder</span>
                          </div>
                        )}

                        {/* File Information */}
                        <div className="w-full p-4 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700">
                          <p className="text-xs font-medium mb-1 text-gray-900 dark:text-gray-100">
                            File Information
                          </p>
                          <div className="grid grid-cols-1 gap-1 text-xs md:grid-cols-2">
                            {formData.ogVideo ? (
                              <div className="md:col-span-2">
                                <span className="text-gray-600">URL: </span>
                                <span className="text-gray-900 dark:text-gray-100 break-all">
                                  {formData.ogVideo}
                                </span>
                              </div>
                            ) : (
                              <div className="md:col-span-2">
                                <span className="text-gray-600">No video URL provided</span>
                              </div>
                            )}
                            <div>
                              <span className="text-gray-600">Dimensions: </span>
                              <span className="text-gray-900 dark:text-gray-100">
                                {videoDimensions.width && videoDimensions.height
                                  ? `${videoDimensions.width} × ${videoDimensions.height}px`
                                  : videoCodec
                                  ? videoCodec
                                  : 'N/A'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Save Button */}
                <div className="flex justify-end pt-6 border-t border-gray-300 dark:border-gray-700">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all hover:opacity-90 bg-blue-500 text-white ${
                      saving ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {saving ? (
                      <>
                        <RefreshCw size={16} className="animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <Save size={16} />
                        <span>Save Changes</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </>
          ) : activeTab === 'preview' ? (
            <>
              {/* Link Preview Section */}
              <div className="space-y-16">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                      Link Preview
                    </h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      See how your link will appear when shared on different platforms
                    </p>
                  </div>
                  {formData.ogVideo && formData.ogImage && (
                    <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                      <button
                        onClick={() => {
                          const newMode = previewMode.twitter === 'image' ? 'video' : 'image';
                          setPreviewMode({
                            twitter: newMode,
                            facebook: newMode,
                            linkedin: newMode,
                            imessage: newMode,
                            slack: newMode,
                            discord: newMode,
                          });
                        }}
                        className={`px-4 py-2 text-sm font-medium rounded transition-colors flex items-center gap-2 ${
                          previewMode.twitter === 'image'
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                        }`}
                        title="Show all images"
                      >
                        <ImageIcon size={16} />
                        All Image
                      </button>
                      <button
                        onClick={() => {
                          const newMode = previewMode.twitter === 'video' ? 'image' : 'video';
                          setPreviewMode({
                            twitter: newMode,
                            facebook: newMode,
                            linkedin: newMode,
                            imessage: newMode,
                            slack: newMode,
                            discord: newMode,
                          });
                        }}
                        className={`px-4 py-2 text-sm font-medium rounded transition-colors flex items-center gap-2 ${
                          previewMode.twitter === 'video'
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                        }`}
                        title="Show all videos"
                      >
                        <Video size={16} />
                        All Video
                      </button>
                    </div>
                  )}
                </div>

                {/* Twitter/X Preview */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                      </svg>
                      Twitter / X
                    </h3>
                    {formData.ogVideo && formData.ogImage && (
                      <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                        <button
                          onClick={() => setPreviewMode({ ...previewMode, twitter: 'image' })}
                          className={`px-3 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1 ${
                            previewMode.twitter === 'image'
                              ? 'bg-white text-gray-900 shadow-sm'
                              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                          }`}
                          title="Show image"
                        >
                          <ImageIcon size={14} />
                        </button>
                        <button
                          onClick={() => setPreviewMode({ ...previewMode, twitter: 'video' })}
                          className={`px-3 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1 ${
                            previewMode.twitter === 'video'
                              ? 'bg-white text-gray-900 shadow-sm'
                              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                          }`}
                          title="Show video"
                        >
                          <Video size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="max-w-[504px]">
                    <div className="border border-[#cfd9de] rounded-2xl overflow-hidden bg-white">
                      {previewMode.twitter === 'video' && formData.ogVideo ? (
                        <div className="w-full bg-gray-100 aspect-[1.91/1]">
                          <video
                            key={formData.ogVideo}
                            src={formData.ogVideo}
                            className="w-full h-full object-cover"
                            autoPlay
                            muted
                            playsInline
                            loop
                            controls
                            poster={formData.ogImage}
                          />
                        </div>
                      ) : formData.ogImage ? (
                        <div className="w-full bg-gray-100 aspect-[1.91/1]">
                          <img
                            key={formData.ogImage}
                            src={formData.ogImage}
                            alt="Preview"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="w-full bg-gray-200 aspect-[1.91/1] flex items-center justify-center">
                          <span className="text-gray-400 text-sm">OG Image Placeholder</span>
                        </div>
                      )}
                      <div className="p-3">
                        <p className="text-[13px] text-[#536471] mb-1 lowercase">{getCurrentSiteUrl()}</p>
                        <p className="text-[15px] font-bold text-gray-900 mb-1 line-clamp-1">{formData.title}</p>
                        <p className="text-[15px] text-[#536471] line-clamp-2">{formData.description}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Facebook Preview */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                      <FacebookIcon />
                      Facebook
                    </h3>
                    {formData.ogVideo && formData.ogImage && (
                      <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                        <button
                          onClick={() => setPreviewMode({ ...previewMode, facebook: 'image' })}
                          className={`px-3 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1 ${
                            previewMode.facebook === 'image'
                              ? 'bg-white text-gray-900 shadow-sm'
                              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                          }`}
                          title="Show image"
                        >
                          <ImageIcon size={14} />
                        </button>
                        <button
                          onClick={() => setPreviewMode({ ...previewMode, facebook: 'video' })}
                          className={`px-3 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1 ${
                            previewMode.facebook === 'video'
                              ? 'bg-white text-gray-900 shadow-sm'
                              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                          }`}
                          title="Show video"
                        >
                          <Video size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="max-w-[524px]">
                    <div className="border border-[#dddfe2] bg-[#f2f3f5]">
                      {previewMode.facebook === 'video' && formData.ogVideo ? (
                        <div className="w-full bg-gray-100 aspect-[1.91/1]">
                          <video
                            key={formData.ogVideo}
                            src={formData.ogVideo}
                            className="w-full h-full object-cover"
                            autoPlay
                            muted
                            playsInline
                            loop
                            controls
                            poster={formData.ogImage}
                          />
                        </div>
                      ) : formData.ogImage ? (
                        <div className="w-full bg-gray-100 aspect-[1.91/1]">
                          <img
                            key={formData.ogImage}
                            src={formData.ogImage}
                            alt="Preview"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="w-full bg-gray-200 aspect-[1.91/1] flex items-center justify-center">
                          <span className="text-gray-400 text-sm">OG Image Placeholder</span>
                        </div>
                      )}
                      <div className="p-[10px_12px] border-t border-[#dddfe2]">
                        <p className="text-[12px] text-[#606770] uppercase tracking-wide mb-1">{getCurrentSiteUrl()}</p>
                        <p className="text-[16px] font-bold text-[#1d2129] mb-1 leading-5 line-clamp-1">{formData.title}</p>
                        <p className="text-[14px] text-[#606770] line-clamp-1">{formData.description}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* LinkedIn Preview */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                      <LinkedInIcon />
                      LinkedIn
                    </h3>
                    {formData.ogVideo && formData.ogImage && (
                      <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                        <button
                          onClick={() => setPreviewMode({ ...previewMode, linkedin: 'image' })}
                          className={`px-3 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1 ${
                            previewMode.linkedin === 'image'
                              ? 'bg-white text-gray-900 shadow-sm'
                              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                          }`}
                          title="Show image"
                        >
                          <ImageIcon size={14} />
                        </button>
                        <button
                          onClick={() => setPreviewMode({ ...previewMode, linkedin: 'video' })}
                          className={`px-3 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1 ${
                            previewMode.linkedin === 'video'
                              ? 'bg-white text-gray-900 shadow-sm'
                              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                          }`}
                          title="Show video"
                        >
                          <Video size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="max-w-[552px]">
                    <div className="border border-[#e0e0e0] bg-white rounded-t-lg shadow-sm">
                      {previewMode.linkedin === 'video' && formData.ogVideo ? (
                        <div className="w-full bg-gray-100 aspect-[1.91/1]">
                          <video
                            key={formData.ogVideo}
                            src={formData.ogVideo}
                            className="w-full h-full object-cover rounded-t-lg"
                            autoPlay
                            muted
                            playsInline
                            loop
                            controls
                            poster={formData.ogImage}
                          />
                        </div>
                      ) : formData.ogImage ? (
                        <div className="w-full bg-gray-100 aspect-[1.91/1]">
                          <img
                            key={formData.ogImage}
                            src={formData.ogImage}
                            alt="Preview"
                            className="w-full h-full object-cover rounded-t-lg"
                          />
                        </div>
                      ) : (
                        <div className="w-full bg-gray-200 aspect-[1.91/1] flex items-center justify-center rounded-t-lg">
                          <span className="text-gray-400 text-sm">OG Image Placeholder</span>
                        </div>
                      )}
                      <div className="p-3">
                        <p className="text-[14px] font-semibold text-gray-900 line-clamp-2 leading-snug mb-1">{formData.title}</p>
                        <p className="text-[12px] text-gray-500">{getCurrentSiteUrl()}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* iMessage Preview */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                      <AppleIcon />
                      iMessage
                    </h3>
                    {formData.ogVideo && formData.ogImage && (
                      <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                        <button
                          onClick={() => setPreviewMode({ ...previewMode, imessage: 'image' })}
                          className={`px-3 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1 ${
                            previewMode.imessage === 'image'
                              ? 'bg-white text-gray-900 shadow-sm'
                              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                          }`}
                          title="Show image"
                        >
                          <ImageIcon size={14} />
                        </button>
                        <button
                          onClick={() => setPreviewMode({ ...previewMode, imessage: 'video' })}
                          className={`px-3 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1 ${
                            previewMode.imessage === 'video'
                              ? 'bg-white text-gray-900 shadow-sm'
                              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                          }`}
                          title="Show video"
                        >
                          <Video size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="max-w-[500px]">
                    <div className="rounded-[22px] bg-[#e9e9eb] overflow-hidden backdrop-blur-xl">
                      {previewMode.imessage === 'video' && formData.ogVideo ? (
                        <div className="w-full bg-gray-100 aspect-[1.91/1]">
                          <video
                            key={formData.ogVideo}
                            src={formData.ogVideo}
                            className="w-full h-full object-cover"
                            autoPlay
                            muted
                            playsInline
                            loop
                            controls
                            poster={formData.ogImage}
                          />
                        </div>
                      ) : formData.ogImage ? (
                        <div className="w-full bg-gray-100 aspect-[1.91/1]">
                          <img
                            key={formData.ogImage}
                            src={formData.ogImage}
                            alt="Preview"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="w-full bg-gray-200 aspect-[1.91/1] flex items-center justify-center">
                          <span className="text-gray-400 text-sm">OG Image Placeholder</span>
                        </div>
                      )}
                      <div className="p-4">
                        <p className="text-sm font-semibold text-gray-900 mb-1 line-clamp-1">{formData.title}</p>
                        <p className="text-xs text-gray-600 line-clamp-2">{formData.description}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Slack Preview */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                      <SlackIcon />
                      Slack
                    </h3>
                    {formData.ogVideo && formData.ogImage && (
                      <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                        <button
                          onClick={() => setPreviewMode({ ...previewMode, slack: 'image' })}
                          className={`px-3 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1 ${
                            previewMode.slack === 'image'
                              ? 'bg-white text-gray-900 shadow-sm'
                              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                          }`}
                          title="Show image"
                        >
                          <ImageIcon size={14} />
                        </button>
                        <button
                          onClick={() => setPreviewMode({ ...previewMode, slack: 'video' })}
                          className={`px-3 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1 ${
                            previewMode.slack === 'video'
                              ? 'bg-white text-gray-900 shadow-sm'
                              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                          }`}
                          title="Show video"
                        >
                          <Video size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="max-w-[500px]">
                    <div className="flex border-l-4 border-[#e8e8e8] pl-3 py-1 bg-transparent">
                      <div className="flex flex-col w-full">
                        <div className="flex items-center gap-2 mb-1">
                          {formData.favicon && (
                            <img src={formData.favicon} alt="" className="w-4 h-4 rounded-sm" />
                          )}
                          <span className="text-[13px] font-semibold text-gray-700">{formData.siteName || getCurrentSiteUrl()}</span>
                        </div>
                        <h3 className="text-[#1264a3] font-bold text-[15px] hover:underline cursor-pointer line-clamp-1 mb-1">{formData.title}</h3>
                        <p className="text-[15px] text-gray-800 mb-2">{formData.description}</p>
                        {previewMode.slack === 'video' && formData.ogVideo ? (
                          <div className="mt-2 rounded-lg max-w-full">
                            <video
                              key={formData.ogVideo}
                              src={formData.ogVideo}
                              className="max-h-[300px] w-auto object-contain rounded-lg"
                              autoPlay
                              muted
                              playsInline
                              loop
                              controls
                              poster={formData.ogImage}
                            />
                          </div>
                        ) : formData.ogImage ? (
                          <div className="mt-2 rounded-lg max-w-full">
                            <img
                              key={formData.ogImage}
                              src={formData.ogImage}
                              alt="Preview"
                              className="max-h-[300px] w-auto object-contain rounded-lg"
                            />
                          </div>
                        ) : (
                          <div className="mt-2 bg-gray-200 aspect-[1.91/1] flex items-center justify-center rounded-lg">
                            <span className="text-gray-400 text-sm">OG Image Placeholder</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Discord Preview */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                      <DiscordIcon />
                      Discord
                    </h3>
                    {formData.ogVideo && formData.ogImage && (
                      <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                        <button
                          onClick={() => setPreviewMode({ ...previewMode, discord: 'image' })}
                          className={`px-3 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1 ${
                            previewMode.discord === 'image'
                              ? 'bg-white text-gray-900 shadow-sm'
                              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                          }`}
                          title="Show image"
                        >
                          <ImageIcon size={14} />
                        </button>
                        <button
                          onClick={() => setPreviewMode({ ...previewMode, discord: 'video' })}
                          className={`px-3 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1 ${
                            previewMode.discord === 'video'
                              ? 'bg-white text-gray-900 shadow-sm'
                              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                          }`}
                          title="Show video"
                        >
                          <Video size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="max-w-[432px]">
                    <div className="bg-[#2f3136] rounded border-l-4 border-[#5865F2] p-3">
                      <p className="text-[12px] font-semibold mb-2 text-[#b9bbbe] uppercase">
                        {getCurrentSiteUrl()}
                      </p>
                      <h3 className="text-[#00a8fc] font-semibold text-base hover:underline cursor-pointer mb-1 line-clamp-1">{formData.title}</h3>
                      <p className="text-sm text-[#dcddde] mb-3 line-clamp-2">{formData.description}</p>
                      {previewMode.discord === 'video' && formData.ogVideo ? (
                        <div className="rounded overflow-hidden">
                          <video
                            key={formData.ogVideo}
                            src={formData.ogVideo}
                            className="w-full rounded max-h-[400px] object-cover"
                            autoPlay
                            muted
                            playsInline
                            loop
                            controls
                            poster={formData.ogImage}
                          />
                        </div>
                      ) : formData.ogImage ? (
                        <div className="rounded overflow-hidden">
                          <img
                            key={formData.ogImage}
                            src={formData.ogImage}
                            alt="Preview"
                            className="w-full rounded max-h-[400px] object-cover"
                          />
                        </div>
                      ) : (
                        <div className="bg-gray-700 aspect-[1.91/1] flex items-center justify-center rounded">
                          <span className="text-gray-400 text-sm">OG Image Placeholder</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* External URL Checker - Preview Layout */}
              <div className="space-y-16">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                      Link Preview
                    </h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      Enter a URL to see how it appears when shared on different platforms
                    </p>
                  </div>
                </div>

                {/* URL Input */}
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={externalUrl}
                    onChange={(e) => setExternalUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleExternalUrlCheck();
                      }
                    }}
                    placeholder="https://example.com"
                    className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    onClick={handleExternalUrlCheck}
                    disabled={loading}
                    className={`flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-all hover:opacity-90 bg-blue-500 text-white ${
                      loading ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {loading ? (
                      <>
                        <RefreshCw size={16} className="animate-spin" />
                        <span>Checking...</span>
                      </>
                    ) : (
                      <>
                        <Globe size={16} />
                        <span>Check</span>
                      </>
                    )}
                  </button>
                </div>

                {externalMetadata && (
                  <>
                    {/* Twitter/X Preview */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                          </svg>
                          Twitter / X
                        </h3>
                      </div>
                      <div className="max-w-[504px]">
                        <div className="border border-[#cfd9de] rounded-2xl overflow-hidden bg-white">
                          {externalMetadata.image ? (
                            <div className="w-full bg-gray-100 aspect-[1.91/1]">
                              <img
                                src={externalMetadata.image}
                                alt="Preview"
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                  const parent = e.currentTarget.parentElement;
                                  if (parent) {
                                    parent.innerHTML = '<div class="text-center p-4"><p class="text-gray-600">Failed to load image</p></div>';
                                  }
                                }}
                              />
                            </div>
                          ) : (
                            <div className="w-full bg-gray-200 aspect-[1.91/1] flex items-center justify-center">
                              <span className="text-gray-400 text-sm">OG Image Placeholder</span>
                            </div>
                          )}
                          <div className="p-3">
                            <p className="text-[13px] text-[#536471] mb-1 lowercase">{externalMetadata.hostname || 'N/A'}</p>
                            <p className="text-[15px] font-bold text-gray-900 mb-1 line-clamp-1">{externalMetadata.title || 'N/A'}</p>
                            <p className="text-[15px] text-[#536471] line-clamp-2">{externalMetadata.description || 'N/A'}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Facebook Preview */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                          <FacebookIcon />
                          Facebook
                        </h3>
                      </div>
                      <div className="max-w-[524px]">
                        <div className="border border-[#dddfe2] bg-[#f2f3f5]">
                          {externalMetadata.image ? (
                            <div className="w-full bg-gray-100 aspect-[1.91/1]">
                              <img
                                src={externalMetadata.image}
                                alt="Preview"
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                  const parent = e.currentTarget.parentElement;
                                  if (parent) {
                                    parent.innerHTML = '<div class="text-center p-4"><p class="text-gray-600">Failed to load image</p></div>';
                                  }
                                }}
                              />
                            </div>
                          ) : (
                            <div className="w-full bg-gray-200 aspect-[1.91/1] flex items-center justify-center">
                              <span className="text-gray-400 text-sm">OG Image Placeholder</span>
                            </div>
                          )}
                          <div className="p-[10px_12px] border-t border-[#dddfe2]">
                            <p className="text-[12px] text-[#606770] uppercase tracking-wide mb-1">{externalMetadata.hostname || 'N/A'}</p>
                            <p className="text-[16px] font-bold text-[#1d2129] mb-1 leading-5 line-clamp-1">{externalMetadata.title || 'N/A'}</p>
                            <p className="text-[14px] text-[#606770] line-clamp-1">{externalMetadata.description || 'N/A'}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* LinkedIn Preview */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                          <LinkedInIcon />
                          LinkedIn
                        </h3>
                      </div>
                      <div className="max-w-[552px]">
                        <div className="border border-[#e0e0e0] bg-white rounded-t-lg shadow-sm">
                          {externalMetadata.image ? (
                            <div className="w-full bg-gray-100 aspect-[1.91/1]">
                              <img
                                src={externalMetadata.image}
                                alt="Preview"
                                className="w-full h-full object-cover rounded-t-lg"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                  const parent = e.currentTarget.parentElement;
                                  if (parent) {
                                    parent.innerHTML = '<div class="text-center p-4"><p class="text-gray-600">Failed to load image</p></div>';
                                  }
                                }}
                              />
                            </div>
                          ) : (
                            <div className="w-full bg-gray-200 aspect-[1.91/1] flex items-center justify-center rounded-t-lg">
                              <span className="text-gray-400 text-sm">OG Image Placeholder</span>
                            </div>
                          )}
                          <div className="p-3">
                            <p className="text-[14px] font-semibold text-gray-900 line-clamp-2 leading-snug mb-1">{externalMetadata.title || 'N/A'}</p>
                            <p className="text-[12px] text-gray-500">{externalMetadata.hostname || 'N/A'}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* iMessage Preview */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                          <AppleIcon />
                          iMessage
                        </h3>
                      </div>
                      <div className="max-w-[500px]">
                        <div className="rounded-[22px] bg-[#e9e9eb] overflow-hidden backdrop-blur-xl">
                          {externalMetadata.image ? (
                            <div className="w-full bg-gray-100 aspect-[1.91/1]">
                              <img
                                src={externalMetadata.image}
                                alt="Preview"
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                  const parent = e.currentTarget.parentElement;
                                  if (parent) {
                                    parent.innerHTML = '<div class="text-center p-4"><p class="text-gray-600">Failed to load image</p></div>';
                                  }
                                }}
                              />
                            </div>
                          ) : (
                            <div className="w-full bg-gray-200 aspect-[1.91/1] flex items-center justify-center">
                              <span className="text-gray-400 text-sm">OG Image Placeholder</span>
                            </div>
                          )}
                          <div className="p-4">
                            <p className="text-sm font-semibold text-gray-900 mb-1 line-clamp-1">{externalMetadata.title || 'N/A'}</p>
                            <p className="text-xs text-gray-600 line-clamp-2">{externalMetadata.description || 'N/A'}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Slack Preview */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                          <SlackIcon />
                          Slack
                        </h3>
                      </div>
                      <div className="max-w-[500px]">
                        <div className="flex border-l-4 border-[#e8e8e8] pl-3 py-1 bg-transparent">
                          <div className="flex flex-col w-full">
                            <div className="flex items-center gap-2 mb-1">
                              {externalMetadata.favicon && (
                                <img src={externalMetadata.favicon} alt="" className="w-4 h-4 rounded-sm" />
                              )}
                              <span className="text-[13px] font-semibold text-gray-700">{externalMetadata.hostname || 'N/A'}</span>
                            </div>
                            <h3 className="text-[#1264a3] font-bold text-[15px] hover:underline cursor-pointer line-clamp-1 mb-1">{externalMetadata.title || 'N/A'}</h3>
                            <p className="text-[15px] text-gray-800 mb-2">{externalMetadata.description || 'N/A'}</p>
                            {externalMetadata.image ? (
                              <div className="mt-2 rounded-lg max-w-full">
                                <img
                                  src={externalMetadata.image}
                                  alt="Preview"
                                  className="max-h-[300px] w-auto object-contain rounded-lg"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                    const parent = e.currentTarget.parentElement;
                                    if (parent) {
                                      parent.innerHTML = '<div class="text-center p-4"><p class="text-gray-600">Failed to load image</p></div>';
                                    }
                                  }}
                                />
                              </div>
                            ) : (
                              <div className="mt-2 bg-gray-200 aspect-[1.91/1] flex items-center justify-center rounded-lg">
                                <span className="text-gray-400 text-sm">OG Image Placeholder</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Discord Preview */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                          <DiscordIcon />
                          Discord
                        </h3>
                      </div>
                      <div className="max-w-[432px]">
                        <div className="bg-[#2f3136] rounded border-l-4 border-[#5865F2] p-3">
                          <p className="text-[12px] font-semibold mb-2 text-[#b9bbbe] uppercase">
                            {externalMetadata.hostname || 'N/A'}
                          </p>
                          <h3 className="text-[#00a8fc] font-semibold text-base hover:underline cursor-pointer mb-1 line-clamp-1">{externalMetadata.title || 'N/A'}</h3>
                          <p className="text-sm text-[#dcddde] mb-3 line-clamp-2">{externalMetadata.description || 'N/A'}</p>
                          {externalMetadata.image ? (
                            <div className="rounded overflow-hidden">
                              <img
                                src={externalMetadata.image}
                                alt="Preview"
                                className="w-full rounded max-h-[400px] object-cover"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                  const parent = e.currentTarget.parentElement;
                                  if (parent) {
                                    parent.innerHTML = '<div class="text-center p-4"><p class="text-gray-600">Failed to load image</p></div>';
                                  }
                                }}
                              />
                            </div>
                          ) : (
                            <div className="bg-gray-700 aspect-[1.91/1] flex items-center justify-center rounded">
                              <span className="text-gray-400 text-sm">OG Image Placeholder</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
