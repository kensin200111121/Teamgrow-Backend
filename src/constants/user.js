const TEAM_DEFAULT_SETTINGS = [
  {
    id: 'admin',
    options: [
      { id: 'admin.login_enabled', value: false },
      { id: 'admin.master_enabled', value: false },
      {
        id: 'admin.billing_access_enabled',
        value: false,
        options: [{ id: 'admin.team_stay_enabled', value: true }],
      },
      { id: 'admin.assignee_info.is_editable', value: false },
    ],
  },
  {
    id: 'member',
    options: [
      { id: 'member.login_enabled', value: false },
      { id: 'member.master_enabled', value: false },
      {
        id: 'member.billing_access_enabled',
        value: false,
        options: [{ id: 'member.team_stay_enabled', value: true }],
      },
      { id: 'member.assignee_info.is_editable', value: false },
    ],
  },
];

module.exports.TEAM_DEFAULT_SETTINGS = TEAM_DEFAULT_SETTINGS;
