// A helper function to add Cloudinary optimization parameters to a URL
const getOptimizedImageUrl = (originalUrl) => {
    if (!originalUrl) return null;

    // The base Cloudinary URL looks like: https://res.cloudinary.com/<cloud_name>/image/upload/<public_id>.<extension>
    // We insert the transformation parameters right after the 'upload/' segment.
    const parts = originalUrl.split('/upload/');
    if (parts.length !== 2) return originalUrl; // Return original if not a standard URL

    // w_1200: Sets the width to 1200 pixels
    // q_auto: Optimizes the quality automatically for the smallest file size
    // f_auto: Automatically uses the best format (e.g., WebP, AVIF) for the user's browser
    const transformation = 'w_1200,q_auto,f_auto/';

    return `${parts[0]}/upload/${transformation}${parts[1]}`;
};

module.exports = { getOptimizedImageUrl };