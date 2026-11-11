const express = require('express');
const FieldUpdate = require('../models/FieldUpdate');
const ReportingCoverage = require('../models/ReportingCoverage');
const Work = require('../models/Work');
const { requireAuth } = require('../middleware/auth');
const { canApplyZeroCoverage, periodDateRange } = require('../domain/reportingCoverage');
const { buildWorkFilter, validateWorkQuery } = require('../domain/workQuery');

const router = express.Router();

function historyFilter(filter) {
  const result = {};
  for (const [field, value] of Object.entries(filter)) {
    if (field === '$or') {
      result.$or = value.map((condition) =>
        Object.fromEntries(Object.entries(condition).map(([key, item]) => [`work.${key}`, item]))
      );
    } else if (field === '$expr') {
      result.$expr = {
        [Object.keys(value)[0]]: Object.values(value)[0].map((path) => `$work.${path.slice(1)}`),
      };
    } else {
      result[`work.${field}`] = value;
    }
  }
  return result;
}

function buildGeography(groups, coverageReports = []) {
  const districts = new Map();
  function getDistrict(state, district) {
    const key = `${state}\u0000${district}`;
    if (!districts.has(key)) {
      districts.set(key, {
        key,
        name: district,
        state,
        count: 0,
        progressTotal: 0,
        progressCount: 0,
        completed: 0,
        approved: 0,
        started: 0,
        delayed: 0,
        expenditure: 0,
        blocks: new Map(),
        reported: false,
      });
    }
    return districts.get(key);
  }

  for (const group of groups) {
    const { state, district, block, gramPanchayat } = group._id;
    if (!state || !district) continue;
    const districtEntry = getDistrict(state, district);
    const districtCount = group.count;
    districtEntry.count += districtCount;
    districtEntry.progressTotal += group.progressTotal;
    districtEntry.progressCount += group.progressCount;
    districtEntry.completed += group.completed;
    districtEntry.approved += group.approved;
    districtEntry.started += group.started;
    districtEntry.delayed += group.delayed;
    districtEntry.expenditure += group.expenditure;

    if (block && !districtEntry.blocks.has(block)) {
      districtEntry.blocks.set(block, { name: block, count: 0, progressTotal: 0, progressCount: 0, gps: new Map() });
    }
    const blockEntry = block ? districtEntry.blocks.get(block) : null;
    if (blockEntry) {
      blockEntry.count += districtCount;
      blockEntry.progressTotal += group.progressTotal;
      blockEntry.progressCount += group.progressCount;
      if (gramPanchayat) {
        blockEntry.gps.set(gramPanchayat, {
          name: gramPanchayat,
          count: districtCount,
          progress: group.progressCount ? Math.round(group.progressTotal / group.progressCount) : null,
        });
      }
    }
  }

  for (const report of coverageReports) {
    if (!report.state || !report.district) continue;
    const district = getDistrict(report.state, report.district);
    district.reported = true;
    district.reportedAt = report.createdAt;
    district.reportedBy = report.submittedBy?.name || null;
  }

  return [...districts.values()].map((district) => ({
    key: district.key,
    name: district.name,
    state: district.state,
    count: district.count,
    progress: district.progressCount ? Math.round(district.progressTotal / district.progressCount) : null,
    completed: district.completed,
    approved: district.approved,
    started: district.started,
    ongoing: district.approved + district.started,
    delayed: district.delayed,
    expenditure: district.expenditure,
    reported: district.reported,
    reportedAt: district.reportedAt || null,
    reportedBy: district.reportedBy || null,
    completionRate: district.count ? Math.round((district.completed / district.count) * 1000) / 10 : null,
    delayRate: district.count ? Math.round((district.delayed / district.count) * 1000) / 10 : null,
    blocks: [...district.blocks.values()].map((block) => ({
      name: block.name,
      count: block.count,
      progress: block.progressCount ? Math.round(block.progressTotal / block.progressCount) : null,
      gps: [...block.gps.values()],
    })),
  }));
}

