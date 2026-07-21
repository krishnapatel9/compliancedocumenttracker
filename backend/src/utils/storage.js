const fs = require('fs');
const path = require('path');

// Determine storage provider from environment
const PROVIDER = process.env.STORAGE_PROVIDER || 'local';

/**
 * Saves a file and returns its destination path/URL.
 * Supports abstraction for future cloud migration (e.g. Supabase, S3).
 * @param {Object} file - Express Multer file object
 * @returns {Promise<string>} - Resolved public path or local path
 */
const saveFile = async (file) => {
    if (!file) throw new Error('No file provided to storage adapter');

    if (PROVIDER === 'local') {
        // For local storage, Multer has already saved it. 
        // We just return its relative disk path.
        return file.path;
    } else if (PROVIDER === 'supabase') {
        // Placeholder for Supabase integration stub
        console.log(`[STORAGE] Uploading ${file.filename} to Supabase bucket...`);
        return `https://supabase.co/storage/v1/object/public/documents/${file.filename}`;
    } else {
        throw new Error(`Unsupported storage provider: ${PROVIDER}`);
    }
};

/**
 * Deletes a file from the storage system.
 * @param {string} filePath - Path of the file to remove
 */
const deleteFile = (filePath) => {
    if (!filePath) return;

    if (PROVIDER === 'local') {
        const resolvedPath = path.resolve(filePath);
        if (fs.existsSync(resolvedPath)) {
            fs.unlinkSync(resolvedPath);
            console.log(`[STORAGE] Deleted local file: ${filePath}`);
        }
    } else if (PROVIDER === 'supabase') {
        // Placeholder for Supabase removal
        console.log(`[STORAGE] Deleted file from Supabase bucket: ${filePath}`);
    }
};

module.exports = {
    saveFile,
    deleteFile
};
