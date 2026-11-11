const express = require('express');
const Category = require('../models/Category');
const { requireAuth } = require('../middleware/auth');
const { rejectUnknownQueryParams } = require('../middleware/requestInput');

const router = express.Router();
router.use(rejectUnknownQueryParams());

router.get('/', requireAuth, async (request, response, next) => {
  try {
    const categories = await Category.find().sort({ name: 1 }).lean();
    return response.json({ data: categories });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
