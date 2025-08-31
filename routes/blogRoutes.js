// 💡 blogRouter.js - Using slug for GET and id for PUT/DELETE
const express = require("express");
const {
  getBlogs,
  getBlog,
  createBlog,
  updateBlog,
  deleteBlog,
} = require("../controllers/blogController");


const { protect, adminOnly } = require("../middlewares/authMiddleware");
const upload = require("../middlewares/upload");

const router = express.Router();

// Public Routes
router
  .route("/")
  .get(getBlogs)
  .post(protect, adminOnly, upload.single("image"), createBlog);

// 💡 Route for fetching a single blog post by its slug (public)
router
  .route("/:slug")
  .get(getBlog); 

// 💡 Route for updating and deleting a blog post by its unique ID (admin only) 
router
  .route("/:id")
  .put(protect, adminOnly, upload.single("image"), updateBlog)
  .delete(protect, adminOnly, deleteBlog);

module.exports = router;
