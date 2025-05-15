const mongoose = require('mongoose');
const Tag = require('../models/tag');
const Contact = require('../models/contact');
const Team = require('../models/team');

const get = async (req, res) => {
  const { currentUser } = req;
  const data = await Tag.findOne({ user: currentUser.id });

  if (!data) {
    return res.status(400).json({
      status: false,
      error: 'Tag doesn`t exist',
    });
  }

  return res.send({
    status: true,
    data,
  });
};

const create1 = async (req, res) => {
  const { currentUser } = req;
  const { tag, selection } = req.body;
  const reqIds = [];
  selection.forEach((id) => {
    reqIds.push(mongoose.Types.ObjectId(id));
  });
  await Contact.updateMany(
    {
      user: mongoose.Types.ObjectId(currentUser.id),
      _id: { $in: reqIds },
    },
    { $addToSet: { tags: tag } },
    {
      multi: true,
    }
  );
  return res.send({
    status: true,
    data: tag,
  });
};

const create = async (req, res) => {
  const { currentUser } = req;
  const { tag } = req.body;

  try {
    const data = await Contact.aggregate([
      {
        $match: { user: mongoose.Types.ObjectId(currentUser.id) },
      },
      {
        $unwind: {
          path: '$tags',
        },
      },
      {
        $group: {
          _id: '$tags',
          count: { $sum: 1 },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);
    if (data.length) {
      const index = data.findIndex((e) => e._id === tag);
      if (index !== -1) {
        return res.status(400).json({
          status: false,
          error: 'This tag already exist',
        });
      }
    }
    let tags = await Tag.findOne({
      user: currentUser.id,
    });

    if (!tags) {
      tags = new Tag({
        user: currentUser.id,
        tags: [],
      });
    } else {
      if (tags.tags.includes(tag)) {
        return res.status(400).json({
          status: false,
          error: 'This tag already exist',
        });
      }
    }
    tags.tags.push(tag);
    await tags.save();

    return res.send({
      status: true,
    });
  } catch (err) {
    return res.status(500).send({
      status: false,
      error: err.message || 'Tag creating failed.',
    });
  }
};

const search = async (req, res) => {
  const { currentUser } = req;
  const { search } = req.body;
  const limit = search ? 10 : 10000;
  // data = await Tag.find({content: {'$regex': search+'.*', '$options': 'i'}, user: currentUser.id}).sort({content: 1})
  const data = await Tag.aggregate([
    {
      $match: {
        content: { $regex: `${search}.*`, $options: 'i' },
        user: mongoose.Types.ObjectId(currentUser.id),
      },
    },
    { $group: { _id: '$content', id: { $first: '$_id' } } },
    { $sort: { _id: 1 } },
    { $project: { content: '$_id', _id: '$id' } },
    { $limit: limit },
  ]).catch((err) => {
    console.log('err', err);
  });

  return res.send({
    status: true,
    data,
  });
};

const getAll = async (req, res) => {
  const { currentUser } = req;
  const _tags = await Tag.findOne({
    user: currentUser.id,
  });
  const data = await Contact.aggregate([
    {
      $match: { user: mongoose.Types.ObjectId(currentUser.id) },
    },
    {
      $unwind: {
        path: '$tags',
      },
    },
    {
      $group: {
        _id: '$tags',
        name: { $addToSet: '$_id' },
      },
    },
    {
      $sort: { _id: 1 },
    },
  ]);
  data.forEach((e, index) => {
    data[index] = {
      ...data[index],
      count: e.name.length,
    };
    delete data[index].name;
  });
  if (_tags && _tags.tags.length) {
    _tags.tags.forEach((tag) => {
      const index = data.findIndex((e) => e._id === tag);
      if (index === -1) {
        const _tag = {
          _id: tag,
          count: 0,
        };
        data.push(_tag);
      }
    });
  }
  res.send({
    status: true,
    data,
  });
};

const getSharedAll = async (req, res) => {
  const _id = req.params.id;
  const _tags = await Tag.findOne({
    user: _id,
  });
  const data = await Contact.aggregate([
    {
      $match: { user: mongoose.Types.ObjectId(_id) },
    },
    {
      $unwind: {
        path: '$tags',
      },
    },
    {
      $group: {
        _id: '$tags',
        name: { $addToSet: '$_id' },
      },
    },
    {
      $sort: { _id: 1 },
    },
  ]);
  data.forEach((e, index) => {
    data[index] = {
      ...data[index],
      count: e.name.length,
    };
    delete data[index].name;
  });
  if (_tags && _tags.tags.length) {
    _tags.tags.forEach((tag) => {
      const index = data.findIndex((e) => e._id === tag);
      if (index === -1) {
        const _tag = {
          _id: tag,
          count: 0,
        };
        data.push(_tag);
      }
    });
  }
  res.send({
    status: true,
    data,
  });
};

const getAllForTeam = async (req, res) => {
  const { currentUser } = req;

  const internalTeam = await Team.findOne({
    $or: [
      {
        members: currentUser.id,
      },
      { owner: currentUser.id },
    ],
    is_internal: true,
  });

  let userIds;
  if (internalTeam) {
    userIds = internalTeam.members || [];
    userIds.push(internalTeam.owner);
  } else {
    userIds = [currentUser.id];
  }

  // Find all tags where the user is in the userIds array
  const _tags = await Tag.find({
    user: { $in: userIds },
  });

  const data = await Contact.aggregate([
    {
      $match: { user: { $in: userIds } },
    },
    {
      $unwind: {
        path: '$tags',
      },
    },
    {
      $group: {
        _id: '$tags',
        name: { $addToSet: '$_id' },
      },
    },
    {
      $sort: { _id: 1 },
    },
  ]);
  data.forEach((e, index) => {
    data[index] = {
      ...data[index],
      count: e.name.length,
    };
    delete data[index].name;
  });
  if (_tags && _tags.length) {
    const uniqueTags = [...new Set(_tags.flatMap((tagDoc) => tagDoc.tags))];
    uniqueTags.forEach((tag) => {
      const index = data.findIndex((e) => e._id === tag);
      if (index === -1) {
        const _tag = {
          _id: tag,
          count: 0,
        };
        data.push(_tag);
      }
    });
  }

  res.send({
    status: true,
    data,
  });
};

const getTagsDetail = async (req, res) => {
  const { currentUser } = req;
  const method = req.method.toUpperCase();
  let { tag, page, pageSize, searchStr, label, fields } =
    method === 'POST' ? req.body : req.query;

  searchStr = searchStr || '';
  page = parseInt(page || 0);
  pageSize = parseInt(pageSize || 0);
  tag = tag || '';
  fields = (fields || '').split(',').filter((e) => !!e);
  label = label || '';

  const search = searchStr.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&');
  const query = {};
  const project = {
    _id: 1,
    first_name: 1,
    last_name: 1,
    email: 1,
    phone: 1,
    state: 1,
    city: 1,
    zip: 1,
  };

  try {
    if (label) {
      query['label'] = mongoose.Types.ObjectId(label);
    } else if (tag) {
      query['tags'] = { $in: [tag] };
    }
  } catch (err) {
    return res.statu(400).send({
      status: false,
      error: 'Invalid Request:' + err.message,
    });
  }

  if (fields.length) {
    fields.forEach((field) => {
      project[field] = 1;
    });
  }

  const data = await Contact.aggregate([
    {
      $match: {
        ...query,
        $and: [
          { user: mongoose.Types.ObjectId(currentUser.id) },
          {
            $or: [
              {
                first_name: {
                  $regex: search,
                  $options: 'i',
                },
              },
              {
                last_name: {
                  $regex: search,
                  $options: 'i',
                },
              },
            ],
          },
        ],
      },
    },
    {
      $sort: { first_name: 1 },
    },
    {
      $skip: (page - 1) * pageSize,
    },
    {
      $limit: pageSize,
    },
    {
      $project: project,
    },
  ]);

  const total = await Contact.aggregate([
    {
      $match: {
        ...query,
        $and: [
          { user: mongoose.Types.ObjectId(currentUser.id) },
          {
            $or: [
              {
                first_name: {
                  $regex: search,
                  $options: 'i',
                },
              },
              {
                last_name: {
                  $regex: search,
                  $options: 'i',
                },
              },
            ],
          },
        ],
      },
    },
    {
      $count: 'count',
    },
  ]);

  res.send({
    status: true,
    data,
    total: total[0]?.count,
  });
};

const getTagsDetail1 = async (req, res) => {
  const { currentUser } = req;
  const contacts = await Contact.aggregate([
    {
      $match: {
        user: mongoose.Types.ObjectId(currentUser.id),
      },
    },
    {
      $sort: { first_name: 1 },
    },
    {
      $project: { first_name: 1, last_name: 1, _id: 1 },
    },
  ]);
  const total = await Contact.countDocuments({
    $or: [{ user: currentUser.id }],
  });

  res.send({
    status: true,
    data: {
      contacts,
      totalCount: total,
    },
  });
};

const updateTag = async (req, res) => {
  const { currentUser } = req;
  const { oldTag, newTag } = req.body;
  const normalizedNewTag = newTag.toLowerCase();

  try {
    const data = await Contact.aggregate([
      {
        $match: { user: mongoose.Types.ObjectId(currentUser.id) },
      },
      {
        $unwind: {
          path: '$tags',
        },
      },
      {
        $group: {
          _id: '$tags',
          count: { $sum: 1 },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);

    if (data.length) {
      const index = data.findIndex((e) => e._id === normalizedNewTag);
      if (index !== -1) {
        return res.status(400).json({
          status: false,
          error: 'This tag already exist',
        });
      }
    }

    await Contact.updateMany(
      {
        user: currentUser.id,
      },
      {
        $set: {
          'tags.$[element]': normalizedNewTag,
        },
      },
      {
        multi: true,
        arrayFilters: [{ element: { $regex: `^${oldTag}$`, $options: 'i' } }],
      }
    );

    await Tag.updateOne(
      {
        user: currentUser.id,
      },
      {
        $set: {
          'tags.$[element]': normalizedNewTag,
        },
      },
      {
        arrayFilters: [{ element: { $regex: `^${oldTag}$`, $options: 'i' } }],
      }
    );

    res.send({
      status: true,
    });
  } catch (e) {
    console.log('Error updating tag:', e);
    res.status(500).send({
      status: false,
      error: e.message || 'Tag update failed.',
    });
  }
};

const deleteTag = async (req, res) => {
  const { currentUser } = req;

  const { tag, contact } = req.body;
  const query = { user: mongoose.Types.ObjectId(currentUser.id) };
  if (contact) {
    query['_id'] = contact;
  }
  await Contact.updateMany(query, { $pull: { tags: tag } }, { multi: true });
  await Tag.updateOne(
    {
      user: currentUser.id,
    },
    { $pull: { tags: tag } }
  );
  res.send({
    status: true,
  });
};

const deleteTags = async (req, res) => {
  const { currentUser } = req;
  const { tags } = req.body;
  const query = { user: mongoose.Types.ObjectId(currentUser.id) };

  await Contact.updateMany(
    query,
    { $pull: { tags: { $in: tags } } },
    { multi: true }
  );
  await Tag.updateOne(
    { user: currentUser.id },
    { $pull: { tags: { $in: tags } } }
  );
  res.send({
    status: true,
  });
};

const mergeTag = async (req, res) => {
  const { currentUser } = req;
  const { mergeTags, mergeTo } = req.body;

  const query = {
    user: mongoose.Types.ObjectId(currentUser.id),
    tags: { $in: mergeTags, $nin: [mergeTo] },
  };
  await Contact.updateMany(
    query,
    { $push: { tags: mergeTo } },
    { multi: true }
  );
  await Contact.updateMany(
    { user: mongoose.Types.ObjectId(currentUser.id) },
    { $pull: { tags: { $in: mergeTags } } },
    { multi: true }
  );
  await Tag.updateOne(
    { user: currentUser.id },
    { $pull: { tags: { $in: mergeTags } } }
  );
  res.send({ status: true });
};

module.exports = {
  get,
  create,
  search,
  getAll,
  getSharedAll,
  getTagsDetail,
  getTagsDetail1,
  updateTag,
  deleteTag,
  deleteTags,
  mergeTag,
  getAllForTeam,
};
