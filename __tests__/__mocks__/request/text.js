const mongoose = require('mongoose');

const request_valid_text = {
  user: mongoose.Types.ObjectId('63b5a74ac7d160001c6d613b'),
  contacts: [mongoose.Types.ObjectId('64e5748e119cab43b5925873')],
  content:
    'Hi {contact_first_name}!!  I sent you an important video in your email that talks about brokerage fees and inclusions.  We really want you to understand how to figure this part out!!  Here’s the video if you’d like to watch it on your phone.  \nThanks!!\n{{video:63079b1886914e001598fdc8}}',
  type: 0,
  has_shared: true,
  shared_text: mongoose.Types.ObjectId('666773dca6f33e1c9fd51e0e'),
  assigned_contacts: [],
};

const request_invalid_text = {
  user: mongoose.Types.ObjectId('63034d945eeb6d00177f0fdf'),
  contacts: [mongoose.Types.ObjectId('64e5748e119cab43b592587b')],
  content:
    'Hi {contact_first_name}!!  I sent you an important video in your email that talks about brokerage fees and inclusions.  We really want you to understand how to figure this part out!!  Here’s the video if you’d like to watch it on your phone.  \nThanks!!\n{{video:63079b1886914e001598fdc8}}',
  type: 0,
  has_shared: true,
  shared_text: mongoose.Types.ObjectId('666773dca6f33e1c9fd51e0e'),
  assigned_contacts: [],
};

module.exports = { request_valid_text, request_invalid_text };
