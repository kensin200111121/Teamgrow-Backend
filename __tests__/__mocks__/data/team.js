const mongoose = require('mongoose');

const team_data = [
  {
    id: 'team1',
    members: ['user456'],
    referrals: ['wutest@crmgrow.com', 'other@crmgrow.com'],
    owner: { id: 'owner1', name: 'Owner One' },
  },
  {
    id: 'team2',
    members: [],
    referrals: ['wutest@crmgrow.com'],
    owner: { id: 'owner2', name: 'Owner two' },
  },
];

const team = {
  _id: mongoose.Types.ObjectId('63eb34484dfa211fda7726e8'),
  owner: [mongoose.Types.ObjectId('62d6e9644304d536d9cf9826')],
  name: `rosmar's community dev`,
  description: '',
  email: '',
  cell_phone: '',
  picture:
    'https://teamgrow.s3.us-east-2.amazonaws.com/7dc42afa-a249-4fe4-a49e-fe33cd834b14.png',
  team_setting: {
    viewMembers: true,
    requestInvite: true,
    shareMaterial: true,
    downloadMaterial: true,
  },
  highlights: [],
  brands: [],
  members: [
    mongoose.Types.ObjectId('63b6f92600b511536c408e61'),
    mongoose.Types.ObjectId('610b88efefb6b21fa0a35b29'),
  ],
  invites: [],
  requests: [],
  join_link: 'fzewx3uLG8oWgiPEp1nbPz',
  referrals: [],
  editors: [mongoose.Types.ObjectId('610b88efefb6b21fa0a35b29')],
  videos: [],
  pdfs: [],
  images: [],
  folders: [],
  automations: [
    mongoose.Types.ObjectId('64182124d93ce44019a5193f'),
    mongoose.Types.ObjectId('62674c41520d194231eebce4'),
    mongoose.Types.ObjectId('643e6d5089057692212ab87c'),
    mongoose.Types.ObjectId('63a5252a00b511536c407aca'),
  ],
  email_templates: [],
  is_public: true,
  contacts: [],
  created_at: new Date('2023-02-20T15:00:14.227+0000'),
  updated_at: new Date('2024-02-13T07:00:00.428+0000'),
  pipelines: [
    mongoose.Types.ObjectId('61e982cfa160be2870db3446'),
    mongoose.Types.ObjectId('61f0ccedcb582a23d478d6ce'),
    mongoose.Types.ObjectId('61f1883978567704e86b8082'),
    mongoose.Types.ObjectId('6425985fdb1d6e4f1c0a0d8f'),
    mongoose.Types.ObjectId('63456b65ff499908a36d203c'),
    mongoose.Types.ObjectId('6440dc703cf32290776e3e4b'),
    mongoose.Types.ObjectId('62d6e99b4304d536d9cf9829'),
    mongoose.Types.ObjectId('63d92c28a810630c757ccd4d'),
  ],
  meta: {
    folders: {
      _events: {},
      _eventsCount: 0,
      _maxListeners: null,
    },
    videos: {
      _events: {},
      _eventsCount: 0,
      _maxListeners: null,
    },
    pdfs: {
      _events: {},
      _eventsCount: 0,
      _maxListeners: null,
    },
    images: {
      _events: {},
      _eventsCount: 0,
      _maxListeners: null,
    },
  },
  last_rounded_at: '2024-08-06T01:59:02.909Z',
};

const teams = [team];

const correct_team_id = '9034567890abcdef01234567';

const defaultTeam = {
  _id: mongoose.Types.ObjectId('63f38ad4c72e79b943f69040'),
  owner: [mongoose.Types.ObjectId('5fd97ad994cf273d68a016da')],
  name: 'test',
  description: '',
  email: '',
  cell_phone: '',
  picture: '',
  team_setting: {
    viewMembers: false,
    requestInvite: false,
    shareMaterial: false,
    downloadMaterial: false,
    canShareContact: false,
  },
  highlights: [],
  brands: [],
  members: [mongoose.Types.ObjectId('621d8d9695738309ed34e9c7')],
  invites: [],
  requests: [],
  join_link: 'b2qDsUjAidWuvnSWtppL1A',
  referrals: [],
  editors: [],
  videos: [mongoose.Types.ObjectId('62845cea73322a039913de66')],
  pdfs: [],
  images: [
    mongoose.Types.ObjectId('63ecad3c5bcc76edbe3da43b'),
    mongoose.Types.ObjectId('640ab33f18256b0e4be6d8e5'),
    mongoose.Types.ObjectId('640ab75f8f13134e6f078774'),
    mongoose.Types.ObjectId('640ab8ac7ee03b7fb51fe322'),
    mongoose.Types.ObjectId('66ff91127d0520fe34bbde2f'),
  ],
  folders: [
    mongoose.Types.ObjectId('65e6ec5b070b11757afb9933'),
    mongoose.Types.ObjectId('65e71e5826574e6d4544ddc0'),
    mongoose.Types.ObjectId('65e71f65f698b7a67aea06f5'),
    mongoose.Types.ObjectId('63d383afaeeb80f7d5b08494'),
  ],
  automations: [
    mongoose.Types.ObjectId('65ef15903c57fe4252dd881e'),
    mongoose.Types.ObjectId('662afcd9dc9270f4130426c7'),
    mongoose.Types.ObjectId('664586b189a20132cec707a5'),
    mongoose.Types.ObjectId('664f6c8693709ad6cf10c166'),
    mongoose.Types.ObjectId('664f6d4293709ad6cf10c200'),
    mongoose.Types.ObjectId('664f6df693709ad6cf10c23e'),
  ],
  email_templates: [],
  is_public: true,
  contacts: [],
  created_at: new Date('2023-02-20T14:59:32.614Z'),
  updated_at: new Date('2024-10-08T07:37:18.263Z'),
  __v: 4,
  pipelines: [
    mongoose.Types.ObjectId('62466d76592cd90acac70e41'),
    mongoose.Types.ObjectId('61e98120a160be2870db3269'),
  ],
  is_internal: false,
  meta: {
    folders: {
      _events: {},
      _eventsCount: 0,
      _maxListeners: null,
    },
    videos: {
      _events: {},
      _eventsCount: 0,
      _maxListeners: null,
    },
    pdfs: {
      _events: {},
      _eventsCount: 0,
      _maxListeners: null,
    },
    images: {
      _events: {},
      _eventsCount: 0,
      _maxListeners: null,
    },
  },
  cursor: [],
};

module.exports = { team_data, team, teams, correct_team_id, defaultTeam };
