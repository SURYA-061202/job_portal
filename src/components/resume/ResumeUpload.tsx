'use client';

import { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText } from 'lucide-react';

interface ResumeUploadProps {
  onUpload: (file: File) => void;
  loading: boolean;
}

export default function ResumeUpload({ onUpload, loading }: ResumeUploadProps) {
  const [file, setFile] = useState<File | null>(null);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    },
    maxFiles: 1,
    onDrop: (acceptedFiles) => {
      setFile(acceptedFiles[0]);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      alert('Please select a resume file');
      return;
    }
    onUpload(file);
  };

  return (
    <div className="bg-white rounded-lg shadow p-6 w-full h-full flex flex-col">


      <form onSubmit={handleSubmit} className="space-y-4 flex flex-col flex-1">
        <div className="flex-1 flex flex-col">

          <div
            {...getRootProps()}
            className={`flex-1 border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors flex items-center justify-center ${isDragActive
                ? 'border-primary-500 bg-primary-50'
                : 'border-gray-300 hover:border-primary-400'
              }`}
          >
            <input {...getInputProps()} />
            {loading ? (
              <div className="flex flex-col items-center justify-center w-full">
                <svg className="animate-spin h-12 w-12 text-primary-600" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              </div>
            ) : file ? (
              <div className="flex items-center justify-center space-x-2">
                <FileText className="h-6 w-6 text-primary-600" />
                <span className="text-sm text-gray-600">{file.name}</span>
              </div>
            ) : (
              <div>
                <Upload className="mx-auto h-12 w-12 text-gray-400" />
                <p className="mt-2 text-sm text-gray-600">
                  {isDragActive
                    ? 'Drop the resume here...'
                    : 'Drag and drop a resume file here, or click to select'}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Supports PDF, DOC, DOCX files
                </p>
              </div>
            )}
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !file}
          className="w-full bg-primary-600 text-white py-2 px-4 rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Uploading & Extracting…' : 'Upload Resume'}
        </button>
      </form>
    </div>
  );
} 