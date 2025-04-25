const Activity = require('../models/activity');
const FormTracker = require('../models/form_tracker');
const LandingPage = require('../models/landing_page');
const VideoTracker = require('../models/video_tracker');
const PDFTracker = require('../models/pdf_tracker');
const ImageTracker = require('../models/image_tracker');

const create = async (req, res) => {
  const { currentUser } = req;
  const _form = new LandingPage({
    ...req.body,
    user: currentUser.id,
  });
  const form = await _form.save().catch((err) => {
    console.log('landing page create failed', err);
  });
  return res.send({
    status: true,
    data: form,
  });
};

const update = async (req, res) => {
  const { currentUser } = req;
  const { id } = req.params;
  const data = { ...req.body };
  delete data._id;
  LandingPage.deleteMany({
    original_id: id,
    is_draft: true,
  })
    .then()
    .catch((err) => {
      console.log('landing pages not deleted', err);
    });
  LandingPage.updateOne({ user: currentUser._id, _id: id }, { $set: data })
    .then(() => {
      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      return res.status(400).send({
        status: false,
        error: err.message,
      });
    });
};

const preview = async (req, res) => {
  const { currentUser } = req;
  const data = { ...req.body };
  const draftId = data.draft_id;
  delete data.draftId;
  if (draftId) {
    const form = await LandingPage.findOneAndUpdate(
      {
        _id: draftId,
        is_draft: true,
      },
      {
        ...data,
        user: currentUser.id,
      }
    );
    return res.send({
      status: true,
      data: form,
    });
  } else {
    const _form = new LandingPage({
      ...req.body,
      user: currentUser.id,
    });
    const form = await _form.save().catch((err) => {
      console.log('landing page create failed', err);
    });
    return res.send({
      status: true,
      data: form,
    });
  }
};

const remove = (req, res) => {
  const { currentUser } = req;
  const { id } = req.params;

  LandingPage.deleteOne({ user: currentUser._id, _id: id })
    .then(() => {
      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      return res.status(400).send({
        status: false,
        error: err.message,
      });
    });
};

const load = async (req, res) => {
  const { currentUser } = req;
  const { type } = req.query;
  const statusQuery = {};
  if (type === 'published') {
    statusQuery['is_published'] = true;
  } else if (type === 'unpublished') {
    statusQuery['is_published'] = false;
  }
  // Delete old draft landing pages
  LandingPage.deleteMany({
    is_draft: true,
    user: currentUser._id,
    updated_at: {
      $lt: new Date(new Date().getTime() - 1000 * 60 * 5),
    },
  })
    .then()
    .catch((err) => {
      console.log('landing pages not deleted', err);
    });

  const data = await LandingPage.find({
    user: currentUser.id,
    ...statusQuery,
    is_draft: { $ne: true },
  })
    .populate({
      path: 'material',
      select: '_id title site_image thumbnail preview',
    })
    .populate({
      path: 'forms',
      select: '_id name tags automation',
      populate: {
        path: 'automation',
        model: 'automation',
        select: '_id title',
      },
    })
    .catch((err) => {
      console.log('landing page list not found', err);
    });
  return res.send({
    status: true,
    data: data || [],
  });
};

const getById = async (req, res) => {
  const { currentUser } = req;
  const { id } = req.params;
  const data = await LandingPage.findOne({ user: currentUser._id, _id: id })
    .populate({
      path: 'material',
      select: '_id title site_image thumbnail preview',
    })
    .populate({
      path: 'highlightsV2.material', // Populate the `id` field in the highlightsV2 array
      select: '_id title site_image thumbnail preview',
    })
    .populate({
      path: 'forms',
      select: '_id name tags automation',
      populate: {
        path: 'automation',
        model: 'automation',
        select: '_id title',
      },
    })
    .catch((err) => {
      console.log('landing page detail load is failed', err);
    });

  return res.send({
    status: true,
    data,
  });
};

const getByMaterial = async (req, res) => {
  const { currentUser } = req;
  const { type, id } = req.body;
  const data = await LandingPage.find({
    user: currentUser.id,
    material_type: type,
    material: id,
    is_draft: { $ne: true },
  })
    .populate({
      path: 'forms',
      select: '_id name tags automation',
      populate: {
        path: 'automation',
        model: 'automation',
        select: '_id title',
      },
    })
    .populate({
      path: 'material',
      select: '_id title site_image thumbnail preview',
    })
    .catch((err) => {
      console.log('landing page detail load is failed', err);
    });

  return res.send({
    status: true,
    data: data || [],
  });
};