router.get('/summary', requireAuth, async (request, response, next) => {
  const validationError = validateWorkQuery(request.query, { pagination: false });
  if (validationError) return response.status(400).json({ message: validationError });

  const filter = buildWorkFilter(request.query);
  try {
    const coverageQuery = canApplyZeroCoverage(request.query)
      ? {
          ...periodDateRange(request.query.periodFrom, request.query.periodTo),
          ...(request.query.state ? { state: request.query.state } : {}),
          ...(request.query.district ? { district: request.query.district } : {}),
        }
      : null;
    const [kpiRows, statusRows, categoryRows, geographyRows, delayedWorks, progressTrend, coverageReports] = await Promise.all([
      Work.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            proposed: { $sum: { $cond: [{ $eq: ['$status', 'Proposed'] }, 1, 0] } },
            approved: { $sum: { $cond: [{ $eq: ['$status', 'Approved'] }, 1, 0] } },
            started: { $sum: { $cond: [{ $eq: ['$status', 'Started'] }, 1, 0] } },
            completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } },
            approved: { $sum: { $cond: [{ $eq: ['$status', 'Approved'] }, 1, 0] } },
            started: { $sum: { $cond: [{ $eq: ['$status', 'Started'] }, 1, 0] } },
            delayed: { $sum: { $cond: [{ $lt: ['$actualProgress', '$plannedProgress'] }, 1, 0] } },
            expenditure: { $sum: { $ifNull: ['$expenditure', 0] } },
            averageProgress: { $avg: '$actualProgress' },
            missingProgress: {
              $sum: { $cond: [{ $eq: [{ $type: '$actualProgress' }, 'number'] }, 0, 1] },
            },
            missingLocation: {
              $sum: {
                $cond: [
                  {
                    $or: [
                      { $in: [{ $type: '$location.state' }, ['missing', 'null']] },
                      { $in: [{ $type: '$location.district' }, ['missing', 'null']] },
                      { $in: [{ $type: '$location.block' }, ['missing', 'null']] },
                      { $in: [{ $type: '$location.gramPanchayat' }, ['missing', 'null']] },
                      { $in: [{ $type: '$lat' }, ['missing', 'null']] },
                      { $in: [{ $type: '$lng' }, ['missing', 'null']] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]),
      Work.aggregate([{ $match: filter }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Work.aggregate([
        { $match: filter },
        { $lookup: { from: 'categories', localField: 'category', foreignField: '_id', as: 'category' } },
        { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
        { $group: { _id: { $ifNull: ['$category.name', 'Uncategorized'] }, count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
      ]),
      Work.aggregate([
        { $match: filter },
        {
          $group: {
            _id: {
              state: '$location.state',
              district: '$location.district',
              block: '$location.block',
              gramPanchayat: '$location.gramPanchayat',
            },
            count: { $sum: 1 },
            averageProgress: { $avg: '$actualProgress' },
            progressTotal: {
              $sum: { $cond: [{ $eq: [{ $type: '$actualProgress' }, 'number'] }, '$actualProgress', 0] },
            },
            progressCount: {
              $sum: { $cond: [{ $eq: [{ $type: '$actualProgress' }, 'number'] }, 1, 0] },
            },
            completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } },
            delayed: { $sum: { $cond: [{ $lt: ['$actualProgress', '$plannedProgress'] }, 1, 0] } },
          },
        },
        { $sort: { '_id.state': 1, '_id.district': 1, '_id.block': 1, '_id.gramPanchayat': 1 } },
      ]),
      Work.find({ $and: [filter, { $expr: { $lt: ['$actualProgress', '$plannedProgress'] } }] })
        .select('name status plannedProgress actualProgress location category')
        .populate('category', 'name')
        .sort({ actualProgress: 1, _id: 1 })
        .limit(10)
        .lean(),
      FieldUpdate.aggregate([
        { $lookup: { from: Work.collection.name, localField: 'workId', foreignField: '_id', as: 'work' } },
        { $unwind: '$work' },
        { $match: historyFilter(filter) },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$receivedAt' } },
            plannedProgress: { $avg: '$work.plannedProgress' },
            actualProgress: { $avg: '$progress' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      coverageQuery
        ? ReportingCoverage.find(coverageQuery)
            .select('state district createdAt submittedBy')
            .collation({ locale: 'en', strength: 1 })
            .populate('submittedBy', 'name')
            .lean()
        : [],
    ]);

    const kpis = kpiRows[0] || {
      total: 0,
      proposed: 0,
      approved: 0,
      started: 0,
      completed: 0,
      delayed: 0,
      averageProgress: null,
      missingProgress: 0,
      missingLocation: 0,
    };
    const byStatus = Object.fromEntries(Work.WORK_STATUSES.map((status) => [status, 0]));
    for (const row of statusRows) byStatus[row._id] = row.count;

    return response.json({
      data: {
        kpis: {
          total: kpis.total,
          proposed: kpis.proposed,
          approved: kpis.approved,
          started: kpis.started,
          completed: kpis.completed,
          inProgress: kpis.started,
          delayed: kpis.delayed,
          completionRate: kpis.total ? Math.round((kpis.completed / kpis.total) * 1000) / 10 : 0,
          averageProgress: kpis.averageProgress === null ? null : Math.round(kpis.averageProgress * 10) / 10,
          missingProgress: kpis.missingProgress,
          missingLocation: kpis.missingLocation,
        },
        byStatus,
        byCategory: categoryRows.map((entry) => ({ name: entry._id, count: entry.count })),
        byDistrict: buildGeography(geographyRows, coverageReports),
        progressTrend: progressTrend.map((entry) => ({
          month: entry._id,
          plannedProgress: Math.round(entry.plannedProgress * 10) / 10,
          actualProgress: Math.round(entry.actualProgress * 10) / 10,
        })),
        delayedTotal: kpis.delayed,
        delayedWorks: delayedWorks.map((work) => ({
          id: work._id,
          name: work.name,
          status: work.status,
          plannedProgress: work.plannedProgress,
          actualProgress: work.actualProgress,
          location: work.location,
          category: work.category,
        })),
      },
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
module.exports.buildGeography = buildGeography;
