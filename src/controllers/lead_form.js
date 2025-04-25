const LeadForm = require('../models/lead_form');
const FormTracker = require('../models/form_tracker');
const { default: mongoose } = require('mongoose');

const get = async (req, res) => {
  const { currentUser } = req;
  const data = await LeadForm.find({
    $or: [{ isAdmin: true }, { user: currentUser.id }],
  })
    .populate({
      path: 'automation',
      select: '_id title',
    })
    .catch((err) => {
      console.log('lead form list not found', err);
    });
  return res.send({
    status: true,
    data,
  });
};

const getTrackingHistory = async (req, res) => {
  const { currentUser } = req;

  const _id = req.params.id;

  const { count, skip } = req.body;

  if (!_id || !mongoose.Types.ObjectId.isValid(_id)) {
    return res.status(500).json({
      status: false,
      error: 'Invalid Form Id',
    });
  }

  const form = await LeadForm.findOne({
    _id,
  })
    .populate({
      path: 'automation',
      select: 'title', // Specify the fields you want to populate
    })
    .catch((err) => {
      console.log('lead form list not found', err);
    });

  if (!form) {
    return res.status(500).json({
      status: false,
      error: 'No Form Exists',
    });
  }

  let totalCount;
  if (skip === 0) {
    totalCount = await FormTracker.countDocuments({
      user: currentUser.id,
      lead_form: req.params.id,
    }).catch((err) => {
      console.log('total response count calculation is failed.', err.message);
    });
  }

  console.log(totalCount, 'total Count');

  const data = await FormTracker.find(
    {
      user: currentUser.id,
      lead_form: req.params.id,
    },
    {},
    count ? { skip, limit: count, sort: { created_at: -1 } } : {}
  )
    .populate({
      path: 'contact',
      select: 'first_name last_name', // Specify the fields you want to populate
    })
    .catch((err) => {
      console.log('form tracking list not found', err);
    });

  return res.send({
    status: true,
    data: { form, tracks: data || [] },
    ...(totalCount !== undefined ? { count: totalCount } : {}),
  });
};

const getTrackingCount = async (req, res) => {
  const { currentUser } = req;

  const trackingCounts = await FormTracker.aggregate([
    { $match: { user: currentUser._id } },
    { $group: { _id: '$lead_form', trackingCount: { $sum: 1 } } },
  ]).catch((err) => {
    console.log('form tracking count not found', err);
  });

  return res.send({
    status: true,
    data: trackingCounts,
  });
};

const getById = async (req, res) => {
  const form = await LeadForm.findById(req.params.id)
    .populate('automation')
    .catch((err) => {
      console.log('lead form not found', err);
    });
  return res.send({
    status: true,
    form,
  });
};

const create = async (req, res) => {
  const { currentUser } = req;

  const _form = new LeadForm({
    ...req.body,
    user: currentUser.id,
  });
  const form = await _form.save().catch((err) => {
    console.log('lead form create failed', err);
  });
  return res.send({
    status: true,
    data: form,
  });
};

const update = async (req, res) => {
  const data = req.body;
  const { currentUser } = req;

  LeadForm.updateOne(
    {
      _id: req.params.id,
      user: currentUser.id,
    },
    { $set: data }
  )
    .then(() => {
      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      return res.status(500).json({
        status: false,
        error: err.message || 'Lead Form Update Error',
      });
    });
};

const remove = async (req, res) => {
  const { currentUser } = req;

  LeadForm.deleteOne({
    _id: req.params.id,
    user: currentUser.id,
  })
    .then(() => {
      return res.send({ status: true });
    })
    .catch((err) => {
      return res.status(500).json({
        status: false,
        error: err.message || 'Lead Form Delete Error',
      });
    });
};

const openForm = async (req, res) => {};

const submitForm = async (req, res) => {};

module.exports = {
  get,
  getById,
  create,
  update,
  remove,
  openForm,
  submitForm,
  getTrackingHistory,
  getTrackingCount,
};
