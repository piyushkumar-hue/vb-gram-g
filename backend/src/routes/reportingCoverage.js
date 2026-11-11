const express = require('express');
const ReportingCoverage = require('../models/ReportingCoverage');
const Work = require('../models/Work');
const { allowRoles, requireAuth } = require('../middleware/auth');
const { periodDateRange, validateZeroCoverageInput } = require('../domain/reportingCoverage');
const { rejectUnknownQueryParams } = require('../middleware/requestInput');

const router = express.Router();
router.use(rejectUnknownQueryParams());

router.post('/', requireAuth, allowRoles('admin', 'officer'), async (request, response, next) => {
  const validationError = validateZeroCoverageInput(request.body);
  if (validationError) return response.status(400).json({ message: validationError });

  const state = request.body.state.trim();
  const district = request.body.district.trim();
  const { periodFrom, periodTo } = periodDateRange(request.body.periodFrom, request.body.periodTo);
  try {
    const existingWorkCount = await Work.countDocuments({
      isDemo: { $ne: true },
      'location.state': state,
      'location.district': district,
      plannedStartDate: { $gte: periodFrom, $lte: periodTo },
    }).collation({ locale: 'en', strength: 1 });
    if (existingWorkCount > 0) {
      return response.status(409).json({
        message: 'A zero-work report cannot be submitted while work records exist for this district and reporting period.',
      });
    }

    const report = await ReportingCoverage.create({
      state,
      district,
      periodFrom,
      periodTo,
      reportedWorkCount: 0,
      submittedBy: request.user._id,
    });
    return response.status(201).json({
      data: {
        state: report.state,
        district: report.district,
        periodFrom: report.periodFrom,
        periodTo: report.periodTo,
        reportedWorkCount: report.reportedWorkCount,
        submittedAt: report.createdAt,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return response.status(409).json({
        message: 'A zero-work report already exists for this district and reporting period.',
      });
    }
    return next(error);
  }
});

module.exports = router;
