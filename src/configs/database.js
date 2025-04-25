module.exports.DB_PORT =
  process.env.DB_PORT || 'mongodb://127.0.0.1:27017/teamgrow';

module.exports.DB_TEST_PORT =
  process.env.DB_TEST_PORT || 'mongodb://127.0.0.1:27017/test_db';

module.exports.DB_NAME = process.env.DB_NAME || 'teamgrow';

module.exports.DB_MATERIAL_PORT =
  process.env.DB_MATERIAL_PORT ||
  'mongodb://127.0.0.1:27017/crmgrow_material_tracker';

module.exports.DB_AUTOMATION_PORT =
  process.env.DB_AUTOMATION_PORT ||
  'mongodb://127.0.0.1:27017/crmgrow_automation';
