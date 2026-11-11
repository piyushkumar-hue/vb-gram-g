const mongoose = require('mongoose');

const AREA_LEVELS = ['state', 'district', 'block', 'gramPanchayat'];
const CODE_SCHEMES = ['LGD', 'ISO-3166-2', 'geoBoundaries'];

const administrativeAreaSchema = new mongoose.Schema(
  {
    level: { type: String, enum: AREA_LEVELS, required: true },
    name: { type: String, required: true, trim: true, maxlength: 150 },
    code: { type: String, required: true, trim: true, maxlength: 80 },
    codeScheme: { type: String, enum: CODE_SCHEMES, required: true },
    parentCode: { type: String, trim: true, maxlength: 80, default: null },
    parentCodeScheme: { type: String, enum: CODE_SCHEMES, default: null },
    boundaryId: { type: String, trim: true, maxlength: 100, default: null },
    source: {
      dataset: { type: String, required: true, trim: true, maxlength: 200 },
      url: { type: String, required: true, trim: true, maxlength: 500 },
      license: { type: String, required: true, trim: true, maxlength: 200 },
      accessedAt: { type: Date, required: true },
    },
  },
  { timestamps: true }
);

administrativeAreaSchema.pre('validate', function validateParent(next) {
  const expectedParent = {
    state: null,
    district: 'state',
    block: 'district',
    gramPanchayat: 'block',
  }[this.level];
  if (expectedParent === null && (this.parentCode || this.parentCodeScheme)) {
    this.invalidate('parentCode', 'State records cannot have a parent code.');
  } else if (expectedParent && (!this.parentCode || !this.parentCodeScheme)) {
    this.invalidate('parentCode', `${this.level} records require a ${expectedParent} parent code.`);
  }
  next();
});

administrativeAreaSchema.index({ level: 1, codeScheme: 1, code: 1 }, { unique: true });
administrativeAreaSchema.index({ level: 1, parentCodeScheme: 1, parentCode: 1 });

module.exports = mongoose.model('AdministrativeArea', administrativeAreaSchema);
module.exports.AREA_LEVELS = AREA_LEVELS;
module.exports.CODE_SCHEMES = CODE_SCHEMES;
