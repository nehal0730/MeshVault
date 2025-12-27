import React, { useRef, useState } from 'react';
import './FileTransfer.css';

/**
 * FileTransfer Component
 * 
 * File picker with progress bar and file info display.
 * Shows incoming file transfers.
 */
function FileTransfer({ onSendFile, incomingFiles = [], outgoingFiles = [] }) {
  const fileInputRef = useRef(null);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      alert('File too large (max 20 MB)');
      return;
    }

    try {
      await onSendFile(file);
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      alert(error.message || 'Failed to send file');
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="file-transfer">
      <div className="file-transfer-header">
        <h3>File Transfer</h3>
      </div>

      <div className="file-transfer-content">
        {/* File picker - always at top */}
        <div className="file-transfer-picker">
          <label htmlFor="file-input" className="file-picker-label">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            <span>Choose file to send</span>
          </label>
          <input
            ref={fileInputRef}
            id="file-input"
            type="file"
            className="file-input-hidden"
            onChange={handleFileSelect}
          />
          <small className="file-picker-hint">Max 20 MB</small>
        </div>

        {/* Incoming files - show below file picker */}
        {incomingFiles.map((file) => {
          const hasActiveTransfer = file.progress > 0 && file.progress < 100;
          const isComplete = file.progress === 100 || file.downloadUrl;
          
          return (
            <div key={file.fileId} className="file-transfer-incoming">
              <div className="file-info">
                <span className="file-icon">📥</span>
                <div className="file-details">
                  <div className="file-name">{file.name}</div>
                  <div className="file-size">{formatFileSize(file.size)}</div>
                </div>
              </div>
              {hasActiveTransfer && (
                <div className="file-progress-container">
                  <div className="file-progress-bar">
                    <div
                      className="file-progress-fill"
                      style={{ width: `${file.progress}%` }}
                    />
                  </div>
                  <span className="file-progress-text">{file.progress}%</span>
                </div>
              )}
              {isComplete && (
                <div className="file-complete">
                  ✅ Download complete
                  {file.downloadUrl && (
                    <a
                      href={file.downloadUrl}
                      download={file.name}
                      className="file-download-link"
                    >
                      Click to download
                    </a>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Outgoing files */}
        {outgoingFiles.map((file) => {
          const hasActiveTransfer = file.progress > 0 && file.progress < 100;
          const isComplete = file.progress === 100;
          
          return (
            <div key={file.fileId} className="file-transfer-outgoing">
              <div className="file-info">
                <span className="file-icon">📤</span>
                <div className="file-details">
                  <div className="file-name">{file.name}</div>
                  <div className="file-size">{formatFileSize(file.size)}</div>
                </div>
              </div>
              {(hasActiveTransfer || isComplete) && (
                <div className="file-progress-container">
                  <div className="file-progress-bar">
                    <div
                      className="file-progress-fill"
                      style={{ width: `${file.progress}%` }}
                    />
                  </div>
                  <span className="file-progress-text">{file.progress}%</span>
                </div>
              )}
              {isComplete && (
                <div className="file-complete">✅ Sent to all peers</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default FileTransfer;