const getMaterialTrackingHistory = async (req, res) => {
  const { currentUser } = req;
  const { id } = req.params;
  const { count, skip } = req.body;

  let totalCount;
  if (skip === 0) {
    totalCount = await Activity.countDocuments({
      landing_pages: id,
      user: currentUser._id,
      type: { $in: ['video_trackers', 'pdf_trackers', 'image_trackers'] },
    }).catch((err) => {
      console.log('total view count calculation is failed.', err.message);
    });
  }

  Activity.find(
    {
      landing_pages: id,
      type: { $in: ['video_trackers', 'pdf_trackers', 'image_trackers'] },
    },
    {},
    { skip, limit: count, sort: { created_at: -1 } }
  )
    .populate({
      path: 'contacts',
      select: '_id first_name last_name email cell_phone label',
    })
    .populate({
      path: 'videos',
      select: '_id duration title',
    })
    .populate({
      path: 'images',
      select: '_id title',
    })
    .populate({
      path: 'pdfs',
      select: '_id title',
    })
    .populate({ path: 'video_trackers', model: VideoTracker })
    .populate({ path: 'pdf_trackers', model: PDFTracker })
    .populate({ path: 'image_trackers', model: ImageTracker })
    .then((data) => {
      return res.send({
        status: true,
        data,
        ...(totalCount !== undefined ? { count: totalCount } : {}),
      });
    })
    .catch((err) => {
      return res.status(400).send({
        status: false,
        error: err.message,
      });
    });
};

const getFormTrackingHistory = async (req, res) => {
  const { id } = req.params;
  const { count, skip } = req.body;
  let totalCount;
  if (skip === 0) {
    totalCount = await FormTracker.countDocuments({ landing_page: id }).catch(
      (err) => {
        console.log('total response count calculation is failed.', err.message);
      }
    );
  }

  FormTracker.find(
    { landing_page: id },
    {},
    { sort: { created_at: -1 }, skip, limit: count }
  )
    .populate({
      path: 'contact',
      select: '_id first_name last_name email phone',
    })
    .populate({
      path: 'lead_form',
      select: '_id name',
    })
    .then((data) => {
      return res.send({
        status: true,
        data,
        ...(totalCount !== undefined ? { count: totalCount } : {}),
      });
    })
    .catch((err) => {
      return res.status(400).send({
        status: false,
        error: err.message,
      });
    });
};

const getCountOfTracks = async (req, res) => {
  const { currentUser } = req;
  const { ids, materialType, materialId } = req.body;
  let landingPageFindQuery;
  let landingPageIds = ids || [];
  if (materialType && materialId) {
    landingPageFindQuery = {
      user: currentUser._id,
      material_type: materialType,
      material: materialId,
      is_draft: { $ne: true },
    };
  } else if (!ids?.length) {
    landingPageFindQuery = { user: currentUser._id, is_draft: { $ne: true } };
  }
  if (landingPageFindQuery) {
    const landingPages = await LandingPage.find(landingPageFindQuery)
      .select('_id')
      .catch((err) => {});
    landingPageIds = landingPages.map((e) => e._id);
  }
  // Find the track count
  const responseCountPromise = FormTracker.aggregate([
    {
      $match: { user: currentUser._id, landing_page: { $in: landingPageIds } },
    },
    { $group: { _id: '$landing_page', count: { $sum: 1 } } },
  ]);
  const viewCountPromise = Activity.aggregate([
    {
      $match: {
        user: currentUser._id,
        landing_pages: { $in: landingPageIds },
        type: { $in: ['video_trackers', 'pdf_trackers', 'image_trackers'] },
      },
    },
    { $group: { _id: '$landing_pages', count: { $sum: 1 } } },
  ]);
  const contactCountPromise = Activity.aggregate([
    {
      $match: {
        user: currentUser._id,
        contacts: { $exists: true },
        landing_pages: { $in: landingPageIds },
        type: { $in: ['video_trackers', 'pdf_trackers', 'image_trackers'] },
      },
    },
    {
      $group: {
        _id: { landing_pages: '$landing_pages', contact: '$contacts' },
      },
    },
    { $group: { _id: '$_id.landing_pages', count: { $sum: 1 } } },
  ]);

  Promise.all([
    viewCountPromise,
    contactCountPromise,
    responseCountPromise,
  ]).then(([viewCounts, contactCounts, responseCounts]) => {
    return res.send({
      status: true,
      data: {
        viewCounts,
        contactCounts,
        responseCounts,
      },
    });
  });
};

module.exports = {
  load,
  create,
  update,
  preview,
  remove,
  getById,
  getByMaterial,
  getMaterialTrackingHistory,
  getFormTrackingHistory,
  getCountOfTracks,
};
