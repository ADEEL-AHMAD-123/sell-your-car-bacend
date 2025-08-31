const mongoose = require("mongoose");
const slugify = require("slugify");

const blogSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, "Please add a title"],
    unique: true,
    trim: true,
    maxlength: [100, "Title cannot be more than 100 characters"],
  },
  slug: String,
  content: {
    type: String,
    required: [true, "Please add content"],
  },
  metaDescription: {
    type: String,
    trim: true,
    maxlength: [200, "Meta description cannot be more than 200 characters"],
  },
  image: {
    url: String,
    altText: String,
  },
  author: {
    type: mongoose.Schema.ObjectId,
    ref: "User",
    required: true,
  },
  category: {
    type: String,
    enum: ['news', 'guides', 'tips', 'announcements'], 
    default: 'guides',
  },
  keywords: [String],
  publishedAt: {
    type: Date,
    default: Date.now,
  },
  featured: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

blogSchema.pre("save", function (next) {
  this.slug = slugify(this.title, { lower: true });
  next();
});

module.exports = mongoose.model("Blog", blogSchema);