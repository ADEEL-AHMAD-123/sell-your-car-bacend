const Blog = require("../models/Blog");
const ErrorResponse = require("../utils/errorResponse");
const asyncHandler = require("../middlewares/catchAsyncErrors");
const sendResponse = require("../utils/sendResponse");
const { getOptimizedImageUrl } = require("../utils/cloudinaryUtils");
// @desc      Get all blog posts with filter, sort, and pagination
// @route     GET /api/blogs
// @access    Public
exports.getBlogs = asyncHandler(async (req, res, next) => {
    // 1. Initialize query and options objects
    const query = {};
    const options = {};

    // 2. Handle Search and Filtering
    const { searchTerm, category, sortBy, page = 1, limit = 10 } = req.query;

    if (searchTerm) {
        // Case-insensitive search on title or category
        const regex = new RegExp(searchTerm, 'i');
        query.$or = [{
            title: regex
        }, {
            category: regex
        }];
    }

    if (category && category !== 'all') {
        query.category = category;
    }

    // 3. Handle Sorting
    if (sortBy === 'newest') {
        options.sort = {
            publishedAt: -1
        };
    } else if (sortBy === 'oldest') {
        options.sort = {
            publishedAt: 1
        };
    } else if (sortBy === 'title') {
        options.sort = {
            title: 1
        };
    } else {
        // Default sort order
        options.sort = {
            publishedAt: -1
        };
    }

    // 4. Handle Pagination
    const pageNumber = parseInt(page, 10) || 1;
    const limitNumber = parseInt(limit, 10) || 10;
    const skip = (pageNumber - 1) * limitNumber;

    // Get the total count of documents that match the filter
    const totalCount = await Blog.countDocuments(query);
    const totalPages = Math.ceil(totalCount / limitNumber);

    // 5. Execute the query
    const blogs = await Blog.find(query)
        .sort(options.sort)
        .skip(skip)
        .limit(limitNumber)
        .populate({
            path: "author",
            select: "firstName lastName",
        });

    // 6. Send the response with pagination data
    sendResponse(res, 200, "Blogs fetched successfully", {
        blogs,
        pagination: {
            currentPage: pageNumber,
            totalPages,
            totalBlogs: totalCount,
            limit: limitNumber,
        },
    });
});

// @desc      Get a single blog post by slug
// @route     GET /api/blogs/:slug
// @access    Public
exports.getBlog = asyncHandler(async (req, res, next) => {
    const blog = await Blog.findOne({ slug: req.params.slug }).populate({
        path: "author",
        select: "firstName lastName",
    });

    if (!blog) {
        return next(new ErrorResponse(`Blog post not found with slug of ${req.params.slug}`, 404));
    }

    sendResponse(res, 200, "Blog fetched successfully", { blog });
});




// @desc      Create a new blog post
// @route     POST /api/blogs
// @access    Private/Admin
exports.createBlog = asyncHandler(async (req, res, next) => {
    const { title, content, metaDescription, category, keywords, imageAltText, featured } = req.body;

    if (!req.file) {
        return next(new ErrorResponse("Please upload a featured image", 400));
    }

    const optimizedImageUrl = getOptimizedImageUrl(req.file.path);
    
    const blogData = {
        title,
        content,
        metaDescription,
        category,
        keywords: keywords ? keywords.split(",").map(kw => kw.trim()) : [],
        author: req.user.id,
        image: {
            url: optimizedImageUrl, // Store the optimized URL
            altText: imageAltText,
        },
        featured,
    };

    const blog = await Blog.create(blogData);
    sendResponse(res, 201, "Blog post created successfully", { blog });
});

// @desc      Update a blog post
// @route     PUT /api/blogs/:id
// @access    Private/Admin
exports.updateBlog = asyncHandler(async (req, res, next) => {
    let blog = await Blog.findById(req.params.id);

    if (!blog) {
        return next(new ErrorResponse(`Blog post not found with ID of ${req.params.id}`, 404));
    }

    const updateData = { ...req.body };

    if (updateData.keywords) {
        updateData.keywords = updateData.keywords.split(",").map(kw => kw.trim());
    } else {
        updateData.keywords = [];
    }

    if (req.file) {
        const optimizedImageUrl = getOptimizedImageUrl(req.file.path);
        
        updateData.image = {
            url: optimizedImageUrl, // Store the new optimized URL
            altText: updateData.imageAltText || blog.image?.altText || '',
        };
    } else if (updateData.imageAltText !== undefined) {
        updateData.image = {
            ...blog.image,
            altText: updateData.imageAltText
        };
    }
    
    delete updateData.imageAltText;
    
    updateData.author = req.user.id;

    blog = await Blog.findByIdAndUpdate(req.params.id, updateData, {
        new: true,
        runValidators: true,
    }).populate({ path: "author", select: "firstName lastName" });

    sendResponse(res, 200, "Blog post updated successfully", { blog });
});

// @desc      Delete a blog post
// @route     DELETE /api/blogs/:id
// @access    Private/Admin
exports.deleteBlog = asyncHandler(async (req, res, next) => {
    const blog = await Blog.findById(req.params.id);

    if (!blog) {
        return next(new ErrorResponse(`Blog post not found with ID of ${req.params.id}`, 404));
    }

    await blog.deleteOne();
    sendResponse(res, 200, "Blog post deleted successfully", {});
});