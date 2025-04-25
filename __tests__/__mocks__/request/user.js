const login_req = {
  missed_email_req: {
    password: 'Password',
  },
  invalid_user_req: {
    user_name: 'invalid_user',
    email: 'invalid_user@crmgrow.com',
    password: 'password',
  },
  invalid_password_req: {
    user_name: 'rui',
    email: 'rui@crmgrow.com',
    password: 'password_incorrect',
  },
  social_login_req: {
    email: 'testuser@gmail.com',
    password: 'password',
  },
  correct_user_req: {
    user_name: 'rui',
    email: 'rui@crmgrow.com',
    password: 'password',
  },
};

const new_user_req = {
  user_name: 'rui',
  email: 'rui@crmgrwo.com',
  cell_phone: '201-555-2033',
  password: 'password',
};

const change_pwd_req = {
  code: '123456',
  password: 'password_new',
  email: 'rui@crmgrow.com',
};

const forgot_pwd_req = {
  email: 'rui@crmgrow.com',
};

const disable_user_req = {
  close_reason: 'too expensive',
  close_feedback: '3 marks',
};

const create_user_req = {
  user_name: 'wu user',
  email: 'wutest@crmgrow.com',
  cell_phone: '+12015550124',
  picture_profile: '',
  time_zone_info: 'Asia/Shanghai',
  level: 'LITE',
  user_password: '',
  password: 'MqOTgM60',
  is_free: true,
  package_level: 'LITE',
  welcome_email: true,
};

const social_req = {
  code: 'ya29.a0AXooCgt54ypGOlJ8j6Wh-D5x7CVfHCI9yPKn0OtzfaENtXa3vjmvapk3ncBDmWogWmyoD1aFbe8MQ1Jz-NIVD8TtsZfK9pX2yz577uUgfkQNMROuNnJptsNCEPVh8tJx6iWME_QyTMYdn5D67mA1iAeltttcgSRERvPIaCgYKAZASARESFQHGX2MiIGs-8yqQUH3FE3EqIWqquA0171',
};
module.exports = {
  login_req,
  new_user_req,
  change_pwd_req,
  forgot_pwd_req,
  disable_user_req,
  create_user_req,
  social_req,
};
