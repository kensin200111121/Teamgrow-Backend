const { original_templates } = require('../data/template');

const filteredTemplates = (query) => {
  const queryData = query.getQuery();
  const queryParam = queryData?._id?.$in || [];
  if (queryParam.length && typeof queryParam[0] !== 'string') {
    return original_templates.filter((e) =>
      queryParam.some((v) => v.equals(e._id))
    );
  } else if (queryParam.length && typeof queryParam[0] === 'string') {
    return original_templates.filter((e) => queryParam.includes(`${e._id}`));
  } else {
    return [];
  }
};

module.exports = { filteredTemplates };
