'use client';

import { useState, useEffect, useCallback } from 'react';
import { Upload, Globe, Save, RefreshCw } from 'lucide-react';
import { NotificationModal } from '@/components/ui/NotificationModal';
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
  const [activeTab, setActiveTab] = useState<'current' | 'external' | 'preview'>(
    isProduction ? 'preview' : 'current'
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
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
    favicon: '/favicon.png',
  });

  // Define loadCurrentMetadata before useEffect that uses it
  const loadCurrentMetadata = async (): Promise<void> => {
    setLoading(true);
    try {
      const response = await fetch('/api/metadata/current');
      if (response.ok) {
        const data = await response.json();
        // Normalize image paths (remove any accidental escaping)
        const normalizedData = {
          ...data,
          ogImage: data.ogImage?.replace(/\\+\./g, '.') || data.ogImage,
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
      const response = await fetch('/api/metadata/update', {
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
    const formDataUpload = new FormData();
    formDataUpload.append('file', file);
    formDataUpload.append('type', type);

    try {
      const response = await fetch('/api/metadata/upload-image', {
        method: 'POST',
        body: formDataUpload,
      });

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
      }
    } catch (error) {
      console.error('Failed to upload image:', error);
    }
  };

  const handleExternalUrlCheck = async (): Promise<void> => {
    if (!externalUrl) return;

    setLoading(true);
    try {
      const encodedUrl = encodeURIComponent(externalUrl);
      const response = await fetch(`/api/meta?url=${encodedUrl}`);
      
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

      <div className="min-h-screen w-full px-4 py-6 md:px-6 md:py-8 bg-white">
        <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-bold mb-2 text-gray-900">
            Sharing Metadata Editor
          </h1>
          <p className="text-sm md:text-base text-gray-600">
            Manage Open Graph and social media sharing metadata
          </p>
        </div>

        {/* Tabs */}
        <div className="flex flex-col md:flex-row gap-2 mb-6">
          {!isProduction && (
            <button
              onClick={() => setActiveTab('current')}
              className={`px-6 py-3 rounded-lg font-medium transition-all ${
                activeTab === 'current' 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
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
                : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
            }`}
          >
            Preview
          </button>
          <button
            onClick={() => setActiveTab('external')}
            className={`px-6 py-3 rounded-lg font-medium transition-all ${
              activeTab === 'external' 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
            }`}
          >
            Check External URL
          </button>
        </div>

        {/* Content Container */}
        <div className="p-6 md:p-8 bg-gray-50 rounded-lg border border-gray-300">
          {activeTab === 'current' && !isProduction ? (
            <>
              {/* Current Site Metadata Form */}
              <div className="space-y-6">
                {/* Basic Info */}
                <div className="space-y-4">
                  <h2 className="text-xl font-semibold mb-4 text-gray-900">
                    Basic Information
                  </h2>

                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-900">
                      Site URL
                    </label>
                    <div className="inline-flex items-center gap-2 text-sm text-gray-600">
                      <Globe size={16} />
                      {getCurrentSiteUrl()}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-900">
                      Site Title
                    </label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="w-full px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-900">
                      Description
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      rows={3}
                      className="w-full px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* OG Image */}
                <div className="space-y-4 pt-6 border-t border-gray-300">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-semibold text-gray-900">
                        Open Graph Image
                      </h2>
                      {formData.ogImage && (
                        <p className="text-sm mt-1 text-gray-600">
                          {formData.ogImage}
                        </p>
                      )}
                    </div>
                    <label className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 cursor-pointer hover:bg-gray-100 transition-colors flex-shrink-0 text-gray-900 bg-white">
                      <Upload size={16} />
                      <span>Upload Image</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleImageUpload(file, 'og');
                        }}
                      />
                    </label>
                  </div>

                  <div className="mt-4 space-y-4">
                    <p className="text-sm font-medium mb-2 text-gray-900">
                      Preview
                    </p>
                    {formData.ogImage ? (
                      <div className="w-full max-w-[380px] bg-gray-100 flex items-center justify-center aspect-[1200/630]">
                        <img
                          key={formData.ogImage}
                          src={formData.ogImage}
                          alt="OG Image Preview"
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
                      <div className="w-full max-w-[380px] bg-gray-200 flex items-center justify-center aspect-[1200/630] rounded">
                        <span className="text-gray-400 text-sm">OG Image Placeholder</span>
                      </div>
                    )}

                      {/* File Information */}
                      <div className="w-full max-w-[380px] p-4 rounded-lg border border-gray-300 bg-white">
                        <p className="text-sm font-medium mb-3 text-gray-900">
                          File Information
                        </p>
                        <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
                          <div>
                            <span className="text-gray-600">Dimensions: </span>
                            <span className="text-gray-900">
                              {formData.ogImageWidth} × {formData.ogImageHeight}px
                            </span>
                          </div>
                          {formData.ogImageSize && (
                            <div>
                              <span className="text-gray-600">Size: </span>
                              <span className="text-gray-900">
                                {(formData.ogImageSize / 1024).toFixed(2)} KB
                              </span>
                            </div>
                          )}
                          {formData.ogImageUploadDate && (
                            <div className="md:col-span-2">
                              <span className="text-gray-600">Uploaded: </span>
                              <span className="text-gray-900">
                                {new Date(formData.ogImageUploadDate).toLocaleString()}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                </div>

                {/* Favicon */}
                <div className="space-y-4 pt-6 border-t border-gray-300">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-semibold text-gray-900">
                        Favicon
                      </h2>
                      {formData.favicon && (
                        <p className="text-sm mt-1 text-gray-600">
                          {formData.favicon}
                        </p>
                      )}
                    </div>
                    <label className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 cursor-pointer hover:bg-gray-100 transition-colors flex-shrink-0 text-gray-900 bg-white">
                      <Upload size={16} />
                      <span>Upload Icon</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleImageUpload(file, 'favicon');
                        }}
                      />
                    </label>
                  </div>

                  <div className="mt-4">
                    <p className="text-sm font-medium mb-2 text-gray-900">
                      Preview
                    </p>
                    {formData.favicon ? (
                      <div className={styles.faviconPreview}>
                        <img
                          key={formData.favicon}
                          src={formData.favicon}
                          alt="Favicon Preview"
                        />
                      </div>
                    ) : (
                      <div className={styles.faviconPreview}>
                        <div className="w-full h-full bg-gray-200 flex items-center justify-center rounded">
                          <span className="text-gray-400 text-xs">Icon</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Save Button */}
                <div className="flex justify-end pt-6 border-t border-gray-300">
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
              <div className="space-y-6">
                <h2 className="text-xl font-semibold text-gray-900">
                  Link Preview
                </h2>
                <p className="text-sm text-gray-600">
                  See how your link will appear when shared on different platforms
                </p>

                {/* Twitter/X Preview */}
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Twitter / X
                  </h3>
                  <div className="max-w-[550px] rounded-lg shadow-sm">
                    <div className="overflow-hidden rounded-lg">
                      {formData.ogImage ? (
                        <div className="w-full bg-gray-100 aspect-[2/1]">
                          <img
                            key={formData.ogImage}
                            src={formData.ogImage}
                            alt="Preview"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="w-full bg-gray-200 aspect-[2/1] flex items-center justify-center">
                          <span className="text-gray-400 text-sm">OG Image Placeholder</span>
                        </div>
                      )}
                      <div className="p-3 bg-white">
                        <p className="text-xs text-gray-500 mb-1">{getCurrentSiteUrl()}</p>
                        <p className="text-sm font-semibold text-gray-900 mb-1">{formData.title}</p>
                        <p className="text-xs text-gray-600 line-clamp-2">{formData.description}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Facebook Preview */}
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Facebook
                  </h3>
                  <div className="max-w-[550px] rounded-lg shadow-sm">
                    <div className="overflow-hidden rounded-lg">
                      {formData.ogImage ? (
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
                      <div className="p-3 bg-gray-50">
                        <p className="text-xs text-gray-500 uppercase mb-1">{getCurrentSiteUrl()}</p>
                        <p className="text-base font-semibold text-gray-900 mb-1">{formData.title}</p>
                        <p className="text-sm text-gray-600 line-clamp-2">{formData.description}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* LinkedIn Preview */}
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold text-gray-900">
                    LinkedIn
                  </h3>
                  <div className="max-w-[550px] rounded-lg shadow-sm">
                    <div className="overflow-hidden rounded-lg">
                      {formData.ogImage ? (
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
                      <div className="p-3 bg-white">
                        <p className="text-sm font-semibold text-gray-900 mb-1">{formData.title}</p>
                        <p className="text-xs text-gray-500">{getCurrentSiteUrl()}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* iMessage / Slack Preview */}
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold text-gray-900">
                    iMessage / Slack
                  </h3>
                  <div className="max-w-[400px] rounded-lg shadow-sm">
                    <div className="overflow-hidden rounded-lg">
                      {formData.ogImage ? (
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
                      <div className="p-3 bg-white">
                        <p className="text-sm font-semibold text-gray-900 mb-1 line-clamp-1">{formData.title}</p>
                        <p className="text-xs text-gray-600 line-clamp-2 mb-2">{formData.description}</p>
                        <p className="text-xs text-gray-400">{getCurrentSiteUrl()}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Discord Preview */}
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Discord
                  </h3>
                  <div className="max-w-[450px] rounded-lg shadow-sm">
                    <div className="border-l-4 border-indigo-500 pl-3">
                      <p className="text-xs font-semibold mb-2 text-indigo-500">
                        {getCurrentSiteUrl()}
                      </p>
                      <p className="text-sm font-semibold text-blue-600 hover:underline mb-1">{formData.title}</p>
                      <p className="text-xs text-gray-600 mb-3">{formData.description}</p>
                      {formData.ogImage ? (
                        <div className="max-w-[400px] rounded-lg">
                          <img
                            key={formData.ogImage}
                            src={formData.ogImage}
                            alt="Preview"
                            className="w-full rounded-lg"
                          />
                        </div>
                      ) : (
                        <div className="max-w-[400px] bg-gray-200 aspect-[1.91/1] flex items-center justify-center rounded-lg">
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
              {/* External URL Checker */}
              <div className="space-y-6">
                <h2 className="text-xl font-semibold text-gray-900">
                  Check External URL Metadata
                </h2>

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
                    className="flex-1 px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                  <div className="mt-6 space-y-4">
                    <h3 className="text-lg font-semibold text-gray-900">
                      Results
                    </h3>

                    <div className="space-y-3">
                      <div className="p-4 rounded-lg bg-white">
                        <p className="text-sm font-medium mb-1 text-gray-600">
                          Title
                        </p>
                        <p className="text-gray-900">{externalMetadata.title || 'N/A'}</p>
                      </div>

                      <div className="p-4 rounded-lg bg-white">
                        <p className="text-sm font-medium mb-1 text-gray-600">
                          Description
                        </p>
                        <p className="text-gray-900">{externalMetadata.description || 'N/A'}</p>
                      </div>

                      <div className="p-4 rounded-lg bg-white">
                        <p className="text-sm font-medium mb-1 text-gray-600">
                          Hostname
                        </p>
                        <p className="text-gray-900">{externalMetadata.hostname || 'N/A'}</p>
                      </div>

                      <div className="p-4 rounded-lg bg-white">
                        <p className="text-sm font-medium mb-2 text-gray-600">
                          OG Image
                        </p>
                        {externalMetadata.image ? (
                          <>
                            <a
                              href={externalMetadata.image}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block"
                            >
                              <div className="w-full max-w-md min-w-[320px] mt-2 bg-gray-100 flex items-center justify-center aspect-[1200/630]">
                                <img
                                  src={externalMetadata.image}
                                  alt="OG Image"
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                    const parent = e.currentTarget.parentElement;
                                    if (parent) {
                                      parent.innerHTML = '<div class="text-center p-4"><p class="text-gray-600">Image failed to load</p><p class="text-xs mt-2 text-gray-600">Click to view in new tab</p></div>';
                                    }
                                  }}
                                />
                              </div>
                            </a>
                            <a
                              href={externalMetadata.image}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs mt-2 block hover:underline break-all text-blue-500"
                            >
                              {externalMetadata.image}
                            </a>
                          </>
                        ) : (
                          <div className="w-full max-w-md min-w-[320px] mt-2 flex items-center justify-center bg-gray-100 aspect-[1200/630]">
                            <p className="text-center text-sm text-gray-600">
                              No OG image found
                            </p>
                          </div>
                        )}
                      </div>

                      {externalMetadata.favicon && (
                        <div className="p-4 rounded-lg bg-white">
                          <p className="text-sm font-medium mb-2 text-gray-600">
                            Favicon
                          </p>
                          <div className={styles.faviconPreview}>
                            <img
                              src={externalMetadata.favicon}
                              alt="Favicon"
                            />
                          </div>
                          <p className="text-xs mt-2 text-gray-600">
                            {externalMetadata.favicon}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
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
